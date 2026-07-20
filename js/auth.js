/* Session + auth helpers (access-code login) */
(function (global) {
  const SESSION_KEY = "lo_runner_session_v2";
  const RETURN_KEY = "lo_runner_return_v1";
  const LAST_PAGE_KEY = "lo_runner_last_page_v1";

  function appHref(hash) {
    const base = new URL("./app.html", window.location.href);
    if (hash) {
      const clean = String(hash).replace(/^#/, "");
      if (clean) base.hash = clean;
    }
    return base.href;
  }

  function loginHref(returnHash) {
    const base = new URL("./index.html", window.location.href);
    if (returnHash) {
      try {
        sessionStorage.setItem(RETURN_KEY, String(returnHash).replace(/^#/, ""));
      } catch { /* ignore */ }
    }
    return base.href;
  }

  function rememberPage(page) {
    try {
      if (page && /^(dashboard|test|scenarios)$/.test(page)) {
        localStorage.setItem(LAST_PAGE_KEY, page);
      }
    } catch { /* ignore */ }
  }

  function lastPage() {
    try {
      const saved = localStorage.getItem(LAST_PAGE_KEY);
      if (saved && /^(dashboard|test|scenarios)$/.test(saved)) return saved;
    } catch { /* ignore */ }
    return null;
  }

  function consumeReturnHash() {
    try {
      const saved = sessionStorage.getItem(RETURN_KEY);
      sessionStorage.removeItem(RETURN_KEY);
      if (saved && /^(dashboard|test|scenarios)$/.test(saved)) return saved;
    } catch { /* ignore */ }
    return null;
  }

  function getSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (!session || !session.id || !session.access_code || !session.username) return null;
      return session;
    } catch {
      return null;
    }
  }

  function setSession(session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  function requireSession(redirectTo) {
    const session = getSession();
    if (!session) {
      const hash = (window.location.hash || "").replace(/^#/, "");
      const target = redirectTo || loginHref(hash || lastPage());
      window.location.replace(target);
      return null;
    }
    return session;
  }

  function isTeamLeader(session) {
    return (session || getSession())?.role === "team_leader";
  }

  async function loginWithAccessCode(accessCode) {
    const data = await global.LOSupabase.rpc("login", {
      p_access_code: String(accessCode || "").trim().toLowerCase()
    });
    if (!data || !data.id) throw new Error("Login failed.");
    setSession(data);
    return data;
  }

  /** Re-validate access code still works after refresh. */
  async function refreshSession() {
    const session = getSession();
    if (!session || !session.access_code) return null;
    try {
      return await loginWithAccessCode(session.access_code);
    } catch (err) {
      clearSession();
      throw err;
    }
  }

  function logout(redirectTo) {
    clearSession();
    window.location.replace(redirectTo || loginHref());
  }

  function accessCode() {
    return getSession()?.access_code || "";
  }

  function goToApp(hash) {
    const preferred = hash || consumeReturnHash() || lastPage() || "dashboard";
    window.location.replace(appHref(preferred));
  }

  global.LOAuth = {
    SESSION_KEY,
    RETURN_KEY,
    LAST_PAGE_KEY,
    getSession,
    setSession,
    clearSession,
    requireSession,
    isTeamLeader,
    loginWithAccessCode,
    refreshSession,
    logout,
    accessCode,
    appHref,
    loginHref,
    rememberPage,
    lastPage,
    consumeReturnHash,
    goToApp
  };
})(window);
