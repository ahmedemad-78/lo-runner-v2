/* Supabase RPC wrappers for tasks + team */
(function (global) {
  function code() {
    return global.LOAuth.accessCode();
  }

  function mapTask(row) {
    if (!row) return null;
    return {
      id: row.id,
      user_id: row.user_id,
      user: row.username || "",
      subject: row.subject || "",
      restOfLink: row.path || "",
      fullUrl: row.lo_url || "",
      fullMessage: row.full_message || "",
      messagePreview: (row.full_message || "").substring(0, 80),
      note: row.note || "",
      status: row.result || "Hold",
      scenarioName: row.scenario_name || "",
      timestamp: row.created_at || new Date().toISOString(),
      postmessage_payload: row.postmessage_payload || null
    };
  }

  async function listTasks() {
    const rows = await global.LOSupabase.rpc("list_tasks", { p_access_code: code() });
    return (rows || []).map(mapTask);
  }

  async function createTask(payload) {
    const row = await global.LOSupabase.rpc("create_task", {
      p_access_code: code(),
      p_lo_url: payload.fullUrl || payload.lo_url || null,
      p_subject: payload.subject || null,
      p_path: payload.restOfLink || payload.path || null,
      p_result: payload.status || payload.result || "Hold",
      p_note: payload.note || "",
      p_scenario_name: payload.scenarioName || payload.scenario_name || "",
      p_postmessage_payload: payload.postmessage_payload || null,
      p_full_message: payload.fullMessage || payload.full_message || "",
      p_source_username: payload.user || payload.source_username || payload.username || null
    });
    return mapTask(row);
  }

  async function updateTask(taskId, patch) {
    const row = await global.LOSupabase.rpc("update_task", {
      p_access_code: code(),
      p_task_id: taskId,
      p_result: patch.status ?? patch.result ?? null,
      p_note: patch.note ?? null,
      p_scenario_name: patch.scenarioName ?? patch.scenario_name ?? null
    });
    return mapTask(row);
  }

  async function deleteTask(taskId) {
    return global.LOSupabase.rpc("delete_task", {
      p_access_code: code(),
      p_task_id: taskId
    });
  }

  async function clearTasks() {
    return global.LOSupabase.rpc("clear_tasks", { p_access_code: code() });
  }

  async function listTeam() {
    return global.LOSupabase.rpc("list_team", { p_access_code: code() });
  }

  async function createTeamMember({ username, role, accessCode }) {
    return global.LOSupabase.rpc("create_team_member", {
      p_access_code: code(),
      p_username: username,
      p_role: role || "tester",
      p_member_access_code: accessCode || null
    });
  }

  async function updateTeamMember(userId, { username, role, accessCode }) {
    return global.LOSupabase.rpc("update_team_member", {
      p_access_code: code(),
      p_user_id: userId,
      p_username: username ?? null,
      p_role: role ?? null,
      p_member_access_code: accessCode ?? null
    });
  }

  async function deleteTeamMember(userId) {
    return global.LOSupabase.rpc("delete_team_member", {
      p_access_code: code(),
      p_user_id: userId
    });
  }

  function mapScenario(row) {
    if (!row) return null;
    return {
      id: row.id,
      user_id: row.user_id,
      user: row.username || "",
      name: row.name || "",
      subject: row.subject || "",
      restOfLink: row.path || "",
      steps: Array.isArray(row.steps) ? row.steps : [],
      createdAt: row.created_at || new Date().toISOString()
    };
  }

  async function listScenarios() {
    const rows = await global.LOSupabase.rpc("list_scenarios", { p_access_code: code() });
    return (rows || []).map(mapScenario);
  }

  async function createScenario(payload) {
    const row = await global.LOSupabase.rpc("create_scenario", {
      p_access_code: code(),
      p_name: payload.name || "",
      p_subject: payload.subject || "",
      p_path: payload.restOfLink || payload.path || "",
      p_steps: payload.steps || []
    });
    return mapScenario(row);
  }

  async function deleteScenario(scenarioId) {
    return global.LOSupabase.rpc("delete_scenario", {
      p_access_code: code(),
      p_scenario_id: scenarioId
    });
  }

  async function clearScenarios() {
    return global.LOSupabase.rpc("clear_scenarios", { p_access_code: code() });
  }

  async function teamAnalytics({ from, to, subject } = {}) {
    return global.LOSupabase.rpc("team_analytics", {
      p_access_code: code(),
      p_from: from || null,
      p_to: to || null,
      p_subject: subject || null
    });
  }

  function generateAccessCode(length) {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    const len = length || 7;
    let out = "";
    const bytes = new Uint8Array(len);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
    return out;
  }

  global.LOApi = {
    mapTask,
    listTasks,
    createTask,
    updateTask,
    deleteTask,
    clearTasks,
    mapScenario,
    listScenarios,
    createScenario,
    deleteScenario,
    clearScenarios,
    teamAnalytics,
    listTeam,
    createTeamMember,
    updateTeamMember,
    deleteTeamMember,
    generateAccessCode
  };
})(window);
