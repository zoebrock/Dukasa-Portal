// ============================================================
//  Dukasa Staff Portal — Vercel App
//  Connects to Google Apps Script backend via JSON API
// ============================================================

const CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbw7x3V1dsrpZDVNyEwv1xflFEx2bOqDpL-gw5ZQnwAQxOywz0d3PD1WntJxrlS0EFC5/exec',
  API_KEY: '181049d1-b062-448a-a267-64824f1ef054',
};

// ── STATE ───────────────────────────────────────────────────
const state = {
  currentView: 'home',
  emp: null,          // logged-in staff member object
  allData: {},        // raw rx3_ data from GAS
  currentWeekStart: null,
  refreshTimer: null,
};

// ── HELPERS ─────────────────────────────────────────────────
function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return [...root.querySelectorAll(sel)]; }
function esc(v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function today() { return new Date().toISOString().split('T')[0]; }
function FD(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-AU', {weekday:'long', day:'numeric', month:'long', year:'numeric'});
}
function FDS(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-AU', {day:'numeric', month:'short'});
}
function FDOW(iso) {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', {weekday:'long'});
}
function parseTime(t) { if (!t) return 0; const [h,m]=t.split(':').map(Number); return h*60+m; }
function shiftHours(s) { return Math.max(0, (parseTime(s.end) - parseTime(s.start) - (s.breakMin||0)) / 60); }
function weekStart(offset = 0) {
  const d = new Date(); d.setHours(0,0,0,0);
  const dow = d.getDay(); const diff = (dow === 0 ? -6 : 1 - dow) + offset * 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}
function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}
function toast(msg, type = 'info', duration = 3500) {
  let el = qs('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);padding:12px 20px;border-radius:12px;font-size:14px;font-weight:600;color:#fff;z-index:9999;max-width:320px;text-align:center;pointer-events:none;transition:opacity .3s';
    document.body.appendChild(el);
  }
  const colours = {info:'#534AB7', success:'#0F6E56', error:'#A32D2D', warning:'#BA7517'};
  el.style.background = colours[type] || colours.info;
  el.style.opacity = '1';
  el.textContent = msg;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, duration);
}

// ── DATA ACCESS ─────────────────────────────────────────────
function getList(key) {
  try { return JSON.parse(state.allData['rx3_' + key] || '[]'); } catch(e) { return []; }
}

// ── GAS API ─────────────────────────────────────────────────
async function gasGet(action, params = {}) {
  const url = new URL(CONFIG.GAS_URL);
  url.searchParams.set('action', action);
  url.searchParams.set('key', CONFIG.API_KEY);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Server error ' + res.status);
  const text = await res.text();
  try { return JSON.parse(text); }
  catch(e) { throw new Error('Bad response from server — check GAS URL is correct'); }
}

async function gasPost(body) {
  // Must use Content-Type: text/plain to avoid CORS preflight OPTIONS request.
  // GAS does not support OPTIONS responses, so application/json would be blocked.
  const res = await fetch(CONFIG.GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ ...body, key: CONFIG.API_KEY }),
  });
  if (!res.ok) throw new Error('GAS POST failed: ' + res.status);
  const text = await res.text();
  try { return JSON.parse(text); } catch(e) { return { ok: false, error: 'Bad response: ' + text.slice(0, 100) }; }
}

async function saveList(key, arr) {
  return gasPost({ action: 'set', dataKey: 'rx3_' + key, value: JSON.stringify(arr) });
}

// ── AUTH — PIN LOGIN ─────────────────────────────────────────
function showLogin() {
  document.body.innerHTML = `
    <div style="min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f5f5f3;padding:24px">
      <div style="width:100%;max-width:360px">
        <div style="text-align:center;margin-bottom:32px">
          <div style="font-size:32px;margin-bottom:8px">💊</div>
          <div style="font-size:22px;font-weight:800;color:#181816;letter-spacing:-.5px">Dukasa Staff Portal</div>
          <div style="font-size:14px;color:#98988f;margin-top:4px">Sign in to continue</div>
        </div>
        <div id="login-err" style="display:none;background:#fef2f2;border:1px solid #fca5a5;border-radius:10px;padding:10px 14px;font-size:13px;color:#991b1b;margin-bottom:16px;text-align:center"></div>
        <div style="background:#fff;border-radius:16px;padding:24px;box-shadow:0 2px 12px rgba(0,0,0,.06);border:1px solid #e5e5e0">
          <div style="margin-bottom:16px">
            <label style="font-size:12px;font-weight:700;color:#58584e;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:6px">Email</label>
            <input id="login-email" type="email" autocomplete="email" placeholder="your@email.com"
              style="width:100%;padding:12px 14px;border:1.5px solid #dddcd5;border-radius:10px;font-size:15px;background:#fafaf8;color:#181816;outline:none;box-sizing:border-box">
          </div>
          <div style="margin-bottom:20px">
            <label style="font-size:12px;font-weight:700;color:#58584e;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:6px">PIN</label>
            <input id="login-pin" type="password" inputmode="numeric" maxlength="6" placeholder="••••"
              style="width:100%;padding:12px 14px;border:1.5px solid #dddcd5;border-radius:10px;font-size:20px;letter-spacing:6px;background:#fafaf8;color:#181816;outline:none;box-sizing:border-box">
          </div>
          <button id="login-btn" onclick="doLogin()"
            style="width:100%;padding:14px;background:#534AB7;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;letter-spacing:-.2px">
            Sign in
          </button>
        </div>
        <div style="text-align:center;margin-top:16px;font-size:12px;color:#98988f">
          Contact your manager if you have forgotten your PIN.
        </div>
      </div>
    </div>
  `;
  qs('#login-pin').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  qs('#login-email').addEventListener('keydown', e => { if (e.key === 'Enter') qs('#login-pin').focus(); });
}

