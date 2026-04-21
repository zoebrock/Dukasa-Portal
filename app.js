// ============================================================
//  Dukasa Staff Portal — Vercel App
//  Connects to Google Apps Script backend via /api/gas proxy
// ============================================================

const CONFIG = {
  PROXY: '/api/gas',
};

// ── STATE ────────────────────────────────────────────────────
const state = {
  currentView: 'home',
  emp: null,
  allData: {},
  currentWeekOffset: 0,
};

// ── HELPERS ──────────────────────────────────────────────────
const qs  = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function today() { return new Date().toISOString().split('T')[0]; }

function FD(iso) {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', {weekday:'long', day:'numeric', month:'long', year:'numeric'});
}
function FDS(iso) {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', {day:'numeric', month:'short'});
}
function FDOW(iso) {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', {weekday:'long'});
}
function parseTime(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function shiftHours(s) {
  return Math.max(0, (parseTime(s.end) - parseTime(s.start) - (s.breakMin || 0)) / 60);
}
function weekStartDate(offset = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  const diff = (dow === 0 ? -6 : 1 - dow) + offset * 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}
function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}
function getList(key) {
  try { return JSON.parse(state.allData['rx3_' + key] || '[]'); } catch(e) { return []; }
}
function initials(emp) {
  if (!emp) return '?';
  return ((emp.first || '')[0] || '') + ((emp.last || '')[0] || '');
}

// ── TOAST ────────────────────────────────────────────────────
function toast(msg, type = 'info', duration = 3500) {
  let el = qs('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);padding:12px 20px;border-radius:12px;font-size:14px;font-weight:600;color:#fff;z-index:9999;max-width:88vw;text-align:center;pointer-events:none;transition:opacity .3s;box-shadow:0 8px 24px rgba(0,0,0,.5)';
    document.body.appendChild(el);
  }
  const bg = {info:'#534AB7', success:'#0F6E56', error:'#A32D2D', warning:'#BA7517'}[type] || '#534AB7';
  el.style.background = bg;
  el.style.opacity = '1';
  el.textContent = msg;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, duration);
}

// ── GAS API ──────────────────────────────────────────────────
async function gasGet(action, params = {}) {
  const url = new URL(CONFIG.PROXY, window.location.origin);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Server error ' + res.status);
  const text = await res.text();
  try { return JSON.parse(text); }
  catch(e) { throw new Error('Bad response — check GAS_URL in Vercel env vars'); }
}

