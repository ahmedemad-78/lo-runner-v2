/* Supabase client bootstrap for LO Runner v2 */
(function (global) {
  const SUPABASE_URL = "https://zauyadlforynrfmbstxd.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphdXlhZGxmb3J5bnJmbWJzdHhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0MjQwMzYsImV4cCI6MjEwMDAwMDAzNn0.3es2MbDXO_9Qh0iMQBFb5G5EEMyi19m10fqgvf14Lw4";

  let client = null;

  function getClient() {
    if (client) return client;
    if (!global.supabase || typeof global.supabase.createClient !== "function") {
      throw new Error("Supabase SDK failed to load.");
    }
    client = global.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });
    return client;
  }

  async function rpc(fnName, args) {
    const { data, error } = await getClient().rpc(fnName, args);
    if (error) {
      const err = new Error(error.message || "Request failed");
      err.code = error.code;
      err.details = error.details;
      throw err;
    }
    return data;
  }

  global.LOSupabase = {
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
    getClient,
    rpc
  };
})(window);
