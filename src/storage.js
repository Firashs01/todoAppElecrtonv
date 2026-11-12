/**
 * FocusFlow — Shared Storage & Task Utilities
 * Used by both the main task list (app.js) and the notes editor (note.js).
 */

const FocusFlowStorage = (() => {
  "use strict";

  const STORAGE_KEY = "focusflow_tasks_v1";
  const THEME_KEY = "focusflow_theme";

  function getRelativeDateString(daysOffset) {
    const d = new Date();
    d.setDate(d.getDate() + daysOffset);
    return d.toISOString().split("T")[0];
  }

  // Starter seed tasks with multiple notes support
  const SEED_TASKS = [
    {
      id: "task-seed-1",
      title: "Review quarterly design tokens and typography hierarchy",
      completed: false,
      priority: "high",
      dueDate: getRelativeDateString(1),
      createdAt: new Date().toISOString(),
      notes: [
        {
          id: "note-1-1",
          content: "Check line-height rhythm on mobile devices and verify contrast on dark mode surfaces.",
          completed: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        {
          id: "note-1-2",
          content: "Coordinate with engineering lead on CSS custom properties structure.",
          completed: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ],
      note: "",
      noteUpdatedAt: null
    },
    {
      id: "task-seed-2",
      title: "Export project tasks backup to JSON",
      completed: false,
      priority: "medium",
      dueDate: getRelativeDateString(0),
      createdAt: new Date().toISOString(),
      notes: [],
      note: "",
      noteUpdatedAt: null
    },
    {
      id: "task-seed-3",
      title: "Install FocusFlow and try drag-and-drop reordering",
      completed: true,
      priority: "low",
      dueDate: getRelativeDateString(-1),
      createdAt: new Date().toISOString(),
      notes: [
        {
          id: "note-3-1",
          content: "Tested on desktop Chrome and mobile Safari. Works smoothly.",
          completed: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ],
      note: "",
      noteUpdatedAt: null
    }
  ];

  /**
   * Normalizes a task object ensuring all required fields (including notes array) exist.
   */
  function normalizeTask(raw) {
    if (!raw || typeof raw !== "object") return null;
    const title = typeof raw.title === "string" ? raw.title.trim() : "";
    if (!title) return null;

    const id = typeof raw.id === "string" && raw.id
      ? raw.id
      : "task-" + (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

    const completed = Boolean(raw.completed);
    const priority = ["high", "medium", "low"].includes(raw.priority) ? raw.priority : "medium";
    const dueDate = typeof raw.dueDate === "string" ? raw.dueDate : "";
    const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString();

    // Notes array normalization (backward compatible with single .note string)
    let notes = [];
    if (Array.isArray(raw.notes)) {
      notes = raw.notes.map(n => ({
        id: n && typeof n.id === "string" && n.id ? n.id : "note-" + Math.random().toString(36).slice(2, 9),
        content: n && typeof n.content === "string" ? n.content : "",
        completed: Boolean(n && n.completed),
        createdAt: n && typeof n.createdAt === "string" ? n.createdAt : new Date().toISOString(),
        updatedAt: n && typeof n.updatedAt === "string" ? n.updatedAt : new Date().toISOString()
      }));
    } else if (typeof raw.note === "string" && raw.note.trim() !== "") {
      notes = [{
        id: "note-legacy-1",
        content: raw.note,
        completed: false,
        createdAt: raw.createdAt || new Date().toISOString(),
        updatedAt: raw.noteUpdatedAt || new Date().toISOString()
      }];
    }

    // Maintain computed .note for quick display checks
    const latestNote = notes.length > 0 ? notes[notes.length - 1].content : "";

    return {
      id,
      title,
      completed,
      priority,
      dueDate,
      createdAt,
      notes,
      note: latestNote,
      noteUpdatedAt: notes.length > 0 ? notes[notes.length - 1].updatedAt : null
    };
  }

  // =========================================================================
  // Standalone Notes Storage
  // =========================================================================
  const NOTES_STORAGE_KEY = "focusflow_notes_v1";
  const STATS_STORAGE_KEY = "focusflow_stats_v1";

  function getLocalDateString(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function normalizeStats(raw, existingTasks = []) {
    const today = getLocalDateString();
    let initialCompleted = 0;
    let initialCreated = 0;
    if (Array.isArray(existingTasks) && existingTasks.length > 0) {
      initialCreated = existingTasks.length;
      initialCompleted = existingTasks.filter(t => t && t.completed).length;
    }

    if (!raw || typeof raw !== "object") {
      const defaultDays = {};
      defaultDays[today] = {
        timeSeconds: 0,
        completed: initialCompleted,
        deleted: 0,
        created: initialCreated
      };
      return {
        version: 1,
        totalTimeSeconds: 0,
        totalCompleted: initialCompleted,
        totalDeleted: 0,
        totalCreated: initialCreated,
        days: defaultDays,
        history: []
      };
    }

    const totalTimeSeconds = typeof raw.totalTimeSeconds === "number" && raw.totalTimeSeconds >= 0
      ? Math.floor(raw.totalTimeSeconds)
      : 0;
    const totalCompleted = typeof raw.totalCompleted === "number" && raw.totalCompleted >= 0
      ? raw.totalCompleted
      : initialCompleted;
    const totalDeleted = typeof raw.totalDeleted === "number" && raw.totalDeleted >= 0
      ? raw.totalDeleted
      : 0;
    const totalCreated = typeof raw.totalCreated === "number" && raw.totalCreated >= 0
      ? raw.totalCreated
      : initialCreated;

    const days = (raw.days && typeof raw.days === "object" && !Array.isArray(raw.days))
      ? { ...raw.days }
      : {};

    if (!days[today]) {
      days[today] = {
        timeSeconds: 0,
        completed: 0,
        deleted: 0,
        created: 0
      };
    } else {
      days[today] = {
        timeSeconds: typeof days[today].timeSeconds === "number" ? Math.floor(days[today].timeSeconds) : 0,
        completed: typeof days[today].completed === "number" ? days[today].completed : 0,
        deleted: typeof days[today].deleted === "number" ? days[today].deleted : 0,
        created: typeof days[today].created === "number" ? days[today].created : 0
      };
    }

    const history = Array.isArray(raw.history) ? raw.history.slice(-300) : [];

    return {
      version: 1,
      totalTimeSeconds,
      totalCompleted,
      totalDeleted,
      totalCreated,
      days,
      history
    };
  }

  function normalizeNote(raw) {
    if (!raw || typeof raw !== "object") return null;
    const title = typeof raw.title === "string" ? raw.title.trim() : "";
    if (!title) return null;

    const id = typeof raw.id === "string" && raw.id
      ? raw.id
      : "note_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);

    return {
      id,
      title,
      body: typeof raw.body === "string" ? raw.body : "",
      taggedTaskIds: Array.isArray(raw.taggedTaskIds)
        ? raw.taggedTaskIds.filter(tid => typeof tid === "string" && tid)
        : [],
      promotedTaskId: typeof raw.promotedTaskId === "string" ? raw.promotedTaskId : "",
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString()
    };
  }

  return {
    STORAGE_KEY,
    THEME_KEY,
    NOTES_STORAGE_KEY,
    STATS_STORAGE_KEY,
    normalizeTask,
    normalizeNote,
    normalizeStats,
    getLocalDateString,

    loadTasks() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          this.saveTasks(SEED_TASKS);
          return SEED_TASKS;
        }
        const parsed = JSON.parse(raw);
        let list = [];
        if (Array.isArray(parsed)) {
          list = parsed;
        } else if (parsed && Array.isArray(parsed.tasks)) {
          list = parsed.tasks;
        }
        return list.map(normalizeTask).filter(Boolean);
      } catch (err) {
        console.error("Failed to load tasks from localStorage:", err);
        return [];
      }
    },

    saveTasks(tasks) {
      try {
        // Ensure computed .note fields are synced before save
        const normalized = tasks.map(t => {
          const norm = normalizeTask(t);
          return norm;
        });

        const payload = {
          appName: "FocusFlow",
          version: "1.3",
          exportedAt: new Date().toISOString(),
          tasks: normalized
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        return true;
      } catch (err) {
        console.error("Failed to persist tasks to localStorage:", err);
        return false;
      }
    },

    getTaskById(id) {
      if (!id) return null;
      const tasks = this.loadTasks();
      return tasks.find(t => t.id === id) || null;
    },

    updateTask(id, updates) {
      const tasks = this.loadTasks();
      const idx = tasks.findIndex(t => t.id === id);
      if (idx === -1) return null;

      tasks[idx] = normalizeTask({
        ...tasks[idx],
        ...updates
      });
      this.saveTasks(tasks);
      return tasks[idx];
    },

    getTheme() {
      try {
        const savedTheme = localStorage.getItem(THEME_KEY);
        if (savedTheme === "dark" || savedTheme === "light") {
          return savedTheme;
        }
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      } catch {
        return "light";
      }
    },

    saveTheme(theme) {
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch (err) {
        console.error("Failed to save theme:", err);
      }
    },

    applyTheme(theme) {
      if (theme === "dark") {
        document.documentElement.setAttribute("data-theme", "dark");
      } else {
        document.documentElement.removeAttribute("data-theme");
      }
      this.saveTheme(theme);
    },

    // =======================================================================
    // Standalone Notes CRUD
    // =======================================================================
    loadNotes() {
      try {
        const raw = localStorage.getItem(NOTES_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.map(normalizeNote).filter(Boolean);
        }
        return [];
      } catch (err) {
        console.error("Failed to load notes from localStorage:", err);
        return [];
      }
    },

    saveNotes(notes) {
      try {
        const normalized = notes.map(normalizeNote).filter(Boolean);
        localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(normalized));
        return true;
      } catch (err) {
        console.error("Failed to persist notes to localStorage:", err);
        return false;
      }
    },

    getNoteById(id) {
      if (!id) return null;
      const notes = this.loadNotes();
      return notes.find(n => n.id === id) || null;
    },

    addNote(noteData) {
      const notes = this.loadNotes();
      const now = new Date().toISOString();
      const newNote = normalizeNote({
        id: "note_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9),
        title: noteData.title || "Untitled Note",
        body: noteData.body || "",
        taggedTaskIds: noteData.taggedTaskIds || [],
        promotedTaskId: "",
        createdAt: now,
        updatedAt: now
      });
      if (!newNote) return null;
      notes.unshift(newNote);
      this.saveNotes(notes);
      return newNote;
    },

    updateNote(id, updates) {
      const notes = this.loadNotes();
      const idx = notes.findIndex(n => n.id === id);
      if (idx === -1) return null;
      notes[idx] = normalizeNote({
        ...notes[idx],
        ...updates,
        updatedAt: new Date().toISOString()
      });
      this.saveNotes(notes);
      return notes[idx];
    },

    deleteNote(id) {
      const notes = this.loadNotes();
      const idx = notes.findIndex(n => n.id === id);
      if (idx === -1) return null;
      const [removed] = notes.splice(idx, 1);
      this.saveNotes(notes);
      return removed;
    },

    // =======================================================================
    // Productivity Statistics & Metrics
    // =======================================================================
    loadStats() {
      try {
        const raw = localStorage.getItem(STATS_STORAGE_KEY);
        const tasks = this.loadTasks();
        if (!raw) {
          const initial = normalizeStats(null, tasks);
          this.saveStats(initial);
          return initial;
        }
        const parsed = JSON.parse(raw);
        return normalizeStats(parsed, tasks);
      } catch (err) {
        console.error("Failed to load statistics from localStorage:", err);
        return normalizeStats(null, []);
      }
    },

    saveStats(stats) {
      try {
        const normalized = normalizeStats(stats, []);
        localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(normalized));
        return true;
      } catch (err) {
        console.error("Failed to persist statistics to localStorage:", err);
        return false;
      }
    },

    recordTaskCompleted(dateStr = getLocalDateString()) {
      const stats = this.loadStats();
      stats.totalCompleted += 1;
      if (!stats.days[dateStr]) {
        stats.days[dateStr] = { timeSeconds: 0, completed: 0, deleted: 0, created: 0 };
      }
      stats.days[dateStr].completed += 1;
      stats.history.push({
        type: "completed",
        timestamp: new Date().toISOString()
      });
      if (stats.history.length > 300) stats.history.shift();
      this.saveStats(stats);
      return stats;
    },

    recordTaskUncompleted(dateStr = getLocalDateString()) {
      const stats = this.loadStats();
      if (stats.totalCompleted > 0) stats.totalCompleted -= 1;
      if (stats.days[dateStr] && stats.days[dateStr].completed > 0) {
        stats.days[dateStr].completed -= 1;
      }
      this.saveStats(stats);
      return stats;
    },

    recordTaskDeleted(count = 1, dateStr = getLocalDateString()) {
      if (count <= 0) return this.loadStats();
      const stats = this.loadStats();
      stats.totalDeleted += count;
      if (!stats.days[dateStr]) {
        stats.days[dateStr] = { timeSeconds: 0, completed: 0, deleted: 0, created: 0 };
      }
      stats.days[dateStr].deleted += count;
      stats.history.push({
        type: "deleted",
        count,
        timestamp: new Date().toISOString()
      });
      if (stats.history.length > 300) stats.history.shift();
      this.saveStats(stats);
      return stats;
    },

    recordTaskUndeleted(count = 1, dateStr = getLocalDateString()) {
      if (count <= 0) return this.loadStats();
      const stats = this.loadStats();
      stats.totalDeleted = Math.max(0, stats.totalDeleted - count);
      if (stats.days[dateStr]) {
        stats.days[dateStr].deleted = Math.max(0, stats.days[dateStr].deleted - count);
      }
      this.saveStats(stats);
      return stats;
    },

    recordTaskCreated(dateStr = getLocalDateString()) {
      const stats = this.loadStats();
      stats.totalCreated += 1;
      if (!stats.days[dateStr]) {
        stats.days[dateStr] = { timeSeconds: 0, completed: 0, deleted: 0, created: 0 };
      }
      stats.days[dateStr].created += 1;
      stats.history.push({
        type: "created",
        timestamp: new Date().toISOString()
      });
      if (stats.history.length > 300) stats.history.shift();
      this.saveStats(stats);
      return stats;
    },

    recordActiveTime(seconds, dateStr = getLocalDateString()) {
      if (!seconds || seconds <= 0) return this.loadStats();
      const stats = this.loadStats();
      stats.totalTimeSeconds = (stats.totalTimeSeconds || 0) + seconds;
      if (!stats.days[dateStr]) {
        stats.days[dateStr] = { timeSeconds: 0, completed: 0, deleted: 0, created: 0 };
      }
      stats.days[dateStr].timeSeconds = (stats.days[dateStr].timeSeconds || 0) + seconds;
      this.saveStats(stats);
      return stats;
    },

    flushActiveTime() {
      if (typeof flushTimeBuffer === "function") {
        flushTimeBuffer();
      }
    },

    resetStats() {
      const tasks = this.loadTasks();
      const resetData = normalizeStats(null, tasks);
      this.saveStats(resetData);
      return resetData;
    },

    formatDuration(totalSeconds) {
      const s = Math.max(0, Math.floor(totalSeconds || 0));
      if (s < 60) return `${s}s`;
      const m = Math.floor(s / 60);
      const remainingSeconds = s % 60;
      if (m < 60) {
        return remainingSeconds > 0 ? `${m}m ${remainingSeconds}s` : `${m}m`;
      }
      const h = Math.floor(m / 60);
      const remainingMinutes = m % 60;
      return remainingMinutes > 0 ? `${h}h ${remainingMinutes}m` : `${h}h`;
    },

    getMetricsSummary() {
      this.flushActiveTime();
      const stats = this.loadStats();
      const tasks = this.loadTasks();
      const today = getLocalDateString();

      const activeTasks = tasks.filter(t => !t.completed);
      const completedTasks = tasks.filter(t => t.completed);

      const totalCompleted = stats.totalCompleted;
      const totalDeleted = stats.totalDeleted;
      const activeCount = activeTasks.length;

      // Completion rate = completed / (completed + active)
      const denominator = totalCompleted + activeCount;
      const completionRate = denominator > 0
        ? Math.round((totalCompleted / denominator) * 100)
        : (totalCompleted > 0 ? 100 : 0);

      // Today's summary
      const todayData = stats.days[today] || { timeSeconds: 0, completed: 0, deleted: 0, created: 0 };

      // 7-day trailing window
      const last7Days = [];
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateKey = getLocalDateString(d);
        const dayOfWeek = d.getDay();
        const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
        const dayRecord = stats.days[dateKey] || { timeSeconds: 0, completed: 0, deleted: 0, created: 0 };

        last7Days.push({
          date: dateKey,
          dayName: dayNames[dayOfWeek],
          dateFormatted: `${monthNames[d.getMonth()]} ${d.getDate()}`,
          isWeekend,
          isToday: (dateKey === today),
          completed: dayRecord.completed || 0,
          timeSeconds: dayRecord.timeSeconds || 0,
          timeMinutes: Math.round(((dayRecord.timeSeconds || 0) / 60) * 10) / 10,
          created: dayRecord.created || 0,
          deleted: dayRecord.deleted || 0
        });
      }

      // Weekday vs Weekend Comparison
      let weekdayDaysCount = 0;
      let weekdayTotalCompleted = 0;
      let weekdayTotalTime = 0;

      let weekendDaysCount = 0;
      let weekendTotalCompleted = 0;
      let weekendTotalTime = 0;

      const recordedDates = Object.keys(stats.days);
      recordedDates.forEach(dateStr => {
        const parts = dateStr.split("-").map(Number);
        if (parts.length === 3) {
          const d = new Date(parts[0], parts[1] - 1, parts[2]);
          const dow = d.getDay();
          const dayData = stats.days[dateStr];
          if (dow === 0 || dow === 6) {
            weekendDaysCount++;
            weekendTotalCompleted += (dayData.completed || 0);
            weekendTotalTime += (dayData.timeSeconds || 0);
          } else {
            weekdayDaysCount++;
            weekdayTotalCompleted += (dayData.completed || 0);
            weekdayTotalTime += (dayData.timeSeconds || 0);
          }
        }
      });

      // Default baseline to at least 1 day if today exists to avoid NaN
      const effectiveWeekdayDays = Math.max(1, weekdayDaysCount);
      const effectiveWeekendDays = Math.max(1, weekendDaysCount);

      const weekdayAvgCompleted = (weekdayTotalCompleted / effectiveWeekdayDays).toFixed(1);
      const weekdayAvgTime = Math.round(weekdayTotalTime / effectiveWeekdayDays);

      const weekendAvgCompleted = (weekendTotalCompleted / effectiveWeekendDays).toFixed(1);
      const weekendAvgTime = Math.round(weekendTotalTime / effectiveWeekendDays);

      // Task status breakdown ratios
      const allStatusTotal = totalCompleted + activeCount + totalDeleted;
      const completedPct = allStatusTotal > 0 ? Math.round((totalCompleted / allStatusTotal) * 100) : 0;
      const activePct = allStatusTotal > 0 ? Math.round((activeCount / allStatusTotal) * 100) : 0;
      const deletedPct = allStatusTotal > 0 ? Math.max(0, 100 - completedPct - activePct) : 0;

      return {
        global: {
          totalTimeSeconds: stats.totalTimeSeconds,
          totalTimeFormatted: this.formatDuration(stats.totalTimeSeconds),
          totalCompleted,
          totalDeleted,
          totalCreated: stats.totalCreated,
          activeCount,
          completedCount: completedTasks.length,
          completionRate
        },
        today: {
          date: today,
          timeSeconds: todayData.timeSeconds,
          timeFormatted: this.formatDuration(todayData.timeSeconds),
          completed: todayData.completed,
          created: todayData.created,
          deleted: todayData.deleted
        },
        last7Days,
        weekdayVsWeekend: {
          weekday: {
            daysRecorded: weekdayDaysCount,
            totalCompleted: weekdayTotalCompleted,
            avgCompleted: weekdayAvgCompleted,
            totalTimeSeconds: weekdayTotalTime,
            totalTimeFormatted: this.formatDuration(weekdayTotalTime),
            avgTimeSeconds: weekdayAvgTime,
            avgTimeFormatted: this.formatDuration(weekdayAvgTime)
          },
          weekend: {
            daysRecorded: weekendDaysCount,
            totalCompleted: weekendTotalCompleted,
            avgCompleted: weekendAvgCompleted,
            totalTimeSeconds: weekendTotalTime,
            totalTimeFormatted: this.formatDuration(weekendTotalTime),
            avgTimeSeconds: weekendAvgTime,
            avgTimeFormatted: this.formatDuration(weekendAvgTime)
          }
        },
        taskStatusRatio: {
          completed: totalCompleted,
          active: activeCount,
          deleted: totalDeleted,
          total: allStatusTotal,
          completedPct,
          activePct,
          deletedPct
        }
      };
    }
  };
})();