async function gasPost(body) {
  const res = await fetch(CONFIG.PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Server error ' + res.status);
  const text = await res.text();
  try { return JSON.parse(text); }
  catch(e) { return { ok: false, error: text.slice(0, 100) }; }
}

async function saveList(key, arr) {
  state.allData['rx3_' + key] = JSON.stringify(arr);
  return gasPost({ action: 'set', dataKey: 'rx3_' + key, value: JSON.stringify(arr) });
}

// ── AUTH ─────────────────────────────────────────────────────
function showLogin(errorMsg = '') {
  document.body.innerHTML = `
    <div style="min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;background:var(--bg)">
      <div style="width:100%;max-width:360px">
        <div style="text-align:center;margin-bottom:32px">
          <div style="font-size:40px;margin-bottom:10px">💊</div>
          <div style="font-family:'DM Serif Display',Georgia,serif;font-size:1.8rem;color:var(--gold);letter-spacing:-.02em">Dukasa</div>
          <div style="font-size:.8rem;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--text-3);margin-top:4px">Staff Portal</div>
        </div>
        ${errorMsg ? `<div style="background:var(--red-soft);border:1px solid rgba(248,113,113,.2);border-radius:12px;padding:12px 16px;font-size:13px;color:var(--red);margin-bottom:16px;text-align:center">${esc(errorMsg)}</div>` : ''}
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:24px">
          <div style="margin-bottom:14px">
            <label style="font-size:.72rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--text-3);display:block;margin-bottom:7px">Email</label>
            <input id="login-email" type="email" autocomplete="email" placeholder="your@dukasa.com.au" class="input">
          </div>
          <div style="margin-bottom:20px">
            <label style="font-size:.72rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--text-3);display:block;margin-bottom:7px">PIN</label>
            <input id="login-pin" type="password" inputmode="numeric" maxlength="6" placeholder="••••" class="input" style="letter-spacing:6px;font-size:1.4rem">
          </div>
          <button id="login-btn" class="btn btn-primary" style="width:100%" onclick="doLogin()">Sign in</button>
        </div>
        <p style="text-align:center;margin-top:16px;font-size:12px;color:var(--text-3)">Contact your manager if you've forgotten your PIN.</p>
      </div>
    </div>
  `;
  qs('#login-pin')?.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  qs('#login-email')?.addEventListener('keydown', e => { if (e.key === 'Enter') qs('#login-pin')?.focus(); });
}

async function doLogin() {
  const email = (qs('#login-email')?.value || '').trim().toLowerCase();
  const pin   = (qs('#login-pin')?.value  || '').trim();
  const btn   = qs('#login-btn');
  if (!email || !pin) { showLogin('Please enter your email and PIN.'); return; }
  if (btn) { btn.textContent = 'Signing in…'; btn.disabled = true; }
  try {
    const result = await gasGet('getAll');
    if (!result.ok) throw new Error(result.error || 'Could not load data');
    state.allData = result.data || {};
    const staff = getList('staff');
    const emp = staff.find(s => (s.email || '').toLowerCase() === email && String(s.pin || '') === pin);
    if (!emp) { showLogin('Incorrect email or PIN — please try again.'); return; }
    state.emp = emp;
    localStorage.setItem('dukasa_session', JSON.stringify({ id: emp.id, email: emp.email, ts: Date.now() }));
    buildShell();
  } catch(err) {
    showLogin('Could not connect: ' + err.message);
  }
}

function tryRestoreSession() {
  try {
    const s = JSON.parse(localStorage.getItem('dukasa_session') || 'null');
    if (!s) return false;
    if (Date.now() - s.ts > 12 * 3600 * 1000) { localStorage.removeItem('dukasa_session'); return false; }
    return s;
  } catch(e) { return false; }
}

function signOut() {
  localStorage.removeItem('dukasa_session');
  location.reload();
}

// ── SHELL ─────────────────────────────────────────────────────
function buildShell() {
  const emp = state.emp;
  document.body.innerHTML = `
    <div id="app" class="app-shell">
      <header class="topbar glass">
        <div class="brand-wrap">
          <div class="brand">💊 RosterRx</div>
          <div class="brand-sub" id="topbar-role">${esc(emp.role || '')}</div>
        </div>
        <div class="topbar-actions">
          <div class="avatar">${esc(initials(emp))}</div>
          <button class="btn btn-secondary btn-sm" onclick="signOut()">Sign out</button>
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
      <nav class="tabbar glass">
        <button class="tab active" data-view="home">    <span class="tab-icon">🏠</span><span class="tab-label">Home</span></button>
        <button class="tab"        data-view="roster">  <span class="tab-icon">📅</span><span class="tab-label">Roster</span></button>
        <button class="tab"        data-view="leave">   <span class="tab-icon">🌿</span><span class="tab-label">Leave</span></button>
        <button class="tab"        data-view="ot">      <span class="tab-icon">⏰</span><span class="tab-label">OT</span></button>
        <button class="tab"        data-view="hours">   <span class="tab-icon">🕘</span><span class="tab-label">Hours</span></button>
        <button class="tab"        data-view="profile"> <span class="tab-icon">👤</span><span class="tab-label">Profile</span></button>
      </nav>
    </div>
  `;
  qsa('.tab').forEach(tab => tab.addEventListener('click', () => switchView(tab.dataset.view)));
  window.addEventListener('scroll', syncTopbar, { passive: true });
  renderAll();
  startSmartSync();
}

function switchView(name) {
  state.currentView = name;
  qsa('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  qsa('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === name));
  applyAnims(qs('#view-' + name));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  syncTopbar();
}

function syncTopbar() {
  const tb = qs('.topbar'); if (!tb) return;
  const scrolled = window.scrollY > 8;
  tb.style.background = scrolled ? 'rgba(14,15,20,0.95)' : 'rgba(14,15,20,0.85)';
  tb.style.boxShadow  = scrolled ? '0 8px 32px rgba(0,0,0,.4)' : 'none';
}

function applyAnims(root = document) {
  if (!root) return;
  qsa('.page-header,.card,.kpi,.week-strip,.btn-row', root).forEach((el, i) => {
    el.classList.remove('fade-in-up', 'delay-1', 'delay-2', 'delay-3', 'delay-4');
    void el.offsetWidth;
    el.classList.add('fade-in-up');
    if (!el.classList.contains('page-header')) el.classList.add('delay-' + Math.min((i % 4) + 1, 4));
  });
}

function renderAll() {
  renderHome();
  renderRoster();
  renderLeave();
  renderOT();
  renderHours();
  renderProfile();
  applyAnims(qs('#view-' + state.currentView));
}

