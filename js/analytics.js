/* Team Leader analytics — KPI cards, ranking chart, ranking table */
(function (global) {
  const TOP_N = 10;
  let showAll = false;
  let lastPayload = null;
  let rangeLabel = "All time";
  let loading = false;

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function endOfDay(d) {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  }

  function resolveRange(preset) {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    switch (preset) {
      case "today":
        return { from: todayStart, to: todayEnd, label: "Today" };
      case "7d": {
        const from = startOfDay(new Date(now));
        from.setDate(from.getDate() - 6);
        return { from, to: todayEnd, label: "Last 7 days" };
      }
      case "30d": {
        const from = startOfDay(new Date(now));
        from.setDate(from.getDate() - 29);
        return { from, to: todayEnd, label: "Last 30 days" };
      }
      case "month": {
        const from = new Date(now.getFullYear(), now.getMonth(), 1);
        return { from: startOfDay(from), to: todayEnd, label: "Current month" };
      }
      case "custom": {
        const fromEl = document.getElementById("analyticsFrom");
        const toEl = document.getElementById("analyticsTo");
        const fromVal = fromEl && fromEl.value ? startOfDay(fromEl.value) : null;
        const toVal = toEl && toEl.value ? endOfDay(toEl.value) : null;
        if (!fromVal || !toVal) return { from: null, to: null, label: "Custom range", invalid: true };
        if (fromVal > toVal) return { from: null, to: null, label: "Custom range", invalid: true };
        const fmt = (d) => d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
        return { from: fromVal, to: toVal, label: `${fmt(fromVal)} – ${fmt(toVal)}` };
      }
      case "all":
      default:
        return { from: null, to: null, label: "All time" };
    }
  }

  function setState(kind, message) {
    const el = document.getElementById("analyticsState");
    const body = document.getElementById("analyticsBody");
    if (!el || !body) return;
    if (!kind) {
      el.hidden = true;
      el.innerHTML = "";
      body.hidden = false;
      return;
    }
    body.hidden = true;
    el.hidden = false;
    const icons = { loading: "progress_activity", empty: "inbox", error: "error", forbidden: "lock" };
    el.innerHTML = `
      <div class="analytics-state analytics-state--${esc(kind)}" role="status">
        <span class="material-symbols-outlined" aria-hidden="true">${icons[kind] || "info"}</span>
        <p>${esc(message || "")}</p>
      </div>`;
  }

  function renderKpis(summary) {
    const s = summary || {};
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val == null || val === "" ? "—" : String(val);
    };
    set("kpiTotalLos", s.total_los ?? 0);
    set("kpiActiveTesters", s.active_testers ?? 0);
    set("kpiTopTester", s.top_tester || "—");
    set("kpiAvgLos", s.avg_los != null ? s.avg_los : "—");
  }

  function renderSubjectOptions(subjects) {
    const sel = document.getElementById("analyticsSubject");
    if (!sel) return;
    const current = sel.value || "ALL";
    const opts = ['<option value="ALL">All subjects</option>']
      .concat((subjects || []).map((s) => `<option value="${esc(s)}">${esc(s)}</option>`));
    sel.innerHTML = opts.join("");
    if ([...sel.options].some((o) => o.value === current)) sel.value = current;
  }

  function renderChart(rows) {
    const host = document.getElementById("analyticsChart");
    if (!host) return;
    const list = rows || [];
    if (!list.length) {
      host.innerHTML = `<div class="analytics-chart-empty">No LOS data for this range.</div>`;
      return;
    }
    const max = Math.max(...list.map((r) => Number(r.los_count) || 0), 1);
    host.innerHTML = `
      <div class="analytics-bars" role="img" aria-label="Tester LOS ranking chart">
        ${list.map((r, i) => {
          const pct = Math.max(2, Math.round(((Number(r.los_count) || 0) / max) * 100));
          const top = i === 0;
          const tip = `${r.tester}: ${r.los_count} LOS · ${rangeLabel}`;
          return `
            <div class="analytics-bar-row${top ? " is-top" : ""}" title="${esc(tip)}">
              <div class="analytics-bar-label" title="${esc(r.tester)}">${esc(r.tester)}</div>
              <div class="analytics-bar-track">
                <div class="analytics-bar-fill" style="width:${pct}%"></div>
              </div>
              <div class="analytics-bar-value">${esc(r.los_count)}</div>
            </div>`;
        }).join("")}
      </div>`;
  }

  function renderTable(rows) {
    const tbody = document.getElementById("analyticsRankTbody");
    if (!tbody) return;
    if (!rows || !rows.length) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No ranking data for the selected filters.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map((r) => `
      <tr class="analytics-rank-row">
        <td>${esc(r.rank)}</td>
        <td>${esc(r.tester)}</td>
        <td>${esc(r.los_count)}</td>
        <td>${esc(r.approved)}</td>
        <td>${esc(r.pending)}</td>
        <td>${esc(r.rollbacks)}</td>
      </tr>`).join("");
  }

  function updateToggle(total) {
    const btn = document.getElementById("analyticsShowAllBtn");
    if (!btn) return;
    if (total <= TOP_N) {
      btn.hidden = true;
      return;
    }
    btn.hidden = false;
    btn.textContent = showAll ? `Show top ${TOP_N}` : `View all (${total})`;
  }

  function paint(payload) {
    lastPayload = payload;
    const ranking = Array.isArray(payload?.ranking) ? payload.ranking : [];
    renderKpis(payload?.summary);
    renderSubjectOptions(payload?.subjects);
    const visible = showAll ? ranking : ranking.slice(0, TOP_N);
    renderChart(visible);
    renderTable(visible);
    updateToggle(ranking.length);
    const rangeEl = document.getElementById("analyticsRangeLabel");
    if (rangeEl) rangeEl.textContent = rangeLabel;
  }

  async function loadAnalytics() {
    if (!global.LOAuth || !LOAuth.isTeamLeader()) {
      setState("forbidden", "Team Leader access required. Analytics are not available for your role.");
      return;
    }
    const preset = document.getElementById("analyticsPreset")?.value || "30d";
    const customWrap = document.getElementById("analyticsCustomRange");
    if (customWrap) customWrap.hidden = preset !== "custom";

    const range = resolveRange(preset);
    rangeLabel = range.label;
    if (range.invalid) {
      setState("error", "Select a valid custom date range.");
      return;
    }

    const subjectSel = document.getElementById("analyticsSubject");
    const subject = subjectSel && subjectSel.value !== "ALL" ? subjectSel.value : null;

    loading = true;
    setState("loading", "Loading team analytics…");
    try {
      const data = await LOApi.teamAnalytics({
        from: range.from ? range.from.toISOString() : null,
        to: range.to ? range.to.toISOString() : null,
        subject
      });
      loading = false;
      if (!data) {
        setState("error", "No analytics response.");
        return;
      }
      setState(null);
      paint(data);
      if (!Array.isArray(data.ranking) || data.ranking.length === 0) {
        const chart = document.getElementById("analyticsChart");
        if (chart) chart.innerHTML = `<div class="analytics-chart-empty">No LOS work found for the selected filters.</div>`;
      }
    } catch (err) {
      loading = false;
      const msg = String(err?.message || err || "");
      if (/forbidden|42501|team_leader/i.test(msg)) {
        setState("forbidden", "Access denied. Team Leader role is required.");
      } else {
        setState("error", msg || "Could not load analytics.");
      }
    }
  }

  function wireAnalyticsUi() {
    const preset = document.getElementById("analyticsPreset");
    const subject = document.getElementById("analyticsSubject");
    const from = document.getElementById("analyticsFrom");
    const to = document.getElementById("analyticsTo");
    const apply = document.getElementById("analyticsApplyBtn");
    const showAllBtn = document.getElementById("analyticsShowAllBtn");

    if (preset) {
      preset.onchange = () => {
        const customWrap = document.getElementById("analyticsCustomRange");
        if (customWrap) customWrap.hidden = preset.value !== "custom";
        if (preset.value !== "custom") loadAnalytics();
      };
    }
    if (subject) subject.onchange = () => loadAnalytics();
    if (apply) apply.onclick = () => loadAnalytics();
    if (from) from.onchange = () => { if (preset?.value === "custom") loadAnalytics(); };
    if (to) to.onchange = () => { if (preset?.value === "custom") loadAnalytics(); };
    if (showAllBtn) {
      showAllBtn.onclick = () => {
        showAll = !showAll;
        if (lastPayload) paint(lastPayload);
      };
    }
  }

  global.LOAnalytics = {
    loadAnalytics,
    wireAnalyticsUi,
    isLoading: () => loading
  };
})(window);