async function doLogin() {
  const email = (qs('#login-email').value || '').trim().toLowerCase();
  const pin = (qs('#login-pin').value || '').trim();
  const errEl = qs('#login-err');
  const btn = qs('#login-btn');
  if (!email || !pin) { errEl.style.display = 'block'; errEl.textContent = 'Please enter your email and PIN.'; return; }
  btn.textContent = 'Signing in...'; btn.disabled = true;
  errEl.style.display = 'none';
  try {
    const result = await gasGet('getAll');
    if (!result.ok) throw new Error(result.error || 'Could not load data');
    state.allData = result.data || {};
    const staff = getList('staff');
    const emp = staff.find(s =>
      (s.email || '').toLowerCase() === email && String(s.pin || '') === String(pin)
    );
    if (!emp) {
      errEl.style.display = 'block';
      errEl.textContent = 'Incorrect email or PIN. Please try again.';
      btn.textContent = 'Sign in'; btn.disabled = false;
      return;
    }
    state.emp = emp;
    localStorage.setItem('dukasa_session', JSON.stringify({ id: emp.id, email: emp.email, ts: Date.now() }));
    initApp();
  } catch(err) {
    errEl.style.display = 'block';
    errEl.textContent = 'Could not connect: ' + err.message;
    btn.textContent = 'Sign in'; btn.disabled = false;
    console.error(err);
  }
}

function tryRestoreSession() {
  try {
    const s = JSON.parse(localStorage.getItem('dukasa_session') || 'null');
    if (!s) return false;
    // Session expires after 12 hours
    if (Date.now() - s.ts > 12 * 60 * 60 * 1000) { localStorage.removeItem('dukasa_session'); return false; }
    return s;
  } catch(e) { return false; }
}

function signOut() {
  localStorage.removeItem('dukasa_session');
  clearInterval(state.refreshTimer);
  location.reload();
}

// ── SMART SYNC — ping every 10s, full refresh only on change ─
let _lastModifiedSeen = '0';

async function startSmartSync() {
  // Do an immediate full load then start polling
  await refreshAllViews();
  _lastModifiedSeen = await getLastModified();
  setInterval(async () => {
    try {
      const ts = await getLastModified();
      if (ts !== _lastModifiedSeen) {
        _lastModifiedSeen = ts;
        await refreshAllViews();
        // Subtle pulse to indicate a live update came in
        const topbar = document.querySelector('.topbar');
        if (topbar) {
          topbar.style.transition = 'background .3s';
          topbar.style.background = 'rgba(83,74,183,0.12)';
          setTimeout(() => { topbar.style.background = ''; }, 600);
        }
      }
    } catch(e) { /* silent — network blip */ }
  }, 10000); // poll every 10 seconds
}

async function getLastModified() {
  try {
    const res = await gasGet('ping');
    return res.ok ? res.lastModified : _lastModifiedSeen;
  } catch(e) { return _lastModifiedSeen; }
}
async function initApp() {
  document.body.innerHTML = `
    <div id="app" class="app-shell">
      <header class="topbar glass">
        <div class="brand-wrap">
          <div class="brand">💊 RosterRx</div>
          <div class="brand-sub" id="topbar-role">${esc(state.emp.role || '')}</div>
        </div>
        <div class="topbar-actions">
          <div class="avatar" id="avatarInitials">${esc(initials(state.emp))}</div>
          <button class="btn btn-secondary btn-sm" id="signOutBtn">Sign out</button>
        </div>
      </header>
      <main class="content" id="content">
        <section id="view-home"    class="view active"></section>
        <section id="view-roster"  class="view"></section>
        <section id="view-leave"   class="view"></section>
        <section id="view-ot"      class="view"></section>
        <section id="view-hours"   class="view"></section>
        <section id="view-profile" class="view"></section>
      </main>
      <nav class="tabbar glass" aria-label="Primary">
        <button class="tab active" data-view="home"><span class="tab-icon">🏠</span><span class="tab-label">Home</span></button>
        <button class="tab" data-view="roster"><span class="tab-icon">📅</span><span class="tab-label">Roster</span></button>
        <button class="tab" data-view="leave"><span class="tab-icon">🌈</span><span class="tab-label">Leave</span></button>
        <button class="tab" data-view="ot"><span class="tab-icon">⏰</span><span class="tab-label">OT</span></button>
        <button class="tab" data-view="hours"><span class="tab-icon">🕘</span><span class="tab-label">Hours</span></button>
        <button class="tab" data-view="profile"><span class="tab-icon">👤</span><span class="tab-label">Profile</span></button>
      </nav>
    </div>
  `;
  state.currentWeekStart = weekStart(0);
  attachEvents();
  await startSmartSync();
}

function initials(emp) {
  if (!emp) return '?';
  return ((emp.first||'')[0] || '') + ((emp.last||'')[0] || '');
}

async function refreshAllViews() {
  try {
    const result = await gasGet('getAll');
    if (result.ok) {
      state.allData = result.data || {};
      // Re-resolve emp in case profile was updated
      const staff = getList('staff');
      const fresh = staff.find(s => s.id === state.emp.id);
      if (fresh) state.emp = fresh;
    }
  } catch(e) { console.warn('Refresh failed:', e.message); }
  renderCurrentViews();
}

