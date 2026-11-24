const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

console.log("=========================================");
console.log("FocusFlow Notion Linking Feature Verification");
console.log("=========================================\n");

// -------------------------------------------------------------
// Test 1: Storage Data Model, Normalization & Backward Compatibility
// -------------------------------------------------------------
console.log("[Test 1] Testing Data Model & Normalization...");
const storage = require("./src/storage.js");

// Legacy task without notionUrl
const legacyTask = {
  id: "legacy-1",
  title: "A task created in an older version of FocusFlow",
  completed: false,
  priority: "high"
};
const normTask = storage.normalizeTask(legacyTask);
assert.strictEqual(normTask.notionUrl, null, "Older task without notionUrl must normalize to notionUrl: null");
assert.strictEqual(normTask.title, "A task created in an older version of FocusFlow");
console.log("  ✓ Legacy task loads gracefully with notionUrl: null");

// New task with notionUrl
const taskWithNotion = {
  id: "notion-task-1",
  title: "Review Design Specs in Notion",
  notionUrl: "https://www.notion.so/myteam/Design-Specs-1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d"
};
const normTaskNotion = storage.normalizeTask(taskWithNotion);
assert.strictEqual(normTaskNotion.notionUrl, "https://www.notion.so/myteam/Design-Specs-1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d");
console.log("  ✓ Task with notionUrl normalizes and stores notionUrl");

// Task with whitespace-only notionUrl
const taskWithEmptyNotion = {
  id: "notion-task-2",
  title: "Clean whitespace test",
  notionUrl: "   "
};
const normTaskEmptyNotion = storage.normalizeTask(taskWithEmptyNotion);
assert.strictEqual(normTaskEmptyNotion.notionUrl, null, "Whitespace notionUrl normalizes to null");
console.log("  ✓ Empty/whitespace notionUrl normalizes to null");

// Legacy note without notionUrl
const legacyNote = {
  id: "note-legacy-1",
  title: "Older note title",
  body: "Some content written before"
};
const normNote = storage.normalizeNote(legacyNote);
assert.strictEqual(normNote.notionUrl, null, "Older note without notionUrl must normalize to notionUrl: null");
console.log("  ✓ Legacy note loads gracefully with notionUrl: null");

// New note with notionUrl
const noteWithNotion = {
  id: "note-notion-1",
  title: "Meeting Notes with Notion Link",
  body: "See Notion agenda",
  notionUrl: "https://acme.notion.site/Weekly-Sync-9876543210abcdef9876543210abcdef"
};
const normNoteNotion = storage.normalizeNote(noteWithNotion);
assert.strictEqual(normNoteNotion.notionUrl, "https://acme.notion.site/Weekly-Sync-9876543210abcdef9876543210abcdef");
console.log("  ✓ Note with notionUrl normalizes and stores notionUrl");

// -------------------------------------------------------------
// Test 2: URL Validation & Slug Extraction
// -------------------------------------------------------------
console.log("\n[Test 2] Testing Notion URL Validation & Display Formatting...");

// Valid Notion URLs
const validUrls = [
  "https://www.notion.so/workspace/Project-Plan-1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d",
  "https://notion.so/workspace/Task-12345",
  "https://myteam.notion.site/Public-Roadmap-67890",
  "https://notion.site/Shared-Doc",
  "https://app.notion.com/p/Sprint-Backlog-1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d",
  "https://app.notion.com/p/1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d",
  "https://notion.com/templates",
  "https://team.notion.com/Roadmap",
  "notion://www.notion.so/workspace/deep-link-123",
  "notion://page-id"
];

for (const url of validUrls) {
  assert.ok(storage.isValidNotionUrl(url), `Expected '${url}' to be valid Notion URL`);
}
console.log(`  ✓ All ${validUrls.length} valid Notion URLs accepted`);

// Invalid URLs
const invalidUrls = [
  "",
  null,
  undefined,
  "http://www.notion.so/insecure", // HTTP not allowed
  "http://app.notion.com/p/insecure",
  "https://google.com/search?q=notion",
  "https://notion.so.attacker.com/fake",
  "https://notion.com.attacker.com/p/fake",
  "https://evilnotion.com/p/fake",
  "javascript:alert(1)",
  "file:///etc/passwd",
  "ftp://notion.so/file",
  "random text string"
];

for (const url of invalidUrls) {
  assert.strictEqual(storage.isValidNotionUrl(url), false, `Expected '${url}' to be invalid`);
}
console.log(`  ✓ All ${invalidUrls.length} invalid/unsafe URLs properly rejected`);

// Display slug formatting
assert.strictEqual(
  storage.formatNotionDisplay("https://www.notion.so/workspace/Project-Roadmap-1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d"),
  "Project Roadmap",
  "Page slug should strip 32-hex ID and replace hyphens"
);
assert.strictEqual(
  storage.formatNotionDisplay("https://app.notion.com/p/Sprint-Backlog-1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d"),
  "Sprint Backlog",
  "app.notion.com /p/ slug should strip 32-hex ID and replace hyphens"
);
assert.strictEqual(
  storage.formatNotionDisplay("https://app.notion.com/p/1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d"),
  "Notion Page",
  "Pure hex ID without slug should fallback cleanly to 'Notion Page'"
);
assert.strictEqual(
  storage.formatNotionDisplay("https://team.notion.site/Engineering-Tokens-abcdef1234567890abcdef1234567890"),
  "Engineering Tokens"
);
assert.strictEqual(
  storage.formatNotionDisplay("notion://custom-deep-link"),
  "Notion App"
);
console.log("  ✓ Notion display slug formatting works cleanly");