// ── HOME ──────────────────────────────────────────────────────
function renderHome() {
  const emp = state.emp;
  const shifts    = getList('shifts').filter(s => s.empId === emp.id && s.published);
  const sickDays  = getList('sickDays').filter(s => s.empId === emp.id);
  const leaveReqs = getList('leaveRequests').filter(l => l.empId === emp.id);
  const todayStr  = today();
  const ws        = weekStartDate(0);

  const todayShift = shifts.find(s => s.date === todayStr);
  const todaySick  = sickDays.find(s => s.date === todayStr);
  const todayLeave = leaveReqs.find(l => l.status === 'approved' && l.from <= todayStr && l.to >= todayStr);

  let todayCard = '';
  if (todaySick) {
    todayCard = `<div class="card" style="border-color:rgba(248,113,113,.3);background:var(--red-soft)"><div style="font-weight:700;color:var(--red)">🤒 Sick day recorded today</div></div>`;
  } else if (todayLeave) {
    todayCard = `<div class="card" style="border-color:rgba(62,207,142,.25);background:var(--green-soft)"><div style="font-weight:700;color:var(--green)">🏖 On approved leave today</div></div>`;
  } else if (todayShift) {
    const hrs = shiftHours(todayShift);
    todayCard = `<div class="card card-gold">
      <div style="font-size:.72rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--gold-dim);margin-bottom:6px">Today's shift</div>
      <div style="font-family:'DM Serif Display',Georgia,serif;font-size:2rem;color:var(--gold);letter-spacing:-.03em">${esc(todayShift.start)} – ${esc(todayShift.end)}</div>
      <div style="font-size:.82rem;color:var(--text-2);margin-top:4px">${todayShift.breakMin || 0} min break · ${hrs.toFixed(1)} hrs</div>
    </div>`;
  } else {
    todayCard = `<div class="card card-compact"><span class="helper-note">No shift scheduled today.</span></div>`;
  }

  const weekDays = Array.from({length: 7}, (_, i) => {
    const ds = addDays(ws, i);
    const d  = new Date(ds + 'T00:00:00');
    return {
      dow: d.toLocaleDateString('en-AU', {weekday:'short'}),
      num: d.getDate(),
      ds,
      hasShift: shifts.some(s => s.date === ds),
      isSick:   sickDays.some(s => s.date === ds),
      isToday:  ds === todayStr,
    };
  });

  const upcoming = shifts
    .filter(s => s.date > todayStr)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-AU', {hour: '2-digit', minute: '2-digit'});
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
        <div class="week-pill ${d.isToday ? 'active' : ''}">
          <span class="week-pill-name">${esc(d.dow)}</span>
          <span class="week-pill-num">${d.num}</span>
          ${d.hasShift && !d.isSick ? '<span style="display:block;width:5px;height:5px;border-radius:50%;background:var(--gold);margin:4px auto 0;opacity:.8"></span>' : ''}
          ${d.isSick ? '<span style="display:block;font-size:9px;margin-top:3px">🤒</span>' : ''}
        </div>
      `).join('')}
    </div>
    <div class="section-label">Upcoming shifts</div>
    <div class="info-grid">
      ${upcoming.length ? upcoming.map(s => `
        <div class="card list-card">
          <div>
            <div class="list-title">${esc(FDOW(s.date))}, ${esc(FDS(s.date))}</div>
            <div class="list-copy">${esc(s.start)} – ${esc(s.end)} · ${s.breakMin || 0}min break</div>
          </div>
          <div class="list-meta">${shiftHours(s).toFixed(1)}h</div>
        </div>
      `).join('') : '<div class="helper-note">No upcoming shifts scheduled.</div>'}
    </div>
  `;
}

