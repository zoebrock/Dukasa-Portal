// ============================================================
//  Dukasa Staff Portal — Vercel App
//  Live data via /api/gas proxy → Google Apps Script
// ============================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabase = createClient(
  'https://jfowikvmnqlebranlggf.supabase.co',
  'sb_publishable_-x_b0RnXfUjoKML_cRYvjA_r2udt8PQ'
);

const CONFIG = {
  GAS_URL: '/api/gas',
  SESSION_VERSION: 4
};

const state = {
  currentView: 'home',
  emp: null,
  allData: {},
  weekOffset: 0,
  leaveCalendarMonth: null,
  empIds: [],
};

function normaliseId_(value) {
  return String(value ?? '').trim();
}

function setEmployeeContext_(emp, legacyId = '') {
  state.emp = emp || null;
  const email = String(emp?.email || '').trim().toLowerCase();
  const ids = new Set([normaliseId_(emp?.id), normaliseId_(legacyId)].filter(Boolean));

  // Retain every staff ID attached to the same email. This prevents historical
  // shifts disappearing when a staff record has been recreated with a new ID.
  if (email) {
    getList('staff').forEach(row => {
      if (String(row?.email || '').trim().toLowerCase() === email) {
        const id = normaliseId_(row.id);
        if (id) ids.add(id);
      }
    });
  }

  state.empIds = [...ids];
}

function isMyEmpId_(value) {
  const id = normaliseId_(value);
  return !!id && (state.empIds || []).some(x => normaliseId_(x) === id);
}
function isPublishedShift_(shift) {
  const v = shift?.published;
  return v === true || v === 1 || String(v).trim().toLowerCase() === 'true' || String(shift?.status || '').trim().toLowerCase() === 'published';
}

async function fetchAllRows_(table, configureQuery = null) {
  const pageSize = 1000;
  const allRows = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from(table)
      .select('*')
      .range(from, from + pageSize - 1);

    if (typeof configureQuery === 'function') {
      query = configureQuery(query);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`${table}: ${error.message}`);
    }

    const rows = data || [];
    allRows.push(...rows);

    if (rows.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return {
    data: allRows,
    error: null
  };
}

async function getAllData() {
  const [
    staff,
    shifts,
    clockEvents,
    leaveRequests,
    otRequests,
    sickDays,
    medCerts,
    announcements
  ] = await Promise.all([
    fetchAllRows_('staff', query =>
      query.order('id', { ascending: true })
    ),

    fetchAllRows_('shifts', query =>
      query
        .order('date', { ascending: true })
        .order('start', { ascending: true })
        .order('id', { ascending: true })
    ),

    supabase
      .from('clock_events')
      .select('*')
      .gte('date', addDays(today(), -14))
      .lte('date', addDays(today(), 1))
      .order('date', { ascending: false })
      .order('time', { ascending: false })
      .limit(2000),

    fetchAllRows_('leave_requests', query =>
      query.order('id', { ascending: true })
    ),

    fetchAllRows_('ot_requests', query =>
      query.order('id', { ascending: true })
    ),

    fetchAllRows_('sick_days', query =>
      query.order('id', { ascending: true })
    ),

    fetchAllRows_('med_certs', query =>
      query.order('id', { ascending: true })
    ),

    fetchAllRows_('announcements', query =>
      query.order('id', { ascending: true })
    )
  ]);

  if (staff.error) {
    throw new Error('staff: ' + staff.error.message);
  }

  if (shifts.error) {
    throw new Error('shifts: ' + shifts.error.message);
  }

  const optionalResults = {
    clockEvents,
    leaveRequests,
    otRequests,
    sickDays,
    medCerts,
    announcements
  };

  Object.entries(optionalResults).forEach(([name, result]) => {
    if (result?.error) {
      console.warn(name + ' load skipped:', result.error.message);
    }
  });

  const mappedShifts = (shifts.data || []).map(s => ({
    ...s,
    id: normaliseId_(s.id),
    empId: normaliseId_(s.emp_id ?? s.empId),
    date: cleanDate_(s.date),
    start: cleanTime_(s.start),
    end: cleanTime_(s.end),
    published: isPublishedShift_(s),
    breakMin: s.break_min,
    paidBreakMin: s.paid_break_min,
    isOT: s.is_ot,
    otId: s.ot_id,
    otOriginalStart: s.ot_original_start,
    otOriginalEnd: s.ot_original_end,
    otAnnotations: s.ot_annotations || [],
    entryType: s.entry_type,
    leaveType: s.leave_type,
    leaveReason: s.leave_reason
  }));

  const mappedClockEvents = (clockEvents.data || []).map(e => ({
    ...e,
    empId: normaliseId_(e.emp_id ?? e.empId),
    shiftId: normaliseId_(e.shift_id ?? e.shiftId),
    photoUrl: e.photo_url || e.photoUrl,
    ts: e.ts || e.timestamp || e.created_at || null,
    date: cleanDate_(e.date),
    time: cleanTime_(e.time),
    type: String(e.type || '').trim()
  }));

  const mappedLeaveRequests = (leaveRequests.data || []).map(l => ({
    ...l,
    empId: normaliseId_(l.emp_id ?? l.empId),
    changeRequested: l.change_requested,
    previousFrom: l.previous_from,
    previousTo: l.previous_to,
    previousType: l.previous_type,
    previousStatus: l.previous_status,
    editedAt: l.edited_at,
    lastEditedBy: l.last_edited_by,
    requestKind: l.request_kind,
    partialStart: l.partial_start,
    partialEnd: l.partial_end,
    medicalCertificateRequired: l.medical_certificate_required
  }));

  const mappedOTRequests = (otRequests.data || []).map(o => ({
    ...o,
    empId: normaliseId_(o.emp_id ?? o.empId),
    requestedBy: o.requested_by,
    staffRead: o.staff_read,
    availConfirmed: o.avail_confirmed,
    staffConfirmed: o.staff_confirmed,
    staffDenialReason: o.staff_denial_reason,
    task: o.task || ''
  }));

  const mappedSickDays = (sickDays.data || []).map(s => ({
    ...s,
    empId: normaliseId_(s.emp_id ?? s.empId)
  }));

  const mappedMedCerts = (medCerts.data || []).map(m => ({
    ...m,
    empId: normaliseId_(m.emp_id ?? m.empId),
    sickId: m.sick_id,
    fileName: m.file_name,
    fileType: m.file_type,
    uploadedAt: m.uploaded_at,
    managerNotified: m.manager_notified
  }));

  const mappedAnnouncements = (announcements.data || []).map(a => ({
    ...a,
    staffIds: a.staffIds || a.staff_ids || a.staffids || [],
    notifyStaff: a.notifyStaff || a.notify_staff || false
  }));

  console.log('Staff Portal data loaded:', {
    staff: staff.data?.length || 0,
    shifts: mappedShifts.length,
    futureShifts: mappedShifts.filter(
      shift => shift.date >= today()
    ).length,
    publishedFutureShifts: mappedShifts.filter(
      shift => shift.date >= today() && shift.published
    ).length
  });

  return {
    ok: true,
    data: {
      rx3_staff: JSON.stringify(
        (staff.data || []).map(row => ({
          ...row,
          id: normaliseId_(row.id)
        }))
      ),
      rx3_shifts: JSON.stringify(mappedShifts),
      rx3_clockEvents: JSON.stringify(mappedClockEvents),
      rx3_leaveRequests: JSON.stringify(mappedLeaveRequests),
      rx3_otRequests: JSON.stringify(mappedOTRequests),
      rx3_sickDays: JSON.stringify(mappedSickDays),
      rx3_medCerts: JSON.stringify(mappedMedCerts),
      rx3_announcements: JSON.stringify(mappedAnnouncements)
    }
  };
}

// ── UTILS ─────────────────────────────────────────────────────
const qs  = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// Make helpers available to inline onclick handlers
window.qs = qs;
window.qsa = qsa;

// IMPORTANT: never use toISOString() for local dates — it returns UTC
// which is yesterday in AU timezones before ~10-11am
function localISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
const today = () => localISO(new Date());

function FD(iso)   { return iso ? new Date(iso+'T00:00:00').toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long',year:'numeric'}) : ''; }
function FDS(iso)  {
  if (!iso) return '';
  // Ensure ISO format — reject obviously wrong formats
  const d = new Date(String(iso).length === 10 ? iso+'T00:00:00' : iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-AU',{day:'numeric',month:'short'});
}
function FDOW(iso) {
  if (!iso) return '';
  const d = new Date(String(iso).length === 10 ? iso+'T00:00:00' : iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-AU',{weekday:'long'});
}

function parseTime(t) { if (!t) return 0; const [h,m] = t.split(':').map(Number); return h*60+m; }
function roundHalf(n) {
  return Math.round(n * 2) / 2;
}

// Paid rostered hours = gross shift length minus unpaid 30 min only
function shiftHrs(s) {
  if (!s || !s.start || !s.end) return 0;
  const grossMins = parseTime(s.end) - parseTime(s.start);
  return roundHalf(Math.max(0, (grossMins - 30) / 60));
}

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
function datesBetween(from, to) {
  const out = [];
  let d = from;

  while (d <= to) {
    out.push(d);
    d = addDays(d, 1);
  }

  return out;
}
function getList(key) {
  try {
    const arr = JSON.parse(state.allData['rx3_'+key]||'[]');
    if (key === 'staff') {
      return arr.filter(s=>s&&s.id&&(s.email||s.first||s.last)).map(s=>({
        ...s,
        id: normaliseId_(s.id),
        first: s.first||'', last: s.last||'', email: s.email||'',
        role: s.role||'', pin: s.pin||'', color: s.color||'#534AB7'
      }));
    }
    if (key === 'shifts') {
      arr.forEach(s => {
        if (s.start && s.start.length > 5) s.start = cleanTime_(s.start);
        if (s.end   && s.end.length   > 5) s.end   = cleanTime_(s.end);
        if (s.date  && s.date.length  > 10) s.date = cleanDate_(s.date);
        s.id = normaliseId_(s.id);
        s.empId = normaliseId_(s.empId ?? s.emp_id);
        s.published = isPublishedShift_(s);
      });
    }
    if (key === 'sickDays') {
      arr.forEach(s => { if (s.date && s.date.length > 10) s.date = cleanDate_(s.date); });
    }
    if (key === 'leaveRequests') {
      arr.forEach(l => {
        if (l.from && l.from.length > 10) l.from = cleanDate_(l.from);
        if (l.to   && l.to.length   > 10) l.to   = cleanDate_(l.to);
      });
    }
    if (key === 'clockEvents') {
      arr.forEach(e => {
        if (e.date && e.date.length > 10) e.date = cleanDate_(e.date);
        if (e.time && e.time.length > 5)  e.time = cleanTime_(e.time);
      });
    }
    return arr;
  } catch(e){ return []; }
}

function cleanTime_(str) {
  // Extract HH:MM from any date string e.g. "Sat Dec 30 1899 09:00:00 GMT+1000..."
  if (!str) return str;
  const m = String(str).match(/(\d{1,2}):(\d{2})/);
  if (m) return String(m[1]).padStart(2,'0')+':'+m[2];
  return str;
}

function cleanDate_(str) {
  // Extract YYYY-MM-DD from any date string
  if (!str) return str;
  const m = String(str).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1]+'-'+m[2]+'-'+m[3];
  // Try to parse as date and convert
  const d = new Date(str);
  if (!isNaN(d.getTime())) return localISO(d);
  return str;
}
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
function gasUrl(action, params = {}) {
  const url = new URL(CONFIG.GAS_URL, window.location.origin);

  if (action) url.searchParams.set('action', action);

  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) {
      url.searchParams.set(k, String(v));
    }
  });

  url.searchParams.set('_', String(Date.now()));
  return url.toString();
}

async function parseGasResponse(res) {
  const text = await res.text();

  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Bad response from backend: ' + text.slice(0, 200));
  }
}

async function gasGet(action, params = {}) {
  const res = await fetch(gasUrl(action, params), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store'
  });

  const json = await parseGasResponse(res);
  if (!res.ok) throw new Error(json.error || 'Backend request failed');
  return json;
}

async function gasPost(body = {}) {
  const res = await fetch(gasUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(body || {}),
    cache: 'no-store'
  });

  const json = await parseGasResponse(res);
  if (!res.ok) throw new Error(json.error || 'Backend request failed');
  return json;
}

