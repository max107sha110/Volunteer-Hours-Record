(() => {
  // Cache signature canvas elements and drawing context.
  const canvas = document.querySelector("#signature-canvas");
  const pad = document.querySelector("#signature-pad");
  const context = canvas.getContext("2d");
  let hasSignature = false;
  let isDrawing = false;
  let strokes = [];
  let currentStroke;

  // adapts signature color based on theme
  function getStrokeColor() {
    return getComputedStyle(document.documentElement).getPropertyValue("--text").trim();
  }

  function drawStrokes(targetContext, color) {
    for (const stroke of strokes) {
      if (!stroke.points.length) continue;
      targetContext.strokeStyle = color || stroke.color;
      targetContext.beginPath();
      targetContext.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (const point of stroke.points.slice(1)) {
        targetContext.lineTo(point.x, point.y);
      }
      targetContext.stroke();
    }
  }

  function redraw() {
    context.clearRect(0, 0, canvas.width, canvas.height);
    drawStrokes(context);
  }

  // Resize the canvas for high-DPI screens while preserving its drawing style.
  function resize() {
    const pixelRatio = window.devicePixelRatio || 1;
    const bounds = canvas.getBoundingClientRect();
    canvas.width = Math.round(bounds.width * pixelRatio);
    canvas.height = Math.round(bounds.height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.lineWidth = 2.4;
    context.lineCap = "round";
    context.lineJoin = "round";
    redraw();
  }

  // Convert pointer coordinates from the viewport to canvas space.
  function signaturePoint(event) {
    const bounds = canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  canvas.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    const point = signaturePoint(event);
    isDrawing = true;
    currentStroke = {
      color: getStrokeColor(),
      points: [point, { x: point.x + 0.1, y: point.y + 0.1 }]
    };
    strokes.push(currentStroke);
    context.strokeStyle = currentStroke.color;
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineTo(point.x + 0.1, point.y + 0.1);
    context.stroke();
    hasSignature = true;
    pad.setAttribute("aria-invalid", "false");
    canvas.setAttribute("aria-invalid", "false");
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!isDrawing) return;
    const point = signaturePoint(event);
    currentStroke.points.push(point);
    context.lineTo(point.x, point.y);
    context.stroke();
  });

  function endSignature() {
    isDrawing = false;
    currentStroke = undefined;
  }

  canvas.addEventListener("pointerup", endSignature);
  canvas.addEventListener("pointercancel", endSignature);
  canvas.addEventListener("lostpointercapture", endSignature);

  document.querySelector("#clear-signature").addEventListener("click", () => {
    strokes = [];
    redraw();
    hasSignature = false;
    pad.setAttribute("aria-invalid", "false");
    canvas.setAttribute("aria-invalid", "false");
    document.querySelector("#form-status").textContent = "Signature cleared.";
  });

  // changes signature image to a url
  function toBlackDataURL() {
    const bounds = canvas.getBoundingClientRect();
    const pixelRatio = canvas.width / Math.max(bounds.width, 1);
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const exportContext = exportCanvas.getContext("2d");
    exportContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    exportContext.lineWidth = 2.4;
    exportContext.lineCap = "round";
    exportContext.lineJoin = "round";
    drawStrokes(exportContext, "#000000");
    return exportCanvas.toDataURL("image/png");
  }

  // Build and download an XLSX package containing history rows and signature images.
  function downloadHistory(records, volunteerName, displayDate, formStatus) {
    if (!records.length) return false;

    const escapeXml = (value) => value.toString().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
    const xmlText = (value) => `<t xml:space="preserve">${escapeXml(value)}</t>`;
    const textCell = (column, row, value) =>
      `<c r="${column}${row}" t="inlineStr"><is>${xmlText(value)}</is></c>`;
    const headers = ["Service date", "Organization", "Program / activity", "Hours", "Location", "Impact notes", "Verified by", "Signature"];
    const columns = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const metadataRows = [
      `<row r="1">${textCell("A", 1, "Volunteer")}${textCell("B", 1, volunteerName)}</row>`,
      `<row r="2">${textCell("A", 2, "Events on file")}${textCell("B", 2, records.length.toString())}</row>`,
      `<row r="4">${headers.map((header, index) => textCell(columns[index], 4, header)).join("")}</row>`
    ];
    const eventRows = records.map((record, index) => {
      const row = index + 5;
      const values = [
        displayDate(record.eventDate),
        record.organizationName,
        record.eventName,
        Number(record.hours),
        record.serviceLocation,
        record.serviceNotes,
        record.representativeName
      ];
      const cells = values.map((value, cellIndex) => cellIndex === 3
        ? `<c r="D${row}"><v>${value}</v></c>`
        : textCell(columns[cellIndex], row, value));
      return `<row r="${row}" ht="52" customHeight="1">${cells.join("")}</row>`;
    });
    const lastRow = records.length + 4;
    const signatureImages = records.map((record, index) => ({
      name: `xl/media/signature-${index + 1}.png`,
      bytes: Uint8Array.from(atob(record.signature.split(",")[1]), (character) => character.charCodeAt(0))
    }));
    const drawingEntries = records.map((record, index) => {
      const row = index + 4;
      const imageNumber = index + 1;
      return `<xdr:oneCellAnchor><xdr:from><xdr:col>7</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="1905000" cy="485775"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${imageNumber}" name="Signature ${imageNumber}"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${imageNumber}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`;
    }).join("");
    const drawingRelationships = records.map((record, index) =>
      `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/signature-${index + 1}.png"/>`
    ).join("");
    const files = [
      { name: "[Content_Types].xml", text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>' },
      { name: "_rels/.rels", text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: "xl/workbook.xml", text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Volunteer History" sheetId="1" r:id="rId1"/></sheets></workbook>' },
      { name: "xl/_rels/workbook.xml.rels", text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
      { name: "xl/worksheets/sheet1.xml", text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0"/></sheetViews><cols><col min="1" max="1" width="16" customWidth="1"/><col min="2" max="2" width="28" customWidth="1"/><col min="3" max="3" width="32" customWidth="1"/><col min="4" max="4" width="12" customWidth="1"/><col min="5" max="5" width="27" customWidth="1"/><col min="6" max="6" width="50" customWidth="1"/><col min="7" max="7" width="25" customWidth="1"/><col min="8" max="8" width="28" customWidth="1"/></cols><sheetData>${metadataRows.join("")}${eventRows.join("")}</sheetData><autoFilter ref="A4:H${lastRow}"/><drawing r:id="rId1"/></worksheet>` },
      { name: "xl/worksheets/_rels/sheet1.xml.rels", text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>' },
      { name: "xl/drawings/drawing1.xml", text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${drawingEntries}</xdr:wsDr>` },
      { name: "xl/drawings/_rels/drawing1.xml.rels", text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${drawingRelationships}</Relationships>` },
      ...signatureImages
    ];

    const encoder = new TextEncoder();
    const crcTable = Array.from({ length: 256 }, (_, value) => {
      let crc = value;
      for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
      return crc >>> 0;
    });
    const crc32 = (bytes) => {
      let crc = 0xffffffff;
      for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
      return (crc ^ 0xffffffff) >>> 0;
    };
    const localParts = [];
    const centralParts = [];
    let localOffset = 0;

    for (const file of files) {
      const name = encoder.encode(file.name);
      const data = file.bytes || encoder.encode(file.text);
      const checksum = crc32(data);
      const localHeader = new Uint8Array(30 + name.length);
      const localView = new DataView(localHeader.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, 0x0800, true);
      localView.setUint16(8, 0, true);
      localView.setUint16(12, 33, true);
      localView.setUint32(14, checksum, true);
      localView.setUint32(18, data.length, true);
      localView.setUint32(22, data.length, true);
      localView.setUint16(26, name.length, true);
      localHeader.set(name, 30);
      localParts.push(localHeader, data);

      const centralHeader = new Uint8Array(46 + name.length);
      const centralView = new DataView(centralHeader.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(8, 0x0800, true);
      centralView.setUint16(10, 0, true);
      centralView.setUint16(14, 33, true);
      centralView.setUint32(16, checksum, true);
      centralView.setUint32(20, data.length, true);
      centralView.setUint32(24, data.length, true);
      centralView.setUint16(28, name.length, true);
      centralView.setUint32(42, localOffset, true);
      centralHeader.set(name, 46);
      centralParts.push(centralHeader);
      localOffset += localHeader.length + data.length;
    }

    const centralSize = centralParts.reduce((size, part) => size + part.length, 0);
    const endRecord = new Uint8Array(22);
    const endView = new DataView(endRecord.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(8, files.length, true);
    endView.setUint16(10, files.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, localOffset, true);
    const workbook = new Blob([...localParts, ...centralParts, endRecord], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const link = document.createElement("a");
    const safeName = volunteerName.replace(/[\\/:*?"<>|]/g, "-") || "Volunteer";
    link.href = URL.createObjectURL(workbook);
    link.download = `${safeName} - volunteer history.xlsx`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    formStatus.textContent = `Excel history downloaded for ${volunteerName} (${records.length} events).`;
    return true;
  }

  window.CheerSignature = {
    canvas,
    pad,
    context,
    resize,
    toBlackDataURL,
    hasSignature: () => hasSignature,
    downloadHistory
  };
})();
