/* Session + auth helpers (access-code login) */
(function (global) {
  const SESSION_KEY = "lo_runner_session_v2";

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
      const target = redirectTo || "../html/login.html";
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

  function logout(redirectTo) {
    clearSession();
    window.location.replace(redirectTo || "../html/login.html");
  }

  function accessCode() {
    return getSession()?.access_code || "";
  }

  global.LOAuth = {
    SESSION_KEY,
    getSession,
    setSession,
    clearSession,
    requireSession,
    isTeamLeader,
    loginWithAccessCode,
    logout,
    accessCode
  };
})(window);