// ── ROSTER ────────────────────────────────────────────────────
function renderRoster() {
  const emp    = state.emp;
  const offset = state.currentWeekOffset;
  const ws     = weekStartDate(offset);
  const we     = addDays(ws, 6);
  const shifts    = getList('shifts').filter(s => s.empId === emp.id && s.published);
  const sickDays  = getList('sickDays').filter(s => s.empId === emp.id);
  const leaveReqs = getList('leaveRequests').filter(l => l.empId === emp.id && l.status === 'approved');
  const todayStr  = today();

  const weekTotal = shifts.filter(s => s.date >= ws && s.date <= we).reduce((t, s) => t + shiftHours(s), 0);

  const days = Array.from({length: 7}, (_, i) => {
    const ds = addDays(ws, i);
    return {
      ds,
      shift: shifts.find(s => s.date === ds),
      sick:  sickDays.find(s => s.date === ds),
      leave: leaveReqs.find(l => l.from <= ds && l.to >= ds),
      isToday: ds === todayStr,
    };
  });

  qs('#view-roster').innerHTML = `
    <div class="page-header stack">
      <h1 class="page-title">My roster</h1>
      <div class="page-subtitle">${esc(FDS(ws))} – ${esc(FDS(we))} · ${weekTotal.toFixed(1)} hrs</div>
      <div class="btn-row" style="margin-top:14px">
        <button class="btn btn-secondary btn-sm" onclick="rosterNav(-1)">‹ Previous</button>
        <button class="btn btn-secondary btn-sm" onclick="rosterNav(0)" style="${offset === 0 ? 'color:var(--gold);border-color:var(--gold-dim)' : ''}">This week</button>
        <button class="btn btn-secondary btn-sm" onclick="rosterNav(1)">Next ›</button>
      </div>
    </div>
    <div class="info-grid">
      ${days.map(d => {
        const dObj = new Date(d.ds + 'T00:00:00');
        const dow  = dObj.toLocaleDateString('en-AU', {weekday:'short'});
        const num  = dObj.getDate();
        let statusLine = 'Day off', metaLine = '', borderStyle = '';

        if (d.sick) {
          statusLine  = 'Sick day';
          borderStyle = 'border-color:rgba(248,113,113,.3);background:var(--red-soft)';
        } else if (d.leave) {
          statusLine  = d.leave.type;
          borderStyle = 'border-color:rgba(62,207,142,.2);background:var(--green-soft)';
        } else if (d.shift) {
          statusLine = `${d.shift.start} – ${d.shift.end}`;
          metaLine   = `${shiftHours(d.shift).toFixed(1)} hrs · ${d.shift.breakMin || 0}m break`;
        }
        if (d.isToday) borderStyle += ';border-color:var(--gold);border-width:2px';

        return `<div class="card list-card" style="${borderStyle}">
          <div style="display:flex;gap:14px;align-items:flex-start;width:100%">
            <div style="min-width:44px;text-align:center;flex-shrink:0">
              <div style="font-size:.65rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-3)">${esc(dow)}</div>
              <div style="font-family:'DM Serif Display',Georgia,serif;font-size:1.8rem;color:${d.isToday ? 'var(--gold)' : 'var(--text)'};line-height:1;margin-top:3px">${num}</div>
            </div>
            <div style="flex:1">
              <div class="list-title">${esc(statusLine)}</div>
              ${metaLine ? `<div class="list-copy">${esc(metaLine)}</div>` : ''}
              ${d.shift && d.isToday ? `<button class="btn btn-secondary btn-sm" style="margin-top:8px;font-size:.78rem" onclick="openRunningLate()">⏱ Running late?</button>` : ''}
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>
    <div id="running-late-form"></div>
  `;
}

window.rosterNav = function(dirOrReset) {
  if (dirOrReset === 0) { state.currentWeekOffset = 0; }
  else { state.currentWeekOffset += dirOrReset; }
  renderRoster();
};

window.openRunningLate = function() {
  const c = qs('#running-late-form'); if (!c) return;
  c.innerHTML = `
    <div class="card" style="margin-top:14px;border-color:rgba(251,191,36,.25);background:var(--amber-soft)">
      <div style="font-size:.72rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--amber);margin-bottom:14px">⏱ Running late</div>
      <div class="form-grid">
        <div class="input-wrap">
          <label>Reason *</label>
          <textarea class="textarea" id="late-reason" rows="2" placeholder="e.g. Traffic, transport delay..." style="min-height:70px"></textarea>
        </div>
        <div class="input-wrap">
          <label>Estimated arrival *</label>
          <input class="input" type="time" id="late-eta">
        </div>
        <div style="display:flex;align-items:center;gap:10px;padding:12px;background:var(--surface-2);border-radius:var(--r-sm);border:1px solid var(--border)">
          <input type="checkbox" id="late-contacted" style="width:18px;height:18px;cursor:pointer;accent-color:var(--gold)">
          <label for="late-contacted" style="font-size:.88rem;font-weight:600;cursor:pointer">I have contacted my manager</label>
        </div>
        <div id="late-err" style="display:none;color:var(--red);font-size:.82rem">⚠ Please provide a reason and arrival time.</div>
        <div class="btn-row full-span">
          <button class="btn btn-secondary" onclick="qs('#running-late-form').innerHTML=''">Cancel</button>
          <button class="btn btn-primary" onclick="submitRunningLate()">Notify manager</button>
        </div>
      </div>
    </div>
  `;
};

window.submitRunningLate = async function() {
  const reason    = (qs('#late-reason')?.value || '').trim();
  const eta       = (qs('#late-eta')?.value || '').trim();
  const contacted = qs('#late-contacted')?.checked || false;
  const errEl     = qs('#late-err');
  if (!reason || !eta) { if (errEl) errEl.style.display = 'block'; return; }
  if (errEl) errEl.style.display = 'none';
  const todayStr   = today();
  const shifts     = getList('shifts').filter(s => s.empId === state.emp.id && s.published);
  const todayShift = shifts.find(s => s.date === todayStr);
  if (!todayShift) return;
  try {
    await gasPost({
      action: 'sendEmail', fn: 'sendRunningLateNotification',
      payload: { empId: state.emp.id, date: todayStr, shiftStart: todayShift.start, shiftEnd: todayShift.end, reason, eta, contacted }
    });
    const c = qs('#running-late-form');
    if (c) c.innerHTML = `<div class="card" style="margin-top:14px;border-color:rgba(62,207,142,.25);background:var(--green-soft)"><div style="font-weight:700;color:var(--green)">✓ Your manager has been notified.</div></div>`;
    toast('Manager notified.', 'success');
  } catch(e) { toast('Could not send — please contact your manager directly.', 'error'); }
};

// ── LEAVE ─────────────────────────────────────────────────────
function renderLeave() {
  const emp       = state.emp;
  const leaveReqs = getList('leaveRequests').filter(l => l.empId === emp.id).sort((a,b) => (b.submitted||b.from||'').localeCompare(a.submitted||a.from||''));
  const sickDays  = getList('sickDays').filter(s => s.empId === emp.id).sort((a,b) => b.date.localeCompare(a.date));
  const medCerts  = getList('medCerts').filter(m => m.empId === emp.id);
  const pending   = leaveReqs.filter(l => l.status === 'pending');
  const history   = leaveReqs.filter(l => l.status !== 'pending');

  const badgeStyle = {
    pending:  'background:var(--amber-soft);color:var(--amber)',
    approved: 'background:var(--green-soft);color:var(--green)',
    declined: 'background:var(--red-soft);color:var(--red)',
  };

  qs('#view-leave').innerHTML = `
    <div class="page-header">
      <div><h1 class="page-title">Leave</h1></div>
      <button class="btn btn-primary btn-sm" onclick="openLeaveForm()">+ Request</button>
    </div>
    <div id="leave-form-container"></div>

    <div class="section-label">Pending</div>
    ${pending.length ? pending.map(l => `
      <div class="card list-card">
        <div>
          <div class="list-title">${esc(l.type)}</div>
          <div class="list-copy">${esc(FDS(l.from))} – ${esc(FDS(l.to))}</div>
        </div>
        <span class="badge" style="${badgeStyle.pending}">Pending</span>
      </div>
    `).join('') : '<div class="helper-note">No pending requests.</div>'}

    <div class="section-label">History</div>
    <div class="info-grid">
      ${history.length ? history.map(l => {
        const st = l.status || 'pending';
        const bs = badgeStyle[st] || badgeStyle.pending;
        return `<div class="card list-card">
          <div>
            <div class="list-title">${esc(l.type)}</div>
            <div class="list-copy">${esc(FDS(l.from))} – ${esc(FDS(l.to))}</div>
            ${l.denialReason ? `<div class="list-copy" style="color:var(--red);margin-top:4px;font-size:.78rem">Reason: ${esc(l.denialReason)}</div>` : ''}
          </div>
          <span class="badge" style="${bs}">${esc(st)}</span>
        </div>`;
      }).join('') : '<div class="helper-note">No leave history.</div>'}
    </div>

    <div class="section-label">Sick days &amp; certificates</div>
    <div class="info-grid">
      ${sickDays.length ? sickDays.map(sk => {
        const mc = medCerts.find(m => m.sickId === sk.id || m.date === sk.date);
        return `<div class="card list-card">
          <div>
            <div class="list-title">Sick day — ${esc(FDS(sk.date))}</div>
            ${mc
              ? `<div class="list-copy" style="color:var(--green);font-size:.78rem">✓ MC uploaded ${esc(new Date(mc.uploadedAt).toLocaleDateString('en-AU'))}</div>`
              : `<div class="list-copy" style="color:var(--amber);font-size:.78rem">⚠ Medical certificate required</div>`
            }
          </div>
          ${mc
            ? `<span class="badge" style="background:var(--green-soft);color:var(--green)">Uploaded</span>`
            : `<button class="btn btn-secondary btn-sm" onclick="openMCUpload('${esc(sk.id)}','${esc(sk.date)}')">Upload MC</button>`
          }
        </div>`;
      }).join('') : '<div class="helper-note">No sick days recorded.</div>'}
    </div>
    <div id="mc-upload-container"></div>
  `;
}

window.openLeaveForm = function() {
  const c = qs('#leave-form-container'); if (!c) return;
  c.innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <div style="font-family:'DM Serif Display',Georgia,serif;font-size:1.3rem;margin-bottom:16px">New leave request</div>
      <div class="form-grid">
        <div class="input-wrap">
          <label>Leave type</label>
          <select class="select" id="lv-type">
            <option>Annual Leave</option><option>Sick Leave</option><option>Personal Leave</option>
            <option>Carers Leave</option><option>Unpaid Leave</option>
          </select>
        </div>
        <div class="input-wrap"><label>From</label><input class="input" id="lv-from" type="date"></div>
        <div class="input-wrap"><label>To</label><input class="input" id="lv-to" type="date"></div>
        <div class="input-wrap full-span"><label>Notes</label><textarea class="textarea" id="lv-notes" placeholder="Optional context..."></textarea></div>
        <div id="lv-err" style="display:none;color:var(--red);font-size:.82rem" class="full-span">⚠ Please enter valid dates.</div>
        <div class="btn-row full-span">
          <button class="btn btn-secondary" onclick="qs('#leave-form-container').innerHTML=''">Cancel</button>
          <button class="btn btn-primary" onclick="submitLeave()">Submit</button>
        </div>
      </div>
    </div>
  `;
};