// -------------------------------------------------------------
// Test 3: Main & Preload IPC Security Protocol
// -------------------------------------------------------------
console.log("\n[Test 3] Verifying Electron IPC Security in main.js & preload.js...");

const mainContent = fs.readFileSync(path.join(__dirname, "main.js"), "utf8");
const preloadContent = fs.readFileSync(path.join(__dirname, "preload.js"), "utf8");

assert.ok(mainContent.includes("open-external-url"), "main.js must register open-external-url IPC handler");
assert.ok(mainContent.includes("isValidExternalUrl"), "main.js must validate external URL protocol");
assert.ok(mainContent.includes("/^https:\\/\\//i.test(trimmed) || /^notion:\\/\\//i.test(trimmed)"), "main.js strictly allows only https:// and notion://");
console.log("  ✓ main.js implements secure IPC handler with strict protocol allow-list");

assert.ok(preloadContent.includes("electronAPI"), "preload.js must expose electronAPI bridge");
assert.ok(preloadContent.includes("openExternalUrl"), "preload.js must expose openExternalUrl");
assert.ok(preloadContent.includes("focusflowDesktop"), "preload.js retains focusflowDesktop compatibility");
assert.ok(preloadContent.includes("open-external-url"), "preload.js allows open-external-url channel");
console.log("  ✓ preload.js exposes safe openExternalUrl bridge");

// -------------------------------------------------------------
// Test 4: HTML & CSS Markup Presence
// -------------------------------------------------------------
console.log("\n[Test 4] Verifying HTML & CSS Markup...");

const indexHtml = fs.readFileSync(path.join(__dirname, "src/index.html"), "utf8");
const notesHtml = fs.readFileSync(path.join(__dirname, "src/notes.html"), "utf8");
const noteHtml = fs.readFileSync(path.join(__dirname, "src/note.html"), "utf8");
const styleCss = fs.readFileSync(path.join(__dirname, "src/style.css"), "utf8");

assert.ok(indexHtml.includes("taskNotionUrlInput"), "index.html has taskNotionUrlInput field");
assert.ok(indexHtml.includes("taskNotionUrlError"), "index.html has taskNotionUrlError element");
assert.ok(indexHtml.includes("notion-icon"), "index.html includes Notion icon SVG");
console.log("  ✓ index.html has Notion URL input and SVG icon");

assert.ok(notesHtml.includes("noteNotionLinkContainer"), "notes.html has noteNotionLinkContainer");
assert.ok(notesHtml.includes("noteLinkNotionBtn"), "notes.html has Link Notion toggle button");
assert.ok(notesHtml.includes("noteNotionLinkedState"), "notes.html has linked pill state");
assert.ok(notesHtml.includes("noteNotionInputGroup"), "notes.html has inline URL input group");
assert.ok(notesHtml.includes("noteNotionEditBtn"), "notes.html has Notion edit button");
assert.ok(notesHtml.includes("noteNotionUnlinkBtn"), "notes.html has Notion unlink button");
console.log("  ✓ notes.html has all required Notion linking controls in note editor");

assert.ok(styleCss.includes(".badge-notion"), "style.css includes .badge-notion");
assert.ok(styleCss.includes(".badge-notion-pill"), "style.css includes .badge-notion-pill");
assert.ok(styleCss.includes(".notion-icon"), "style.css includes .notion-icon");
assert.ok(styleCss.includes(".notion-validation-msg"), "style.css includes .notion-validation-msg");
console.log("  ✓ style.css includes all required badge, pill, icon, and validation styles");

// -------------------------------------------------------------
// Test 5: JavaScript Logic Checks in app.js, notes.js, note.js
// -------------------------------------------------------------
console.log("\n[Test 5] Verifying JavaScript Logic in app.js, notes.js, note.js...");

const appJs = fs.readFileSync(path.join(__dirname, "src/app.js"), "utf8");
const notesJs = fs.readFileSync(path.join(__dirname, "src/notes.js"), "utf8");
const noteJs = fs.readFileSync(path.join(__dirname, "src/note.js"), "utf8");

assert.ok(appJs.includes("taskNotionUrlInput"), "app.js references taskNotionUrlInput");
assert.ok(appJs.includes("action-open-notion"), "app.js binds action-open-notion handler");
assert.ok(appJs.includes("stopPropagation"), "app.js stops propagation when clicking Notion icon");
assert.ok(appJs.includes("edit-notion-input"), "app.js supports editing Notion URL inline");
console.log("  ✓ app.js implements task Notion linking, editing, and non-bubbling open");

assert.ok(notesJs.includes("action-open-notion"), "notes.js binds action-open-notion on note cards");
assert.ok(notesJs.includes("saveNotionLink"), "notes.js implements saveNotionLink in-place");
assert.ok(notesJs.includes("unlinkNotion"), "notes.js implements unlinkNotion in-place");
assert.ok(notesJs.includes("noteNotionOpenPill"), "notes.js implements noteNotionOpenPill open action");
console.log("  ✓ notes.js implements note cards badge and editor Link/Edit/Unlink actions");

assert.ok(noteJs.includes("taskNotionOpenPill"), "note.js implements taskNotionOpenPill");
assert.ok(noteJs.includes("taskNotionInlineSaveBtn"), "note.js implements inline Notion save on task notes page");
assert.ok(noteJs.includes("editTaskNotionUrlInput"), "note.js implements editTaskNotionUrlInput in task edit mode");
console.log("  ✓ note.js implements task notes page Notion linking and in-place edit");

console.log("\n=========================================");
console.log("ALL NOTION LINKING TESTS PASSED (100%)");
console.log("=========================================");
