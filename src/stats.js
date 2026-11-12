/**
 * FocusFlow — Productivity Statistics & Time-Tracking Dashboard Logic
 * Pure Vanilla JavaScript & SVG implementation for charts, metrics,
 * weekday vs weekend comparisons, and real-time active tracking updates.
 */

(() => {
  "use strict";

  // ===========================================================================
  // 1. DOM Elements
  // ===========================================================================
  const DOM = {
    themeToggleBtn: document.getElementById("themeToggleBtn"),
    resetStatsBtn: document.getElementById("resetStatsBtn"),
    confirmResetModal: document.getElementById("confirmResetModal"),
    cancelResetBtn: document.getElementById("cancelResetBtn"),
    confirmResetActionBtn: document.getElementById("confirmResetActionBtn"),
    toastContainer: document.getElementById("toastContainer"),

    // KPI Values
    kpiTotalTime: document.getElementById("kpiTotalTime"),
    kpiTodayTime: document.getElementById("kpiTodayTime"),
    kpiCompletedTasks: document.getElementById("kpiCompletedTasks"),
    kpiCompletionRate: document.getElementById("kpiCompletionRate"),
    kpiDeletedTasks: document.getElementById("kpiDeletedTasks"),
    kpiActiveTasks: document.getElementById("kpiActiveTasks"),

    // Today's Activity
    todayDateLabel: document.getElementById("todayDateLabel"),
    todayCompleted: document.getElementById("todayCompleted"),
    todayCreated: document.getElementById("todayCreated"),
    todayDeleted: document.getElementById("todayDeleted"),
    todayTimeSpent: document.getElementById("todayTimeSpent"),
    todayMomentumMessage: document.getElementById("todayMomentumMessage"),

    // Status Ratio Breakdown
    segCompleted: document.getElementById("segCompleted"),
    segActive: document.getElementById("segActive"),
    segDeleted: document.getElementById("segDeleted"),
    statCompletedPct: document.getElementById("statCompletedPct"),
    statActivePct: document.getElementById("statActivePct"),
    statDeletedPct: document.getElementById("statDeletedPct"),

    // Chart
    chartContainer: document.getElementById("chartContainer"),
    chartSvgWrapper: document.getElementById("chartSvgWrapper"),
    chartTabs: document.querySelectorAll(".chart-tab"),

    // Weekday vs Weekend
    weekdayDaysRecorded: document.getElementById("weekdayDaysRecorded"),
    weekdayTotalCompleted: document.getElementById("weekdayTotalCompleted"),
    weekdayAvgCompleted: document.getElementById("weekdayAvgCompleted"),
    weekdayTotalTime: document.getElementById("weekdayTotalTime"),
    weekdayAvgTime: document.getElementById("weekdayAvgTime"),

    weekendDaysRecorded: document.getElementById("weekendDaysRecorded"),
    weekendTotalCompleted: document.getElementById("weekendTotalCompleted"),
    weekendAvgCompleted: document.getElementById("weekendAvgCompleted"),
    weekendTotalTime: document.getElementById("weekendTotalTime"),
    weekendAvgTime: document.getElementById("weekendAvgTime")
  };

  // State
  let currentChartMetric = "completed"; // 'completed' | 'time' | 'both'
  let liveTickerTimer = null;

  // ===========================================================================
  // 2. Toast Utility
  // ===========================================================================
  function showToast(message, options = {}) {
    const { duration = 3200 } = options;
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
  // 3. Render Dashboard Metrics
  // ===========================================================================
  function renderDashboard() {
    const summary = FocusFlowStorage.getMetricsSummary();

    // 1. KPI Cards
    DOM.kpiTotalTime.textContent = summary.global.totalTimeFormatted;
    DOM.kpiTodayTime.textContent = summary.today.timeFormatted;
    DOM.kpiCompletedTasks.textContent = summary.global.totalCompleted;
    DOM.kpiCompletionRate.textContent = `${summary.global.completionRate}% completion rate`;
    DOM.kpiDeletedTasks.textContent = summary.global.totalDeleted;
    DOM.kpiActiveTasks.textContent = summary.global.activeCount;

    // 2. Today's Activity
    const now = new Date();
    DOM.todayDateLabel.textContent = now.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric"
    });
    DOM.todayCompleted.textContent = summary.today.completed;
    DOM.todayCreated.textContent = summary.today.created;
    DOM.todayDeleted.textContent = summary.today.deleted;
    DOM.todayTimeSpent.textContent = summary.today.timeFormatted;

    // Momentum message based on today's progress
    if (summary.today.completed >= 5) {
      DOM.todayMomentumMessage.textContent = `Spectacular velocity! ${summary.today.completed} tasks cleared today.`;
    } else if (summary.today.completed > 0) {
      DOM.todayMomentumMessage.textContent = `Steady progress: ${summary.today.completed} task${summary.today.completed === 1 ? "" : "s"} completed today. Keep the flow!`;
    } else if (summary.global.activeCount === 0) {
      DOM.todayMomentumMessage.textContent = "All objectives clear. Plan your next goals or take a well-earned break.";
    } else {
      DOM.todayMomentumMessage.textContent = `${summary.global.activeCount} active task${summary.global.activeCount === 1 ? "" : "s"} queued. Pick one and start momentum!`;
    }

    // 3. Task Status Breakdown
    const ratio = summary.taskStatusRatio;
    DOM.segCompleted.style.width = `${ratio.completedPct}%`;
    DOM.segActive.style.width = `${ratio.activePct}%`;
    DOM.segDeleted.style.width = `${ratio.deletedPct}%`;

    DOM.statCompletedPct.textContent = `${ratio.completed} (${ratio.completedPct}%)`;
    DOM.statActivePct.textContent = `${ratio.active} (${ratio.activePct}%)`;
    DOM.statDeletedPct.textContent = `${ratio.deleted} (${ratio.deletedPct}%)`;

    // 4. Weekday vs Weekend Comparison
    const wcomp = summary.weekdayVsWeekend;
    DOM.weekdayDaysRecorded.textContent = `${wcomp.weekday.daysRecorded} day${wcomp.weekday.daysRecorded === 1 ? "" : "s"} logged`;
    DOM.weekdayTotalCompleted.textContent = `${wcomp.weekday.totalCompleted} tasks`;
    DOM.weekdayAvgCompleted.textContent = `${wcomp.weekday.avgCompleted} tasks / day`;
    DOM.weekdayTotalTime.textContent = wcomp.weekday.totalTimeFormatted;
    DOM.weekdayAvgTime.textContent = `${wcomp.weekday.avgTimeFormatted} / day`;

    DOM.weekendDaysRecorded.textContent = `${wcomp.weekend.daysRecorded} day${wcomp.weekend.daysRecorded === 1 ? "" : "s"} logged`;
    DOM.weekendTotalCompleted.textContent = `${wcomp.weekend.totalCompleted} tasks`;
    DOM.weekendAvgCompleted.textContent = `${wcomp.weekend.avgCompleted} tasks / day`;
    DOM.weekendTotalTime.textContent = wcomp.weekend.totalTimeFormatted;
    DOM.weekendAvgTime.textContent = `${wcomp.weekend.avgTimeFormatted} / day`;

    // 5. Render 7-Day Chart
    render7DayChart(summary.last7Days);
  }

  // ===========================================================================
  // 4. Pure SVG 7-Day Activity Chart Generator
  // ===========================================================================
  function render7DayChart(daysData) {
    if (!DOM.chartSvgWrapper) return;

    const width = 720;
    const height = 240;
    const padLeft = 52;
    const padRight = 20;
    const padTop = 30;
    const padBottom = 48;

    const chartW = width - padLeft - padRight;
    const chartH = height - padTop - padBottom;
    const colWidth = chartW / 7;

    // Determine max value for vertical scaling
    let maxVal = 1;
    if (currentChartMetric === "completed") {
      maxVal = Math.max(4, ...daysData.map(d => d.completed));
    } else if (currentChartMetric === "time") {
      maxVal = Math.max(15, ...daysData.map(d => d.timeMinutes));
    } else {
      // dual view: scale independently or normalized
      maxVal = Math.max(4, ...daysData.map(d => Math.max(d.completed, d.timeMinutes)));
    }

    // Grid lines (3 horizontal intervals)
    const gridSteps = 3;
    let gridLinesSvg = "";
    for (let i = 0; i <= gridSteps; i++) {
      const y = padTop + (chartH / gridSteps) * i;
      const stepVal = Math.round(maxVal - (maxVal / gridSteps) * i);
      const unit = currentChartMetric === "time" ? "m" : "";
      gridLinesSvg += `
        <line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" stroke="currentColor" stroke-opacity="0.08" stroke-dasharray="3,3" />
        <text x="${padLeft - 8}" y="${y + 4}" text-anchor="end" font-size="11" font-weight="500" fill="currentColor" opacity="0.55">${stepVal}${unit}</text>
      `;
    }

    // Baseline
    const baseY = padTop + chartH;
    const baselineSvg = `<line x1="${padLeft}" y1="${baseY}" x2="${width - padRight}" y2="${baseY}" stroke="currentColor" stroke-opacity="0.18" stroke-width="1.5" />`;

    // Render 7 columns
    let columnsSvg = "";
    daysData.forEach((day, index) => {
      const colX = padLeft + index * colWidth;
      const centerX = colX + colWidth / 2;

      // Weekend highlight background
      let weekendBg = "";
      if (day.isWeekend) {
        weekendBg = `
          <rect x="${colX + 3}" y="${padTop - 8}" width="${colWidth - 6}" height="${chartH + 12}" rx="8" fill="currentColor" fill-opacity="0.04" />
          <text x="${centerX}" y="${padTop - 12}" text-anchor="middle" font-size="9" font-weight="700" fill="var(--color-pending)" opacity="0.85">WEEKEND</text>
        `;
      }

      // Today highlight dot or indicator
      let todayIndicator = "";
      if (day.isToday) {
        todayIndicator = `<circle cx="${centerX}" cy="${baseY + 34}" r="2.5" fill="var(--color-done)" />`;
      }

      // Bars calculation
      let barsSvg = "";
      const tooltipData = `data-date="${day.dateFormatted}" data-completed="${day.completed}" data-time="${Math.round(day.timeMinutes)}m" data-created="${day.created}" data-deleted="${day.deleted}"`;

      if (currentChartMetric === "completed") {
        const barW = Math.min(36, colWidth - 28);
        const barH = (day.completed / maxVal) * chartH;
        const barY = baseY - barH;
        const valueLabel = day.completed > 0 ? `<text x="${centerX}" y="${barY - 6}" text-anchor="middle" font-size="11" font-weight="600" fill="currentColor">${day.completed}</text>` : "";

        barsSvg = `
          <g class="chart-bar-group" tabindex="0" role="graphics-symbol" aria-label="${day.dayName}: ${day.completed} tasks completed" ${tooltipData}>
            <rect x="${centerX - barW / 2}" y="${barY}" width="${barW}" height="${Math.max(2, barH)}" rx="5" fill="var(--color-done)" class="chart-bar bar-anim" />
            ${valueLabel}
          </g>
        `;
      } else if (currentChartMetric === "time") {
        const barW = Math.min(36, colWidth - 28);
        const barH = (day.timeMinutes / maxVal) * chartH;
        const barY = baseY - barH;
        const valueLabel = day.timeMinutes > 0 ? `<text x="${centerX}" y="${barY - 6}" text-anchor="middle" font-size="10" font-weight="600" fill="currentColor">${Math.round(day.timeMinutes)}m</text>` : "";

        barsSvg = `
          <g class="chart-bar-group" tabindex="0" role="graphics-symbol" aria-label="${day.dayName}: ${Math.round(day.timeMinutes)}m focus time" ${tooltipData}>
            <rect x="${centerX - barW / 2}" y="${barY}" width="${barW}" height="${Math.max(2, barH)}" rx="5" fill="var(--color-low)" class="chart-bar bar-anim" />
            ${valueLabel}
          </g>
        `;
      } else {
        // Dual view (Grouped bars: green for completed, blue for time)
        const singleW = Math.min(18, (colWidth - 24) / 2);
        const gap = 3;

        const compH = (day.completed / maxVal) * chartH;
        const compY = baseY - compH;

        const timeH = (day.timeMinutes / maxVal) * chartH;
        const timeY = baseY - timeH;

        const compX = centerX - singleW - gap / 2;
        const timeX = centerX + gap / 2;

        barsSvg = `
          <g class="chart-bar-group" tabindex="0" role="graphics-symbol" aria-label="${day.dayName}: ${day.completed} tasks, ${Math.round(day.timeMinutes)}m" ${tooltipData}>
            <rect x="${compX}" y="${compY}" width="${singleW}" height="${Math.max(2, compH)}" rx="4" fill="var(--color-done)" class="chart-bar bar-anim" />
            <rect x="${timeX}" y="${timeY}" width="${singleW}" height="${Math.max(2, timeH)}" rx="4" fill="var(--color-low)" class="chart-bar bar-anim" />
          </g>
        `;
      }

      // X-Axis Labels (Day name + date)
      const dayLabel = `
        <text x="${centerX}" y="${baseY + 18}" text-anchor="middle" font-size="12" font-weight="${day.isToday ? '700' : '600'}" fill="currentColor" fill-opacity="${day.isToday ? '1' : '0.85'}">
          ${day.isToday ? 'Today' : day.dayName}
        </text>
        <text x="${centerX}" y="${baseY + 30}" text-anchor="middle" font-size="9" font-weight="500" fill="currentColor" opacity="0.5">
          ${day.dateFormatted}
        </text>
      `;

      columnsSvg += `
        <g class="chart-day-column ${day.isWeekend ? 'is-weekend' : ''} ${day.isToday ? 'is-today' : ''}">
          ${weekendBg}
          ${barsSvg}
          ${dayLabel}
          ${todayIndicator}
        </g>
      `;
    });

    const fullSvg = `
      <svg class="stats-svg-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="7-Day Activity Chart">
        ${gridLinesSvg}
        ${baselineSvg}
        ${columnsSvg}
      </svg>
    `;

    DOM.chartSvgWrapper.innerHTML = fullSvg;
    bindChartTooltips();
  }

  // ===========================================================================
  // 5. Interactive Chart Tooltip
  // ===========================================================================
  function bindChartTooltips() {
    const tooltip = document.getElementById("chartTooltip");
    const barGroups = DOM.chartSvgWrapper.querySelectorAll(".chart-bar-group");

    barGroups.forEach(group => {
      group.addEventListener("mouseenter", e => {
        const date = group.dataset.date;
        const completed = group.dataset.completed;
        const time = group.dataset.time;
        const created = group.dataset.created;
        const deleted = group.dataset.deleted;

        tooltip.innerHTML = `
          <div class="tooltip-header">${date}</div>
          <div class="tooltip-row"><span class="tooltip-dot dot-completed"></span> Completed: <strong>${completed}</strong></div>
          <div class="tooltip-row"><span class="tooltip-dot dot-low"></span> Focus Time: <strong>${time}</strong></div>
          <div class="tooltip-row"><span class="tooltip-dot dot-pending"></span> Created: <strong>${created}</strong></div>
          <div class="tooltip-row"><span class="tooltip-dot dot-deleted"></span> Deleted: <strong>${deleted}</strong></div>
        `;

        tooltip.hidden = false;
        positionTooltip(e);
      });

      group.addEventListener("mousemove", e => {
        positionTooltip(e);
      });

      group.addEventListener("mouseleave", () => {
        tooltip.hidden = true;
      });
    });

    function positionTooltip(e) {
      const containerRect = DOM.chartContainer.getBoundingClientRect();
      const x = e.clientX - containerRect.left;
      const y = e.clientY - containerRect.top;

      const tooltipWidth = tooltip.offsetWidth || 140;
      const left = Math.min(containerRect.width - tooltipWidth - 10, Math.max(10, x - tooltipWidth / 2));
      const top = Math.max(10, y - 110);

      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    }
  }

  // ===========================================================================
  // 6. Live Active Timer (Ticker)
  // ===========================================================================
  function startLiveTicker() {
    if (liveTickerTimer) clearInterval(liveTickerTimer);
    liveTickerTimer = setInterval(() => {
      // If window/document is active, time values will bump live
      const isDocumentActive = (!document.hidden && document.hasFocus());
      if (isDocumentActive) {
        FocusFlowStorage.flushActiveTime();
        const summary = FocusFlowStorage.getMetricsSummary();
        DOM.kpiTotalTime.textContent = summary.global.totalTimeFormatted;
        DOM.kpiTodayTime.textContent = summary.today.timeFormatted;
        DOM.todayTimeSpent.textContent = summary.today.timeFormatted;
      }
    }, 1000);
  }

  // ===========================================================================
  // 7. Event Handlers
  // ===========================================================================
  function bindEvents() {
    // Theme toggle
    DOM.themeToggleBtn.addEventListener("click", () => {
      const currentTheme = FocusFlowStorage.getTheme();
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      FocusFlowStorage.applyTheme(nextTheme);
    });

    // Chart switcher tabs
    DOM.chartTabs.forEach(tab => {
      tab.addEventListener("click", () => {
        DOM.chartTabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        currentChartMetric = tab.dataset.chartMetric;
        const summary = FocusFlowStorage.getMetricsSummary();
        render7DayChart(summary.last7Days);
      });
    });

    // Reset Statistics Modal
    DOM.resetStatsBtn.addEventListener("click", () => {
      if (typeof DOM.confirmResetModal.showModal === "function") {
        DOM.confirmResetModal.showModal();
      } else {
        if (confirm("Reset all historical statistics? Your active tasks and notes will remain intact.")) {
          executeReset();
        }
      }
    });

    DOM.cancelResetBtn.addEventListener("click", () => {
      DOM.confirmResetModal.close();
    });

    DOM.confirmResetActionBtn.addEventListener("click", () => {
      DOM.confirmResetModal.close();
      executeReset();
    });

    DOM.confirmResetModal.addEventListener("click", e => {
      if (e.target === DOM.confirmResetModal) {
        DOM.confirmResetModal.close();
      }
    });
  }

  function executeReset() {
    FocusFlowStorage.resetStats();
    renderDashboard();
    showToast("Productivity statistics have been reset.", { duration: 3500 });
  }

  // ===========================================================================
  // 8. Bootstrap
  // ===========================================================================
  function init() {
    FocusFlowStorage.applyTheme(FocusFlowStorage.getTheme());
    renderDashboard();
    bindEvents();
    startLiveTicker();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => init());
  } else {
    init();
  }
})();
