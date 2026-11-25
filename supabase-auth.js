(() => {
  // Cache authentication controls and account display elements.
  const authForm = document.querySelector("#auth-form");
  const authPanel = document.querySelector("#auth-panel");
  const workspace = document.querySelector("#workspace");
  const authMessage = document.querySelector("#auth-message");
  const authPassword = document.querySelector("#auth-password");
  const authSubmitButton = document.querySelector("#auth-submit-button");
  const authModeButton = document.querySelector("#auth-mode-button");
  const resetPasswordButton = document.querySelector("#reset-password-button");
  const supabaseModeButton = document.querySelector("#supabase-mode-button");
  const supabaseModeStatus = document.querySelector("#supabase-mode-status");
  const accountActions = document.querySelector("#account-actions");
  const accountEmail = document.querySelector("#account-email");
  const signOutButton = document.querySelector("#sign-out-button");
  const supabaseModeStorageKey = "volunteer-hours-supabase-mode";

  // Track authentication mode and password recovery state.
  let authMode = "sign-in";
  let recoveryMode = window.location.hash.includes("type=recovery");
  let supabaseClient;
  let testMode = false;
  let supabaseModeReadError;

  try {
    testMode = window.localStorage.getItem(supabaseModeStorageKey) === "test";
  } catch (error) {
    supabaseModeReadError = error;
  }

  // Update the accessible status message shown to the user.
  function setAuthMessage(message, isError = false) {
    authMessage.textContent = message;
    authMessage.dataset.error = isError ? "true" : "false";
  }

  // Configure the authentication view for sign-in, sign-up, or password recovery.
  function updateAuthForm() {
    const title = document.querySelector("#auth-title");
    const description = document.querySelector("#auth-description");
    const passwordField = document.querySelector("#password-field");
    if (recoveryMode) {
      title.textContent = "Choose a new password";
      description.textContent = "Enter a new password for your account.";
      passwordField.hidden = false;
      authPassword.required = true;
      authPassword.autocomplete = "new-password";
      authSubmitButton.textContent = "Update password";
      authModeButton.hidden = true;
      resetPasswordButton.hidden = true;
    } else {
      const signingUp = authMode === "sign-up";
      title.textContent = signingUp ? "Create an account" : "Sign in";
      description.textContent = signingUp
        ? "Create a representative account to access service records."
        : "Sign in to create and manage volunteer service records.";
      passwordField.hidden = false;
      authPassword.required = true;
      authPassword.autocomplete = signingUp ? "new-password" : "current-password";
      authSubmitButton.textContent = signingUp ? "Create account" : "Sign in";
      authModeButton.textContent = signingUp ? "Already have an account? Sign in" : "Create an account";
      authModeButton.hidden = false;
      resetPasswordButton.hidden = signingUp;
    }
  }

  function showWorkspace(user) {
    const signedIn = Boolean(user) || testMode;
    authPanel.hidden = signedIn;
    workspace.hidden = !signedIn;
    accountActions.hidden = !signedIn;
    accountEmail.textContent = (testMode ? "Test mode (login skipped)" : signedIn) ? user.email || "Signed in" : "";
    signOutButton.hidden = testMode;
    if (signedIn) {
      requestAnimationFrame(() => window.CheerSignature?.resize());
    } else {
      authPassword.value = "";
    }
  }

  updateAuthForm();
  supabaseModeStatus.textContent = testMode ? "TEST MODE — login skipped" : "";
  supabaseModeStatus.hidden = !testMode;
  if (supabaseModeReadError) {
    supabaseModeStatus.textContent = `Could not read Supabase mode: ${supabaseModeReadError.message}`;
    supabaseModeStatus.hidden = false;
  }
  supabaseModeButton.textContent = testMode ? "Exit test mode" : "Test mode (skip login)";
  const supabaseConfig = window.SUPABASE_CONFIG;
  if (testMode) {
    showWorkspace(null);
  } else if (!window.supabase) {
    authSubmitButton.disabled = true;
    authModeButton.disabled = true;
    resetPasswordButton.disabled = true;
    setAuthMessage("The Supabase client could not be loaded. Check your internet connection and reload.", true);
  } else if (!supabaseConfig ||
      typeof supabaseConfig.url !== "string" ||
      !/^https:\/\/[^/]+\/?$/.test(supabaseConfig.url) ||
      supabaseConfig.url.includes("YOUR_") ||
      typeof supabaseConfig.anonKey !== "string" ||
      !supabaseConfig.anonKey ||
      supabaseConfig.anonKey.startsWith("YOUR_")) {
    authSubmitButton.disabled = true;
    authModeButton.disabled = true;
    resetPasswordButton.disabled = true;
    setAuthMessage(`Authentication is not configured for ${testMode ? "test" : "live"} mode. Set its Supabase project URL and anon key in supabase-config.js.`, true);
  } else {
    const supabaseUrl = supabaseConfig.url.replace(/\/$/, "");
    supabaseClient = window.supabase.createClient(supabaseUrl, supabaseConfig.anonKey);
    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || recoveryMode) {
        recoveryMode = true;
        updateAuthForm();
        showWorkspace(null);
        setAuthMessage("Choose a new password to finish resetting your account.");
        return;
      }
      showWorkspace(session && session.user);
    });
    supabaseClient.auth.getSession().then(({ data, error }) => {
      if (error) {
        setAuthMessage(`Could not restore your sign-in: ${error.message}`, true);
        return;
      }
      if (recoveryMode) {
        updateAuthForm();
        setAuthMessage("Choose a new password to finish resetting your account.");
        return;
      }
      showWorkspace(data.session && data.session.user);
    }).catch((error) => {
      setAuthMessage(`Could not restore your sign-in: ${error.message}`, true);
    });
  }

  authModeButton.addEventListener("click", () => {
    authMode = authMode === "sign-in" ? "sign-up" : "sign-in";
    setAuthMessage("");
    updateAuthForm();
  });

  supabaseModeButton.addEventListener("click", () => {
    try {
      window.localStorage.setItem(supabaseModeStorageKey, testMode ? "live" : "test");
      window.location.reload();
    } catch (error) {
      supabaseModeStatus.textContent = `Could not switch modes: ${error.message}`;
      supabaseModeStatus.hidden = false;
    }
  });

  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!supabaseClient || !authForm.reportValidity()) return;
    const email = document.querySelector("#auth-email").value.trim();
    const password = authPassword.value;
    authSubmitButton.disabled = true;
    setAuthMessage("");
    try {
      if (recoveryMode) {
        const { error } = await supabaseClient.auth.updateUser({ password });
        if (error) throw error;
        recoveryMode = false;
        authMode = "sign-in";
        updateAuthForm();
        setAuthMessage("Password updated. You can now sign in with your new password.");
        await supabaseClient.auth.signOut();
      } else if (authMode === "sign-up") {
        const { data, error } = await supabaseClient.auth.signUp({ email, password });
        if (error) throw error;
        if (data.session) {
          setAuthMessage("Account created and signed in.");
        } else {
          setAuthMessage("Account created. Check your email to confirm your address before signing in.");
        }
      } else {
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setAuthMessage("Signed in successfully.");
      }
    } catch (error) {
      setAuthMessage(error.message || "Authentication failed. Please try again.", true);
    } finally {
      authSubmitButton.disabled = false;
    }
  });

  resetPasswordButton.addEventListener("click", async () => {
    if (!supabaseClient) return;
    const email = document.querySelector("#auth-email").value.trim();
    if (!email) {
      setAuthMessage("Enter your email address first, then choose Forgot password.", true);
      document.querySelector("#auth-email").focus();
      return;
    }
    resetPasswordButton.disabled = true;
    try {
      const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.href.split("#")[0]
      });
      if (error) throw error;
      setAuthMessage("If an account exists for that email, a password reset link has been sent.");
    } catch (error) {
      setAuthMessage(error.message || "Could not request a password reset.", true);
    } finally {
      resetPasswordButton.disabled = false;
    }
  });

  document.querySelector("#sign-out-button").addEventListener("click", async () => {
    if (!supabaseClient) return;
    const button = document.querySelector("#sign-out-button");
    const formStatus = document.querySelector("#form-status");
    button.disabled = true;
    try {
      const { error } = await supabaseClient.auth.signOut();
      if (error) throw error;
      showWorkspace(null);
    } catch (error) {
      formStatus.textContent = `Could not sign out: ${error.message}`;
    } finally {
      button.disabled = false;
    }
  });
})();
