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
  SESSION_VERSION: 3
};

const state = {
  currentView: 'home',
  emp: null,
  allData: {},
  weekOffset: 0,
};

function normaliseId_(value) {
  return String(value ?? '').trim();
}

function isPublishedShift_(shift) {
  const value = shift?.published;

  return (
    value === true ||
    value === 1 ||
    String(value).trim().toLowerCase() === 'true' ||
    String(shift?.status || '').trim().toLowerCase() === 'published'
  );
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
    supabase
      .from('staff')
      .select('*'),

    supabase
      .from('shifts')
      .select('*')
      .order('date', { ascending: true })
      .order('start', { ascending: true }),

    supabase
      .from('clock_events')
      .select('*')
      .gte('date', addDays(today(), -14))
      .lte('date', addDays(today(), 1))
      .order('date', { ascending: false })
      .order('time', { ascending: false })
      .limit(2000),

    supabase
      .from('leave_requests')
      .select('*'),

    supabase
      .from('ot_requests')
      .select('*'),

    supabase
      .from('sick_days')
      .select('*'),

    supabase
      .from('med_certs')
      .select('*'),

    supabase
      .from('announcements')
      .select('*')
  ]);

  if (staff.error) {
    throw new Error(staff.error.message);
  }

  if (shifts.error) {
    throw new Error(shifts.error.message);
  }

  if (clockEvents.error) {
    throw new Error(clockEvents.error.message);
  }

  if (leaveRequests.error) {
    throw new Error(leaveRequests.error.message);
  }

  if (otRequests.error) {
    throw new Error(otRequests.error.message);
  }

  if (sickDays.error) {
    throw new Error(sickDays.error.message);
  }

  if (medCerts.error) {
    throw new Error(medCerts.error.message);
  }

  if (announcements.error) {
    throw new Error(announcements.error.message);
  }

  const mappedShifts = (shifts.data || []).map(shift => ({
    ...shift,

    id: normaliseId_(shift.id),

    empId: normaliseId_(
      shift.emp_id ?? shift.empId
    ),

    date: cleanDate_(shift.date),
    start: cleanTime_(shift.start),
    end: cleanTime_(shift.end),

    published: isPublishedShift_(shift),

    breakMin: shift.break_min,
    paidBreakMin: shift.paid_break_min,

    isOT: shift.is_ot,
    otId: shift.ot_id,

    otOriginalStart: shift.ot_original_start,
    otOriginalEnd: shift.ot_original_end,

    otAnnotations: shift.ot_annotations || [],

    entryType: shift.entry_type,
    leaveType: shift.leave_type,
    leaveReason: shift.leave_reason
  }));

  const mappedClockEvents = (clockEvents.data || []).map(event => ({
    ...event,

    empId: normaliseId_(
      event.emp_id ?? event.empId
    ),

    shiftId: normaliseId_(
      event.shift_id ?? event.shiftId
    ),

    photoUrl:
      event.photo_url ??
      event.photoUrl ??
      null,

    ts:
      event.ts ??
      event.timestamp ??
      event.created_at ??
      null,

    date: cleanDate_(event.date),
    time: cleanTime_(event.time),

    type: String(event.type || '').trim()
  }));

  const mappedLeaveRequests = (leaveRequests.data || []).map(leave => ({
    ...leave,

    empId: normaliseId_(
      leave.emp_id ?? leave.empId
    ),

    changeRequested: leave.change_requested,

    previousFrom: leave.previous_from,
    previousTo: leave.previous_to,
    previousType: leave.previous_type,
    previousStatus: leave.previous_status,

    editedAt: leave.edited_at,
    lastEditedBy: leave.last_edited_by,

    requestKind: leave.request_kind,

    partialStart: leave.partial_start,
    partialEnd: leave.partial_end,

    medicalCertificateRequired:
      leave.medical_certificate_required
  }));

  const mappedOTRequests = (otRequests.data || []).map(request => ({
    ...request,

    empId: normaliseId_(
      request.emp_id ?? request.empId
    ),

    requestedBy: request.requested_by,
    staffRead: request.staff_read,
    availConfirmed: request.avail_confirmed,
    staffConfirmed: request.staff_confirmed,

    staffDenialReason:
      request.staff_denial_reason,

    task: request.task || ''
  }));

  const mappedSickDays = (sickDays.data || []).map(sickDay => ({
    ...sickDay,

    empId: normaliseId_(
      sickDay.emp_id ?? sickDay.empId
    ),

    date: cleanDate_(sickDay.date)
  }));

  const mappedMedCerts = (medCerts.data || []).map(certificate => ({
    ...certificate,

    empId: normaliseId_(
      certificate.emp_id ?? certificate.empId
    ),

    sickId: normaliseId_(
      certificate.sick_id ?? certificate.sickId
    ),

    fileName: certificate.file_name,
    fileType: certificate.file_type,

    uploadedAt: certificate.uploaded_at,

    managerNotified:
      certificate.manager_notified
  }));

  const mappedAnnouncements = (announcements.data || []).map(
    announcement => ({
      ...announcement,

      staffIds:
        announcement.staffIds ||
        announcement.staff_ids ||
        announcement.staffids ||
        [],

      notifyStaff:
        announcement.notifyStaff ||
        announcement.notify_staff ||
        false
    })
  );

  return {
    ok: true,

    data: {
      rx3_staff: JSON.stringify(
        (staff.data || []).map(record => ({
          ...record,
          id: normaliseId_(record.id)
        }))
      ),

      rx3_shifts:
        JSON.stringify(mappedShifts),

      rx3_clockEvents:
        JSON.stringify(mappedClockEvents),

      rx3_leaveRequests:
        JSON.stringify(mappedLeaveRequests),

      rx3_otRequests:
        JSON.stringify(mappedOTRequests),

      rx3_sickDays:
        JSON.stringify(mappedSickDays),

      rx3_medCerts:
        JSON.stringify(mappedMedCerts),

      rx3_announcements:
        JSON.stringify(mappedAnnouncements)
    }
  };
}


