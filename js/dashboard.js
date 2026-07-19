/* Dashboard page: analytics + Manage Team */
(function () {
  let testHistory = [];
  let teamMembers = [];
  let currentEditingId = null;
  let memberEditId = null;
  let currentFilterUser = "ALL";
  let currentFilterSubject = "ALL";
  let currentFilterStatus = "ALL";
  let currentSearchText = "";
  let session = null;

  function toast(msg, dur) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), dur || 2200);
  }

  function esc(s) {
    if (s === null || s === undefined) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function applyDark() {
    if (localStorage.getItem("darkMode") === "1") {
      document.body.classList.add("dark");
      const icon = document.getElementById("darkIcon");
      if (icon) icon.textContent = "light_mode";
      document.getElementById("darkLabel").textContent = "Light mode";
    }
  }

  function toggleDark() {
    document.body.classList.toggle("dark");
    const isDark = document.body.classList.contains("dark");
    localStorage.setItem("darkMode", isDark ? "1" : "0");
    document.getElementById("darkIcon").textContent = isDark ? "light_mode" : "dark_mode";
    document.getElementById("darkLabel").textContent = isDark ? "Light mode" : "Dark mode";
  }

  function openModal(id) {
    document.getElementById(id).classList.add("open");
  }

  function closeModal(id) {
    document.getElementById(id).classList.remove("open");
  }

  function getFiltered() {
    return testHistory.filter(item => {
      if (currentFilterUser !== "ALL" && item.user !== currentFilterUser) return false;
      if (currentFilterSubject !== "ALL" && item.subject !== currentFilterSubject) return false;
      if (currentFilterStatus !== "ALL" && item.status !== currentFilterStatus) return false;
      if (currentSearchText.trim()) {
        const q = currentSearchText.toLowerCase();
        if (
          ![
            item.subject || "",
            item.user || "",
            item.restOfLink || "",
            item.note || "",
            item.fullMessage || "",
            item.scenarioName || ""
          ].some(f => f.toLowerCase().includes(q))
        ) {
          return false;
        }
      }
      return true;
    });
  }

  function updateFilterOptions() {
    const subjects = [...new Set(testHistory.map(h => h.subject).filter(Boolean))].sort();
    const users = [...new Set(testHistory.map(h => h.user).filter(Boolean))].sort();
    const userSel = document.getElementById("filterUser");
    const prevUser = userSel.value;
    userSel.innerHTML =
      '<option value="ALL">All Users</option>' +
      users.map(u => `<option value="${esc(u)}" ${prevUser === u ? "selected" : ""}>${esc(u)}</option>`).join("");
    const sel = document.getElementById("filterSubject");
    const prev = sel.value;
    sel.innerHTML =
      '<option value="ALL">All Subjects</option>' +
      subjects.map(s => `<option value="${esc(s)}" ${prev === s ? "selected" : ""}>${esc(s)}</option>`).join("");
  }

  function formatTime(iso) {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso || "—";
    }
  }

  function renderDashboard() {
    const filtered = getFiltered();
    const total = testHistory.length;
    const subjects = new Set(testHistory.map(h => h.subject).filter(Boolean));
    document.getElementById("statTotal").textContent = total;
    document.getElementById("statSubjects").textContent = subjects.size;
    document.getElementById("statApprove").textContent = testHistory.filter(h => h.status === "Approve").length;
    document.getElementById("statRollback").textContent = testHistory.filter(h => h.status === "Rollback").length;
    document.getElementById("statHold").textContent = testHistory.filter(h => h.status === "Hold").length;
    document.getElementById("statLast").textContent = testHistory[0] ? formatTime(testHistory[0].timestamp) : "—";

    const tbody = document.getElementById("historyTbody");
    if (!filtered.length) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="9">No tasks match the current filters.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered
      .map(item => {
        const msg = (item.fullMessage || "").substring(0, 60);
        return `<tr>
          <td>${esc(item.user)}</td>
          <td class="mono-cell">${esc(formatTime(item.timestamp))}</td>
          <td>${esc(item.subject || "—")}</td>
          <td><span class="dash-link" title="${esc(item.restOfLink)}">${esc(item.restOfLink || "—")}</span></td>
          <td><button type="button" class="dash-icon-btn view-msg-btn" data-msg="${esc(item.fullMessage || "")}" title="View message"><span class="material-symbols-outlined">visibility</span></button> ${esc(msg)}</td>
          <td>${esc(item.scenarioName || "—")}</td>
          <td><span class="status-badge status-badge--${String(item.status || "Hold").toLowerCase()}">${esc(item.status || "Hold")}</span></td>
          <td>${esc(item.note || "—")}</td>
          <td class="td-actions">
            <button type="button" class="dash-icon-btn edit-note-btn" data-id="${esc(item.id)}" title="ADD A TASK"><span class="material-symbols-outlined">edit_note</span></button>
            <button type="button" class="dash-icon-btn del-btn" data-id="${esc(item.id)}" title="Delete"><span class="material-symbols-outlined">delete</span></button>
          </td>
        </tr>`;
      })
      .join("");

    tbody.querySelectorAll(".view-msg-btn").forEach(btn => {
      btn.onclick = () => {
        document.getElementById("msgModalBody").textContent = btn.getAttribute("data-msg") || "";
        openModal("msgModal");
      };
    });
    tbody.querySelectorAll(".edit-note-btn").forEach(btn => {
      btn.onclick = () => {
        currentEditingId = btn.dataset.id;
        const entry = testHistory.find(e => e.id === currentEditingId);
        document.getElementById("modalNoteText").value = entry ? entry.note || "" : "";
        openModal("noteModal");
      };
    });
    tbody.querySelectorAll(".del-btn").forEach(btn => {
      btn.onclick = async () => {
        if (!confirm("Delete this task?")) return;
        try {
          await LOApi.deleteTask(btn.dataset.id);
          testHistory = testHistory.filter(e => e.id !== btn.dataset.id);
          updateFilterOptions();
          renderDashboard();
          toast("Task deleted.");
        } catch (err) {
          toast(err.message || "Could not delete.");
        }
      };
    });
  }

  function renderTeam() {
    const tbody = document.getElementById("teamTbody");
    if (!teamMembers.length) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="5">No team members yet.</td></tr>`;
      return;
    }
    tbody.innerHTML = teamMembers
      .map(m => `<tr>
        <td>${esc(m.username)}</td>
        <td class="mono-cell">
          <code>${esc(m.access_code)}</code>
          <button type="button" class="dash-icon-btn copy-code-btn" data-code="${esc(m.access_code)}" title="Copy code"><span class="material-symbols-outlined">content_copy</span></button>
        </td>
        <td><span class="role-pill role-pill--${esc(m.role)}">${esc(m.role)}</span></td>
        <td class="mono-cell">${esc(formatTime(m.created_at))}</td>
        <td class="td-actions">
          <button type="button" class="dash-icon-btn edit-member-btn" data-id="${esc(m.id)}" title="Edit"><span class="material-symbols-outlined">edit</span></button>
          <button type="button" class="dash-icon-btn delete-member-btn" data-id="${esc(m.id)}" title="Delete" ${m.id === session.id ? "disabled" : ""}><span class="material-symbols-outlined">person_remove</span></button>
        </td>
      </tr>`)
      .join("");

    tbody.querySelectorAll(".copy-code-btn").forEach(btn => {
      btn.onclick = () => {
        navigator.clipboard.writeText(btn.dataset.code).then(() => toast("Access code copied."));
      };
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
    errorEl.hidden = true;
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

  async function refreshTasks() {
    testHistory = await LOApi.listTasks();
    updateFilterOptions();
    renderDashboard();
  }

  async function refreshTeam() {
    if (!LOAuth.isTeamLeader(session)) return;
    teamMembers = await LOApi.listTeam();
    renderTeam();
  }

  function exportCsv() {
    const rows = getFiltered();
    if (!rows.length) {
      toast("Nothing to export.");
      return;
    }
    const header = ["User", "Time", "Subject", "Link", "Status", "Scenario", "Note", "URL"];
    const lines = [header.join(",")].concat(
      rows.map(i =>
        [i.user, i.timestamp, i.subject, i.restOfLink, i.status, i.scenarioName, i.note, i.fullUrl]
          .map(v => `"${String(v || "").replace(/"/g, '""')}"`)
          .join(",")
      )
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a.download = "lo-tasks.csv";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("CSV exported.");
  }

  function exportJson() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(getFiltered(), null, 2)], { type: "application/json" }));
    a.download = "lo-tasks.json";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("JSON exported.");
  }

  document.addEventListener("DOMContentLoaded", async () => {
    session = LOAuth.requireSession("./index.html");
    if (!session) return;

    document.getElementById("userChipName").textContent = session.username;
    document.getElementById("dashSubtitle").textContent = LOAuth.isTeamLeader(session)
      ? "All tasks from every tester"
      : "Only your submitted tasks";

    applyDark();
    document.getElementById("darkToggleBtn").onclick = toggleDark;
    document.getElementById("logoutBtn").onclick = () => LOAuth.logout("./index.html");

    const manageBtn = document.getElementById("manageTeamBtn");
    const teamPanel = document.getElementById("teamPanel");
    if (LOAuth.isTeamLeader(session)) {
      manageBtn.hidden = false;
      manageBtn.onclick = () => {
        teamPanel.hidden = !teamPanel.hidden;
        if (!teamPanel.hidden) refreshTeam().catch(err => toast(err.message || "Could not load team."));
      };
    }

    try {
      await refreshTasks();
    } catch (err) {
      toast(err.message || "Could not load tasks.");
    }

    document.getElementById("filterUser").onchange = e => {
      currentFilterUser = e.target.value;
      renderDashboard();
    };
    document.getElementById("filterSubject").onchange = e => {
      currentFilterSubject = e.target.value;
      renderDashboard();
    };
    document.getElementById("filterStatus").onchange = e => {
      currentFilterStatus = e.target.value;
      renderDashboard();
    };
    document.getElementById("filterSearch").oninput = e => {
      currentSearchText = e.target.value;
      renderDashboard();
    };
    document.getElementById("clearFiltersBtn").onclick = () => {
      currentFilterUser = "ALL";
      currentFilterSubject = "ALL";
      currentFilterStatus = "ALL";
      currentSearchText = "";
      document.getElementById("filterUser").value = "ALL";
      document.getElementById("filterSubject").value = "ALL";
      document.getElementById("filterStatus").value = "ALL";
      document.getElementById("filterSearch").value = "";
      renderDashboard();
    };

    document.getElementById("exportCsvBtn").onclick = exportCsv;
    document.getElementById("exportJsonBtn").onclick = exportJson;
    document.getElementById("clearAllBtn").onclick = async () => {
      if (!confirm("Delete all tasks you can access?")) return;
      try {
        await LOApi.clearTasks();
        await refreshTasks();
        toast("Tasks cleared.");
      } catch (err) {
        toast(err.message || "Could not clear.");
      }
    };

    document.getElementById("addMemberBtn").onclick = () => openMemberModal(null);
    document.getElementById("regenCodeBtn").onclick = () => {
      document.getElementById("memberCode").value = LOApi.generateAccessCode(7);
    };
    document.getElementById("memberCancelBtn").onclick = () => closeModal("memberModal");
    document.getElementById("memberForm").onsubmit = async e => {
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

    document.getElementById("copyRevealCodeBtn").onclick = () => {
      const code = document.getElementById("revealCode").textContent;
      navigator.clipboard.writeText(code).then(() => toast("Access code copied."));
    };
    document.getElementById("revealCloseBtn").onclick = () => closeModal("codeRevealModal");
    document.getElementById("msgModalClose").onclick = () => closeModal("msgModal");
    document.getElementById("modalCancelBtn").onclick = () => {
      closeModal("noteModal");
      currentEditingId = null;
    };
    document.getElementById("modalSaveBtn").onclick = async () => {
      if (!currentEditingId) return;
      const entry = testHistory.find(e => e.id === currentEditingId);
      if (!entry) return;
      const note = document.getElementById("modalNoteText").value.trim();
      try {
        const updated = await LOApi.updateTask(entry.id, { note });
        Object.assign(entry, updated);
        closeModal("noteModal");
        currentEditingId = null;
        renderDashboard();
        toast("Task updated.");
      } catch (err) {
        toast(err.message || "Could not save.");
      }
    };

    document.querySelectorAll(".modal-overlay").forEach(m => {
      m.onclick = e => {
        if (e.target === m) m.classList.remove("open");
      };
    });
  });
})();