async function saveList(key, arr) {
  state.allData['rx3_' + key] = JSON.stringify(arr);

const tableMap = {
  staff: 'staff',
  shifts: 'shifts',
  clockEvents: 'clock_events',
  leaveRequests: 'leave_requests',
  otRequests: 'ot_requests',
  sickDays: 'sick_days',
  medCerts: 'med_certs'
};

  const table = tableMap[key];
  if (!table) return;

  if (key === 'clockEvents') {
    throw new Error('Staff portal must not write clock events.');
  }

  const mapped = arr.map(item => {
    const copy = { ...item };

    if (key === 'shifts') {
      copy.emp_id = copy.empId;
      copy.break_min = copy.breakMin;
      copy.is_ot = copy.isOT;
      copy.ot_id = copy.otId;
      delete copy.empId;
      delete copy.breakMin;
      delete copy.isOT;
      delete copy.otId;
    }

if (key === 'leaveRequests') {
  copy.emp_id = copy.empId ?? copy.emp_id;

  copy.change_requested = Boolean(copy.changeRequested ?? copy.change_requested ?? false);
  copy.previous_from = copy.previousFrom ?? copy.previous_from ?? null;
  copy.previous_to = copy.previousTo ?? copy.previous_to ?? null;
  copy.previous_type = copy.previousType ?? copy.previous_type ?? null;
  copy.previous_status = copy.previousStatus ?? copy.previous_status ?? null;

  copy.edited_at = copy.editedAt ?? copy.edited_at ?? null;
  copy.last_edited_by = copy.lastEditedBy ?? copy.last_edited_by ?? null;

  // Partial leave fields shared with the manager portal.
  copy.request_kind = copy.requestKind ?? copy.request_kind ?? 'full_day';
  copy.partial_start = copy.request_kind === 'partial_day'
    ? (copy.partialStart ?? copy.partial_start ?? null)
    : null;
  copy.partial_end = copy.request_kind === 'partial_day'
    ? (copy.partialEnd ?? copy.partial_end ?? null)
    : null;
  copy.medical_certificate_required = Boolean(
    copy.medicalCertificateRequired ?? copy.medical_certificate_required ?? false
  );

  // These Supabase columns are NOT NULL. A pending staff request must always
  // start unsynchronised so the manager portal can process it after approval.
  copy.synced_to_roster = Boolean(copy.syncedToRoster ?? copy.synced_to_roster ?? false);
  copy.synced_to_leave_tracker = Boolean(
    copy.syncedToLeaveTracker ?? copy.synced_to_leave_tracker ?? false
  );

  copy.denial_reason = copy.denialReason ?? copy.denial_reason ?? null;
  copy.processed_at = copy.processedAt ?? copy.processed_at ?? null;

  delete copy.empId;
  delete copy.changeRequested;
  delete copy.previousFrom;
  delete copy.previousTo;
  delete copy.previousType;
  delete copy.previousStatus;
  delete copy.editedAt;
  delete copy.lastEditedBy;
  delete copy.requestKind;
  delete copy.partialStart;
  delete copy.partialEnd;
  delete copy.medicalCertificateRequired;
  delete copy.syncedToRoster;
  delete copy.syncedToLeaveTracker;
  delete copy.denialReason;
  delete copy.processedAt;
}

    if (key === 'otRequests') {
      copy.emp_id = copy.empId;
      copy.requested_by = copy.requestedBy;
      copy.staff_read = copy.staffRead;
      copy.avail_confirmed = copy.availConfirmed;
      delete copy.empId;
      delete copy.requestedBy;
      delete copy.staffRead;
      delete copy.availConfirmed;
    }

    if (key === 'sickDays') {
      copy.emp_id = copy.empId;
      copy.shift_id = copy.shiftId || null;
      copy.med_cert_id = copy.medCertId || null;
      copy.mc_uploaded = copy.mcUploaded || false;

      delete copy.empId;
      delete copy.shiftId;
      delete copy.medCertId;
      delete copy.mcUploaded;
    }

if (key === 'medCerts') {
  copy.emp_id = copy.empId;
  copy.sick_id = copy.sickId;
  copy.file_name = copy.fileName;
  copy.file_type = copy.fileType;
  copy.file_id = copy.fileId;
  copy.file_url = copy.fileUrl;
  copy.download_url = copy.downloadUrl;
  copy.drive_folder_id = copy.driveFolderId;
  copy.uploaded_at = copy.uploadedAt;
  copy.manager_notified = copy.managerNotified;
  copy.sick_day_ids = copy.sickDayIds || [];

  delete copy.empId;
  delete copy.sickId;
  delete copy.fileName;
  delete copy.fileType;
  delete copy.fileId;
  delete copy.fileUrl;
  delete copy.downloadUrl;
  delete copy.driveFolderId;
  delete copy.uploadedAt;
  delete copy.managerNotified;
  delete copy.sickDayIds;

  delete copy.file_id;
  delete copy.file_url;
  delete copy.drive_folder_id;
  delete copy.download_url;
}

    return copy;
  });

  if (!mapped.length) return;

  const { error } = await supabase
    .from(table)
    .upsert(mapped, { onConflict: 'id' });

  if (error) throw new Error(error.message);
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
  setEmployeeContext_(emp);
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
    const idx = staffArr.findIndex(s => normaliseId_(s.id) === normaliseId_(empId));
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
    const res = await getAllData();
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

    setEmployeeContext_(empByEmail);
    localStorage.setItem('dukasa_sx', JSON.stringify({id:empByEmail.id, email:empByEmail.email, ts:Date.now(), v:CONFIG.SESSION_VERSION}));
    buildApp();
  } catch(e) { showLogin('Could not connect: '+e.message); }
}

function trySession() {
  try {
    const s = JSON.parse(localStorage.getItem('dukasa_sx')||'null');
    // Clear session if it's old version or expired
    if (!s || Date.now()-s.ts > 12*3600*1000 || s.v !== CONFIG.SESSION_VERSION) {
      localStorage.removeItem('dukasa_sx');
      return false;
    }
    return s;
  } catch(e) { localStorage.removeItem('dukasa_sx'); return false; }
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
  startClockEventsRealtime();
  startShiftsRealtime();
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

window.nav = nav;

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
  // DEBUG — remove after fix
  console.log('renderHome: emp.id='+emp.id+' emp.first='+emp.first+' emp.email='+emp.email);
  const allShiftRaw = getList('shifts');
  console.log('Total shifts from server: '+allShiftRaw.length);
  const myRaw = allShiftRaw.filter(s=>isMyEmpId_(s.empId));
  console.log('My shifts (by empId): '+myRaw.length);
  const myPub = myRaw.filter(s=>s.published);
  console.log('My published shifts: '+myPub.length);
  if(myPub.length>0) console.log('Sample: '+JSON.stringify(myPub[0]));
  const shifts   = getList('shifts').filter(s=>isMyEmpId_(s.empId)&&s.published);
  const partialLeaves = shifts.filter(s =>
  s.entryType === 'leave' || s.entry_type === 'leave'
);

const normalShifts = shifts.filter(s =>
  !(s.entryType === 'leave' || s.entry_type === 'leave')
);
  const sick     = getList('sickDays').filter(s=>isMyEmpId_(s.empId));
  const leaves   = getList('leaveRequests').filter(l=>isMyEmpId_(l.empId));
  const medCerts = getList('medCerts').filter(m=>isMyEmpId_(m.empId));

  // ── OT REQUESTS AWAITING MY RESPONSE ────────────────────────
  const pendingOT = getList('otRequests')
    .filter(o=>isMyEmpId_(o.empId))
    .filter(o=>
      o.requestedBy==='manager' &&
      o.availConfirmed!==true &&
      o.approved!==true &&
      o.approved!==false
    )
    .sort((a,b)=>(a.date||"").localeCompare(b.date||""));

const outstandingMC = sick.find(s =>
  !medCerts.some(mc =>
    mc.sickId === s.id ||
    (mc.empId === emp.id && mc.date === s.date)
  )
);
  const td       = today();
  const ws       = weekStart(0);

  const todayShift = normalShifts.find(s=>s.date===td);
  const todayPartialLeaves = partialLeaves.filter(s=>s.date===td);
  const todaySick  = sick.find(s=>s.date===td);
  const todayLeave = leaves.find(l=>l.status==='approved'&&l.from<=td&&l.to>=td);

  // ── BREAK TRACKING ─────────────────────────────────────────────
  // Sort all clock events by ts (falling back to time string) so ordering is reliable
  const ce = getList('clockEvents')
    .filter(e=>isMyEmpId_(e.empId)&&e.date===td)
    .sort((a,b)=>(a.ts||a.time||'').localeCompare(b.ts||b.time||''));

  // Pair up break-start / break-end events chronologically
  // This correctly handles multiple breaks in one shift
  function calcBreakSessions(events) {
    const sessions = [];
    let pending = null;
    for (const e of events) {
      if (e.type==='break-start') { pending = e; }
      else if (e.type==='break-end' && pending) { sessions.push({start:pending, end:e}); pending=null; }
    }
    if (pending) sessions.push({start:pending, end:null}); // currently on break
    return sessions;
  }

  const breakSessions = calcBreakSessions(ce);
  const activeBreak   = breakSessions.find(s=>!s.end);  // currently on break
  const onBreak       = !!activeBreak;

  // Total break minutes used (completed sessions)
  const usedBreakMins = breakSessions
    .filter(s=>s.end)
    .reduce((sum, s)=>{
      const startMs = s.start.ts ? new Date(s.start.ts).getTime() : 0;
      const endMs   = s.end.ts   ? new Date(s.end.ts).getTime()   : 0;
      return sum + (endMs > startMs ? Math.floor((endMs-startMs)/60000) : 0);
    }, 0);

  // Break rules from shift length
  function shiftBreakInfo(shift) {
    if(!shift) return {total:30};
    const grossHrs = (parseTime(shift.end)-parseTime(shift.start))/60;
    if(grossHrs > 8)  return {total:50};
    if(grossHrs >= 8) return {total:40};
    return {total:30};
  }
  const breakInfo      = shiftBreakInfo(todayShift);
  const remainingMins  = Math.max(0, breakInfo.total - usedBreakMins);
  const hasBreakLeft   = remainingMins > 0;

  // Build break history lines for display
  const breakHistory = breakSessions.filter(s=>s.end).map(s=>`${s.start.time}–${s.end.time}`).join(', ');

// Build the banner — shown when on break OR when there are completed breaks
let breakBanner = '';

if (onBreak && activeBreak) {
  const bs = activeBreak.start;

  const startIso =
    bs.ts ||
    (bs.date && bs.time
      ? bs.date + 'T' + bs.time + ':00'
      : null);

  const startTimeLabel = bs.time || '';

  breakBanner = `
    <div
      id="break-timer-banner"
      class="break-card fade-in-up"
      data-start="${startIso || ''}"
      data-total="${remainingMins}"
    >
      <div class="break-title">
        ☕ On Break${startTimeLabel ? ' · started ' + startTimeLabel : ''}
      </div>

      <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:8px">
        <div>
          <div
            id="break-elapsed"
            class="break-main"
            style="margin-bottom:2px"
          >
            00:00
          </div>

          <div class="break-sub">
            elapsed
          </div>
        </div>

        <div
          id="break-remaining-label"
          class="badge badge-amber"
        >
          ${
            remainingMins > 0
              ? remainingMins + ' min remaining'
              : 'Break time used'
          }
        </div>
      </div>

      ${
        breakHistory
          ? `
          <div class="break-sub" style="margin-bottom:6px">
            Previous: ${breakHistory}
          </div>
        `
          : ''
      }

      <div class="small-muted">
        Clock back in at the Dukasa Time Clock when ready.
      </div>
    </div>
  `;

} else if (!onBreak && breakSessions.length > 0 && todayShift) {

  breakBanner = `
    <div class="break-card fade-in-up">

      <div class="break-title">
        Break
      </div>

      <div class="break-main">
        ${remainingMins} min remaining
      </div>

      <div class="break-sub">
        Used ${usedBreakMins} of ${breakInfo.total} min
      </div>

      ${
        breakHistory
          ? `
          <div class="break-sub" style="margin-top:8px">
            ${breakHistory}
          </div>
        `
          : ''
      }

    </div>
  `;
}

  // Show break info in Today's shift card — total break only, no paid/unpaid
  const breakLine = todayShift ? `${todayShift.breakMin||breakInfo.total} min break` : '';

  let todayCard;
  if (todaySick) {
    todayCard=`<div class="card card-compact" style="border-color:rgba(163,45,45,.25);background:rgba(163,45,45,.06)"><span style="font-weight:600;color:#A32D2D">🤒 Sick day recorded today</span></div>`;
  } else if (todayLeave) {
    todayCard=`<div class="card card-compact" style="border-color:rgba(15,110,86,.2);background:rgba(15,110,86,.06)"><span style="font-weight:600;color:#0F6E56">🏖 On approved leave today</span></div>`;
  } else if (todayShift) {
const h = shiftHrs(todayShift);
    todayCard=`<div class="card card-purple">
      <div style="font-size:.72rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#534AB7;margin-bottom:4px">Today's shift</div>
      <div style="font-family:'DM Serif Display',Georgia,serif;font-size:1.9rem;letter-spacing:-.03em;color:#181816">${esc(todayShift.start)} – ${esc(todayShift.end)}</div>
      <div class="list-copy" style="margin-top:3px">${breakLine} · ${h.toFixed(1)} hrs</div>
      ${todayPartialLeaves.length ? `
  <div style="margin-top:10px">
    ${todayPartialLeaves.map(pl=>`
      <div style="font-size:.82rem;font-weight:600;background:#FAECE7;color:#712B13;border-radius:10px;padding:6px 9px;margin-top:5px">
        Partial leave - ${esc(pl.leaveType || pl.leave_type || pl.status || 'Leave')}: ${esc(pl.start)}–${esc(pl.end)}
      </div>
    `).join('')}
  </div>
` : ''}
    </div>`;
  } else {
    todayCard=`<div class="card card-compact"><span class="helper-note">No shift scheduled today.</span></div>`;
  }

  // ── ANNOUNCEMENTS ──────────────────────────────────────────
  const allAnns = getList('announcements');
  const myAnns  = allAnns.filter(a => {
    const annDate = a.date && String(a.date).match(/^\d{4}-\d{2}-\d{2}$/) ? a.date : null;
    if(!annDate) return false; // skip announcements with invalid dates
    if(annDate < td) return false;
    const staffIds = a.staffIds || a.staff_ids || a.staffids || [];

if (staffIds.length > 0) {
  return staffIds.map(String).includes(String(emp.id));
}
    if(!a.roles||!a.roles.length) return true;
    if(a.roles.includes('All Staff')) return true;
    return a.roles.includes(emp.role);
  }).sort((a,b)=>(a.date||"").localeCompare(b.date||""));

  const annSection = myAnns.length ? `
    <div class="section-label" style="display:flex;align-items:center;gap:6px">
      <span>📣 Announcements</span>
      <span style="font-size:10px;background:#534AB7;color:#fff;border-radius:10px;padding:1px 7px;font-weight:700">${myAnns.length}</span>
    </div>
    <div class="info-grid" style="margin-bottom:4px">
      ${myAnns.map(a=>{
        const annDate = a.date && String(a.date).match(/^\d{4}-\d{2}-\d{2}$/) ? a.date : null;
        const dateObj = annDate ? new Date(annDate+'T00:00:00') : null;
        const dateLabel = dateObj ? dateObj.toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'}) : (a.date||'');
        const isToday = annDate===td;
        const isTomorrow = annDate===addDays(td,1);
        const relLabel = isToday?' · Today':isTomorrow?' · Tomorrow':'';
        return `<div class="card list-card" style="cursor:pointer;border-left:3px solid #534AB7;padding-left:12px" onclick="openAnnPopup('${a.id}')">
          <div style="flex:1;min-width:0">
            <div class="list-title" style="font-size:.95rem">${esc(a.title)}</div>
            <div class="list-copy" style="margin-top:3px;font-size:.8rem">📅 ${esc(dateLabel)}${esc(relLabel)}${a.time?` · 🕐 ${esc(a.time)}`:''}</div>
          </div>
          <div style="font-size:1.2rem;color:#534AB7;flex-shrink:0">›</div>
        </div>`;
      }).join('')}
    </div>` : '';

  const week = Array.from({length:7},(_,i)=>{
    const ds=addDays(ws,i); const d=new Date(ds+'T00:00:00');
    return {dow:d.toLocaleDateString('en-AU',{weekday:'short'}),num:d.getDate(),ds,
      hasShift:shifts.some(s=>s.date===ds), isSick:sick.some(s=>s.date===ds), isToday:ds===td};
  });

  // ── TODAY'S TEAM ─────────────────────────────────────────────
  const allStaff    = getList('staff');
  const allShifts   = getList('shifts').filter(s=>s.date===td&&s.published&&normaliseId_(s.empId)!==normaliseId_(emp.id));
  const allSick     = getList('sickDays').filter(s=>s.date===td);
  const allLeaves   = getList('leaveRequests').filter(l=>l.status==='approved'&&l.from<=td&&l.to>=td);

  // Build team list — only colleagues with a shift today
  const teamToday = allShifts.map(s=>{
    const col = allStaff.find(x=>normaliseId_(x.id)===normaliseId_(s.empId));
    if(!col) return null;
    const isSick  = allSick.some(sk=>sk.empId===col.id);
    const onLeave = allLeaves.find(l=>l.empId===col.id);
const netHrs = shiftHrs(s);
    return {col, s, isSick, onLeave, netHrs};
  }).filter(Boolean).sort((a,b)=>(a.col.first||"").localeCompare(b.col.first||""));

  const teamSection = teamToday.length ? `
    <div class="section-label">Today's team</div>
    <div class="info-grid" style="margin-bottom:4px">
      ${teamToday.map(({col,s,isSick,onLeave,netHrs})=>{
        const initials = (col.first[0]||'')+(col.last[0]||'');
        const statusBadge = isSick
          ? `<span style="font-size:.72rem;background:#FCEBEB;color:#791F1F;padding:1px 7px;border-radius:10px;font-weight:600">🤒 Sick</span>`
          : onLeave
          ? `<span style="font-size:.72rem;background:#FAEEDA;color:#633806;padding:1px 7px;border-radius:10px;font-weight:600">🏖 ${esc(onLeave.type.replace(' Leave',''))}</span>`
          : '';
        const shiftLine = isSick||onLeave
          ? `<div class="list-copy" style="text-decoration:line-through;opacity:.5">${esc(s.start)} – ${esc(s.end)}</div>`
          : `<div class="list-copy">${esc(s.start)} – ${esc(s.end)} · ${netHrs.toFixed(1)}h</div>`;
        return `<div class="card list-card" style="gap:10px">
          <div style="width:34px;height:34px;border-radius:50%;background:${col.color}22;color:${col.color};display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:700;flex-shrink:0">${esc(initials)}</div>
          <div style="flex:1;min-width:0">
            <div class="list-title" style="font-size:.9rem">${esc(col.first)} ${esc(col.last)}</div>
            ${shiftLine}
          </div>
          ${statusBadge}
        </div>`;
      }).join('')}
    </div>` : '';

  const pendingOTSection = pendingOT.length ? `
    <div class="section-label" style="display:flex;align-items:center;gap:6px">
      <span>⏰ Overtime awaiting your response</span>
      <span style="font-size:10px;background:#534AB7;color:#fff;border-radius:10px;padding:1px 7px;font-weight:700">${pendingOT.length}</span>
    </div>
    <div class="info-grid" style="margin-bottom:4px">
      ${pendingOT.map(o=>`
        <div class="card list-card" style="align-items:flex-start">
          <div style="flex:1;min-width:0">
            <div class="list-title">${esc(FDS(o.date))} · ${esc(o.start||'')} – ${esc(o.end||'')}</div>
            ${o.reason?`<div class="list-copy">${esc(o.reason)}</div>`:''}
          </div>
          <div style="display:flex;flex-direction:column;gap:7px;align-items:flex-end">
            <span class="badge badge-amber">Awaiting your response</span>
            <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
              <button class="btn btn-primary btn-sm" type="button" onclick="respondManagerOT('${o.id}', true)">Approve</button>
              <button class="btn btn-secondary btn-sm" type="button" onclick="respondManagerOT('${o.id}', false)">Decline</button>
            </div>
          </div>
        </div>
      `).join('')}
    </div>` : '';

  const upcoming = shifts.filter(s=>s.date>td).sort((a,b)=>(a.date||"").localeCompare(b.date||"")).slice(0,5);
  const now      = new Date();

  qs('#view-home').innerHTML=`
    <div class="page-header">
      <div>
        <h1 class="page-title">Hello, ${esc(emp.first || emp.last || 'there')}! 👋</h1>
        <div class="page-subtitle" id="home-date">${now.toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long'})}</div>
      </div>
      <div class="hero-time">
        <div class="hero-time-big" id="home-clock">${now.toLocaleTimeString('en-AU',{hour:'2-digit',minute:'2-digit'})}</div>
        <div class="hero-time-small">local time</div>
      </div>
    </div>
${todayCard}
${pendingOTSection}
${outstandingMC ? `
  <div class="card card-alert" style="margin:14px 0;padding:18px;border:1px solid rgba(163,45,45,.25);background:#FCEBEB;border-radius:18px">
    <div style="font-weight:700;color:#A32D2D;margin-bottom:6px">Medical certificate required</div>
    <div style="font-size:14px;color:#585854;margin-bottom:12px">
      You were marked as sick on ${esc(FDS(outstandingMC.date))}. Please upload your medical certificate when available.
    </div>
    <button class="btn btn-primary" onclick="window.nav('leave')">Upload medical certificate</button>
  </div>
` : ''}
${breakBanner}
${annSection}
    ${teamSection}
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
      ${upcoming.length?upcoming.map(s=>{
        const dayLabel = FDOW(s.date);
        const dateLabel = FDS(s.date);
        const hrs = shiftHrs(s);
        const grossMins2 = parseTime(s.end)-parseTime(s.start);
        const totalBreak2 = grossMins2/60>8?50:grossMins2/60>=8?40:30;
        return `<div class="card list-card">
          <div>
            <div class="list-title">${dayLabel?esc(dayLabel)+', ':''} ${esc(dateLabel)}</div>
            <div class="list-copy">${esc(s.start||'?')} – ${esc(s.end||'?')} · ${totalBreak2}min break</div>
          </div>
          <div class="list-meta">${isNaN(hrs)?'':hrs.toFixed(1)+'h'}</div>
        </div>`;
      }).join(''):'<div class="helper-note">No upcoming shifts scheduled.</div>'}
    </div>`;

}