function renderCurrentViews() {
  renderHome();
  renderRoster();
  renderLeave();
  renderOT();
  renderHours();
  renderProfile();
  applyEntranceAnimations(qs(`#view-${state.currentView}`));
  syncTopbarState();
}

// ── RENDER: HOME ─────────────────────────────────────────────
function renderHome() {
  const emp = state.emp;
  const shifts = getList('shifts').filter(s => s.empId === emp.id && s.published);
  const sickDays = getList('sickDays').filter(s => s.empId === emp.id);
  const leaveReqs = getList('leaveRequests').filter(l => l.empId === emp.id);
  const todayStr = today();

  // Today's shift
  const todayShift = shifts.find(s => s.date === todayStr);
  const todaySick = sickDays.find(s => s.date === todayStr);
  const todayLeave = leaveReqs.find(l => l.status === 'approved' && l.from <= todayStr && l.to >= todayStr);

  let todayCard = '';
  if (todaySick) {
    todayCard = `<div class="card" style="background:#fff3f3;border-color:#f0a0a0;margin-bottom:16px"><div style="font-weight:700;color:#A32D2D">🤒 Sick day today</div></div>`;
  } else if (todayLeave) {
    todayCard = `<div class="card" style="background:#f0fdf9;border-color:#6ee7c0;margin-bottom:16px"><div style="font-weight:700;color:#0F6E56">🏖 On approved leave today</div></div>`;
  } else if (todayShift) {
    const hrs = shiftHours(todayShift);
    todayCard = `<div class="card" style="background:#EEEDFE;border-color:#AFA9EC;margin-bottom:16px">
      <div style="font-weight:800;font-size:17px;color:#3C3489">Today's shift</div>
      <div style="font-size:20px;font-weight:700;margin-top:4px;color:#534AB7">${esc(todayShift.start)} – ${esc(todayShift.end)}</div>
      <div style="font-size:13px;color:#534AB7;margin-top:2px">${todayShift.breakMin||0} min break · ${hrs.toFixed(1)} hrs</div>
    </div>`;
  } else {
    todayCard = `<div class="card card-soft card-compact" style="margin-bottom:16px;color:var(--text-muted)">No shift scheduled today.</div>`;
  }

  // Week strip
  const ws = state.currentWeekStart;
  const weekDays = [];
  for (let i = 0; i < 7; i++) {
    const ds = addDays(ws, i);
    const d = new Date(ds + 'T00:00:00');
    const hasShift = shifts.some(s => s.date === ds);
    const isSick = sickDays.some(s => s.date === ds);
    const isToday = ds === todayStr;
    weekDays.push({ dow: d.toLocaleDateString('en-AU',{weekday:'short'}), num: d.getDate(), ds, hasShift, isSick, isToday });
  }

  // Upcoming shifts (next 7 days from tomorrow)
  const upcoming = shifts
    .filter(s => s.date > todayStr)
    .sort((a,b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-AU', {hour:'2-digit', minute:'2-digit'});
  const dateStr = now.toLocaleDateString('en-AU', {weekday:'long', day:'numeric', month:'long'});

  qs('#view-home').innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Hi, ${esc(emp.first)}! 👋</h1>
        <div class="page-subtitle">${esc(dateStr)}</div>
      </div>
      <div class="hero-time">
        <div class="hero-time-big">${esc(timeStr)}</div>
        <div class="hero-time-small">local time</div>
      </div>
    </div>
    ${todayCard}
    <div class="section-label">This week</div>
    <div class="week-strip">
      ${weekDays.map(d => `
        <div class="week-pill ${d.isToday ? 'active' : ''}" style="${d.isSick ? 'background:#fef2f2' : ''}">
          <span class="week-pill-name">${esc(d.dow)}</span>
          <span class="week-pill-num">${d.num}</span>
          ${d.hasShift && !d.isSick ? '<span style="display:block;width:5px;height:5px;border-radius:50%;background:#534AB7;margin:2px auto 0"></span>' : ''}
          ${d.isSick ? '<span style="display:block;font-size:9px;margin-top:2px">🤒</span>' : ''}
        </div>
      `).join('')}
    </div>
    <div class="section-label" style="margin-top:16px">Upcoming shifts</div>
    <div class="info-grid">
      ${upcoming.length ? upcoming.map(s => {
        const hrs = shiftHours(s);
        return `<div class="card list-card">
          <div>
            <div class="list-title">${esc(FDOW(s.date))}, ${esc(FDS(s.date))}</div>
            <div class="list-copy">${esc(s.start)} – ${esc(s.end)} · ${s.breakMin||0}min break</div>
          </div>
          <div class="list-meta">${hrs.toFixed(1)}h</div>
        </div>`;
      }).join('') : '<div class="helper-note">No upcoming shifts.</div>'}
    </div>
  `;
}

// ── RENDER: ROSTER ───────────────────────────────────────────
function renderRoster() {
  const emp = state.emp;
  const ws = state.currentWeekStart;
  const we = addDays(ws, 6);
  const shifts = getList('shifts').filter(s => s.empId === emp.id && s.published);
  const sickDays = getList('sickDays').filter(s => s.empId === emp.id);
  const leaveReqs = getList('leaveRequests').filter(l => l.empId === emp.id && l.status === 'approved');
  const todayStr = today();

  const wLabel = `${FDS(ws)} – ${FDS(we)}`;
  const weekTotal = shifts
    .filter(s => s.date >= ws && s.date <= we)
    .reduce((sum, s) => sum + shiftHours(s), 0);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const ds = addDays(ws, i);
    days.push({
      ds,
      shift: shifts.find(s => s.date === ds),
      sick: sickDays.find(s => s.date === ds),
      leave: leaveReqs.find(l => l.from <= ds && l.to >= ds),
      isToday: ds === todayStr,
    });
  }

  qs('#view-roster').innerHTML = `
    <div class="page-header stack">
      <h1 class="page-title">My roster</h1>
      <div class="page-subtitle">${esc(wLabel)} · ${weekTotal.toFixed(1)} hrs</div>
      <div class="btn-row" style="margin-top:14px">
        <button class="btn btn-secondary btn-sm" onclick="rosterNav(-1)">‹ Previous</button>
        <button class="btn btn-secondary btn-sm" onclick="rosterNav(1)">Next ›</button>
      </div>
    </div>
    <div class="info-grid">
      ${days.map(d => {
        const dObj = new Date(d.ds + 'T00:00:00');
        const dow = dObj.toLocaleDateString('en-AU', {weekday:'short'});
        const num = dObj.getDate();
        let status = 'Off', meta = '', borderColor = 'var(--border)', bg = 'var(--surface-solid)';
        if (d.sick) { status = 'Sick day'; borderColor = '#f0a0a0'; bg = '#fff3f3'; }
        else if (d.leave) { status = d.leave.type; borderColor = '#6ee7c0'; bg = '#f0fdf9'; }
        else if (d.shift) {
          const hrs = shiftHours(d.shift);
          status = `${d.shift.start} – ${d.shift.end}`;
          meta = `${hrs.toFixed(1)} hrs · ${d.shift.breakMin||0}m break`;
        }
        if (d.isToday) { borderColor = '#534AB7'; }
        return `<div class="card list-card" style="border-color:${borderColor};background:${bg}${d.isToday?';border-width:2px':''}">
          <div style="display:flex;gap:16px;align-items:flex-start;width:100%">
            <div style="min-width:42px;text-align:center">
              <div class="small-muted" style="font-weight:700;text-transform:uppercase">${esc(dow)}</div>
              <div style="font-size:1.8rem;font-weight:800;line-height:1;margin-top:4px;color:${d.isToday?'#534AB7':'var(--text)'}"> ${num}</div>
            </div>
            <div style="flex:1">
              <div class="list-title" style="font-size:1.05rem">${esc(status)}</div>
              ${meta ? `<div class="list-copy">${esc(meta)}</div>` : ''}
              ${d.shift && d.ds === todayStr ? `<button class="btn btn-secondary btn-sm" style="margin-top:8px;font-size:12px" onclick="openRunningLate()">⏱ Running late?</button>` : ''}
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>
    <div id="running-late-form" style="display:none"></div>
  `;
}

window.rosterNav = function(dir) {
  state.currentWeekStart = weekStart(
    Math.round((new Date(state.currentWeekStart + 'T00:00:00') - new Date(weekStart(0) + 'T00:00:00')) / (7*86400000)) + dir
  );
  renderRoster();
};

window.openRunningLate = function() {
  const container = qs('#running-late-form');
  if (!container) return;
  container.style.display = 'block';
  container.innerHTML = `
    <div class="card" style="margin-top:16px;border-color:#BA7517;background:#FFFBF0">
      <div style="font-weight:800;font-size:16px;color:#BA7517;margin-bottom:14px">⏱ Running late</div>
      <div style="margin-bottom:12px">
        <label style="font-size:12px;font-weight:700;color:#58584e;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:6px">Reason <span style="color:#A32D2D">*</span></label>
        <textarea id="late-reason" rows="2" placeholder="e.g. Traffic, transport delay..."
          style="width:100%;padding:10px 12px;border:1.5px solid #dddcd5;border-radius:8px;font-size:14px;font-family:inherit;resize:none;box-sizing:border-box"></textarea>
      </div>
      <div style="margin-bottom:12px">
        <label style="font-size:12px;font-weight:700;color:#58584e;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:6px">Estimated arrival time <span style="color:#A32D2D">*</span></label>
        <input type="time" id="late-eta" style="width:100%;padding:10px 12px;border:1.5px solid #dddcd5;border-radius:8px;font-size:15px;box-sizing:border-box">
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding:10px 12px;background:#fff;border-radius:8px;border:1px solid #e5e5e0">
        <input type="checkbox" id="late-contacted" style="width:18px;height:18px;cursor:pointer">
        <label for="late-contacted" style="font-size:14px;font-weight:600;cursor:pointer">I have contacted my manager</label>
      </div>
      <div id="late-err" style="display:none;color:#A32D2D;font-size:13px;margin-bottom:10px">⚠ Please fill in all required fields.</div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary" style="flex:1" onclick="qs('#running-late-form').style.display='none'">Cancel</button>
        <button class="btn btn-primary" style="flex:1;background:#BA7517" onclick="submitRunningLate()">Notify manager</button>
      </div>
    </div>
  `;
};

window.submitRunningLate = async function() {
  const reason = (qs('#late-reason')?.value || '').trim();
  const eta = (qs('#late-eta')?.value || '').trim();
  const contacted = qs('#late-contacted')?.checked || false;
  const errEl = qs('#late-err');
  if (!reason || !eta) { errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';
  const todayStr = today();
  const shifts = getList('shifts').filter(s => s.empId === state.emp.id && s.published);
  const todayShift = shifts.find(s => s.date === todayStr);
  if (!todayShift) return;
  try {
    await gasPost({
      action: 'sendEmail',
      fn: 'sendRunningLateNotification',
      payload: {
        empId: state.emp.id,
        date: todayStr,
        shiftStart: todayShift.start,
        shiftEnd: todayShift.end,
        reason, eta, contacted,
      }
    });
    qs('#running-late-form').innerHTML = `<div class="card" style="margin-top:16px;background:#f0fdf9;border-color:#6ee7c0"><div style="font-weight:700;color:#0F6E56">✓ Your manager has been notified.</div></div>`;
    toast('Manager notified successfully.', 'success');
  } catch(e) {
    toast('Could not send — please contact your manager directly.', 'error');
  }
};

// ── RENDER: LEAVE ────────────────────────────────────────────
function renderLeave() {
  const emp = state.emp;
  const leaveReqs = getList('leaveRequests')
    .filter(l => l.empId === emp.id)
    .sort((a,b) => (b.submitted||b.from||'').localeCompare(a.submitted||a.from||''));
  const sickDays = getList('sickDays')
    .filter(s => s.empId === emp.id)
    .sort((a,b) => b.date.localeCompare(a.date));
  const medCerts = getList('medCerts').filter(m => m.empId === emp.id);

  const pending = leaveReqs.filter(l => l.status === 'pending');
  const history = leaveReqs.filter(l => l.status !== 'pending');

  const badgeCls = { pending:'badge-amber', approved:'badge-green', declined:'badge-red' };

  qs('#view-leave').innerHTML = `
    <div class="page-header">
      <div><h1 class="page-title">Leave</h1></div>
      <button class="btn btn-primary" onclick="openLeaveForm()">+ Request leave</button>
    </div>

    <div class="section-label">Pending requests</div>
    ${pending.length ? pending.map(l => `
      <div class="card list-card">
        <div>
          <div class="list-title">${esc(l.type)}</div>
          <div class="list-copy">${esc(FDS(l.from))} – ${esc(FDS(l.to))}</div>
          ${l.notes ? `<div class="list-copy" style="color:var(--text-muted)">${esc(l.notes)}</div>` : ''}
        </div>
        <span class="badge badge-amber">Pending</span>
      </div>
    `).join('') : '<div class="helper-note">No pending requests.</div>'}

    <div id="leave-form-container"></div>

    <div class="section-label" style="margin-top:16px">History</div>
    <div class="info-grid">
      ${history.length ? history.map(l => {
        const bc = badgeCls[l.status] || 'badge-amber';
        return `<div class="card list-card">
          <div>
            <div class="list-title">${esc(l.type)}</div>
            <div class="list-copy">${esc(FDS(l.from))} – ${esc(FDS(l.to))}</div>
            ${l.denialReason ? `<div class="list-copy" style="color:#A32D2D;font-size:12px;margin-top:4px">Reason: ${esc(l.denialReason)}</div>` : ''}
          </div>
          <span class="badge ${bc}">${esc(l.status)}</span>
        </div>`;
      }).join('') : '<div class="helper-note">No leave history.</div>'}
    </div>

    <div class="section-label" style="margin-top:16px">Sick days &amp; medical certificates</div>
    <div class="info-grid">
      ${sickDays.length ? sickDays.map(sk => {
        const mc = medCerts.find(m => m.sickId === sk.id || m.date === sk.date);
        return `<div class="card list-card">
          <div>
            <div class="list-title">Sick day — ${esc(FDS(sk.date))}</div>
            ${mc ? `<div class="list-copy" style="color:#0F6E56;font-size:12px">✓ MC uploaded ${esc(new Date(mc.uploadedAt).toLocaleDateString('en-AU'))}</div>` : `<div class="list-copy" style="color:#BA7517;font-size:12px">⚠ MC required</div>`}
          </div>
          ${mc
            ? `<span class="badge badge-green">MC uploaded</span>`
            : `<button class="btn btn-secondary btn-sm" onclick="openMCUpload('${esc(sk.id)}','${esc(sk.date)}')">Upload MC</button>`
          }
        </div>`;
      }).join('') : '<div class="helper-note">No sick days recorded.</div>'}
    </div>
    <div id="mc-upload-container"></div>
  `;
}

window.openLeaveForm = function() {
  const c = qs('#leave-form-container');
  if (!c) return;
  c.innerHTML = `
    <div class="card" style="margin-top:12px">
      <div class="list-title" style="font-size:1.18rem;margin-bottom:14px">New leave request</div>
      <div class="form-grid">
        <div class="input-wrap">
          <label>Leave type</label>
          <select class="select" id="lv-type">
            <option>Annual Leave</option><option>Sick Leave</option><option>Personal Leave</option>
            <option>Carers Leave</option><option>Unpaid Leave</option>
          </select>
        </div>
        <div class="input-wrap"><label>From</label><input class="input" id="lv-from" type="date" required></div>
        <div class="input-wrap"><label>To</label><input class="input" id="lv-to" type="date" required></div>
        <div class="input-wrap full-span"><label>Notes</label><textarea class="textarea" id="lv-notes" placeholder="Any additional context..."></textarea></div>
        <div id="lv-err" style="display:none;color:#A32D2D;font-size:13px" class="full-span">⚠ Please fill in all dates.</div>
        <div class="btn-row full-span">
          <button class="btn btn-secondary" onclick="qs('#leave-form-container').innerHTML=''">Cancel</button>
          <button class="btn btn-primary" onclick="submitLeave()">Submit request</button>
        </div>
      </div>
    </div>
  `;
};

window.submitLeave = async function() {
  const type = qs('#lv-type')?.value;
  const from = qs('#lv-from')?.value;
  const to = qs('#lv-to')?.value;
  const notes = qs('#lv-notes')?.value?.trim() || '';
  const errEl = qs('#lv-err');
  if (!from || !to || from > to) { errEl.style.display = 'block'; errEl.textContent = '⚠ Please enter valid from and to dates.'; return; }
  errEl.style.display = 'none';
  const leaves = getList('leaveRequests');
  const newLeave = {
    id: 'lr' + Date.now(), empId: state.emp.id, type, from, to, notes,
    status: 'pending', submitted: new Date().toISOString(),
  };
  leaves.push(newLeave);
  try {
    await saveList('leaveRequests', leaves);
    state.allData['rx3_leaveRequests'] = JSON.stringify(leaves);
    await gasPost({
      action: 'sendEmail', fn: 'sendLeaveRequestNotification',
      payload: { empId: state.emp.id, type, from, to, notes, reason: notes }
    });
    qs('#leave-form-container').innerHTML = '';
    renderLeave();
    toast('Leave request submitted! ✓', 'success');
  } catch(e) { toast('Could not submit — please try again.', 'error'); }
};

// ── MC UPLOAD ────────────────────────────────────────────────
let _mcUploadSickId = null, _mcUploadDate = null;

window.openMCUpload = function(sickId, date) {
  _mcUploadSickId = sickId; _mcUploadDate = date;
  const c = qs('#mc-upload-container');
  if (!c) return;
  c.innerHTML = `
    <div class="card" style="margin-top:12px">
      <div class="list-title" style="font-size:1.1rem;margin-bottom:4px">Upload medical certificate</div>
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:14px">For sick day: ${esc(FDS(date))}</div>
      <div id="mc-file-label" style="border:2px dashed #dddcd5;border-radius:10px;padding:20px;text-align:center;margin-bottom:12px;cursor:pointer" onclick="qs('#mc-file-input').click()">
        <div style="font-size:24px;margin-bottom:6px">📎</div>
        <div style="font-size:13px;font-weight:600">Tap to select file</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">JPG or PNG recommended · PDF also accepted</div>
      </div>
      <input type="file" id="mc-file-input" accept=".pdf,.jpg,.jpeg,.png" style="display:none" onchange="handleMCFile(event)">
      <div id="mc-file-status" style="display:none;font-size:13px;margin-bottom:12px"></div>
      <div id="mc-err" style="display:none;color:#A32D2D;font-size:13px;margin-bottom:10px"></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary" style="flex:1" onclick="qs('#mc-upload-container').innerHTML=''">Cancel</button>
        <button class="btn btn-primary" style="flex:1" onclick="submitMC()">Upload certificate</button>
      </div>
    </div>
  `;
};

let _mcFileData = null;

window.handleMCFile = function(e) {
  const file = e.target.files[0]; if (!file) return;
  if (file.size > 15 * 1024 * 1024) { toast('File too large — please use under 15MB.', 'error'); return; }
  const status = qs('#mc-file-status');
  status.style.display = 'block'; status.style.color = 'var(--text-muted)'; status.textContent = '⏳ Processing...';
  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1400; let w = img.width, h = img.height;
        if (w > MAX || h > MAX) { if (w > h) { h = Math.round(h*MAX/w); w = MAX; } else { w = Math.round(w*MAX/h); h = MAX; } }
        const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL('image/jpeg', 0.75);
        const kb = Math.round(compressed.length * 0.75 / 1024);
        _mcFileData = { data: compressed, name: file.name.replace(/\.[^.]+$/, '.jpg'), type: 'image/jpeg' };
        status.style.color = '#0F6E56'; status.textContent = `✓ ${file.name} ready (${kb}KB compressed)`;
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  } else {
    const reader = new FileReader();
    reader.onload = ev => {
      const kb = Math.round(ev.target.result.length * 0.75 / 1024);
      _mcFileData = { data: ev.target.result, name: file.name, type: file.type };
      if (kb > 1500) {
        status.style.color = '#BA7517';
        status.textContent = `⚠ PDF is ${kb}KB — if upload fails, try a JPG photo instead.`;
      } else {
        status.style.color = '#0F6E56'; status.textContent = `✓ ${file.name} ready (${kb}KB)`;
      }
    };
    reader.readAsDataURL(file);
  }
};

window.submitMC = async function() {
  if (!_mcFileData) { const e = qs('#mc-err'); e.style.display='block'; e.textContent='⚠ Please select a file first.'; return; }
  const mcId = 'mc' + Date.now();
  const capturedData = _mcFileData.data, capturedName = _mcFileData.name, capturedType = _mcFileData.type;
  const kb = Math.round(capturedData.length * 0.75 / 1024);
  const mcs = getList('medCerts');
  mcs.push({ id: mcId, empId: state.emp.id, date: _mcUploadDate, sickId: _mcUploadSickId,
    fileName: capturedName, fileType: capturedType, uploadedAt: new Date().toISOString(), managerNotified: false });
  await saveList('medCerts', mcs);
  state.allData['rx3_medCerts'] = JSON.stringify(mcs);
  qs('#mc-upload-container').innerHTML = '';
  _mcFileData = null;
  renderLeave();
  toast(`Uploading certificate (${kb}KB)...`, 'info', 15000);
  try {
    const result = await gasPost({
      action: 'uploadMC', mcId, fileName: capturedName, fileType: capturedType, data: capturedData,
    });
    if (result?.result?.ok) {
      toast('Certificate uploaded and saved! ✓', 'success');
      await gasPost({ action: 'sendEmail', fn: 'sendMCUploadNotification',
        payload: { empId: state.emp.id, date: _mcUploadDate, fileName: capturedName } });
    } else {
      toast('Upload error — try a JPG photo of the certificate.', 'error');
    }
  } catch(e) { toast('Upload failed — please try again.', 'error'); }
};

// ── RENDER: OT ───────────────────────────────────────────────
function renderOT() {
  const emp = state.emp;
  const otReqs = getList('otRequests')
    .filter(o => o.empId === emp.id)
    .sort((a,b) => b.date.localeCompare(a.date));

  const statusBadge = o => {
    if (o.approved === true) return '<span class="badge badge-green">Approved</span>';
    if (o.approved === false) return '<span class="badge badge-red">Denied</span>';
    return '<span class="badge badge-amber">Pending</span>';
  };

  qs('#view-ot').innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Overtime</h1>
        <div class="page-subtitle">Your OT requests and approvals.</div>
      </div>
      <button class="btn btn-primary" onclick="openOTForm()">+ Request OT</button>
    </div>
    <div id="ot-form-container"></div>
    <div class="info-grid">
      ${otReqs.length ? otReqs.map(o => `
        <div class="card list-card">
          <div>
            <div class="list-title">${esc(FD(o.date))}</div>
            <div class="list-copy">${esc(o.start)} – ${esc(o.end)}</div>
            ${o.reason ? `<div class="list-copy" style="color:var(--text-muted)">${esc(o.reason)}</div>` : ''}
          </div>
          ${statusBadge(o)}
        </div>
      `).join('') : '<div class="helper-note">No OT requests yet.</div>'}
    </div>
  `;
}

window.openOTForm = function() {
  const c = qs('#ot-form-container');
  if (!c) return;
  c.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div class="list-title" style="font-size:1.18rem;margin-bottom:14px">New overtime request</div>
      <div class="form-grid">
        <div class="input-wrap"><label>Date</label><input class="input" id="ot-date" type="date" required></div>
        <div class="input-wrap"><label>From</label><input class="input" id="ot-start" type="time" required></div>
        <div class="input-wrap"><label>To</label><input class="input" id="ot-end" type="time" required></div>
        <div class="input-wrap full-span"><label>Reason</label><textarea class="textarea" id="ot-reason" placeholder="Why is OT needed?"></textarea></div>
        <div id="ot-err" style="display:none;color:#A32D2D;font-size:13px" class="full-span"></div>
        <div class="btn-row full-span">
          <button class="btn btn-secondary" onclick="qs('#ot-form-container').innerHTML=''">Cancel</button>
          <button class="btn btn-primary" onclick="submitOT()">Submit</button>
        </div>
      </div>
    </div>
  `;
};

window.submitOT = async function() {
  const date = qs('#ot-date')?.value;
  const start = qs('#ot-start')?.value;
  const end = qs('#ot-end')?.value;
  const reason = (qs('#ot-reason')?.value || '').trim();
  const errEl = qs('#ot-err');
  if (!date || !start || !end) { errEl.style.display='block'; errEl.textContent='⚠ Please fill in date, start and end times.'; return; }
  errEl.style.display = 'none';
  const otReqs = getList('otRequests');
  const newOT = { id: 'ot'+Date.now(), empId: state.emp.id, date, start, end, reason,
    approved: null, requestedBy: 'staff', submitted: new Date().toISOString() };
  otReqs.push(newOT);
  try {
    await saveList('otRequests', otReqs);
    state.allData['rx3_otRequests'] = JSON.stringify(otReqs);
    await gasPost({ action: 'sendEmail', fn: 'sendOTRequestNotification',
      payload: { empId: state.emp.id, date, start, end, reason } });
    qs('#ot-form-container').innerHTML = '';
    renderOT();
    toast('OT request submitted! ✓', 'success');
  } catch(e) { toast('Could not submit — please try again.', 'error'); }
};

// ── RENDER: HOURS ────────────────────────────────────────────
function renderHours() {
  const emp = state.emp;
  const shifts = getList('shifts').filter(s => s.empId === emp.id && s.published);
  const clockEvents = getList('clockEvents').filter(c => c.empId === emp.id);
  const todayStr = today();
  const ws = weekStart(0);
  const we = addDays(ws, 6);
  // Month boundaries
  const now = new Date();
  const ms = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
  const me = new Date(now.getFullYear(), now.getMonth()+1, 0).toISOString().split('T')[0];

  const weekHrs = shifts.filter(s => s.date >= ws && s.date <= we).reduce((t,s) => t+shiftHours(s), 0);
  const monthHrs = shifts.filter(s => s.date >= ms && s.date <= me).reduce((t,s) => t+shiftHours(s), 0);
  const futureHrs = shifts.filter(s => s.date > todayStr).reduce((t,s) => t+shiftHours(s), 0);

  // Recent shifts table
  const recent = shifts.filter(s => s.date <= todayStr).sort((a,b) => b.date.localeCompare(a.date)).slice(0, 8);

  qs('#view-hours').innerHTML = `
    <div class="page-header stack">
      <h1 class="page-title">Hours</h1>
      <div class="page-subtitle">Your rostered hours summary.</div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="kpi-label">This week</div><div class="kpi-value">${weekHrs.toFixed(1)}h</div></div>
      <div class="kpi"><div class="kpi-label">This month</div><div class="kpi-value">${monthHrs.toFixed(1)}h</div></div>
      <div class="kpi"><div class="kpi-label">Upcoming</div><div class="kpi-value">${futureHrs.toFixed(1)}h</div></div>
      <div class="kpi"><div class="kpi-label">Status</div><div class="kpi-value" style="font-size:1rem">Live ✓</div></div>
    </div>
    <div class="section-label" style="margin-top:16px">Recent shifts</div>
    <div class="info-grid">
      ${recent.length ? recent.map(s => {
        const hrs = shiftHours(s);
        return `<div class="card list-card">
          <div>
            <div class="list-title">${esc(FDS(s.date))} <span style="color:var(--text-muted);font-weight:400">${esc(FDOW(s.date))}</span></div>
            <div class="list-copy">${esc(s.start)} – ${esc(s.end)} · ${s.breakMin||0}m break</div>
          </div>
          <div class="list-meta">${hrs.toFixed(1)}h</div>
        </div>`;
      }).join('') : '<div class="helper-note">No past shifts recorded.</div>'}
    </div>
  `;
}

// ── RENDER: PROFILE ──────────────────────────────────────────
function renderProfile() {
  const emp = state.emp;
  qs('#view-profile').innerHTML = `
    <div class="page-header stack">
      <h1 class="page-title">Profile</h1>
    </div>
    <div class="info-grid">
      <div class="card">
        <div style="display:flex;align-items:center;gap:14px">
          <div style="width:52px;height:52px;border-radius:50%;background:#EEEDFE;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#534AB7">${esc(initials(emp))}</div>
          <div>
            <div class="list-title" style="font-size:1.18rem">${esc(emp.first)} ${esc(emp.last)}</div>
            <div class="list-copy">${esc(emp.role)}</div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="small-muted">Email</div>
        <div class="list-title" style="font-size:1.05rem;margin-top:6px">${esc(emp.email||'—')}</div>
      </div>
      ${emp.phone ? `<div class="card"><div class="small-muted">Phone</div><div class="list-title" style="font-size:1.05rem;margin-top:6px">${esc(emp.phone)}</div></div>` : ''}
      <div class="card">
        <div class="small-muted">Team</div>
        <div class="list-title" style="font-size:1.05rem;margin-top:6px">Dukasa Dispensary</div>
      </div>
    </div>
    <div style="margin-top:24px;text-align:center">
      <button class="btn btn-secondary" onclick="signOut()" style="color:#A32D2D;border-color:#A32D2D">Sign out</button>
    </div>
  `;
}

// ── NAVIGATION ───────────────────────────────────────────────
function switchView(viewName) {
  state.currentView = viewName;
  qsa('.view').forEach(v => v.classList.toggle('active', v.id === `view-${viewName}`));
  qsa('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === viewName));
  applyEntranceAnimations(qs(`#view-${viewName}`));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  syncTopbarState();
}

function attachEvents() {
  qsa('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
  });
  qs('#signOutBtn')?.addEventListener('click', signOut);
  window.addEventListener('scroll', syncTopbarState, { passive: true });
}

function applyEntranceAnimations(root = document) {
  const nodes = ['.page-header','.card','.kpi','.week-strip','.btn-row'].flatMap(sel => qsa(sel, root));
  nodes.forEach((node, i) => {
    node.classList.remove('fade-in-up','delay-1','delay-2','delay-3','delay-4');
    void node.offsetWidth;
    node.classList.add('fade-in-up');
    if (!node.classList.contains('page-header')) node.classList.add(`delay-${Math.min((i%4)+1,4)}`);
  });
}

function syncTopbarState() {
  const topbar = qs('.topbar'); if (!topbar) return;
  const scrolled = window.scrollY > 8;
  topbar.style.background = scrolled ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.82)';
  topbar.style.boxShadow = scrolled ? '0 10px 28px rgba(16,24,40,0.05)' : '0 1px 0 rgba(255,255,255,0.45)';
  topbar.style.borderBottomColor = scrolled ? 'rgba(24,24,22,0.06)' : 'rgba(24,24,22,0.08)';
}

// ── LOADING SCREEN ───────────────────────────────────────────
function showLoading(msg = 'Loading...') {
  document.body.innerHTML = `
    <div style="min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f5f5f3;gap:16px">
      <div style="font-size:36px">💊</div>
      <div style="font-size:16px;font-weight:700;color:#534AB7">${msg}</div>
      <div style="width:40px;height:4px;background:#EEEDFE;border-radius:2px;overflow:hidden">
        <div style="height:100%;background:#534AB7;border-radius:2px;animation:loadbar 1.2s ease-in-out infinite"></div>
      </div>
    </div>
    <style>@keyframes loadbar{0%{width:0%;margin-left:0}50%{width:70%;margin-left:15%}100%{width:0%;margin-left:100%}}</style>
  `;
}

// ── ENTRY POINT ──────────────────────────────────────────────
async function init() {
  // Check for saved session
  const session = tryRestoreSession();
  if (session) {
    showLoading('Loading your portal...');
    try {
      const result = await gasGet('getAll');
      if (!result.ok) throw new Error(result.error);
      state.allData = result.data || {};
      const staff = getList('staff');
      const emp = staff.find(s => s.id === session.id && s.email?.toLowerCase() === session.email?.toLowerCase());
      if (emp) {
        state.emp = emp;
        initApp();
        return;
      }
    } catch(e) { console.warn('Session restore failed:', e.message); }
    localStorage.removeItem('dukasa_session');
  }
  showLogin();
}

init();
