// ═══════════════════════════════════════════
// State
// ═══════════════════════════════════════════
const HIST_KEY = "lo_full_history_v14";
const NOTES_KEY = "lo_config_notes_v2";
const SCENARIOS_KEY = "lo_scenarios_v1";
const DEVICE_USER_KEY = "lo_device_user_v1";

let testHistory = [];
let configNotes = {};
let scenarios = [];
let lastTestId = null;
let currentEditingId = null;
let currentFilterUser = "ALL";
let currentFilterSubject = "ALL";
let currentFilterStatus = "ALL";
let currentSearchText = "";

let isRecording = false;
let recordingSteps = [];
let recordedTestIds = [];

let lastQuickStatus = "Hold";
let currentPage = "dashboard";
let cachedDeviceUser = null;

function scenarioNameInputEl() {
    return document.getElementById("scenarioNameInput");
}

// ═══════════════════════════════════════════
// Persistence
// ═══════════════════════════════════════════
function loadLocalPrefs() {
    try { configNotes = JSON.parse(localStorage.getItem(NOTES_KEY)) || {}; } catch { configNotes = {}; }
    try { scenarios = JSON.parse(localStorage.getItem(SCENARIOS_KEY)) || []; } catch { scenarios = []; }
}

async function loadTasksFromServer() {
    try {
        testHistory = await LOApi.listTasks();
    } catch (err) {
        console.error(err);
        testHistory = [];
        toast(err.message || "Could not load tasks from server.");
    }
}

function load() {
    loadLocalPrefs();
}

// ═══════════════════════════════════════════
// Navigation
// ═══════════════════════════════════════════
function switchPage(id) {
    const page = document.getElementById("page-" + id);
    if (!page) return;
    currentPage = id;
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.querySelectorAll(".nav-btn[data-page]").forEach(b => b.classList.remove("active"));
    page.classList.add("active");
    const navBtn = document.querySelector(`.nav-btn[data-page="${id}"]`);
    if (navBtn) navBtn.classList.add("active");
    const nextHash = "#" + id;
    if (location.hash !== nextHash) {
        history.replaceState(null, "", nextHash);
    }
    if (id === "dashboard" && typeof renderDashboard === "function") renderDashboard();
    if (id === "test") {
        updateUrl();
        loadNoteForConfig();
    }
    if (id === "scenarios") renderScenarios();
}

function saveHistory() {
    // Server is source of truth; keep local list in sync for UI only.
    updateFilterOptions();
    if (document.getElementById("historyTbody")) renderDashboard();
}

async function persistTaskPatch(entry, patch) {
    if (!entry || !entry.id) return;
    try {
        const updated = await LOApi.updateTask(entry.id, patch);
        Object.assign(entry, updated);
        saveHistory();
    } catch (err) {
        console.error(err);
        toast(err.message || "Could not save task.");
    }
}

function detectDeviceUser() {
    try {
        const href = decodeURIComponent(window.location.href || "");
        const path = decodeURIComponent(window.location.pathname || "");
        const sources = [href, path].filter(Boolean);
        for (const src of sources) {
            const win = src.match(/[/\\]Users[/\\]([^/\\]+)/i);
            if (win && win[1] && !/^Public$|^Default$/i.test(win[1])) return win[1];
            const home = src.match(/[/\\]home[/\\]([^/\\]+)/i);
            if (home && home[1]) return home[1];
        }
    } catch { /* ignore */ }
    return "";
}

function getDeviceUser() {
    const session = window.LOAuth && LOAuth.getSession();
    if (session && session.username) {
        cachedDeviceUser = session.username;
        return session.username;
    }
    return cachedDeviceUser || "Unknown";
}

// ═══════════════════════════════════════════
// Notes
// ═══════════════════════════════════════════
function saveNotes() {
    localStorage.setItem(NOTES_KEY, JSON.stringify(configNotes));
}

function saveScenarios() {
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify(scenarios));
    updateScenariosBadge();
    renderScenarios();
}

// ═══════════════════════════════════════════
// Toast / Flash Hint
// ═══════════════════════════════════════════
let toastTimer = null;
let toastHideTimer = null;

function inferToastType(msg) {
    const t = String(msg || "").toLowerCase();
    if (/(fail|error|invalid|could not|denied|unable)/.test(t)) return "error";
    if (/(warn|caution|empty|nothing)/.test(t)) return "warning";
    if (/(imported|exported|saved|copied|deleted|cleared|updated|ready|appended|done|success)/.test(t)) return "success";
    return "info";
}

function toastIconFor(type) {
    return ({ success: "check_circle", error: "error", warning: "warning", info: "info" })[type] || "info";
}

/**
 * toast(message)
 * toast(message, durationMs)
 * toast(message, { type, duration })
 */
function toast(msg, durOrOpts = 2800) {
    const el = document.getElementById("toast");
    if (!el) return;

    let duration = 2800;
    let type = inferToastType(msg);
    if (typeof durOrOpts === "number") {
        duration = durOrOpts;
    } else if (durOrOpts && typeof durOrOpts === "object") {
        if (durOrOpts.duration != null) duration = durOrOpts.duration;
        if (durOrOpts.type) type = durOrOpts.type;
    }

    const msgEl = document.getElementById("toastMsg");
    const iconEl = document.getElementById("toastIcon");
    if (msgEl) msgEl.textContent = msg;
    else el.textContent = msg;
    if (iconEl) iconEl.textContent = toastIconFor(type);

    el.classList.remove("toast--success", "toast--error", "toast--warning", "toast--info", "hiding", "show");
    void el.offsetWidth;
    el.classList.add("toast--" + type, "show");

    clearTimeout(toastTimer);
    clearTimeout(toastHideTimer);
    toastTimer = setTimeout(() => {
        el.classList.add("hiding");
        el.classList.remove("show");
        toastHideTimer = setTimeout(() => {
            el.classList.remove("hiding", "toast--success", "toast--error", "toast--warning", "toast--info");
        }, 240);
    }, duration);
}

// ═══════════════════════════════════════════
// Dark mode
// ═══════════════════════════════════════════
function toggleDark() {
    document.body.classList.toggle("dark");
    const isDark = document.body.classList.contains("dark");
    localStorage.setItem("darkMode", isDark ? "1" : "0");
    const icon = document.getElementById("darkIcon");
    if (icon) icon.textContent = isDark ? "light_mode" : "dark_mode";
    document.getElementById("darkLabel").textContent = isDark ? "Light mode" : "Dark mode";
}

function applyDark() {
    if (localStorage.getItem("darkMode") === "1") {
        document.body.classList.add("dark");
        const icon = document.getElementById("darkIcon");
        if (icon) icon.textContent = "light_mode";
        document.getElementById("darkLabel").textContent = "Light mode";
    }
}

// ═══════════════════════════════════════════
// URL Builder
// ═══════════════════════════════════════════
const baseUrlInput = () => document.getElementById("baseUrl");
const subjectSel = () => document.getElementById("subjectName");
const restInput = () => document.getElementById("restOfLink");

function updateUrl() {
    let url = baseUrlInput().value.trim();
    const sub = subjectSel().value.trim();
    const rest = restInput().value.trim();
    if (sub) url += sub + "/";
    if (rest) url += rest;
    document.getElementById("generatedUrl").textContent = url || baseUrlInput().value;
    return url;
}

function configKey() {
    return `${subjectSel().value.trim()}|${restInput().value.trim()}`;
}

function loadNoteForConfig() {
    const note = configNotes[configKey()] || "";
    const el = document.getElementById("taskNoteInput");
    if (el) el.value = note;
}

// ═══════════════════════════════════════════
// Auto-detect subject from typed path
// ═══════════════════════════════════════════
function autoDetectSubject() {
    const path = restInput().value.trim();
    if (!path) return;

    // Extract subject code from paths like:
    //   interactive/2025_eng_2r_1e_01_01_05/mymovie.html  → eng_2r_1e
    //   interactive/eng_2r_1e_01_01_05/mymovie.html       → eng_2r_1e
    //   interactive/2025_mth_3r_1a_01_02_01/index.html    → mth_3r_1a
    //
    // Pattern:  optional(20YY_)  SUBJECT  _digit(lesson numbers follow)
    // Subject:  2-4 lowercase letters _ digit r _ digit [ae]
    const match = path.match(/(?:20\d{2}_)?([a-z]{2,4}_\d+r_\d+[ae])(?=_\d|\/|$)/i);
    if (!match) return;

    const detected = match[1].toLowerCase();
    const sel = subjectSel();

    for (let i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value.toLowerCase() === detected) {
            if (sel.selectedIndex !== i) {
                sel.selectedIndex = i;
                updateUrl();
                loadNoteForConfig();
                toast(`Subject auto-detected: ${detected}`);
            }
            return;
        }
    }
    // No matching option found — leave subject unchanged, no error
}

function postMessageCardEl() {
    return document.querySelector(".post-message-card");
}

