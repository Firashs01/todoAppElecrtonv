/**
 * FocusFlow — Main Process Notion API Service
 *
 * Handles Notion API communications securely in the Electron Main Process:
 * - Securely stores and validates Internal Integration Tokens in Electron userData
 * - Tests connection via GET https://api.notion.com/v1/users/me
 * - Searches workspace pages via POST https://api.notion.com/v1/search
 * - Normalizes page items with title, icon, URL, and timestamps
 *
 * Security: The integration token is kept strictly in the Main Process
 * and is NEVER exposed or returned across the IPC bridge to the renderer.
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");

const NOTION_API_VERSION = "2022-06-28";
const NOTION_API_BASE = "https://api.notion.com/v1";

let customConfigDir = null;

function getConfigPath() {
  if (customConfigDir) {
    return path.join(customConfigDir, "notion-config.json");
  }
  const baseDir = (app && typeof app.getPath === "function")
    ? app.getPath("userData")
    : path.join(__dirname, ".focusflow-user-data");
  return path.join(baseDir, "notion-config.json");
}

function setCustomConfigDir(dir) {
  customConfigDir = dir;
}

/**
 * Read the saved Notion configuration from disk.
 * Returns null if not present or corrupt.
 */
function readConfig() {
  try {
    const configPath = getConfigPath();
    if (!fs.existsSync(configPath)) {
      return null;
    }
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (err) {
    console.error("[NotionService] Failed to read config:", err.message);
    return null;
  }
}

/**
 * Save configuration to disk with restricted permissions (0o600).
 */
function writeConfig(data) {
  const configPath = getConfigPath();
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2), {
    mode: 0o600,
    encoding: "utf8"
  });
}

/**
 * Clear saved Notion configuration.
 */
function clearConfig() {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }
    return true;
  } catch (err) {
    console.error("[NotionService] Failed to clear config:", err.message);
    return false;
  }
}

/**
 * Extract human-readable title from Notion page properties.
 * In Notion, standard pages and database rows store title in a property with type: "title".
 */
function extractPageTitle(page) {
  if (!page || typeof page !== "object") return "Untitled";
  const props = page.properties;
  if (!props || typeof props !== "object") return "Untitled";

  for (const key of Object.keys(props)) {
    const prop = props[key];
    if (prop && prop.type === "title" && Array.isArray(prop.title)) {
      const parts = prop.title.map(t => (t && (t.plain_text || (t.text && t.text.content))) || "");
      const fullText = parts.join("").trim();
      if (fullText) return fullText;
    }
  }

  return "Untitled";
}

/**
 * Extract page icon: emoji character, external image URL, or file URL.
 */
function extractPageIcon(page) {
  if (!page || !page.icon || typeof page.icon !== "object") return null;
  const icon = page.icon;
  if (icon.type === "emoji" && icon.emoji) {
    return icon.emoji;
  }
  if (icon.type === "external" && icon.external && icon.external.url) {
    return icon.external.url;
  }
  if (icon.type === "file" && icon.file && icon.file.url) {
    return icon.file.url;
  }
  return null;
}

/**
 * Test an integration token with Notion's GET /v1/users/me endpoint.
 */
async function testConnection(token) {
  if (!token || typeof token !== "string" || !token.trim()) {
    return {
      success: false,
      error: "Please enter a valid Notion Integration Secret."
    };
  }

  const cleanToken = token.trim();

  try {
    const res = await fetch(`${NOTION_API_BASE}/users/me`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${cleanToken}`,
        "Notion-Version": NOTION_API_VERSION
      }
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg = data.message || `Notion API error (${res.status} ${res.statusText})`;
      return {
        success: false,
        error: msg
      };
    }

    const botName = data.name || (data.bot && data.bot.owner && data.bot.owner.workspace_name) || "FocusFlow Integration";
    const workspaceName = (data.bot && (data.bot.workspace_name || (data.bot.owner && data.bot.owner.workspace_name))) || "Notion Workspace";
    const botId = data.id || null;

    return {
      success: true,
      botName,
      workspaceName,
      botId
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || "Failed to reach Notion API. Check your network connection."
    };
  }
}

/**
 * Save and verify an integration token.
 */
async function saveToken(token) {
  const result = await testConnection(token);
  if (!result.success) {
    return result;
  }

  const cleanToken = token.trim();
  const config = {
    token: cleanToken,
    workspaceName: result.workspaceName,
    botName: result.botName,
    botId: result.botId,
    connectedAt: new Date().toISOString()
  };

  writeConfig(config);

  return {
    success: true,
    workspaceName: result.workspaceName,
    botName: result.botName,
    connectedAt: config.connectedAt
  };
}

/**
 * Disconnect the Notion workspace.
 */
function disconnect() {
  clearConfig();
  return {
    success: true,
    connected: false
  };
}

/**
 * Get current connection status (Safe for renderer: NEVER returns the secret token).
 */
function getStatus() {
  const config = readConfig();
  if (!config || !config.token) {
    return {
      connected: false,
      workspaceName: null,
      botName: null,
      connectedAt: null
    };
  }

  return {
    connected: true,
    workspaceName: config.workspaceName || "Notion Workspace",
    botName: config.botName || "FocusFlow Integration",
    connectedAt: config.connectedAt || null
  };
}

/**
 * Search pages in Notion workspace using POST /v1/search.
 */
async function searchPages(query) {
  const config = readConfig();
  if (!config || !config.token) {
    return {
      success: false,
      error: "Notion is not connected. Connect your workspace in settings first.",
      pages: []
    };
  }

  const cleanQuery = typeof query === "string" ? query.trim() : "";

  try {
    const payload = {
      filter: {
        value: "page",
        property: "object"
      },
      page_size: 15
    };

    if (cleanQuery) {
      payload.query = cleanQuery;
    }

    const res = await fetch(`${NOTION_API_BASE}/search`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.token}`,
        "Notion-Version": NOTION_API_VERSION,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg = data.message || `Notion Search error (${res.status} ${res.statusText})`;
      return {
        success: false,
        error: msg,
        pages: []
      };
    }

    const rawResults = Array.isArray(data.results) ? data.results : [];
    const normalized = rawResults
      .filter(item => item && item.object === "page" && !item.archived && !item.in_trash)
      .map(page => ({
        id: page.id,
        title: extractPageTitle(page),
        icon: extractPageIcon(page),
        url: page.url || `https://www.notion.so/${page.id.replace(/-/g, "")}`,
        lastEdited: page.last_edited_time || page.created_time || new Date().toISOString()
      }));

    return {
      success: true,
      pages: normalized
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || "Network error searching Notion pages.",
      pages: []
    };
  }
}

module.exports = {
  testConnection,
  saveToken,
  disconnect,
  getStatus,
  searchPages,
  extractPageTitle,
  extractPageIcon,
  setCustomConfigDir,
  getConfigPath
};
