/**
 * FocusFlow — preload bridge.
 *
 * This script runs in an isolated, sandboxed context (contextIsolation: true,
 * nodeIntegration: false, sandbox: true). Its only job is to expose a tiny,
 * explicit, allow-listed surface to the renderer via `contextBridge`.
 *
 * Nothing from Node.js (no `require`, `process`, `Buffer`, filesystem, etc.)
 * is ever leaked into the page. The existing vanilla DOM scripts in ./src are
 * completely unaware of this bridge and remain untouched.
 */

"use strict";

const { contextBridge, ipcRenderer } = require("electron");

// Explicit allow-list of IPC channels the renderer may invoke.
const ALLOWED_INVOKE_CHANNELS = new Set([
  "open-external-url",
  "notion-get-status",
  "notion-test-connection",
  "notion-save-token",
  "notion-disconnect",
  "notion-search-pages"
]);

/**
 * Validate that a URL starts strictly with https:// or notion://
 * before sending across the IPC bridge.
 */
function isValidExternalUrl(rawUrl) {
  if (typeof rawUrl !== "string") return false;
  const trimmed = rawUrl.trim();
  return /^https:\/\//i.test(trimmed) || /^notion:\/\//i.test(trimmed);
}

const notionBridge = {
  getStatus() {
    return ipcRenderer.invoke("notion-get-status");
  },
  testConnection(token) {
    return ipcRenderer.invoke("notion-test-connection", token);
  },
  saveToken(token) {
    return ipcRenderer.invoke("notion-save-token", token);
  },
  disconnect() {
    return ipcRenderer.invoke("notion-disconnect");
  },
  searchPages(query) {
    return ipcRenderer.invoke("notion-search-pages", query);
  }
};

// Expose standard electronAPI interface
contextBridge.exposeInMainWorld("electronAPI", {
  openExternalUrl(url) {
    if (!isValidExternalUrl(url)) {
      return Promise.reject(
        new Error("Invalid URL protocol. Only https:// and notion:// links are allowed.")
      );
    }
    return ipcRenderer.invoke("open-external-url", url.trim());
  },
  notion: notionBridge
});

contextBridge.exposeInMainWorld("focusflowDesktop", {
  /** True when running inside the Electron shell (informational only). */
  isDesktop: true,

  /** Notion API Integration bridge */
  notion: notionBridge,

  /**
   * Safely opens an external URL using Electron's shell.openExternal.
   * Strictly validates that the URL begins with https:// or notion://.
   */
  openExternalUrl(url) {
    if (!isValidExternalUrl(url)) {
      return Promise.reject(
        new Error("Invalid URL protocol. Only https:// and notion:// links are allowed.")
      );
    }
    return ipcRenderer.invoke("open-external-url", url.trim());
  },

  /**
   * Safe async request/response helper. Rejects any channel that is not
   * explicitly allow-listed above, so the renderer cannot reach arbitrary
   * ipcRenderer channels.
   *
   * @param {string} channel  An allow-listed IPC channel name.
   * @param {*}      payload  Optional JSON-serializable payload.
   * @returns {Promise<any>}
   */
  invoke(channel, payload) {
    if (!ALLOWED_INVOKE_CHANNELS.has(channel)) {
      return Promise.reject(
        new Error(`IPC channel "${String(channel)}" is not allowed.`)
      );
    }
    return ipcRenderer.invoke(channel, payload);
  }
});