// ── UTILS ─────────────────────────────────────────────────────

const qs = (selector, root = document) =>
  root.querySelector(selector);

const qsa = (selector, root = document) =>
  [...root.querySelectorAll(selector)];

const esc = value =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');


// Make helpers available to inline onclick handlers.

window.qs = qs;
window.qsa = qsa;


// Never use toISOString() for local roster dates.
//
// toISOString() returns UTC and can return the previous calendar date
// during Australian mornings.

function localISO(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

const today = () =>
  localISO(new Date());


function FD(isoDate) {
  if (!isoDate) {
    return '';
  }

  return new Date(`${isoDate}T00:00:00`)
    .toLocaleDateString('en-AU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
}


function FDS(isoDate) {
  if (!isoDate) {
    return '';
  }

  const date = new Date(
    String(isoDate).length === 10
      ? `${isoDate}T00:00:00`
      : isoDate
  );

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short'
  });
}


function FDOW(isoDate) {
  if (!isoDate) {
    return '';
  }

  const date = new Date(
    String(isoDate).length === 10
      ? `${isoDate}T00:00:00`
      : isoDate
  );

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleDateString('en-AU', {
    weekday: 'long'
  });
}


function parseTime(time) {
  if (!time) {
    return 0;
  }

  const [hours, minutes] =
    String(time).split(':').map(Number);

  return hours * 60 + minutes;
}


function roundHalf(number) {
  return Math.round(number * 2) / 2;
}


// Paid rostered hours = gross shift length minus 30 unpaid minutes.

function shiftHrs(shift) {
  if (!shift || !shift.start || !shift.end) {
    return 0;
  }

  const grossMinutes =
    parseTime(shift.end) -
    parseTime(shift.start);

  return roundHalf(
    Math.max(
      0,
      (grossMinutes - 30) / 60
    )
  );
}


function weekStart(offset = 0) {
  const date = new Date();

  date.setHours(0, 0, 0, 0);

  const difference =
    (
      date.getDay() === 0
        ? -6
        : 1 - date.getDay()
    ) +
    offset * 7;

  date.setDate(
    date.getDate() + difference
  );

  return localISO(date);
}


function addDays(isoDate, numberOfDays) {
  const date = new Date(
    `${isoDate}T00:00:00`
  );

  date.setDate(
    date.getDate() + numberOfDays
  );

  return localISO(date);
}


function datesBetween(fromDate, toDate) {
  const dates = [];

  let date = fromDate;

  while (date <= toDate) {
    dates.push(date);
    date = addDays(date, 1);
  }

  return dates;
}
