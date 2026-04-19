const state = {
  activePage: "home",
};

const mockData = {
  weekDays: [
    { name: "Mon", num: "13" },
    { name: "Tue", num: "14" },
    { name: "Wed", num: "15" },
    { name: "Thu", num: "16" },
    { name: "Fri", num: "17" },
    { name: "Sat", num: "18" },
    { name: "Sun", num: "19", active: true },
  ],
  upcomingShifts: [
    {
      title: "Mon, 20 Apr",
      subtitle: "08:00 – 17:00 · 30min break",
      hours: "8.5h",
    },
    {
      title: "Tue, 21 Apr",
      subtitle: "08:00 – 17:00 · 30min break",
      hours: "8.5h",
    },
    {
      title: "Wed, 22 Apr",
      subtitle: "08:00 – 17:00 · 30min break",
      hours: "8.5h",
    },
    {
      title: "Thu, 23 Apr",
      subtitle: "08:00 – 17:00 · 30min break",
      hours: "8.5h",
    },
  ],
  roster: [
    { day: "MON 13", status: "08:00–19:00", meta: "10.5 hrs · 30m break", sick: false },
    { day: "TUE 14", status: "Off", meta: "", sick: false },
    { day: "WED 15", status: "Sick", meta: "", sick: true },
    { day: "THU 16", status: "Sick", meta: "", sick: true },
    { day: "FRI 17", status: "Sick", meta: "", sick: true },
    { day: "SAT 18", status: "Off", meta: "", sick: false },
    { day: "SUN 19", status: "Off", meta: "", sick: false },
  ],
  leaveHistory: [
    { title: "Annual Leave", subtitle: "16 Apr – 17 Apr", badge: "declined", badgeClass: "danger" },
    { title: "Annual Leave", subtitle: "16 Apr – 16 Apr", badge: "declined", badgeClass: "danger" },
  ],
  sickDays: [
    { title: "Sick day — 16 Apr", subtitle: "✓ Uploaded 17/4/2026", badge: "MC uploaded", badgeClass: "success" },
    { title: "Sick day — 15 Apr", subtitle: "✓ Uploaded 17/4/2026", badge: "MC uploaded", badgeClass: "success" },
    { title: "Sick day — 17 Apr", subtitle: "✓ Uploaded 17/4/2026", badge: "MC uploaded", badgeClass: "success" },
    { title: "Sick day — 20 Apr", subtitle: "✓ Uploaded 17/4/2026", badge: "MC uploaded", badgeClass: "success" },
    { title: "Sick day — 21 Apr", subtitle: "✓ Uploaded 17/4/2026", badge: "MC uploaded", badgeClass: "success" },
    { title: "Sick day — 22 Apr", subtitle: "✓ Uploaded 17/4/2026", badge: "MC uploaded", badgeClass: "success" },
    { title: "Sick day — 23 Apr", subtitle: "✓ Uploaded 17/4/2026", badge: "MC uploaded", badgeClass: "success" },
  ],
  otHistory: [
    { title: "OT — 12 Apr", subtitle: "2.0 hours · approved", badge: "approved", badgeClass: "success" },
    { title: "OT — 04 Apr", subtitle: "1.5 hours · declined", badge: "declined", badgeClass: "danger" },
  ],
};

function renderWeekStrip() {
  const el = document.getElementById("weekStrip");
  if (!el) return;

  el.innerHTML = mockData.weekDays
    .map(
      (d) => `
      <div class="week-day ${d.active ? "active" : ""}">
        <span class="week-day-name">${d.name}</span>
        <span class="week-day-num">${d.num}</span>
      </div>
    `
    )
    .join("");
}

function renderUpcomingShifts() {
  const el = document.getElementById("upcomingShifts");
  if (!el) return;

  el.innerHTML = mockData.upcomingShifts
    .map(
      (shift) => `
      <div class="shift-card">
        <div>
          <div class="shift-title">${shift.title}</div>
          <div class="shift-subtitle">${shift.subtitle}</div>
        </div>
        <div class="shift-hours">${shift.hours}</div>
      </div>
    `
    )
    .join("");
}

