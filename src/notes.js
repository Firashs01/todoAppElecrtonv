/**
 * FocusFlow — Standalone Notes Workspace
 * Handles freeform note CRUD, task tagging, note-to-task promotion,
 * and two-way sync with the main Todo table.
 */

(() => {
  "use strict";

  // ===========================================================================
  // 1. DOM References
  // ===========================================================================
  const DOM = {
    themeToggleBtn: document.getElementById("themeToggleBtn"),
    notesSearchInput: document.getElementById("notesSearchInput"),
    clearNotesSearchBtn: document.getElementById("clearNotesSearchBtn"),
    createNoteBtn: document.getElementById("createNoteBtn"),
    notesCountLabel: document.getElementById("notesCountLabel"),
    notesGrid: document.getElementById("notesGrid"),
    notesEmptyState: document.getElementById("notesEmptyState"),
    notesEmptyTitle: document.getElementById("notesEmptyTitle"),
    notesEmptyDesc: document.getElementById("notesEmptyDesc"),

    // Editor
    noteEditorOverlay: document.getElementById("noteEditorOverlay"),
    noteEditorHeading: document.getElementById("noteEditorHeading"),
    closeEditorBtn: document.getElementById("closeEditorBtn"),
    noteTitleInput: document.getElementById("noteTitleInput"),
    noteBodyInput: document.getElementById("noteBodyInput"),
    taskTagSelect: document.getElementById("taskTagSelect"),
    addTaskTagBtn: document.getElementById("addTaskTagBtn"),
    taggedTasksList: document.getElementById("taggedTasksList"),
    promotionStatusSection: document.getElementById("promotionStatusSection"),
    promotionBadge: document.getElementById("promotionBadge"),
    promotionBadgeText: document.getElementById("promotionBadgeText"),
    promoteNoteBtn: document.getElementById("promoteNoteBtn"),
    deleteNoteBtn: document.getElementById("deleteNoteBtn"),
    saveNoteBtn: document.getElementById("saveNoteBtn"),
    toastContainer: document.getElementById("toastContainer")
  };

  // ===========================================================================
  // 2. State
  // ===========================================================================
  let searchQuery = "";
  let editingNoteId = null; // null = new note mode, string = editing existing
  let stagedTaggedTaskIds = [];

  // ===========================================================================
  // 3. Utilities
  // ===========================================================================
  function escapeHTML(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatTimestamp(isoStr) {
    if (!isoStr) return "";
    try {
      const date = new Date(isoStr);
      if (isNaN(date.getTime())) return "";
      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric"
      }) + " at " + date.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit"
      });
    } catch {
      return "";
    }
  }

  function truncate(str, max) {
    if (!str) return "";
    return str.length > max ? str.slice(0, max) + "…" : str;
  }

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
  // 4. Rendering
  // ===========================================================================
  function getPromotedTaskStatus(note) {
    if (!note.promotedTaskId) return null;
    const task = FocusFlowStorage.getTaskById(note.promotedTaskId);
    if (!task) return { label: "Task Deleted", status: "deleted" };
    if (task.completed) return { label: "Done", status: "done" };
    return { label: "In Todo Table", status: "active" };
  }

  function renderNotesGrid() {
    const notes = FocusFlowStorage.loadNotes();
    const query = searchQuery.trim().toLowerCase();

    const filtered = query
      ? notes.filter(n =>
          n.title.toLowerCase().includes(query) ||
          n.body.toLowerCase().includes(query)
        )
      : notes;

    // Count label
    const label = filtered.length === 1 ? "1 note" : `${filtered.length} notes`;
    DOM.notesCountLabel.textContent = query
      ? `${label} matching "${truncate(searchQuery, 20)}"`
      : label;

    DOM.notesGrid.innerHTML = "";

    if (filtered.length === 0) {
      DOM.notesEmptyState.hidden = false;
      if (query) {
        DOM.notesEmptyTitle.textContent = "No matching notes";
        DOM.notesEmptyDesc.textContent = `No notes matching "${truncate(searchQuery, 30)}". Try a different search.`;
      } else {
        DOM.notesEmptyTitle.textContent = "No notes yet";
        DOM.notesEmptyDesc.textContent = "Create your first note to capture ideas, tag tasks, and promote notes into your Todo list.";
      }
      return;
    }

    DOM.notesEmptyState.hidden = true;
    const tasks = FocusFlowStorage.loadTasks();
    const taskMap = new Map(tasks.map(t => [t.id, t]));

    const fragment = document.createDocumentFragment();
    filtered.forEach(note => {
      const card = document.createElement("div");
      card.className = "standalone-note-card";
      card.dataset.noteId = note.id;

      // Promotion status
      const promoStatus = getPromotedTaskStatus(note);
      let promoBadgeHtml = "";
      if (promoStatus) {
        const badgeClass = promoStatus.status === "done"
          ? "badge-promoted badge-promoted-done"
          : promoStatus.status === "deleted"
          ? "badge-promoted badge-promoted-deleted"
          : "badge-promoted badge-promoted-active";
        promoBadgeHtml = `<span class="badge ${badgeClass}" title="Promoted task status">${escapeHTML(promoStatus.label)}</span>`;
      }

      // Tagged tasks pills
      let tagsPillsHtml = "";
      if (note.taggedTaskIds && note.taggedTaskIds.length > 0) {
        const pills = note.taggedTaskIds.map(tid => {
          const task = taskMap.get(tid);
          if (!task) return `<span class="badge badge-tag-pill badge-tag-missing" title="Task not found">Unknown task</span>`;
          const statusClass = task.completed ? "badge-tag-done" : "badge-tag-active";
          return `<span class="badge badge-tag-pill ${statusClass}" title="${escapeHTML(task.title)} (${task.completed ? "Done" : "Active"})">${escapeHTML(truncate(task.title, 25))}</span>`;
        }).join("");
        tagsPillsHtml = `<div class="note-card-tags">${pills}</div>`;
      }

      card.innerHTML = `
        <div class="note-card-top">
          <h3 class="note-card-title">${escapeHTML(note.title)}</h3>
          ${promoBadgeHtml}
        </div>
        <p class="note-card-body-preview">${escapeHTML(truncate(note.body, 120))}</p>
        ${tagsPillsHtml}
        <div class="note-card-bottom">
          <span class="note-card-date">${formatTimestamp(note.updatedAt)}</span>
          <div class="note-card-actions">
            <button type="button" class="btn-card-action note-promote-btn ${note.promotedTaskId ? 'is-promoted' : ''}" aria-label="Promote note to task" title="${note.promotedTaskId ? 'Already promoted' : 'Start as Task'}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="17 11 12 6 7 11"></polyline>
                <polyline points="17 18 12 13 7 18"></polyline>
              </svg>
            </button>
            <button type="button" class="btn-card-action note-edit-btn" aria-label="Edit note" title="Edit note">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
            </button>
            <button type="button" class="btn-card-action action-delete note-delete-btn" aria-label="Delete note" title="Delete note">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      `;

      fragment.appendChild(card);
    });

    DOM.notesGrid.appendChild(fragment);
  }

  // ===========================================================================
  // 5. Editor Logic
  // ===========================================================================
  function populateTaskTagDropdown() {
    const tasks = FocusFlowStorage.loadTasks();
    DOM.taskTagSelect.innerHTML = '<option value="">— Select a task to tag —</option>';
    tasks.forEach(task => {
      const opt = document.createElement("option");
      opt.value = task.id;
      opt.textContent = `${task.completed ? "✓ " : ""}${truncate(task.title, 50)}`;
      DOM.taskTagSelect.appendChild(opt);
    });
  }

  function renderTaggedTasks() {
    DOM.taggedTasksList.innerHTML = "";
    if (stagedTaggedTaskIds.length === 0) return;

    const tasks = FocusFlowStorage.loadTasks();
    const taskMap = new Map(tasks.map(t => [t.id, t]));

    stagedTaggedTaskIds.forEach(tid => {
      const task = taskMap.get(tid);
      const pill = document.createElement("span");
      pill.className = "badge badge-tag-pill " + (task ? (task.completed ? "badge-tag-done" : "badge-tag-active") : "badge-tag-missing");

      const label = task ? truncate(task.title, 30) : "Unknown task";
      const status = task ? (task.completed ? " (Done)" : " (Active)") : " (Deleted)";
      pill.title = label + status;
      pill.innerHTML = `
        ${escapeHTML(label)}
        <button type="button" class="tag-remove-btn" data-task-id="${escapeHTML(tid)}" aria-label="Remove tag" title="Remove">×</button>
      `;
      DOM.taggedTasksList.appendChild(pill);
    });
  }

  function updatePromotionUI(note) {
    if (!note || !note.promotedTaskId) {
      DOM.promotionStatusSection.hidden = true;
      DOM.promoteNoteBtn.hidden = false;
      return;
    }

    const promoStatus = getPromotedTaskStatus(note);
    DOM.promotionStatusSection.hidden = false;

    if (promoStatus.status === "done") {
      DOM.promotionBadgeText.textContent = "Done";
      DOM.promotionBadge.className = "badge badge-promoted badge-promoted-done";
    } else if (promoStatus.status === "deleted") {
      DOM.promotionBadgeText.textContent = "Task Deleted";
      DOM.promotionBadge.className = "badge badge-promoted badge-promoted-deleted";
      DOM.promoteNoteBtn.hidden = false; // Allow re-promotion
      return;
    } else {
      DOM.promotionBadgeText.textContent = "In Todo Table";
      DOM.promotionBadge.className = "badge badge-promoted badge-promoted-active";
    }

    DOM.promoteNoteBtn.hidden = true;
  }

  function openEditor(noteId) {
    editingNoteId = noteId;
    populateTaskTagDropdown();

    if (noteId) {
      const note = FocusFlowStorage.getNoteById(noteId);
      if (!note) {
        showToast("Note not found.", { duration: 3000 });
        return;
      }
      DOM.noteEditorHeading.textContent = "Edit Note";
      DOM.noteTitleInput.value = note.title;
      DOM.noteBodyInput.value = note.body;
      stagedTaggedTaskIds = [...(note.taggedTaskIds || [])];
      DOM.deleteNoteBtn.hidden = false;
      updatePromotionUI(note);
    } else {
      DOM.noteEditorHeading.textContent = "New Note";
      DOM.noteTitleInput.value = "";
      DOM.noteBodyInput.value = "";
      stagedTaggedTaskIds = [];
      DOM.deleteNoteBtn.hidden = true;
      DOM.promotionStatusSection.hidden = true;
      DOM.promoteNoteBtn.hidden = false;
    }

    renderTaggedTasks();
    DOM.noteEditorOverlay.hidden = false;
    DOM.noteTitleInput.focus();
  }

  function closeEditor() {
    DOM.noteEditorOverlay.hidden = true;
    editingNoteId = null;
    stagedTaggedTaskIds = [];
  }

  function saveCurrentNote() {
    const title = DOM.noteTitleInput.value.trim();
    if (!title) {
      showToast("Please enter a title for your note.", { duration: 3000 });
      DOM.noteTitleInput.focus();
      return;
    }

    const body = DOM.noteBodyInput.value;
    const updates = {
      title,
      body,
      taggedTaskIds: [...stagedTaggedTaskIds]
    };

    if (editingNoteId) {
      const existing = FocusFlowStorage.getNoteById(editingNoteId);
      if (existing) {
        updates.promotedTaskId = existing.promotedTaskId || "";
      }
      FocusFlowStorage.updateNote(editingNoteId, updates);
      showToast("Note updated.", { duration: 2500 });
    } else {
      FocusFlowStorage.addNote(updates);
      showToast("Note created.", { duration: 2500 });
    }

    closeEditor();
    renderNotesGrid();
  }

  function deleteCurrentNote() {
    if (!editingNoteId) return;
    if (!confirm("Delete this note permanently?")) return;
    FocusFlowStorage.deleteNote(editingNoteId);
    showToast("Note deleted.", { duration: 3000 });
    closeEditor();
    renderNotesGrid();
  }

  // ===========================================================================
  // 6. Note-to-Task Promotion
  // ===========================================================================
  function promoteNote(noteId) {
    const note = noteId ? FocusFlowStorage.getNoteById(noteId) : null;

    // If promoting from the editor with unsaved data
    const title = note ? note.title : DOM.noteTitleInput.value.trim();
    const body = note ? note.body : DOM.noteBodyInput.value;
    const sourceNoteId = noteId || null;

    if (!title) {
      showToast("Please enter a note title before promoting.", { duration: 3000 });
      return;
    }

    // Check for duplicate promotion
    if (note && note.promotedTaskId) {
      const existingTask = FocusFlowStorage.getTaskById(note.promotedTaskId);
      if (existingTask) {
        showToast("This note has already been promoted to a task.", { duration: 3500 });
        return;
      }
    }

    // Create the task
    const tasks = FocusFlowStorage.loadTasks();
    const newTaskId = "task-" + (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
    const newTask = FocusFlowStorage.normalizeTask({
      id: newTaskId,
      title: title,
      completed: false,
      priority: "medium",
      dueDate: "",
      createdAt: new Date().toISOString(),
      notes: body ? [{
        id: "note-" + Math.random().toString(36).slice(2, 9),
        content: body,
        completed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }] : [],
      note: body || "",
      noteUpdatedAt: body ? new Date().toISOString() : null
    });

    if (!newTask) {
      showToast("Failed to create task.", { duration: 3500 });
      return;
    }

    tasks.unshift(newTask);
    FocusFlowStorage.saveTasks(tasks);
    FocusFlowStorage.recordTaskCreated();

    // Link note back to task
    if (sourceNoteId) {
      FocusFlowStorage.updateNote(sourceNoteId, {
        promotedTaskId: newTaskId
      });
    } else if (editingNoteId) {
      // Save the new note first, then update
      const savedNote = FocusFlowStorage.addNote({
        title: title,
        body: body,
        taggedTaskIds: [...stagedTaggedTaskIds]
      });
      if (savedNote) {
        FocusFlowStorage.updateNote(savedNote.id, {
          promotedTaskId: newTaskId
        });
        editingNoteId = savedNote.id;
      }
    }

    showToast(`"${truncate(title, 30)}" added to Todo table!`, { duration: 4000 });

    // Update editor UI if open
    if (!DOM.noteEditorOverlay.hidden && editingNoteId) {
      const updatedNote = FocusFlowStorage.getNoteById(editingNoteId);
      if (updatedNote) updatePromotionUI(updatedNote);
    }

    renderNotesGrid();
  }

  // ===========================================================================
  // 7. Event Binding
  // ===========================================================================
  function init() {
    FocusFlowStorage.applyTheme(FocusFlowStorage.getTheme());
    renderNotesGrid();

    // Theme toggle
    DOM.themeToggleBtn.addEventListener("click", () => {
      const currentTheme = FocusFlowStorage.getTheme();
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      FocusFlowStorage.applyTheme(nextTheme);
    });

    // Search
    let debounceTimer = null;
    DOM.notesSearchInput.addEventListener("input", e => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        searchQuery = e.target.value;
        DOM.clearNotesSearchBtn.hidden = !e.target.value;
        renderNotesGrid();
      }, 120);
    });

    DOM.clearNotesSearchBtn.addEventListener("click", () => {
      DOM.notesSearchInput.value = "";
      searchQuery = "";
      DOM.clearNotesSearchBtn.hidden = true;
      renderNotesGrid();
      DOM.notesSearchInput.focus();
    });

    // Create note
    DOM.createNoteBtn.addEventListener("click", () => openEditor(null));

    // Close editor
    DOM.closeEditorBtn.addEventListener("click", closeEditor);

    // Save note
    DOM.saveNoteBtn.addEventListener("click", saveCurrentNote);

    // Delete note
    DOM.deleteNoteBtn.addEventListener("click", deleteCurrentNote);

    // Promote note
    DOM.promoteNoteBtn.addEventListener("click", () => {
      if (editingNoteId) {
        // Save first, then promote
        const title = DOM.noteTitleInput.value.trim();
        if (!title) {
          showToast("Please enter a note title before promoting.", { duration: 3000 });
          DOM.noteTitleInput.focus();
          return;
        }
        saveCurrentNote();
        // Re-fetch the noteId (might be newly created)
        const notes = FocusFlowStorage.loadNotes();
        const matchingNote = notes.find(n => n.title === title);
        if (matchingNote) {
          promoteNote(matchingNote.id);
        }
      } else {
        // New note - save then promote
        const title = DOM.noteTitleInput.value.trim();
        if (!title) {
          showToast("Please enter a note title before promoting.", { duration: 3000 });
          DOM.noteTitleInput.focus();
          return;
        }
        const body = DOM.noteBodyInput.value;
        const newNote = FocusFlowStorage.addNote({
          title,
          body,
          taggedTaskIds: [...stagedTaggedTaskIds]
        });
        if (newNote) {
          promoteNote(newNote.id);
          closeEditor();
          renderNotesGrid();
        }
      }
    });

    // Task tag: add
    DOM.addTaskTagBtn.addEventListener("click", () => {
      const selectedId = DOM.taskTagSelect.value;
      if (!selectedId) return;
      if (stagedTaggedTaskIds.includes(selectedId)) {
        showToast("Task already tagged.", { duration: 2000 });
        return;
      }
      stagedTaggedTaskIds.push(selectedId);
      renderTaggedTasks();
      DOM.taskTagSelect.value = "";
    });

    // Task tag: remove (delegated)
    DOM.taggedTasksList.addEventListener("click", e => {
      const removeBtn = e.target.closest(".tag-remove-btn");
      if (!removeBtn) return;
      const taskId = removeBtn.dataset.taskId;
      stagedTaggedTaskIds = stagedTaggedTaskIds.filter(id => id !== taskId);
      renderTaggedTasks();
    });

    // Grid: delegated events
    DOM.notesGrid.addEventListener("click", e => {
      const card = e.target.closest(".standalone-note-card");
      if (!card) return;
      const noteId = card.dataset.noteId;

      // Edit button
      if (e.target.closest(".note-edit-btn")) {
        openEditor(noteId);
        return;
      }

      // Delete button
      if (e.target.closest(".note-delete-btn")) {
        if (!confirm("Delete this note permanently?")) return;
        FocusFlowStorage.deleteNote(noteId);
        showToast("Note deleted.", { duration: 3000 });
        renderNotesGrid();
        return;
      }

      // Promote button
      if (e.target.closest(".note-promote-btn")) {
        const note = FocusFlowStorage.getNoteById(noteId);
        if (note && note.promotedTaskId) {
          const existingTask = FocusFlowStorage.getTaskById(note.promotedTaskId);
          if (existingTask) {
            showToast("This note has already been promoted to a task.", { duration: 3500 });
            return;
          }
        }
        promoteNote(noteId);
        return;
      }

      // Click anywhere else on the card to open
      openEditor(noteId);
    });

    // Overlay click to close
    DOM.noteEditorOverlay.addEventListener("click", e => {
      if (e.target === DOM.noteEditorOverlay) {
        closeEditor();
      }
    });

    // Keyboard shortcuts
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") {
        if (!DOM.noteEditorOverlay.hidden) {
          closeEditor();
          return;
        }
      }

      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : "";
      const isInputFocused = activeTag === "input" || activeTag === "textarea" || activeTag === "select";

      if ((e.ctrlKey || e.metaKey) && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        openEditor(null);
        return;
      }

      if (e.key === "/" && !isInputFocused) {
        e.preventDefault();
        DOM.notesSearchInput.focus();
        DOM.notesSearchInput.select();
      }
    });
  }

  // ===========================================================================
  // 8. Bootstrap
  // ===========================================================================
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => init());
  } else {
    init();
  }
})();
