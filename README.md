# FocusFlow — Native Vanilla To-Do Application with Task Notes

A high-fidelity, single-page personal task management suite built with **pure native HTML5, CSS3, and modern Vanilla JavaScript (ES6+)**. No frameworks, no external runtime libraries, no icon fonts.

Designed with strict adherence to **anti-slop design principles**, multi-layer ambient depth, strict 8px spatial rhythm, tactile micro-feedback, and accessible interactions.

---

## ✨ Features & Notes Implementation

### 📝 Task Notes & Journal
- **Dedicated Notes Page**: Every task has a dedicated multi-note editor (`note.html?id=TASK_ID`) accessible via the notepad button on each task card.
- **Per-Note Done Status**: Each note has a `Not done` / `Done` segmented control. The state is stored as `completed` on the note and reflected by a green accent on the note card.
- **Save Without Leaving**: **Save** persists changes in place, keeps your inputs and cursor position intact, shows a success toast, and never redirects. The notes header shows a live `Unsaved changes` / `Saving…` / `All changes saved` status.
- **URL Note Anchor**: Saving a new or edited note updates the URL in place (`note.html?id=TASK_ID&note=NOTE_ID`) with `history.replaceState`, so refreshing or saving again targets the same note instead of creating duplicates.
- **Visual Note Indicator**: Tasks with notes display a badge with the note count (`Note` or `3 notes`) and the note button gets an accent. The badge tooltip also reports how many notes are done.
- **Auto-Resizing Textarea**: Fluid auto-resizing textarea that expands dynamically as you write.
- **Timestamps**: Displays the last-saved timestamp per note; it only advances when the note's content or done state actually changes.
- **Clear & Delete Notes**: Delete individual notes with confirmation; a single remaining note is cleared in place instead.
- **Return Safeguards**: `Back`, `Esc`, refresh, and tab close warn when staged changes have not been saved. Filter and scroll position are preserved when returning to the task list via `sessionStorage`.

### 📋 Core Task Management
- **Add Tasks**: Fast input field with <kbd>Enter</kbd> key support, priority selector (High, Medium, Low), and due date picker.
- **Inline Editing**: Double-click any task title or click the Edit button to edit in place. Press <kbd>Enter</kbd> to save or <kbd>Esc</kbd> to cancel.
- **Micro-Interactions**: Custom checkbox with spring checkmark animation, strike-through transition, and priority color bars.
- **Undoable Deletion**: Deleting single tasks or clearing completed tasks triggers a 5-second toast banner with an instant **Undo** button.
- **Daily Momentum Progress**: Dynamic percentage bar with contextual feedback based on completion rate.
- **Priority System**:
  - 🔴 **High Priority**: Crimson accent with soft badge
  - 🟡 **Medium Priority / In-Progress**: Warm amber accent
  - 🔵 **Low Priority**: Subtle slate-blue accent
  - 🟢 **Completed**: Emerald green accent

### 💾 Data Persistence & JSON Import/Export
- **LocalStorage Persistence**: The task list syncs immediately on every addition, edit, deletion, toggle, and reorder. The note editor persists on **Save** (or <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>S</kbd>) and warns before leaving with unsaved changes.
- **JSON Export**: Download a timestamped `tasks-YYYY-MM-DD.json` file including all task notes and timestamps.
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

### Note Editor (`note.html`)
| Shortcut | Action |
| :--- | :--- |
| <kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>S</kbd> | Save notes and stay on the page |
| <kbd>Esc</kbd> | Return to tasks (warns if changes are unsaved) |

---

## 📁 Project Structure

```text
TodoApp/
├── index.html       # Main task list & dashboard
├── note.html        # Dedicated task note editor page
├── style.css        # Design system tokens, 8px grid, dark mode & animations
├── storage.js       # Shared localStorage & task normalization module
├── app.js           # Main task list controller & interaction engine
├── note.js          # Multi-note controller, per-note done state & save-in-place logic
└── README.md        # Documentation and JSON format schema
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

---

## 🚀 Getting Started

No build step or Node.js server required.

1. Open `index.html` in any modern web browser:
   ```sh
   # On Linux
   xdg-open index.html

   # Or serve locally
   python3 -m http.server 8000
   ```
2. Click the notepad icon on any task card to open its dedicated notes page (`note.html?id=...`).
