/**
 * FocusFlow — Notion Integration UI & Page Picker Component
 *
 * Provides:
 * 1. Top bar connection pill status updates (Connected / Not Connected)
 * 2. Notion Connection Modal with token input, show/hide toggle, helper guide,
 *    and Test & Save / Disconnect actions
 * 3. Friction-free Notion Page Picker dropdown with live search, page emojis/icons,
 *    titles, and keyboard navigation
 * 4. Helper for rendering dynamic Notion badges with real page titles & icons
 */

const NotionUI = (() => {
  "use strict";

  let connectionStatus = {
    connected: false,
    workspaceName: null,
    botName: null,
    connectedAt: null
  };

  let modalInitialized = false;
  let listenersBound = false;

  function escapeHTML(str) {
    if (typeof str !== "string") return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getBridge() {
    if (typeof window !== "undefined") {
      if (window.electronAPI && window.electronAPI.notion) {
        return window.electronAPI.notion;
      }
      if (window.focusflowDesktop && window.focusflowDesktop.notion) {
        return window.focusflowDesktop.notion;
      }
    }
    return null;
  }

  /**
   * Format relative time for search results.
   */
  function formatRelativeTime(isoString) {
    if (!isoString) return "";
    try {
      const then = new Date(isoString).getTime();
      const now = Date.now();
      const diffSec = Math.floor((now - then) / 1000);
      if (diffSec < 60) return "just now";
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}h ago`;
      const diffDays = Math.floor(diffHr / 24);
      if (diffDays === 1) return "yesterday";
      if (diffDays < 7) return `${diffDays}d ago`;
      return new Date(isoString).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  }

  /**
   * Fetch current connection status from Electron Main Process.
   */
  async function refreshStatus() {
    const bridge = getBridge();
    if (!bridge || typeof bridge.getStatus !== "function") {
      connectionStatus = {
        connected: false,
        workspaceName: null,
        botName: null,
        connectedAt: null
      };
      updateHeaderPill();
      return connectionStatus;
    }

    try {
      const status = await bridge.getStatus();
      connectionStatus = status || {
        connected: false,
        workspaceName: null,
        botName: null,
        connectedAt: null
      };
    } catch (err) {
      console.error("[NotionUI] Failed to refresh status:", err);
      connectionStatus = {
        connected: false,
        workspaceName: null,
        botName: null,
        connectedAt: null
      };
    }

    updateHeaderPill();
    updateModalContent();
    return connectionStatus;
  }

  /**
   * Update all header connection pills present on the current page.
   */
  function updateHeaderPill() {
    const btn = document.getElementById("notionConnectBtn");
    if (!btn) return;

    const dot = document.getElementById("notionHeaderStatusDot");
    const text = document.getElementById("notionHeaderStatusText");

    if (connectionStatus.connected) {
      btn.classList.add("is-connected");
      btn.classList.remove("is-disconnected");
      if (dot) {
        dot.className = "notion-status-dot connected";
      }
      if (text) {
        text.textContent = connectionStatus.workspaceName
          ? `Notion (${connectionStatus.workspaceName})`
          : "Notion: Connected";
      }
      btn.title = `Notion Connected (${connectionStatus.workspaceName || "Workspace"}) — Click to view settings`;
    } else {
      btn.classList.remove("is-connected");
      btn.classList.add("is-disconnected");
      if (dot) {
        dot.className = "notion-status-dot disconnected";
      }
      if (text) {
        text.textContent = "Connect Notion";
      }
      btn.title = "Connect your Notion workspace to search & pick pages";
    }
  }

  /**
   * Inject and initialize the Notion Connection Modal.
   */
  function ensureModal() {
    if (modalInitialized && document.getElementById("notionConfigModal")) return;

    let modal = document.getElementById("notionConfigModal");
    if (!modal) {
      const div = document.createElement("div");
      div.innerHTML = `
        <dialog id="notionConfigModal" class="modal-dialog notion-modal" aria-labelledby="notionModalTitle" aria-describedby="notionModalDesc">
          <div class="modal-panel notion-modal-panel">
            <div class="notion-modal-header">
              <div class="notion-modal-title-group">
                <div class="notion-modal-logo" aria-hidden="true">
                  <svg class="notion-icon" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.69c-.466-.373-.84-.373-1.446-.326L3.62 2.39c-.466.047-.56.327-.373.513l1.212 1.305zm1.586 3.964v12.215c0 .793.42 1.072 1.259 1.025l13.448-.792c.793-.047.887-.606.887-1.166V6.958c0-.56-.467-.84-1.026-.793l-13.682.793c-.653.047-.886.42-.886 1.214zm11.754-.047c.14 0 .327.14.327.373v9.043c0 .56-.374.793-.84.84l-2.006.14c-.373.047-.466-.187-.466-.42v-6.39l-4.152 6.577c-.233.373-.513.513-.933.513h-.746c-.28 0-.466-.233-.466-.513V8.87c0-.513.373-.793.793-.84l2.1-.14c.373-.047.466.186.466.42v5.783l3.872-6.11c.233-.373.56-.513.886-.513l.167.047z"/>
                  </svg>
                </div>
                <div>
                  <h3 id="notionModalTitle" class="notion-modal-title">Notion Integration</h3>
                  <p id="notionModalDesc" class="notion-modal-desc">Connect your Notion workspace to search, pick, and link pages.</p>
                </div>
              </div>
              <button type="button" id="closeNotionModalBtn" class="btn-icon" aria-label="Close Notion modal">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <!-- Dynamic Body (Connected vs Unconnected) -->
            <div id="notionModalBody" class="notion-modal-body">
              <!-- Content rendered via updateModalContent() -->
            </div>
          </div>
        </dialog>
      `;
      document.body.appendChild(div.firstElementChild);
      modal = document.getElementById("notionConfigModal");
    }

    modalInitialized = true;
    bindModalEvents();
    updateModalContent();
  }

  function updateModalContent() {
    const body = document.getElementById("notionModalBody");
    if (!body) return;

    if (connectionStatus.connected) {
      body.innerHTML = `
        <div class="notion-status-card is-connected">
          <div class="notion-status-header">
            <span class="notion-status-pill connected">
              <span class="status-dot"></span>
              Connected
            </span>
          </div>

          <div class="notion-workspace-info">
            <div class="notion-info-row">
              <span class="info-label">Workspace:</span>
              <strong class="info-value">${escapeHTML(connectionStatus.workspaceName || "Personal Workspace")}</strong>
            </div>
            <div class="notion-info-row">
              <span class="info-label">Integration Bot:</span>
              <span class="info-value">${escapeHTML(connectionStatus.botName || "FocusFlow Integration")}</span>
            </div>
            ${connectionStatus.connectedAt ? `
              <div class="notion-info-row">
                <span class="info-label">Connected Since:</span>
                <span class="info-value">${new Date(connectionStatus.connectedAt).toLocaleDateString()}</span>
              </div>
            ` : ""}
          </div>

          <div class="notion-connected-guide">
            <p class="guide-tip">
              💡 <strong>Tip:</strong> In Notion, remember to share any pages or databases you want FocusFlow to access (click <code>···</code> at top-right of the page → <strong>Connections</strong> → select <strong>${escapeHTML(connectionStatus.botName || "your integration")}</strong>).
            </p>
          </div>

          <div id="notionFeedbackMsg" class="notion-feedback-msg" hidden></div>

          <div class="notion-modal-actions">
            <button type="button" id="disconnectNotionBtn" class="btn-ghost-danger">
              Disconnect Workspace
            </button>
            <div class="actions-right">
              <button type="button" id="testExistingConnectionBtn" class="btn-secondary">
                Test Connection
              </button>
              <button type="button" id="doneNotionModalBtn" class="btn-primary">
                Done
              </button>
            </div>
          </div>
        </div>
      `;
    } else {
      body.innerHTML = `
        <div class="notion-status-card is-disconnected">
          <p class="notion-connect-intro">
            Connect an <strong>Internal Integration Token</strong> to search and pick Notion pages directly from FocusFlow with live titles and page icons.
          </p>

          <div class="notion-token-field-group">
            <label for="notionTokenInput" class="form-label">
              Internal Integration Secret
            </label>
            <div class="notion-token-input-wrapper">
              <input
                type="password"
                id="notionTokenInput"
                class="meta-input notion-secret-input"
                placeholder="secret_... or ntn_..."
                autocomplete="off"
                spellcheck="false"
              />
              <button type="button" id="toggleTokenVisibilityBtn" class="btn-icon btn-toggle-eye" title="Show or hide secret">
                <svg id="eyeIconOpen" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
                <svg id="eyeIconClosed" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" hidden>
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                </svg>
              </button>
            </div>
            <p class="field-hint">
              Your secret is stored locally and securely in the Electron app profile. It is never exposed to renderer scripts or external services.
            </p>
          </div>

          <div class="notion-instructions-box">
            <h4 class="instructions-heading">Setup in 3 Quick Steps:</h4>
            <ol class="instructions-list">
              <li>Open <a href="https://www.notion.so/profile/integrations" class="external-link" id="openNotionIntegrationsLink">notion.so/profile/integrations</a> and click <strong>New integration</strong>.</li>
              <li>Give it a name (e.g. <em>FocusFlow</em>), select your workspace, and copy the <strong>Internal Integration Secret</strong>.</li>
              <li>In Notion, open the page(s) or database(s) you want to link, click <code>···</code> at the top right → <strong>Connections</strong> → add your integration.</li>
            </ol>
          </div>

          <div id="notionFeedbackMsg" class="notion-feedback-msg" hidden></div>

          <div class="notion-modal-actions">
            <button type="button" id="cancelNotionModalBtn" class="btn-secondary">
              Cancel
            </button>
            <button type="button" id="saveNotionTokenBtn" class="btn-primary">
              Test &amp; Save Connection
            </button>
          </div>
        </div>
      `;
    }

    bindDynamicBodyEvents();
  }

  function showFeedback(message, isError = false) {
    const el = document.getElementById("notionFeedbackMsg");
    if (!el) return;
    el.textContent = message;
    el.className = `notion-feedback-msg ${isError ? "error" : "success"}`;
    el.hidden = false;
  }

  function bindDynamicBodyEvents() {
    // Eye toggle for password visibility
    const toggleEye = document.getElementById("toggleTokenVisibilityBtn");
    const tokenInput = document.getElementById("notionTokenInput");
    const eyeOpen = document.getElementById("eyeIconOpen");
    const eyeClosed = document.getElementById("eyeIconClosed");

    if (toggleEye && tokenInput) {
      toggleEye.addEventListener("click", () => {
        const isPassword = tokenInput.type === "password";
        tokenInput.type = isPassword ? "text" : "password";
        if (eyeOpen) eyeOpen.hidden = !isPassword;
        if (eyeClosed) eyeClosed.hidden = isPassword;
      });
    }

    // External link to Notion Integrations page
    const integrationsLink = document.getElementById("openNotionIntegrationsLink");
    if (integrationsLink) {
      integrationsLink.addEventListener("click", e => {
        e.preventDefault();
        if (typeof FocusFlowStorage !== "undefined" && typeof FocusFlowStorage.openExternalUrl === "function") {
          FocusFlowStorage.openExternalUrl("https://www.notion.so/profile/integrations");
        } else {
          window.open("https://www.notion.so/profile/integrations", "_blank");
        }
      });
    }

    // Save & Test token
    const saveBtn = document.getElementById("saveNotionTokenBtn");
    if (saveBtn && tokenInput) {
      saveBtn.addEventListener("click", async () => {
        const token = tokenInput.value.trim();
        if (!token) {
          showFeedback("Please enter your Notion Integration Secret.", true);
          tokenInput.focus();
          return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = "Verifying Connection…";
        showFeedback("Testing connection with Notion API…");

        const bridge = getBridge();
        if (!bridge) {
          showFeedback("Electron Notion bridge is unavailable.", true);
          saveBtn.disabled = false;
          saveBtn.textContent = "Test & Save Connection";
          return;
        }

        try {
          const res = await bridge.saveToken(token);
          if (res && res.success) {
            await refreshStatus();
            showFeedback(`Connected to "${res.workspaceName}" successfully!`);
            setTimeout(() => {
              updateModalContent();
            }, 800);
          } else {
            showFeedback(res && res.error ? res.error : "Failed to verify token with Notion.", true);
            saveBtn.disabled = false;
            saveBtn.textContent = "Test & Save Connection";
          }
        } catch (err) {
          showFeedback(err && err.message ? err.message : "Connection error.", true);
          saveBtn.disabled = false;
          saveBtn.textContent = "Test & Save Connection";
        }
      });
    }

    // Disconnect
    const disconnectBtn = document.getElementById("disconnectNotionBtn");
    if (disconnectBtn) {
      disconnectBtn.addEventListener("click", async () => {
        if (!confirm("Are you sure you want to disconnect your Notion workspace? Existing links on your tasks and notes will remain intact.")) {
          return;
        }

        const bridge = getBridge();
        if (bridge) {
          await bridge.disconnect();
        }
        await refreshStatus();
        updateModalContent();
      });
    }

    // Test existing connection
    const testExistingBtn = document.getElementById("testExistingConnectionBtn");
    if (testExistingBtn) {
      testExistingBtn.addEventListener("click", async () => {
        testExistingBtn.disabled = true;
        testExistingBtn.textContent = "Testing…";
        const bridge = getBridge();
        if (bridge) {
          const res = await bridge.testConnection("");
          if (res && res.success) {
            showFeedback(`Connection verified! Workspace: "${res.workspaceName}".`);
          } else {
            showFeedback(res && res.error ? res.error : "Connection test failed.", true);
          }
        }
        testExistingBtn.disabled = false;
        testExistingBtn.textContent = "Test Connection";
      });
    }

    // Done button
    const doneBtn = document.getElementById("doneNotionModalBtn");
    if (doneBtn) {
      doneBtn.addEventListener("click", () => {
        closeModal();
      });
    }

    // Cancel button
    const cancelBtn = document.getElementById("cancelNotionModalBtn");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        closeModal();
      });
    }
  }

  function bindModalEvents() {
    if (listenersBound) return;
    listenersBound = true;

    const modal = document.getElementById("notionConfigModal");
    if (!modal) return;

    const closeBtn = document.getElementById("closeNotionModalBtn");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => closeModal());
    }

    modal.addEventListener("click", e => {
      if (e.target === modal) {
        closeModal();
      }
    });

    modal.addEventListener("keydown", e => {
      if (e.key === "Escape") {
        closeModal();
      }
    });
  }

  function openModal() {
    ensureModal();
    const modal = document.getElementById("notionConfigModal");
    if (!modal) return;
    refreshStatus().then(() => {
      updateModalContent();
      if (typeof modal.showModal === "function") {
        modal.showModal();
      } else {
        modal.setAttribute("open", "");
      }
      const tokenInput = document.getElementById("notionTokenInput");
      if (tokenInput) tokenInput.focus();
    });
  }

  function closeModal() {
    const modal = document.getElementById("notionConfigModal");
    if (!modal) return;
    if (typeof modal.close === "function") {
      modal.close();
    } else {
      modal.removeAttribute("open");
    }
  }

  /**
   * Attach the Notion Page Picker to any input field.
   *
   * @param {HTMLInputElement} inputEl
   * @param {Object} options
   * @param {Function} options.onSelect - Callback with { id, title, icon, url, lastEdited }
   * @param {Function} [options.onClear] - Callback when input is cleared
   */
  function attachPagePicker(inputEl, options = {}) {
    if (!inputEl) return;

    let dropdown = null;
    let debounceTimer = null;
    let selectedIndex = -1;
    let currentResults = [];

    // Container for relative positioning
    const parent = inputEl.parentElement;
    if (parent && !parent.classList.contains("notion-picker-container")) {
      parent.classList.add("notion-picker-container");
    }

    function removeDropdown() {
      if (dropdown && dropdown.parentElement) {
        dropdown.parentElement.removeChild(dropdown);
      }
      dropdown = null;
      selectedIndex = -1;
      currentResults = [];
    }

    function createDropdown() {
      if (dropdown) return dropdown;
      dropdown = document.createElement("div");
      dropdown.className = "notion-picker-dropdown";
      dropdown.setAttribute("role", "listbox");
      dropdown.setAttribute("aria-label", "Notion pages search results");

      // Append directly to parent container
      if (parent) {
        parent.appendChild(dropdown);
      } else {
        document.body.appendChild(dropdown);
      }
      return dropdown;
    }

    function renderLoading() {
      const dd = createDropdown();
      dd.innerHTML = `
        <div class="notion-picker-state-msg">
          <span class="picker-spinner"></span> Searching Notion pages…
        </div>
      `;
    }

    function renderDisconnectedPrompt() {
      const dd = createDropdown();
      dd.innerHTML = `
        <div class="notion-picker-prompt">
          <div class="prompt-header">
            <svg class="notion-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.69c-.466-.373-.84-.373-1.446-.326L3.62 2.39c-.466.047-.56.327-.373.513l1.212 1.305zm1.586 3.964v12.215c0 .793.42 1.072 1.259 1.025l13.448-.792c.793-.047.887-.606.887-1.166V6.958c0-.56-.467-.84-1.026-.793l-13.682.793c-.653.047-.886.42-.886 1.214zm11.754-.047c.14 0 .327.14.327.373v9.043c0 .56-.374.793-.84.84l-2.006.14c-.373.047-.466-.187-.466-.42v-6.39l-4.152 6.577c-.233.373-.513.513-.933.513h-.746c-.28 0-.466-.233-.466-.513V8.87c0-.513.373-.793.793-.84l2.1-.14c.373-.047.466.186.466.42v5.783l3.872-6.11c.233-.373.56-.513.886-.513l.167.047z"/>
            </svg>
            <span>Connect Notion Workspace</span>
          </div>
          <p class="prompt-text">Connect Notion to search &amp; pick pages directly with live titles, or paste a link below.</p>
          <button type="button" class="btn-primary btn-compact prompt-connect-btn">Connect Notion</button>
        </div>
      `;
      const btn = dd.querySelector(".prompt-connect-btn");
      if (btn) {
        btn.addEventListener("click", e => {
          e.preventDefault();
          e.stopPropagation();
          removeDropdown();
          openModal();
        });
      }
    }

    function renderResults(pages) {
      const dd = createDropdown();
      if (!pages || pages.length === 0) {
        dd.innerHTML = `
          <div class="notion-picker-state-msg">
            No matching Notion pages found. (Ensure pages are shared with your integration).
          </div>
        `;
        currentResults = [];
        return;
      }

      currentResults = pages;
      selectedIndex = -1;

      let html = `<div class="notion-picker-header">Notion Pages (${pages.length})</div>`;
      html += `<div class="notion-picker-items">`;

      pages.forEach((page, idx) => {
        let iconHtml = "";
        if (page.icon) {
          if (page.icon.startsWith("http://") || page.icon.startsWith("https://")) {
            iconHtml = `<img class="picker-icon-img" src="${escapeHTML(page.icon)}" alt="" />`;
          } else {
            iconHtml = `<span class="picker-icon-emoji">${escapeHTML(page.icon)}</span>`;
          }
        } else {
          iconHtml = `<svg class="notion-icon picker-icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.69c-.466-.373-.84-.373-1.446-.326L3.62 2.39c-.466.047-.56.327-.373.513l1.212 1.305zm1.586 3.964v12.215c0 .793.42 1.072 1.259 1.025l13.448-.792c.793-.047.887-.606.887-1.166V6.958c0-.56-.467-.84-1.026-.793l-13.682.793c-.653.047-.886.42-.886 1.214zm11.754-.047c.14 0 .327.14.327.373v9.043c0 .56-.374.793-.84.84l-2.006.14c-.373.047-.466-.187-.466-.42v-6.39l-4.152 6.577c-.233.373-.513.513-.933.513h-.746c-.28 0-.466-.233-.466-.513V8.87c0-.513.373-.793.793-.84l2.1-.14c.373-.047.466.186.466.42v5.783l3.872-6.11c.233-.373.56-.513.886-.513l.167.047z"/>
          </svg>`;
        }

        const timeStr = formatRelativeTime(page.lastEdited);

        html += `
          <div class="notion-picker-item" role="option" data-index="${idx}">
            <div class="picker-item-left">
              ${iconHtml}
              <span class="picker-item-title">${escapeHTML(page.title || "Untitled")}</span>
            </div>
            ${timeStr ? `<span class="picker-item-time">${escapeHTML(timeStr)}</span>` : ""}
          </div>
        `;
      });

      html += `</div>`;
      dd.innerHTML = html;

      // Click selection
      dd.querySelectorAll(".notion-picker-item").forEach(itemEl => {
        itemEl.addEventListener("mousedown", e => {
          e.preventDefault();
          const idx = parseInt(itemEl.dataset.index, 10);
          selectResult(idx);
        });
      });
    }

    function selectResult(index) {
      if (index < 0 || index >= currentResults.length) return;
      const page = currentResults[index];
      inputEl.value = page.url;
      if (typeof options.onSelect === "function") {
        options.onSelect(page);
      }
      removeDropdown();
    }

    async function triggerSearch(query) {
      if (!connectionStatus.connected) {
        renderDisconnectedPrompt();
        return;
      }

      // If query is an exact URL, don't show search dropdown
      if (/^https?:\/\//i.test(query) || /^notion:\/\//i.test(query)) {
        removeDropdown();
        return;
      }

      renderLoading();
      const bridge = getBridge();
      if (!bridge) {
        removeDropdown();
        return;
      }

      try {
        const res = await bridge.searchPages(query);
        if (res && res.success && Array.isArray(res.pages)) {
          renderResults(res.pages);
        } else {
          renderResults([]);
        }
      } catch (err) {
        console.error("[NotionUI] search error:", err);
        removeDropdown();
      }
    }

    inputEl.addEventListener("focus", () => {
      const val = inputEl.value.trim();
      if (!/^https?:\/\//i.test(val) && !/^notion:\/\//i.test(val)) {
        triggerSearch(val);
      }
    });

    inputEl.addEventListener("input", e => {
      clearTimeout(debounceTimer);
      const val = e.target.value.trim();

      if (/^https?:\/\//i.test(val) || /^notion:\/\//i.test(val)) {
        removeDropdown();
        return;
      }

      if (!val && typeof options.onClear === "function") {
        options.onClear();
      }

      debounceTimer = setTimeout(() => {
        triggerSearch(val);
      }, 250);
    });

    inputEl.addEventListener("keydown", e => {
      if (!dropdown || currentResults.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % currentResults.length;
        updateActiveItem();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        selectedIndex = (selectedIndex - 1 + currentResults.length) % currentResults.length;
        updateActiveItem();
      } else if (e.key === "Enter" && selectedIndex >= 0) {
        e.preventDefault();
        selectResult(selectedIndex);
      } else if (e.key === "Escape") {
        removeDropdown();
      }
    });

    function updateActiveItem() {
      if (!dropdown) return;
      const items = dropdown.querySelectorAll(".notion-picker-item");
      items.forEach((item, idx) => {
        if (idx === selectedIndex) {
          item.classList.add("is-selected");
          item.scrollIntoView({ block: "nearest" });
        } else {
          item.classList.remove("is-selected");
        }
      });
    }

    // Close when clicking outside
    document.addEventListener("click", e => {
      if (dropdown && !parent.contains(e.target)) {
        removeDropdown();
      }
    });
  }

  /**
   * Helper to generate a Notion badge HTML with live emoji/icon and title.
   */
  function renderBadgeHtml(item) {
    if (!item || !item.notionUrl) return "";
    const title = item.notionTitle || (typeof FocusFlowStorage !== "undefined"
      ? FocusFlowStorage.formatNotionDisplay(item.notionUrl)
      : "Notion Page");
    const icon = item.notionIcon;

    let iconHtml = "";
    if (icon) {
      if (icon.startsWith("http://") || icon.startsWith("https://")) {
        iconHtml = `<img class="notion-badge-img" src="${escapeHTML(icon)}" alt="" aria-hidden="true" />`;
      } else {
        iconHtml = `<span class="notion-badge-emoji" aria-hidden="true">${escapeHTML(icon)}</span>`;
      }
    } else {
      iconHtml = `<svg class="notion-icon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.69c-.466-.373-.84-.373-1.446-.326L3.62 2.39c-.466.047-.56.327-.373.513l1.212 1.305zm1.586 3.964v12.215c0 .793.42 1.072 1.259 1.025l13.448-.792c.793-.047.887-.606.887-1.166V6.958c0-.56-.467-.84-1.026-.793l-13.682.793c-.653.047-.886.42-.886 1.214zm11.754-.047c.14 0 .327.14.327.373v9.043c0 .56-.374.793-.84.84l-2.006.14c-.373.047-.466-.187-.466-.42v-6.39l-4.152 6.577c-.233.373-.513.513-.933.513h-.746c-.28 0-.466-.233-.466-.513V8.87c0-.513.373-.793.793-.84l2.1-.14c.373-.047.466.186.466.42v5.783l3.872-6.11c.233-.373.56-.513.886-.513l.167.047z"/>
      </svg>`;
    }

    return `
      <button
        type="button"
        class="badge badge-notion action-open-notion"
        data-notion-url="${escapeHTML(item.notionUrl)}"
        title="Open in Notion: ${escapeHTML(title)} (${escapeHTML(item.notionUrl)})"
        aria-label="Open Notion page '${escapeHTML(title)}'"
      >
        ${iconHtml}
        <span class="badge-notion-title">${escapeHTML(title)}</span>
      </button>
    `;
  }

  /**
   * Initialize NotionUI on DOM ready.
   */
  function init() {
    ensureModal();
    refreshStatus();

    // Bind any existing notionConnectBtn in header
    const connectBtn = document.getElementById("notionConnectBtn");
    if (connectBtn) {
      connectBtn.addEventListener("click", () => {
        openModal();
      });
    }
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }

  return {
    init,
    refreshStatus,
    openModal,
    closeModal,
    attachPagePicker,
    renderBadgeHtml,
    getStatus: () => ({ ...connectionStatus })
  };
})();

if (typeof window !== "undefined") {
  window.NotionUI = NotionUI;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = NotionUI;
}
