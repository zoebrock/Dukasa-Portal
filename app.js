const CONFIG = {
  // Replace with your deployed Apps Script backend later.
  APPS_SCRIPT_BASE_URL: "PASTE_YOUR_APPS_SCRIPT_BACKEND_URL_HERE",
  USE_MOCK_DATA: true,
};

const state = {
  currentView: "home",
  user: {
    name: "Zoe",
    initials: "ZB",
    role: "Admin Assistant",
  },
  data: null,
};

const mockData = {
  home: {
    dateLabel: "Sunday 19 April",
    localTime: "04:30 pm",
    todaySummary: "No shift scheduled today.",
    week: [
      { day: "Mon", num: 13 },
      { day: "Tue", num: 14 },
      { day: "Wed", num: 15, flagged: true },
      { day: "Thu", num: 16, flagged: true },
      { day: "Fri", num: 17, flagged: true },
      { day: "Sat", num: 18 },
      { day: "Sun", num: 19, active: true },
    ],
    upcomingShifts: [
      { title: "Mon, 20 Apr", copy: "08:00 – 17:00 · 30min break", hours: "8.5h" },
      { title: "Tue, 21 Apr", copy: "08:00 – 17:00 · 30min break", hours: "8.5h" },
      { title: "Wed, 22 Apr", copy: "08:00 – 17:00 · 30min break", hours: "8.5h" },
      { title: "Thu, 23 Apr", copy: "08:00 – 17:00 · 30min break", hours: "8.5h" },
    ],
  },
  roster: {
    range: "13 Apr – 19 Apr 2026",
    days: [
      { dow: "Mon", num: 13, status: "08:00–19:00", meta: "10.5 hrs · 30m break" },
      { dow: "Tue", num: 14, status: "Off", muted: true },
      { dow: "Wed", num: 15, status: "Sick", badge: "red" },
      { dow: "Thu", num: 16, status: "Sick", badge: "red" },
      { dow: "Fri", num: 17, status: "Sick", badge: "red" },
      { dow: "Sat", num: 18, status: "Off", muted: true },
      { dow: "Sun", num: 19, status: "Off", muted: true },
    ],
  },
  leave: {
    pending: [],
    history: [
      { title: "Annual Leave", copy: "16 Apr – 17 Apr", badgeText: "Declined", badgeClass: "badge-red" },
      { title: "Annual Leave", copy: "16 Apr – 16 Apr", badgeText: "Declined", badgeClass: "badge-red" },
    ],
    sickDays: [
      "Sick day — 16 Apr",
      "Sick day — 15 Apr",
      "Sick day — 17 Apr",
      "Sick day — 20 Apr",
    ],
  },
  ot: {
    requests: [
      { title: "Friday 26 April", copy: "18:00 – 20:00", badgeText: "Pending", badgeClass: "badge-amber" },
      { title: "Wednesday 24 April", copy: "17:00 – 18:30", badgeText: "Approved", badgeClass: "badge-green" },
    ],
  },
  hours: {
    totalThisWeek: "34.0h",
    totalThisMonth: "122.5h",
    upcoming: "8.5h",
    notes: "Hours are shown as a frontend example. Once your Apps Script backend is connected, these can be populated live.",
  },
  profile: {
    email: "zoe@example.com",
    location: "Melbourne",
    team: "Dukasa Dispensary",
  },
};

function qs(sel, root = document) {
  return root.querySelector(sel);
}