window.openAnnPopup = function(annId) {
  const allAnns = getList('announcements');
  const a = allAnns.find(x => x.id === annId);
  if (!a) return;
  const existing = qs('#ann-popup');
  if (existing) existing.remove();

  const dateObj   = new Date(a.date+'T00:00:00');
  const dateFull  = dateObj.toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const rolesLabel = (a.roles||[]).join(', ') || 'All Staff';
  const audienceLabel = (a.staffIds&&a.staffIds.length>0) ? 'Selected staff members' : rolesLabel;
  const isToday   = a.date === today();
  const isTomorrow = a.date === addDays(today(),1);
  const relBadge  = isToday
    ? `<span style="background:#EEEDFE;color:#534AB7;font-size:.75rem;font-weight:700;padding:2px 10px;border-radius:20px;margin-left:8px">Today</span>`
    : isTomorrow
    ? `<span style="background:#FAEEDA;color:#BA7517;font-size:.75rem;font-weight:700;padding:2px 10px;border-radius:20px;margin-left:8px">Tomorrow</span>`
    : '';

  const popup = document.createElement('div');
  popup.id = 'ann-popup';
  popup.style.cssText = 'position:fixed;inset:0;z-index:500;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.45);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);animation:fadeIn .2s ease';
  popup.innerHTML = `
    <div style="width:100%;max-width:520px;background:#fff;border-radius:22px 22px 0 0;padding:0 0 calc(env(safe-area-inset-bottom,0px) + 8px);animation:slideUp .28s cubic-bezier(.22,1,.36,1);overflow:hidden">
      <!-- Purple header bar -->
      <div style="background:#534AB7;padding:20px 22px 18px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
          <div style="flex:1">
            <div style="font-size:.7rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#AFA9EC;margin-bottom:5px">📣 Announcement</div>
            <div style="font-size:1.25rem;font-weight:700;color:#fff;line-height:1.25">${esc(a.title)}</div>
          </div>
          <button onclick="document.getElementById('ann-popup').remove()" style="background:rgba(255,255,255,.15);border:none;color:#fff;border-radius:50%;width:32px;height:32px;font-size:18px;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;line-height:1">×</button>
        </div>
      </div>
      <!-- Details -->
      <div style="padding:18px 22px">
        <div style="display:flex;flex-direction:column;gap:10px">
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:1.2rem">📅</span>
            <div>
              <div style="font-size:.7rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#98988f">Date</div>
              <div style="font-size:.95rem;font-weight:600;color:#181816;margin-top:1px">${esc(dateFull)}${relBadge}</div>
            </div>
          </div>
          ${a.time?`<div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:1.2rem">🕐</span>
            <div>
              <div style="font-size:.7rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#98988f">Time</div>
              <div style="font-size:.95rem;font-weight:600;color:#181816;margin-top:1px">${esc(a.time)}</div>
            </div>
          </div>`:''}
          ${a.location?`<div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:1.2rem">📍</span>
            <div>
              <div style="font-size:.7rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#98988f">Location</div>
              <div style="font-size:.95rem;font-weight:600;color:#181816;margin-top:1px">${esc(a.location)}</div>
            </div>
          </div>`:''}
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:1.2rem">👥</span>
            <div>
              <div style="font-size:.7rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#98988f">Applies to</div>
              <div style="font-size:.9rem;color:#181816;margin-top:1px">${esc(audienceLabel)}</div>
            </div>
          </div>
          ${a.desc?`<div style="border-top:1px solid #e8e7e1;padding-top:12px;margin-top:2px">
            <div style="font-size:.7rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#98988f;margin-bottom:6px">Details</div>
            <div style="font-size:.9rem;color:#3a3a35;line-height:1.55;white-space:pre-wrap">${esc(a.desc)}</div>
          </div>`:''}
        </div>
        <button onclick="document.getElementById('ann-popup').remove()" class="btn btn-secondary" style="width:100%;margin-top:18px">Close</button>
      </div>
    </div>`;

  // Tap backdrop to dismiss
  popup.addEventListener('click', e=>{ if(e.target===popup) popup.remove(); });
  document.body.appendChild(popup);
};

