// ============================================================
//  Dukasa Staff Portal — Vercel App
//  Live data via /api/gas proxy → Google Apps Script
// ============================================================

const CONFIG = { PROXY: '/api/gas' };

const state = {
  currentView: 'home',
  emp: null,
  allData: {},
  weekOffset: 0,
};

// ── UTILS ─────────────────────────────────────────────────────
const qs  = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// IMPORTANT: never use toISOString() for local dates — it returns UTC
// which is yesterday in AU timezones before ~10-11am
function localISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
const today = () => localISO(new Date());

function FD(iso)   { return iso ? new Date(iso+'T00:00:00').toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long',year:'numeric'}) : ''; }
function FDS(iso)  { return iso ? new Date(iso+'T00:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short'}) : ''; }
function FDOW(iso) { return iso ? new Date(iso+'T00:00:00').toLocaleDateString('en-AU',{weekday:'long'}) : ''; }

function parseTime(t) { if (!t) return 0; const [h,m] = t.split(':').map(Number); return h*60+m; }
function shiftHrs(s)  { return Math.max(0,(parseTime(s.end)-parseTime(s.start)-(s.breakMin||0))/60); }

function weekStart(offset=0) {
  const d = new Date(); d.setHours(0,0,0,0);
  const diff = (d.getDay()===0 ? -6 : 1-d.getDay()) + offset*7;
  d.setDate(d.getDate()+diff);
  return localISO(d);
}
function addDays(iso,n) {
  const d = new Date(iso+'T00:00:00'); d.setDate(d.getDate()+n);
  return localISO(d);
}
function getList(key) { try { return JSON.parse(state.allData['rx3_'+key]||'[]'); } catch(e){ return []; } }
function initials(e) { return ((e.first||'')[0]||'')+((e.last||'')[0]||''); }

// ── TOAST ──────────────────────────────────────────────────────
function toast(msg, type='info', dur=3500) {
  let el = qs('#sp-toast');
  if (!el) {
    el = document.createElement('div'); el.id='sp-toast';
    el.style.cssText='position:fixed;bottom:90px;left:50%;transform:translateX(-50%);padding:11px 20px;border-radius:12px;font-size:14px;font-weight:600;color:#fff;z-index:9999;max-width:88vw;text-align:center;pointer-events:none;transition:opacity .3s;box-shadow:0 4px 16px rgba(0,0,0,.15)';
    document.body.appendChild(el);
  }
  el.style.background = {success:'#0F6E56',error:'#A32D2D',warning:'#BA7517',info:'#534AB7'}[type]||'#534AB7';
  el.style.opacity='1'; el.textContent=msg;
  clearTimeout(el._t); el._t=setTimeout(()=>el.style.opacity='0', dur);
}

// ── API ────────────────────────────────────────────────────────
async function gasGet(action, params={}) {
  const url = new URL(CONFIG.PROXY, window.location.origin);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,v));
  const res  = await fetch(url.toString());
  const text = await res.text();
  try { return JSON.parse(text); } catch(e) { throw new Error('Bad response from server'); }
}
async function gasPost(body) {
  const res  = await fetch(CONFIG.PROXY, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const text = await res.text();
  try { return JSON.parse(text); } catch(e) { return {ok:false,error:text.slice(0,100)}; }
}
async function saveList(key, arr) {
  state.allData['rx3_'+key] = JSON.stringify(arr);
  return gasPost({action:'set', dataKey:'rx3_'+key, value:JSON.stringify(arr)});
}

// ── AUTH ───────────────────────────────────────────────────────
function showLogin(err='') {
  document.body.innerHTML = `
    <div style="min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;background:#f0efe9">
      <div style="width:100%;max-width:360px">
        <div style="text-align:center;margin-bottom:32px">
          <div style="font-size:36px;margin-bottom:8px">💊</div>
          <div style="font-family:'DM Serif Display',Georgia,serif;font-size:1.6rem;color:#534AB7">RosterRx</div>
          <div style="font-size:.78rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#98988f;margin-top:3px">Staff Portal</div>
        </div>
        ${err?`<div style="background:rgba(163,45,45,.08);border:1px solid rgba(163,45,45,.2);border-radius:12px;padding:11px 16px;font-size:13px;color:#A32D2D;margin-bottom:14px;text-align:center">${esc(err)}</div>`:''}
        <div style="background:#fff;border:1px solid rgba(24,24,22,.09);border-radius:22px;padding:24px;box-shadow:0 4px 24px rgba(0,0,0,.06)">
          <div style="margin-bottom:14px">
            <label style="font-size:.7rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#58584e;display:block;margin-bottom:6px">Email</label>
            <input id="l-email" type="email" autocomplete="email" placeholder="your@email.com" class="input" style="background:#f5f5f0">
          </div>
          <div style="margin-bottom:20px">
            <label style="font-size:.7rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#58584e;display:block;margin-bottom:6px">PIN</label>
            <input id="l-pin" type="password" inputmode="numeric" maxlength="6" placeholder="••••" class="input" style="letter-spacing:6px;font-size:1.4rem;background:#f5f5f0">
          </div>
          <button id="l-btn" class="btn btn-primary" style="width:100%" onclick="doLogin()">Sign in</button>
        </div>
        <p style="text-align:center;margin-top:14px;font-size:12px;color:#98988f">First time? Leave PIN blank and sign in with your email to set a new PIN.</p>
      </div>
    </div>`;
  qs('#l-pin')?.addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin(); });
  qs('#l-email')?.addEventListener('keydown', e=>{ if(e.key==='Enter') qs('#l-pin')?.focus(); });
}

function showSetPin(emp, allData) {
  document.body.innerHTML = `
    <div style="min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;background:#f0efe9">
      <div style="width:100%;max-width:360px">
        <div style="text-align:center;margin-bottom:32px">
          <div style="font-size:36px;margin-bottom:8px">💊</div>
          <div style="font-family:'DM Serif Display',Georgia,serif;font-size:1.6rem;color:#534AB7">RosterRx</div>
          <div style="font-size:.78rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#98988f;margin-top:3px">Staff Portal</div>
        </div>
        <div style="background:#fff;border:1px solid rgba(24,24,22,.09);border-radius:22px;padding:24px;box-shadow:0 4px 24px rgba(0,0,0,.06)">
          <div style="font-size:1.05rem;font-weight:700;color:#181816;margin-bottom:6px">Hi ${esc(emp.first)}, welcome!</div>
          <div style="font-size:13px;color:#58584e;margin-bottom:20px;line-height:1.5">Please set a 4-digit PIN. You'll use this to clock in and out on the Dukasa Time Clock.</div>
          <div id="pin-err" style="display:none;background:rgba(163,45,45,.08);border:1px solid rgba(163,45,45,.2);border-radius:10px;padding:10px 14px;font-size:13px;color:#A32D2D;margin-bottom:14px"></div>
          <div style="margin-bottom:14px">
            <label style="font-size:.7rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#58584e;display:block;margin-bottom:6px">Choose a PIN</label>
            <input id="sp-pin1" type="password" inputmode="numeric" maxlength="4" placeholder="••••" class="input" style="letter-spacing:6px;font-size:1.4rem;background:#f5f5f0">
          </div>
          <div style="margin-bottom:20px">
            <label style="font-size:.7rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#58584e;display:block;margin-bottom:6px">Confirm PIN</label>
            <input id="sp-pin2" type="password" inputmode="numeric" maxlength="4" placeholder="••••" class="input" style="letter-spacing:6px;font-size:1.4rem;background:#f5f5f0">
          </div>
          <button id="sp-btn" class="btn btn-primary" style="width:100%" onclick="doSetPin('${emp.id}')">Set PIN &amp; sign in</button>
        </div>
      </div>
    </div>`;
  // pre-load the allData so doSetPin can use it
  state.allData = allData;
  state.emp = emp;
  qs('#sp-pin2')?.addEventListener('keydown', e=>{ if(e.key==='Enter') doSetPin(emp.id); });
}