function formatCellPreview(v) {
    if (v === null || v === undefined) return String(v);
    if (typeof v === "object") {
        try {
            return JSON.stringify(v);
        } catch {
            return "[Object]";
        }
    }
    return String(v);
}

function toneFromString(s) {
    const t = String(s).toLowerCase().trim();
    if (!t) return "neutral";
    if (/\b(fail|failed|failure|error|false|rollback|invalid|timeout|abort|ko)\b/.test(t)) return "fail";
    if (/\b(pass|passed|success|successful|ok|true|approve|approved|complete|completed|yes|done)\b/.test(t)) return "pass";
    if (/complete|completed/i.test(t) && !/incomplete|not\s*complete|fail/i.test(t)) return "pass";
    return "neutral";
}

function isLikelyStatusKey(key) {
    const k = String(key).toLowerCase();
    return (
        /status|result|success|passed|state|outcome|valid|complete|error|grade|score/.test(k) &&
        !/description|message|title|name|url|path|timestamp|id$/i.test(k)
    );
}

function valueToneClass(key, val) {
    if (!isLikelyStatusKey(key)) return "";
    const preview = formatCellPreview(val);
    const tone = toneFromString(preview);
    if (tone === "fail") return "msg-val--fail";
    if (tone === "pass") return "msg-val--pass";
    return "";
}

function inferOverallOutcome(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return "neutral";
    const priorityKeys = ["status", "result", "success", "passed", "state", "outcome", "type", "completion", "valid"];
    for (const pk of priorityKeys) {
        const keys = Object.keys(obj).filter(k => k.toLowerCase() === pk);
        for (const k of keys) {
            const t = toneFromString(formatCellPreview(obj[k]));
            if (t !== "neutral") return t;
        }
    }
    for (const k of Object.keys(obj)) {
        if (!isLikelyStatusKey(k)) continue;
        const t = toneFromString(formatCellPreview(obj[k]));
        if (t !== "neutral") return t;
    }
    return "neutral";
}

function formatConsoleValue(v) {
    if (v === null || v === undefined) return String(v);
    if (typeof v === "object") {
        try {
            return Object.entries(v).map(([subK, subV]) => `${subK}: ${subV}`).join(', ');
        } catch {
            return JSON.stringify(v);
        }
    }
    return String(v);
}

function formatScoreObject(obj, label) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return esc(formatCellPreview(obj));
    const parts = [];
    if (obj.raw !== undefined) parts.push(`Raw ${obj.raw}`);
    if (obj.min !== undefined) parts.push(`Min ${obj.min}`);
    if (obj.max !== undefined) parts.push(`Max ${obj.max}`);
    if (!parts.length) return esc(formatCellPreview(obj));
    const title = label ? humanizeLabel(label) : "Score";
    return `<span class="score-inline"><span class="score-inline-label">${esc(title)}:</span>${parts.map((p, i) =>
        `${i > 0 ? '<span class="score-inline-sep">|</span>' : ""}${esc(p)}`
    ).join("")}</span>`;
}

function logPostMessageAsTable(msg) {
    console.group("%c📩 postMessage", "font-weight:bold;font-size:12px;");
    if (msg != null && typeof msg === "object" && !Array.isArray(msg)) {
        const rows = Object.keys(msg).map(k => ({
            key: k,
            value: formatConsoleValue(msg[k])
        }));
        console.table(rows);
        console.log("Full payload:", msg);
    } else if (Array.isArray(msg)) {
        console.table(msg);
        console.log("Array payload:", msg);
    } else {
        console.log(msg);
    }
    console.groupEnd();
}

const NESTED_SCORE_LABELS = {
    raw: "Raw Score",
    min: "Minimum Score",
    max: "Maximum Score"
};

const FIELD_LABELS = {
    lesson_status: "Lesson Status",
    total_time: "Total Time",
    lesson_status_message: "Status Message"
};

function humanizeLabel(key) {
    if (FIELD_LABELS[key]) return FIELD_LABELS[key];
    return String(key)
        .replace(/_/g, " ")
        .replace(/\b\w/g, c => c.toUpperCase());
}

function flattenMessageRows(data) {
    const rows = [];
    if (data === null || data === undefined) {
        return [{ label: "Value", value: String(data), key: "value" }];
    }
    if (typeof data !== "object" || Array.isArray(data)) {
        return [{ label: "Value", value: formatCellPreview(data), key: "value" }];
    }
    for (const [k, v] of Object.entries(data)) {
        if (v !== null && typeof v === "object" && !Array.isArray(v)) {
            const isScoreLike = /score|grade/i.test(k);
            if (isScoreLike) {
                const parts = [];
                if (v.raw !== undefined) parts.push(`Raw ${v.raw}`);
                if (v.min !== undefined) parts.push(`Min ${v.min}`);
                if (v.max !== undefined) parts.push(`Max ${v.max}`);
                rows.push({
                    label: humanizeLabel(k),
                    value: parts.length ? parts.join(" | ") : formatCellPreview(v),
                    key: k,
                    isScore: true
                });
                continue;
            }
            for (const [sk, sv] of Object.entries(v)) {
                const label = NESTED_SCORE_LABELS[sk]
                    ? NESTED_SCORE_LABELS[sk]
                    : `${humanizeLabel(k)} — ${humanizeLabel(sk)}`;
                rows.push({ label, value: formatCellPreview(sv), key: `${k}.${sk}` });
            }
        } else {
            rows.push({ label: humanizeLabel(k), value: formatCellPreview(v), key: k });
        }
    }
    return rows;
}

function formatStatusDisplay(valueStr) {
    const tone = toneFromString(valueStr);
    if (tone === "fail") return "Failed";
    if (tone === "pass") return "Passed";
    return valueStr;
}

function renderValueCell(key, valueStr, row) {
    const baseKey = (key.split(".").pop() || key).toLowerCase();
    if (row && row.isScore) {
        const parts = String(valueStr).split(" | ").map(p => esc(p.trim())).join('<span class="score-inline-sep">|</span>');
        const label = row.label || "Score";
        return `<span class="score-inline"><span class="score-inline-label">${esc(label)}:</span> ${parts}</span>`;
    }
    if (isLikelyStatusKey(baseKey) || baseKey.includes("status")) {
        const tone = toneFromString(valueStr);
        const display = formatStatusDisplay(valueStr);
        if (tone === "pass") return `<span class="status-badge status-badge--pass">${esc(display)}</span>`;
        if (tone === "fail") return `<span class="status-badge status-badge--fail">${esc(display)}</span>`;
        return `<span class="status-badge status-badge--neutral">${esc(display)}</span>`;
    }
    return `<span class="result-kv-value">${esc(valueStr)}</span>`;
}

function renderPostMessageTableHtml(msgData) {
    const rows = flattenMessageRows(msgData);
    if (!rows.length) return '<div class="msg-placeholder">No data</div>';
    const trs = rows.map(r =>
        `<tr><th scope="row">${esc(r.label)}</th><td>${renderValueCell(r.key, r.value, r)}</td></tr>`
    ).join("");
    return `<table class="result-kv-table"><tbody>${trs}</tbody></table>`;
}

function renderPostMessageReviewHtml(msgData) {
    if (msgData === null || msgData === undefined) {
        return `<div class="review-empty">${esc(String(msgData))}</div>`;
    }
    if (typeof msgData !== "object" || Array.isArray(msgData)) {
        return `<div class="review-kv-grid"><div class="review-kv-item review-kv-item--full"><span class="review-kv-label">Value</span><span class="review-kv-value">${esc(formatCellPreview(msgData))}</span></div></div>`;
    }

    const parts = [];
    const usedKeys = new Set();

    const statusKeys = ["lesson_status", "status", "result", "outcome", "completion"];
    let statusKey = null;
    let statusVal = null;
    for (const k of statusKeys) {
        if (msgData[k] !== undefined && msgData[k] !== null) {
            statusKey = k;
            statusVal = formatCellPreview(msgData[k]);
            usedKeys.add(k);
            break;
        }
    }

    if (statusVal !== null) {
        const tone = toneFromString(statusVal);
        const display = formatStatusDisplay(statusVal);
        const toneClass = tone === "pass" ? "pass" : tone === "fail" ? "fail" : "neutral";
        parts.push(`<div class="review-status-hero">
            <span class="review-badge review-badge--${toneClass}"><span class="review-badge-dot"></span>${esc(display)}</span>
            <span class="review-status-label">${esc(humanizeLabel(statusKey))}</span>
        </div>`);
    }

    const scoreKey = Object.keys(msgData).find(k => /score|grade/i.test(k) && msgData[k] && typeof msgData[k] === "object");
    if (scoreKey) {
        usedKeys.add(scoreKey);
        const score = msgData[scoreKey];
        const cards = [];
        if (score.raw !== undefined) cards.push({ label: "Raw", val: score.raw });
        if (score.min !== undefined) cards.push({ label: "Min", val: score.min });
        if (score.max !== undefined) cards.push({ label: "Max", val: score.max });
        if (cards.length) {
            parts.push(`<div class="review-stat-row">${cards.map(c =>
                `<div class="review-stat"><span class="review-stat-label">${esc(c.label)}</span><span class="review-stat-value">${esc(String(c.val))}</span></div>`
            ).join("")}</div>`);
        }
    }

    const kvRows = [];
    for (const [k, v] of Object.entries(msgData)) {
        if (usedKeys.has(k)) continue;
        if (v !== null && typeof v === "object" && !Array.isArray(v)) {
            for (const [sk, sv] of Object.entries(v)) {
                kvRows.push({ label: humanizeLabel(sk), value: formatCellPreview(sv) });
            }
        } else {
            kvRows.push({ label: humanizeLabel(k), value: formatCellPreview(v) });
        }
    }
    if (kvRows.length) {
        parts.push(`<div class="review-kv-grid">${kvRows.map(r =>
            `<div class="review-kv-item"><span class="review-kv-label">${esc(r.label)}</span><span class="review-kv-value">${esc(r.value)}</span></div>`
        ).join("")}</div>`);
    }

    return parts.join("") || '<div class="review-empty">No data</div>';
}

