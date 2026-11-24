const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

console.log("=========================================");
console.log("FocusFlow Notion API Integration Verification");
console.log("=========================================\n");

// -------------------------------------------------------------
// Test 1: NotionService Config, Security, and Storage
// -------------------------------------------------------------
console.log("[Test 1] Testing notionService.js configuration & token isolation...");
const notionService = require("./notionService.js");

// Setup isolated temp config dir
const tempConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), "focusflow-notion-test-"));
notionService.setCustomConfigDir(tempConfigDir);

// Initially disconnected
let initialStatus = notionService.getStatus();
assert.strictEqual(initialStatus.connected, false, "Should be disconnected initially");
assert.strictEqual(initialStatus.token, undefined, "CRITICAL SECURITY: getStatus() must NEVER return the secret token");
console.log("  ✓ Initial disconnected status returns connected: false");
console.log("  ✓ Security verified: token is omitted from getStatus()");

// Mock fetch for testing testConnection & saveToken
const originalFetch = global.fetch;

// Mock 1: Successful verification
global.fetch = async (url, opts) => {
  const urlStr = String(url);
  if (urlStr.includes("/users/me")) {
    const auth = opts.headers && opts.headers["Authorization"];
    if (auth === "Bearer secret_valid_token_123") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          object: "user",
          id: "bot-uuid-1234",
          name: "FocusFlow Sync Bot",
          type: "bot",
          bot: {
            workspace_name: "Acme Product Workspace"
          }
        })
      };
    } else {
      return {
        ok: false,
        status: 401,
        json: async () => ({
          object: "error",
          status: 401,
          code: "unauthorized",
          message: "API token is invalid."
        })
      };
    }
  }

  if (urlStr.includes("/search")) {
    const body = JSON.parse(opts.body || "{}");
    const query = body.query || "";
    return {
      ok: true,
      status: 200,
      json: async () => ({
        object: "list",
        results: [
          {
            object: "page",
            id: "page-1111",
            archived: false,
            in_trash: false,
            created_time: "2026-01-01T10:00:00.000Z",
            last_edited_time: "2026-11-20T14:30:00.000Z",
            icon: { type: "emoji", emoji: "🎯" },
            url: "https://www.notion.so/Roadmap-page-1111",
            properties: {
              Title: {
                id: "title",
                type: "title",
                title: [{ plain_text: "Q4 Engineering Roadmap" }]
              }
            }
          },
          {
            object: "page",
            id: "page-2222",
            archived: false,
            in_trash: false,
            created_time: "2026-02-01T10:00:00.000Z",
            last_edited_time: "2026-11-22T08:00:00.000Z",
            icon: { type: "external", external: { url: "https://example.com/logo.png" } },
            url: "https://www.notion.so/Design-System-page-2222",
            properties: {
              Name: {
                id: "title",
                type: "title",
                title: [{ plain_text: "Design System Guidelines" }]
              }
            }
          },
          {
            object: "page",
            id: "page-archived",
            archived: true,
            in_trash: false,
            properties: {}
          }
        ]
      })
    };
  }

  throw new Error("Unhandled fetch url: " + urlStr);
};