window.submitLeave = async function() {
  const type  = qs('#lv-type')?.value;
  const from  = qs('#lv-from')?.value;
  const to    = qs('#lv-to')?.value;
  const notes = (qs('#lv-notes')?.value || '').trim();
  const errEl = qs('#lv-err');
  if (!from || !to || from > to) { if (errEl) { errEl.style.display = 'block'; } return; }
  if (errEl) errEl.style.display = 'none';
  const leaves   = getList('leaveRequests');
  const newLeave = { id: 'lr' + Date.now(), empId: state.emp.id, type, from, to, notes, status: 'pending', submitted: new Date().toISOString() };
  leaves.push(newLeave);
  try {
    await saveList('leaveRequests', leaves);
    await gasPost({ action: 'sendEmail', fn: 'sendLeaveRequestNotification', payload: { empId: state.emp.id, type, from, to, notes, reason: notes } });
    if (qs('#leave-form-container')) qs('#leave-form-container').innerHTML = '';
    renderLeave();
    toast('Leave request submitted! ✓', 'success');
  } catch(e) { toast('Could not submit — please try again.', 'error'); }
};

// ── MC UPLOAD ─────────────────────────────────────────────────
let _mcSickId = null, _mcDate = null, _mcFileData = null;

window.openMCUpload = function(sickId, date) {
  _mcSickId = sickId; _mcDate = date; _mcFileData = null;
  const c = qs('#mc-upload-container'); if (!c) return;
  c.innerHTML = `
    <div class="card" style="margin-top:12px">
      <div style="font-family:'DM Serif Display',Georgia,serif;font-size:1.2rem;margin-bottom:4px">Upload certificate</div>
      <div class="list-copy" style="margin-bottom:16px">For sick day: ${esc(FDS(date))}</div>
      <div id="mc-drop" style="border:2px dashed var(--border-2);border-radius:var(--r-md);padding:24px;text-align:center;margin-bottom:14px;cursor:pointer;transition:border-color .2s" onclick="qs('#mc-file-input').click()">
        <div style="font-size:28px;margin-bottom:8px">📎</div>
        <div style="font-size:.88rem;font-weight:600;color:var(--text-2)">Tap to select file</div>
        <div style="font-size:.75rem;color:var(--text-3);margin-top:4px">JPG or PNG · PDF accepted</div>
      </div>
      <input type="file" id="mc-file-input" accept=".pdf,.jpg,.jpeg,.png" style="display:none" onchange="handleMCFile(event)">
      <div id="mc-status" style="display:none;font-size:.82rem;margin-bottom:12px"></div>
      <div id="mc-err" style="display:none;color:var(--red);font-size:.82rem;margin-bottom:10px"></div>
      <div class="btn-row">
        <button class="btn btn-secondary" style="flex:1" onclick="qs('#mc-upload-container').innerHTML=''">Cancel</button>
        <button class="btn btn-primary" style="flex:1" onclick="submitMC()">Upload</button>
      </div>
    </div>
  `;
};