function renderOutcomeMeta(outcome) {
    const meta = document.getElementById("resultMeta");
    if (!meta) return;
    if (outcome === "pass") {
        meta.hidden = false;
        meta.innerHTML = '<span class="status-badge status-badge--pass">Passed</span>';
    } else if (outcome === "fail") {
        meta.hidden = false;
        meta.innerHTML = '<span class="status-badge status-badge--fail">Failed</span>';
    } else {
        meta.hidden = true;
        meta.innerHTML = "";
    }
}

function renderStructuredResult(msgData) {
    const wrap = document.getElementById("resultStructured");
    if (!wrap) return;

    if (msgData === null || msgData === undefined) {
        wrap.innerHTML = `<div class="msg-non-object">${esc(String(msgData))}</div>`;
        renderOutcomeMeta("neutral");
        return;
    }

    if (typeof msgData !== "object" || Array.isArray(msgData)) {
        wrap.innerHTML = renderPostMessageTableHtml(msgData);
        renderOutcomeMeta(typeof msgData === "string" ? toneFromString(msgData) : "neutral");
        return;
    }

    const outcome = inferOverallOutcome(msgData);
    renderOutcomeMeta(outcome);
    wrap.innerHTML = renderPostMessageTableHtml(msgData);
}

function setResultWaiting(text) {
    const card = postMessageCardEl();
    if (card) card.classList.remove("show-raw");
    const meta = document.getElementById("resultMeta");
    if (meta) {
        meta.hidden = true;
        meta.innerHTML = "";
    }
    const wrap = document.getElementById("resultStructured");
    if (wrap) wrap.innerHTML = `<div class="msg-placeholder">${esc(text)}</div>`;
    const pre = document.getElementById("resultData");
    if (pre) pre.textContent = text;
    syncToggleResultViewBtn();
}

function syncToggleResultViewBtn() {
    const btn = document.getElementById("toggleResultViewBtn");
    const card = postMessageCardEl();
    if (!btn || !card) return;
    const isRaw = card.classList.contains("show-raw");
    btn.textContent = isRaw ? "Table" : "Raw";
    btn.classList.toggle("is-raw-active", isRaw);
}

function clearResultPanelToEmpty() {
    const card = postMessageCardEl();
    if (card) card.classList.remove("show-raw");
    const meta = document.getElementById("resultMeta");
    if (meta) {
        meta.hidden = true;
        meta.innerHTML = "";
    }
    const wrap = document.getElementById("resultStructured");
    if (wrap) {
        wrap.innerHTML = '<div class="msg-placeholder">No messages received yet. Click "Fire" to load an LO.</div>';
    }
    const pre = document.getElementById("resultData");
    if (pre) pre.textContent = "";
    syncToggleResultViewBtn();
}

function setResultReadyMessage() {
    const card = postMessageCardEl();
    if (card) card.classList.remove("show-raw");
    const meta = document.getElementById("resultMeta");
    if (meta) {
        meta.hidden = true;
        meta.innerHTML = "";
    }
    const wrap = document.getElementById("resultStructured");
    if (wrap) wrap.innerHTML = '<div class="msg-placeholder">Ready. Click Fire.</div>';
    const pre = document.getElementById("resultData");
    if (pre) pre.textContent = "Ready. Click Fire.";
    syncToggleResultViewBtn();
}

// ═══════════════════════════════════════════
// Fire
// ═══════════════════════════════════════════
function fireResult() {
    const url = updateUrl();
    const baseOnly = baseUrlInput().value.trim();
    if (!url || url === baseOnly) {
        toast("Select a subject or enter the rest of the link first.");
        return;
    }
    setResultWaiting("Waiting for LO to send a postMessage…");
    const loader = document.getElementById("loader");
    loader.style.display = "inline-block";
    const frame = document.getElementById("previewFrame");
    const previewLabel = document.getElementById("previewLabel");
    if (previewLabel) previewLabel.classList.remove("active");
    frame.src = "";
    if ("caches" in window) caches.keys().then(ns => ns.forEach(n => caches.delete(n)));
    setTimeout(() => {
        const cb = Date.now();
        frame.src = url + (url.includes("?") ? "&" : "?") + "_cb=" + cb;
        loader.style.display = "none";
        if (previewLabel) previewLabel.classList.add("active");
        toast("LO loading…");
    }, 200);
}

// ═══════════════════════════════════════════
// postMessage handler
// ═══════════════════════════════════════════
window.addEventListener("message", e => {
    const msg = e.data;
    logPostMessageAsTable(msg);

    if (isRecording && msg && msg.type) {
        const desc = msg.description || msg.type || JSON.stringify(msg).substring(0, 60);
        addRecorderStep(desc, true);
    }

    addTestEntry(msg);
});

function currentScenarioLabel() {
    const el = scenarioNameInputEl();
    return el ? el.value.trim() : "";
}

async function addTestEntry(msgData) {
    let fullMsg = "";
    try {
        fullMsg = JSON.stringify(msgData, null, 2);
    } catch {
        fullMsg = "Unable to stringify";
    }
    const key = configKey();
    const existingNote = configNotes[key] || "";
    const scenarioName = currentScenarioLabel();
    let entry;
    try {
        entry = await LOApi.createTask({
            subject: subjectSel().value.trim(),
            restOfLink: restInput().value.trim(),
            fullUrl: document.getElementById("generatedUrl").textContent,
            fullMessage: fullMsg,
            note: existingNote,
            status: "Hold",
            scenarioName,
            postmessage_payload: msgData && typeof msgData === "object" ? msgData : null
        });
    } catch (err) {
        console.error(err);
        toast(err.message || "Could not save task to server.");
        return;
    }
    testHistory.unshift(entry);
    if (testHistory.length > 200) testHistory = testHistory.slice(0, 200);
    if (isRecording) {
        recordedTestIds.push(entry.id);
    }
    saveHistory();
    lastTestId = entry.id;
    document.getElementById("resultData").textContent = fullMsg;
    const card = postMessageCardEl();
    if (card) card.classList.remove("show-raw");
    try {
        renderStructuredResult(msgData);
    } catch {
        const wrap = document.getElementById("resultStructured");
        if (wrap) {
            wrap.innerHTML =
                '<div class="msg-placeholder">Could not build table for this payload. Use <b>Raw</b> to inspect JSON.</div>';
        }
        const meta = document.getElementById("resultMeta");
        if (meta) {
            meta.hidden = true;
            meta.innerHTML = "";
        }
    }
    syncToggleResultViewBtn();
    showPostResultModal(msgData);
}

