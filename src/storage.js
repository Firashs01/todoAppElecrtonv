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

  return {
    STORAGE_KEY,
    THEME_KEY,
    normalizeTask,

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
    }
  };
})();

if (typeof window !== "undefined") {
  window.FocusFlowStorage = FocusFlowStorage;
}
