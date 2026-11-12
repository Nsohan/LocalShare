const { ipcRenderer, clipboard } = require("electron");
const { currentState, getCurrentTab, setCurrentTab, getFileCategory, showToast } = require("./state");
const { escapeHtml } = require("./devices");

function deriveTextTitle(content, customTitle = "") {
  const explicit = typeof customTitle === "string" ? customTitle.trim() : "";
  if (explicit) return explicit;

  const raw = typeof content === "string" ? content.trim() : "";
  if (!raw) return "Text snippet";

  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const firstLine = lines[0] || "";
  const words = firstLine.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "Text snippet";

  const maxWords = 4;
  const maxChars = 24;
  const picked = [];

  for (let i = 0; i < Math.min(words.length, maxWords); i++) {
    const candidate = picked.length > 0 ? `${picked.join(" ")} ${words[i]}` : words[i];
    if (candidate.length > maxChars) {
      if (picked.length === 0) {
        return `${words[0].slice(0, maxChars - 2)}..`;
      }
      break;
    }
    picked.push(words[i]);
  }

  const prefix = picked.join(" ");
  const isTruncated = picked.length < words.length || lines.length > 1;
  return isTruncated ? `${prefix}..` : prefix;
}

function formatActiveSharedLabel(fileCount, textCount) {
  if (textCount === 0) {
    return `${fileCount} File${fileCount !== 1 ? "s" : ""}`;
  }
  if (fileCount === 0) {
    return `${textCount} Text${textCount !== 1 ? "s" : ""}`;
  }
  return `${fileCount} File${fileCount !== 1 ? "s" : ""} · ${textCount} Text${textCount !== 1 ? "s" : ""}`;
}

function updateTextShareCounter(inputEl, counterEl) {
  if (!inputEl || !counterEl) return;
  const val = inputEl.value || "";
  const lines = val ? val.split(/\r?\n/).length : 0;
  counterEl.textContent = `${val.length} chars • ${lines} line${lines === 1 ? "" : "s"}`;
}

function createSharedTextRow(item) {
  const card = document.createElement("div");
  card.className = "file-card";

  const contentText = typeof item.content === "string" ? item.content : "";
  const titleText = deriveTextTitle(contentText, item.title);
  const compactSnippet = contentText.replace(/\s+/g, " ").trim();
  const safeTitle = escapeHtml(titleText);
  const safeSnippet = escapeHtml(compactSnippet);

  card.innerHTML = `
    <div class="file-meta-group">
      <div class="ext-badge txt">TXT</div>
      <div class="file-info">
        <span class="file-name" title="${safeTitle}">${safeTitle}</span>
        <div class="file-subtext">
          <span class="file-size-tag">${contentText.length} chars</span>
          <span class="file-path" title="${safeSnippet}">${safeSnippet}</span>
        </div>
      </div>
    </div>
    <div class="file-actions">
      <button class="action-btn" data-action="copy-text" title="Copy Text Content">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      </button>
      <button class="action-btn delete" data-action="remove-text" title="Remove from LocalShare">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  `;

  const copyBtn = card.querySelector('[data-action="copy-text"]');
  copyBtn.addEventListener("click", () => {
    clipboard.writeText(contentText);
    showToast(`Copied "${titleText}" to clipboard!`);
  });

  const removeBtn = card.querySelector('[data-action="remove-text"]');
  removeBtn.addEventListener("click", () => {
    currentState.sharedTexts = (currentState.sharedTexts || []).filter((t) => t.id !== item.id);
    renderFilesView();
    ipcRenderer.send("dashboard:remove-text", item.id);
    showToast(`Removed "${titleText}"`);
  });

  return card;
}