async function doSetPin(empId) {
  const pin1 = (qs('#sp-pin1')?.value||'').trim();
  const pin2 = (qs('#sp-pin2')?.value||'').trim();
  const errEl = qs('#pin-err');
  const btn = qs('#sp-btn');

  function pinErr(msg) { if(errEl){errEl.style.display='block';errEl.textContent=msg;} }

  if(!pin1 || pin1.length < 4) return pinErr('PIN must be 4 digits.');
  if(!/^\d+$/.test(pin1))      return pinErr('PIN must be digits only.');
  if(pin1 !== pin2)             return pinErr('PINs do not match — please try again.');

  if(btn){btn.textContent='Saving…';btn.disabled=true;}
  try {
    // Update staff array with new PIN and save back to GAS
    const staffArr = getList('staff');
    const idx = staffArr.findIndex(s => s.id === empId);
    if(idx < 0) throw new Error('Staff record not found.');
    staffArr[idx].pin = pin1;
    await saveList('staff', staffArr);
    // Update local state and proceed into the app
    state.emp = staffArr[idx];
    localStorage.setItem('dukasa_sx', JSON.stringify({id:state.emp.id, email:state.emp.email, ts:Date.now()}));
    toast('PIN set successfully!', 'success');
    buildApp();
  } catch(e) {
    if(btn){btn.textContent='Set PIN & sign in';btn.disabled=false;}
    pinErr('Could not save PIN: ' + e.message);
  }
}

async function doLogin() {
  const email = (qs('#l-email')?.value||'').trim().toLowerCase();
  const pin   = (qs('#l-pin')?.value||'').trim();
  const btn   = qs('#l-btn');
  if (!email) { showLogin('Please enter your email address.'); return; }
  if (btn) { btn.textContent='Signing in…'; btn.disabled=true; }
  try {
    const res = await gasGet('getAll');
    if (!res.ok) throw new Error(res.error||'Could not load data');
    state.allData = res.data||{};
    const staffArr = getList('staff');
    const empByEmail = staffArr.find(s=>(s.email||'').toLowerCase()===email);

    // No account found for this email
    if (!empByEmail) { showLogin('No account found for that email address.'); return; }

    // No PIN set yet — show set-PIN screen (first login flow)
    if (!empByEmail.pin || String(empByEmail.pin).trim()==='') {
      showSetPin(empByEmail, res.data||{});
      return;
    }

    // PIN provided but wrong
    if (!pin) { showLogin('Please enter your PIN, or leave it blank if you haven\'t set one yet.'); return; }
    if (String(empByEmail.pin) !== pin) { showLogin('Incorrect PIN — please try again.'); return; }

    state.emp = empByEmail;
    localStorage.setItem('dukasa_sx', JSON.stringify({id:empByEmail.id, email:empByEmail.email, ts:Date.now()}));
    buildApp();
  } catch(e) { showLogin('Could not connect: '+e.message); }
}

function trySession() {
  try {
    const s = JSON.parse(localStorage.getItem('dukasa_sx')||'null');
    if (!s || Date.now()-s.ts > 12*3600*1000) { localStorage.removeItem('dukasa_sx'); return false; }
    return s;
  } catch(e) { return false; }
}

function signOut() { localStorage.removeItem('dukasa_sx'); location.reload(); }

// ── APP SHELL ──────────────────────────────────────────────────
function buildApp() {
  const emp = state.emp;
  document.body.innerHTML = `
    <div id="app" class="app-shell">
      <header class="topbar">
        <div class="brand-wrap">
          <div class="brand">💊 RosterRx</div>
          <div class="brand-sub">${esc(emp.role||'')}</div>
        </div>
        <div class="topbar-actions">
          <div class="avatar">${esc(initials(emp))}</div>
          <button class="btn btn-secondary btn-sm" onclick="signOut()">Sign out</button>
        </div>
      </header>
      <main class="content">
        <section id="view-home"    class="view active"></section>
        <section id="view-roster"  class="view"></section>
        <section id="view-leave"   class="view"></section>
        <section id="view-ot"      class="view"></section>
        <section id="view-hours"   class="view"></section>
        <section id="view-profile" class="view"></section>
      </main>
      <nav class="tabbar">
        <button class="tab active" data-view="home">    <span class="tab-icon">🏠</span><span class="tab-label">Home</span></button>
        <button class="tab"        data-view="roster">  <span class="tab-icon">📅</span><span class="tab-label">Roster</span></button>
        <button class="tab"        data-view="leave">   <span class="tab-icon">🌈</span><span class="tab-label">Leave</span></button>
        <button class="tab"        data-view="ot">      <span class="tab-icon">⏰</span><span class="tab-label">OT</span></button>
        <button class="tab"        data-view="hours">   <span class="tab-icon">🕘</span><span class="tab-label">Hours</span></button>
        <button class="tab"        data-view="profile"> <span class="tab-icon">👤</span><span class="tab-label">Profile</span></button>
      </nav>
    </div>`;
  qsa('.tab').forEach(t=>t.addEventListener('click',()=>nav(t.dataset.view)));
  window.addEventListener('scroll', syncTopbar, {passive:true});
  initPullToRefresh();
  renderAll();
  startSync();
  startTicker();
}

function nav(name) {
  state.currentView = name;
  qsa('.view').forEach(v=>v.classList.toggle('active', v.id==='view-'+name));
  qsa('.tab').forEach(t=>t.classList.toggle('active', t.dataset.view===name));
  anim(qs('#view-'+name));
  window.scrollTo({top:0,behavior:'smooth'});
  syncTopbar();
}

function syncTopbar() {
  const tb=qs('.topbar'); if(!tb) return;
  const s=window.scrollY>8;
  tb.style.boxShadow = s ? '0 4px 20px rgba(0,0,0,.08)' : 'none';
}

