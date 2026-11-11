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

// Explicit allow-list of IPC channels the renderer may invoke. FocusFlow is a
// fully self-contained local app and currently needs no main-process services,
// so this list is empty. Add channel names here only when a specific,
// safe capability is introduced.
const ALLOWED_INVOKE_CHANNELS = new Set([]);

contextBridge.exposeInMainWorld("focusflowDesktop", {
  /** True when running inside the Electron shell (informational only). */
  isDesktop: true,

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