function renderFilesView() {
  const statFilesCount = document.getElementById("statFilesCount");
  const statTotalSize = document.getElementById("statTotalSize");
  const statPort = document.getElementById("statPort");
  const statIp = document.getElementById("statIp");
  const sentBadge = document.getElementById("sentBadge");
  const receivedBadge = document.getElementById("receivedBadge");
  const navFilesBadge = document.getElementById("navFilesBadge");
  const sentFilesList = document.getElementById("sentFilesList");
  const receivedFilesList = document.getElementById("receivedFilesList");
  const sentEmptyState = document.getElementById("sentEmptyState");
  const receivedEmptyState = document.getElementById("receivedEmptyState");
  const serverStatusText = document.getElementById("serverStatusText");
  const sidebarServerStatus = document.getElementById("sidebarServerStatus");
  const sidebarServerIp = document.getElementById("sidebarServerIp");

  const { sentFiles = [], sharedTexts = [], receivedFiles = [], serverInfo = {} } = currentState;

  if (statFilesCount) {
    statFilesCount.textContent = formatActiveSharedLabel(sentFiles.length, sharedTexts.length);
  }
  if (sentBadge) sentBadge.textContent = sentFiles.length + sharedTexts.length;
  if (receivedBadge) receivedBadge.textContent = receivedFiles.length;
  if (navFilesBadge) navFilesBadge.textContent = sentFiles.length + sharedTexts.length + receivedFiles.length;

  const ip = serverInfo.ip || "127.0.0.1";
  const port = serverInfo.port || 5199;

  if (statPort) statPort.textContent = port;
  if (statIp) statIp.textContent = ip;
  if (serverStatusText) {
    serverStatusText.textContent = `Online ${ip}:${port}`;
  }
  const serverPill = document.getElementById("serverPill");
  if (serverPill) {
    serverPill.title = `Click to copy: http://${ip}:${port}`;
  }
  if (sidebarServerStatus) {
    sidebarServerStatus.textContent = `Active`;
  }
  if (sidebarServerIp) {
    sidebarServerIp.textContent = `${ip}:${port}`;
  }

  // Calculate total size of shared files
  if (statTotalSize) {
    let totalBytes = 0;
    sentFiles.forEach((f) => {
      if (typeof f.bytes === "number") totalBytes += f.bytes;
    });
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    if (totalBytes === 0) {
      statTotalSize.textContent = "0 Bytes";
    } else {
      const i = Math.floor(Math.log(totalBytes) / Math.log(k));
      statTotalSize.textContent = parseFloat((totalBytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    }
  }

  if (sentFilesList && sentEmptyState) {
    renderFileList(sentFiles, sentFilesList, sentEmptyState, "send", sharedTexts);
  }
  if (receivedFilesList && receivedEmptyState) {
    renderFileList(receivedFiles, receivedFilesList, receivedEmptyState, "received", []);
  }
}

function renderFileList(files, listElement, emptyElement, tab, sharedTexts = []) {
  listElement.innerHTML = "";
  const safeFiles = Array.isArray(files) ? files : [];
  const safeTexts = tab === "send" && Array.isArray(sharedTexts) ? sharedTexts : [];

  if (safeFiles.length === 0 && safeTexts.length === 0) {
    emptyElement.style.display = "flex";
    listElement.style.display = "none";
    return;
  }

  emptyElement.style.display = "none";
  listElement.style.display = "flex";

  safeTexts.forEach((textItem) => {
    listElement.appendChild(createSharedTextRow(textItem));
  });

  safeFiles.forEach((file, index) => {
    const card = document.createElement("div");
    card.className = "file-card";

    const { cat, label } = getFileCategory(file.extension);

    card.innerHTML = `
      <div class="file-meta-group">
        <div class="ext-badge ${cat}">${label}</div>
        <div class="file-info">
          <span class="file-name" title="${file.name}">${file.name}</span>
          <div class="file-subtext">
            <span class="file-size-tag">${file.size || "Unknown"}</span>
            <span class="file-path" title="${file.path || ""}">${file.path || ""}</span>
          </div>
        </div>
      </div>
      <div class="file-actions">
        ${
          file.path
            ? `<button class="action-btn" data-action="folder" title="Show in File Explorer">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
              </button>`
            : ""
        }
        <button class="action-btn" data-action="copy" title="Copy Direct Download Link">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
          </svg>
        </button>
        <button class="action-btn delete" data-action="remove" title="Remove from LocalShare">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;

    const folderBtn = card.querySelector('[data-action="folder"]');
    if (folderBtn) {
      folderBtn.addEventListener("click", () => {
        ipcRenderer.send("dashboard:open-folder", file.path);
      });
    }

    const copyBtn = card.querySelector('[data-action="copy"]');
    copyBtn.addEventListener("click", () => {
      const server = currentState.serverInfo;
      const downloadUrl = `http://${server.ip}:${server.port}/download/${file.id}`;
      clipboard.writeText(downloadUrl);
      showToast("Download link copied to clipboard!");
    });

    const removeBtn = card.querySelector('[data-action="remove"]');
    removeBtn.addEventListener("click", () => {
      ipcRenderer.send("dashboard:remove-file", {
        path: file.path,
        id: file.id !== undefined ? file.id : index,
        tab,
      });
      showToast(`Removed "${file.name}"`);
    });

    listElement.appendChild(card);
  });
}