function anim(root=document) {
  if (!root) return;
  qsa('.page-header,.card,.kpi,.week-strip,.btn-row',root).forEach((el,i)=>{
    el.classList.remove('fade-in-up','delay-1','delay-2','delay-3','delay-4');
    void el.offsetWidth;
    el.classList.add('fade-in-up');
    if (!el.classList.contains('page-header')) el.classList.add('delay-'+(Math.min((i%4)+1,4)));
  });
}

function renderAll() {
  renderHome(); renderRoster(); renderLeave(); renderOT(); renderHours(); renderProfile();
  anim(qs('#view-'+state.currentView));
}

// ── HOME ───────────────────────────────────────────────────────
function renderHome() {
  const emp      = state.emp;
  const shifts   = getList('shifts').filter(s=>s.empId===emp.id&&s.published);
  const sick     = getList('sickDays').filter(s=>s.empId===emp.id);
  const leaves   = getList('leaveRequests').filter(l=>l.empId===emp.id);
  const td       = today();
  const ws       = weekStart(0);

  const todayShift = shifts.find(s=>s.date===td);
  const todaySick  = sick.find(s=>s.date===td);
  const todayLeave = leaves.find(l=>l.status==='approved'&&l.from<=td&&l.to>=td);

  let todayCard;
  if (todaySick) {
    todayCard=`<div class="card card-compact" style="border-color:rgba(163,45,45,.25);background:rgba(163,45,45,.06)"><span style="font-weight:600;color:#A32D2D">🤒 Sick day recorded today</span></div>`;
  } else if (todayLeave) {
    todayCard=`<div class="card card-compact" style="border-color:rgba(15,110,86,.2);background:rgba(15,110,86,.06)"><span style="font-weight:600;color:#0F6E56">🏖 On approved leave today</span></div>`;
  } else if (todayShift) {
    const h=shiftHrs(todayShift);
    todayCard=`<div class="card card-purple">
      <div style="font-size:.72rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#534AB7;margin-bottom:4px">Today's shift</div>
      <div style="font-family:'DM Serif Display',Georgia,serif;font-size:1.9rem;letter-spacing:-.03em;color:#181816">${esc(todayShift.start)} – ${esc(todayShift.end)}</div>
      <div class="list-copy" style="margin-top:3px">${todayShift.breakMin||0} min break · ${h.toFixed(1)} hrs</div>
    </div>`;
  } else {
    todayCard=`<div class="card card-compact"><span class="helper-note">No shift scheduled today.</span></div>`;
  }

  const week = Array.from({length:7},(_,i)=>{
    const ds=addDays(ws,i); const d=new Date(ds+'T00:00:00');
    return {dow:d.toLocaleDateString('en-AU',{weekday:'short'}),num:d.getDate(),ds,
      hasShift:shifts.some(s=>s.date===ds), isSick:sick.some(s=>s.date===ds), isToday:ds===td};
  });

  const upcoming = shifts.filter(s=>s.date>td).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,5);
  const now      = new Date();

  qs('#view-home').innerHTML=`
    <div class="page-header">
      <div>
        <h1 class="page-title">Hello, ${esc(emp.first)}! 👋</h1>
        <div class="page-subtitle" id="home-date">${now.toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long'})}</div>
      </div>
      <div class="hero-time">
        <div class="hero-time-big" id="home-clock">${now.toLocaleTimeString('en-AU',{hour:'2-digit',minute:'2-digit'})}</div>
        <div class="hero-time-small">local time</div>
      </div>
    </div>
    ${todayCard}
    <div class="section-label">This week at a glance</div>
    <div class="week-strip">
      ${week.map(d=>`
        <div class="week-pill ${d.isToday?'active':''}">
          <span class="week-pill-name">${esc(d.dow)}</span>
          <span class="week-pill-num">${d.num}</span>
          ${d.hasShift&&!d.isSick?'<span style="display:block;width:5px;height:5px;border-radius:50%;background:#534AB7;margin:3px auto 0;opacity:.5"></span>':''}
          ${d.isSick?'<span style="font-size:9px;display:block;margin-top:2px">🤒</span>':''}
        </div>`).join('')}
    </div>
    <div class="section-label">Upcoming shifts</div>
    <div class="info-grid">
      ${upcoming.length?upcoming.map(s=>`
        <div class="card list-card">
          <div>
            <div class="list-title">${esc(FDOW(s.date))}, ${esc(FDS(s.date))}</div>
            <div class="list-copy">${esc(s.start)} – ${esc(s.end)} · ${s.breakMin||0}min break</div>
          </div>
          <div class="list-meta">${shiftHrs(s).toFixed(1)}h</div>
        </div>`).join(''):'<div class="helper-note">No upcoming shifts scheduled.</div>'}
    </div>`;
}