window.handleMCFile = function(e) {
  const file = e.target.files[0]; if (!file) return;
  const status = qs('#mc-status');
  if (status) { status.style.display = 'block'; status.style.color = 'var(--text-2)'; status.textContent = '⏳ Processing…'; }
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
        if (status) { status.style.color = 'var(--green)'; status.textContent = `✓ ${file.name} ready (${kb}KB)`; }
        const drop = qs('#mc-drop'); if (drop) drop.style.borderColor = 'var(--green)';
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  } else {
    const reader = new FileReader();
    reader.onload = ev => {
      const kb = Math.round(ev.target.result.length * 0.75 / 1024);
      _mcFileData = { data: ev.target.result, name: file.name, type: file.type };
      if (status) { status.style.color = kb > 1500 ? 'var(--amber)' : 'var(--green)'; status.textContent = `✓ ${file.name} (${kb}KB)`; }
    };
    reader.readAsDataURL(file);
  }
};

window.submitMC = async function() {
  const errEl = qs('#mc-err');
  if (!_mcFileData) { if (errEl) { errEl.style.display = 'block'; errEl.textContent = '⚠ Please select a file first.'; } return; }
  const mcId = 'mc' + Date.now();
  const { data: capturedData, name: capturedName, type: capturedType } = _mcFileData;
  const mcs = getList('medCerts');
  mcs.push({ id: mcId, empId: state.emp.id, date: _mcDate, sickId: _mcSickId, fileName: capturedName, fileType: capturedType, uploadedAt: new Date().toISOString(), managerNotified: false });
  await saveList('medCerts', mcs);
  if (qs('#mc-upload-container')) qs('#mc-upload-container').innerHTML = '';
  _mcFileData = null; renderLeave();
  const kb = Math.round(capturedData.length * 0.75 / 1024);
  toast(`Uploading certificate (${kb}KB)…`, 'info', 15000);
  try {
    const result = await gasPost({ action: 'uploadMC', mcId, fileName: capturedName, fileType: capturedType, data: capturedData });
    if (result?.result?.ok) {
      toast('Certificate uploaded! ✓', 'success');
      await gasPost({ action: 'sendEmail', fn: 'sendMCUploadNotification', payload: { empId: state.emp.id, date: _mcDate, fileName: capturedName } });
    } else {
      toast('Upload error — try a JPG photo of the certificate.', 'error');
    }
  } catch(e) { toast('Upload failed — please try again.', 'error'); }
};