// ── ROSTER ─────────────────────────────────────────────────────
function renderRoster() {
  const emp      = state.emp;
  const ws       = weekStart(state.weekOffset);
  const we       = addDays(ws,6);
  const td       = today();

  const myShifts = getList('shifts').filter(s=>isMyEmpId_(s.empId)&&s.published);
  const mySick   = getList('sickDays').filter(s=>isMyEmpId_(s.empId));
  const myLeaves = getList('leaveRequests').filter(l=>isMyEmpId_(l.empId)&&l.status==='approved');
  const wkTot    = myShifts.filter(s=>s.date>=ws&&s.date<=we).reduce((t,s)=>t+shiftHrs(s),0);

  const days = Array.from({length:7},(_,i)=>{
    const ds = addDays(ws,i);
    return {
      ds,
      myShift: myShifts.find(s=>s.date===ds),
      mySick:  mySick.find(s=>s.date===ds),
      myLeave: myLeaves.find(l=>l.from<=ds&&l.to>=ds),
      isToday: ds===td
    };
  });

  qs('#view-roster').innerHTML=`
    <div class="page-header stack">
      <h1 class="page-title">Roster</h1>
      <div class="page-subtitle">${esc(FDS(ws))} – ${esc(FDS(we))} · ${wkTot.toFixed(1)} hrs this week</div>
      <div class="btn-row" style="margin-top:12px">
        <button class="btn btn-secondary btn-sm" onclick="rNav(-1)">‹ Prev</button>
        <button class="btn btn-secondary btn-sm" onclick="rNav(0)">Today</button>
        <button class="btn btn-secondary btn-sm" onclick="rNav(1)">Next ›</button>
      </div>
    </div>
    <div style="font-size:.75rem;color:#98988f;margin-bottom:10px;padding:0 2px">Tap any day to see the full team roster</div>
    <div class="info-grid">
      ${days.map(d=>{
        const dObj = new Date(d.ds+'T00:00:00');
        const dow  = dObj.toLocaleDateString('en-AU',{weekday:'short'}).toUpperCase();
        const num  = dObj.getDate();
        const mon  = dObj.toLocaleDateString('en-AU',{month:'short'});

let myStatus='Off', myTime='', chipStyle='';

if (d.mySick) {
  myStatus='Sick';
  chipStyle='background:#FCEBEB;color:#791F1F;';

} else if (d.myLeave) {
  myStatus=(d.myLeave.type || 'Leave').replace(' Leave','');
  chipStyle='background:#FAEEDA;color:#633806;';

} else if (d.myShift) {
  const otAnnotations = Array.isArray(d.myShift.otAnnotations)
    ? d.myShift.otAnnotations
    : [];

  myStatus = (d.myShift.start || '') + '–' + (d.myShift.end || '');
  myTime = shiftHrs(d.myShift).toFixed(1) + 'h';

  d.otDesc = otAnnotations.length
    ? '<div style="font-size:.72rem;color:#3B6D11;margin-top:4px">OT approved: ' +
      otAnnotations.map(o => (o.start || '') + '–' + (o.end || '')).join(', ') +
      '</div>'
    : '';

  chipStyle='background:#EEEDFE;color:#534AB7;';
}

        // Count total staff on this day (for the badge)
        const allShiftsDay = getList('shifts').filter(s=>s.date===d.ds&&s.published);
        const allLeaveDay  = getList('leaveRequests').filter(l=>l.status==='approved'&&l.from<=d.ds&&l.to>=d.ds);
        const teamCount    = new Set([...allShiftsDay.map(s=>s.empId),...allLeaveDay.map(l=>l.empId)]).size;

        const todayRing = d.isToday ? 'border:2px solid #534AB7;' : 'border:1px solid rgba(24,24,22,.09);';

        return `<div class="card" style="${todayRing}cursor:pointer;padding:14px 16px;margin-bottom:8px;-webkit-tap-highlight-color:transparent"
          onclick="openDayRoster('${d.ds}')">
          <div style="display:flex;align-items:center;gap:14px">
            <!-- Date column -->
            <div style="min-width:40px;text-align:center;flex-shrink:0">
              <div style="font-size:.6rem;font-weight:700;letter-spacing:.07em;color:${d.isToday?'#534AB7':'#98988f'}">${dow}</div>
              <div style="font-family:'DM Serif Display',Georgia,serif;font-size:1.75rem;line-height:1;color:${d.isToday?'#534AB7':'#181816'}">${num}</div>
              <div style="font-size:.65rem;color:#98988f">${mon}</div>
            </div>
            <!-- My status -->
            <div style="flex:1;min-width:0">
              ${chipStyle?`<span style="font-size:.78rem;font-weight:600;padding:2px 9px;border-radius:12px;${chipStyle}">${esc(myStatus)}</span>`:`<span style="font-size:.82rem;color:#98988f">Off</span>`}
              ${myTime?`<span style="font-size:.75rem;color:#58584e;margin-left:6px">${myTime}</span>`:''}
              ${d.otDesc || ''}
              ${d.myShift&&d.isToday?`<div style="margin-top:6px"><button class="btn btn-secondary btn-sm" style="font-size:.75rem" onclick="event.stopPropagation();openLate()">⏱ Running late?</button></div>`:''}
            </div>
            <!-- Team count badge + chevron -->
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
              ${teamCount>0?`<span style="font-size:.75rem;font-weight:700;background:var(--s2);color:#58584e;padding:2px 8px;border-radius:10px">${teamCount} on shift</span>`:''}
              <span style="color:#98988f;font-size:1.1rem">›</span>
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>
    <div id="late-wrap"></div>`;
}

window.rNav = function(d) {
  if(d===0){ state.weekOffset=0; } else { state.weekOffset+=d; }
  renderRoster();
};

// ── DAY ROSTER POPUP ───────────────────────────────────────────
window.openDayRoster = function(ds) {
  const existing = qs('#day-roster-popup');
  if (existing) existing.remove();

  const allStaff  = getList('staff').sort((a,b)=>(a.first||'').localeCompare(b.first||''));
  // published may be boolean true, string "true", or 1 — accept all
  const isPublished = s => s.published===true||s.published==='true'||s.published===1;
  const allShifts = getList('shifts').filter(s=>{
    const d = cleanDate_(s.date||'');
    return d===ds && isPublished(s);
  });
  const allSick   = getList('sickDays').filter(s=>cleanDate_(s.date||'')===ds);
  const allLeaves = getList('leaveRequests').filter(l=>l.status==='approved'&&l.from<=ds&&l.to>=ds);

  const dObj    = new Date(ds+'T00:00:00');
  const dayFull = dObj.toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const isToday = ds===today();

  // Build unified team list: staff with shifts + staff on leave (no shift)
  const seen = {};
  const rows = [];

  // Staff with shifts first (sorted by start time)
  allShifts.slice().sort((a,b)=>(a.start||"").localeCompare(b.start||"")).forEach(s=>{
    const col     = allStaff.find(x=>normaliseId_(x.id)===normaliseId_(s.empId));
    if (!col) return;
    seen[s.empId] = true;
    const isSick  = allSick.some(sk=>sk.empId===s.empId);
    const onLeave = allLeaves.find(l=>l.empId===s.empId);
const netH = shiftHrs(s).toFixed(1);
    const ini     = ((col.first||'')[0]||'')+((col.last||'')[0]||'');
    rows.push({col, s, isSick, onLeave, netH, ini, type:'shift'});
  });

  // Then leave-only (no shift that day)
  allLeaves.forEach(l=>{
    if (seen[l.empId]) return;
    const col = allStaff.find(x=>normaliseId_(x.id)===normaliseId_(l.empId));
    if (!col) return;
    const ini = ((col.first||'')[0]||'')+((col.last||'')[0]||'');
    rows.push({col, s:null, isSick:false, onLeave:l, netH:'0', ini, type:'leave'});
  });

  const rowsHTML = rows.length ? rows.map(r=>{
    const badge = r.isSick
      ? `<span style="font-size:.72rem;background:#FCEBEB;color:#791F1F;padding:2px 9px;border-radius:10px;font-weight:600;flex-shrink:0">🤒 Sick</span>`
      : r.onLeave
      ? `<span style="font-size:.72rem;background:#FAEEDA;color:#633806;padding:2px 9px;border-radius:10px;font-weight:600;flex-shrink:0">🏖 ${esc((r.onLeave.type||'').replace(' Leave',''))}</span>`
      : '';

    const timeRow = r.type==='leave'
      ? `<div style="font-size:.78rem;color:#58584e">On leave all day</div>`
      : r.isSick||r.onLeave
      ? `<div style="font-size:.78rem;color:#58584e;text-decoration:line-through;opacity:.5">${esc(r.s.start)} – ${esc(r.s.end)}</div>`
      : `<div style="font-size:.78rem;color:#58584e">${esc(r.s.start)} – ${esc(r.s.end)} · ${r.netH}h</div>`;

    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(24,24,22,.06)">
      <div style="width:36px;height:36px;border-radius:50%;background:${r.col.color||'#534AB7'}22;color:${r.col.color||'#534AB7'};display:flex;align-items:center;justify-content:center;font-size:.78rem;font-weight:700;flex-shrink:0">${esc(r.ini)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:.9rem;font-weight:600;color:#181816">${esc(r.col.first)} ${esc(r.col.last)}</div>
        <div style="font-size:.72rem;color:#98988f">${esc(r.col.role||'')}</div>
        ${timeRow}
      </div>
      ${badge}
    </div>`;
  }).join('') : `<div style="padding:24px 0;text-align:center;color:#98988f;font-size:.9rem">No shifts scheduled for this day.</div>`;

  const popup = document.createElement('div');
  popup.id = 'day-roster-popup';
  popup.style.cssText = 'position:fixed;inset:0;z-index:500;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.45);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)';

  popup.innerHTML = `
    <div style="width:100%;max-width:520px;background:#fff;border-radius:22px 22px 0 0;max-height:85vh;display:flex;flex-direction:column;animation:slideUp .28s cubic-bezier(.22,1,.36,1)">
      <!-- Handle -->
      <div style="padding:12px 0 0;text-align:center;flex-shrink:0">
        <div style="width:36px;height:4px;background:rgba(24,24,22,.15);border-radius:2px;margin:0 auto"></div>
      </div>
      <!-- Header -->
      <div style="padding:16px 20px 12px;border-bottom:1px solid rgba(24,24,22,.08);flex-shrink:0;display:flex;align-items:flex-start;justify-content:space-between">
        <div>
          <div style="font-size:1.1rem;font-weight:700;color:#181816">${esc(dayFull)}</div>
          <div style="font-size:.82rem;color:#98988f;margin-top:2px">${rows.length} staff scheduled</div>
        </div>
        <button onclick="document.getElementById('day-roster-popup').remove()" style="width:32px;height:32px;border-radius:50%;background:rgba(24,24,22,.07);border:none;font-size:16px;cursor:pointer;color:#58584e;flex-shrink:0">✕</button>
      </div>
      <!-- Team list -->
      <div style="overflow-y:auto;padding:0 20px;flex:1">
        ${rowsHTML}
      </div>
      <!-- Close button -->
      <div style="padding:16px 20px calc(16px + env(safe-area-inset-bottom,0px));flex-shrink:0;border-top:1px solid rgba(24,24,22,.06)">
        <button onclick="document.getElementById('day-roster-popup').remove()" class="btn btn-secondary" style="width:100%">Close</button>
      </div>
    </div>`;

  popup.addEventListener('click', e=>{ if(e.target===popup) popup.remove(); });
  document.body.appendChild(popup);
};

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

async function saveRunningLateReport_(payload) {
  const row = {
    id: payload.id,
    emp_id: payload.empId,
    staff_name: payload.staffName,
    staff_email: payload.staffEmail || null,
    shift_id: payload.shiftId || null,
    date: payload.date,
    shift_start: payload.shiftStart || null,
    shift_end: payload.shiftEnd || null,
    eta: payload.eta,
    reason: payload.reason,
    manager_contacted: !!payload.managerContacted,
    acknowledged: false,
    acknowledged_at: null,
    created_at: payload.createdAt
  };

  const { error } = await supabase
    .from('late_reports')
    .upsert(row, { onConflict: 'id' });

  if (error) throw new Error('Could not save running-late report: ' + error.message);
}

window.submitLate = async function() {
  const reason=qs('#late-r')?.value.trim(), eta=qs('#late-eta')?.value.trim(), contacted=qs('#late-c')?.checked||false;
  const errEl=qs('#late-err');
  if (!reason||!eta){ if(errEl) errEl.style.display='block'; return; }
  if (errEl) errEl.style.display='none';

  const td=today();
  const shift=getList('shifts').find(s=>isMyEmpId_(s.empId)&&s.date===td&&s.published);
  if (!shift) {
    toast('Your rostered shift could not be found. Please refresh and try again.','error');
    return;
  }

  const staffName = `${state.emp?.first || ''} ${state.emp?.last || ''}`.trim() || 'Staff member';
  const createdAt = new Date().toISOString();
  const reportId = ['late', normaliseId_(shift.empId || state.emp?.id), td, eta, Date.now()].join('-');
  const payload = {
    id: reportId,
    reportId,
    empId: normaliseId_(shift.empId || state.emp?.id),
    employeeId: normaliseId_(shift.empId || state.emp?.id),
    empFirst: state.emp?.first || '',
    empLast: state.emp?.last || '',
    empName: staffName,
    staffName,
    staffMember: staffName,
    empEmail: state.emp?.email || '',
    staffEmail: state.emp?.email || '',
    shiftId: normaliseId_(shift.id),
    date: td,
    shiftStart: shift.start,
    shiftEnd: shift.end,
    reason,
    eta,
    contacted,
    managerContacted: contacted,
    createdAt
  };

  const sendBtn = qs('#late-modal .btn-primary');
  if (sendBtn) { sendBtn.textContent='Sending…'; sendBtn.disabled=true; }

  try {
    // Save first so the manager portal and timesheet receive a durable record,
    // even if the email service is temporarily delayed.
    await saveRunningLateReport_(payload);
    await gasPost({action:'sendEmail',fn:'sendRunningLateNotification',payload});
    qs('#late-modal')?.remove();
    toast('Your manager has been notified and your timesheet has been noted. ✓','success');
  } catch(e){
    console.error('Running-late submission failed:', e);
    if(sendBtn){ sendBtn.textContent='Notify manager'; sendBtn.disabled=false; }
    toast('Could not send — please contact your manager directly.','error');
  }
};

// ── LEAVE ──────────────────────────────────────────────────────
function isAnnualLeave_(leave) {
  return String(leave?.type || leave?.leaveType || leave?.leave_type || '')
    .trim().toLowerCase() === 'annual leave';
}

