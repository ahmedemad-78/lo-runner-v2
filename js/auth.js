/* Session + auth helpers (access-code login) */
(function (global) {
  const SESSION_KEY = "lo_runner_session_v2";
  const RETURN_KEY = "lo_runner_return_v1";
  const LAST_PAGE_KEY = "lo_runner_last_page_v1";
  const NOTES_KEY = "lo_config_notes_v2";
  const SCENARIOS_KEY = "lo_scenarios_v1";
  const DEVICE_USER_KEY = "lo_device_user_v1";

  function appHref(hash) {
    const base = new URL("./app.html", window.location.href);
    if (hash) {
      const clean = String(hash).replace(/^#/, "");
      if (clean) base.hash = clean;
    }
    return base.href;
  }

  function loginHref() {
    return new URL("./index.html", window.location.href).href;
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

  /** Wipe local workspace so next login feels brand new. */
  function clearWorkspace() {
    try {
      localStorage.removeItem(LAST_PAGE_KEY);
      localStorage.removeItem(RETURN_KEY);
      localStorage.removeItem(NOTES_KEY);
      localStorage.removeItem(SCENARIOS_KEY);
      localStorage.removeItem(DEVICE_USER_KEY);
      sessionStorage.removeItem(RETURN_KEY);
    } catch { /* ignore */ }
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
      window.location.replace(redirectTo || loginHref());
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
    // New login = fresh workspace (notes/local scenarios/last tab).
    clearWorkspace();
    setSession(data);
    return data;
  }

  async function refreshSession() {
    const session = getSession();
    if (!session || !session.access_code) return null;
    try {
      const data = await global.LOSupabase.rpc("login", {
        p_access_code: String(session.access_code || "").trim().toLowerCase()
      });
      if (!data || !data.id) throw new Error("Login failed.");
      setSession(data);
      return data;
    } catch (err) {
      clearSession();
      clearWorkspace();
      throw err;
    }
  }

  function logout(redirectTo) {
    clearSession();
    clearWorkspace();
    window.location.replace(redirectTo || loginHref());
  }

  function accessCode() {
    return getSession()?.access_code || "";
  }

  /** After login always open Dashboard (fresh session). */
  function goToApp(hash) {
    const preferred = hash || "dashboard";
    window.location.replace(appHref(preferred));
  }

  global.LOAuth = {
    SESSION_KEY,
    RETURN_KEY,
    LAST_PAGE_KEY,
    getSession,
    setSession,
    clearSession,
    clearWorkspace,
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
    goToApp
  };
})(window);