// ═══════════════════════════════════════════
// Post-Result Modal
// ═══════════════════════════════════════════
function highlightQuickStatus(status) {
    document.querySelectorAll(".segmented-item").forEach(btn => {
        const isActive = btn.dataset.qs === status;
        btn.classList.toggle("is-active", isActive);
        btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
}

function showPostResultModal(msgData) {
    const modal = document.getElementById("postResultModal");
    if (!modal) return;

    const previewEl = document.getElementById("postResultPreview");
    if (previewEl) {
        previewEl.innerHTML = renderPostMessageReviewHtml(msgData);
    }

    const entry = testHistory.find(e => e.id === lastTestId);
    highlightQuickStatus(entry?.status || lastQuickStatus || "Hold");

    const noteEl = document.getElementById("taskNoteInput");
    if (noteEl) noteEl.value = configNotes[configKey()] || entry?.note || "";

    modal.classList.add("open");
}

async function savePostResultAndClose() {
    const activeBtn = document.querySelector(".segmented-item.is-active");
    const note = document.getElementById("taskNoteInput")?.value.trim() || "";
    const key = configKey();
    if (note) configNotes[key] = note;
    else delete configNotes[key];
    saveNotes();
    if (lastTestId) {
        const entry = testHistory.find(e => e.id === lastTestId);
        if (entry) {
            const status = activeBtn ? activeBtn.dataset.qs : entry.status;
            if (activeBtn) lastQuickStatus = activeBtn.dataset.qs;
            await persistTaskPatch(entry, { status, note });
        }
    }
    document.getElementById("postResultModal").classList.remove("open");
    toast("Task saved.");
}

// ═══════════════════════════════════════════
// Quick Status
// ═══════════════════════════════════════════
function applyQuickStatus(status) {
    if (!lastTestId) {
        toast("No test yet — fire a URL first.");
        return;
    }
    updateTestStatus(lastTestId, status);
    lastQuickStatus = status;
    highlightQuickStatus(status);
    toast(`Status → ${status}`);
}

function updateTestStatus(id, status) {
    const entry = testHistory.find(e => e.id === id);
    if (!entry) return;
    entry.status = status;
    persistTaskPatch(entry, { status });
}

const STATUS_OPTIONS = ["Approve", "Hold", "Rollback"];

function statusOptionKey(status) {
    return String(status || "Hold").toLowerCase();
}

function renderStatusDropdown(id, status) {
    const current = status || "Hold";
    const key = statusOptionKey(current);
    const options = STATUS_OPTIONS.map(value => {
        const optKey = statusOptionKey(value);
        const selected = value === current;
        return `<li role="presentation">
            <button type="button" class="status-dd-option status-dd-option--${optKey}${selected ? " is-selected" : ""}" data-value="${value}" role="option" aria-selected="${selected}">
                <span class="status-pill-dot" aria-hidden="true"></span>
                <span class="status-dd-option-label">${value}</span>
                ${selected ? '<span class="material-symbols-outlined status-dd-check" aria-hidden="true">check</span>' : ""}
            </button>
        </li>`;
    }).join("");
    return `<div class="status-dd status-dd--${key}" data-id="${esc(id)}">
        <button type="button" class="status-dd-trigger" aria-expanded="false" aria-haspopup="listbox" title="Change status">
            <span class="status-pill-dot" aria-hidden="true"></span>
            <span class="status-dd-label">${esc(current)}</span>
            <span class="material-symbols-outlined status-dd-chevron" aria-hidden="true">expand_more</span>
        </button>
        <ul class="status-dd-menu" role="listbox" hidden>${options}</ul>
    </div>`;
}

let statusDropdownDocBound = false;
let activeStatusMenu = null;
let activeStatusDd = null;

function closeAllStatusDropdowns() {
    if (activeStatusDd) {
        activeStatusDd.classList.remove("is-open");
        const trigger = activeStatusDd.querySelector(".status-dd-trigger");
        if (trigger) trigger.setAttribute("aria-expanded", "false");
        activeStatusDd = null;
    }
    if (activeStatusMenu) {
        activeStatusMenu.setAttribute("hidden", "");
        activeStatusMenu.classList.remove("status-dd-menu--open");
        activeStatusMenu.style.cssText = "";
        const owner = activeStatusMenu._ownerDd;
        if (owner && activeStatusMenu.parentNode === document.body) {
            owner.appendChild(activeStatusMenu);
        }
        activeStatusMenu = null;
    }
    window.removeEventListener("scroll", closeAllStatusDropdowns, true);
    window.removeEventListener("resize", closeAllStatusDropdowns);
}

function positionStatusDropdownMenu(trigger, menu) {
    const rect = trigger.getBoundingClientRect();
    const gap = 4;
    menu.style.position = "fixed";
    menu.style.zIndex = "20000";
    menu.style.display = "block";
    menu.style.visibility = "hidden";
    menu.style.left = "0";
    menu.style.top = "0";
    menu.style.minWidth = `${Math.max(rect.width, 152)}px`;

    const menuHeight = menu.offsetHeight || 140;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < menuHeight + gap && rect.top > menuHeight + gap;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8));

    menu.style.left = `${left}px`;
    menu.style.top = openUp
        ? `${rect.top - menuHeight - gap}px`
        : `${rect.bottom + gap}px`;
    menu.style.visibility = "visible";
}

function openStatusDropdown(dd) {
    const trigger = dd.querySelector(".status-dd-trigger");
    const menu = dd.querySelector(".status-dd-menu");
    if (!trigger || !menu) return;

    closeAllStatusDropdowns();

    dd.classList.add("is-open");
    activeStatusDd = dd;
    activeStatusMenu = menu;

    menu.removeAttribute("hidden");
    menu.classList.add("status-dd-menu--open");
    menu._ownerDd = dd;
    menu.dataset.ddId = dd.dataset.id || "";
    document.body.appendChild(menu);

    trigger.setAttribute("aria-expanded", "true");
    positionStatusDropdownMenu(trigger, menu);

    window.addEventListener("scroll", closeAllStatusDropdowns, true);
    window.addEventListener("resize", closeAllStatusDropdowns);
}

function bindStatusDropdowns(root) {
    if (!statusDropdownDocBound) {
        statusDropdownDocBound = true;
        document.addEventListener("click", e => {
            const opt = e.target.closest(".status-dd-option");
            if (opt) {
                const menu = opt.closest(".status-dd-menu");
                if (!menu) return;
                const dd = menu._ownerDd
                    || document.querySelector(`.status-dd[data-id="${menu.dataset.ddId || ""}"]`);
                if (!dd) return;
                e.preventDefault();
                e.stopPropagation();
                const value = opt.dataset.value;
                closeAllStatusDropdowns();
                updateTestStatus(dd.dataset.id, value);
                toast(`Status → ${value}`);
                return;
            }
            if (!e.target.closest(".status-dd-trigger")) {
                closeAllStatusDropdowns();
            }
        });
        document.addEventListener("keydown", e => {
            if (e.key === "Escape") closeAllStatusDropdowns();
        });
    }

    root.querySelectorAll(".status-dd-trigger").forEach(trigger => {
        trigger.onclick = e => {
            e.preventDefault();
            e.stopPropagation();
            const dd = trigger.closest(".status-dd");
            if (dd.classList.contains("is-open")) {
                closeAllStatusDropdowns();
            } else {
                openStatusDropdown(dd);
            }
        };
    });
}

// ═══════════════════════════════════════════
// Scenario Recorder
// ═══════════════════════════════════════════
function startRecording() {
    isRecording = true;
    recordingSteps = [];
    recordedTestIds = [];
    document.getElementById("recorderPanel").classList.add("recording");
    document.getElementById("recDot").style.background = "var(--red)";
    document.getElementById("recTitle").textContent = "Recording…";
    document.getElementById("recStatus").textContent = 'Interact with the LO, then press "+ Add Step" for each action.';
    document.getElementById("addStepRow").style.display = "flex";
    document.getElementById("startRecBtn2").style.display = "none";
    document.getElementById("stopRecBtn2").style.display = "inline-flex";
    renderSteps();
    toast("Recording started");
}

function stopRecording() {
    isRecording = false;
    document.getElementById("recorderPanel").classList.remove("recording");
    document.getElementById("recDot").style.background = "var(--text3)";
    document.getElementById("recTitle").textContent = `Stopped (${recordingSteps.length} steps)`;
    document.getElementById("recStatus").textContent = "Recording stopped. Save the scenario below.";
    document.getElementById("addStepRow").style.display = "none";
    document.getElementById("startRecBtn2").style.display = "inline-flex";
    document.getElementById("stopRecBtn2").style.display = "none";
    toast(`Stopped · ${recordingSteps.length} steps captured`);
}

function addRecorderStep(desc, auto = false) {
    if (!desc && !document.getElementById("stepDescInput")) return;
    const d = desc || document.getElementById("stepDescInput").value.trim();
    if (!d) {
        toast("Enter a description first.");
        return;
    }
    recordingSteps.push({ desc: d, time: new Date().toLocaleTimeString(), auto });
    if (document.getElementById("stepDescInput")) document.getElementById("stepDescInput").value = "";
    renderSteps();
}

// ═══════════════════════════════════════════
// Contextual Clear All
// ═══════════════════════════════════════════
function executeContextualClearAll() {
    if (currentPage === "dashboard") {
        if (!confirm("Delete all tasks you can access from the dashboard?")) return;
        LOApi.clearTasks()
            .then(async () => {
                await loadTasksFromServer();
                lastTestId = null;
                saveHistory();
                toast("Tasks cleared.");
            })
            .catch(err => toast(err.message || "Could not clear tasks."));
    }
    else if (currentPage === "test") {
        if (!confirm("Clear current test output, iframe, and recorder steps?")) return;
        clearResultPanelToEmpty();
        const frame = document.getElementById("previewFrame");
        if (frame) frame.src = "";
        const previewLabel = document.getElementById("previewLabel");
        if (previewLabel) previewLabel.classList.remove("active");
        recordingSteps = [];
        renderSteps();
        toast("Test runner workspace cleared.");
    }
    else if (currentPage === "scenarios") {
        if (!confirm("Permanently delete all saved scenarios?")) return;
        scenarios = [];
        saveScenarios();
        toast("All scenarios deleted.");
    }
}

function deleteStep(i) {
    recordingSteps.splice(i, 1);
    renderSteps();
}

