/**
 * FocusFlow — headless smoke test.
 *
 * Verifies that the wrapped frontend still loads and renders correctly inside
 * Electron with the secure webPreferences (contextIsolation, nodeIntegration
 * disabled, sandbox, and the preload bridge) and under the `file://` protocol
 * with the added Content Security Policy.
 *
 * Run with:  npm test   (or: npx electron smoke-test.js)
 *
 * The test uses a fresh, temporary userData directory so it always starts from
 * a clean localStorage (the seed tasks) and never touches your real data.
 */

"use strict";

const { app, BrowserWindow } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

// ---------------------------------------------------------------------------
// Headless-only switches for the TEST harness. They make `npm test` runnable
// without a display (CI / containers) and are NOT used by the production app
// (`main.js` keeps its real window, GPU, and the renderer sandbox).
// ---------------------------------------------------------------------------
app.commandLine.appendSwitch("ozone-platform", "headless");
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-dev-shm-usage");
// Note: on locked-down containers you may also need `--no-sandbox`:
//   npx electron --no-sandbox smoke-test.js

const failures = [];
const consoleErrors = [];

// Use an isolated, throw-away profile for a clean, reproducible run.
const tempUserData = fs.mkdtempSync(path.join(os.tmpdir(), "focusflow-smoke-"));
app.setPath("userData", tempUserData);

function fail(message) {
  failures.push(message);
}

function check(name, condition, detail) {
  if (condition) {
    console.log(`  [PASS] ${name}`);
  } else {
    console.log(`  [FAIL] ${name}${detail ? " — " + detail : ""}`);
    fail(`${name}${detail ? " (" + detail + ")" : ""}`);
  }
}

// Hard timeout so a hang can never leave the test running forever.
const hardTimeout = setTimeout(() => {
  console.error("\n[FAIL] smoke test timed out after 45s.");
  console.error("Console errors captured:\n" + (consoleErrors.join("\n") || "(none)"));
  app.exit(1);
}, 45000);

function attachProbe(win) {
  win.webContents.on("console-message", (_event, ...args) => {
    let level;
    let message;
    if (args.length >= 1 && args[0] && typeof args[0] === "object" && "message" in args[0]) {
      level = args[0].level;
      message = args[0].message;
    } else {
      level = args[0];
      message = args[1];
    }
    const isError =
      level === "error" ||
      level === 3 ||
      (typeof level === "number" && level >= 3);
    if (isError) {
      consoleErrors.push(String(message));
    }
  });

  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (isMainFrame) {
      fail(`main frame failed to load (${errorCode}: ${errorDescription}) ${validatedURL}`);
    }
  });

  win.webContents.on("render-process-gone", (_event, details) => {
    fail(`renderer process gone (${details.reason})`);
  });
}

async function run() {
  console.log("\nFocusFlow Electron smoke test\n=============================");

  const win = new BrowserWindow({
    show: false,
    offscreen: true,
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  attachProbe(win);

  // ---- 1. Main task list (index.html) --------------------------------------
  console.log("\n[1] Loading src/index.html …");
  await win.loadFile(path.join(__dirname, "src", "index.html"));

  const index = await win.webContents.executeJavaScript(`(() => {
    return {
      title: document.title,
      storageLoaded: typeof window.FocusFlowStorage === "object",
      bridgeExposed: !!(window.focusflowDesktop && window.focusflowDesktop.isDesktop === true),
      nodeNotLeaked: typeof window.require === "undefined" && typeof window.process === "undefined",
      taskCards: document.querySelectorAll("#taskList .task-card").length,
      seedCount: (() => { try { return FocusFlowStorage.loadTasks().length; } catch { return -1; } })()
    };
  })()`);

  check("page title is set", index.title.length > 0, `title=${JSON.stringify(index.title)}`);
  check("storage.js loaded (FocusFlowStorage exposed)", index.storageLoaded === true);
  check("preload bridge exposed via contextBridge", index.bridgeExposed === true);
  check("Node internals NOT leaked to the page", index.nodeNotLeaked === true);
  check("task list rendered cards", index.taskCards >= 3, `rendered ${index.taskCards} cards`);
  check("localStorage seeded/readable", index.seedCount >= 3, `seedCount=${index.seedCount}`);

  // ---- 2. Note editor (note.html?id=…) --------------------------------------
  console.log("\n[2] Loading src/note.html?id=task-seed-1 …");
  await win.loadFile(path.join(__dirname, "src", "note.html"), {
    query: { id: "task-seed-1" }
  });

  const note = await win.webContents.executeJavaScript(`(() => {
    const wrapper = document.getElementById("noteEditorWrapper");
    const errorState = document.getElementById("errorStateContainer");
    return {
      title: document.title,
      wrapperVisible: wrapper ? !wrapper.hidden : false,
      errorShown: errorState ? !errorState.hidden : false,
      taskCardRendered: document.querySelectorAll("#taskCardContainer .task-card").length,
      noteCards: document.querySelectorAll("#notesCardsList .note-card-item").length
    };
  })()`);

  check("note page title is set", note.title.length > 0, `title=${JSON.stringify(note.title)}`);
  check("note editor visible (not error state)", note.wrapperVisible === true && note.errorShown === false);
  check("task card rendered", note.taskCardRendered === 1, `cards=${note.taskCardRendered}`);
  check("seed note cards rendered", note.noteCards >= 2, `notes=${note.noteCards}`);

  // ---- 3. Invalid note id shows the error state ----------------------------
  console.log("\n[3] Loading src/note.html?id=does-not-exist …");
  await win.loadFile(path.join(__dirname, "src", "note.html"), {
    query: { id: "does-not-exist" }
  });

  const errNote = await win.webContents.executeJavaScript(`(() => {
    const wrapper = document.getElementById("noteEditorWrapper");
    const errorState = document.getElementById("errorStateContainer");
    return {
      wrapperVisible: wrapper ? !wrapper.hidden : false,
      errorShown: errorState ? !errorState.hidden : false
    };
  })()`);

  check("missing task shows error state", errNote.errorShown === true && errNote.wrapperVisible === false);

  win.destroy();
  return { consoleErrors };
}

app.whenReady().then(async () => {
  try {
    await run();

    console.log("\n=============================");
    if (failures.length === 0 && consoleErrors.length === 0) {
      console.log("RESULT: PASS — frontend renders correctly under Electron.");
      clearTimeout(hardTimeout);
      app.exit(0);
    } else {
      if (failures.length > 0) {
        console.error("Assertion failures:");
        failures.forEach((f) => console.error("  - " + f));
      }
      if (consoleErrors.length > 0) {
        console.error("Console errors (e.g. CSP violations / uncaught exceptions):");
        consoleErrors.forEach((e) => console.error("  - " + e));
      }
      console.error("RESULT: FAIL");
      clearTimeout(hardTimeout);
      app.exit(1);
    }
  } catch (err) {
    console.error("\nRESULT: ERROR — " + (err && err.stack ? err.stack : err));
    clearTimeout(hardTimeout);
    app.exit(1);
  }
});