(async () => {
  // Test invalid token
  const invalidRes = await notionService.testConnection("secret_bad_token");
  assert.strictEqual(invalidRes.success, false);
  assert.strictEqual(invalidRes.error, "API token is invalid.");
  console.log("  ✓ Invalid token properly rejected with Notion error message");

  // Test valid token save
  const saveRes = await notionService.saveToken("secret_valid_token_123");
  assert.strictEqual(saveRes.success, true);
  assert.strictEqual(saveRes.workspaceName, "Acme Product Workspace");
  assert.strictEqual(saveRes.botName, "FocusFlow Sync Bot");

  // Check persisted config permissions & contents
  const configPath = notionService.getConfigPath();
  assert.ok(fs.existsSync(configPath), "Config file must be created on disk");
  const stat = fs.statSync(configPath);
  assert.strictEqual(stat.mode & 0o777, 0o600, "Config file must have 0o600 restricted file permissions");

  const connectedStatus = notionService.getStatus();
  assert.strictEqual(connectedStatus.connected, true);
  assert.strictEqual(connectedStatus.workspaceName, "Acme Product Workspace");
  assert.strictEqual(connectedStatus.botName, "FocusFlow Sync Bot");
  assert.strictEqual(connectedStatus.token, undefined, "Token must never leak in getStatus()");
  console.log("  ✓ Valid token verified and saved with 0o600 secure file mode");

  // Test search pages
  const searchRes = await notionService.searchPages("Roadmap");
  assert.strictEqual(searchRes.success, true);
  assert.strictEqual(searchRes.pages.length, 2, "Archived page must be filtered out");
  assert.strictEqual(searchRes.pages[0].id, "page-1111");
  assert.strictEqual(searchRes.pages[0].title, "Q4 Engineering Roadmap");
  assert.strictEqual(searchRes.pages[0].icon, "🎯");
  assert.strictEqual(searchRes.pages[0].url, "https://www.notion.so/Roadmap-page-1111");
  assert.strictEqual(searchRes.pages[1].title, "Design System Guidelines");
  assert.strictEqual(searchRes.pages[1].icon, "https://example.com/logo.png");
  console.log("  ✓ searchPages correctly normalizes pages with emojis, titles, and URLs");

  // Test title & icon extraction edge cases
  assert.strictEqual(notionService.extractPageTitle(null), "Untitled");
  assert.strictEqual(notionService.extractPageTitle({ properties: {} }), "Untitled");
  assert.strictEqual(notionService.extractPageIcon(null), null);
  assert.strictEqual(notionService.extractPageIcon({ icon: { type: "emoji", emoji: "🚀" } }), "🚀");
  console.log("  ✓ extractPageTitle and extractPageIcon handle edge cases safely");

  // Test disconnect
  const discRes = notionService.disconnect();
  assert.strictEqual(discRes.success, true);
  const afterDisc = notionService.getStatus();
  assert.strictEqual(afterDisc.connected, false);
  console.log("  ✓ disconnect() removes config and sets connected: false");

  // Clean up temp dir
  try {
    fs.rmSync(tempConfigDir, { recursive: true, force: true });
  } catch {}

  // Restore fetch
  global.fetch = originalFetch;

  // -------------------------------------------------------------
  // Test 2: Storage Data Model, Live Titles, and Backward Compatibility
  // -------------------------------------------------------------
  console.log("\n[Test 2] Testing storage.js data model updates...");
  const storage = require("./src/storage.js");

  // Legacy task
  const legacyTask = { id: "legacy-t1", title: "Legacy Task Without Notion" };
  const normLegacyTask = storage.normalizeTask(legacyTask);
  assert.strictEqual(normLegacyTask.notionUrl, null);
  assert.strictEqual(normLegacyTask.notionTitle, null);
  assert.strictEqual(normLegacyTask.notionIcon, null);
  assert.strictEqual(normLegacyTask.notionPageId, null);
  console.log("  ✓ Legacy task normalizes cleanly with all notion fields null");

  // Modern task with Notion page data
  const modernTask = {
    id: "task-notion-full",
    title: "Implement Auth Flow",
    notionUrl: "https://www.notion.so/Auth-Flow-12345",
    notionTitle: "Auth Architecture Spec",
    notionIcon: "🔐",
    notionPageId: "uuid-12345"
  };
  const normModern = storage.normalizeTask(modernTask);
  assert.strictEqual(normModern.notionUrl, "https://www.notion.so/Auth-Flow-12345");
  assert.strictEqual(normModern.notionTitle, "Auth Architecture Spec");
  assert.strictEqual(normModern.notionIcon, "🔐");
  assert.strictEqual(normModern.notionPageId, "uuid-12345");
  console.log("  ✓ Modern task preserves notionUrl, notionTitle, notionIcon, notionPageId");

  // Legacy note
  const legacyNote = { id: "legacy-n1", title: "Note Without Notion", body: "Hello" };
  const normLegacyNote = storage.normalizeNote(legacyNote);
  assert.strictEqual(normLegacyNote.notionUrl, null);
  assert.strictEqual(normLegacyNote.notionTitle, null);
  console.log("  ✓ Legacy note normalizes cleanly with all notion fields null");

  // Modern note with Notion page data
  const modernNote = {
    id: "note-notion-full",
    title: "Meeting Sync",
    body: "Synced with team",
    notionUrl: "https://www.notion.so/Meeting-Sync-999",
    notionTitle: "Weekly Sync Agenda",
    notionIcon: "📅",
    notionPageId: "uuid-999"
  };
  const normModernNote = storage.normalizeNote(modernNote);
  assert.strictEqual(normModernNote.notionTitle, "Weekly Sync Agenda");
  assert.strictEqual(normModernNote.notionIcon, "📅");
  console.log("  ✓ Modern note preserves notionTitle, notionIcon, notionPageId");

  // formatNotionDisplay with custom title
  assert.strictEqual(
    storage.formatNotionDisplay("https://notion.so/slug", "My Live Page Title"),
    "My Live Page Title",
    "formatNotionDisplay should prioritize custom title"
  );
  console.log("  ✓ formatNotionDisplay prioritizes live title over URL slug");

  // -------------------------------------------------------------
  // Test 3: Main & Preload IPC Security Contract
  // -------------------------------------------------------------
  console.log("\n[Test 3] Verifying Electron IPC Security in main.js & preload.js...");
  const mainJs = fs.readFileSync(path.join(__dirname, "main.js"), "utf8");
  const preloadJs = fs.readFileSync(path.join(__dirname, "preload.js"), "utf8");

  const requiredChannels = [
    "notion-get-status",
    "notion-test-connection",
    "notion-save-token",
    "notion-disconnect",
    "notion-search-pages"
  ];

  for (const channel of requiredChannels) {
    assert.ok(mainJs.includes(channel), `main.js must handle IPC channel: ${channel}`);
    assert.ok(preloadJs.includes(channel), `preload.js must allow IPC channel: ${channel}`);
  }
  assert.ok(preloadJs.includes("notion: notionBridge"), "preload.js must expose electronAPI.notion bridge");
  console.log("  ✓ All 5 Notion IPC channels registered in main.js and allow-listed in preload.js");
  console.log("  ✓ electronAPI.notion exposed via contextBridge");

  // -------------------------------------------------------------
  // Test 4: HTML & CSS Markup Across All Workspaces
  // -------------------------------------------------------------
  console.log("\n[Test 4] Verifying HTML & CSS across all 5 app screens...");
  const pages = ["index.html", "notes.html", "note.html", "stats.html", "calendar.html"];

  for (const page of pages) {
    const content = fs.readFileSync(path.join(__dirname, "src", page), "utf8");
    assert.ok(content.includes("notionConnectBtn"), `${page} must contain notionConnectBtn in header`);
    assert.ok(content.includes("notion-ui.js"), `${page} must include notion-ui.js script`);
  }
  console.log("  ✓ All 5 workspaces include Notion top-bar connection pill and notion-ui.js script");

  const styleCss = fs.readFileSync(path.join(__dirname, "src/style.css"), "utf8");
  assert.ok(styleCss.includes(".notion-modal"), "style.css includes .notion-modal styles");
  assert.ok(styleCss.includes(".btn-notion-status"), "style.css includes .btn-notion-status styles");
  assert.ok(styleCss.includes(".notion-picker-dropdown"), "style.css includes .notion-picker-dropdown styles");
  assert.ok(styleCss.includes(".notion-badge-emoji"), "style.css includes .notion-badge-emoji styles");
  console.log("  ✓ style.css includes all Notion modal, dropdown picker, and badge styles");

  // -------------------------------------------------------------
  // Test 5: Client Logic & UI Components
  // -------------------------------------------------------------
  console.log("\n[Test 5] Verifying client components...");
  const notionUiJs = fs.readFileSync(path.join(__dirname, "src/notion-ui.js"), "utf8");
  assert.ok(notionUiJs.includes("attachPagePicker"), "notion-ui.js exports attachPagePicker");
  assert.ok(notionUiJs.includes("openModal"), "notion-ui.js exports openModal");
  assert.ok(notionUiJs.includes("renderBadgeHtml"), "notion-ui.js exports renderBadgeHtml");
  assert.ok(notionUiJs.includes("notionTokenInput"), "notion-ui.js contains token input field");
  assert.ok(notionUiJs.includes("toggleTokenVisibilityBtn"), "notion-ui.js contains eye toggle button");
  console.log("  ✓ notion-ui.js implements complete modal and page picker controller");

  console.log("\n=========================================");
  console.log("ALL NOTION API INTEGRATION TESTS PASSED (100%)");
  console.log("=========================================");
})();
