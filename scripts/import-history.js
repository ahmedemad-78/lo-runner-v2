/**
 * One-off importer for local CSV/JSON history into Supabase via create_task RPC.
 * Usage: node scripts/import-history.js "C:\path\to\test_history.csv"
 */
const fs = require("fs");
const path = require("path");

const SUPABASE_URL = "https://zauyadlforynrfmbstxd.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphdXlhZGxmb3J5bnJmbWJzdHhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0MjQwMzYsImV4cCI6MjEwMDAwMDAzNn0.3es2MbDXO_9Qh0iMQBFb5G5EEMyi19m10fqgvf14Lw4";
const ACCESS_CODE = process.env.LO_ACCESS_CODE || "k7m2xpq";

function parseCsvRecords(text) {
  const cleaned = String(text || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    const next = cleaned[i + 1];
    if (inQuotes) {
      if (ch === '"') {
        if (next === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(cur);
      cur = "";
    } else if (ch === "\n") {
      row.push(cur);
      cur = "";
      if (row.some((c) => String(c).trim() !== "")) rows.push(row);
      row = [];
    } else if (ch !== "\r") cur += ch;
  }
  row.push(cur);
  if (row.some((c) => String(c).trim() !== "")) rows.push(row);
  return rows;
}

function normalize(raw) {
  const statusRaw = String(raw.status || raw.Status || "Hold").trim() || "Hold";
  const status = ["Approve", "Hold", "Rollback"].includes(statusRaw) ? statusRaw : "Hold";
  const fullMessage =
    raw.fullMessage || raw.MessagePreview || raw.messagePreview || raw.Message || "{}";
  return {
    user: String(raw.user || raw.User || "").trim(),
    subject: String(raw.subject || raw.Subject || "").trim(),
    restOfLink: String(raw.restOfLink || raw.RestOfLink || "").trim(),
    fullUrl: String(raw.fullUrl || raw.FullUrl || "").trim(),
    fullMessage: typeof fullMessage === "string" ? fullMessage : JSON.stringify(fullMessage),
    note: String(raw.note || raw.Note || "").trim(),
    status,
    scenarioName: String(raw.scenarioName || raw.ScenarioName || "").trim()
  };
}

function parseFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".json")) {
    const parsed = JSON.parse(text);
    const arr = Array.isArray(parsed) ? parsed : [];
    return arr.map(normalize);
  }
  const table = parseCsvRecords(text);
  if (table.length < 2) return [];
  const headers = table[0].map((h) => String(h || "").trim());
  return table.slice(1).map((cols) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = cols[i] != null ? cols[i] : "";
    });
    return normalize(obj);
  });
}

async function createTask(row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_task`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      p_access_code: ACCESS_CODE,
      p_lo_url: row.fullUrl || null,
      p_subject: row.subject || null,
      p_path: row.restOfLink || null,
      p_result: row.status || "Hold",
      p_note: row.note || "",
      p_scenario_name: row.scenarioName || "",
      p_postmessage_payload: null,
      p_full_message: row.fullMessage || "",
      p_source_username: row.user || null
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || res.statusText);
  }
  return res.json();
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node scripts/import-history.js "C:\\path\\file.csv"');
    process.exit(1);
  }
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    console.error("File not found:", abs);
    process.exit(1);
  }
  const rows = parseFile(abs);
  console.log(`Parsed ${rows.length} rows from ${abs}`);
  let added = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i++) {
    try {
      await createTask(rows[i]);
      added++;
      if ((i + 1) % 25 === 0 || i === rows.length - 1) {
        console.log(`Progress ${i + 1}/${rows.length} (ok=${added}, fail=${failed})`);
      }
    } catch (err) {
      failed++;
      console.error(`Row ${i + 1} failed:`, err.message);
    }
  }
  console.log(`Done. imported=${added} failed=${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
