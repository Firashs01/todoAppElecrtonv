/**
 * FocusFlow — Multi-Note Task Editor Logic
 * Handles loading a task by ID, rendering the task card, rendering multiple note cards,
 * per-note completion ("Done" / "Not done"), editing notes, saving in place,
 * deleting note cards, and returning to the task list without losing work.
 */

(() => {
  "use strict";

  const DOM = {
    themeToggleBtn: document.getElementById("themeToggleBtn"),
    headerBackBtn: document.getElementById("headerBackBtn"),
    addNoteBtn: document.getElementById("addNoteBtn"),
    addNoteInlineBtn: document.getElementById("addNoteInlineBtn"),
    fabAddNoteBtn: document.getElementById("fabAddNoteBtn"),
    noteEditorWrapper: document.getElementById("noteEditorWrapper"),
    errorStateContainer: document.getElementById("errorStateContainer"),
    errorDesc: document.getElementById("errorDesc"),
    taskCardContainer: document.getElementById("taskCardContainer"),
    taskCreatedAtDisplay: document.getElementById("taskCreatedAtDisplay"),
    notesCardsList: document.getElementById("notesCardsList"),
    notesSummary: document.getElementById("notesSummary"),
    notesSaveState: document.getElementById("notesSaveState"),
    backToTasksBtn: document.getElementById("backToTasksBtn"),
    saveBtn: document.getElementById("saveBtn"),
    toastContainer: document.getElementById("toastContainer")
  };

  let currentTaskId = null;
  let currentTask = null;
  let stagedNotes = [];
  let initialNotesSnapshot = "";
  let initialTaskSnapshot = "";
  let isTaskEditing = false;
  let focusedNoteId = null;
  let isSaving = false;
  let allowLeave = false;

  const MultiNoteApp = {
    init() {
      FocusFlowStorage.applyTheme(FocusFlowStorage.getTheme());
      this.bindThemeToggle();

      const params = new URLSearchParams(window.location.search);
      currentTaskId = params.get("id");

      if (!currentTaskId) {
        this.showError("No task ID was specified in the URL.");
        return;
      }

      currentTask = FocusFlowStorage.getTaskById(currentTaskId);
      if (!currentTask) {
        this.showError(`Task with ID "${currentTaskId}" could not be found in storage.`);
        return;
      }

      // Clone notes into a staged array so Cancel can discard changes.
      stagedNotes = JSON.parse(JSON.stringify(currentTask.notes || []));
      stagedNotes.forEach(note => {
        note.completed = Boolean(note.completed);
      });

      const requestedNoteId = params.get("note");

      // If the task has no notes, start with one empty compose card.
      if (stagedNotes.length === 0) {
        const newNote = this.createNoteObject();
        stagedNotes.push(newNote);
        focusedNoteId = newNote.id;
      } else if (requestedNoteId && stagedNotes.some(note => note.id === requestedNoteId)) {
        focusedNoteId = requestedNoteId;
      }

      // Snapshot after the empty compose card exists, so an untouched page is never "dirty".
      initialNotesSnapshot = JSON.stringify(stagedNotes);
      initialTaskSnapshot = this.getTaskSnapshot();

      this.renderTaskCard();
      this.renderNotesCards();
      this.setSaveState("saved");
      this.bindEvents();

      if (focusedNoteId) this.focusNoteCard(focusedNoteId);
    },

    createNoteObject(content = "") {
      const now = new Date().toISOString();
      return {
        id: "note-" + Math.random().toString(36).slice(2, 9),
        content,
        completed: false,
        createdAt: now,
        updatedAt: now
      };
    },

    bindThemeToggle() {
      DOM.themeToggleBtn.addEventListener("click", () => {
        const currentTheme = FocusFlowStorage.getTheme();
        const nextTheme = currentTheme === "dark" ? "light" : "dark";
        FocusFlowStorage.applyTheme(nextTheme);
      });
    },

    showError(msg) {
      DOM.noteEditorWrapper.hidden = true;
      DOM.errorStateContainer.hidden = false;
      DOM.errorDesc.textContent = msg;
      DOM.addNoteBtn.hidden = true;
      DOM.fabAddNoteBtn.hidden = true;
    },

    formatTimestamp(isoStr) {
      if (!isoStr) return "Created recently";
      try {
        const date = new Date(isoStr);
        if (isNaN(date.getTime())) return "Created recently";
        return "Created " + date.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric"
        }) + " at " + date.toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit"
        });
      } catch {
        return "Created recently";
      }
    },

    formatNoteTimestamp(note) {
      if (!note || !note.content || !note.content.trim()) return "Not saved yet";
      if (!note.updatedAt) return "Not saved yet";
      const date = new Date(note.updatedAt);
      if (isNaN(date.getTime())) return "Not saved yet";
      return "Updated " + date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      });
    },

    formatDueDate(dateStr) {
      if (!dateStr) return null;
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

    escapeHTML(str) {
      return String(str == null ? "" : str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    },

    setSaveState(state) {
      if (!DOM.notesSaveState) return;
      const labels = {
        saved: "All changes saved",
        dirty: "Unsaved changes",
        saving: "Saving…"
      };
      const nextState = labels[state] ? state : "saved";
      if (DOM.notesSaveState.dataset.state === nextState) return;
      DOM.notesSaveState.dataset.state = nextState;
      DOM.notesSaveState.textContent = labels[nextState];
    },

    updateNotesSummary() {
      if (!DOM.notesSummary) return;
      const filledNotes = stagedNotes.filter(note => note.content.trim() !== "");
      const total = filledNotes.length;
      const done = filledNotes.filter(note => note.completed).length;
      const summary = total === 0
        ? "No notes"
        : `${total} ${total === 1 ? "note" : "notes"} · ${done} done`;
      if (DOM.notesSummary.textContent !== summary) {
        DOM.notesSummary.textContent = summary;
      }
    },

    markDirty() {
      if (isSaving) return;
      this.setSaveState(this.isDirty() ? "dirty" : "saved");
    },

    focusNoteCard(noteId) {
      const card = Array.from(DOM.notesCardsList.querySelectorAll(".note-card-item"))
        .find(item => item.dataset.noteId === noteId);
      if (!card) return;

      card.scrollIntoView({ block: "center" });

      const textarea = card.querySelector(".note-card-textarea");
      const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
      if (textarea && !isCoarsePointer) {
        textarea.focus({ preventScroll: true });
        const end = textarea.value.length;
        textarea.setSelectionRange(end, end);
      }

      card.classList.add("is-target");
      window.setTimeout(() => card.classList.remove("is-target"), 1400);
    },

    renderTaskCard() {
      DOM.taskCreatedAtDisplay.textContent = this.formatTimestamp(currentTask.createdAt);

      if (isTaskEditing) {
        DOM.taskCardContainer.innerHTML = `
          <div class="task-card is-editing" data-id="${this.escapeHTML(currentTask.id)}">
            <form class="inline-edit-form" id="cardEditForm">
              <input
                type="text"
                class="inline-edit-input"
                id="editTaskTitleInput"
                value="${this.escapeHTML(currentTask.title)}"
                maxlength="200"
                required
                aria-label="Edit task title"
              >
              <div class="inline-edit-controls">
                <div class="inline-meta-inputs">
                  <select class="meta-select" id="editTaskPrioritySelect" aria-label="Edit priority">
                    <option value="low" ${currentTask.priority === "low" ? "selected" : ""}>Low</option>
                    <option value="medium" ${currentTask.priority === "medium" ? "selected" : ""}>Medium</option>
                    <option value="high" ${currentTask.priority === "high" ? "selected" : ""}>High</option>
                  </select>
                  <input
                    type="date"
                    class="meta-date"
                    id="editTaskDueDateInput"
                    value="${this.escapeHTML(currentTask.dueDate || "")}"
                    aria-label="Edit due date"
                  >
                  <div class="inline-notion-field">
                    <svg class="notion-icon" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.69c-.466-.373-.84-.373-1.446-.326L3.62 2.39c-.466.047-.56.327-.373.513l1.212 1.305zm1.586 3.964v12.215c0 .793.42 1.072 1.259 1.025l13.448-.792c.793-.047.887-.606.887-1.166V6.958c0-.56-.467-.84-1.026-.793l-13.682.793c-.653.047-.886.42-.886 1.214zm11.754-.047c.14 0 .327.14.327.373v9.043c0 .56-.374.793-.84.84l-2.006.14c-.373.047-.466-.187-.466-.42v-6.39l-4.152 6.577c-.233.373-.513.513-.933.513h-.746c-.28 0-.466-.233-.466-.513V8.87c0-.513.373-.793.793-.84l2.1-.14c.373-.047.466.186.466.42v5.783l3.872-6.11c.233-.373.56-.513.886-.513l.167.047z"/>
                    </svg>
                    <input
                      type="text"
                      class="meta-input edit-notion-input"
                      id="editTaskNotionUrlInput"
                      value="${this.escapeHTML(currentTask.notionUrl || "")}"
                      placeholder="Search Notion or paste link..."
                      aria-label="Edit Notion link"
                      autocomplete="off"
                    >
                    <input type="hidden" id="editTaskNotionTitleInput" value="${this.escapeHTML(currentTask.notionTitle || "")}">
                    <input type="hidden" id="editTaskNotionIconInput" value="${this.escapeHTML(currentTask.notionIcon || "")}">
                    <input type="hidden" id="editTaskNotionPageIdInput" value="${this.escapeHTML(currentTask.notionPageId || "")}">
                  </div>
                </div>
                <div class="inline-actions">
                  <button type="button" id="cancelCardEditBtn" class="btn-edit-cancel">Cancel</button>
                  <button type="submit" class="btn-edit-save">Save Task</button>
                </div>
              </div>
              <div id="cardEditNotionError" class="inline-notion-error" hidden></div>
            </form>
          </div>
        `;

        const titleInput = document.getElementById("editTaskTitleInput");
        if (titleInput) {
          titleInput.focus();
          titleInput.select();
        }

        const editNotionInput = document.getElementById("editTaskNotionUrlInput");
        const editNotionTitle = document.getElementById("editTaskNotionTitleInput");
        const editNotionIcon = document.getElementById("editTaskNotionIconInput");
        const editNotionPageId = document.getElementById("editTaskNotionPageIdInput");
        if (editNotionInput && typeof NotionUI !== "undefined" && typeof NotionUI.attachPagePicker === "function") {
          NotionUI.attachPagePicker(editNotionInput, {
            onSelect: page => {
              if (editNotionTitle) editNotionTitle.value = page.title || "";
              if (editNotionIcon) editNotionIcon.value = page.icon || "";
              if (editNotionPageId) editNotionPageId.value = page.id || "";
            },
            onClear: () => {
              if (editNotionTitle) editNotionTitle.value = "";
              if (editNotionIcon) editNotionIcon.value = "";
              if (editNotionPageId) editNotionPageId.value = "";
            }
          });
        }

        document.getElementById("cardEditForm").addEventListener("submit", e => {
          e.preventDefault();
          const newTitle = document.getElementById("editTaskTitleInput").value.trim();
          if (!newTitle) return;

          const rawNotion = document.getElementById("editTaskNotionUrlInput")
            ? document.getElementById("editTaskNotionUrlInput").value.trim()
            : "";
          if (rawNotion && !FocusFlowStorage.isValidNotionUrl(rawNotion)) {
            const errEl = document.getElementById("cardEditNotionError");
            if (errEl) {
              errEl.textContent = "Please enter a valid Notion URL (https://... or notion://...)";
              errEl.hidden = false;
            }
            document.getElementById("editTaskNotionUrlInput").focus();
            return;
          }

          const rawNotionTitle = document.getElementById("editTaskNotionTitleInput") ? document.getElementById("editTaskNotionTitleInput").value.trim() : "";
          const rawNotionIcon = document.getElementById("editTaskNotionIconInput") ? document.getElementById("editTaskNotionIconInput").value.trim() : "";
          const rawNotionPageId = document.getElementById("editTaskNotionPageIdInput") ? document.getElementById("editTaskNotionPageIdInput").value.trim() : "";

          currentTask.title = newTitle;
          currentTask.priority = document.getElementById("editTaskPrioritySelect").value;
          currentTask.dueDate = document.getElementById("editTaskDueDateInput").value;
          currentTask.notionUrl = rawNotion || null;
          currentTask.notionTitle = rawNotion ? (rawNotionTitle || null) : null;
          currentTask.notionIcon = rawNotion ? (rawNotionIcon || null) : null;
          currentTask.notionPageId = rawNotion ? (rawNotionPageId || null) : null;

          isTaskEditing = false;
          this.renderTaskCard();
          this.markDirty();
          this.showToast("Task updated. Save to keep the change.", { duration: 3000 });
        });

        document.getElementById("cancelCardEditBtn").addEventListener("click", () => {
          isTaskEditing = false;
          this.renderTaskCard();
        });
        return;
      }

      // Normal Task Card Display
      const dueInfo = currentTask.dueDate ? this.formatDueDate(currentTask.dueDate) : null;
      let dueBadgeHtml = "";
      if (dueInfo) {
        const badgeClass = dueInfo.isOverdue && !currentTask.completed
          ? "badge-due is-overdue"
          : dueInfo.isToday
          ? "badge-due is-today"
          : "badge-due";

        dueBadgeHtml = `
          <span class="badge ${badgeClass}" title="Due: ${this.escapeHTML(currentTask.dueDate)}">
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

      const priorityBadgeClass = `badge-priority-${currentTask.priority}`;
      const priorityLabel = currentTask.priority.charAt(0).toUpperCase() + currentTask.priority.slice(1);

      const hasNotion = Boolean(currentTask.notionUrl && typeof currentTask.notionUrl === "string" && currentTask.notionUrl.trim() !== "");
      let notionWidgetHtml = "";
      if (hasNotion) {
        const displayTitle = currentTask.notionTitle || FocusFlowStorage.formatNotionDisplay(currentTask.notionUrl);
        let iconHtml = "";
        if (currentTask.notionIcon) {
          if (currentTask.notionIcon.startsWith("http://") || currentTask.notionIcon.startsWith("https://")) {
            iconHtml = `<img class="notion-badge-img" src="${this.escapeHTML(currentTask.notionIcon)}" alt="" aria-hidden="true" />`;
          } else {
            iconHtml = `<span class="notion-badge-emoji" aria-hidden="true">${this.escapeHTML(currentTask.notionIcon)}</span>`;
          }
        } else {
          iconHtml = `<svg class="notion-icon" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.69c-.466-.373-.84-.373-1.446-.326L3.62 2.39c-.466.047-.56.327-.373.513l1.212 1.305zm1.586 3.964v12.215c0 .793.42 1.072 1.259 1.025l13.448-.792c.793-.047.887-.606.887-1.166V6.958c0-.56-.467-.84-1.026-.793l-13.682.793c-.653.047-.886.42-.886 1.214zm11.754-.047c.14 0 .327.14.327.373v9.043c0 .56-.374.793-.84.84l-2.006.14c-.373.047-.466-.187-.466-.42v-6.39l-4.152 6.577c-.233.373-.513.513-.933.513h-.746c-.28 0-.466-.233-.466-.513V8.87c0-.513.373-.793.793-.84l2.1-.14c.373-.047.466.186.466.42v5.783l3.872-6.11c.233-.373.56-.513.886-.513l.167.047z"/>
          </svg>`;
        }

        notionWidgetHtml = `
          <div class="notion-linked-state">
            <button type="button" class="badge badge-notion-pill" id="taskNotionOpenPill" title="Open in Notion: ${this.escapeHTML(displayTitle)} (${this.escapeHTML(currentTask.notionUrl)})">
              ${iconHtml}
              <span>${this.escapeHTML(displayTitle)}</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
            </button>
            <div class="notion-linked-actions">
              <button type="button" id="taskNotionEditBtn" class="btn-card-action" title="Edit Notion URL" aria-label="Edit Notion URL">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M12 20h9"></path>
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                </svg>
              </button>
              <button type="button" id="taskNotionUnlinkBtn" class="btn-card-action action-delete" title="Unlink Notion page" aria-label="Unlink Notion page">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>
        `;
      } else {
        notionWidgetHtml = `
          <div class="notion-unlinked-state">
            <button type="button" id="taskLinkNotionBtn" class="btn-secondary btn-compact btn-notion-toggle" title="Link Notion page">
              <svg class="notion-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.69c-.466-.373-.84-.373-1.446-.326L3.62 2.39c-.466.047-.56.327-.373.513l1.212 1.305zm1.586 3.964v12.215c0 .793.42 1.072 1.259 1.025l13.448-.792c.793-.047.887-.606.887-1.166V6.958c0-.56-.467-.84-1.026-.793l-13.682.793c-.653.047-.886.42-.886 1.214zm11.754-.047c.14 0 .327.14.327.373v9.043c0 .56-.374.793-.84.84l-2.006.14c-.373.047-.466-.187-.466-.42v-6.39l-4.152 6.577c-.233.373-.513.513-.933.513h-.746c-.28 0-.466-.233-.466-.513V8.87c0-.513.373-.793.793-.84l2.1-.14c.373-.047.466.186.466.42v5.783l3.872-6.11c.233-.373.56-.513.886-.513l.167.047z"/>
              </svg>
              <span>Link Notion</span>
            </button>
          </div>
        `;
      }

      DOM.taskCardContainer.innerHTML = `
        <div class="task-card ${currentTask.completed ? "is-completed" : ""}" data-id="${this.escapeHTML(currentTask.id)}" data-priority="${this.escapeHTML(currentTask.priority)}">
          <div class="checkbox-wrapper">
            <button
              type="button"
              class="custom-checkbox"
              id="cardCheckboxBtn"
              role="checkbox"
              aria-checked="${currentTask.completed}"
              aria-label="Toggle task completion"
            >
              <svg class="check-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </button>
          </div>

          <div class="task-body">
            <span class="task-title">${this.escapeHTML(currentTask.title)}</span>
            <div class="task-metadata">
              <span class="badge ${priorityBadgeClass}">
                ${priorityLabel}
              </span>
              ${dueBadgeHtml}
              <div class="notion-link-container" id="taskNotionContainer" style="display:inline-flex; margin-bottom:0;">
                ${notionWidgetHtml}
                <div id="taskNotionInputGroup" class="notion-input-group" hidden>
                  <div class="notion-input-row">
                    <svg class="notion-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.69c-.466-.373-.84-.373-1.446-.326L3.62 2.39c-.466.047-.56.327-.373.513l1.212 1.305zm1.586 3.964v12.215c0 .793.42 1.072 1.259 1.025l13.448-.792c.793-.047.887-.606.887-1.166V6.958c0-.56-.467-.84-1.026-.793l-13.682.793c-.653.047-.886.42-.886 1.214zm11.754-.047c.14 0 .327.14.327.373v9.043c0 .56-.374.793-.84.84l-2.006.14c-.373.047-.466-.187-.466-.42v-6.39l-4.152 6.577c-.233.373-.513.513-.933.513h-.746c-.28 0-.466-.233-.466-.513V8.87c0-.513.373-.793.793-.84l2.1-.14c.373-.047.466.186.466.42v5.783l3.872-6.11c.233-.373.56-.513.886-.513l.167.047z"/>
                    </svg>
                    <input
                      type="text"
                      id="taskNotionUrlInlineInput"
                      class="meta-input inline-notion-input"
                      placeholder="Search Notion or paste link..."
                      aria-label="Notion page URL"
                      autocomplete="off"
                    >
                    <input type="hidden" id="taskNotionInlineTitleInput" value="${this.escapeHTML(currentTask.notionTitle || "")}">
                    <input type="hidden" id="taskNotionInlineIconInput" value="${this.escapeHTML(currentTask.notionIcon || "")}">
                    <input type="hidden" id="taskNotionInlinePageIdInput" value="${this.escapeHTML(currentTask.notionPageId || "")}">
                    <button type="button" id="taskNotionInlineSaveBtn" class="btn-primary btn-compact">Save</button>
                    <button type="button" id="taskNotionInlineCancelBtn" class="btn-secondary btn-compact">Cancel</button>
                  </div>
                  <div id="taskNotionInlineError" class="notion-validation-msg" hidden></div>
                </div>
              </div>
            </div>
          </div>

          <div class="task-actions">
            <button
              type="button"
              class="btn-card-action action-edit"
              id="cardEditBtn"
              aria-label="Edit task details"
              title="Edit task details"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
            </button>
            <button
              type="button"
              class="btn-card-action action-delete"
              id="cardDeleteBtn"
              aria-label="Delete task"
              title="Delete task"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      `;

      // Notion link event listeners
      const openPill = document.getElementById("taskNotionOpenPill");
      if (openPill) {
        openPill.addEventListener("click", () => {
          if (currentTask.notionUrl) FocusFlowStorage.openExternalUrl(currentTask.notionUrl);
        });
      }

      const linkBtn = document.getElementById("taskLinkNotionBtn");
      const editNotionBtn = document.getElementById("taskNotionEditBtn");
      const inputGroup = document.getElementById("taskNotionInputGroup");
      const inlineInput = document.getElementById("taskNotionUrlInlineInput");
      const inlineError = document.getElementById("taskNotionInlineError");

      const showInlineNotion = () => {
        if (!inputGroup) return;
        const linkedState = DOM.taskCardContainer.querySelector(".notion-linked-state");
        const unlinkedState = DOM.taskCardContainer.querySelector(".notion-unlinked-state");
        if (linkedState) linkedState.hidden = true;
        if (unlinkedState) unlinkedState.hidden = true;
        inputGroup.hidden = false;
        inlineInput.value = currentTask.notionUrl || "";
        const tEl = document.getElementById("taskNotionInlineTitleInput");
        const iEl = document.getElementById("taskNotionInlineIconInput");
        const pEl = document.getElementById("taskNotionInlinePageIdInput");
        if (tEl) tEl.value = currentTask.notionTitle || "";
        if (iEl) iEl.value = currentTask.notionIcon || "";
        if (pEl) pEl.value = currentTask.notionPageId || "";
        if (inlineError) inlineError.hidden = true;
        inlineInput.focus();
        inlineInput.select();
      };

      if (linkBtn) linkBtn.addEventListener("click", showInlineNotion);
      if (editNotionBtn) editNotionBtn.addEventListener("click", showInlineNotion);

      if (inlineInput && typeof NotionUI !== "undefined" && typeof NotionUI.attachPagePicker === "function") {
        NotionUI.attachPagePicker(inlineInput, {
          onSelect: page => {
            const tEl = document.getElementById("taskNotionInlineTitleInput");
            const iEl = document.getElementById("taskNotionInlineIconInput");
            const pEl = document.getElementById("taskNotionInlinePageIdInput");
            if (tEl) tEl.value = page.title || "";
            if (iEl) iEl.value = page.icon || "";
            if (pEl) pEl.value = page.id || "";
            if (inlineError) inlineError.hidden = true;
          },
          onClear: () => {
            const tEl = document.getElementById("taskNotionInlineTitleInput");
            const iEl = document.getElementById("taskNotionInlineIconInput");
            const pEl = document.getElementById("taskNotionInlinePageIdInput");
            if (tEl) tEl.value = "";
            if (iEl) iEl.value = "";
            if (pEl) pEl.value = "";
          }
        });
      }

      const cancelInlineBtn = document.getElementById("taskNotionInlineCancelBtn");
      if (cancelInlineBtn) {
        cancelInlineBtn.addEventListener("click", () => {
          this.renderTaskCard();
        });
      }

      const saveInlineBtn = document.getElementById("taskNotionInlineSaveBtn");
      if (saveInlineBtn) {
        saveInlineBtn.addEventListener("click", () => {
          const rawUrl = inlineInput.value.trim();
          if (!rawUrl) {
            currentTask.notionUrl = null;
            currentTask.notionTitle = null;
            currentTask.notionIcon = null;
            currentTask.notionPageId = null;
            FocusFlowStorage.updateTask(currentTaskId, {
              notionUrl: null,
              notionTitle: null,
              notionIcon: null,
              notionPageId: null
            });
            this.renderTaskCard();
            this.showToast("Notion page unlinked.", { duration: 2500 });
            return;
          }
          if (!FocusFlowStorage.isValidNotionUrl(rawUrl)) {
            if (inlineError) {
              inlineError.textContent = "Please enter a valid Notion URL (https://... or notion://...)";
              inlineError.hidden = false;
            }
            inlineInput.focus();
            return;
          }

          const tEl = document.getElementById("taskNotionInlineTitleInput");
          const iEl = document.getElementById("taskNotionInlineIconInput");
          const pEl = document.getElementById("taskNotionInlinePageIdInput");
          const rawTitle = tEl ? tEl.value.trim() : "";
          const rawIcon = iEl ? iEl.value.trim() : "";
          const rawPageId = pEl ? pEl.value.trim() : "";

          currentTask.notionUrl = rawUrl;
          currentTask.notionTitle = rawTitle || null;
          currentTask.notionIcon = rawIcon || null;
          currentTask.notionPageId = rawPageId || null;

          FocusFlowStorage.updateTask(currentTaskId, {
            notionUrl: rawUrl,
            notionTitle: rawTitle || null,
            notionIcon: rawIcon || null,
            notionPageId: rawPageId || null
          });
          this.renderTaskCard();
          this.showToast("Notion page linked.", { duration: 2500 });
        });
      }

      if (inlineInput) {
        inlineInput.addEventListener("keydown", e => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (saveInlineBtn) saveInlineBtn.click();
          } else if (e.key === "Escape") {
            e.preventDefault();
            if (cancelInlineBtn) cancelInlineBtn.click();
          }
        });
        inlineInput.addEventListener("input", () => {
          if (inlineError) inlineError.hidden = true;
        });
      }

      const unlinkBtn = document.getElementById("taskNotionUnlinkBtn");
      if (unlinkBtn) {
        unlinkBtn.addEventListener("click", () => {
          currentTask.notionUrl = null;
          currentTask.notionTitle = null;
          currentTask.notionIcon = null;
          currentTask.notionPageId = null;
          FocusFlowStorage.updateTask(currentTaskId, {
            notionUrl: null,
            notionTitle: null,
            notionIcon: null,
            notionPageId: null
          });
          this.renderTaskCard();
          this.showToast("Notion page unlinked.", { duration: 2500 });
        });
      }

      document.getElementById("cardCheckboxBtn").addEventListener("click", () => {
        currentTask.completed = !currentTask.completed;
        this.markDirty();
        this.renderTaskCard();
      });

      document.getElementById("cardEditBtn").addEventListener("click", () => {
        isTaskEditing = true;
        this.renderTaskCard();
      });

      document.getElementById("cardDeleteBtn").addEventListener("click", () => {
        if (confirm(`Delete task "${currentTask.title}"?`)) {
          const tasks = FocusFlowStorage.loadTasks().filter(t => t.id !== currentTaskId);
          FocusFlowStorage.saveTasks(tasks);
          FocusFlowStorage.recordTaskDeleted(1);
          allowLeave = true;
          window.location.href = "index.html";
        }
      });
    },

    renderNotesCards() {
      DOM.notesCardsList.innerHTML = "";

      if (stagedNotes.length === 0) {
        DOM.notesCardsList.innerHTML = `
          <div class="empty-state notes-empty-state">
            <p class="empty-desc">No notes yet. Click "+ Add Note" above to write a note.</p>
          </div>
        `;
        this.updateNotesSummary();
        return;
      }

      stagedNotes.forEach((note, index) => {
        const isDone = Boolean(note.completed);
        const card = document.createElement("div");
        card.className = `note-card-item${isDone ? " is-done" : ""}`;
        card.dataset.noteId = note.id;

        card.innerHTML = `
          <div class="note-card-top-bar">
            <div class="note-card-heading">
              <span class="note-card-index">Note #${index + 1}</span>
              <div class="note-done-toggle" role="group" aria-label="Completion status for note ${index + 1}">
                <button type="button" class="note-done-option" data-done="false" aria-pressed="${!isDone}" title="Mark this note as not done">Not done</button>
                <button type="button" class="note-done-option" data-done="true" aria-pressed="${isDone}" title="Mark this note as done">Done</button>
              </div>
            </div>
            <div class="note-card-aside">
              <span class="note-card-timestamp">${this.formatNoteTimestamp(note)}</span>
              <button type="button" class="btn-ghost-danger btn-compact delete-note-card-btn" aria-label="Delete note ${index + 1}" title="Delete note">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                <span>Delete</span>
              </button>
            </div>
          </div>
          <div class="textarea-container">
            <textarea
              class="note-card-textarea"
              data-note-id="${this.escapeHTML(note.id)}"
              placeholder="Write your note here…"
              rows="4"
              aria-label="Note ${index + 1} content"
            >${this.escapeHTML(note.content || "")}</textarea>
          </div>
        `;

        DOM.notesCardsList.appendChild(card);

        // Auto-resize textarea
        const textarea = card.querySelector(".note-card-textarea");
        textarea.style.height = "auto";
        textarea.style.height = Math.max(140, textarea.scrollHeight + 12) + "px";

        textarea.addEventListener("input", () => {
          textarea.style.height = "auto";
          textarea.style.height = Math.max(140, textarea.scrollHeight + 12) + "px";
          note.content = textarea.value;
          focusedNoteId = note.id;
          this.updateNotesSummary();
          this.markDirty();
        });

        textarea.addEventListener("focus", () => {
          focusedNoteId = note.id;
        });

        // Per-note "Done" / "Not done" segmented control
        card.querySelectorAll(".note-done-option").forEach(button => {
          button.addEventListener("click", () => {
            const nextDone = button.dataset.done === "true";
            if (Boolean(note.completed) === nextDone) return;

            note.completed = nextDone;
            focusedNoteId = note.id;
            this.updateNoteDoneState(card, note);
            this.updateNotesSummary();
            this.markDirty();
          });
        });

        // Delete note button
        card.querySelector(".delete-note-card-btn").addEventListener("click", () => {
          if (stagedNotes.length <= 1) {
            if (confirm("Clear this note? The card stays so you can start a fresh note.")) {
              note.content = "";
              note.completed = false;
              textarea.value = "";
              textarea.style.height = "auto";
              textarea.style.height = Math.max(140, textarea.scrollHeight + 12) + "px";
              this.updateNoteDoneState(card, note);
              this.updateNotesSummary();
              this.markDirty();
              textarea.focus();
            }
            return;
          }

          if (confirm(`Delete Note #${index + 1}?`)) {
            stagedNotes = stagedNotes.filter(n => n.id !== note.id);
            if (focusedNoteId === note.id) focusedNoteId = null;
            this.renderNotesCards();
            this.markDirty();
            this.showToast("Note deleted. Save to keep this change.", { duration: 3200 });
          }
        });
      });

      this.updateNotesSummary();
    },

    updateNoteDoneState(card, note) {
      const isDone = Boolean(note.completed);
      card.classList.toggle("is-done", isDone);
      card.querySelectorAll(".note-done-option").forEach(button => {
        const buttonDone = button.dataset.done === "true";
        button.setAttribute("aria-pressed", String(buttonDone === isDone));
      });
    },

    addNewNoteCard() {
      if (!currentTask) return;
      const newNote = this.createNoteObject();
      focusedNoteId = newNote.id;
      stagedNotes.push(newNote);
      this.renderNotesCards();
      this.markDirty();
      this.showToast("New note added. Save to keep it.", { duration: 2800 });

      const card = Array.from(DOM.notesCardsList.querySelectorAll(".note-card-item"))
        .find(item => item.dataset.noteId === newNote.id);
      if (card) {
        const textarea = card.querySelector(".note-card-textarea");
        if (textarea) {
          textarea.focus();
          textarea.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      }
    },

    syncNoteContentsFromDOM() {
      DOM.notesCardsList.querySelectorAll(".note-card-textarea").forEach(textarea => {
        const note = stagedNotes.find(n => n.id === textarea.dataset.noteId);
        if (note && note.content !== textarea.value) {
          note.content = textarea.value;
        }
      });
    },

    getTaskSnapshot() {
      if (!currentTask) return "";
      return JSON.stringify({
        title: currentTask.title,
        completed: Boolean(currentTask.completed),
        priority: currentTask.priority,
        dueDate: currentTask.dueDate || "",
        notionUrl: currentTask.notionUrl || null,
        notionTitle: currentTask.notionTitle || null,
        notionIcon: currentTask.notionIcon || null,
        notionPageId: currentTask.notionPageId || null
      });
    },

    isDirty() {
      this.syncNoteContentsFromDOM();
      return (
        this.getTaskSnapshot() !== initialTaskSnapshot ||
        JSON.stringify(stagedNotes) !== initialNotesSnapshot
      );
    },

    async saveNotes() {
      if (isSaving || !currentTask) return false;

      isSaving = true;
      this.setSavingState(true);
      this.setSaveState("saving");

      try {
        // Let the browser paint the saving state before the synchronous storage write.
        await new Promise(resolve => window.setTimeout(resolve, 220));
        this.persistNotes();
        this.setSaveState("saved");
        this.showToast("Note saved successfully.", { duration: 3200 });
        return true;
      } catch (err) {
        console.error("Failed to save notes:", err);
        this.setSaveState("dirty");
        this.showToast("Could not save your notes. Please try again.", { duration: 4200 });
        return false;
      } finally {
        isSaving = false;
        this.setSavingState(false);
      }
    },

    persistNotes() {
      const storedTask = FocusFlowStorage.getTaskById(currentTaskId);
      const storedNotes = new Map(
        (storedTask && Array.isArray(storedTask.notes) ? storedTask.notes : [])
          .map(note => [note.id, note])
      );
      const now = new Date().toISOString();

      DOM.notesCardsList.querySelectorAll(".note-card-textarea").forEach(textarea => {
        const note = stagedNotes.find(n => n.id === textarea.dataset.noteId);
        if (note && note.content !== textarea.value) {
          note.content = textarea.value;
        }
      });

      const validNotes = stagedNotes.filter(note => note.content.trim() !== "");

      // Only bump "last edited" when content or completion actually changed.
      validNotes.forEach(note => {
        const previous = storedNotes.get(note.id);
        const changed = !previous ||
          previous.content !== note.content ||
          Boolean(previous.completed) !== Boolean(note.completed);
        if (changed) note.updatedAt = now;
      });

      currentTask.notes = validNotes.map(note => ({ ...note }));
      const latestNote = validNotes[validNotes.length - 1];
      currentTask.note = latestNote ? latestNote.content : "";
      currentTask.noteUpdatedAt = latestNote ? latestNote.updatedAt : null;

      const tasks = FocusFlowStorage.loadTasks();
      const idx = tasks.findIndex(t => t.id === currentTaskId);
      if (idx === -1) throw new Error("The task no longer exists.");

      tasks[idx] = currentTask;
      const persisted = FocusFlowStorage.saveTasks(tasks);
      if (!persisted) throw new Error("Unable to write to localStorage.");

      initialNotesSnapshot = JSON.stringify(stagedNotes);
      initialTaskSnapshot = this.getTaskSnapshot();

      this.updateNoteTimestamps();
      this.updateNotesSummary();
      this.syncNoteParam(validNotes);
      return validNotes.length;
    },

    updateNoteTimestamps() {
      DOM.notesCardsList.querySelectorAll(".note-card-item").forEach(card => {
        const note = stagedNotes.find(n => n.id === card.dataset.noteId);
        if (!note) return;
        const timestamp = card.querySelector(".note-card-timestamp");
        if (timestamp) timestamp.textContent = this.formatNoteTimestamp(note);
      });
    },

    syncNoteParam(validNotes) {
      const params = new URLSearchParams(window.location.search);
      const targetId = focusedNoteId && validNotes.some(note => note.id === focusedNoteId)
        ? focusedNoteId
        : null;

      if (targetId) {
        params.set("note", targetId);
      } else {
        params.delete("note");
      }

      const query = params.toString();
      const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}`;
      const currentUrl = `${window.location.pathname}${window.location.search}`;
      if (nextUrl === currentUrl) return;

      try {
        window.history.replaceState(null, "", nextUrl);
      } catch (err) {
        console.warn("Could not update the note URL anchor:", err);
      }
    },

    setSavingState(saving) {
      if (!DOM.saveBtn) return;
      DOM.saveBtn.disabled = saving;
      DOM.saveBtn.classList.toggle("is-loading", saving);
      DOM.saveBtn.setAttribute("aria-busy", String(saving));
      const label = DOM.saveBtn.querySelector(".btn-label");
      if (label) label.textContent = saving ? "Saving…" : "Save";
    },

    leavePage() {
      if (isSaving) return;
      if (!allowLeave && this.isDirty()) {
        if (!confirm("You have unsaved changes. Leave without saving?")) {
          return;
        }
      }
      allowLeave = true;
      window.location.href = "index.html";
    },

    showToast(message, options = {}) {
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
        if (timerId) window.clearTimeout(timerId);
        toast.classList.add("is-leaving");
        window.setTimeout(() => toast.remove(), 200);
      };

      toast.querySelector(".btn-toast-close").addEventListener("click", dismiss);
      timerId = window.setTimeout(dismiss, duration);
    },

    bindEvents() {
      DOM.addNoteBtn.addEventListener("click", () => this.addNewNoteCard());
      DOM.addNoteInlineBtn.addEventListener("click", () => this.addNewNoteCard());
      DOM.fabAddNoteBtn.addEventListener("click", () => this.addNewNoteCard());

      DOM.saveBtn.addEventListener("click", () => {
        this.saveNotes();
      });

      DOM.backToTasksBtn.addEventListener("click", () => {
        this.leavePage();
      });

      DOM.headerBackBtn.addEventListener("click", e => {
        e.preventDefault();
        this.leavePage();
      });

      const brandLink = document.querySelector(".brand-link");
      if (brandLink) {
        brandLink.addEventListener("click", e => {
          e.preventDefault();
          this.leavePage();
        });
      }

      // Keyboard shortcuts
      document.addEventListener("keydown", e => {
        if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
          e.preventDefault();
          this.saveNotes();
          return;
        }

        if (e.key === "Escape") {
          if (isTaskEditing) {
            isTaskEditing = false;
            this.renderTaskCard();
            return;
          }
          e.preventDefault();
          this.leavePage();
        }
      });

      // Guard against accidental tab closes / refreshes with unsaved work.
      window.addEventListener("beforeunload", e => {
        if (allowLeave) return;
        let dirty = false;
        try {
          dirty = this.isDirty();
        } catch {
          dirty = false;
        }
        if (dirty) {
          e.preventDefault();
          e.returnValue = "";
        }
      });
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => MultiNoteApp.init());
  } else {
    MultiNoteApp.init();
  }
})();