// ── OT ────────────────────────────────────────────────────────
function renderOT() {
  const emp    = state.emp;
  const otReqs = getList('otRequests').filter(o => o.empId === emp.id).sort((a,b) => b.date.localeCompare(a.date));

  const badge = o => {
    if (o.approved === true)  return `<span class="badge" style="background:var(--green-soft);color:var(--green)">Approved</span>`;
    if (o.approved === false) return `<span class="badge" style="background:var(--red-soft);color:var(--red)">Denied</span>`;
    return `<span class="badge" style="background:var(--amber-soft);color:var(--amber)">Pending</span>`;
  };

  qs('#view-ot').innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Overtime</h1>
        <div class="page-subtitle">Your OT requests.</div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="openOTForm()">+ Request</button>
    </div>
    <div id="ot-form-container"></div>
    <div class="info-grid">
      ${otReqs.length ? otReqs.map(o => `
        <div class="card list-card">
          <div>
            <div class="list-title">${esc(FDS(o.date))} — ${esc(o.start)} – ${esc(o.end)}</div>
            ${o.reason ? `<div class="list-copy">${esc(o.reason)}</div>` : ''}
          </div>
          ${badge(o)}
        </div>
      `).join('') : '<div class="helper-note">No OT requests yet.</div>'}
    </div>
  `;
}

window.openOTForm = function() {
  const c = qs('#ot-form-container'); if (!c) return;
  c.innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <div style="font-family:'DM Serif Display',Georgia,serif;font-size:1.3rem;margin-bottom:16px">New OT request</div>
      <div class="form-grid">
        <div class="input-wrap"><label>Date</label><input class="input" id="ot-date" type="date"></div>
        <div class="input-wrap"><label>From</label><input class="input" id="ot-start" type="time"></div>
        <div class="input-wrap"><label>To</label><input class="input" id="ot-end" type="time"></div>
        <div class="input-wrap full-span"><label>Reason</label><textarea class="textarea" id="ot-reason" placeholder="Why is OT needed?"></textarea></div>
        <div id="ot-err" style="display:none;color:var(--red);font-size:.82rem" class="full-span">⚠ Please fill in all required fields.</div>
        <div class="btn-row full-span">
          <button class="btn btn-secondary" onclick="qs('#ot-form-container').innerHTML=''">Cancel</button>
          <button class="btn btn-primary" onclick="submitOT()">Submit</button>
        </div>
      </div>
    </div>
  `;
};

window.submitOT = async function() {
  const date   = qs('#ot-date')?.value;
  const start  = qs('#ot-start')?.value;
  const end    = qs('#ot-end')?.value;
  const reason = (qs('#ot-reason')?.value || '').trim();
  const errEl  = qs('#ot-err');
  if (!date || !start || !end) { if (errEl) errEl.style.display = 'block'; return; }
  if (errEl) errEl.style.display = 'none';
  const otReqs = getList('otRequests');
  const newOT  = { id: 'ot' + Date.now(), empId: state.emp.id, date, start, end, reason, approved: null, requestedBy: 'staff', submitted: new Date().toISOString() };
  otReqs.push(newOT);
  try {
    await saveList('otRequests', otReqs);
    await gasPost({ action: 'sendEmail', fn: 'sendOTRequestNotification', payload: { empId: state.emp.id, date, start, end, reason } });
    if (qs('#ot-form-container')) qs('#ot-form-container').innerHTML = '';
    renderOT();
    toast('OT request submitted! ✓', 'success');
  } catch(e) { toast('Could not submit — please try again.', 'error'); }
};