function initFiles() {
  const dropzone = document.getElementById("dropzone");
  const browseBtn = document.getElementById("browseBtn");
  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabPanes = document.querySelectorAll(".tab-pane");
  const removeAllBtn = document.getElementById("removeAllBtn");

  if (browseBtn) {
    browseBtn.addEventListener("click", () => {
      ipcRenderer.send("dashboard:add-files");
    });
  }

  if (dropzone) {
    ["dragenter", "dragover"].forEach((eventName) => {
      document.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add("dragover");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      document.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove("dragover");
      });
    });

    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove("dragover");

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        const paths = Array.from(files)
          .map((f) => f.path)
          .filter((p) => typeof p === "string" && p.length > 0);

        if (paths.length > 0) {
          ipcRenderer.send("dashboard:add-files", paths);
          showToast(`Sharing ${paths.length} dropped file${paths.length > 1 ? "s" : ""}...`);
        }
      }
    });
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetTab = btn.dataset.tab;
      setCurrentTab(targetTab);

      tabButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      tabPanes.forEach((pane) => {
        pane.classList.remove("active");
        if (pane.id === `pane-${targetTab}`) {
          pane.classList.add("active");
        }
      });
    });
  });

  const shareModeButtons = document.querySelectorAll(".share-mode-btn");
  const sharePaneFiles = document.getElementById("sharePaneFiles");
  const sharePaneText = document.getElementById("sharePaneText");
  const textShareTitle = document.getElementById("textShareTitle");
  const textShareInput = document.getElementById("textShareInput");
  const textShareCharCount = document.getElementById("textShareCharCount");
  const pasteTextShareBtn = document.getElementById("pasteTextShareBtn");
  const clearTextShareBtn = document.getElementById("clearTextShareBtn");
  const pushTextShareBtn = document.getElementById("pushTextShareBtn");

  shareModeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.shareMode;
      shareModeButtons.forEach((b) => {
        const isActive = b === btn;
        b.classList.toggle("active", isActive);
        b.setAttribute("aria-selected", isActive ? "true" : "false");
      });
      if (sharePaneFiles) sharePaneFiles.classList.toggle("active", mode === "files");
      if (sharePaneText) sharePaneText.classList.toggle("active", mode === "text");
      if (mode === "text" && textShareInput) {
        textShareInput.focus();
      }
    });
  });

  if (textShareInput && textShareCharCount) {
    textShareInput.addEventListener("input", () => {
      updateTextShareCounter(textShareInput, textShareCharCount);
    });
  }

  if (pasteTextShareBtn && textShareInput) {
    pasteTextShareBtn.addEventListener("click", () => {
      const clipText = clipboard.readText();
      if (!clipText) {
        showToast("PC clipboard has no text");
        return;
      }
      textShareInput.value = clipText;
      updateTextShareCounter(textShareInput, textShareCharCount);
      textShareInput.focus();
      showToast("Pasted from PC clipboard");
    });
  }

  if (clearTextShareBtn && textShareInput) {
    clearTextShareBtn.addEventListener("click", () => {
      if (textShareTitle) textShareTitle.value = "";
      textShareInput.value = "";
      updateTextShareCounter(textShareInput, textShareCharCount);
      textShareInput.focus();
    });
  }

  const handlePushText = () => {
    if (!textShareInput) return;
    const rawText = textShareInput.value;
    if (!rawText || !rawText.trim()) {
      showToast("Enter or paste text before pushing");
      textShareInput.focus();
      return;
    }

    const customTitle = textShareTitle && textShareTitle.value.trim() ? textShareTitle.value.trim() : "";
    const title = deriveTextTitle(rawText, customTitle);
    const newItem = {
      id: `text-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      content: rawText,
      createdAt: new Date().toISOString(),
    };

    currentState.sharedTexts = [newItem, ...(currentState.sharedTexts || [])];
    if (textShareTitle) textShareTitle.value = "";
    textShareInput.value = "";
    updateTextShareCounter(textShareInput, textShareCharCount);
    renderFilesView();
    ipcRenderer.send("dashboard:add-text", newItem);
    showToast(`Pushed "${title}" to web page!`);
  };

  if (pushTextShareBtn) {
    pushTextShareBtn.addEventListener("click", handlePushText);
  }

  if (textShareInput) {
    textShareInput.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handlePushText();
      }
    });
  }

  if (removeAllBtn) {
    removeAllBtn.addEventListener("click", () => {
      const currentTab = getCurrentTab();
      const textCount = currentTab === "send" ? (currentState.sharedTexts || []).length : 0;
      const fileCount =
        currentTab === "send"
          ? currentState.sentFiles.length
          : currentState.receivedFiles.length;

      if (fileCount === 0 && textCount === 0) {
        showToast("No items to remove");
        return;
      }

      if (currentTab === "send") {
        currentState.sharedTexts = [];
      }
      renderFilesView();
      ipcRenderer.send("dashboard:remove-all", currentTab);
      showToast(`Cleared all ${currentTab === "send" ? "shared" : "received"} items`);
    });
  }
}

module.exports = {
  renderFilesView,
  renderFileList,
  initFiles,
};