function renderRoster() {
  const el = document.getElementById("rosterList");
  if (!el) return;

  el.innerHTML = mockData.roster
    .map(
      (item) => `
      <div class="shift-card" style="${
        item.sick ? "box-shadow: 0 0 0 1px rgba(164,63,63,0.28), 0 12px 24px rgba(164,63,63,0.06);" : ""
      }">
        <div>
          <div class="card-subtitle" style="margin-top:0;">${item.day}</div>
          <div class="shift-title" style="${item.sick ? "color:#a43f3f;" : ""}">${item.status}</div>
          ${item.meta ? `<div class="shift-subtitle">${item.meta}</div>` : ``}
        </div>
      </div>
    `
    )
    .join("");
}

function renderLeaveHistory() {
  const el = document.getElementById("leaveHistory");
  if (!el) return;

  el.innerHTML = mockData.leaveHistory
    .map(
      (item) => `
      <div class="leave-card">
        <div>
          <div class="card-main-title">${item.title}</div>
          <div class="card-subtitle">${item.subtitle}</div>
        </div>
        <div class="badge ${item.badgeClass}">${item.badge}</div>
      </div>
    `
    )
    .join("");
}

function renderSickDays() {
  const el = document.getElementById("sickDays");
  if (!el) return;

  el.innerHTML = mockData.sickDays
    .map(
      (item) => `
      <div class="sick-card">
        <div>
          <div class="card-main-title">${item.title}</div>
          <div class="card-subtitle success">${item.subtitle}</div>
        </div>
        <div class="badge ${item.badgeClass}">${item.badge}</div>
      </div>
    `
    )
    .join("");
}

function renderOTHistory() {
  const el = document.getElementById("otHistory");
  if (!el) return;

  el.innerHTML = mockData.otHistory
    .map(
      (item) => `
      <div class="ot-card">
        <div>
          <div class="card-main-title">${item.title}</div>
          <div class="card-subtitle">${item.subtitle}</div>
        </div>
        <div class="badge ${item.badgeClass}">${item.badge}</div>
      </div>
    `
    )
    .join("");
}

function switchPage(pageName) {
  state.activePage = pageName;

  document.querySelectorAll(".page").forEach((page) => {
    page.classList.remove("active");
  });

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.remove("active");
  });

  const nextPage = document.getElementById(`page-${pageName}`);
  if (nextPage) nextPage.classList.add("active");

  const nextTab = document.querySelector(`.tab[data-page="${pageName}"]`);
  if (nextTab) nextTab.classList.add("active");

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openLeaveModal() {
  const modal = document.getElementById("m-leave");
  if (!modal) return;
  modal.classList.add("open");
  document.body.classList.add("modal-open");
}

function openOTModal() {
  const modal = document.getElementById("m-ot");
  if (!modal) return;
  modal.classList.add("open");
  document.body.classList.add("modal-open");
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove("open");

  const stillOpen = document.querySelector(".modal-overlay.open");
  if (!stillOpen) {
    document.body.classList.remove("modal-open");
  }
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}

function submitLeaveRequest(event) {
  event.preventDefault();
  closeModal("m-leave");
  event.target.reset();
  showToast("Leave request submitted");
}

function submitOTRequest(event) {
  event.preventDefault();
  closeModal("m-ot");
  event.target.reset();
  showToast("OT request submitted");
}

function bindEvents() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      switchPage(tab.dataset.page);
    });
  });

  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.classList.remove("open");
        const stillOpen = document.querySelector(".modal-overlay.open");
        if (!stillOpen) {
          document.body.classList.remove("modal-open");
        }
      }
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(".modal-overlay.open").forEach((modal) => {
        modal.classList.remove("open");
      });
      document.body.classList.remove("modal-open");
    }
  });
}

function init() {
  renderWeekStrip();
  renderUpcomingShifts();
  renderRoster();
  renderLeaveHistory();
  renderSickDays();
  renderOTHistory();
  bindEvents();
}

document.addEventListener("DOMContentLoaded", init);