// ── HOURS ─────────────────────────────────────────────────────
function renderHours() {
  const emp    = state.emp;
  const shifts = getList('shifts').filter(s => s.empId === emp.id && s.published);
  const today  = new Date(); today.setHours(0,0,0,0);
  const todayStr = today.toISOString().split('T')[0];
  const ws  = weekStartDate(0);
  const we  = addDays(ws, 6);
  const ms  = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-01`;
  const me  = new Date(today.getFullYear(), today.getMonth()+1, 0).toISOString().split('T')[0];

  const weekHrs   = shifts.filter(s => s.date >= ws && s.date <= we).reduce((t,s) => t + shiftHours(s), 0);
  const monthHrs  = shifts.filter(s => s.date >= ms && s.date <= me).reduce((t,s) => t + shiftHours(s), 0);
  const futureHrs = shifts.filter(s => s.date > todayStr).reduce((t,s) => t + shiftHours(s), 0);
  const recent    = shifts.filter(s => s.date <= todayStr).sort((a,b) => b.date.localeCompare(a.date)).slice(0, 8);

  qs('#view-hours').innerHTML = `
    <div class="page-header stack">
      <h1 class="page-title">Hours</h1>
      <div class="page-subtitle">Your rostered hours summary.</div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="kpi-label">This week</div><div class="kpi-value">${weekHrs.toFixed(1)}h</div></div>
      <div class="kpi"><div class="kpi-label">This month</div><div class="kpi-value">${monthHrs.toFixed(1)}h</div></div>
      <div class="kpi"><div class="kpi-label">Upcoming</div><div class="kpi-value">${futureHrs.toFixed(1)}h</div></div>
      <div class="kpi"><div class="kpi-label">Live sync</div><div class="kpi-value" style="font-size:1.2rem;color:var(--green)">✓</div></div>
    </div>
    <div class="section-label">Recent shifts</div>
    <div class="info-grid">
      ${recent.length ? recent.map(s => `
        <div class="card list-card">
          <div>
            <div class="list-title">${esc(FDS(s.date))} <span style="font-weight:400;color:var(--text-2)">${esc(FDOW(s.date))}</span></div>
            <div class="list-copy">${esc(s.start)} – ${esc(s.end)} · ${s.breakMin||0}m break</div>
          </div>
          <div class="list-meta">${shiftHours(s).toFixed(1)}h</div>
        </div>
      `).join('') : '<div class="helper-note">No past shifts on record.</div>'}
    </div>
  `;
}

// ── PROFILE ───────────────────────────────────────────────────
function renderProfile() {
  const emp = state.emp;
  qs('#view-profile').innerHTML = `
    <div class="page-header stack">
      <h1 class="page-title">Profile</h1>
    </div>
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px">
      <div style="width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,var(--gold-dim),var(--gold));display:flex;align-items:center;justify-content:center;font-size:1.3rem;font-weight:700;color:#0e0f14;box-shadow:0 4px 16px rgba(201,168,76,.3)">${esc(initials(emp))}</div>
      <div>
        <div style="font-family:'DM Serif Display',Georgia,serif;font-size:1.4rem">${esc(emp.first)} ${esc(emp.last)}</div>
        <div class="list-copy">${esc(emp.role)}</div>
      </div>
    </div>
    <div class="info-grid">
      ${emp.email ? `<div class="card"><div class="small-muted">Email</div><div class="list-title" style="margin-top:6px;font-size:.95rem">${esc(emp.email)}</div></div>` : ''}
      ${emp.phone ? `<div class="card"><div class="small-muted">Phone</div><div class="list-title" style="margin-top:6px;font-size:.95rem">${esc(emp.phone)}</div></div>` : ''}
      <div class="card"><div class="small-muted">Dispensary</div><div class="list-title" style="margin-top:6px;font-size:.95rem">Dukasa Dispensary</div></div>
    </div>
    <div style="margin-top:28px;text-align:center">
      <button class="btn btn-secondary" onclick="signOut()" style="color:var(--red);border-color:rgba(248,113,113,.3)">Sign out</button>
    </div>
  `;
}

// ── SMART SYNC ────────────────────────────────────────────────
let _lastModified = '0';

async function startSmartSync() {
  _lastModified = (await getLastModified()) || '0';
  setInterval(async () => {
    try {
      const ts = await getLastModified();
      if (ts && ts !== _lastModified) {
        _lastModified = ts;
        const result = await gasGet('getAll');
        if (result.ok) {
          state.allData = result.data || {};
          const staff = getList('staff');
          const fresh = staff.find(s => s.id === state.emp.id);
          if (fresh) state.emp = fresh;
          renderAll();
          const tb = qs('.topbar');
          if (tb) { tb.style.transition = 'background .3s'; tb.style.background = 'rgba(201,168,76,.15)'; setTimeout(() => syncTopbar(), 600); }
        }
      }
    } catch(e) { /* silent */ }
  }, 10000);
}

async function getLastModified() {
  try { const r = await gasGet('ping'); return r.ok ? r.lastModified : _lastModified; }
  catch(e) { return _lastModified; }
}

// ── LOADING ───────────────────────────────────────────────────
function showLoading(msg = 'Loading…') {
  document.body.innerHTML = `
    <div style="min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg);gap:20px">
      <div style="font-size:40px">💊</div>
      <div style="font-family:'DM Serif Display',Georgia,serif;font-size:1.3rem;color:var(--gold)">${esc(msg)}</div>
      <div style="width:48px;height:3px;background:var(--surface-2);border-radius:2px;overflow:hidden">
        <div style="height:100%;background:var(--gold);border-radius:2px;animation:loadbar 1.2s ease-in-out infinite"></div>
      </div>
    </div>
    <style>@keyframes loadbar{0%{width:0%;margin-left:0}50%{width:70%;margin-left:15%}100%{width:0%;margin-left:100%}}</style>
  `;
}

// ── INIT ──────────────────────────────────────────────────────
async function init() {
  const session = tryRestoreSession();
  if (session) {
    showLoading('Loading your portal…');
    try {
      const result = await gasGet('getAll');
      if (!result.ok) throw new Error(result.error || 'Could not load');
      state.allData = result.data || {};
      const staff = getList('staff');
      const emp = staff.find(s => s.id === session.id && (s.email||'').toLowerCase() === session.email?.toLowerCase());
      if (emp) { state.emp = emp; buildShell(); return; }
    } catch(e) { console.warn('Session restore failed:', e.message); }
    localStorage.removeItem('dukasa_session');
  }
  showLogin();
}

init();