function renderSteps() {
    const list = document.getElementById("stepsList");
    if (!recordingSteps.length) {
        list.innerHTML = '<div class="steps-empty">No steps yet. Start recording, then add steps.</div>';
        return;
    }
    list.innerHTML = recordingSteps
        .map(
            (s, i) => `
        <div class="step-item ${s.auto ? "step-auto" : ""}">
            <div class="step-num">${i + 1}</div>
            <div class="step-desc">${esc(s.desc)}</div>
            <div class="step-time">${s.time}</div>
            <button type="button" class="step-del" onclick="deleteStep(${i})">✕</button>
        </div>
    `
        )
        .join("");
}

function saveScenario() {
    const name = scenarioNameInputEl().value.trim();
    if (!name) {
        toast("Enter a scenario name first.");
        return;
    }
    if (!recordingSteps.length) {
        toast("No steps to save — record some steps first.");
        return;
    }
    const sc = {
        id: Date.now() + "-" + Math.random().toString(36).substr(2, 6),
        name,
        steps: [...recordingSteps],
        subject: subjectSel().value.trim(),
        restOfLink: restInput().value.trim(),
        createdAt: new Date().toISOString()
    };
    scenarios.unshift(sc);
    saveScenarios();

    if (recordedTestIds && recordedTestIds.length > 0) {
        for (const id of recordedTestIds) {
            const entry = testHistory.find(e => e.id === id);
            if (entry) {
                entry.scenarioName = name;
                persistTaskPatch(entry, { scenarioName: name });
            }
        }
    } else {
        const entry = testHistory.find(e => e.id === lastTestId) || testHistory[0];
        if (entry) {
            entry.scenarioName = name;
            persistTaskPatch(entry, { scenarioName: name });
        }
    }
    recordedTestIds = [];

    scenarioNameInputEl().value = "";
    recordingSteps = [];
    renderSteps();
    toast(`Scenario "${name}" saved (${sc.steps.length} steps)`);
}

function updateScenariosBadge() {
    document.getElementById("scenariosBadge").textContent = scenarios.length;
}

// ═══════════════════════════════════════════
// Notes
// ═══════════════════════════════════════════
function saveConfigNote() {
    const note = document.getElementById("taskNoteInput").value.trim();
    const key = configKey();
    if (note) configNotes[key] = note;
    else delete configNotes[key];
    saveNotes();
    const sub = subjectSel().value.trim();
    const rest = restInput().value.trim();
    const entry = testHistory.find(e => e.subject === sub && e.restOfLink === rest);
    if (entry) {
        entry.note = note;
        persistTaskPatch(entry, { note });
        toast("Note saved and applied to task.");
    } else toast("Note saved. Will attach to future tests with this config.");
}

function copyNoteToLastTest() {
    if (!lastTestId) {
        toast("No test yet.");
        return;
    }
    const note = document.getElementById("taskNoteInput").value.trim();
    const entry = testHistory.find(e => e.id === lastTestId);
    if (entry) {
        entry.note = note;
        persistTaskPatch(entry, { note });
        toast("Note applied to last test.");
    }
}

