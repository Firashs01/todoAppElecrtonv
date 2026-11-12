/**
 * FocusFlow — High-Fidelity Vanilla To-Do Application
 * Architecture: Clean Modular IIFE (Storage, State, UI/Render, Handlers)
 */

(() => {
  "use strict";

  // =========================================================================
  // 1. Application State
  // =========================================================================
  const State = {
    tasks: [],
    filter: "all", // 'all' | 'active' | 'completed' | 'overdue'
    searchQuery: "",
    editingTaskId: null,
    draggedTaskId: null,
    undoStack: null, // For undoing deletions

    init() {
      this.tasks = FocusFlowStorage.loadTasks();

      // Restore previous view state (filter & scroll position) if returning from notes page
      try {
        const savedView = sessionStorage.getItem("focusflow_view_state");
        if (savedView) {
          const parsed = JSON.parse(savedView);
          if (parsed && parsed.filter) {
            this.filter = parsed.filter;
          }
        }
      } catch (err) {
        console.error("Failed to restore view state:", err);
      }
    },

    getFilteredTasks() {
      const todayStr = new Date().toISOString().split("T")[0];
      const query = this.searchQuery.trim().toLowerCase();

      return this.tasks.filter(task => {
        // Search filter
        if (query && !task.title.toLowerCase().includes(query)) {
          return false;
        }

        const isOverdue = !task.completed && task.dueDate && task.dueDate < todayStr;

        // Tab filter
        switch (this.filter) {
          case "active":
            return !task.completed;
          case "completed":
            return task.completed;
          case "overdue":
            return isOverdue;
          case "all":
          default:
            return true;
        }
      });
    },

    getCounts() {
      const todayStr = new Date().toISOString().split("T")[0];
      let active = 0;
      let completed = 0;
      let overdue = 0;

      for (const t of this.tasks) {
        if (t.completed) {
          completed++;
        } else {
          active++;
          if (t.dueDate && t.dueDate < todayStr) {
            overdue++;
          }
        }
      }

      return {
        all: this.tasks.length,
        active,
        completed,
        overdue
      };
    },

    addTask(title, priority = "medium", dueDate = "") {
      const sanitizedTitle = title.trim();
      if (!sanitizedTitle) return null;

      const newTask = {
        id: "task-" + (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)),
        title: sanitizedTitle,
        completed: false,
        priority: ["high", "medium", "low"].includes(priority) ? priority : "medium",
        dueDate: dueDate || "",
        createdAt: new Date().toISOString(),
        notes: [],
        note: "",
        noteUpdatedAt: null
      };

      // Add to beginning of array
      this.tasks.unshift(newTask);
      FocusFlowStorage.saveTasks(this.tasks);
      FocusFlowStorage.recordTaskCreated();
      return newTask;
    },

    updateTask(id, updates) {
      const idx = this.tasks.findIndex(t => t.id === id);
      if (idx === -1) return false;

      this.tasks[idx] = {
        ...this.tasks[idx],
        ...updates
      };
      FocusFlowStorage.saveTasks(this.tasks);
      return true;
    },

    toggleTask(id) {
      const task = this.tasks.find(t => t.id === id);
      if (!task) return;
      task.completed = !task.completed;
      FocusFlowStorage.saveTasks(this.tasks);
      if (task.completed) {
        FocusFlowStorage.recordTaskCompleted();
      } else {
        FocusFlowStorage.recordTaskUncompleted();
      }
    },

    deleteTask(id) {
      const idx = this.tasks.findIndex(t => t.id === id);
      if (idx === -1) return null;

      const [removed] = this.tasks.splice(idx, 1);
      FocusFlowStorage.saveTasks(this.tasks);
      FocusFlowStorage.recordTaskDeleted(1);

      // Save for Undo action
      this.undoStack = {
        type: "single",
        task: removed,
        index: idx
      };

      return removed;
    },

    restoreLastDeleted() {
      if (!this.undoStack) return false;

      if (this.undoStack.type === "single" && this.undoStack.task) {
        const { task, index } = this.undoStack;
        const insertIdx = Math.min(Math.max(0, index), this.tasks.length);
        this.tasks.splice(insertIdx, 0, task);
        FocusFlowStorage.saveTasks(this.tasks);
        FocusFlowStorage.recordTaskUndeleted(1);
        this.undoStack = null;
        return true;
      }

      if (this.undoStack.type === "bulk" && Array.isArray(this.undoStack.tasks)) {
        const count = this.undoStack.tasks.length;
        this.tasks = [...this.tasks, ...this.undoStack.tasks];
        FocusFlowStorage.saveTasks(this.tasks);
        FocusFlowStorage.recordTaskUndeleted(count);
        this.undoStack = null;
        return true;
      }

      return false;
    },

    clearCompleted() {
      const completedTasks = this.tasks.filter(t => t.completed);
      if (completedTasks.length === 0) return 0;

      this.undoStack = {
        type: "bulk",
        tasks: completedTasks
      };

      this.tasks = this.tasks.filter(t => !t.completed);
      FocusFlowStorage.saveTasks(this.tasks);
      FocusFlowStorage.recordTaskDeleted(completedTasks.length);
      return completedTasks.length;
    },

    reorderTasks(sourceId, targetId, position = "before") {
      const srcIdx = this.tasks.findIndex(t => t.id === sourceId);
      const tgtIdx = this.tasks.findIndex(t => t.id === targetId);
      if (srcIdx === -1 || tgtIdx === -1 || srcIdx === tgtIdx) return;

      const [item] = this.tasks.splice(srcIdx, 1);
      const adjustedTgtIdx = this.tasks.findIndex(t => t.id === targetId);

      const insertIdx = position === "after" ? adjustedTgtIdx + 1 : adjustedTgtIdx;
      this.tasks.splice(insertIdx, 0, item);
      FocusFlowStorage.saveTasks(this.tasks);
    }
  };

  // =========================================================================
  // 2. UI Rendering Engine
  // =========================================================================
  const DOM = {
    currentDateDisplay: document.getElementById("currentDateDisplay"),
    themeToggleBtn: document.getElementById("themeToggleBtn"),
    exportBtn: document.getElementById("exportBtn"),
    importFileInput: document.getElementById("importFileInput"),

    progressPercent: document.getElementById("progressPercent"),
    progressRatio: document.getElementById("progressRatio"),
    progressFill: document.getElementById("progressFill"),
    progressBar: document.getElementById("progressBar"),
    momentumStatus: document.getElementById("momentumStatus"),

    taskForm: document.getElementById("taskForm"),
    taskTitleInput: document.getElementById("taskTitleInput"),
    taskPrioritySelect: document.getElementById("taskPrioritySelect"),
    taskDueDateInput: document.getElementById("taskDueDateInput"),

    searchInput: document.getElementById("searchInput"),
    clearSearchBtn: document.getElementById("clearSearchBtn"),
    filterTabs: document.querySelectorAll(".filter-tab"),
    countAll: document.getElementById("countAll"),
    countActive: document.getElementById("countActive"),
    countCompleted: document.getElementById("countCompleted"),
    countOverdue: document.getElementById("countOverdue"),

    activeFilterLabel: document.getElementById("activeFilterLabel"),
    clearCompletedBtn: document.getElementById("clearCompletedBtn"),
    taskList: document.getElementById("taskList"),
    emptyState: document.getElementById("emptyState"),
    emptyTitle: document.getElementById("emptyTitle"),
    emptyDesc: document.getElementById("emptyDesc"),

    toastContainer: document.getElementById("toastContainer"),
    confirmModal: document.getElementById("confirmModal"),
    modalCancelBtn: document.getElementById("modalCancelBtn"),
    modalConfirmBtn: document.getElementById("modalConfirmBtn")
  };

  const UIRenderer = {
    init() {
      this.renderCurrentDate();
      FocusFlowStorage.applyTheme(FocusFlowStorage.getTheme());

      // Highlight active filter tab based on state
      DOM.filterTabs.forEach(tab => {
        if (tab.dataset.filter === State.filter) {
          DOM.filterTabs.forEach(t => {
            t.classList.remove("active");
            t.setAttribute("aria-selected", "false");
          });
          tab.classList.add("active");
          tab.setAttribute("aria-selected", "true");
        }
      });

      // Restore scroll position if saved
      try {
        const savedView = sessionStorage.getItem("focusflow_view_state");
        if (savedView) {
          const parsed = JSON.parse(savedView);
          if (typeof parsed.scrollY === "number") {
            setTimeout(() => {
              window.scrollTo(0, parsed.scrollY);
            }, 50);
          }
          sessionStorage.removeItem("focusflow_view_state");
        }
      } catch (err) {
        console.error("Failed to restore scroll position:", err);
      }
    },

    renderCurrentDate() {
      const now = new Date();
      const options = { weekday: "long", month: "short", day: "numeric" };
      DOM.currentDateDisplay.textContent = now.toLocaleDateString(undefined, options);
    },

    formatDueDate(dateStr) {
      if (!dateStr) return null;
      const todayStr = new Date().toISOString().split("T")[0];

      const [y, m, d] = dateStr.split("-").map(Number);
      const dueDate = new Date(y, m - 1, d);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const diffTime = dueDate.getTime() - today.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      let label = "";
      let isOverdue = false;
      let isToday = false;

      if (diffDays < 0) {
        isOverdue = true;
        label = diffDays === -1 ? "Yesterday" : `${Math.abs(diffDays)}d overdue`;
      } else if (diffDays === 0) {
        isToday = true;
        label = "Today";
      } else if (diffDays === 1) {
        label = "Tomorrow";
      } else {
        label = dueDate.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      }

      return { label, isOverdue, isToday };
    },

    renderCounters() {
      const counts = State.getCounts();
      DOM.countAll.textContent = counts.all;
      DOM.countActive.textContent = counts.active;
      DOM.countCompleted.textContent = counts.completed;
      DOM.countOverdue.textContent = counts.overdue;

      const total = counts.all;
      const percent = total > 0 ? Math.round((counts.completed / total) * 100) : 0;
      DOM.progressPercent.textContent = `${percent}%`;
      DOM.progressRatio.textContent = `${counts.completed} / ${total} completed`;
      DOM.progressFill.style.width = `${percent}%`;
      DOM.progressBar.setAttribute("aria-valuenow", percent);

      if (total === 0) {
        DOM.momentumStatus.textContent = "Your slate is clean. Plan your next objective.";
      } else if (percent === 100) {
        DOM.momentumStatus.textContent = "All targets completed today. Outstanding work!";
      } else if (percent >= 60) {
        DOM.momentumStatus.textContent = "Great momentum! Over halfway through your goals.";
      } else if (percent > 0) {
        DOM.momentumStatus.textContent = "Progress is underway. Keep up the rhythm.";
      } else {
        DOM.momentumStatus.textContent = "Stay focused, one task at a time.";
      }
    },

    escapeHTML(str) {
      return String(str == null ? "" : str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    },

    createTaskElement(task) {
      const li = document.createElement("li");
      li.className = `task-card ${task.completed ? "is-completed" : ""}`;
      li.id = `card-${task.id}`;
      li.dataset.id = task.id;
      li.dataset.priority = task.priority;
      li.setAttribute("draggable", "true");

      const isEditing = State.editingTaskId === task.id;

      if (isEditing) {
        li.classList.add("is-editing");
        li.innerHTML = `
          <form class="inline-edit-form" id="editForm-${task.id}">
            <input
              type="text"
              class="inline-edit-input"
              value="${this.escapeHTML(task.title)}"
              maxlength="200"
              required
              aria-label="Edit task title"
            >
            <div class="inline-edit-controls">
              <div class="inline-meta-inputs">
                <select class="meta-select edit-priority-select" aria-label="Edit priority">
                  <option value="low" ${task.priority === "low" ? "selected" : ""}>Low</option>
                  <option value="medium" ${task.priority === "medium" ? "selected" : ""}>Medium</option>
                  <option value="high" ${task.priority === "high" ? "selected" : ""}>High</option>
                </select>
                <input
                  type="date"
                  class="meta-date edit-due-input"
                  value="${task.dueDate || ""}"
                  aria-label="Edit due date"
                >
              </div>
              <div class="inline-actions">
                <button type="button" class="btn-edit-cancel">Cancel</button>
                <button type="submit" class="btn-edit-save">Save</button>
              </div>
            </div>
          </form>
        `;
        return li;
      }

      const dueInfo = task.dueDate ? this.formatDueDate(task.dueDate) : null;
      let dueBadgeHtml = "";
      if (dueInfo) {
        const badgeClass = dueInfo.isOverdue && !task.completed
          ? "badge-due is-overdue"
          : dueInfo.isToday
          ? "badge-due is-today"
          : "badge-due";

        dueBadgeHtml = `
          <span class="badge ${badgeClass}" title="Due: ${task.dueDate}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            ${dueInfo.label}
          </span>
        `;
      }

      const filledNotes = (Array.isArray(task.notes) ? task.notes : [])
        .filter(note => note && typeof note.content === "string" && note.content.trim() !== "");
      const noteCount = filledNotes.length;
      const doneNoteCount = filledNotes.filter(note => note.completed).length;
      const hasNote = noteCount > 0;
      const noteBadgeLabel = noteCount === 1 ? "Note" : `${noteCount} notes`;
      const noteBadgeTitle = `${noteCount} ${noteCount === 1 ? "note" : "notes"}${doneNoteCount > 0 ? ` · ${doneNoteCount} done` : ""}`;
      const noteBadgeHtml = hasNote
        ? `<span class="badge badge-note" title="${noteBadgeTitle}">
             <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
               <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
               <polyline points="14 2 14 8 20 8"></polyline>
               <line x1="16" y1="13" x2="8" y2="13"></line>
               <line x1="16" y1="17" x2="8" y2="17"></line>
             </svg>
             ${noteBadgeLabel}
           </span>`
        : "";

      const priorityBadgeClass = `badge-priority-${task.priority}`;
      const priorityLabel = task.priority.charAt(0).toUpperCase() + task.priority.slice(1);

      li.innerHTML = `
        <div class="drag-handle" title="Drag to reorder" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="9" cy="5" r="1"></circle>
            <circle cx="9" cy="12" r="1"></circle>
            <circle cx="9" cy="19" r="1"></circle>
            <circle cx="15" cy="5" r="1"></circle>
            <circle cx="15" cy="12" r="1"></circle>
            <circle cx="15" cy="19" r="1"></circle>
          </svg>
        </div>

        <div class="checkbox-wrapper">
          <button
            type="button"
            class="custom-checkbox"
            role="checkbox"
            aria-checked="${task.completed}"
            aria-label="Mark task '${this.escapeHTML(task.title)}' as ${task.completed ? "incomplete" : "complete"}"
          >
            <svg class="check-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </button>
        </div>

        <div class="task-body" title="Double click to edit">
          <span class="task-title">${this.escapeHTML(task.title)}</span>
          <div class="task-metadata">
            <span class="badge ${priorityBadgeClass}">
              ${priorityLabel}
            </span>
            ${dueBadgeHtml}
            ${noteBadgeHtml}
          </div>
        </div>

        <div class="task-actions">
          <button
            type="button"
            class="btn-card-action action-note ${hasNote ? "has-note" : ""}"
            aria-label="Open notes for task '${this.escapeHTML(task.title)}'"
            title="${hasNote ? `View / edit ${noteCount === 1 ? "note" : "notes"} (${noteBadgeTitle})` : "Add note"}"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </button>
          <button
            type="button"
            class="btn-card-action action-edit"
            aria-label="Edit task '${this.escapeHTML(task.title)}'"
            title="Edit task"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
          </button>
          <button
            type="button"
            class="btn-card-action action-delete"
            aria-label="Delete task '${this.escapeHTML(task.title)}'"
            title="Delete task"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      `;

      return li;
    },

    renderTaskList() {
      const filtered = State.getFilteredTasks();
      DOM.taskList.innerHTML = "";

      if (filtered.length === 0) {
        DOM.emptyState.hidden = false;
        if (State.searchQuery.trim()) {
          DOM.emptyTitle.textContent = "No matches found";
          DOM.emptyDesc.textContent = `No tasks matching "${State.searchQuery}". Clear your search or try another keyword.`;
        } else if (State.filter === "active") {
          DOM.emptyTitle.textContent = "No active tasks";
          DOM.emptyDesc.textContent = "All your current tasks are completed. High five!";
        } else if (State.filter === "completed") {
          DOM.emptyTitle.textContent = "No completed tasks yet";
          DOM.emptyDesc.textContent = "Check off tasks as you finish them to build momentum.";
        } else if (State.filter === "overdue") {
          DOM.emptyTitle.textContent = "Zero overdue tasks";
          DOM.emptyDesc.textContent = "You're right on schedule with all planned deadlines.";
        } else {
          DOM.emptyTitle.textContent = "All clear!";
          DOM.emptyDesc.textContent = "No tasks found. Create a new task above to get started.";
        }
      } else {
        DOM.emptyState.hidden = true;
        const fragment = document.createDocumentFragment();
        filtered.forEach(task => {
          fragment.appendChild(this.createTaskElement(task));
        });
        DOM.taskList.appendChild(fragment);

        if (State.editingTaskId) {
          const input = DOM.taskList.querySelector(".inline-edit-input");
          if (input) {
            input.focus();
            input.select();
          }
        }
      }

      this.renderCounters();
      this.updateFilterLabels();
    },

    updateFilterLabels() {
      const filterNames = {
        all: "All tasks",
        active: "Active tasks",
        completed: "Completed tasks",
        overdue: "Overdue tasks"
      };
      const label = filterNames[State.filter] || "Tasks";
      const count = State.getFilteredTasks().length;
      DOM.activeFilterLabel.textContent = `${label} (${count})`;
    },

    showToast(message, options = {}) {
      const { showUndo = false, duration = 5000, onUndo = null } = options;

      const toast = document.createElement("div");
      toast.className = "toast";
      toast.setAttribute("role", "alert");

      let undoBtnHtml = showUndo
        ? `<button type="button" class="btn-toast-undo">Undo</button>`
        : "";

      toast.innerHTML = `
        <span class="toast-message">${message}</span>
        <div class="toast-actions">
          ${undoBtnHtml}
          <button type="button" class="btn-toast-close" aria-label="Close notification">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      `;

      DOM.toastContainer.appendChild(toast);

      let timerId = null;
      const dismiss = () => {
        if (timerId) clearTimeout(timerId);
        toast.classList.add("is-leaving");
        setTimeout(() => toast.remove(), 200);
      };

      const undoBtn = toast.querySelector(".btn-toast-undo");
      if (undoBtn) {
        undoBtn.addEventListener("click", () => {
          if (typeof onUndo === "function") onUndo();
          dismiss();
        });
      }

      const closeBtn = toast.querySelector(".btn-toast-close");
      if (closeBtn) closeBtn.addEventListener("click", dismiss);

      timerId = setTimeout(dismiss, duration);
    }
  };

  // =========================================================================
  // 3. Controller & Event Handling
  // =========================================================================
  const Controller = {
    init() {
      State.init();
      UIRenderer.init();
      UIRenderer.renderTaskList();

      this.bindFormEvents();
      this.bindToolbarEvents();
      this.bindListEvents();
      this.bindDragDropEvents();
      this.bindKeyboardShortcuts();
      this.bindImportExport();
      this.bindModalEvents();
      this.bindThemeToggle();
    },

    bindThemeToggle() {
      DOM.themeToggleBtn.addEventListener("click", () => {
        const currentTheme = FocusFlowStorage.getTheme();
        const nextTheme = currentTheme === "dark" ? "light" : "dark";
        FocusFlowStorage.applyTheme(nextTheme);
      });

      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", e => {
        if (!localStorage.getItem(FocusFlowStorage.THEME_KEY)) {
          FocusFlowStorage.applyTheme(e.matches ? "dark" : "light");
        }
      });
    },

    bindFormEvents() {
      DOM.taskForm.addEventListener("submit", e => {
        e.preventDefault();
        const title = DOM.taskTitleInput.value.trim();
        const priority = DOM.taskPrioritySelect.value;
        const dueDate = DOM.taskDueDateInput.value;

        if (!title) return;

        const created = State.addTask(title, priority, dueDate);
        if (created) {
          DOM.taskTitleInput.value = "";
          DOM.taskPrioritySelect.value = "medium";
          DOM.taskDueDateInput.value = "";
          UIRenderer.renderTaskList();
          DOM.taskTitleInput.focus();
        }
      });
    },

    bindToolbarEvents() {
      let debounceTimer = null;
      DOM.searchInput.addEventListener("input", e => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          State.searchQuery = e.target.value;
          DOM.clearSearchBtn.hidden = !e.target.value;
          UIRenderer.renderTaskList();
        }, 120);
      });

      DOM.clearSearchBtn.addEventListener("click", () => {
        DOM.searchInput.value = "";
        State.searchQuery = "";
        DOM.clearSearchBtn.hidden = true;
        UIRenderer.renderTaskList();
        DOM.searchInput.focus();
      });

      DOM.filterTabs.forEach(tab => {
        tab.addEventListener("click", () => {
          DOM.filterTabs.forEach(t => {
            t.classList.remove("active");
            t.setAttribute("aria-selected", "false");
          });
          tab.classList.add("active");
          tab.setAttribute("aria-selected", "true");

          State.filter = tab.dataset.filter;
          UIRenderer.renderTaskList();
        });
      });

      DOM.clearCompletedBtn.addEventListener("click", () => {
        const completedCount = State.tasks.filter(t => t.completed).length;
        if (completedCount === 0) {
          UIRenderer.showToast("No completed tasks to clear.", { duration: 3000 });
          return;
        }

        if (typeof DOM.confirmModal.showModal === "function") {
          DOM.confirmModal.showModal();
        } else {
          if (confirm(`Clear all ${completedCount} completed tasks?`)) {
            this.executeClearCompleted();
          }
        }
      });
    },

    bindModalEvents() {
      DOM.modalCancelBtn.addEventListener("click", () => {
        DOM.confirmModal.close();
      });

      DOM.modalConfirmBtn.addEventListener("click", () => {
        DOM.confirmModal.close();
        this.executeClearCompleted();
      });

      DOM.confirmModal.addEventListener("click", e => {
        if (e.target === DOM.confirmModal) {
          DOM.confirmModal.close();
        }
      });
    },

    executeClearCompleted() {
      const count = State.clearCompleted();
      if (count > 0) {
        UIRenderer.renderTaskList();
        UIRenderer.showToast(`Cleared ${count} completed ${count === 1 ? "task" : "tasks"}.`, {
          showUndo: true,
          duration: 6000,
          onUndo: () => {
            State.restoreLastDeleted();
            UIRenderer.renderTaskList();
            UIRenderer.showToast("Completed tasks restored.");
          }
        });
      }
    },

    bindListEvents() {
      DOM.taskList.addEventListener("click", e => {
        const card = e.target.closest(".task-card");
        if (!card) return;
        const taskId = card.dataset.id;

        // Notes button clicked
        const noteBtn = e.target.closest(".action-note");
        if (noteBtn) {
          // Save view state (filter & scroll position) before navigating to note.html
          try {
            sessionStorage.setItem("focusflow_view_state", JSON.stringify({
              filter: State.filter,
              scrollY: window.scrollY
            }));
          } catch (err) {
            console.error("Failed to save view state:", err);
          }
          window.location.href = `note.html?id=${encodeURIComponent(taskId)}`;
          return;
        }

        // Checkbox clicked
        const checkbox = e.target.closest(".custom-checkbox");
        if (checkbox) {
          State.toggleTask(taskId);
          UIRenderer.renderTaskList();
          return;
        }

        // Delete button clicked
        const deleteBtn = e.target.closest(".action-delete");
        if (deleteBtn) {
          const removed = State.deleteTask(taskId);
          if (removed) {
            UIRenderer.renderTaskList();
            UIRenderer.showToast(`Deleted "${removed.title.slice(0, 32)}${removed.title.length > 32 ? "..." : ""}"`, {
              showUndo: true,
              duration: 5000,
              onUndo: () => {
                State.restoreLastDeleted();
                UIRenderer.renderTaskList();
              }
            });
          }
          return;
        }

        // Edit button clicked
        const editBtn = e.target.closest(".action-edit");
        if (editBtn) {
          State.editingTaskId = taskId;
          UIRenderer.renderTaskList();
          return;
        }

        // Inline edit cancel button
        const cancelBtn = e.target.closest(".btn-edit-cancel");
        if (cancelBtn) {
          State.editingTaskId = null;
          UIRenderer.renderTaskList();
          return;
        }
      });

      DOM.taskList.addEventListener("dblclick", e => {
        const taskBody = e.target.closest(".task-body");
        if (!taskBody) return;
        const card = taskBody.closest(".task-card");
        if (card) {
          State.editingTaskId = card.dataset.id;
          UIRenderer.renderTaskList();
        }
      });

      DOM.taskList.addEventListener("submit", e => {
        const editForm = e.target.closest(".inline-edit-form");
        if (!editForm) return;
        e.preventDefault();

        const card = editForm.closest(".task-card");
        const taskId = card.dataset.id;
        const input = editForm.querySelector(".inline-edit-input");
        const prioritySelect = editForm.querySelector(".edit-priority-select");
        const dueInput = editForm.querySelector(".edit-due-input");

        const newTitle = input.value.trim();
        if (!newTitle) return;

        State.updateTask(taskId, {
          title: newTitle,
          priority: prioritySelect.value,
          dueDate: dueInput.value
        });

        State.editingTaskId = null;
        UIRenderer.renderTaskList();
      });
    },

    bindDragDropEvents() {
      let dragSrcElement = null;

      DOM.taskList.addEventListener("dragstart", e => {
        const card = e.target.closest(".task-card");
        if (!card || State.editingTaskId) return;

        dragSrcElement = card;
        State.draggedTaskId = card.dataset.id;
        card.classList.add("is-dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", card.dataset.id);
      });

      DOM.taskList.addEventListener("dragenter", e => {
        e.preventDefault();
        const targetCard = e.target.closest(".task-card");
        if (!targetCard || targetCard === dragSrcElement) return;

        const rect = targetCard.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;

        if (e.clientY < midY) {
          targetCard.classList.add("drag-over-top");
          targetCard.classList.remove("drag-over-bottom");
        } else {
          targetCard.classList.add("drag-over-bottom");
          targetCard.classList.remove("drag-over-top");
        }
      });

      DOM.taskList.addEventListener("dragover", e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const targetCard = e.target.closest(".task-card");
        if (!targetCard || targetCard === dragSrcElement) return;

        const rect = targetCard.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;

        if (e.clientY < midY) {
          targetCard.classList.add("drag-over-top");
          targetCard.classList.remove("drag-over-bottom");
        } else {
          targetCard.classList.add("drag-over-bottom");
          targetCard.classList.remove("drag-over-top");
        }
      });

      DOM.taskList.addEventListener("dragleave", e => {
        const targetCard = e.target.closest(".task-card");
        if (targetCard) {
          targetCard.classList.remove("drag-over-top", "drag-over-bottom");
        }
      });

      DOM.taskList.addEventListener("drop", e => {
        e.stopPropagation();
        const targetCard = e.target.closest(".task-card");
        if (!targetCard || !dragSrcElement || targetCard === dragSrcElement) return;

        const position = targetCard.classList.contains("drag-over-top") ? "before" : "after";
        State.reorderTasks(dragSrcElement.dataset.id, targetCard.dataset.id, position);
        UIRenderer.renderTaskList();
      });

      DOM.taskList.addEventListener("dragend", () => {
        if (dragSrcElement) dragSrcElement.classList.remove("is-dragging");
        document.querySelectorAll(".task-card").forEach(el => {
          el.classList.remove("drag-over-top", "drag-over-bottom", "is-dragging");
        });
        dragSrcElement = null;
        State.draggedTaskId = null;
      });
    },

    bindKeyboardShortcuts() {
      document.addEventListener("keydown", e => {
        const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : "";
        const isInputFocused = activeTag === "input" || activeTag === "textarea" || activeTag === "select";

        if ((e.ctrlKey || e.metaKey) && (e.key === "n" || e.key === "N")) {
          e.preventDefault();
          DOM.taskTitleInput.focus();
          DOM.taskTitleInput.select();
          return;
        }

        if (e.key === "/" && !isInputFocused) {
          e.preventDefault();
          DOM.searchInput.focus();
          DOM.searchInput.select();
          return;
        }

        if (e.key === "Escape") {
          if (State.editingTaskId) {
            State.editingTaskId = null;
            UIRenderer.renderTaskList();
            return;
          }

          if (DOM.searchInput === document.activeElement || State.searchQuery) {
            DOM.searchInput.value = "";
            State.searchQuery = "";
            DOM.clearSearchBtn.hidden = true;
            DOM.searchInput.blur();
            UIRenderer.renderTaskList();
            return;
          }

          if (DOM.confirmModal.open) {
            DOM.confirmModal.close();
            return;
          }
        }
      });
    },

    bindImportExport() {
      DOM.exportBtn.addEventListener("click", () => {
        try {
          const exportData = {
            appName: "FocusFlow",
            version: "1.3",
            exportedAt: new Date().toISOString(),
            tasks: State.tasks
          };

          const jsonStr = JSON.stringify(exportData, null, 2);
          const blob = new Blob([jsonStr], { type: "application/json" });
          const url = URL.createObjectURL(blob);

          const a = document.createElement("a");
          const dateStamp = new Date().toISOString().split("T")[0];
          a.href = url;
          a.download = `tasks-${dateStamp}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);

          UIRenderer.showToast("Exported tasks and notes to JSON successfully.", { duration: 3500 });
        } catch (err) {
          console.error("Export error:", err);
          UIRenderer.showToast("Failed to export tasks.", { duration: 3500 });
        }
      });

      DOM.importFileInput.addEventListener("change", e => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = event => {
          try {
            const rawContent = event.target.result;
            const parsed = JSON.parse(rawContent);

            let importedList = null;
            if (Array.isArray(parsed)) {
              importedList = parsed;
            } else if (parsed && Array.isArray(parsed.tasks)) {
              importedList = parsed.tasks;
            } else {
              throw new Error("Invalid format: JSON must contain an array of tasks or a { tasks: [...] } object.");
            }

            const validatedTasks = importedList.map(FocusFlowStorage.normalizeTask).filter(Boolean);

            if (validatedTasks.length === 0) {
              throw new Error("No valid tasks found in the uploaded JSON file.");
            }

            const previousTasks = [...State.tasks];
            State.tasks = validatedTasks;
            FocusFlowStorage.saveTasks(State.tasks);
            UIRenderer.renderTaskList();

            UIRenderer.showToast(`Imported ${validatedTasks.length} tasks successfully.`, {
              showUndo: true,
              duration: 6000,
              onUndo: () => {
                State.tasks = previousTasks;
                FocusFlowStorage.saveTasks(State.tasks);
                UIRenderer.renderTaskList();
                UIRenderer.showToast("Reverted back to previous tasks.");
              }
            });
          } catch (err) {
            console.error("JSON Import Error:", err);
            UIRenderer.showToast(`Import failed: ${err.message || "Invalid JSON structure"}`, {
              duration: 5000
            });
          } finally {
            DOM.importFileInput.value = "";
          }
        };

        reader.onerror = () => {
          UIRenderer.showToast("Failed to read the file.", { duration: 4000 });
          DOM.importFileInput.value = "";
        };

        reader.readAsText(file);
      });
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => Controller.init());
  } else {
    Controller.init();
  }
})();
