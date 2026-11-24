/**
 * FocusFlow — Electron main process.
 *
 * Wraps the existing vanilla HTML/CSS/JS frontend (in ./src) in a secure
 * desktop shell without modifying any of its markup, styles, or logic.
 *
 * Security posture:
 *   - contextIsolation: true  (renderer JS runs isolated from preload/Node)
 *   - nodeIntegration: false  (no Node APIs in the page)
 *   - sandbox: true           (renderer runs in a Chromium sandbox)
 *
 * The page is loaded from the local file system (`file://`), which is exactly
 * how the original static site is served, so asset paths and localStorage
 * behavior remain unchanged.
 */

"use strict";

const { app, BrowserWindow, shell, ipcMain } = require("electron");
const path = require("node:path");
const notionService = require("./notionService");

/**
 * Validate that an external URL begins strictly with an approved protocol (https:// or notion://).
 */
function isValidExternalUrl(rawUrl) {
  if (typeof rawUrl !== "string") return false;
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;
  return /^https:\/\//i.test(trimmed) || /^notion:\/\//i.test(trimmed);
}

// IPC handler for safely opening validated external URLs (Notion pages & web links)
ipcMain.handle("open-external-url", async (_event, rawUrl) => {
  if (!isValidExternalUrl(rawUrl)) {
    throw new Error("Invalid URL protocol. Only https:// and notion:// links are allowed.");
  }
  await shell.openExternal(rawUrl.trim());
  return true;
});

// Notion API IPC Handlers
ipcMain.handle("notion-get-status", async () => {
  return notionService.getStatus();
});

ipcMain.handle("notion-test-connection", async (_event, token) => {
  return notionService.testConnection(token);
});

ipcMain.handle("notion-save-token", async (_event, token) => {
  return notionService.saveToken(token);
});

ipcMain.handle("notion-disconnect", async () => {
  return notionService.disconnect();
});

ipcMain.handle("notion-search-pages", async (_event, query) => {
  return notionService.searchPages(query);
});

/**
 * Create the application window. Kept hidden until the renderer has finished
 * its first paint to avoid a white flash / flicker on launch.
 */
function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 360,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  });

  // Show the window only once the page is ready to render (no flicker).
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Any attempt to open a new window (window.open / target="_blank") is
  // denied inside the app; external http(s) URLs open in the OS browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // Prevent the app window from navigating away to an external site;
  // route http(s) links to the system default browser instead. Internal
  // file:// navigation (index.html <-> note.html) is left untouched.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (/^https?:\/\//i.test(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Default startup route: Statistics Dashboard (Home)
  mainWindow.loadFile(path.join(__dirname, "src", "stats.html"));

  return mainWindow;
}

app.whenReady().then(() => {
  createWindow();

  // macOS: re-create a window when the dock icon is clicked and none remain.
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Standard cross-platform lifecycle: quit when all windows are closed,
// except on macOS where apps conventionally stay active in the dock.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