function qsa(sel, root = document) {
  return [...root.querySelectorAll(sel)];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function apiGet(action) {
  if (CONFIG.USE_MOCK_DATA) return mockData[action];
  if (!CONFIG.APPS_SCRIPT_BASE_URL || CONFIG.APPS_SCRIPT_BASE_URL.includes("PASTE_YOUR_APPS_SCRIPT_BACKEND_URL_HERE")) {
    throw new Error("Apps Script backend URL is not configured.");
  }
  const url = new URL(CONFIG.APPS_SCRIPT_BASE_URL);
  url.searchParams.set("action", action);
  const res = await fetch(url.toString(), { method: "GET" });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

async function apiPost(action, payload) {
  if (CONFIG.USE_MOCK_DATA) {
    return { ok: true, action, payload };
  }
  const res = await fetch(CONFIG.APPS_SCRIPT_BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

function renderWeekStrip(week = []) {
  return `
    <div class="week-strip">
      ${week.map(day => `
        <div class="week-pill ${day.active ? "active" : ""}">
          <span class="week-pill-name">${escapeHtml(day.day)}</span>
          <span class="week-pill-num">${escapeHtml(day.num)}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderHome(data) {
  qs("#view-home").innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Hello, ${escapeHtml(state.user.name)}! 👋</h1>
        <div class="page-subtitle">${escapeHtml(data.dateLabel)}</div>
      </div>
      <div class="hero-time">
        <div class="hero-time-big">${escapeHtml(data.localTime)}</div>
        <div class="hero-time-small">local time</div>
      </div>
    </div>

    <div class="card card-soft card-compact">${escapeHtml(data.todaySummary)}</div>

    <div class="section-label">This week at a glance</div>
    ${renderWeekStrip(data.week)}

    <div class="card card-compact" style="margin-top:12px;">No shift today</div>

    <div class="section-label">Upcoming shifts</div>
    <div class="info-grid">
      ${data.upcomingShifts.map(item => `
        <div class="card list-card">
          <div>
            <div class="list-title">${escapeHtml(item.title)}</div>
            <div class="list-copy">${escapeHtml(item.copy)}</div>
          </div>
          <div class="list-meta">${escapeHtml(item.hours)}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderRoster(data) {
  qs("#view-roster").innerHTML = `
    <div class="page-header stack">
      <h1 class="page-title">My roster</h1>
      <div class="page-subtitle">${escapeHtml(data.range)}</div>
      <div class="btn-row" style="margin-top:14px;">
        <button class="btn btn-secondary btn-sm">‹ Previous week</button>
        <button class="btn btn-secondary btn-sm">Next week ›</button>
      </div>
    </div>

    <div class="info-grid">
      ${data.days.map(day => `
        <div class="card list-card ${day.badge === "red" ? "" : ""}" style="border-color:${day.badge === "red" ? "#d14b4b" : "var(--border)"}; background:${day.badge === "red" ? "#fff3f3" : "var(--surface-solid)"};">
          <div class="split-row" style="align-items:flex-start; width:100%;">
            <div style="display:flex; gap:16px; align-items:flex-start;">
              <div style="min-width:42px; text-align:center;">
                <div class="small-muted" style="font-weight:700; text-transform:uppercase;">${escapeHtml(day.dow)}</div>
                <div style="font-size:1.8rem; font-weight:800; line-height:1; margin-top:6px; color:${day.dow === "Sun" ? "var(--purple)" : "var(--text)"};">${escapeHtml(day.num)}</div>
              </div>
              <div>
                <div class="list-title" style="font-size:1.15rem;">${escapeHtml(day.status)}</div>
                ${day.meta ? `<div class="list-copy">${escapeHtml(day.meta)}</div>` : ``}
              </div>
            </div>
          </div>
        </div>
      `).join("")}
    </div>

    <div class="section-label">Also working today</div>
    <div class="helper-note">No colleagues on shift today.</div>
  `;
}

function renderLeave(data) {
  qs("#view-leave").innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Leave</h1>
      </div>
      <button class="btn btn-primary" id="requestLeaveBtn">+ Request leave</button>
    </div>

    <div class="section-label">Pending requests</div>
    ${data.pending.length ? data.pending.map(item => renderListHistory(item)).join("") : `<div class="helper-note">No pending requests.</div>`}

    <div class="section-label">History</div>
    <div class="info-grid">
      ${data.history.map(item => renderListHistory(item)).join("")}
    </div>

    <div class="section-label">Sick days & medical certificates</div>
    <div class="info-grid">
      ${data.sickDays.map(title => `
        <div class="card list-card">
          <div>
            <div class="list-title" style="font-size:1.18rem;">${escapeHtml(title)}</div>
            <div class="inline-status">✓ Uploaded 17/4/2026</div>
          </div>
          <span class="badge badge-green">MC uploaded</span>
        </div>
      `).join("")}
    </div>
  `;

  const requestBtn = qs("#requestLeaveBtn");
  if (requestBtn) requestBtn.addEventListener("click", openLeaveRequestForm);
}

function renderListHistory(item) {
  return `
    <div class="card list-card">
      <div>
        <div class="list-title" style="font-size:1.18rem;">${escapeHtml(item.title)}</div>
        <div class="list-copy">${escapeHtml(item.copy)}</div>
      </div>
      <span class="badge ${escapeHtml(item.badgeClass)}">${escapeHtml(item.badgeText)}</span>
    </div>
  `;
}

function renderOT(data) {
  qs("#view-ot").innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Overtime</h1>
        <div class="page-subtitle">Submit and review overtime requests.</div>
      </div>
      <button class="btn btn-primary" id="requestOtBtn">+ Request OT</button>
    </div>

    <div class="info-grid">
      ${data.requests.map(item => renderListHistory(item)).join("")}
    </div>
  `;

  const requestOtBtn = qs("#requestOtBtn");
  if (requestOtBtn) requestOtBtn.addEventListener("click", openOTForm);
}

function renderHours(data) {
  qs("#view-hours").innerHTML = `
    <div class="page-header stack">
      <h1 class="page-title">Hours</h1>
      <div class="page-subtitle">A simple summary of rostered and recorded hours.</div>
    </div>

    <div class="kpis">
      <div class="kpi">
        <div class="kpi-label">This week</div>
        <div class="kpi-value">${escapeHtml(data.totalThisWeek)}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">This month</div>
        <div class="kpi-value">${escapeHtml(data.totalThisMonth)}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Upcoming</div>
        <div class="kpi-value">${escapeHtml(data.upcoming)}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Status</div>
        <div class="kpi-value" style="font-size:1.1rem;">Synced</div>
      </div>
    </div>

    <div class="card" style="margin-top:16px;">
      <div class="helper-note">${escapeHtml(data.notes)}</div>
    </div>
  `;
}

function renderProfile(data) {
  qs("#view-profile").innerHTML = `
    <div class="page-header stack">
      <h1 class="page-title">Profile</h1>
      <div class="page-subtitle">A frontend-ready profile screen.</div>
    </div>

    <div class="info-grid">
      <div class="card">
        <div class="list-title" style="font-size:1.18rem;">${escapeHtml(state.user.name)}</div>
        <div class="list-copy">${escapeHtml(state.user.role)}</div>
      </div>
      <div class="card">
        <div class="small-muted">Email</div>
        <div class="list-title" style="font-size:1.08rem; margin-top:8px;">${escapeHtml(data.email)}</div>
      </div>
      <div class="card">
        <div class="small-muted">Location</div>
        <div class="list-title" style="font-size:1.08rem; margin-top:8px;">${escapeHtml(data.location)}</div>
      </div>
      <div class="card">
        <div class="small-muted">Team</div>
        <div class="list-title" style="font-size:1.08rem; margin-top:8px;">${escapeHtml(data.team)}</div>
      </div>
    </div>
  `;
}

function openLeaveRequestForm() {
  qs("#view-leave").innerHTML += `
    <div class="card" id="leaveFormCard" style="margin-top:16px;">
      <div class="list-title" style="font-size:1.28rem; margin-bottom:12px;">New leave request</div>
      <form id="leaveForm" class="form-grid">
        <div class="input-wrap"><label>Leave type</label><select class="select" name="leaveType"><option>Annual Leave</option><option>Sick Leave</option><option>Personal Leave</option></select></div>
        <div class="input-wrap"><label>From</label><input class="input" name="from" type="date" required></div>
        <div class="input-wrap"><label>To</label><input class="input" name="to" type="date" required></div>
        <div class="input-wrap full-span"><label>Notes</label><textarea class="textarea" name="notes" placeholder="Add any context here"></textarea></div>
        <div class="btn-row full-span"><button class="btn btn-primary" type="submit">Submit request</button></div>
      </form>
    </div>
  `;

  const form = qs("#leaveForm");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    await apiPost("submitLeaveRequest", payload);
    alert("Leave request submitted.");
  }, { once: true });
}

function openOTForm() {
  qs("#view-ot").innerHTML += `
    <div class="card" id="otFormCard" style="margin-top:16px;">
      <div class="list-title" style="font-size:1.28rem; margin-bottom:12px;">New overtime request</div>
      <form id="otForm" class="form-grid">
        <div class="input-wrap"><label>Date</label><input class="input" name="date" type="date" required></div>
        <div class="input-wrap"><label>From</label><input class="input" name="start" type="time" required></div>
        <div class="input-wrap"><label>To</label><input class="input" name="end" type="time" required></div>
        <div class="input-wrap full-span"><label>Reason</label><textarea class="textarea" name="reason" placeholder="Why is OT required?"></textarea></div>
        <div class="btn-row full-span"><button class="btn btn-primary" type="submit">Submit OT request</button></div>
      </form>
    </div>
  `;

  const form = qs("#otForm");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    await apiPost("submitOTRequest", payload);
    alert("OT request submitted.");
  }, { once: true });
}

async function loadAllViews() {
  const [home, roster, leave, ot, hours, profile] = await Promise.all([
    apiGet("home"),
    apiGet("roster"),
    apiGet("leave"),
    apiGet("ot"),
    apiGet("hours"),
    apiGet("profile"),
  ]);

  state.data = { home, roster, leave, ot, hours, profile };
  renderHome(home);
  renderRoster(roster);
  renderLeave(leave);
  renderOT(ot);
  renderHours(hours);
  renderProfile(profile);
  applyEntranceAnimations(qs(`#view-${state.currentView}`));
  syncTopbarState();
}



function applyEntranceAnimations(root = document) {
  const selectors = [".page-header", ".card", ".kpi", ".week-strip", ".btn-row"];
  const nodes = selectors.flatMap(sel => qsa(sel, root));
  nodes.forEach((node, index) => {
    node.classList.remove("fade-in-up", "delay-1", "delay-2", "delay-3", "delay-4");
    // force reflow so repeated view switches replay gently
    void node.offsetWidth;
    node.classList.add("fade-in-up");
    const delayClass = `delay-${Math.min((index % 4) + 1, 4)}`;
    if (!node.classList.contains("page-header")) node.classList.add(delayClass);
  });
}

function syncTopbarState() {
  const topbar = qs(".topbar");
  if (!topbar) return;
  const scrolled = window.scrollY > 8;
  topbar.style.background = scrolled ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.82)";
  topbar.style.boxShadow = scrolled ? "0 10px 28px rgba(16,24,40,0.05)" : "0 1px 0 rgba(255,255,255,0.45)";
  topbar.style.borderBottomColor = scrolled ? "rgba(24,24,22,0.06)" : "rgba(24,24,22,0.08)";
}


function switchView(viewName) {
  state.currentView = viewName;
  qsa(".view").forEach(view => {
    view.classList.toggle("active", view.id === `view-${viewName}`);
  });
  qsa(".tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.view === viewName);
  });
  const activeView = qs(`#view-${viewName}`);
  applyEntranceAnimations(activeView);
  window.scrollTo({ top: 0, behavior: "smooth" });
  syncTopbarState();
}

function attachEvents() {
  qsa(".tab").forEach(tab => {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  });

  qs("#signOutBtn")?.addEventListener("click", () => {
    alert("Connect this button to your own auth flow.");
  });

  window.addEventListener("scroll", syncTopbarState, { passive: true });
}

async function init() {
  qs("#avatarInitials").textContent = state.user.initials;
  attachEvents();
  try {
    await loadAllViews();
    applyEntranceAnimations(qs(`#view-${state.currentView}`));
  } catch (err) {
    console.error(err);
    qs("#view-home").innerHTML = `
      <div class="card">
        <div class="list-title" style="font-size:1.2rem;">Couldn’t load portal data</div>
        <div class="helper-note" style="margin-top:10px;">${escapeHtml(err.message)}</div>
      </div>
    `;
  }
}

init();