// =========================================================================
// Active App Time Tracking Engine
// =========================================================================
let trackerRunning = false;
let activeSecondsBuffer = 0;
let lastTick = Date.now();

function flushTimeBuffer() {
  if (activeSecondsBuffer <= 0) return;
  const toFlush = Math.floor(activeSecondsBuffer);
  if (toFlush > 0 && typeof FocusFlowStorage !== "undefined") {
    FocusFlowStorage.recordActiveTime(toFlush);
    activeSecondsBuffer -= toFlush;
  }
}

function initTimeTracker() {
  if (typeof window === "undefined" || trackerRunning) return;
  trackerRunning = true;
  lastTick = Date.now();

  setInterval(() => {
    const now = Date.now();
    const delta = (now - lastTick) / 1000;
    lastTick = now;

    const isDocumentActive = (typeof document !== "undefined" && !document.hidden && document.hasFocus());

    if (isDocumentActive && delta > 0 && delta < 5) {
      activeSecondsBuffer += delta;
    }

    if (activeSecondsBuffer >= 5) {
      flushTimeBuffer();
    }
  }, 1000);

  const handleStateChange = () => {
    const isDocumentActive = (typeof document !== "undefined" && !document.hidden && document.hasFocus());
    if (!isDocumentActive) {
      flushTimeBuffer();
    }
    lastTick = Date.now();
  };

  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("focus", handleStateChange);
    window.addEventListener("blur", handleStateChange);
    window.addEventListener("beforeunload", flushTimeBuffer);
    window.addEventListener("pagehide", flushTimeBuffer);
  }
  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("visibilitychange", handleStateChange);
  }
}

if (typeof window !== "undefined") {
  initTimeTracker();
}

if (typeof window !== "undefined") {
  window.FocusFlowStorage = FocusFlowStorage;
}
