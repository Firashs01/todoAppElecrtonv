# FocusFlow — Native To-Do, Notes & Productivity Analytics

A high-fidelity personal productivity suite built with **pure native HTML5, CSS3, and modern Vanilla JavaScript (ES6+)**, packaged as a secure **Electron** desktop app. No frameworks, no external runtime libraries, no icon fonts.

FocusFlow is split into three connected workspaces:

- **Tasks** (`index.html`) — the main task list, per-task notes, and JSON import/export.
- **Notes** (`notes.html`) — a freeform notes workspace with task tagging and note-to-task promotion.
- **Stats** (`stats.html`) — a live productivity and time-tracking dashboard.

Designed with strict adherence to **anti-slop design principles**, multi-layer ambient depth, strict 8px spatial rhythm, tactile micro-feedback, and accessible interactions.

---

## ✨ Features

### 📋 Core Task Management (`index.html`)
- **Add Tasks**: Fast input field with <kbd>Enter</kbd> support, priority selector (High, Medium, Low), and due date picker.
- **Inline Editing**: Double-click any task title or click the Edit button to edit in place. Press <kbd>Enter</kbd> to save or <kbd>Esc</kbd> to cancel.
- **Drag-and-Drop Reordering**: Reorder tasks directly in the list; the order is persisted.
- **Search & Filter**: Keyword search plus All / Active / Completed / Overdue tabs, with a live result count.
- **Micro-Interactions**: Custom checkbox with spring checkmark animation, strike-through transition, and priority color bars.
- **Undoable Deletion**: Deleting single tasks or clearing completed tasks triggers a 5-second toast banner with an instant **Undo** button.
- **Daily Momentum Progress**: Dynamic percentage bar with contextual feedback based on completion rate.
- **Priority System**:
  - 🔴 **High Priority**: Crimson accent with soft badge
  - 🟡 **Medium Priority / In-Progress**: Warm amber accent
  - 🔵 **Low Priority**: Subtle slate-blue accent
  - 🟢 **Completed**: Emerald green accent

### 📝 Per-Task Notes & Journal (`note.html?id=TASK_ID`)
- **Dedicated Notes Page**: Every task has a dedicated multi-note editor accessible via the notepad button on each task card.
- **Per-Note Done Status**: Each note has a `Not done` / `Done` segmented control. The state is stored as `completed` on the note and reflected by a green accent on the note card.
- **Save Without Leaving**: **Save** persists changes in place, keeps your inputs and cursor position intact, shows a success toast, and never redirects. The notes header shows a live `Unsaved changes` / `Saving…` / `All changes saved` status.
- **URL Note Anchor**: Saving a new or edited note updates the URL in place (`note.html?id=TASK_ID&note=NOTE_ID`) with `history.replaceState`, so refreshing or saving again targets the same note instead of creating duplicates.
- **Visual Note Indicator**: Tasks with notes display a badge with the note count (`Note` or `3 notes`) and the note button gets an accent. The badge tooltip also reports how many notes are done.
- **Auto-Resizing Textarea**: Fluid auto-resizing textarea that expands dynamically as you write.
- **Timestamps**: Displays the last-saved timestamp per note; it only advances when the note's content or done state actually changes.
- **Clear & Delete Notes**: Delete individual notes with confirmation; a single remaining note is cleared in place instead.
- **Return Safeguards**: `Back`, `Esc`, refresh, and tab close warn when staged changes have not been saved. Filter and scroll position are preserved when returning to the task list via `sessionStorage`.

### 🗒️ Notes Workspace (`notes.html`)
- **Standalone Notes**: Create, edit, search, and delete freeform notes independently of any task, stored separately from the task list.
- **Inline Editor Modal**: A focused note editor with title, body, task tagging, promotion status, save, and delete actions.
- **Task Tagging**: Tag any note with one or more tasks. Tagged tasks appear as status-aware pills (active / done / missing) on the note card and in the editor.
- **Note-to-Task Promotion**: Use **Start as Task** to promote a note into the Todo table. The note body becomes the task's first note, and the note is linked back to the created task.
- **Promotion Status**: Promoted notes show a badge reflecting the linked task's live state — `In Todo Table`, `Done`, or `Task Deleted`. Deleted promotions can be re-promoted.
- **Search & Counts**: Live search across note titles and bodies with a matching-result count.
- **Dark Mode**: Shared theme preference across every workspace.