function approvedAnnualLeave_() {
  const staffById = new Map(getList('staff').map(person => [normaliseId_(person.id), person]));

  const seen = new Set();

  return getList('leaveRequests')
    .filter(leave => String(leave.status || '').toLowerCase() === 'approved' && isAnnualLeave_(leave))
    .map(leave => ({
      ...leave,
      empId: normaliseId_(leave.empId ?? leave.emp_id),
      from: cleanDate_(leave.from),
      to: cleanDate_(leave.to),
      person: staffById.get(normaliseId_(leave.empId ?? leave.emp_id)) || null
    }))
    .filter(leave => leave.from && leave.to && leave.person)
    .filter(leave => {
      const key = `${leave.empId}|${leave.from}|${leave.to}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.from.localeCompare(b.from) || String(a.person.first || '').localeCompare(String(b.person.first || '')));
}

function staffLeaveColour_(person) {
  const colour = String(person?.color || '#534AB7').trim();
  return /^#[0-9a-f]{6}$/i.test(colour) ? colour : '#534AB7';
}

function leaveCalendarHTML_() {
  const approved = approvedAnnualLeave_();
  const [year, month] = String(state.leaveCalendarMonth || today().slice(0, 7)).split('-').map(Number);
  const first = new Date(year, month - 1, 1);
  const calendarStart = new Date(year, month - 1, 1 - ((first.getDay() + 6) % 7));
  const monthLabel = first.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
  const td = today();
  const todayAway = approved.filter(leave => leave.from <= td && leave.to >= td);
  const upcomingEnd = addDays(td, 90);
  const upcoming = approved.filter(leave => leave.to >= td && leave.from <= upcomingEnd).slice(0, 12);
  const weekdays = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const cells = [];

  for (let i = 0; i < 42; i++) {
    const date = new Date(calendarStart);
    date.setDate(calendarStart.getDate() + i);
    const ds = localISO(date);
    const inMonth = date.getMonth() === month - 1;
    const dayLeave = approved.filter(leave => leave.from <= ds && leave.to >= ds);
    const visible = dayLeave.slice(0, 2);

    cells.push(`
      <button type="button" class="team-leave-day ${inMonth ? '' : 'is-outside'} ${ds === td ? 'is-today' : ''} ${dayLeave.length ? 'has-leave' : ''}"
        aria-label="${esc(FD(ds))}${dayLeave.length ? `, ${dayLeave.length} ${dayLeave.length === 1 ? 'person' : 'people'} away` : ', no one away'}"
        onclick="openLeaveDayPopup('${ds}')">
        <div class="team-leave-date">${date.getDate()}</div>
        <div class="team-leave-events">
          ${visible.map(leave => {
            const colour = staffLeaveColour_(leave.person);
            const fullName = `${leave.person.first || ''} ${leave.person.last || ''}`.trim();
            const shortName = `${leave.person.first || ''}${leave.person.last ? ` ${String(leave.person.last).charAt(0)}.` : ''}`;
            return `<div class="team-leave-pill" style="--leave-colour:${colour}" title="${esc(fullName)}">${esc(shortName)}</div>`;
          }).join('')}
          ${dayLeave.length > 2 ? `<div class="team-leave-more">+${dayLeave.length - 2} more</div>` : ''}
        </div>
        <div class="team-leave-mobile-dots">
          ${dayLeave.slice(0, 4).map(leave => `<span class="team-leave-mobile-dot" style="--leave-colour:${staffLeaveColour_(leave.person)}"></span>`).join('')}
          ${dayLeave.length > 4 ? `<span class="team-leave-more">+${dayLeave.length - 4}</span>` : ''}
        </div>
      </button>`);
  }

  return `
    <style id="team-leave-calendar-styles">
      .team-leave-card{overflow:hidden;margin-bottom:18px}
      .team-leave-today{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;margin-bottom:14px;border-radius:14px;background:#f4f2ff;border:1px solid rgba(83,74,183,.16);cursor:pointer}
      .team-leave-today-main{min-width:0}
      .team-leave-today-label{font-size:.68rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#534AB7;margin-bottom:3px}
      .team-leave-today-names{font-size:.84rem;font-weight:750;color:#181816;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .team-leave-today-count{display:flex;align-items:center;justify-content:center;min-width:32px;height:32px;padding:0 9px;border-radius:999px;background:#534AB7;color:#fff;font-size:.78rem;font-weight:800;flex-shrink:0}
      .team-leave-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:14px}
      .team-leave-title{font-weight:750;font-size:1rem;color:#181816}
      .team-leave-copy{font-size:.78rem;color:#707067;line-height:1.45;margin-top:3px}
      .team-leave-nav{display:flex;align-items:center;gap:8px;flex-shrink:0}
      .team-leave-month{min-width:132px;text-align:center;font-weight:700;font-size:.82rem}
      .team-leave-weekdays,.team-leave-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}
      .team-leave-weekdays{border:1px solid rgba(24,24,22,.09);border-bottom:0;border-radius:14px 14px 0 0;overflow:hidden;background:#f5f5f0}
      .team-leave-weekday{text-align:center;padding:7px 2px;font-size:.64rem;font-weight:700;letter-spacing:.05em;color:#77776e;text-transform:uppercase}
      .team-leave-grid{border-left:1px solid rgba(24,24,22,.09);border-top:1px solid rgba(24,24,22,.09)}
      .team-leave-day{appearance:none;-webkit-appearance:none;text-align:left;font-family:inherit;color:inherit;min-height:84px;padding:6px;border:0;border-right:1px solid rgba(24,24,22,.09);border-bottom:1px solid rgba(24,24,22,.09);background:#fff;min-width:0;cursor:pointer;transition:background .15s ease,box-shadow .15s ease}
      .team-leave-day:hover,.team-leave-day:focus-visible{background:#f8f7ff;outline:none;box-shadow:inset 0 0 0 2px rgba(83,74,183,.35)}
      .team-leave-day.is-outside{background:#fafaf7;color:#aaa}
      .team-leave-day.is-outside:hover{background:#f4f3fb}
      .team-leave-day.is-today{box-shadow:inset 0 0 0 2px #534AB7}
      .team-leave-day.has-leave{background:#fdfdfb}
      .team-leave-date{font-size:.7rem;font-weight:700;margin-bottom:5px}
      .team-leave-events{display:flex;flex-direction:column;gap:3px;pointer-events:none}
      .team-leave-pill{background:color-mix(in srgb,var(--leave-colour) 14%,white);color:var(--leave-colour);border:1px solid color-mix(in srgb,var(--leave-colour) 38%,white);border-left:3px solid var(--leave-colour);border-radius:5px;padding:3px 5px;font-size:.63rem;font-weight:750;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .team-leave-more{font-size:.61rem;color:#707067;padding-left:3px;font-weight:650}
      .team-leave-mobile-dots{display:none;align-items:center;gap:2px;flex-wrap:wrap;pointer-events:none}
      .team-leave-mobile-dot{width:5px;height:5px;border-radius:50%;background:var(--leave-colour)}
      .team-leave-upcoming{display:none}
      .team-leave-upcoming-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid rgba(24,24,22,.08);cursor:pointer;border-radius:8px}
      .team-leave-upcoming-row:last-child{border-bottom:0}
      .team-leave-upcoming-row:hover{background:#f7f6fc}
      .team-leave-person{display:flex;align-items:center;gap:9px;min-width:0}
      .team-leave-dot{width:10px;height:10px;border-radius:50%;background:var(--leave-colour);flex-shrink:0;box-shadow:0 0 0 3px color-mix(in srgb,var(--leave-colour) 14%,white)}
      .team-leave-name{font-size:.83rem;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .team-leave-dates{font-size:.74rem;color:#707067;white-space:nowrap;text-align:right}
      .leave-day-overlay{position:fixed;inset:0;background:rgba(15,15,14,.42);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);z-index:9998;display:flex;align-items:center;justify-content:center;padding:18px;animation:leaveFadeIn .16s ease}
      .leave-day-modal{width:100%;max-width:430px;max-height:min(620px,88dvh);overflow:auto;background:#fff;border-radius:20px;box-shadow:0 22px 60px rgba(0,0,0,.24);padding:20px;animation:leaveModalIn .2s cubic-bezier(.22,.8,.3,1)}
      .leave-day-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding-bottom:14px;border-bottom:1px solid rgba(24,24,22,.09)}
      .leave-day-modal-title{font-size:1.05rem;font-weight:800;color:#181816}
      .leave-day-modal-sub{font-size:.76rem;color:#77776e;margin-top:2px}
      .leave-day-close{width:32px;height:32px;border-radius:50%;border:1px solid rgba(24,24,22,.12);background:#f6f6f1;font-size:20px;line-height:1;cursor:pointer;color:#58584e;display:flex;align-items:center;justify-content:center;flex-shrink:0}
      .leave-day-close:hover{background:#ecebe5}
      .leave-day-list{padding-top:6px}
      .leave-day-person{display:flex;align-items:center;gap:12px;padding:13px 2px;border-bottom:1px solid rgba(24,24,22,.08)}
      .leave-day-person:last-child{border-bottom:0}
      .leave-day-avatar{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--leave-colour) 15%,white);color:var(--leave-colour);border:1px solid color-mix(in srgb,var(--leave-colour) 38%,white);font-size:.72rem;font-weight:800;flex-shrink:0}
      .leave-day-person-name{font-size:.88rem;font-weight:750;color:#181816}
      .leave-day-person-range{font-size:.73rem;color:#77776e;margin-top:2px}
      .leave-day-empty{text-align:center;padding:30px 12px 22px;color:#77776e;font-size:.84rem}
      @keyframes leaveFadeIn{from{opacity:0}to{opacity:1}}
      @keyframes leaveModalIn{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
      @media(max-width:680px){
        .team-leave-head{align-items:center}.team-leave-copy{max-width:240px}
        .team-leave-calendar-desktop{display:block}.team-leave-upcoming{display:none}
        .team-leave-month{min-width:112px}
        .team-leave-weekday{font-size:.55rem;padding:6px 1px;letter-spacing:.02em}
        .team-leave-day{min-height:48px;padding:4px 3px;text-align:center}
        .team-leave-date{font-size:.66rem;margin-bottom:4px}
        .team-leave-events{display:none}
        .team-leave-mobile-dots{display:flex;justify-content:center}
        .team-leave-day.is-today{box-shadow:inset 0 0 0 2px #534AB7;background:#f4f2ff}
      }
      @media(max-width:420px){.team-leave-head{align-items:flex-start;flex-direction:column}.team-leave-nav{width:100%;justify-content:space-between}.leave-day-modal{border-radius:18px;padding:18px}}
    </style>
    <div class="card team-leave-card">
      <div class="team-leave-today" role="button" tabindex="0" onclick="openLeaveDayPopup('${td}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openLeaveDayPopup('${td}')}">
        <div class="team-leave-today-main">
          <div class="team-leave-today-label">Away today</div>
          <div class="team-leave-today-names">${todayAway.length ? esc(todayAway.map(leave => leave.person.first || `${leave.person.first || ''} ${leave.person.last || ''}`.trim()).join(', ')) : 'No one is on approved annual leave today'}</div>
        </div>
        <div class="team-leave-today-count">${todayAway.length}</div>
      </div>
      <div class="team-leave-head">
        <div>
          <div class="team-leave-title">Who’s away</div>
          <div class="team-leave-copy">Approved annual leave only. Tap any date to see everyone away. Leave reasons remain private.</div>
        </div>
        <div class="team-leave-nav">
          <button class="btn btn-secondary btn-sm" onclick="changeLeaveCalendarMonth(-1)" aria-label="Previous month">‹</button>
          <div class="team-leave-month">${esc(monthLabel)}</div>
          <button class="btn btn-secondary btn-sm" onclick="changeLeaveCalendarMonth(1)" aria-label="Next month">›</button>
        </div>
      </div>
      <div class="team-leave-calendar-desktop">
        <div class="team-leave-weekdays">${weekdays.map(day => `<div class="team-leave-weekday">${day}</div>`).join('')}</div>
        <div class="team-leave-grid">${cells.join('')}</div>
      </div>
      <div class="team-leave-upcoming">
        ${upcoming.length ? upcoming.map(leave => {
          const colour = staffLeaveColour_(leave.person);
          const dateToOpen = leave.from < td ? td : leave.from;
          return `
          <div class="team-leave-upcoming-row" role="button" tabindex="0" onclick="openLeaveDayPopup('${dateToOpen}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openLeaveDayPopup('${dateToOpen}')}" style="--leave-colour:${colour}">
            <div class="team-leave-person"><span class="team-leave-dot"></span><div class="team-leave-name">${esc(`${leave.person.first} ${leave.person.last || ''}`.trim())}</div></div>
            <div class="team-leave-dates">${esc(FDS(leave.from))}${leave.to !== leave.from ? ` – ${esc(FDS(leave.to))}` : ''}</div>
          </div>`;
        }).join('') : '<div class="helper-note">No approved annual leave in the next 90 days.</div>'}
      </div>
    </div>`;
}

window.changeLeaveCalendarMonth = function(delta) {
  const [year, month] = String(state.leaveCalendarMonth || today().slice(0, 7)).split('-').map(Number);
  const next = new Date(year, month - 1 + Number(delta || 0), 1);
  state.leaveCalendarMonth = localISO(next).slice(0, 7);
  renderLeave();
};

window.openLeaveDayPopup = function(date) {
  const cleanDate = cleanDate_(date);
  const peopleAway = approvedAnnualLeave_().filter(leave => leave.from <= cleanDate && leave.to >= cleanDate);
  const existing = document.getElementById('leave-day-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'leave-day-overlay';
  overlay.className = 'leave-day-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', `Staff away on ${FD(cleanDate)}`);
  overlay.onclick = event => { if (event.target === overlay) closeLeaveDayPopup(); };

  overlay.innerHTML = `
    <div class="leave-day-modal">
      <div class="leave-day-modal-head">
        <div>
          <div class="leave-day-modal-title">Who’s away</div>
          <div class="leave-day-modal-sub">${esc(FD(cleanDate))} · ${peopleAway.length} ${peopleAway.length === 1 ? 'person' : 'people'}</div>
        </div>
        <button type="button" class="leave-day-close" onclick="closeLeaveDayPopup()" aria-label="Close">×</button>
      </div>
      ${peopleAway.length ? `
        <div class="leave-day-list">
          ${peopleAway.map(leave => {
            const colour = staffLeaveColour_(leave.person);
            const fullName = `${leave.person.first || ''} ${leave.person.last || ''}`.trim();
            const leaveRange = leave.from === leave.to ? FD(leave.from) : `${FDS(leave.from)} – ${FDS(leave.to)}`;
            return `
              <div class="leave-day-person" style="--leave-colour:${colour}">
                <div class="leave-day-avatar">${esc(initials(leave.person))}</div>
                <div>
                  <div class="leave-day-person-name">${esc(fullName)}</div>
                  <div class="leave-day-person-range">Annual leave · ${esc(leaveRange)}</div>
                </div>
              </div>`;
          }).join('')}
        </div>` : `
        <div class="leave-day-empty">No staff members are on approved annual leave on this date.</div>`}
    </div>`;

  document.body.appendChild(overlay);
  overlay.querySelector('.leave-day-close')?.focus();
};

window.closeLeaveDayPopup = function() {
  document.getElementById('leave-day-overlay')?.remove();
};

if (!window.__leaveCalendarEscapeBound) {
  window.__leaveCalendarEscapeBound = true;
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.getElementById('leave-day-overlay')) {
      closeLeaveDayPopup();
    }
  });
}

function renderLeave() {
  const emp    = state.emp;
  const reqs   = getList('leaveRequests').filter(l=>isMyEmpId_(l.empId)).sort((a,b)=>(b.submitted||b.from||'').localeCompare(a.submitted||a.from||''));
  const sick   = getList('sickDays').filter(s=>isMyEmpId_(s.empId)).sort((a,b)=>(b.date||"").localeCompare(a.date||""));
  const mcs    = getList('medCerts').filter(m=>isMyEmpId_(m.empId));
  const pending= reqs.filter(l=>l.status==='pending');
  const hist   = reqs.filter(l=>l.status!=='pending');
  const partialLeaves = getList('shifts')
  .filter(s =>
    s.empId === emp.id &&
    s.published &&
    (s.entryType === 'leave' || s.entry_type === 'leave')
  )
  .sort((a,b)=>(b.date||'').localeCompare(a.date||''));

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
    ${leaveCalendarHTML_()}
    ${partialLeaves.length ? `
  <div class="section-label">Approved partial leave</div>
  <div class="info-grid">
    ${partialLeaves.map(pl=>`
      <div class="card list-card" style="border-left:4px solid #993C1D;background:#FAECE7">
        <div>
          <div class="list-title">Partial leave - ${esc(pl.leaveType || pl.leave_type || pl.status || 'Leave')}</div>
          <div class="list-copy">${esc(FDS(pl.date))} · ${esc(pl.start)}–${esc(pl.end)}</div>
          ${pl.leaveReason || pl.leave_reason ? `<div class="list-copy" style="margin-top:3px">${esc(pl.leaveReason || pl.leave_reason)}</div>` : ''}
        </div>
        <span class="badge badge-amber">approved</span>
      </div>
    `).join('')}
  </div>
` : ''}
    <div class="section-label">Pending requests</div>
${pending.length?pending.map(l=>`
  <div class="card list-card" style="margin-bottom:0">
    <div>
      <div class="list-title">${esc(l.type)}</div>

      <div class="list-copy">
        ${esc(FDS(l.from))} – ${esc(FDS(l.to))}
      </div>

<div class="btn-row" style="margin-top:10px">
  <button class="btn btn-secondary btn-sm" onclick="openEditLeaveRequest('${l.id}')">Edit</button>
  <button class="btn btn-danger btn-sm" onclick="cancelLeaveRequest('${l.id}')">Cancel request</button>
</div>

    </div>

    ${badge(l.status)}
  </div>
`).join(''):'<div class="helper-note">No pending requests.</div>'}
    <div class="section-label">History</div>
    <div class="info-grid">
${hist.length?hist.map(l=>`
  <div class="card list-card">
    <div>
      <div class="list-title">${esc(l.type)}</div>
      <div class="list-copy">${esc(FDS(l.from))} – ${esc(FDS(l.to))}</div>
      ${l.denialReason?`<div class="list-copy" style="color:#A32D2D;font-size:.78rem;margin-top:3px">Reason: ${esc(l.denialReason)}</div>`:''}

      <div class="btn-row" style="margin-top:10px">
        <button class="btn btn-secondary btn-sm" onclick="openEditLeaveRequest('${l.id}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="cancelLeaveRequest('${l.id}')">Cancel request</button>
      </div>
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
          <select class="select" id="lv-t" onchange="togglePartialMCNotice()">
            <option>Annual Leave</option>
            <option>Sick Leave</option>
            <option>Personal Leave</option>
            <option>Carers Leave</option>
            <option>Unpaid Leave</option>
          </select>
        </div>

        <div class="input-wrap"><label>Request type</label>
          <select class="select" id="lv-kind" onchange="togglePartialLeaveFields()">
            <option value="full_day">Full day / date range</option>
            <option value="partial_day">Partial day</option>
          </select>
        </div>

        <div class="input-wrap"><label>From</label><input class="input" id="lv-f" type="date"></div>
        <div class="input-wrap"><label>To</label><input class="input" id="lv-to" type="date"></div>

        <div id="lv-partial-fields" class="full-span" style="display:none">
          <div class="form-grid">
            <div class="input-wrap"><label>Leave start</label><input class="input" id="lv-ps" type="time"></div>
            <div class="input-wrap"><label>Leave end</label><input class="input" id="lv-pe" type="time"></div>
          </div>
        </div>

        <div id="lv-mc-note" class="full-span" style="display:none;background:#FCEBEB;color:#791F1F;border-radius:12px;padding:10px 12px;font-size:.84rem">
          Medical certificate required. After submitting, please upload your certificate below.
        </div>

        <div class="input-wrap full-span"><label>Notes (optional)</label><textarea class="textarea" id="lv-n" placeholder="Any additional context."></textarea></div>

        <div id="lv-err" style="display:none;color:#A32D2D;font-size:.82rem" class="full-span">⚠ Please enter valid leave details.</div>

        <div class="btn-row full-span">
          <button class="btn btn-secondary" onclick="qs('#lv-form').innerHTML=''">Cancel</button>
          <button class="btn btn-primary" id="lv-submit" onclick="submitLeave()">Submit request</button>
        </div>
      </div>
    </div>`;
};

window.togglePartialLeaveFields = function(){
  const kind = qs('#lv-kind')?.value;
  const box = qs('#lv-partial-fields');

  if(box) box.style.display = kind === 'partial_day' ? 'block' : 'none';

  if(kind === 'partial_day'){
    const from = qs('#lv-f')?.value;
    if(from && qs('#lv-to')) qs('#lv-to').value = from;
  }

  togglePartialMCNotice();
};

window.togglePartialMCNotice = function(){
  const type = qs('#lv-t')?.value;
  const kind = qs('#lv-kind')?.value;
  const note = qs('#lv-mc-note');

  if(note) {
    note.style.display =
      type === 'Sick Leave' && kind === 'partial_day'
        ? 'block'
        : 'none';
  }
};

window.submitLeave = async function() {
  const type = qs('#lv-t')?.value;
  const kind = qs('#lv-kind')?.value || 'full_day';
  const from = qs('#lv-f')?.value;
  const to = kind === 'partial_day' ? from : qs('#lv-to')?.value;
  const partialStart = qs('#lv-ps')?.value || '';
  const partialEnd = qs('#lv-pe')?.value || '';
  const notes = (qs('#lv-n')?.value || '').trim();

  const errEl = qs('#lv-err');
  const btn = qs('#lv-submit');

  const badFull = !from || !to || from > to;
  const badPartial = kind === 'partial_day' && (!from || !partialStart || !partialEnd || partialStart >= partialEnd);

  if (badFull || badPartial) {
    if (errEl) errEl.style.display = 'block';
    return;
  }

  if (errEl) errEl.style.display = 'none';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Submitting...';
  }

  const reqs = getList('leaveRequests');

  const newReq = {
    id: 'lr' + Date.now(),
    empId: state.emp.id,
    type,
    from,
    to,
    notes,
    status: 'pending',
    submitted: new Date().toISOString(),
    requestKind: kind,
    partialStart: kind === 'partial_day' ? partialStart : null,
    partialEnd: kind === 'partial_day' ? partialEnd : null,
    medicalCertificateRequired: type === 'Sick Leave',
    syncedToRoster: false,
    syncedToLeaveTracker: false,
    changeRequested: false,
    denialReason: null,
    processedAt: null
  };

  reqs.push(newReq);

  try {
    await saveList('leaveRequests', reqs);

    let createdSickDays = [];

    if (type === 'Sick Leave') {
      const shifts = getList('shifts').filter(s =>
        s.empId === state.emp.id &&
        s.published &&
        s.date >= from &&
        s.date <= to
      );

      const existingSick = getList('sickDays');
      const sickDays = [...existingSick];

      createdSickDays = shifts
        .filter(s => !existingSick.some(sk => sk.empId === state.emp.id && sk.date === s.date))
        .map(s => ({
          id: 'sk' + Date.now() + Math.random().toString(36).slice(2, 7),
          empId: state.emp.id,
          date: s.date,
          shiftId: s.id,
          medCertId: null,
          mcUploaded: false,
          notes,
          ts: new Date().toISOString()
        }));

      sickDays.push(...createdSickDays);

      if (createdSickDays.length) {
        await saveList('sickDays', sickDays);
      }
    }

    gasPost({
      action: 'sendEmail',
      fn: 'sendLeaveRequestNotification',
      payload: {
        empId: state.emp.id,
        empName: `${state.emp.first || ''} ${state.emp.last || ''}`.trim(),
        empFirst: state.emp.first || '',
        empLast: state.emp.last || '',
        empEmail: state.emp.email || '',
        empRole: state.emp.role || '',
        type: kind === 'partial_day' ? `[PARTIAL] ${type}` : type,
        from,
        to,
        notes,
        reason: notes,
        source: 'Staff Portal'
      }
    }).catch(err => console.warn('Leave email failed:', err));

    if (qs('#lv-form')) qs('#lv-form').innerHTML = '';

    const fresh = await getAllData();
    if (fresh.ok) state.allData = fresh.data || state.allData;

    renderLeave();
    renderHome();

    toast(
      type === 'Sick Leave'
        ? 'Sick leave submitted. Please upload your medical certificate once for the applicable sick days. ✓'
        : 'Leave request submitted! Your manager has been notified. ✓',
      'success',
      6000
    );

    if (type === 'Sick Leave') {
      const firstSick = createdSickDays[0] || getList('sickDays').find(s => s.empId === state.emp.id && s.date >= from && s.date <= to);
      if (firstSick) openMC(firstSick.id, firstSick.date);
    }

  } catch (e) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Submit request';
    }
    toast('Could not submit leave request: ' + e.message, 'error', 6000);
  }
};

window.openEditLeaveRequest = function(id) {
  const reqs = getList('leaveRequests');
  const lr = reqs.find(l => l.id === id && l.empId === state.emp.id);

  if (!lr) {
    toast('Could not find that leave request.', 'error');
    return;
  }

  const c = qs('#lv-form');
  if (!c) return;

  c.innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <div style="font-family:'DM Serif Display',Georgia,serif;font-size:1.3rem;margin-bottom:16px">Edit leave request</div>

      <div class="form-grid">
        <div class="input-wrap"><label>Leave type</label>
          <select class="select" id="lv-edit-t">
            ${['Annual Leave','Sick Leave','Personal Leave','Carers Leave','Unpaid Leave'].map(t =>
              `<option ${t === lr.type ? 'selected' : ''}>${t}</option>`
            ).join('')}
          </select>
        </div>

        <div class="input-wrap"><label>From</label><input class="input" id="lv-edit-f" type="date" value="${esc(lr.from || '')}"></div>
        <div class="input-wrap"><label>To</label><input class="input" id="lv-edit-to" type="date" value="${esc(lr.to || '')}"></div>

        <div class="input-wrap full-span">
          <label>Notes (optional)</label>
          <textarea class="textarea" id="lv-edit-n" placeholder="Any additional context.">${esc(lr.notes || '')}</textarea>
        </div>

        <div id="lv-edit-err" style="display:none;color:#A32D2D;font-size:.82rem" class="full-span">
          ⚠ Please enter valid from and to dates.
        </div>

        <div class="btn-row full-span">
          <button class="btn btn-secondary" onclick="qs('#lv-form').innerHTML=''">Cancel</button>
          <button class="btn btn-primary" id="lv-edit-submit" onclick="saveEditedLeaveRequest('${lr.id}')">Save changes</button>
        </div>
      </div>
    </div>
  `;

  window.nav('leave');
};

window.saveEditedLeaveRequest = async function(id) {
  const type = qs('#lv-edit-t')?.value;
  const from = qs('#lv-edit-f')?.value;
  const to = qs('#lv-edit-to')?.value;
  const notes = (qs('#lv-edit-n')?.value || '').trim();
  const errEl = qs('#lv-edit-err');
  const btn = qs('#lv-edit-submit');

  if (!from || !to || from > to) {
    if (errEl) errEl.style.display = 'block';
    return;
  }

  if (errEl) errEl.style.display = 'none';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving...';
  }

  try {
    const reqs = getList('leaveRequests');
    const idx = reqs.findIndex(l => l.id === id && l.empId === state.emp.id);

    if (idx < 0) throw new Error('Leave request not found.');
    const wasApproved = reqs[idx].status === 'approved';

    const old = { ...reqs[idx] };

reqs[idx] = {
  ...reqs[idx],
  type,
  from,
  to,
  notes,
  status: wasApproved ? 'pending' : reqs[idx].status,
  changeRequested: wasApproved,
  previousFrom: wasApproved ? old.from : reqs[idx].previousFrom,
  previousTo: wasApproved ? old.to : reqs[idx].previousTo,
  previousType: wasApproved ? old.type : reqs[idx].previousType,
  previousStatus: wasApproved ? old.status : reqs[idx].previousStatus,
  syncedToRoster: wasApproved ? false : reqs[idx].syncedToRoster,
  syncedToLeaveTracker: wasApproved ? false : reqs[idx].syncedToLeaveTracker,
  editedAt: new Date().toISOString(),
  lastEditedBy: state.emp.id
};

    await saveList('leaveRequests', reqs);

    await gasPost({
      action: 'sendEmail',
      fn: 'sendLeaveRequestNotification',
      payload: {
        empId: state.emp.id,
        empName: `${state.emp.first || ''} ${state.emp.last || ''}`.trim(),
        empFirst: state.emp.first || '',
        empLast: state.emp.last || '',
        empEmail: state.emp.email || '',
        empRole: state.emp.role || '',
        type: `[UPDATED] ${type}`,
        from,
        to,
notes:
  (wasApproved ? 'APPROVED LEAVE DATE CHANGE REQUEST\n\n' : 'UPDATED LEAVE REQUEST\n\n') +
  `Previous request: ${old.type || ''}, ${old.from || ''} to ${old.to || ''}\n` +
  `New request: ${type || ''}, ${from || ''} to ${to || ''}\n` +
  `Previous notes: ${old.notes || 'None'}\n\n` +
  `Updated notes: ${notes || 'None'}`,
        reason: notes,
        source: 'Staff Portal'
      }
    }).catch(err => console.warn('Leave edit email failed:', err));

    if (qs('#lv-form')) qs('#lv-form').innerHTML = '';

    const fresh = await getAllData();
    if (fresh.ok) state.allData = fresh.data || state.allData;

    renderLeave();
    renderHome();

    toast('Leave request updated. Your manager has been notified. ✓', 'success', 5000);

  } catch (e) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Save changes';
    }
    toast('Could not update request: ' + e.message, 'error', 6000);
  }
};

window.cancelLeaveRequest = async function(id) {
  const reqs = getList('leaveRequests');
  const lr = reqs.find(l => l.id === id && l.empId === state.emp.id);

  if (!lr) {
    toast('Could not find that leave request.', 'error');
    return;
  }

  if (!confirm('Cancel this leave request? Your manager will be notified.')) return;

  try {
const updated = reqs.filter(l => !(l.id === id && l.empId === state.emp.id));
state.allData.rx3_leaveRequests = JSON.stringify(updated);

const { error } = await supabase
  .from('leave_requests')
  .delete()
  .eq('id', id)
  .eq('emp_id', state.emp.id);

if (error) throw new Error(error.message);

    await gasPost({
      action: 'sendEmail',
      fn: 'sendLeaveRequestNotification',
      payload: {
        empId: state.emp.id,
        empName: `${state.emp.first || ''} ${state.emp.last || ''}`.trim(),
        empFirst: state.emp.first || '',
        empLast: state.emp.last || '',
        empEmail: state.emp.email || '',
        empRole: state.emp.role || '',
        type: `[CANCELLED] ${lr.type}`,
        from: lr.from,
        to: lr.to,
        notes:
          `CANCELLED LEAVE REQUEST\n\n` +
          `Original request: ${lr.type || ''}, ${lr.from || ''} to ${lr.to || ''}\n` +
          `Original notes: ${lr.notes || 'None'}\n\n` +
          `This request has been cancelled by the staff member via the Staff Portal.`,
        reason: lr.notes || '',
        source: 'Staff Portal'
      }
    }).catch(err => console.warn('Leave cancellation email failed:', err));

    const fresh = await getAllData();
    if (fresh.ok) state.allData = fresh.data || state.allData;

    renderLeave();
    renderHome();

    toast('Leave request cancelled. Your manager has been notified. ✓', 'success', 5000);

  } catch (e) {
    toast('Could not cancel request: ' + e.message, 'error', 6000);
  }
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
        <button id="mc-submit-btn" class="btn btn-primary" style="flex:1" onclick="window.submitMC()">Upload certificate</button>
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
  const errEl = qs('#mc-err');
  const btn = qs('#mc-submit-btn');

  if (!_mcF) {
    if (errEl) errEl.style.display = 'block';
    return;
  }

  const mcId = 'mc' + Date.now();
  const { data, name, type } = _mcF;

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Uploading…';
  }

  toast('Uploading certificate...', 'info', 15000);

  try {
    const r = await gasPost({
      action: 'uploadMC',
      mcId,
      empId: state.emp.id,
      empName: `${state.emp.first || ''} ${state.emp.last || ''}`.trim(),
      date: _mcD,
      sickId: _mcS,
      fileName: name,
      fileType: type,
      data
    });

    const ok = r?.ok || r?.result?.ok;
    if (!ok) throw new Error(r?.error || r?.result?.error || 'Upload failed');

    const result = r?.result || r;

    const fileId = result.fileId || result.file_id || result.id || '';
    const fileUrl = result.fileUrl || result.file_url || result.url || result.webViewLink || '';
    const downloadUrl = result.downloadUrl || result.download_url || '';
    const driveFolderId = result.folderId || result.driveFolderId || '1HDf6Wk7UIHl4hvaTByrUINZOqckCS_1q';

    if (!fileId && !fileUrl) {
      throw new Error('Upload completed, but no Google Drive file ID or URL was returned.');
    }

    const sickDays = getList('sickDays');
    const currentSick = sickDays.find(s => s.id === _mcS);
    const relatedSickDays = sickDays.filter(s =>
      s.empId === state.emp.id &&
      currentSick &&
      s.date >= currentSick.date &&
      !getList('medCerts').some(mc => mc.sickId === s.id || (mc.empId === state.emp.id && mc.date === s.date))
    );

    const sickIds = relatedSickDays.length ? relatedSickDays.map(s => s.id) : [_mcS];

    sickDays.forEach(s => {
      if (sickIds.includes(s.id)) {
        s.mcUploaded = true;
        s.medCertId = mcId;
      }
    });

    const mcs = getList('medCerts');

    mcs.push({
      id: mcId,
      empId: state.emp.id,
      date: _mcD,
      sickId: _mcS,
      sickDayIds: sickIds,
      fileName: name,
      fileType: type,
      fileId,
      fileUrl,
      downloadUrl,
      driveFolderId,
      uploadedAt: new Date().toISOString(),
      managerNotified: true
    });

    await saveList('sickDays', sickDays);
    await saveList('medCerts', mcs);

    await gasPost({
      action: 'sendEmail',
      fn: 'sendMCUploadNotification',
      payload: {
        empId: state.emp.id,
        empName: `${state.emp.first || ''} ${state.emp.last || ''}`.trim(),
        date: _mcD,
        fileName: name,
        fileUrl
      }
    }).catch(err => console.warn('MC email failed:', err));

    if (qs('#mc-wrap')) qs('#mc-wrap').innerHTML = '';
    _mcF = null;

    const fresh = await getAllData();
    if (fresh.ok) state.allData = fresh.data || state.allData;

    renderLeave();
    renderHome();

    toast('Certificate uploaded and linked to sick leave. ✓', 'success');

  } catch (e) {
    console.error('MC upload failed:', e);
    toast('Upload failed: ' + e.message, 'error', 6000);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Upload certificate';
    }
  }
};

// ── OT ─────────────────────────────────────────────────────────
function renderOT() {
  const emp = state.emp;
  const reqs = getList('otRequests')
    .filter(o => String(o.empId) === String(emp.id))
    .sort((a,b) => (b.date || "").localeCompare(a.date || ""));

  const badge = o => {
    if (o.approved === true) return `<span class="badge badge-green">Approved</span>`;
    if (o.approved === false) return `<span class="badge badge-red">Denied</span>`;

    if (
      o.requestedBy === 'manager' &&
      o.availConfirmed !== true &&
      o.staffConfirmed !== false
    ) {
      return `<span class="badge badge-amber">Awaiting your response</span>`;
    }

    return `<span class="badge badge-amber">Pending</span>`;
  };

  qs('#view-ot').innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Overtime</h1>
        <div class="page-subtitle">Submit and review overtime requests.</div>
      </div>
      <button class="btn btn-primary" type="button" onclick="openOTForm()">+ Request OT</button>
    </div>

    <div id="ot-form"></div>

    <div class="section-label">My OT requests</div>
    <div class="info-grid">
      ${reqs.length ? reqs.map(o => {
        const needsStaffResponse =
          o.requestedBy === 'manager' &&
          o.availConfirmed !== true &&
          o.approved !== true &&
          o.approved !== false;

        return `
          <div class="card list-card">
            <div style="flex:1;min-width:0">
              <div class="list-title">${esc(FDS(o.date))} · ${esc(o.start || '')} – ${esc(o.end || '')}</div>
              ${o.reason ? `<div class="list-copy">${esc(o.reason)}</div>` : ''}
              ${o.task ? `<div class="list-copy">Task: ${esc(o.task)}</div>` : ''}
              ${o.staffDenialReason ? `<div class="list-copy" style="color:#A32D2D">Declined reason: ${esc(o.staffDenialReason)}</div>` : ''}
            </div>

            <div style="display:flex;flex-direction:column;gap:7px;align-items:flex-end">
              ${badge(o)}

              ${needsStaffResponse ? `
                <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
                  <button class="btn btn-primary btn-sm" type="button" onclick="respondManagerOT('${o.id}', true)">
                    Approve
                  </button>
                  <button class="btn btn-secondary btn-sm" type="button" onclick="respondManagerOT('${o.id}', false)">
                    Decline
                  </button>
                </div>
              ` : ''}
            </div>
          </div>
        `;
      }).join('') : '<div class="helper-note">No OT requests yet.</div>'}
    </div>
  `;
}

async function applyApprovedOTToShift(ot) {
  const shifts = getList('shifts');

  const shiftIdx = shifts.findIndex(s =>
    s.empId === ot.empId &&
    s.date === ot.date &&
    !s.isOT
  );

  if (shiftIdx >= 0) {
    const s = shifts[shiftIdx];

    const origStart = s.otOriginalStart || s.start;
    const origEnd = s.otOriginalEnd || s.end;

    const newStart = ot.start < origStart ? ot.start : origStart;
    const newEnd = ot.end > origEnd ? ot.end : origEnd;

    const annotations = Array.isArray(s.otAnnotations)
      ? [...s.otAnnotations]
      : [];

    if (!annotations.find(a => a.otId === ot.id)) {
      annotations.push({
        otId: ot.id,
        start: ot.start,
        end: ot.end,
        reason: ot.reason || ''
      });
    }

    const updatedShift = {
      ...s,
      start: newStart,
      end: newEnd,
      otOriginalStart: origStart,
      otOriginalEnd: origEnd,
      otAnnotations: annotations
    };

    const dbRow = {
      id: updatedShift.id,
      emp_id: updatedShift.empId,
      date: updatedShift.date,
      start: updatedShift.start,
      end: updatedShift.end,
      break_min: updatedShift.breakMin || 30,
      paid_break_min: updatedShift.paidBreakMin || 0,
      role: updatedShift.role || '',
      notes: updatedShift.notes || '',
      published: updatedShift.published === true,
      status: updatedShift.status || '',
      is_ot: updatedShift.isOT || false,
      ot_id: updatedShift.otId || null,
      ot_original_start: updatedShift.otOriginalStart,
      ot_original_end: updatedShift.otOriginalEnd,
      ot_annotations: updatedShift.otAnnotations || []
    };

    const { error } = await supabase
      .from('shifts')
      .upsert(dbRow, { onConflict: 'id' });

    if (error) throw error;

  } else {
    const staff = getList('staff');
    const emp = staff.find(s => String(s.id) === String(ot.empId));

    const dbRow = {
      id: 'sh-ot-' + Date.now(),
      emp_id: ot.empId,
      date: ot.date,
      start: ot.start,
      end: ot.end,
      break_min: 0,
      paid_break_min: 0,
      role: emp ? emp.role : '',
      notes: 'OT: ' + (ot.reason || ''),
      published: true,
      status: 'ot',
      is_ot: true,
      ot_id: ot.id,
      ot_annotations: [{
        otId: ot.id,
        start: ot.start,
        end: ot.end,
        reason: ot.reason || ''
      }]
    };

    const { error } = await supabase
      .from('shifts')
      .upsert(dbRow, { onConflict: 'id' });

    if (error) throw error;
  }
}

window.respondManagerOT = async function(id, accepted) {
  const reqs = getList('otRequests');
  const ot = reqs.find(o => o.id === id && o.empId === state.emp.id);

  if (!ot) {
    toast('Could not find this OT request.', 'error');
    return;
  }

  let denialReason = '';

  if (!accepted) {
    denialReason = prompt('Please provide a reason for declining this OT request:') || '';

    if (!denialReason.trim()) {
      toast('A reason is required to decline OT.', 'warning');
      return;
    }
  }

  try {
    const update = accepted
      ? {
          staff_confirmed: true,
          avail_confirmed: true,
          approved: true,
          staff_denial_reason: null
        }
      : {
          staff_confirmed: false,
          avail_confirmed: false,
          approved: false,
          staff_denial_reason: denialReason.trim()
        };

    const { error } = await supabase
      .from('ot_requests')
      .update(update)
      .eq('id', id)
      .eq('emp_id', state.emp.id);

    if (error) throw error;

    if (accepted) {
      await applyApprovedOTToShift({
        ...ot,
        staffConfirmed: true,
        availConfirmed: true,
        approved: true
      });
    }

    await gasPost({
      action: 'sendEmail',
      fn: 'sendOTDecisionEmail',
      payload: {
        empId: state.emp.id,
        decision: accepted ? 'approved' : 'declined',
        date: ot.date,
        start: ot.start,
        end: ot.end,
        reason: accepted ? (ot.reason || '') : denialReason.trim(),
        source: 'Staff Portal'
      }
    }).catch(err => console.warn('OT response email failed:', err));

    const fresh = await getAllData();
    if (fresh.ok) state.allData = fresh.data || state.allData;

    renderOT();
    renderRoster();
    renderHome();

    toast(
      accepted
        ? 'OT approved and added to your roster. ✓'
        : 'OT declined. Your manager has been notified.',
      accepted ? 'success' : 'info',
      5000
    );

  } catch (e) {
    console.error('OT response failed:', e);
    toast('Could not submit OT response: ' + e.message, 'error', 6000);
  }
};



window.openOTForm = function() {
  const c = qs('#ot-form');
  if (!c) return;

  c.innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <div style="font-family:'DM Serif Display',Georgia,serif;font-size:1.3rem;margin-bottom:16px">New overtime request</div>

      <div class="form-grid">
        <div class="input-wrap">
          <label for="ot-date">Date</label>
          <input class="input" id="ot-date" type="date" autocomplete="off">
        </div>

        <div class="input-wrap">
          <label for="ot-start">From</label>
          <input class="input" id="ot-start" type="time" autocomplete="off">
        </div>

        <div class="input-wrap">
          <label for="ot-end">To</label>
          <input class="input" id="ot-end" type="time" autocomplete="off">
        </div>

        <div class="input-wrap full-span">
          <label for="ot-reason">Reason</label>
          <textarea class="textarea" id="ot-reason" placeholder="Why is OT needed?"></textarea>
        </div>

        <div id="ot-err" style="display:none;color:#A32D2D;font-size:.82rem" class="full-span">
          ⚠ Please fill in date and times.
        </div>

        <div class="btn-row full-span">
          <button type="button" class="btn btn-secondary" onclick="qs('#ot-form').innerHTML=''">Cancel</button>
          <button type="button" class="btn btn-primary" id="ot-submit" onclick="submitOT()">Submit</button>
        </div>
      </div>
    </div>
  `;
};

window.submitOT = async function() {
  const date = qs('#ot-date')?.value || '';
  const start = qs('#ot-start')?.value || '';
  const end = qs('#ot-end')?.value || '';
  const reason = (qs('#ot-reason')?.value || '').trim();

  const errEl = qs('#ot-err');
  const btn = qs('#ot-submit');

  if (!date || !start || !end) {
    if (errEl) errEl.style.display = 'block';
    return;
  }

  if (errEl) errEl.style.display = 'none';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Submitting…';
  }

  const row = {
    id: 'ot' + Date.now(),
    emp_id: state.emp.id,
    date,
    start,
    end,
    reason,
    approved: null,
    requested_by: 'staff',
    submitted: new Date().toISOString(),
    staff_read: false,
    avail_confirmed: true
  };

  try {
    const { error } = await supabase
      .from('ot_requests')
      .insert([row]);

    if (error) throw error;

gasPost({
  action: 'sendEmail',
  fn: 'sendOTRequestNotification',
  payload: {
    empId: state.emp.id,
    empName: `${state.emp.first || ''} ${state.emp.last || ''}`.trim(),
    empFirst: state.emp.first || '',
    empLast: state.emp.last || '',
    empEmail: state.emp.email || '',
    empRole: state.emp.role || '',
    date,
    start,
    end,
    reason,
      requestedBy: 'staff',
      source: 'Staff Portal'
    }
  })
    .catch(err => console.warn('OT email failed:', err));

    const fresh = await getAllData();
    state.allData = fresh.data || {};

    if (qs('#ot-form')) qs('#ot-form').innerHTML = '';
    renderOT();

    toast('OT request submitted! Your manager has been notified. ✓', 'success', 5000);

  } catch (e) {
    console.error('OT submit failed:', e);
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Submit';
    }
    toast('Could not submit OT: ' + e.message, 'error', 5000);
  }
};

function normaliseAvailabilityEntry_(value) {
  if (value === false || value === null) {
    return { mode: 'unavailable', start: '', end: '' };
  }

  if (value === true || value === undefined) {
    return { mode: 'full', start: '', end: '' };
  }

  if (typeof value === 'string') {
    const mode = value.toLowerCase();
    return {
      mode: mode === 'times' ? 'times' : mode === 'unavailable' ? 'unavailable' : 'full',
      start: '',
      end: ''
    };
  }

  const mode = String(value.mode || value.type || (value.available === false ? 'unavailable' : 'full')).toLowerCase();
  return {
    mode: mode === 'times' ? 'times' : mode === 'unavailable' ? 'unavailable' : 'full',
    start: cleanTime_(value.start || value.from || ''),
    end: cleanTime_(value.end || value.to || '')
  };
}

function availabilityForDay_(emp, day) {
  return normaliseAvailabilityEntry_(emp?.availability?.[day]);
}

function availabilityLabel_(entry) {
  const value = normaliseAvailabilityEntry_(entry);
  if (value.mode === 'unavailable') return 'Unavailable';
  if (value.mode === 'times') return `${value.start || '—'} – ${value.end || '—'}`;
  return 'Available all day';
}

function availabilityEditorHTML_(emp) {
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  return `
    <div class="card" style="margin-bottom:18px">
      <div style="font-weight:700;font-size:1rem;margin-bottom:4px">Your regular availability</div>
      <div style="font-size:.82rem;color:#58584e;line-height:1.5;margin-bottom:14px">
        Set each day as fully available, unavailable, or available between specific times. Changes are visible to managers immediately.
      </div>
      <div id="availability-save-message" style="display:none;margin-bottom:12px"></div>
      <div style="display:flex;flex-direction:column;gap:9px">
        ${days.map(day => {
          const entry = availabilityForDay_(emp, day);
          return `
            <div style="border:1px solid rgba(24,24,22,.09);border-radius:14px;padding:12px;background:#fff" data-availability-day="${day}">
              <div style="display:grid;grid-template-columns:54px minmax(0,1fr);gap:10px;align-items:center">
                <div style="font-weight:750;font-size:.86rem">${day}</div>
                <select class="input availability-mode" data-day="${day}" onchange="updateAvailabilityRow('${day}')" style="padding:9px 10px">
                  <option value="full" ${entry.mode === 'full' ? 'selected' : ''}>Available all day</option>
                  <option value="times" ${entry.mode === 'times' ? 'selected' : ''}>Available between times</option>
                  <option value="unavailable" ${entry.mode === 'unavailable' ? 'selected' : ''}>Unavailable</option>
                </select>
              </div>
              <div class="availability-times" id="availability-times-${day}" style="display:${entry.mode === 'times' ? 'grid' : 'none'};grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;padding-left:64px">
                <div class="input-wrap">
                  <label>From</label>
                  <input class="input availability-start" data-day="${day}" type="time" value="${esc(entry.start || '09:00')}">
                </div>
                <div class="input-wrap">
                  <label>Until</label>
                  <input class="input availability-end" data-day="${day}" type="time" value="${esc(entry.end || '17:00')}">
                </div>
              </div>
            </div>`;
        }).join('')}
      </div>
      <div class="btn-row" style="margin-top:14px">
        <button class="btn btn-primary" id="availability-save-btn" onclick="saveAvailability()">Save availability</button>
      </div>
    </div>`;
}

window.updateAvailabilityRow = function(day) {
  const mode = qs(`.availability-mode[data-day="${day}"]`)?.value || 'full';
  const times = qs(`#availability-times-${day}`);
  if (times) times.style.display = mode === 'times' ? 'grid' : 'none';
};

window.saveAvailability = async function() {
  const btn = qs('#availability-save-btn');
  const message = qs('#availability-save-message');
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const availability = {};

  for (const day of days) {
    const mode = qs(`.availability-mode[data-day="${day}"]`)?.value || 'full';
    const start = qs(`.availability-start[data-day="${day}"]`)?.value || '';
    const end = qs(`.availability-end[data-day="${day}"]`)?.value || '';

    if (mode === 'times') {
      if (!start || !end) {
        toast(`Please enter both times for ${day}.`, 'error');
        return;
      }
      if (parseTime(end) <= parseTime(start)) {
        toast(`${day}'s end time must be after its start time.`, 'error');
        return;
      }
      availability[day] = { mode: 'times', start, end };
    } else if (mode === 'unavailable') {
      availability[day] = { mode: 'unavailable', start: '', end: '' };
    } else {
      availability[day] = { mode: 'full', start: '', end: '' };
    }
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    const { error } = await supabase
      .from('staff')
      .update({ availability })
      .eq('id', state.emp.id);
    if (error) throw new Error(error.message);

    state.emp = { ...state.emp, availability };
    const staff = getList('staff').map(person =>
      normaliseId_(person.id) === normaliseId_(state.emp.id)
        ? { ...person, availability }
        : person
    );
    state.allData.rx3_staff = JSON.stringify(staff);

    if (message) {
      message.style.display = 'block';
      message.className = 'helper-note';
      message.style.cssText = 'display:block;margin-bottom:12px;background:rgba(15,110,86,.08);border:1px solid rgba(15,110,86,.18);color:#0F6E56;border-radius:10px;padding:10px 12px;font-size:.8rem';
      message.textContent = 'Availability saved and synced with the manager portal.';
    }
    toast('Availability updated ✓', 'success');
  } catch (error) {
    toast('Could not save availability: ' + error.message, 'error', 5000);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Save availability'; }
  }
};

// ── HOURS ──────────────────────────────────────────────────────
function renderHours() {
  const emp    = state.emp;
  const shifts = getList('shifts').filter(s=>isMyEmpId_(s.empId)&&s.published);
  const td     = today();
  const ws     = weekStart(0), we=addDays(ws,6);
  const now    = new Date();
  const ms     = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
  const me     = localISO(new Date(now.getFullYear(),now.getMonth()+1,0));

  const wkH  = shifts.filter(s=>s.date>=ws&&s.date<=we).reduce((t,s)=>t+shiftHrs(s),0);
  const moH  = shifts.filter(s=>s.date>=ms&&s.date<=me).reduce((t,s)=>t+shiftHrs(s),0);
  const futH = shifts.filter(s=>s.date>td).reduce((t,s)=>t+shiftHrs(s),0);
  const rec  = shifts.filter(s=>s.date<=td).sort((a,b)=>(b.date||"").localeCompare(a.date||"")).slice(0,8);

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
    <div class="section-label">Availability</div>
    ${availabilityEditorHTML_(emp)}
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
  const emp = state.emp;
  qs('#view-profile').innerHTML = `
    <div class="page-header stack">
      <h1 class="page-title">Profile</h1>
      <div class="page-subtitle">Review and update your personal details.</div>
    </div>

    <div class="card" style="margin-bottom:18px">
      <div class="list-title" style="font-size:1.18rem">${esc(emp.first)} ${esc(emp.last)}</div>
      <div class="list-copy">${esc(emp.role)}</div>
    </div>

    <div class="section-label">Personal details</div>
    <div class="card" style="margin-bottom:18px">
      <div id="profile-save-message" style="display:none;margin-bottom:12px"></div>
      <div class="form-grid">
        <div class="input-wrap full-span">
          <label>Email address</label>
          <input class="input" id="profile-email" type="email" autocomplete="email" value="${esc(emp.email || '')}" placeholder="name@example.com">
        </div>
        <div class="input-wrap">
          <label>Phone number</label>
          <input class="input" id="profile-phone" type="tel" autocomplete="tel" value="${esc(emp.phone || '')}" placeholder="04xx xxx xxx">
        </div>
        <div class="input-wrap">
          <label>Date of birth</label>
          <input class="input" id="profile-dob" type="date" value="${esc(cleanDate_(emp.dob || ''))}">
        </div>
        <div class="btn-row full-span">
          <button class="btn btn-primary" id="profile-save-btn" onclick="savePersonalDetails()">Save personal details</button>
        </div>
      </div>
      <div style="font-size:.75rem;color:#707067;line-height:1.45;margin-top:10px">
        These details sync directly with your staff record in the manager portal.
      </div>
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

window.savePersonalDetails = async function() {
  const email = (qs('#profile-email')?.value || '').trim().toLowerCase();
  const phone = (qs('#profile-phone')?.value || '').trim();
  const dob = (qs('#profile-dob')?.value || '').trim();
  const btn = qs('#profile-save-btn');
  const message = qs('#profile-save-message');

  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    toast('Please enter a valid email address.', 'error');
    return;
  }

  if (dob && dob > today()) {
    toast('Date of birth cannot be in the future.', 'error');
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    const { data, error } = await supabase
      .from('staff')
      .update({ email, phone, dob: dob || null })
      .eq('id', state.emp.id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);

    state.emp = { ...state.emp, ...(data || {}), email, phone, dob };
    const staff = getList('staff').map(person =>
      normaliseId_(person.id) === normaliseId_(state.emp.id)
        ? { ...person, ...(data || {}), email, phone, dob }
        : person
    );
    state.allData.rx3_staff = JSON.stringify(staff);
    localStorage.setItem('dukasa_sx', JSON.stringify({ id: state.emp.id, email, ts: Date.now() }));

    if (message) {
      message.style.display = 'block';
      message.style.cssText = 'display:block;margin-bottom:12px;background:rgba(15,110,86,.08);border:1px solid rgba(15,110,86,.18);color:#0F6E56;border-radius:10px;padding:10px 12px;font-size:.8rem';
      message.textContent = 'Personal details saved and synced with the manager portal.';
    }
    toast('Personal details updated ✓', 'success');
  } catch (error) {
    toast('Could not save personal details: ' + error.message, 'error', 5000);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Save personal details'; }
  }
};

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
    const res = await getAllData();
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
        const res = await getAllData();
        if (res.ok) {
          state.allData = res.data || {};
          const fresh = getList('staff').find(s => normaliseId_(s.id) === normaliseId_(state.emp.id));
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
  const clockEl = qs('#home-clock');
  if (clockEl) clockEl.textContent = now.toLocaleTimeString('en-AU', {hour:'2-digit', minute:'2-digit'});
  const dateEl = qs('#home-date');
  if (dateEl) dateEl.textContent = now.toLocaleDateString('en-AU', {weekday:'long', day:'numeric', month:'long'});

  // ── Break elapsed timer ──────────────────────────────────
  const elEl = qs('#break-elapsed');
  if (elEl) {
    const banner    = qs('#break-timer-banner');
    const startIso  = banner ? banner.dataset.start : null;
    const remainingMinsAtStart = banner ? parseInt(banner.dataset.total||'30') : 30; // mins remaining when break started
    if (startIso && !isNaN(new Date(startIso).getTime())) {
      const startMs    = new Date(startIso).getTime();
      const elapsedSec = Math.max(0, Math.floor((now.getTime() - startMs) / 1000));
      const mm = String(Math.floor(elapsedSec/60)).padStart(2,'0');
      const ss = String(elapsedSec%60).padStart(2,'0');
      elEl.textContent = mm+':'+ss;

      // Remaining = remaining mins at break start - elapsed this session
      const totalRemainSec = (remainingMinsAtStart * 60) - elapsedSec;
      const remMin = Math.max(0, Math.floor(totalRemainSec / 60));
      const remSec = Math.max(0, Math.floor(totalRemainSec % 60));
      const remainLabel = qs('#break-remaining-label');
      if (remainLabel) {
        if (totalRemainSec > 0) {
          remainLabel.textContent = remMin+':'+String(remSec).padStart(2,'0')+' remaining';
        } else {
          remainLabel.textContent = 'Break time up';
          remainLabel.style.color = '#A32D2D';
        }
      }

      // Colour thresholds
      if (banner) {
        if (totalRemainSec <= 2 * 60) {
          banner.style.borderColor = 'rgba(163,45,45,.6)';
          banner.style.background  = '#FCEBEB';
          elEl.style.color = '#791F1F';
        } else if (totalRemainSec <= 5 * 60) {
          banner.style.borderColor = 'rgba(186,117,23,.75)';
          banner.style.background  = '#FAC775';
          elEl.style.color = '#412402';
        } else {
          banner.style.borderColor = 'rgba(186,117,23,.35)';
          banner.style.background  = '#FAEEDA';
          elEl.style.color = '#181816';
        }
      }
    }
  }

  // Re-render home if break ended while on home screen
  if (!qs('#break-elapsed') && qs('#break-timer-banner')) {
    renderHome();
  }

  // At midnight re-render
  const newDate = today();
  if (newDate !== _tickerDate) {
    _tickerDate = newDate;
    renderHome();
    renderRoster();
  }
}

// ── SYNC ───────────────────────────────────────────────────────
let _lm = '0';

async function startSync() {
  setInterval(async () => {
    try {
      // Do not refresh/re-render while a form is open
      const formOpen =
        qs('#ot-form')?.innerHTML.trim() ||
        qs('#lv-form')?.innerHTML.trim() ||
        qs('#late-modal');

      if (formOpen) return;

      const r = await getAllData();

      if (r.ok) {
        state.allData = r.data || {};

        const email = (state.emp?.email || '').toLowerCase();
        const f = email
          ? getList('staff').find(s => (s.email || '').toLowerCase() === email)
          : null;

        if (f) state.emp = f;

        // Only re-render the current view, not the whole app
        const viewEl = qs('#view-' + state.currentView);

        if (viewEl) {
          if (state.currentView === 'home') renderHome();
          if (state.currentView === 'roster') renderRoster();
          if (state.currentView === 'leave') renderLeave();
          if (state.currentView === 'ot') renderOT();
          if (state.currentView === 'hours') renderHours();
          if (state.currentView === 'profile') renderProfile();
        }
      }
    } catch (e) {
      console.warn('Background sync failed:', e.message);
    }
  }, 30000);
}
function startClockEventsRealtime() {
  supabase
    .channel('staff-clock-events-live')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'clock_events' },
      async () => {
        try {
          const r = await getAllData();

          if (r.ok) {
            state.allData = r.data || {};

            const email = (state.emp?.email || '').toLowerCase();
            const freshEmp = email
              ? getList('staff').find(s => (s.email || '').toLowerCase() === email)
              : null;

            if (freshEmp) setEmployeeContext_(freshEmp, state.emp?.id);

            if (state.currentView === 'home') renderHome();
            if (state.currentView === 'roster') renderRoster();
            if (state.currentView === 'hours') renderHours();
          }
        } catch (e) {
          console.warn('Realtime clock event refresh failed:', e.message);
        }
      }
    )
    .subscribe(status => {
      console.log('Staff realtime clock_events:', status);
    });
}

function startShiftsRealtime() {
  supabase
    .channel('staff-shifts-live')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'shifts'
      },
      async () => {
        try {
          const result = await fetchAllRows_(
            'shifts',
            query =>
              query
                .order('date', { ascending: true })
                .order('start', { ascending: true })
                .order('id', { ascending: true })
          );

          const mappedShifts = (result.data || []).map(s => ({
            ...s,
            id: normaliseId_(s.id),
            empId: normaliseId_(s.emp_id ?? s.empId),
            date: cleanDate_(s.date),
            start: cleanTime_(s.start),
            end: cleanTime_(s.end),
            published: isPublishedShift_(s),
            breakMin: s.break_min,
            paidBreakMin: s.paid_break_min,
            isOT: s.is_ot,
            otId: s.ot_id,
            otOriginalStart: s.ot_original_start,
            otOriginalEnd: s.ot_original_end,
            otAnnotations: s.ot_annotations || [],
            entryType: s.entry_type,
            leaveType: s.leave_type,
            leaveReason: s.leave_reason
          }));

          state.allData.rx3_shifts =
            JSON.stringify(mappedShifts);

          console.log(
            'Realtime shift refresh:',
            mappedShifts.length,
            'total shifts'
          );

          if (state.currentView === 'home') {
            renderHome();
          }

          if (state.currentView === 'roster') {
            renderRoster();
          }

          if (state.currentView === 'hours') {
            renderHours();
          }
        } catch (error) {
          console.warn(
            'Realtime shift refresh failed:',
            error.message
          );
        }
      }
    )
    .subscribe(status => {
      console.log('Staff realtime shifts:', status);
    });
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
  state.allData = {};
  const sx = trySession();
  if (sx) {
    showLoading();
    try {
      const r = await getAllData();
      if (!r.ok) throw new Error(r.error||'Failed');
      state.allData = r.data||{};
      // Always match by email — most reliable across id changes
      const email = (sx.email||'').toLowerCase();
      const emp = email ? getList('staff').find(s=>(s.email||'').toLowerCase()===email) : null;
      if (emp) {
        setEmployeeContext_(emp, sx.id);
        // Always update session with current id and email
        localStorage.setItem('dukasa_sx', JSON.stringify({
          id: emp.id, email: emp.email, ts: Date.now(), v: CONFIG.SESSION_VERSION
        }));
        buildApp();
        return;
      }
    } catch(e) { console.warn('Session restore failed:', e.message); }
    localStorage.removeItem('dukasa_sx');
  }
  showLogin();
}


// ── ERROR BOUNDARY ─────────────────────────────────────────────
window.onerror = function(msg, src, line, col, err) {
  document.body.innerHTML = '<div style="min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px;background:#f0efe9"><div style="max-width:360px;width:100%;background:#fff;border-radius:16px;padding:24px;text-align:center"><div style="font-size:32px;margin-bottom:12px">💊</div><div style="font-family:Georgia,serif;font-size:1.4rem;color:#534AB7;margin-bottom:8px">RosterRx</div><div style="font-size:13px;color:#A32D2D;background:rgba(163,45,45,.08);border:1px solid rgba(163,45,45,.2);border-radius:10px;padding:12px;margin-bottom:16px">App error: ' + (msg||'unknown') + ' (line ' + line + ')</div><button onclick="location.reload()" style="background:#534AB7;color:#fff;border:none;border-radius:10px;padding:12px 24px;font-size:14px;cursor:pointer">Reload</button></div></div>';
  return true;
};

window.doLogin = doLogin;
window.doSetPin = doSetPin;
window.signOut = signOut;

init();