// ── ROSTER ─────────────────────────────────────────────────────
function renderRoster() {
  const emp    = state.emp;
  const ws     = weekStart(state.weekOffset);
  const we     = addDays(ws,6);
  const shifts = getList('shifts').filter(s=>s.empId===emp.id&&s.published);
  const sick   = getList('sickDays').filter(s=>s.empId===emp.id);
  const leaves = getList('leaveRequests').filter(l=>l.empId===emp.id&&l.status==='approved');
  const td     = today();
  const wkTot  = shifts.filter(s=>s.date>=ws&&s.date<=we).reduce((t,s)=>t+shiftHrs(s),0);

  const days = Array.from({length:7},(_,i)=>{
    const ds=addDays(ws,i);
    return {ds, shift:shifts.find(s=>s.date===ds), sick:sick.find(s=>s.date===ds),
      leave:leaves.find(l=>l.from<=ds&&l.to>=ds), isToday:ds===td};
  });

  qs('#view-roster').innerHTML=`
    <div class="page-header stack">
      <h1 class="page-title">My roster</h1>
      <div class="page-subtitle">${esc(FDS(ws))} – ${esc(FDS(we))} 2026 · ${wkTot.toFixed(1)} hrs</div>
      <div class="btn-row" style="margin-top:12px">
        <button class="btn btn-secondary btn-sm" onclick="rNav(-1)">‹ Previous week</button>
        <button class="btn btn-secondary btn-sm" onclick="rNav(1)">Next week ›</button>
      </div>
    </div>
    <div class="info-grid">
      ${days.map(d=>{
        const dObj=new Date(d.ds+'T00:00:00');
        const dow=dObj.toLocaleDateString('en-AU',{weekday:'short'}).toUpperCase();
        const num=dObj.getDate();
        let label='Off', meta='', bdr='', bg='';
        if (d.sick)  { label='Sick day'; bdr='rgba(163,45,45,.3)'; bg='rgba(163,45,45,.04)'; }
        else if (d.leave) { label=d.leave.type; bdr='rgba(15,110,86,.2)'; bg='rgba(15,110,86,.04)'; }
        else if (d.shift) { label=`${d.shift.start}–${d.shift.end}`; meta=`${shiftHrs(d.shift).toFixed(1)} hrs · ${d.shift.breakMin||0}m break`; }
        if (d.isToday) bdr='#534AB7';
        return `<div class="card list-card" style="${bdr?`border-color:${bdr};`:''}${bg?`background:${bg};`:''}${d.isToday?'border-width:2px;':''}" >
          <div style="display:flex;gap:14px;align-items:flex-start;width:100%">
            <div style="min-width:44px;text-align:center;flex-shrink:0">
              <div style="font-size:.62rem;font-weight:700;letter-spacing:.07em;color:#98988f">${esc(dow)}</div>
              <div style="font-family:'DM Serif Display',Georgia,serif;font-size:1.8rem;line-height:1;margin-top:2px;color:${d.isToday?'#534AB7':'#181816'}">${num}</div>
            </div>
            <div style="flex:1">
              <div class="list-title">${esc(label)}</div>
              ${meta?`<div class="list-copy">${esc(meta)}</div>`:''}
              ${d.shift&&d.isToday?`<button class="btn btn-secondary btn-sm" style="margin-top:8px;font-size:.78rem" onclick="openLate()">⏱ Running late?</button>`:''}
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>
    <div id="late-wrap"></div>`;
}

window.rNav = function(d) { state.weekOffset+=d; renderRoster(); };

window.openLate = function() {
  // Remove any existing modal
  const existing = qs('#late-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'late-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:500;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.45);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);animation:fadeIn .2s ease';
  modal.innerHTML = `
    <div style="width:100%;max-width:520px;background:#fff;border-radius:22px 22px 0 0;padding:24px 20px calc(24px + env(safe-area-inset-bottom,0px));animation:slideUp .28s cubic-bezier(.22,1,.36,1)">
      <div style="width:36px;height:4px;background:rgba(24,24,22,.15);border-radius:2px;margin:0 auto 20px"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
        <div style="font-family:'DM Serif Display',Georgia,serif;font-size:1.4rem;color:#181816">Running late</div>
        <button onclick="qs('#late-modal').remove()" style="width:32px;height:32px;border-radius:50%;background:rgba(24,24,22,.07);display:flex;align-items:center;justify-content:center;font-size:16px;color:#58584e;border:none;cursor:pointer">✕</button>
      </div>
      <div class="form-grid">
        <div class="input-wrap">
          <label>Reason <span style="color:#A32D2D">*</span></label>
          <textarea class="textarea" id="late-r" rows="2" placeholder="e.g. Traffic, transport delay..." style="min-height:72px"></textarea>
        </div>
        <div class="input-wrap">
          <label>Estimated arrival time <span style="color:#A32D2D">*</span></label>
          <input class="input" type="time" id="late-eta">
        </div>
        <label style="display:flex;align-items:center;gap:12px;font-size:.9rem;font-weight:600;cursor:pointer;padding:12px 14px;background:rgba(24,24,22,.04);border-radius:var(--r-sm);border:1px solid var(--border)">
          <input type="checkbox" id="late-c" style="width:20px;height:20px;accent-color:#534AB7;cursor:pointer;flex-shrink:0">
          I have contacted my manager
        </label>
        <div id="late-err" style="display:none;color:#A32D2D;font-size:.82rem;padding:8px 12px;background:rgba(163,45,45,.06);border-radius:var(--r-sm)">⚠ Please fill in both the reason and estimated arrival time.</div>
        <div class="btn-row full-span" style="margin-top:4px">
          <button class="btn btn-secondary" style="flex:1" onclick="qs('#late-modal').remove()">Cancel</button>
          <button class="btn btn-primary" style="flex:1;background:#BA7517;box-shadow:0 4px 16px rgba(186,117,23,.3)" onclick="submitLate()">Notify manager</button>
        </div>
      </div>
    </div>
    <style>
      @keyframes fadeIn { from{opacity:0} to{opacity:1} }
      @keyframes slideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
    </style>`;
  // Tap backdrop to dismiss
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
  // Focus reason field after animation
  setTimeout(() => qs('#late-r')?.focus(), 300);
};

window.submitLate = async function() {
  const reason=qs('#late-r')?.value.trim(), eta=qs('#late-eta')?.value.trim(), contacted=qs('#late-c')?.checked||false;
  const errEl=qs('#late-err');
  if (!reason||!eta){ if(errEl) errEl.style.display='block'; return; }
  if (errEl) errEl.style.display='none';
  const td=today(), shift=getList('shifts').find(s=>s.empId===state.emp.id&&s.date===td&&s.published);
  if (!shift) return;
  // Show sending state
  const sendBtn = qs('#late-modal .btn-primary');
  if (sendBtn) { sendBtn.textContent='Sending…'; sendBtn.disabled=true; }
  try {
    await gasPost({action:'sendEmail',fn:'sendRunningLateNotification',
      payload:{empId:state.emp.id,date:td,shiftStart:shift.start,shiftEnd:shift.end,reason,eta,contacted}});
    qs('#late-modal')?.remove();
    toast('Your manager has been notified. ✓','success');
  } catch(e){
    if(sendBtn){ sendBtn.textContent='Notify manager'; sendBtn.disabled=false; }
    toast('Could not send — please contact your manager directly.','error');
  }
};

// ── LEAVE ──────────────────────────────────────────────────────
function renderLeave() {
  const emp    = state.emp;
  const reqs   = getList('leaveRequests').filter(l=>l.empId===emp.id).sort((a,b)=>(b.submitted||b.from||'').localeCompare(a.submitted||a.from||''));
  const sick   = getList('sickDays').filter(s=>s.empId===emp.id).sort((a,b)=>b.date.localeCompare(a.date));
  const mcs    = getList('medCerts').filter(m=>m.empId===emp.id);
  const pending= reqs.filter(l=>l.status==='pending');
  const hist   = reqs.filter(l=>l.status!=='pending');

  const badge = s => {
    if (s==='approved') return `<span class="badge badge-green">approved</span>`;
    if (s==='declined') return `<span class="badge badge-red">declined</span>`;
    return `<span class="badge badge-amber">pending</span>`;
  };

  qs('#view-leave').innerHTML=`
    <div class="page-header">
      <div><h1 class="page-title">Leave</h1></div>
      <button class="btn btn-primary" onclick="openLeaveForm()">+ Request leave</button>
    </div>
    <div id="lv-form"></div>
    <div class="section-label">Pending requests</div>
    ${pending.length?pending.map(l=>`
      <div class="card list-card" style="margin-bottom:0">
        <div><div class="list-title">${esc(l.type)}</div><div class="list-copy">${esc(FDS(l.from))} – ${esc(FDS(l.to))}</div></div>
        ${badge(l.status)}
      </div>`).join(''):'<div class="helper-note">No pending requests.</div>'}
    <div class="section-label">History</div>
    <div class="info-grid">
      ${hist.length?hist.map(l=>`
        <div class="card list-card">
          <div>
            <div class="list-title">${esc(l.type)}</div>
            <div class="list-copy">${esc(FDS(l.from))} – ${esc(FDS(l.to))}</div>
            ${l.denialReason?`<div class="list-copy" style="color:#A32D2D;font-size:.78rem;margin-top:3px">Reason: ${esc(l.denialReason)}</div>`:''}
          </div>
          ${badge(l.status)}
        </div>`).join(''):'<div class="helper-note">No leave history.</div>'}
    </div>
    <div class="section-label">Sick days &amp; medical certificates</div>
    <div class="info-grid">
      ${sick.length?sick.map(sk=>{
        const mc=mcs.find(m=>m.sickId===sk.id||m.date===sk.date);
        return `<div class="card list-card">
          <div>
            <div class="list-title">Sick day — ${esc(FDS(sk.date))}</div>
            ${mc?`<div class="list-copy" style="color:#0F6E56;font-size:.78rem">✓ Uploaded ${esc(new Date(mc.uploadedAt).toLocaleDateString('en-AU'))}</div>`
                :`<div class="list-copy" style="color:#BA7517;font-size:.78rem">⚠ Medical certificate required</div>`}
          </div>
          ${mc?`<span class="badge badge-green">MC uploaded</span>`
              :`<button class="btn btn-secondary btn-sm" onclick="openMC('${esc(sk.id)}','${esc(sk.date)}')">Upload MC</button>`}
        </div>`;}).join(''):'<div class="helper-note">No sick days recorded.</div>'}
    </div>
    <div id="mc-wrap"></div>`;
}

window.openLeaveForm = function() {
  const c=qs('#lv-form'); if(!c) return;
  c.innerHTML=`
    <div class="card" style="margin-bottom:14px">
      <div style="font-family:'DM Serif Display',Georgia,serif;font-size:1.3rem;margin-bottom:16px">New leave request</div>
      <div class="form-grid">
        <div class="input-wrap"><label>Leave type</label>
          <select class="select" id="lv-t"><option>Annual Leave</option><option>Sick Leave</option><option>Personal Leave</option><option>Carers Leave</option><option>Unpaid Leave</option></select>
        </div>
        <div class="input-wrap"><label>From</label><input class="input" id="lv-f" type="date"></div>
        <div class="input-wrap"><label>To</label><input class="input" id="lv-to" type="date"></div>
        <div class="input-wrap full-span"><label>Notes (optional)</label><textarea class="textarea" id="lv-n" placeholder="Any additional context..."></textarea></div>
        <div id="lv-err" style="display:none;color:#A32D2D;font-size:.82rem" class="full-span">⚠ Please enter valid from and to dates.</div>
        <div class="btn-row full-span">
          <button class="btn btn-secondary" onclick="qs('#lv-form').innerHTML=''">Cancel</button>
          <button class="btn btn-primary" onclick="submitLeave()">Submit request</button>
        </div>
      </div>
    </div>`;
};

window.submitLeave = async function() {
  const type=qs('#lv-t')?.value, from=qs('#lv-f')?.value, to=qs('#lv-to')?.value, notes=(qs('#lv-n')?.value||'').trim();
  const errEl=qs('#lv-err');
  if (!from||!to||from>to){ if(errEl) errEl.style.display='block'; return; }
  if (errEl) errEl.style.display='none';
  const reqs=getList('leaveRequests');
  reqs.push({id:'lr'+Date.now(),empId:state.emp.id,type,from,to,notes,status:'pending',submitted:new Date().toISOString()});
  try {
    await saveList('leaveRequests',reqs);
    await gasPost({action:'sendEmail',fn:'sendLeaveRequestNotification',payload:{empId:state.emp.id,type,from,to,notes,reason:notes}});
    if(qs('#lv-form')) qs('#lv-form').innerHTML='';
    renderLeave(); toast('Leave request submitted! ✓','success');
  } catch(e){ toast('Could not submit — please try again.','error'); }
};

// ── MC UPLOAD ──────────────────────────────────────────────────
let _mcS=null, _mcD=null, _mcF=null;

window.openMC = function(sickId,date) {
  _mcS=sickId; _mcD=date; _mcF=null;
  const c=qs('#mc-wrap'); if(!c) return;
  c.innerHTML=`
    <div class="card" style="margin-top:12px">
      <div style="font-family:'DM Serif Display',Georgia,serif;font-size:1.2rem;margin-bottom:4px">Upload certificate</div>
      <div class="list-copy" style="margin-bottom:16px">For sick day: ${esc(FDS(date))}</div>
      <div id="mc-drop" style="border:2px dashed rgba(24,24,22,.15);border-radius:var(--r-md);padding:24px;text-align:center;cursor:pointer;margin-bottom:14px" onclick="qs('#mc-fi').click()">
        <div style="font-size:26px;margin-bottom:6px">📎</div>
        <div style="font-size:.88rem;font-weight:600;color:#58584e">Tap to select file</div>
        <div style="font-size:.75rem;color:#98988f;margin-top:3px">JPG or PNG recommended · PDF accepted</div>
      </div>
      <input type="file" id="mc-fi" accept=".pdf,.jpg,.jpeg,.png" style="display:none" onchange="handleMC(event)">
      <div id="mc-st" style="display:none;font-size:.82rem;margin-bottom:12px"></div>
      <div id="mc-err" style="display:none;color:#A32D2D;font-size:.82rem;margin-bottom:10px">⚠ Please select a file first.</div>
      <div class="btn-row">
        <button class="btn btn-secondary" style="flex:1" onclick="qs('#mc-wrap').innerHTML=''">Cancel</button>
        <button class="btn btn-primary" style="flex:1" onclick="submitMC()">Upload certificate</button>
      </div>
    </div>`;
};

window.handleMC = function(e) {
  const file=e.target.files[0]; if(!file) return;
  const st=qs('#mc-st'); if(st){st.style.display='block';st.style.color='#98988f';st.textContent='⏳ Processing...';}
  if (file.type.startsWith('image/')) {
    const r=new FileReader(); r.onload=ev=>{
      const img=new Image(); img.onload=()=>{
        const MAX=1400; let w=img.width,h=img.height;
        if(w>MAX||h>MAX){if(w>h){h=Math.round(h*MAX/w);w=MAX;}else{w=Math.round(w*MAX/h);h=MAX;}}
        const cv=document.createElement('canvas'); cv.width=w;cv.height=h;
        cv.getContext('2d').drawImage(img,0,0,w,h);
        const data=cv.toDataURL('image/jpeg',0.75);
        const kb=Math.round(data.length*.75/1024);
        _mcF={data,name:file.name.replace(/\.[^.]+$/,'.jpg'),type:'image/jpeg'};
        if(st){st.style.color='#0F6E56';st.textContent=`✓ ${file.name} ready (${kb}KB compressed)`;}
        const drop=qs('#mc-drop'); if(drop) drop.style.borderColor='#0F6E56';
      }; img.src=ev.target.result;
    }; r.readAsDataURL(file);
  } else {
    const r=new FileReader(); r.onload=ev=>{
      const kb=Math.round(ev.target.result.length*.75/1024);
      _mcF={data:ev.target.result,name:file.name,type:file.type};
      if(st){st.style.color=kb>1500?'#BA7517':'#0F6E56';st.textContent=`✓ ${file.name} (${kb}KB)`;}
    }; r.readAsDataURL(file);
  }
};

window.submitMC = async function() {
  const errEl=qs('#mc-err');
  if(!_mcF){if(errEl)errEl.style.display='block';return;}
  const mcId='mc'+Date.now(), {data,name,type}=_mcF;
  const mcs=getList('medCerts');
  mcs.push({id:mcId,empId:state.emp.id,date:_mcD,sickId:_mcS,fileName:name,fileType:type,uploadedAt:new Date().toISOString(),managerNotified:false});
  await saveList('medCerts',mcs);
  if(qs('#mc-wrap')) qs('#mc-wrap').innerHTML='';
  _mcF=null; renderLeave();
  toast(`Uploading certificate...`,'info',15000);
  try {
    const r=await gasPost({action:'uploadMC',mcId,fileName:name,fileType:type,data});
    if(r?.result?.ok){
      toast('Certificate uploaded! ✓','success');
      await gasPost({action:'sendEmail',fn:'sendMCUploadNotification',payload:{empId:state.emp.id,date:_mcD,fileName:name}});
    } else { toast('Upload error — try a JPG photo.','error'); }
  } catch(e){ toast('Upload failed — please try again.','error'); }
};

// ── OT ─────────────────────────────────────────────────────────
function renderOT() {
  const emp  = state.emp;
  const reqs = getList('otRequests').filter(o=>o.empId===emp.id).sort((a,b)=>b.date.localeCompare(a.date));
  const badge = o => {
    if(o.approved===true)  return `<span class="badge badge-green">Approved</span>`;
    if(o.approved===false) return `<span class="badge badge-red">Denied</span>`;
    return `<span class="badge badge-amber">Pending</span>`;
  };

  // Manager-requested OT awaiting staff response
  // Show if: requested by manager AND approved is null AND staff hasn't responded yet
  const needsResponse = reqs.filter(o=>
    o.requestedBy==='manager' &&
    (o.approved===null || o.approved===undefined) &&
    o.staffConfirmed!==true &&
    o.staffConfirmed!==false
  );

  qs('#view-ot').innerHTML=`
    <div class="page-header">
      <div><h1 class="page-title">Overtime</h1><div class="page-subtitle">Submit and review overtime requests.</div></div>
      <button class="btn btn-primary" onclick="openOTForm()">+ Request OT</button>
    </div>
    <div id="ot-form"></div>

    ${needsResponse.length ? `
      <div class="section-label" style="color:#BA7517">⏰ Action required — manager OT request</div>
      <div class="info-grid" style="margin-bottom:20px">
        ${needsResponse.map(o=>`
          <div class="card" style="border-color:rgba(186,117,23,.35);background:rgba(186,117,23,.05)">
            <div class="list-title">${esc(FDOW(o.date))}, ${esc(FDS(o.date))}</div>
            <div class="list-copy" style="margin-top:2px">${esc(o.start)} – ${esc(o.end)}</div>
            ${o.reason?`<div class="list-copy" style="margin-top:5px;font-style:italic">"${esc(o.reason)}"</div>`:''}
            <div class="btn-row" style="margin-top:12px">
              <button class="btn btn-primary" style="flex:1;background:#0F6E56;box-shadow:0 4px 12px rgba(15,110,86,.25)" onclick="respondManagerOT('${o.id}',true)">✓ Accept</button>
              <button class="btn btn-secondary" style="flex:1;color:#A32D2D;border-color:rgba(163,45,45,.3)" onclick="respondManagerOT('${o.id}',false)">✕ Decline</button>
            </div>
          </div>`).join('')}
      </div>
    ` : ''}

    <div class="section-label">All OT requests</div>
    <div class="info-grid">
      ${reqs.length?reqs.map(o=>`
        <div class="card list-card">
          <div>
            <div class="list-title">${esc(FDOW(o.date))}, ${esc(FDS(o.date))}</div>
            <div class="list-copy">${esc(o.start)} – ${esc(o.end)}</div>
            ${o.requestedBy==='manager'?`<div class="list-copy" style="font-size:.75rem;color:#534AB7;margin-top:2px">Requested by manager</div>`:''}
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
            ${badge(o)}
            ${o.requestedBy==='manager'&&o.staffConfirmed===true?`<span style="font-size:.72rem;color:#0F6E56">✓ You accepted</span>`:''}
            ${o.requestedBy==='manager'&&o.staffConfirmed===false?`<span style="font-size:.72rem;color:#A32D2D">✕ You declined</span>`:''}
          </div>
        </div>`).join(''):'<div class="helper-note">No OT requests yet.</div>'}
    </div>`;
}

window.respondManagerOT = async function(otId, accepted) {
  const reqs = getList('otRequests');
  const idx  = reqs.findIndex(o=>o.id===otId);
  if(idx<0) return;
  reqs[idx].staffConfirmed = accepted;
  try {
    await saveList('otRequests', reqs);
    await gasPost({action:'sendEmail', fn:'sendOTStaffResponse', payload:{
      otId, empId: state.emp.id,
      date: reqs[idx].date, start: reqs[idx].start, end: reqs[idx].end,
      accepted
    }});
    renderOT();
    toast(accepted ? 'OT accepted — manager notified ✓' : 'OT declined — manager notified', accepted ? 'success' : 'info');
  } catch(e) { toast('Could not respond — please try again.', 'error'); }
};

window.openOTForm = function() {
  const c=qs('#ot-form'); if(!c) return;
  c.innerHTML=`
    <div class="card" style="margin-bottom:14px">
      <div style="font-family:'DM Serif Display',Georgia,serif;font-size:1.3rem;margin-bottom:16px">New overtime request</div>
      <div class="form-grid">
        <div class="input-wrap"><label>Date</label><input class="input" id="ot-d" type="date"></div>
        <div class="input-wrap"><label>From</label><input class="input" id="ot-s" type="time"></div>
        <div class="input-wrap"><label>To</label><input class="input" id="ot-e" type="time"></div>
        <div class="input-wrap full-span"><label>Reason</label><textarea class="textarea" id="ot-r" placeholder="Why is OT needed?"></textarea></div>
        <div id="ot-err" style="display:none;color:#A32D2D;font-size:.82rem" class="full-span">⚠ Please fill in date and times.</div>
        <div class="btn-row full-span">
          <button class="btn btn-secondary" onclick="qs('#ot-form').innerHTML=''">Cancel</button>
          <button class="btn btn-primary" onclick="submitOT()">Submit</button>
        </div>
      </div>
    </div>`;
};

window.submitOT = async function() {
  const date=qs('#ot-d')?.value, start=qs('#ot-s')?.value, end=qs('#ot-e')?.value, reason=(qs('#ot-r')?.value||'').trim();
  const errEl=qs('#ot-err');
  if(!date||!start||!end){if(errEl)errEl.style.display='block';return;}
  if(errEl)errEl.style.display='none';
  const reqs=getList('otRequests');
  reqs.push({id:'ot'+Date.now(),empId:state.emp.id,date,start,end,reason,approved:null,requestedBy:'staff',submitted:new Date().toISOString()});
  try{
    await saveList('otRequests',reqs);
    await gasPost({action:'sendEmail',fn:'sendOTRequestNotification',payload:{empId:state.emp.id,date,start,end,reason}});
    if(qs('#ot-form')) qs('#ot-form').innerHTML='';
    renderOT(); toast('OT request submitted! ✓','success');
  }catch(e){toast('Could not submit — please try again.','error');}
};

// ── HOURS ──────────────────────────────────────────────────────
function renderHours() {
  const emp    = state.emp;
  const shifts = getList('shifts').filter(s=>s.empId===emp.id&&s.published);
  const td     = today();
  const ws     = weekStart(0), we=addDays(ws,6);
  const now    = new Date();
  const ms     = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
  const me     = localISO(new Date(now.getFullYear(),now.getMonth()+1,0));

  const wkH  = shifts.filter(s=>s.date>=ws&&s.date<=we).reduce((t,s)=>t+shiftHrs(s),0);
  const moH  = shifts.filter(s=>s.date>=ms&&s.date<=me).reduce((t,s)=>t+shiftHrs(s),0);
  const futH = shifts.filter(s=>s.date>td).reduce((t,s)=>t+shiftHrs(s),0);
  const rec  = shifts.filter(s=>s.date<=td).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,8);

  qs('#view-hours').innerHTML=`
    <div class="page-header stack">
      <h1 class="page-title">Hours</h1>
      <div class="page-subtitle">A summary of your rostered hours.</div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="kpi-label">This week</div><div class="kpi-value">${wkH.toFixed(1)}h</div></div>
      <div class="kpi"><div class="kpi-label">This month</div><div class="kpi-value">${moH.toFixed(1)}h</div></div>
      <div class="kpi"><div class="kpi-label">Upcoming</div><div class="kpi-value">${futH.toFixed(1)}h</div></div>
      <div class="kpi"><div class="kpi-label">Status</div><div class="kpi-value" style="font-size:1rem;color:#0F6E56">Live ✓</div></div>
    </div>
    <div class="section-label">Recent shifts</div>
    <div class="info-grid">
      ${rec.length?rec.map(s=>`
        <div class="card list-card">
          <div>
            <div class="list-title">${esc(FDS(s.date))} <span style="font-weight:400;color:#58584e">${esc(FDOW(s.date))}</span></div>
            <div class="list-copy">${esc(s.start)} – ${esc(s.end)} · ${s.breakMin||0}m break</div>
          </div>
          <div class="list-meta">${shiftHrs(s).toFixed(1)}h</div>
        </div>`).join(''):'<div class="helper-note">No past shifts on record.</div>'}
    </div>`;
}

// ── PROFILE ────────────────────────────────────────────────────
function renderProfile() {
  const emp=state.emp;
  qs('#view-profile').innerHTML=`
    <div class="page-header stack">
      <h1 class="page-title">Profile</h1>
      <div class="page-subtitle">Your account details.</div>
    </div>
    <div class="info-grid">
      <div class="card">
        <div class="list-title" style="font-size:1.18rem">${esc(emp.first)} ${esc(emp.last)}</div>
        <div class="list-copy">${esc(emp.role)}</div>
      </div>
      ${emp.email?`<div class="card"><div class="small-muted">Email</div><div class="list-title" style="font-size:1rem;margin-top:6px">${esc(emp.email)}</div></div>`:''}
      ${emp.phone?`<div class="card"><div class="small-muted">Phone</div><div class="list-title" style="font-size:1rem;margin-top:6px">${esc(emp.phone)}</div></div>`:''}
    </div>

    <div class="section-label" style="margin-top:24px">Security</div>
    <div class="card" style="margin-bottom:8px">
      <div style="font-weight:600;font-size:.95rem;margin-bottom:4px">Time Clock PIN</div>
      <div style="font-size:.85rem;color:#58584e;margin-bottom:14px">Your 4-digit PIN is used to clock in and out on the Dukasa Time Clock. Change it here at any time.</div>
      <div id="pin-change-err" style="display:none;background:rgba(163,45,45,.08);border:1px solid rgba(163,45,45,.2);border-radius:10px;padding:10px 14px;font-size:13px;color:#A32D2D;margin-bottom:12px"></div>
      <div id="pin-change-ok" style="display:none;background:rgba(15,110,86,.08);border:1px solid rgba(15,110,86,.2);border-radius:10px;padding:10px 14px;font-size:13px;color:#0F6E56;margin-bottom:12px"></div>
      <div class="form-grid">
        <div class="input-wrap">
          <label>New PIN</label>
          <input class="input" id="pc-pin1" type="password" inputmode="numeric" maxlength="4" placeholder="••••" style="letter-spacing:4px;font-size:1.2rem">
        </div>
        <div class="input-wrap">
          <label>Confirm PIN</label>
          <input class="input" id="pc-pin2" type="password" inputmode="numeric" maxlength="4" placeholder="••••" style="letter-spacing:4px;font-size:1.2rem">
        </div>
        <div class="btn-row full-span">
          <button class="btn btn-primary" id="pc-btn" onclick="changePin()">Update PIN</button>
        </div>
      </div>
    </div>

    <div style="margin-top:20px;text-align:center">
      <button class="btn btn-secondary" onclick="signOut()">Sign out</button>
    </div>`;
}

window.changePin = async function() {
  const pin1 = (qs('#pc-pin1')?.value||'').trim();
  const pin2 = (qs('#pc-pin2')?.value||'').trim();
  const errEl = qs('#pin-change-err');
  const okEl  = qs('#pin-change-ok');
  const btn   = qs('#pc-btn');

  if(errEl) errEl.style.display='none';
  if(okEl)  okEl.style.display='none';

  function pinErr(msg){if(errEl){errEl.style.display='block';errEl.textContent=msg;}}
  function pinOk(msg) {if(okEl) {okEl.style.display='block'; okEl.textContent=msg;}}

  if(!pin1||pin1.length<4) return pinErr('PIN must be 4 digits.');
  if(!/^\d+$/.test(pin1))  return pinErr('PIN must be digits only.');
  if(pin1!==pin2)          return pinErr('PINs do not match — please try again.');

  if(btn){btn.textContent='Saving…';btn.disabled=true;}
  try {
    const res = await gasGet('getAll');
    if(!res.ok) throw new Error(res.error||'Could not load data');
    state.allData = res.data||{};
    const staffArr = getList('staff');
    const idx = staffArr.findIndex(s=>s.id===state.emp.id);
    if(idx<0) throw new Error('Staff record not found.');
    staffArr[idx].pin = pin1;
    await saveList('staff', staffArr);
    state.emp = staffArr[idx];
    // Update session
    localStorage.setItem('dukasa_sx', JSON.stringify({id:state.emp.id, email:state.emp.email, ts:Date.now()}));
    if(btn){btn.textContent='Update PIN';btn.disabled=false;}
    if(qs('#pc-pin1')) qs('#pc-pin1').value='';
    if(qs('#pc-pin2')) qs('#pc-pin2').value='';
    pinOk('PIN updated successfully. Your new PIN is active immediately.');
  } catch(e) {
    if(btn){btn.textContent='Update PIN';btn.disabled=false;}
    pinErr('Could not save: '+e.message);
  }
};

// ── PULL TO REFRESH ────────────────────────────────────────────
function initPullToRefresh() {
  let startY = 0, pulling = false, indicator = null;
  const THRESHOLD = 72; // px to pull before triggering

  function getIndicator() {
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'ptr-indicator';
      indicator.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999;display:flex;align-items:center;justify-content:center;height:0;overflow:hidden;background:rgba(83,74,183,.08);transition:height .2s,opacity .2s;font-size:13px;font-weight:600;color:#534AB7;letter-spacing:.04em;gap:8px';
      indicator.innerHTML = '<span id="ptr-spinner" style="display:inline-block;transition:transform .3s">↓</span><span id="ptr-label">Pull to refresh</span>';
      document.body.appendChild(indicator);
    }
    return indicator;
  }

  document.addEventListener('touchstart', e => {
    if (window.scrollY === 0) { startY = e.touches[0].clientY; pulling = true; }
  }, {passive:true});

  document.addEventListener('touchmove', e => {
    if (!pulling) return;
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0) { pulling = false; return; }
    const ind = getIndicator();
    const progress = Math.min(dy / THRESHOLD, 1);
    ind.style.height = Math.min(dy * 0.4, THRESHOLD * 0.6) + 'px';
    ind.style.opacity = progress;
    qs('#ptr-spinner').style.transform = `rotate(${progress * 180}deg)`;
    qs('#ptr-label').textContent = progress >= 1 ? 'Release to refresh' : 'Pull to refresh';
  }, {passive:true});

  document.addEventListener('touchend', async e => {
    if (!pulling) return;
    pulling = false;
    const dy = e.changedTouches[0].clientY - startY;
    const ind = getIndicator();
    if (dy >= THRESHOLD) {
      // Triggered — show spinner and refresh
      ind.style.height = '44px';
      qs('#ptr-spinner').style.transform = 'rotate(360deg)';
      qs('#ptr-label').textContent = 'Refreshing…';
      qs('#ptr-spinner').style.animation = 'ptr-spin .8s linear infinite';
      if (!qs('#ptr-style')) {
        const s = document.createElement('style');
        s.id = 'ptr-style';
        s.textContent = '@keyframes ptr-spin{to{transform:rotate(360deg)}}';
        document.head.appendChild(s);
      }
      try {
        const res = await gasGet('getAll');
        if (res.ok) {
          state.allData = res.data || {};
          const fresh = getList('staff').find(s => s.id === state.emp.id);
          if (fresh) state.emp = fresh;
          renderAll();
          toast('Updated ✓', 'success', 1500);
        }
      } catch(e) { toast('Could not refresh — check connection.', 'error'); }
    }
    // Collapse indicator
    ind.style.height = '0';
    ind.style.opacity = '0';
    if (qs('#ptr-spinner')) qs('#ptr-spinner').style.animation = '';
  }, {passive:true});
}

// ── LOCAL TICKER — updates clock and date every second ─────────
// Runs independently of GAS sync so UI is always live.
let _tickerDate = today();
function startTicker() {
  // Update immediately, then every second
  tickOnce();
  setInterval(tickOnce, 1000);
}
function tickOnce() {
  const now = new Date();
  // Update clock display if it exists on screen
  const clockEl = qs('#home-clock');
  if (clockEl) clockEl.textContent = now.toLocaleTimeString('en-AU', {hour:'2-digit', minute:'2-digit'});
  const dateEl = qs('#home-date');
  if (dateEl) dateEl.textContent = now.toLocaleDateString('en-AU', {weekday:'long', day:'numeric', month:'long'});
  // At midnight, today() changes — re-render the full home view so
  // today's shift card, week strip active day etc. all update correctly
  const newDate = today();
  if (newDate !== _tickerDate) {
    _tickerDate = newDate;
    renderHome();
    renderRoster(); // roster highlights change at midnight too
  }
}

// ── SYNC ───────────────────────────────────────────────────────
let _lm='0';
async function startSync() {
  try { _lm=(await gasGet('ping')).lastModified||'0'; } catch(e){}
  setInterval(async()=>{
    try {
      const ts=(await gasGet('ping')).lastModified||'0';
      if(ts!==_lm){
        _lm=ts;
        const r=await gasGet('getAll');
        if(r.ok){ state.allData=r.data||{}; const f=getList('staff').find(s=>s.id===state.emp.id); if(f) state.emp=f; renderAll(); }
      }
    }catch(e){}
  },10000);
}

// ── LOADING ────────────────────────────────────────────────────
function showLoading() {
  document.body.innerHTML=`
    <div style="min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f0efe9;gap:16px">
      <div style="font-size:36px">💊</div>
      <div style="font-family:'DM Serif Display',Georgia,serif;font-size:1.3rem;color:#534AB7">Loading your portal…</div>
      <div style="width:40px;height:3px;background:#e0dfd9;border-radius:2px;overflow:hidden">
        <div style="height:100%;background:#534AB7;border-radius:2px;animation:lb 1.2s ease-in-out infinite"></div>
      </div>
    </div>
    <style>@keyframes lb{0%{width:0%;margin-left:0}50%{width:70%;margin-left:15%}100%{width:0%;margin-left:100%}}</style>`;
}

// ── INIT ───────────────────────────────────────────────────────
async function init() {
  const sx=trySession();
  if (sx) {
    showLoading();
    try {
      const r=await gasGet('getAll');
      if(!r.ok) throw new Error(r.error||'Failed');
      state.allData=r.data||{};
      const emp=getList('staff').find(s=>s.id===sx.id&&(s.email||'').toLowerCase()===sx.email?.toLowerCase());
      if(emp){ state.emp=emp; buildApp(); return; }
    } catch(e){ console.warn('Session restore failed:',e.message); }
    localStorage.removeItem('dukasa_sx');
  }
  showLogin();
}

init();