// ═══════════════════════════════════════════
// Dashboard
// ═══════════════════════════════════════════
function escHtml(s) {
    if (s === null || s === undefined || s === "") return "";
    return String(s).replace(/[&<>"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
}

function esc(s) {
    if (s === null || s === undefined) return "";
    return escHtml(String(s));
}

function updateFilterOptions() {
    if (!document.getElementById("filterSubject")) return;
    const subjects = [...new Set(testHistory.map(h => h.subject).filter(Boolean))].sort();
    const users = [...new Set(testHistory.map(h => h.user).filter(Boolean))].sort();

    const userSel = document.getElementById("filterUser");
    if (userSel) {
        const prevUser = userSel.value;
        userSel.innerHTML =
            '<option value="ALL">All Users</option>' +
            users.map(u => `<option value="${esc(u)}" ${prevUser === u ? "selected" : ""}>${esc(u)}</option>`).join("");
    }

    const sel = document.getElementById("filterSubject");
    const prev = sel.value;
    sel.innerHTML =
        '<option value="ALL">All Subjects</option>' +
        subjects.map(s => `<option value="${esc(s)}" ${prev === s ? "selected" : ""}>${esc(s)}</option>`).join("");
}

function getFiltered() {
    return testHistory.filter(item => {
        if (currentFilterUser !== "ALL" && item.user !== currentFilterUser) return false;
        if (currentFilterSubject !== "ALL" && item.subject !== currentFilterSubject) return false;
        if (currentFilterStatus !== "ALL" && item.status !== currentFilterStatus) return false;
        if (currentSearchText.trim()) {
            const q = currentSearchText.toLowerCase();
            const scen = (item.scenarioName || "").toLowerCase();
            if (
                ![
                    item.subject || "",
                    item.user || "",
                    item.restOfLink || "",
                    item.note || "",
                    item.fullMessage || "",
                    scen
                ].some(f => f.toLowerCase().includes(q))
            ) {
                return false;
            }
        }
        return true;
    });
}

function renderDashboard() {
    closeAllStatusDropdowns();
    const total = testHistory.length;
    const subjects = new Set(testHistory.map(h => h.subject).filter(Boolean));
    const approve = testHistory.filter(h => h.status === "Approve").length;
    const rollback = testHistory.filter(h => h.status === "Rollback").length;
    const hold = testHistory.filter(h => h.status === "Hold").length;
    const last = testHistory[0] ? new Date(testHistory[0].timestamp).toLocaleTimeString() : "—";

    document.getElementById("statTotal").textContent = total;
    document.getElementById("statSubjects").textContent = subjects.size;
    document.getElementById("statApprove").textContent = approve;
    document.getElementById("statRollback").textContent = rollback;
    document.getElementById("statHold").textContent = hold;
    document.getElementById("statLast").textContent = last;

    const filtered = getFiltered();
    const tbody = document.getElementById("historyTbody");

    if (!filtered.length) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="9">No tests match the current filters.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered
        .map((item, idx) => {
            const escapedMsg = item.fullMessage
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;");
            const scen = item.scenarioName || "";
            const scenCell = scen
                ? `<span class="dash-scenario" title="${esc(scen)}">${esc(scen.length > 28 ? scen.slice(0, 28) + "…" : scen)}</span>`
                : '<span class="dash-muted">—</span>';
            const timeStr = esc(new Date(item.timestamp).toLocaleTimeString());
            const linkCell = item.restOfLink
                ? `<span class="dash-link" title="${esc(item.restOfLink)}">${esc(item.restOfLink)}</span>`
                : '<span class="dash-muted">—</span>';
            const notePreview = item.note
                ? `<span class="dash-note-inline"><span class="dash-note-label">Note:</span> <span class="dash-note-text" title="${esc(item.note)}">${esc(item.note.length > 32 ? item.note.slice(0, 32) + "…" : item.note)}</span></span>`
                : "";
            const noteBtn = item.note
                ? `<button type="button" class="dash-note-btn edit-note-btn" data-id="${item.id}" title="Edit note"><span class="material-symbols-outlined">edit</span> Edit</button>`
                : `<button type="button" class="dash-note-btn edit-note-btn dash-note-btn--add" data-id="${item.id}"><span class="material-symbols-outlined">edit</span> Add note</button>`;
            const noteCell = `<div class="dash-note-cell">${notePreview}${noteBtn}</div>`;
            const userCell = item.user
                ? `<span class="dash-user" title="${esc(item.user)}">${esc(item.user.length > 20 ? item.user.slice(0, 20) + "…" : item.user)}</span>`
                : '<span class="dash-muted">—</span>';
            const rowAlt = idx % 2 === 1 ? " dash-row--alt" : "";
            return `<tr class="dash-row${rowAlt}">
            <td>${userCell}</td>
            <td class="dash-time">${timeStr}</td>
            <td class="dash-subject">${esc(item.subject) || '<span class="dash-muted">—</span>'}</td>
            <td class="dash-link-cell">${linkCell}</td>
            <td><button type="button" class="dash-view-btn view-msg-btn" data-msg="${escapedMsg}">
                <span class="material-symbols-outlined">visibility</span> View</button></td>
            <td>${scenCell}</td>
            <td class="td-status">${renderStatusDropdown(item.id, item.status)}</td>
            <td>${noteCell}</td>
            <td class="td-actions">
                <button type="button" class="dash-icon-btn rerun-btn" data-subject="${esc(item.subject)}" data-rest="${esc(item.restOfLink)}" data-scenario="${esc(scen)}" title="Re-run">
                    <span class="material-symbols-outlined">replay</span></button>
                <button type="button" class="dash-icon-btn dash-icon-btn--danger del-btn" data-id="${item.id}" title="Delete">
                    <span class="material-symbols-outlined">delete</span></button>
            </td>
        </tr>`;
        })
        .join("");

    bindStatusDropdowns(tbody);
    tbody.querySelectorAll(".view-msg-btn").forEach(btn => {
        btn.onclick = () => openMsgModal(btn.getAttribute("data-msg"));
    });
    tbody.querySelectorAll(".edit-note-btn").forEach(btn => {
        btn.onclick = () => {
            currentEditingId = btn.dataset.id;
            const entry = testHistory.find(e => e.id === currentEditingId);
            document.getElementById("modalNoteText").value = entry ? entry.note || "" : "";
            document.getElementById("noteModal").classList.add("open");
        };
    });
    tbody.querySelectorAll(".rerun-btn").forEach(btn => {
        btn.onclick = () => {
            const sub = btn.dataset.subject;
            const rest = btn.dataset.rest;
            const scenario = btn.dataset.scenario || "";
            switchPage("test");
            const sel = subjectSel();
            for (let i = 0; i < sel.options.length; i++) {
                if (sel.options[i].value === sub) { sel.selectedIndex = i; break; }
            }
            restInput().value = rest;
            if (scenarioNameInputEl()) scenarioNameInputEl().value = scenario;
            updateUrl();
            loadNoteForConfig();
            setResultReadyMessage();
            toast(scenario ? `Loaded · scenario: ${scenario}` : "Config loaded — click Fire to run.");
        };
    });
    tbody.querySelectorAll(".del-btn").forEach(btn => {
        btn.onclick = () => {
            const id = btn.dataset.id;
            LOApi.deleteTask(id)
                .then(() => {
                    testHistory = testHistory.filter(e => e.id !== id);
                    if (lastTestId === id) lastTestId = null;
                    saveHistory();
                    toast("Entry deleted.");
                })
                .catch(err => toast(err.message || "Could not delete."));
        };
    });
}

// ═══════════════════════════════════════════
// Load scenario into Test Runner
// ═══════════════════════════════════════════
function loadScenarioIntoRunner(sc) {
    if (!sc) return;
    switchPage("test");
    if (sc.subject) {
        const sel = subjectSel();
        for (let i = 0; i < sel.options.length; i++) {
            if (sel.options[i].value === sc.subject) { sel.selectedIndex = i; break; }
        }
    }
    if (sc.restOfLink) restInput().value = sc.restOfLink;
    if (scenarioNameInputEl()) scenarioNameInputEl().value = sc.name || "";

    isRecording = false;
    recordedTestIds = [];
    recordingSteps = Array.isArray(sc.steps)
        ? sc.steps.map(s => ({ desc: s.desc || "", time: s.time || "", auto: !!s.auto }))
        : [];

    const panel = document.getElementById("recorderPanel");
    if (panel) panel.classList.remove("recording");
    const recDot = document.getElementById("recDot");
    if (recDot) recDot.style.background = "var(--text3)";
    const recTitle = document.getElementById("recTitle");
    if (recTitle) {
        recTitle.textContent = recordingSteps.length
            ? `Loaded (${recordingSteps.length} steps)`
            : "Not Recording";
    }
    const recStatus = document.getElementById("recStatus");
    if (recStatus) {
        recStatus.textContent = recordingSteps.length
            ? "Scenario steps restored from saved config."
            : "Press Start to begin capturing steps";
    }
    const addStepRow = document.getElementById("addStepRow");
    if (addStepRow) addStepRow.style.display = "none";
    const startBtn = document.getElementById("startRecBtn2");
    if (startBtn) startBtn.style.display = "inline-flex";
    const stopBtn = document.getElementById("stopRecBtn2");
    if (stopBtn) stopBtn.style.display = "none";

    renderSteps();
    updateUrl();
    loadNoteForConfig();
    setResultReadyMessage();
}

// ═══════════════════════════════════════════
// Scenarios Page
// ═══════════════════════════════════════════
function renderScenarios() {
    const grid = document.getElementById("scenariosGrid");
    if (!scenarios.length) {
        grid.innerHTML =
            '<div style="color:var(--text3); font-size:0.85rem; grid-column:1/-1; text-align:center; padding:40px 0;">No scenarios saved yet. Use the Scenario Recorder in Test Runner.</div>';
        return;
    }
    grid.innerHTML = scenarios
        .map(
            sc => `
        <div class="scenario-card">
            <div class="scenario-card-title">
                <span class="scenario-card-name">${esc(sc.name)}</span>
                <span class="scenario-card-link-badge">${esc(sc.restOfLink || "—")}</span>
            </div>
            <div class="scenario-card-meta">${sc.steps.length} steps · ${esc(sc.subject || "no subject")} · ${new Date(sc.createdAt).toLocaleDateString()}</div>
            <div class="scenario-steps-preview">
                ${sc.steps.slice(0, 4).map((s, i) => `
                    <div class="scenario-step-preview">
                        <span class="step-idx">${i + 1}.</span>
                        <span>${esc(s.desc)}</span>
                    </div>
                `).join("")}
                ${sc.steps.length > 4 ? `<div style="color:var(--text3); font-size:0.72rem; padding:4px 0;">+${sc.steps.length - 4} more steps…</div>` : ""}
            </div>
            <div class="scenario-card-footer">
                <button type="button" class="btn btn-scenario btn-scenario-view view-scenario-btn" data-id="${sc.id}">
                    <span class="material-symbols-outlined">visibility</span>
                    View
                </button>
                <button type="button" class="btn btn-scenario btn-scenario-load load-scenario-btn" data-id="${sc.id}">
                    <span class="material-symbols-outlined">play_arrow</span>
                    Load
                </button>
                <button type="button" class="btn btn-scenario btn-scenario-del del-scenario-btn" data-id="${sc.id}" title="Delete scenario" aria-label="Delete scenario">
                    <span class="material-symbols-outlined">delete</span>
                </button>
            </div>
        </div>
    `
        )
        .join("");

    grid.querySelectorAll(".view-scenario-btn").forEach(btn => {
        btn.onclick = () => {
            const sc = scenarios.find(s => s.id === btn.dataset.id);
            if (!sc) return;
            document.getElementById("scenarioModalTitle").textContent = sc.name;
            document.getElementById("scenarioModalSteps").innerHTML = `
                <div style="font-size:0.75rem; color:var(--text3); font-family:var(--mono); margin-bottom:14px;">${sc.steps.length} steps · ${sc.subject || "—"} · ${sc.restOfLink || "—"}</div>
                ${sc.steps.map((s, i) => `
                    <div class="step-item ${s.auto ? "step-auto" : ""}">
                        <div class="step-num">${i + 1}</div>
                        <div class="step-desc">${esc(s.desc)}</div>
                        <div class="step-time">${s.time || ""}</div>
                    </div>
                `).join("")}
            `;
            document.getElementById("scenarioModal").classList.add("open");
        };
    });
    grid.querySelectorAll(".load-scenario-btn").forEach(btn => {
        btn.onclick = () => {
            const sc = scenarios.find(s => s.id === btn.dataset.id);
            if (!sc) return;
            loadScenarioIntoRunner(sc);
            toast(`Scenario "${sc.name}" loaded (${sc.steps.length} steps).`);
        };
    });
    grid.querySelectorAll(".del-scenario-btn").forEach(btn => {
        btn.onclick = () => {
            scenarios = scenarios.filter(s => s.id !== btn.dataset.id);
            saveScenarios();
            toast("Scenario deleted.");
        };
    });
}

// ═══════════════════════════════════════════
// Modals
// ═══════════════════════════════════════════
function openMsgModal(rawMsg) {
    let msgData;
    try {
        const unesc = rawMsg.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
        msgData = JSON.parse(unesc);
    } catch {
        msgData = { value: rawMsg };
    }
    const tableEl = document.getElementById("msgModalTable");
    if (tableEl) tableEl.innerHTML = renderPostMessageTableHtml(msgData);
    document.getElementById("msgModal").classList.add("open");
}

// ═══════════════════════════════════════════
// Export / Import (server-backed)
// ═══════════════════════════════════════════
function exportCsv() {
    const rows = getFiltered().length ? getFiltered() : testHistory;
    if (!rows.length) { toast("Nothing to export."); return; }
    const cols = ["User", "Timestamp", "Subject", "RestOfLink", "FullUrl", "MessagePreview", "ScenarioName", "Status", "Note"];
    const data = rows.map(i => [
        i.user || "", i.timestamp, i.subject, i.restOfLink, i.fullUrl,
        i.messagePreview || (i.fullMessage || "").substring(0, 80),
        i.scenarioName || "", i.status, i.note
    ]);
    const csv = [cols, ...data].map(r => r.map(c => `"${String(c || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    dl(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }), "test_history.csv");
    toast("CSV exported");
}

function exportJson() {
    const rows = getFiltered().length ? getFiltered() : testHistory;
    if (!rows.length) { toast("Nothing to export."); return; }
    dl(new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" }), "test_history.json");
    toast("JSON exported");
}

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
                if (next === '"') { cur += '"'; i++; }
                else inQuotes = false;
            } else {
                cur += ch;
            }
        } else if (ch === '"') {
            inQuotes = true;
        } else if (ch === ",") {
            row.push(cur); cur = "";
        } else if (ch === "\n") {
            row.push(cur); cur = "";
            if (row.some(cell => String(cell).trim() !== "")) rows.push(row);
            row = [];
        } else if (ch !== "\r") {
            cur += ch;
        }
    }
    row.push(cur);
    if (row.some(cell => String(cell).trim() !== "")) rows.push(row);
    return rows;
}

function normalizeImportedRow(raw) {
    const status = String(raw.status || raw.result || raw.Status || "Hold").trim() || "Hold";
    const allowed = ["Approve", "Hold", "Rollback"];
    const normalizedStatus = allowed.includes(status) ? status : "Hold";
    const fullMessage =
        raw.fullMessage ||
        raw.full_message ||
        raw.MessagePreview ||
        raw.messagePreview ||
        raw.Message ||
        raw.message ||
        "{}";
    return {
        user: String(raw.user || raw.User || raw.username || raw.source_username || "").trim(),
        subject: String(raw.subject || raw.Subject || "").trim(),
        restOfLink: String(raw.restOfLink || raw.path || raw.Link || raw.RestOfLink || "").trim(),
        fullUrl: String(raw.fullUrl || raw.lo_url || raw.URL || raw.FullUrl || "").trim(),
        fullMessage: typeof fullMessage === "string" ? fullMessage : JSON.stringify(fullMessage),
        note: String(raw.note || raw.Note || "").trim(),
        status: normalizedStatus,
        scenarioName: String(raw.scenarioName || raw.scenario_name || raw.ScenarioName || raw.Scenario || "").trim(),
        postmessage_payload: raw.postmessage_payload || null
    };
}

function parseCsvText(text) {
    const table = parseCsvRecords(text);
    if (table.length < 2) return [];
    const headers = table[0].map(h => String(h || "").trim());
    const rows = [];
    for (let i = 1; i < table.length; i++) {
        const cols = table[i];
        const obj = {};
        headers.forEach((h, idx) => { obj[h] = cols[idx] != null ? cols[idx] : ""; });
        rows.push(normalizeImportedRow(obj));
    }
    return rows;
}

function parseImportFile(file, text) {
    const name = (file.name || "").toLowerCase();
    if (name.endsWith(".json") || text.trim().startsWith("[") || text.trim().startsWith("{")) {
        const parsed = JSON.parse(text);
        const arr = Array.isArray(parsed) ? parsed : parsed.tasks || parsed.data || [];
        if (!Array.isArray(arr)) throw new Error("JSON must be an array of records.");
        return arr.map(normalizeImportedRow);
    }
    if (name.endsWith(".csv") || text.includes(",")) {
        return parseCsvText(text);
    }
    throw new Error("Unsupported file. Use .json or .csv");
}

async function importHistoryFile(file) {
    const text = await file.text();
    const rows = parseImportFile(file, text);
    if (!rows.length) { toast("No rows found in file."); return; }
    let added = 0;
    let failed = 0;
    toast(`Importing ${rows.length} rows…`, 3500);
    for (const row of rows) {
        try {
            await LOApi.createTask(row);
            added++;
        } catch (err) {
            console.error(err);
            failed++;
        }
    }
    await loadTasksFromServer();
    saveHistory();
    if (failed) toast(`Imported ${added}, failed ${failed}.`);
    else toast(`Imported ${added} records.`);
}

function exportScenarios() {
    if (!scenarios.length) { toast("No scenarios."); return; }
    dl(new Blob([JSON.stringify(scenarios, null, 2)], { type: "application/json" }), "scenarios.json");
    toast("Scenarios exported");
}

function importScenarios(file) {
    const r = new FileReader();
    r.onload = e => {
        try {
            const arr = JSON.parse(e.target.result);
            if (!Array.isArray(arr)) throw new Error("Must be array.");
            let added = 0;
            for (const sc of arr) {
                if (!sc.id) sc.id = Date.now() + "-" + Math.random().toString(36).substr(2, 6) + "-" + added;
                if (!scenarios.some(s => s.id === sc.id)) {
                    scenarios.push(sc);
                    added++;
                }
            }
            saveScenarios();
            toast(`Imported ${added} scenarios`);
        } catch (err) {
            alert("Invalid file: " + err.message);
        }
    };
    r.readAsText(file);
}

function dl(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
}

// ═══════════════════════════════════════════
// Manage Team
// ═══════════════════════════════════════════
let teamMembers = [];
let memberEditId = null;

function openModal(id) {
    document.getElementById(id).classList.add("open");
}
function closeModal(id) {
    document.getElementById(id).classList.remove("open");
}

function formatTeamTime(iso) {
    try { return new Date(iso).toLocaleString(); } catch { return iso || "—"; }
}

function renderTeam() {
    const tbody = document.getElementById("teamTbody");
    if (!tbody) return;
    const session = LOAuth.getSession();
    if (!teamMembers.length) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="5">No team members yet.</td></tr>';
        return;
    }
    tbody.innerHTML = teamMembers.map(m => `<tr>
        <td>${esc(m.username)}</td>
        <td class="mono-cell">
          <code>${esc(m.access_code)}</code>
          <button type="button" class="dash-icon-btn copy-code-btn" data-code="${esc(m.access_code)}" title="Copy code"><span class="material-symbols-outlined">content_copy</span></button>
        </td>
        <td><span class="role-pill role-pill--${esc(m.role)}">${esc(m.role)}</span></td>
        <td class="mono-cell">${esc(formatTeamTime(m.created_at))}</td>
        <td class="td-actions">
          <button type="button" class="dash-icon-btn edit-member-btn" data-id="${esc(m.id)}" title="Edit"><span class="material-symbols-outlined">edit</span></button>
          <button type="button" class="dash-icon-btn delete-member-btn" data-id="${esc(m.id)}" title="Delete" ${session && m.id === session.id ? "disabled" : ""}><span class="material-symbols-outlined">person_remove</span></button>
        </td>
      </tr>`).join("");

    tbody.querySelectorAll(".copy-code-btn").forEach(btn => {
        btn.onclick = () => navigator.clipboard.writeText(btn.dataset.code).then(() => toast("Access code copied."));
    });
    tbody.querySelectorAll(".edit-member-btn").forEach(btn => {
        btn.onclick = () => openMemberModal(btn.dataset.id);
    });
    tbody.querySelectorAll(".delete-member-btn").forEach(btn => {
        btn.onclick = async () => {
            const member = teamMembers.find(m => m.id === btn.dataset.id);
            if (!member) return;
            if (!confirm(`Delete account "${member.username}" permanently?`)) return;
            try {
                await LOApi.deleteTeamMember(member.id);
                teamMembers = teamMembers.filter(m => m.id !== member.id);
                renderTeam();
                toast("Account deleted.");
            } catch (err) {
                toast(err.message || "Could not delete account.");
            }
        };
    });
}

function openMemberModal(userId) {
    memberEditId = userId || null;
    const errorEl = document.getElementById("memberError");
    if (errorEl) errorEl.hidden = true;
    document.getElementById("memberModalTitle").textContent = userId ? "Edit account" : "Add tester";
    if (userId) {
        const m = teamMembers.find(x => x.id === userId);
        document.getElementById("memberId").value = m.id;
        document.getElementById("memberUsername").value = m.username;
        document.getElementById("memberCode").value = m.access_code;
        document.getElementById("memberRole").value = m.role;
    } else {
        document.getElementById("memberId").value = "";
        document.getElementById("memberUsername").value = "";
        document.getElementById("memberCode").value = LOApi.generateAccessCode(7);
        document.getElementById("memberRole").value = "tester";
    }
    openModal("memberModal");
}

function revealCode(username, code) {
    document.getElementById("revealUsername").textContent = username;
    document.getElementById("revealCode").textContent = code;
    openModal("codeRevealModal");
}

async function refreshTeam() {
    const session = LOAuth.getSession();
    if (!LOAuth.isTeamLeader(session)) return;
    teamMembers = await LOApi.listTeam();
    renderTeam();
}

function wireTeamUi(session) {
    const manageBtn = document.getElementById("manageTeamBtn");
    const teamPanel = document.getElementById("teamPanel");
    if (!manageBtn || !teamPanel) return;
    if (!LOAuth.isTeamLeader(session)) return;

    manageBtn.hidden = false;
    manageBtn.onclick = () => {
        teamPanel.hidden = !teamPanel.hidden;
        if (!teamPanel.hidden) refreshTeam().catch(err => toast(err.message || "Could not load team."));
    };

    const addMemberBtn = document.getElementById("addMemberBtn");
    if (addMemberBtn) addMemberBtn.onclick = () => openMemberModal(null);
    const regenCodeBtn = document.getElementById("regenCodeBtn");
    if (regenCodeBtn) regenCodeBtn.onclick = () => {
        document.getElementById("memberCode").value = LOApi.generateAccessCode(7);
    };
    const memberCancelBtn = document.getElementById("memberCancelBtn");
    if (memberCancelBtn) memberCancelBtn.onclick = () => closeModal("memberModal");
    const memberForm = document.getElementById("memberForm");
    if (memberForm) {
        memberForm.onsubmit = async e => {
            e.preventDefault();
            const errorEl = document.getElementById("memberError");
            errorEl.hidden = true;
            const username = document.getElementById("memberUsername").value.trim();
            const accessCode = document.getElementById("memberCode").value.trim().toLowerCase();
            const role = document.getElementById("memberRole").value;
            try {
                if (memberEditId) {
                    const updated = await LOApi.updateTeamMember(memberEditId, { username, role, accessCode });
                    const idx = teamMembers.findIndex(m => m.id === memberEditId);
                    if (idx >= 0) teamMembers[idx] = updated;
                    renderTeam();
                    closeModal("memberModal");
                    toast("Account updated.");
                } else {
                    const created = await LOApi.createTeamMember({
                        username,
                        role,
                        accessCode: accessCode || null
                    });
                    teamMembers.push(created);
                    renderTeam();
                    closeModal("memberModal");
                    revealCode(created.username, created.access_code);
                }
            } catch (err) {
                errorEl.textContent = err.message || "Could not save account.";
                errorEl.hidden = false;
            }
        };
    }
    const copyRevealCodeBtn = document.getElementById("copyRevealCodeBtn");
    if (copyRevealCodeBtn) {
        copyRevealCodeBtn.onclick = () => {
            const code = document.getElementById("revealCode").textContent;
            navigator.clipboard.writeText(code).then(() => toast("Access code copied."));
        };
    }
    const revealCloseBtn = document.getElementById("revealCloseBtn");
    if (revealCloseBtn) revealCloseBtn.onclick = () => closeModal("codeRevealModal");
}

// ═══════════════════════════════════════════
// Init
// ═══════════════════════════════════════════
document.addEventListener("DOMContentLoaded", async () => {
    const session = LOAuth.requireSession("./index.html");
    if (!session) return;

    const nameEl = document.getElementById("userChipName");
    if (nameEl) nameEl.textContent = session.username;
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) logoutBtn.onclick = () => LOAuth.logout("./index.html");
    const dashSub = document.getElementById("dashSubtitle");
    if (dashSub) {
        dashSub.textContent = LOAuth.isTeamLeader(session)
            ? "All tasks from every tester"
            : "Only your submitted tasks";
    }

    load();
    await loadTasksFromServer();
    applyDark();
    updateFilterOptions();
    if (document.getElementById("historyTbody")) renderDashboard();
    updateScenariosBadge();
    updateUrl();
    loadNoteForConfig();
    wireTeamUi(session);

    document.querySelectorAll(".nav-btn[data-page]").forEach(btn =>
        btn.addEventListener("click", () => switchPage(btn.dataset.page))
    );

    const hash = (location.hash || "").replace("#", "");
    if (hash === "scenarios" || hash === "test" || hash === "dashboard") {
        switchPage(hash);
    } else {
        switchPage("dashboard");
    }

    window.addEventListener("hashchange", () => {
        const h = (location.hash || "").replace("#", "");
        if (h === "scenarios" || h === "test" || h === "dashboard") switchPage(h);
    });

    document.getElementById("fireBtn").onclick = fireResult;
    document.getElementById("copyUrlBtn").onclick = () => {
        navigator.clipboard.writeText(document.getElementById("generatedUrl").textContent).then(() => toast("URL copied!"));
    };
    document.getElementById("subjectName").onchange = () => { updateUrl(); loadNoteForConfig(); };
    document.getElementById("restOfLink").oninput  = () => { updateUrl(); loadNoteForConfig(); autoDetectSubject(); };

    document.getElementById("clearResultBtn").onclick = () => { clearResultPanelToEmpty(); };
    document.getElementById("toggleResultViewBtn").onclick = () => {
        const card = postMessageCardEl();
        if (card) card.classList.toggle("show-raw");
        syncToggleResultViewBtn();
    };
    const viewFullBtn = document.getElementById("viewFullMsgBtn");
    if (viewFullBtn) {
        viewFullBtn.onclick = () => {
            const t = document.getElementById("resultData").textContent;
            if (!t || !t.trim()) { toast("No message yet."); return; }
            openMsgModal(t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"));
        };
    }

    document.querySelectorAll(".segmented-item[data-qs]").forEach(btn => {
        btn.onclick = () => applyQuickStatus(btn.dataset.qs);
    });

    const saveConfigNoteBtn = document.getElementById("saveConfigNoteBtn");
    if (saveConfigNoteBtn) saveConfigNoteBtn.onclick = saveConfigNote;
    const copyNoteToLastTestBtn = document.getElementById("copyNoteToLastTestBtn");
    if (copyNoteToLastTestBtn) copyNoteToLastTestBtn.onclick = copyNoteToLastTest;

    document.getElementById("startRecBtn2").onclick = startRecording;
    document.getElementById("stopRecBtn2").onclick = stopRecording;
    document.getElementById("addStepBtn").onclick = () => addRecorderStep();
    document.getElementById("stepDescInput").addEventListener("keydown", e => {
        if (e.key === "Enter") addRecorderStep();
    });
    document.getElementById("saveScenarioBtn2").onclick = saveScenario;

    const filterUser = document.getElementById("filterUser");
    if (filterUser) {
        filterUser.onchange = e => { currentFilterUser = e.target.value; renderDashboard(); };
        document.getElementById("filterSubject").onchange = e => { currentFilterSubject = e.target.value; renderDashboard(); };
        document.getElementById("filterStatus").onchange  = e => { currentFilterStatus  = e.target.value; renderDashboard(); };
        document.getElementById("filterSearch").oninput   = e => { currentSearchText    = e.target.value; renderDashboard(); };
        document.getElementById("clearFiltersBtn").onclick = () => {
            currentFilterUser    = "ALL";
            currentFilterSubject = "ALL";
            currentFilterStatus  = "ALL";
            currentSearchText    = "";
            document.getElementById("filterUser").value    = "ALL";
            document.getElementById("filterSubject").value = "ALL";
            document.getElementById("filterStatus").value  = "ALL";
            document.getElementById("filterSearch").value  = "";
            renderDashboard();
        };
    }

    const mainClearBtn = document.getElementById("clearAllBtn");
    if (mainClearBtn) mainClearBtn.onclick = executeContextualClearAll;
    document.querySelectorAll(".clear-all-btn").forEach(btn => { btn.onclick = executeContextualClearAll; });

    const scenFileInput = makeFileInput(f => importScenarios(f), ".json");
    const exportCsvBtn = document.getElementById("exportCsvBtn");
    if (exportCsvBtn) {
        const fileInput = makeFileInput(
            f => importHistoryFile(f).catch(err => toast(err.message || "Import failed.")),
            ".json,.csv,application/json,text/csv"
        );
        exportCsvBtn.onclick = exportCsv;
        document.getElementById("exportJsonBtn").onclick = exportJson;
        const saveLocalBackupBtn = document.getElementById("saveLocalBackupBtn");
        if (saveLocalBackupBtn) saveLocalBackupBtn.onclick = exportJson;
        const uploadJsonBtn = document.getElementById("uploadJsonBtn");
        if (uploadJsonBtn) uploadJsonBtn.onclick = () => fileInput.click();
    }
    document.getElementById("exportScenariosBtn").onclick = exportScenarios;
    document.getElementById("importScenariosBtn").onclick = () => scenFileInput.click();

    syncToggleResultViewBtn();

    ["prm-close", "prm-dismiss"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.onclick = () => document.getElementById("postResultModal").classList.remove("open");
    });
    const postResultSaveBtn = document.getElementById("postResultSaveBtn");
    if (postResultSaveBtn) postResultSaveBtn.onclick = savePostResultAndClose;

    const msgModalClose = document.getElementById("msgModalClose");
    if (msgModalClose) msgModalClose.onclick = () => document.getElementById("msgModal").classList.remove("open");
    const modalSaveBtn = document.getElementById("modalSaveBtn");
    if (modalSaveBtn) {
        modalSaveBtn.onclick = () => {
            if (currentEditingId) {
                const entry = testHistory.find(e => e.id === currentEditingId);
                if (entry) {
                    const note = document.getElementById("modalNoteText").value.trim();
                    entry.note = note;
                    persistTaskPatch(entry, { note });
                }
                document.getElementById("noteModal").classList.remove("open");
                currentEditingId = null;
            }
        };
    }
    const modalCancelBtn = document.getElementById("modalCancelBtn");
    if (modalCancelBtn) {
        modalCancelBtn.onclick = () => {
            document.getElementById("noteModal").classList.remove("open");
            currentEditingId = null;
        };
    }
    const scenarioModalClose = document.getElementById("scenarioModalClose");
    if (scenarioModalClose) scenarioModalClose.onclick = () => document.getElementById("scenarioModal").classList.remove("open");
    document.querySelectorAll(".modal-overlay").forEach(m => {
        m.onclick = e => { if (e.target === m) m.classList.remove("open"); };
    });
});

function makeFileInput(handler, accept) {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = accept;
    inp.style.display = "none";
    inp.onchange = e => {
        if (e.target.files.length) {
            handler(e.target.files[0]);
            inp.value = "";
        }
    };
    document.body.appendChild(inp);
    return inp;
}
