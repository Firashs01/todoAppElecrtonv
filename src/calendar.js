/**
 * FocusFlow — Activity Calendar & Day Detail View Logic
 * Pure vanilla JavaScript implementation for monthly calendar grid,
 * date activity cross-referencing, and daily reflections management.
 */

(() => {
  "use strict";

  // ===========================================================================
  // 1. Constants & Date Helpers
  // ===========================================================================
  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const DAY_NAMES = [
    "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
  ];

  function getTodayString() {
    return FocusFlowStorage.getLocalDateString();
  }

  function parseDateString(dateStr) {
    if (!dateStr || typeof dateStr !== "string") {
      const today = new Date();
      return { year: today.getFullYear(), month: today.getMonth(), day: today.getDate() };
    }
    const parts = dateStr.split("-").map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) {
      const today = new Date();
      return { year: today.getFullYear(), month: today.getMonth(), day: today.getDate() };
    }
    return { year: parts[0], month: parts[1] - 1, day: parts[2] };
  }

  function addDaysToDateStr(dateStr, offsetDays) {
    const { year, month, day } = parseDateString(dateStr);
    // Use noon (12:00:00) to protect against daylight saving time transitions
    const d = new Date(year, month, day + offsetDays, 12, 0, 0);
    return FocusFlowStorage.getLocalDateString(d);
  }

  function formatFullDate(dateStr) {
    const { year, month, day } = parseDateString(dateStr);
    const d = new Date(year, month, day, 12, 0, 0);
    const dayName = DAY_NAMES[d.getDay()];
    const monthName = MONTH_NAMES[month];
    return `${dayName}, ${monthName} ${day}, ${year}`;
  }

  function formatCompletionTime(isoStr) {
    if (!isoStr) return "";
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return "";
      return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    } catch {
      return "";
    }
  }

  function formatCompactDuration(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds || 0));
    if (s <= 0) return "0m";
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) {
      return `${m}m`;
    }
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return remM > 0 ? `${h}h ${remM}m` : `${h}h`;
  }

  function escapeHTML(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // ===========================================================================
  // 2. DOM Elements
  // ===========================================================================
  const DOM = {
    themeToggleBtn: document.getElementById("themeToggleBtn"),
    toastContainer: document.getElementById("toastContainer"),

    // Views
    calendarMonthView: document.getElementById("calendarMonthView"),
    calendarDayView: document.getElementById("calendarDayView"),

    // Month View Controls
    prevMonthBtn: document.getElementById("prevMonthBtn"),
    todayMonthBtn: document.getElementById("todayMonthBtn"),
    nextMonthBtn: document.getElementById("nextMonthBtn"),
    currentMonthLabel: document.getElementById("currentMonthLabel"),
    calendarDaysGrid: document.getElementById("calendarDaysGrid"),

    // Month Summary Cards
    monthFocusTime: document.getElementById("monthFocusTime"),
    monthCompletedTasks: document.getElementById("monthCompletedTasks"),
    monthNotesCount: document.getElementById("monthNotesCount"),

    // Day View Controls
    backToCalendarBtn: document.getElementById("backToCalendarBtn"),
    prevDayBtn: document.getElementById("prevDayBtn"),
    todayJumpBtn: document.getElementById("todayJumpBtn"),
    nextDayBtn: document.getElementById("nextDayBtn"),
    dayDetailTitle: document.getElementById("dayDetailTitle"),
    dayDetailSubtitle: document.getElementById("dayDetailSubtitle"),

    // Day Summary KPIs
    dayTimeInApp: document.getElementById("dayTimeInApp"),
    dayTasksCompletedCount: document.getElementById("dayTasksCompletedCount"),
    dayNotesCount: document.getElementById("dayNotesCount"),

    // Day Tasks Section
    dayCompletedTasksBadge: document.getElementById("dayCompletedTasksBadge"),
    toggleAddTaskBtn: document.getElementById("toggleAddTaskBtn"),
    quickAddTaskForm: document.getElementById("quickAddTaskForm"),
    quickTaskTitleInput: document.getElementById("quickTaskTitleInput"),
    quickTaskPrioritySelect: document.getElementById("quickTaskPrioritySelect"),
    quickTaskMarkCompleted: document.getElementById("quickTaskMarkCompleted"),
    cancelQuickTaskBtn: document.getElementById("cancelQuickTaskBtn"),
    dayTasksList: document.getElementById("dayTasksList"),
    dayTasksEmptyState: document.getElementById("dayTasksEmptyState"),

    // Day Notes Section
    dayNotesCountBadge: document.getElementById("dayNotesCountBadge"),
    quickNoteTitleInput: document.getElementById("quickNoteTitleInput"),
    quickNoteBodyInput: document.getElementById("quickNoteBodyInput"),
    saveQuickNoteBtn: document.getElementById("saveQuickNoteBtn"),
    dayNotesList: document.getElementById("dayNotesList"),
    dayNotesEmptyState: document.getElementById("dayNotesEmptyState")
  };

  // ===========================================================================
  // 3. State
  // ===========================================================================
  const now = new Date();
  let currentYear = now.getFullYear();
  let currentMonth = now.getMonth(); // 0-indexed
  let currentDayDateStr = getTodayString();
  let activeView = "month"; // 'month' | 'day'

  // ===========================================================================
  // 4. Toast Utility
  // ===========================================================================
  function showToast(message, options = {}) {
    if (!DOM.toastContainer) return;
    const { duration = 3000 } = options;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.setAttribute("role", "alert");
    toast.innerHTML = `
      <span class="toast-message"></span>
      <div class="toast-actions">
        <button type="button" class="btn-toast-close" aria-label="Close notification">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;
    toast.querySelector(".toast-message").textContent = message;
    DOM.toastContainer.appendChild(toast);

    let timerId = null;
    const dismiss = () => {
      if (timerId) clearTimeout(timerId);
      toast.classList.add("is-leaving");
      setTimeout(() => toast.remove(), 200);
    };
    toast.querySelector(".btn-toast-close").addEventListener("click", dismiss);
    timerId = setTimeout(dismiss, duration);
  }

  // ===========================================================================
  // 5. Monthly Calendar Render Logic
  // ===========================================================================
  function renderMonthCalendar() {
    DOM.currentMonthLabel.textContent = `${MONTH_NAMES[currentMonth]} ${currentYear}`;

    // Get date stats
    const todayStr = getTodayString();
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay(); // 0 = Sun
    const daysInCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

    // Accumulators for monthly summary strip
    let monthTotalSeconds = 0;
    let monthTotalCompleted = 0;
    let monthTotalNotes = 0;

    DOM.calendarDaysGrid.innerHTML = "";

    // 1. Cells from previous month to fill the first row
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const prevDayNum = daysInPrevMonth - i;
      const prevDate = new Date(currentYear, currentMonth - 1, prevDayNum, 12, 0, 0);
      const dateStr = FocusFlowStorage.getLocalDateString(prevDate);
      const cell = createDayCellElement({
        dateStr,
        dayNumber: prevDayNum,
        isOtherMonth: true,
        isToday: dateStr === todayStr
      });
      DOM.calendarDaysGrid.appendChild(cell);
    }

    // 2. Cells for current month days
    for (let day = 1; day <= daysInCurrentMonth; day++) {
      const curDate = new Date(currentYear, currentMonth, day, 12, 0, 0);
      const dateStr = FocusFlowStorage.getLocalDateString(curDate);
      const activity = FocusFlowStorage.getDayActivity(dateStr);

      monthTotalSeconds += activity.timeSeconds;
      monthTotalCompleted += activity.completedTasks.length;
      monthTotalNotes += activity.notes.length;

      const cell = createDayCellElement({
        dateStr,
        dayNumber: day,
        isOtherMonth: false,
        isToday: dateStr === todayStr,
        activity
      });
      DOM.calendarDaysGrid.appendChild(cell);
    }

    // 3. Cells from next month to complete the 7-column grid
    const totalRenderedCells = firstDayIndex + daysInCurrentMonth;
    const remainingCells = (7 - (totalRenderedCells % 7)) % 7;
    for (let day = 1; day <= remainingCells; day++) {
      const nextDate = new Date(currentYear, currentMonth + 1, day, 12, 0, 0);
      const dateStr = FocusFlowStorage.getLocalDateString(nextDate);
      const cell = createDayCellElement({
        dateStr,
        dayNumber: day,
        isOtherMonth: true,
        isToday: dateStr === todayStr
      });
      DOM.calendarDaysGrid.appendChild(cell);
    }

    // Update Month Summary Cards
    DOM.monthFocusTime.textContent = formatCompactDuration(monthTotalSeconds);
    DOM.monthCompletedTasks.textContent = String(monthTotalCompleted);
    DOM.monthNotesCount.textContent = String(monthTotalNotes);
  }

  function createDayCellElement({ dateStr, dayNumber, isOtherMonth, isToday, activity }) {
    const act = activity || FocusFlowStorage.getDayActivity(dateStr);

    const cell = document.createElement("div");
    cell.className = "calendar-day-cell";
    cell.setAttribute("role", "button");
    cell.setAttribute("tabindex", "0");
    cell.setAttribute("data-date", dateStr);
    cell.setAttribute("aria-label", `${formatFullDate(dateStr)}, ${act.completedTasks.length} tasks completed, ${act.notes.length} notes`);

    if (isOtherMonth) cell.classList.add("is-other-month");
    if (isToday) cell.classList.add("is-today");

    // Top row: Day Number + Today Badge
    const topRow = document.createElement("div");
    topRow.className = "calendar-day-top";

    const dayNumSpan = document.createElement("span");
    dayNumSpan.className = "calendar-day-number";
    dayNumSpan.textContent = String(dayNumber);
    topRow.appendChild(dayNumSpan);

    if (isToday) {
      const todayBadge = document.createElement("span");
      todayBadge.className = "calendar-today-badge";
      todayBadge.textContent = "Today";
      topRow.appendChild(todayBadge);
    }

    cell.appendChild(topRow);

    // Indicator group
    const indicatorsGroup = document.createElement("div");
    indicatorsGroup.className = "calendar-day-indicators";

    // 1. Completed Tasks Badge
    if (act.completedTasks.length > 0) {
      const tasksBadge = document.createElement("span");
      tasksBadge.className = "cal-pill cal-badge-tasks";
      tasksBadge.title = `${act.completedTasks.length} task${act.completedTasks.length === 1 ? "" : "s"} completed`;
      tasksBadge.innerHTML = `
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>${act.completedTasks.length} done</span>
      `;
      indicatorsGroup.appendChild(tasksBadge);
    }

    // 2. Time in App Pill
    if (act.timeSeconds > 0) {
      const timePill = document.createElement("span");
      timePill.className = "cal-pill cal-pill-time";
      timePill.title = `Focus time: ${FocusFlowStorage.formatDuration(act.timeSeconds)}`;
      timePill.innerHTML = `
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        <span>${formatCompactDuration(act.timeSeconds)}</span>
      `;
      indicatorsGroup.appendChild(timePill);
    }

    // 3. Notes Indicator
    if (act.notes.length > 0) {
      const notesDot = document.createElement("span");
      notesDot.className = "cal-pill cal-dot-notes";
      notesDot.title = `${act.notes.length} note${act.notes.length === 1 ? "" : "s"} logged`;
      notesDot.innerHTML = `
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
        </svg>
        <span>${act.notes.length} note${act.notes.length === 1 ? "" : "s"}</span>
      `;
      indicatorsGroup.appendChild(notesDot);
    }

    cell.appendChild(indicatorsGroup);

    // Click handler to open Day Detail View
    cell.addEventListener("click", () => {
      navigateToDay(dateStr);
    });

    cell.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        navigateToDay(dateStr);
      }
    });

    return cell;
  }

  // ===========================================================================
  // 6. Day Detail View Render Logic
  // ===========================================================================
  function renderDayDetail(dateStr) {
    currentDayDateStr = dateStr;
    const activity = FocusFlowStorage.getDayActivity(dateStr);

    // 1. Header & Summary KPIs
    DOM.dayDetailTitle.textContent = formatFullDate(dateStr);
    const isToday = dateStr === getTodayString();
    DOM.dayDetailSubtitle.textContent = isToday
      ? "Today's live focus metrics, completed tasks, and reflections."
      : `Productivity & reflection snapshot for ${formatFullDate(dateStr)}.`;

    DOM.dayTimeInApp.textContent = formatCompactDuration(activity.timeSeconds);
    DOM.dayTasksCompletedCount.textContent = String(activity.completedTasks.length);
    DOM.dayNotesCount.textContent = String(activity.notes.length);

    // Badges on section headers
    DOM.dayCompletedTasksBadge.textContent = String(activity.completedTasks.length);
    DOM.dayNotesCountBadge.textContent = String(activity.notes.length);

    // 2. Render Completed Tasks List
    renderDayTasks(activity.completedTasks, dateStr);

    // 3. Render Notes List
    renderDayNotes(activity.notes, dateStr);
  }

  function renderDayTasks(tasks, dateStr) {
    DOM.dayTasksList.innerHTML = "";

    if (!tasks || tasks.length === 0) {
      DOM.dayTasksList.hidden = true;
      DOM.dayTasksEmptyState.hidden = false;
      return;
    }

    DOM.dayTasksList.hidden = false;
    DOM.dayTasksEmptyState.hidden = true;

    tasks.forEach(task => {
      const row = document.createElement("div");
      row.className = "day-task-row";

      // Left: Checkbox + Title
      const left = document.createElement("div");
      left.className = "day-task-left";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "custom-checkbox";
      checkbox.checked = Boolean(task.completed);
      checkbox.setAttribute("aria-label", `Mark ${task.title} as ${task.completed ? "uncompleted" : "completed"}`);
      checkbox.addEventListener("change", () => {
        FocusFlowStorage.toggleTaskCompletion(task.id);
        showToast(checkbox.checked ? "Task marked completed" : "Task marked active");
        renderDayDetail(currentDayDateStr);
      });

      const titleSpan = document.createElement("span");
      titleSpan.className = "day-task-title" + (task.completed ? " is-completed" : "");
      titleSpan.textContent = task.title;

      left.appendChild(checkbox);
      left.appendChild(titleSpan);

      // Right: Priority Badge + Completion Timestamp
      const right = document.createElement("div");
      right.className = "day-task-right";

      if (task.notionUrl) {
        const displayTitle = task.notionTitle || FocusFlowStorage.formatNotionDisplay(task.notionUrl);
        const notionBtn = document.createElement("button");
        notionBtn.type = "button";
        notionBtn.className = "badge badge-notion action-open-notion";
        notionBtn.title = `Open in Notion: ${displayTitle}`;

        let iconHtml = "";
        if (task.notionIcon) {
          if (task.notionIcon.startsWith("http://") || task.notionIcon.startsWith("https://")) {
            iconHtml = `<img class="notion-badge-img" src="${task.notionIcon}" alt="" />`;
          } else {
            iconHtml = `<span class="notion-badge-emoji">${task.notionIcon}</span>`;
          }
        } else {
          iconHtml = `
            <svg class="notion-icon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.69c-.466-.373-.84-.373-1.446-.326L3.62 2.39c-.466.047-.56.327-.373.513l1.212 1.305zm1.586 3.964v12.215c0 .793.42 1.072 1.259 1.025l13.448-.792c.793-.047.887-.606.887-1.166V6.958c0-.56-.467-.84-1.026-.793l-13.682.793c-.653.047-.886.42-.886 1.214zm11.754-.047c.14 0 .327.14.327.373v9.043c0 .56-.374.793-.84.84l-2.006.14c-.373.047-.466-.187-.466-.42v-6.39l-4.152 6.577c-.233.373-.513.513-.933.513h-.746c-.28 0-.466-.233-.466-.513V8.87c0-.513.373-.793.793-.84l2.1-.14c.373-.047.466.186.466.42v5.783l3.872-6.11c.233-.373.56-.513.886-.513l.167.047z"/>
            </svg>
          `;
        }

        notionBtn.innerHTML = `
          ${iconHtml}
          <span class="badge-notion-title">${displayTitle}</span>
        `;
        notionBtn.addEventListener("click", e => {
          e.stopPropagation();
          e.preventDefault();
          FocusFlowStorage.openExternalUrl(task.notionUrl);
        });
        right.appendChild(notionBtn);
      }

      const priorityBadge = document.createElement("span");
      priorityBadge.className = `badge badge-priority badge-priority-${task.priority || "medium"}`;
      priorityBadge.textContent = (task.priority || "medium").toUpperCase();
      right.appendChild(priorityBadge);

      if (task.completedAt) {
        const timeSpan = document.createElement("span");
        timeSpan.className = "day-task-time";
        timeSpan.textContent = formatCompletionTime(task.completedAt);
        right.appendChild(timeSpan);
      }

      row.appendChild(left);
      row.appendChild(right);
      DOM.dayTasksList.appendChild(row);
    });
  }

  function renderDayNotes(notes, dateStr) {
    DOM.dayNotesList.innerHTML = "";

    if (!notes || notes.length === 0) {
      DOM.dayNotesList.hidden = true;
      DOM.dayNotesEmptyState.hidden = false;
      return;
    }

    DOM.dayNotesList.hidden = false;
    DOM.dayNotesEmptyState.hidden = true;

    notes.forEach(note => {
      const card = document.createElement("div");
      card.className = "day-note-card";

      const header = document.createElement("div");
      header.className = "day-note-header";

      const title = document.createElement("span");
      title.className = "day-note-title";
      title.textContent = note.title;

      const time = document.createElement("span");
      time.className = "day-note-time";
      time.textContent = note.updatedAt ? formatCompletionTime(note.updatedAt) : "";

      header.appendChild(title);
      header.appendChild(time);
      card.appendChild(header);

      if (note.body) {
        const body = document.createElement("div");
        body.className = "day-note-body";
        body.textContent = note.body;
        card.appendChild(body);
      }

      const actions = document.createElement("div");
      actions.className = "day-note-actions";

      if (note.notionUrl) {
        const displayTitle = note.notionTitle || FocusFlowStorage.formatNotionDisplay(note.notionUrl);
        const notionBtn = document.createElement("button");
        notionBtn.type = "button";
        notionBtn.className = "badge badge-notion action-open-notion";
        notionBtn.title = `Open in Notion: ${displayTitle}`;

        let iconHtml = "";
        if (note.notionIcon) {
          if (note.notionIcon.startsWith("http://") || note.notionIcon.startsWith("https://")) {
            iconHtml = `<img class="notion-badge-img" src="${note.notionIcon}" alt="" />`;
          } else {
            iconHtml = `<span class="notion-badge-emoji">${note.notionIcon}</span>`;
          }
        } else {
          iconHtml = `
            <svg class="notion-icon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.69c-.466-.373-.84-.373-1.446-.326L3.62 2.39c-.466.047-.56.327-.373.513l1.212 1.305zm1.586 3.964v12.215c0 .793.42 1.072 1.259 1.025l13.448-.792c.793-.047.887-.606.887-1.166V6.958c0-.56-.467-.84-1.026-.793l-13.682.793c-.653.047-.886.42-.886 1.214zm11.754-.047c.14 0 .327.14.327.373v9.043c0 .56-.374.793-.84.84l-2.006.14c-.373.047-.466-.187-.466-.42v-6.39l-4.152 6.577c-.233.373-.513.513-.933.513h-.746c-.28 0-.466-.233-.466-.513V8.87c0-.513.373-.793.793-.84l2.1-.14c.373-.047.466.186.466.42v5.783l3.872-6.11c.233-.373.56-.513.886-.513l.167.047z"/>
            </svg>
          `;
        }

        notionBtn.innerHTML = `
          ${iconHtml}
          <span class="badge-notion-title">${displayTitle}</span>
        `;
        notionBtn.addEventListener("click", e => {
          e.stopPropagation();
          e.preventDefault();
          FocusFlowStorage.openExternalUrl(note.notionUrl);
        });
        actions.appendChild(notionBtn);
      }

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn-ghost-danger btn-compact";
      deleteBtn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
        <span>Delete</span>
      `;
      deleteBtn.addEventListener("click", () => {
        FocusFlowStorage.deleteNote(note.id);
        showToast("Note deleted");
        renderDayDetail(currentDayDateStr);
      });

      actions.appendChild(deleteBtn);
      card.appendChild(actions);

      DOM.dayNotesList.appendChild(card);
    });
  }

  // ===========================================================================
  // 7. Navigation & Routing
  // ===========================================================================
  function navigateToMonth() {
    activeView = "month";
    DOM.calendarMonthView.hidden = false;
    DOM.calendarDayView.hidden = true;

    // Update history state
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("date");
      window.history.pushState({ view: "month" }, "", url.pathname);
    } catch {}

    renderMonthCalendar();
  }

  function navigateToDay(dateStr) {
    activeView = "day";
    currentDayDateStr = dateStr;
    DOM.calendarMonthView.hidden = true;
    DOM.calendarDayView.hidden = false;

    // Reset quick forms
    DOM.quickAddTaskForm.hidden = true;
    DOM.quickTaskTitleInput.value = "";

    // Update history state
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("date", dateStr);
      window.history.pushState({ view: "day", date: dateStr }, "", url.toString());
    } catch {}

    renderDayDetail(dateStr);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ===========================================================================
  // 8. Event Handlers
  // ===========================================================================
  function setupEventListeners() {
    // Theme toggle
    if (DOM.themeToggleBtn) {
      DOM.themeToggleBtn.addEventListener("click", () => {
        const cur = FocusFlowStorage.getTheme();
        const next = cur === "dark" ? "light" : "dark";
        FocusFlowStorage.applyTheme(next);
      });
    }

    // Month controls
    DOM.prevMonthBtn.addEventListener("click", () => {
      currentMonth -= 1;
      if (currentMonth < 0) {
        currentMonth = 11;
        currentYear -= 1;
      }
      renderMonthCalendar();
    });

    DOM.nextMonthBtn.addEventListener("click", () => {
      currentMonth += 1;
      if (currentMonth > 11) {
        currentMonth = 0;
        currentYear += 1;
      }
      renderMonthCalendar();
    });

    DOM.todayMonthBtn.addEventListener("click", () => {
      const today = new Date();
      currentYear = today.getFullYear();
      currentMonth = today.getMonth();
      renderMonthCalendar();
    });

    // Day Detail controls
    DOM.backToCalendarBtn.addEventListener("click", () => {
      // Sync month view to the currently selected day's month
      const { year, month } = parseDateString(currentDayDateStr);
      currentYear = year;
      currentMonth = month;
      navigateToMonth();
    });

    DOM.prevDayBtn.addEventListener("click", () => {
      const prevDate = addDaysToDateStr(currentDayDateStr, -1);
      navigateToDay(prevDate);
    });

    DOM.nextDayBtn.addEventListener("click", () => {
      const nextDate = addDaysToDateStr(currentDayDateStr, 1);
      navigateToDay(nextDate);
    });

    DOM.todayJumpBtn.addEventListener("click", () => {
      navigateToDay(getTodayString());
    });

    // Quick Add Task Form toggle
    DOM.toggleAddTaskBtn.addEventListener("click", () => {
      DOM.quickAddTaskForm.hidden = !DOM.quickAddTaskForm.hidden;
      if (!DOM.quickAddTaskForm.hidden) {
        DOM.quickTaskTitleInput.focus();
      }
    });

    DOM.cancelQuickTaskBtn.addEventListener("click", () => {
      DOM.quickAddTaskForm.hidden = true;
      DOM.quickTaskTitleInput.value = "";
    });

    // Submit Quick Add Task
    DOM.quickAddTaskForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const title = DOM.quickTaskTitleInput.value.trim();
      if (!title) {
        showToast("Please enter a task title");
        return;
      }
      const priority = DOM.quickTaskPrioritySelect.value || "medium";
      const markCompleted = DOM.quickTaskMarkCompleted.checked;

      const created = FocusFlowStorage.addTaskForDate(title, priority, currentDayDateStr, markCompleted);
      if (created) {
        DOM.quickTaskTitleInput.value = "";
        DOM.quickAddTaskForm.hidden = true;
        showToast(`Task added for ${formatFullDate(currentDayDateStr)}`);
        renderDayDetail(currentDayDateStr);
      }
    });

    // Save Quick Daily Note
    DOM.saveQuickNoteBtn.addEventListener("click", () => {
      const title = DOM.quickNoteTitleInput.value.trim();
      const body = DOM.quickNoteBodyInput.value.trim();
      if (!title && !body) {
        showToast("Please write a reflection or title for the note");
        DOM.quickNoteBodyInput.focus();
        return;
      }

      const noteTitle = title || `Reflection (${formatFullDate(currentDayDateStr)})`;
      const created = FocusFlowStorage.addDailyNote(currentDayDateStr, {
        title: noteTitle,
        body
      });

      if (created) {
        DOM.quickNoteTitleInput.value = "";
        DOM.quickNoteBodyInput.value = "";
        showToast(`Daily reflection saved for ${formatFullDate(currentDayDateStr)}`);
        renderDayDetail(currentDayDateStr);
      }
    });

    // Popstate (browser back/forward navigation support)
    window.addEventListener("popstate", (e) => {
      const params = new URLSearchParams(window.location.search);
      const dateParam = params.get("date");
      if (dateParam) {
        navigateToDay(dateParam);
      } else {
        navigateToMonth();
      }
    });
  }

  // ===========================================================================
  // 9. Initial Load
  // ===========================================================================
  function init() {
    // Apply saved theme
    FocusFlowStorage.applyTheme(FocusFlowStorage.getTheme());

    setupEventListeners();

    // Check query params for initial route / day view
    const params = new URLSearchParams(window.location.search);
    const dateParam = params.get("date");

    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      const { year, month } = parseDateString(dateParam);
      currentYear = year;
      currentMonth = month;
      navigateToDay(dateParam);
    } else {
      navigateToMonth();
    }
  }

  // Boot on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