### 📊 Productivity & Time Tracking (`stats.html`)
- **KPI Cards**: Total time in app, today's focus time, tasks completed (with completion rate), tasks deleted, and active/remaining tasks.
- **Today's Activity**: Completed, created, and deleted tasks for today plus time spent, with a contextual momentum message.
- **Task Status Ratio**: Stacked bar and legend showing the completed / active / deleted lifecycle mix.
- **7-Day Activity Trend**: Pure SVG/CSS chart with a metric switcher for **Tasks Done**, **Focus Time**, or **Dual View**, including hover tooltips and weekend highlighting.
- **Weekday vs. Weekend Comparison**: Total and daily-average completed tasks and focus time for Monday–Friday versus Saturday–Sunday.
- **Live Active-Time Tracking**: Time is recorded only while the app window is visible and focused, buffered and flushed on blur, hide, and unload.
- **Reset Stats**: Reset historical statistics behind a confirmation dialog. Task data is left untouched.
- **Dark Mode**: Shared theme preference across every workspace.

### 💾 Data Persistence & JSON Import/Export
- **LocalStorage Persistence**: Tasks, standalone notes, statistics, and theme are all persisted locally.
  - `focusflow_tasks_v1` — tasks and per-task notes
  - `focusflow_notes_v1` — standalone notes workspace
  - `focusflow_stats_v1` — productivity history and time tracking
  - `focusflow_theme` — light/dark preference
- **JSON Export**: Download a timestamped `tasks-YYYY-MM-DD.json` file including all tasks and their per-task notes/timestamps.
- **JSON Import**: Upload any compatible JSON file with thorough schema validation, error feedback, backward compatibility with older task structures, and an undo option.
- **Dark Mode**: Toggle light/dark themes with system preference detection and persistent preference storage.

---

## ⌨️ Keyboard Shortcuts

### Main Task List (`index.html`)
| Shortcut | Action |
| :--- | :--- |
| <kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>N</kbd> | Focus the "Add new task" input field |
| <kbd>/</kbd> | Focus the search filter input |
| <kbd>Enter</kbd> | Submit new task / Save inline edit |
| <kbd>Esc</kbd> | Cancel inline editing / Clear search / Close modal |

### Per-Task Note Editor (`note.html`)
| Shortcut | Action |
| :--- | :--- |
| <kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>S</kbd> | Save notes and stay on the page |
| <kbd>Esc</kbd> | Return to tasks (warns if changes are unsaved) |

### Notes Workspace (`notes.html`)
| Shortcut | Action |
| :--- | :--- |
| <kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>N</kbd> | Create a new note |
| <kbd>/</kbd> | Focus the notes search input |
| <kbd>Esc</kbd> | Close the note editor |

---

## 📁 Project Structure

```text
TodoAppElectron/
├── main.js           # Electron main process (secure window + lifecycle)
├── preload.js        # contextBridge / ipcRenderer bridge (no Node leakage)
├── package.json      # Electron deps, npm scripts, electron-forge packaging config
├── package-lock.json # Lockfile
├── smoke-test.js     # Headless smoke test (`npm test`)
├── src/              # Web frontend (unchanged markup/styles/logic)
│   ├── index.html    # Main task list & dashboard
│   ├── notes.html    # Standalone Notes workspace (tagging + promotion)
│   ├── note.html     # Per-task multi-note editor page
│   ├── stats.html    # Productivity & time-tracking dashboard
│   ├── style.css     # Design system tokens, 8px grid, dark mode & animations
│   ├── storage.js    # Shared task, notes & stats storage + time tracker
│   ├── app.js        # Main task list controller & interaction engine
│   ├── notes.js      # Standalone notes CRUD, tagging & note-to-task promotion
│   ├── note.js       # Per-task notes controller & save-in-place logic
│   └── stats.js      # Stats rendering, 7-day chart & weekday/weekend comparison
└── README.md         # Documentation and JSON format schema
```

---

## 📄 JSON Data Format (Extended)

FocusFlow imports and exports tasks conforming to the following structure:

```json
{
  "appName": "FocusFlow",
  "version": "1.3",
  "exportedAt": "2026-11-09T12:00:00.000Z",
  "tasks": [
    {
      "id": "task-seed-1",
      "title": "Review quarterly design tokens and typography hierarchy",
      "completed": false,
      "priority": "high",
      "dueDate": "2026-11-10",
      "createdAt": "2026-11-09T10:00:00.000Z",
      "notes": [
        {
          "id": "note-1-1",
          "content": "Check line-height rhythm on mobile devices and verify contrast on dark mode surfaces.",
          "completed": false,
          "createdAt": "2026-11-09T10:05:00.000Z",
          "updatedAt": "2026-11-09T11:30:00.000Z"
        },
        {
          "id": "note-1-2",
          "content": "Coordinate with engineering lead on CSS custom properties structure.",
          "completed": true,
          "createdAt": "2026-11-09T10:10:00.000Z",
          "updatedAt": "2026-11-09T11:45:00.000Z"
        }
      ],
      "note": "Coordinate with engineering lead on CSS custom properties structure.",
      "noteUpdatedAt": "2026-11-09T11:45:00.000Z"
    }
  ]
}
```

### Field Definitions
- **`id`** (`string`, required): Unique identifier for the task.
- **`title`** (`string`, required): Task description text (1–200 characters).
- **`completed`** (`boolean`, required): `true` if the task is marked finished, `false` otherwise.
- **`priority`** (`string`, optional): `"high"`, `"medium"`, or `"low"` (defaults to `"medium"`).
- **`dueDate`** (`string`, optional): Date string formatted as `"YYYY-MM-DD"`.
- **`createdAt`** (`string`, optional): ISO 8601 timestamp string.
- **`notes`** (`array`, optional): Ordered list of note cards. Empty notes are not persisted.
- **`notes[].id`** (`string`, required): Unique identifier for the note.
- **`notes[].content`** (`string`, required): Note body.
- **`notes[].completed`** (`boolean`, optional): Per-note done state; defaults to `false`.
- **`notes[].createdAt`** (`string`, optional): ISO 8601 creation timestamp.
- **`notes[].updatedAt`** (`string`, optional): ISO 8601 timestamp of the last content/status change.
- **`note`** (`string`, optional): Backward-compatible computed mirror of the latest note's content.
- **`noteUpdatedAt`** (`string` | `null`, optional): Backward-compatible computed timestamp of the latest note.

Older single-note files containing only `note` / `noteUpdatedAt` are still imported and normalized into a one-item `notes` array with `completed: false`.

### Standalone Notes Format

Notes created in the Notes workspace are stored separately under `focusflow_notes_v1` (and are not included in the task JSON export):

```json
{
  "id": "note_abc123",
  "title": "Launch checklist",
  "body": "Draft the announcement and review the release notes.",
  "taggedTaskIds": ["task-seed-1"],
  "promotedTaskId": "task-xyz789",
  "createdAt": "2026-11-09T10:00:00.000Z",
  "updatedAt": "2026-11-09T11:00:00.000Z"
}
```

- **`taggedTaskIds`** (`string[]`, optional): Tasks this note is associated with.
- **`promotedTaskId`** (`string`, optional): The task created from this note via **Start as Task**.

### Statistics Format

Statistics are stored under `focusflow_stats_v1` and include cumulative counters, per-day activity (`timeSeconds`, `completed`, `deleted`, `created`), and a bounded history log. Active time is accumulated only while the app is focused and visible.

---

## 🖥️ Running as an Electron Desktop App

The static site is wrapped in a secure Electron shell. The web UI is loaded unchanged from the local file system via `file://`, so markup, styles, business logic, localStorage persistence, and all workspace navigation (`index.html`, `notes.html`, `note.html?id=…`, `stats.html`) behave exactly as they do in a browser.

### Install & run

```sh
# 1. Install dependencies (Electron + electron-forge)
npm install

# 2. Launch the desktop app
npm start
```

### Test without breaking existing behavior

```sh
# Headless smoke test: verifies the task list, the per-task note editor,
# the preload bridge, and the Content Security Policy render correctly.
npm test
```

> On locked-down CI/containers that lack a display or the Chromium sandbox,
> the smoke test already runs headlessly (`--ozone-platform=headless`); if a
> specific container also forbids user namespaces, add the flag manually:
> `npx electron --no-sandbox smoke-test.js`.

### Package a distributable

```sh
# Build an unpacked app bundle
npm run package

# Build platform installers (Squirrel / ZIP / DEB via electron-forge)
npm run make
```

### Run the original web app (no Electron)

No build step or server required:

```sh
xdg-open src/index.html
# or serve locally:
python3 -m http.server 8000 --directory src
```

Open **Notes** and **Stats** from the header, or click the notepad icon on any task card to open its per-task notes page (`note.html?id=…`).
