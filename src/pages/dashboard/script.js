const { ipcRenderer, clipboard, shell } = require("electron");
const QRCode = require("qrcode");
const os = require("os");
const path = require("path");

// ==========================
// Application State
// ==========================
let currentState = {
  sentFiles: [],
  receivedFiles: [],
  serverInfo: {
    ip: "127.0.0.1",
    port: 5199,
    url: "http://localhost:5199",
    isRunning: true,
  },
  config: {
    autostart: true,
    openDashboardAtStart: true,
    notifications: true,
    port: 5199,
    theme: "dark",
  },
};

let currentTab = "send";
let currentView = "files";
let toastTimeout = null;

// ==========================
// DOM Elements
// ==========================

// Navigation
const navItems = document.querySelectorAll(".nav-item");
const viewPanels = document.querySelectorAll(".view-panel");
const viewTitle = document.getElementById("viewTitle");
const navFilesBadge = document.getElementById("navFilesBadge");

// Top Header
const serverPill = document.getElementById("serverPill");
const serverStatusText = document.getElementById("serverStatusText");
const pillCopyBtn = document.getElementById("pillCopyBtn");

// Sidebar
const sidebarServerCard = document.getElementById("sidebarServerCard");
const sidebarServerStatus = document.getElementById("sidebarServerStatus");
const sidebarServerIp = document.getElementById("sidebarServerIp");
const sidebarOpenBrowserBtn = document.getElementById("sidebarOpenBrowserBtn");

// View 1: Files & Sharing
const dropzone = document.getElementById("dropzone");
const browseBtn = document.getElementById("browseBtn");
const statFilesCount = document.getElementById("statFilesCount");
const statTotalSize = document.getElementById("statTotalSize");
const statPort = document.getElementById("statPort");
const statIp = document.getElementById("statIp");
const sentBadge = document.getElementById("sentBadge");
const receivedBadge = document.getElementById("receivedBadge");
const removeAllBtn = document.getElementById("removeAllBtn");
const sentFilesList = document.getElementById("sentFilesList");
const receivedFilesList = document.getElementById("receivedFilesList");
const sentEmptyState = document.getElementById("sentEmptyState");
const receivedEmptyState = document.getElementById("receivedEmptyState");
const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanes = document.querySelectorAll(".tab-pane");

// View 2: Connect & QR
const qrCodeImg = document.getElementById("qrCodeImg");
const connectUrlText = document.getElementById("connectUrlText");
const copyConnectUrlBtn = document.getElementById("copyConnectUrlBtn");

// View 3: API Explorer
const apiHostTokens = document.querySelectorAll(".api-host-token");

// View 4: Settings
const settingsForm = document.getElementById("settingsForm");
const setAutostart = document.getElementById("setAutostart");
const setOpenDashboard = document.getElementById("setOpenDashboard");
const setNotifications = document.getElementById("setNotifications");
const setPort = document.getElementById("setPort");
const setTheme = document.getElementById("setTheme");
const restartServerBtn = document.getElementById("restartServerBtn");
const openReceivedFolderBtn = document.getElementById("openReceivedFolderBtn");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");
const openLogsBtn = document.getElementById("openLogsBtn");

// View 5: About
const aboutRuntime = document.getElementById("aboutRuntime");
const aboutPlatform = document.getElementById("aboutPlatform");

// Toast
const toast = document.getElementById("toast");
const toastMessage = document.getElementById("toastMessage");

// ==========================
// Helpers
// ==========================

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function getFileCategory(ext) {
  if (!ext) return { cat: "file", label: "FILE" };
  const e = ext.toLowerCase();

  if (e === "pdf") return { cat: "pdf", label: "PDF" };
  if (["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp", "ico"].includes(e)) {
    return { cat: "img", label: e.toUpperCase() };
  }
  if (["mp4", "mkv", "mov", "avi", "webm", "wmv"].includes(e)) {
    return { cat: "video", label: e.toUpperCase() };
  }
  if (["mp3", "wav", "flac", "m4a", "aac", "ogg"].includes(e)) {
    return { cat: "audio", label: e.toUpperCase() };
  }
  if (["zip", "rar", "7z", "tar", "gz", "bz2"].includes(e)) {
    return { cat: "zip", label: e.toUpperCase() };
  }
  if (
    ["js", "ts", "py", "html", "css", "json", "cpp", "java", "c", "rs", "go"].includes(e)
  ) {
    return { cat: "code", label: e.toUpperCase() };
  }
  if (["doc", "docx", "txt", "md", "rtf", "csv", "xlsx", "xls", "pptx"].includes(e)) {
    return { cat: "doc", label: e.toUpperCase() };
  }
  return { cat: "file", label: e.slice(0, 4).toUpperCase() };
}

function showToast(message) {
  if (toastTimeout) clearTimeout(toastTimeout);
  toastMessage.textContent = message;
  toast.classList.add("show");
  toastTimeout = setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}

function applyTheme(themeName) {
  if (themeName === "light") {
    document.body.setAttribute("data-theme", "light");
  } else if (themeName === "system") {
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
      document.body.setAttribute("data-theme", "light");
    } else {
      document.body.removeAttribute("data-theme");
    }
  } else {
    document.body.removeAttribute("data-theme");
  }
}

// ==========================
// Sidebar View Switching
// ==========================

const VIEW_TITLES = {
  files: "Files & Sharing",
  connect: "Connect & QR Code",
  api: "API Explorer",
  settings: "Application Settings",
  about: "About LocalShare",
};

function switchView(viewName) {
  if (!VIEW_TITLES[viewName]) viewName = "files";
  currentView = viewName;

  navItems.forEach((btn) => {
    if (btn.dataset.view === viewName) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  viewPanels.forEach((panel) => {
    if (panel.id === `view-${viewName}`) {
      panel.classList.add("active");
    } else {
      panel.classList.remove("active");
    }
  });

  viewTitle.textContent = VIEW_TITLES[viewName];

  // Specific view hooks
  if (viewName === "connect") {
    generateQRCode();
  }
}

navItems.forEach((btn) => {
  btn.addEventListener("click", () => {
    switchView(btn.dataset.view);
  });
});

// ==========================
// QR Code Generator
// ==========================

function generateQRCode() {
  const { serverInfo } = currentState;
  const url = `http://${serverInfo.ip}:${serverInfo.port}`;
  connectUrlText.textContent = url;

  QRCode.toDataURL(url, { width: 220, margin: 1 }, (err, dataUrl) => {
    if (!err && dataUrl) {
      qrCodeImg.src = dataUrl;
    }
  });
}

copyConnectUrlBtn.addEventListener("click", () => {
  const { serverInfo } = currentState;
  const url = `http://${serverInfo.ip}:${serverInfo.port}`;
  clipboard.writeText(url);
  showToast("Connection URL copied to clipboard!");
});

// ==========================
// Render Views
// ==========================

function renderDashboard() {
  const { sentFiles, receivedFiles, serverInfo, config } = currentState;

  // Header and Sidebar server indicators
  const hostString = `${serverInfo.ip}:${serverInfo.port}`;
  serverStatusText.textContent = hostString;
  sidebarServerStatus.textContent = `Active :${serverInfo.port}`;
  sidebarServerIp.textContent = serverInfo.ip;

  // Stats
  const sentCount = sentFiles ? sentFiles.length : 0;
  statFilesCount.textContent = `${sentCount} File${sentCount === 1 ? "" : "s"}`;
  navFilesBadge.textContent = sentCount;

  let totalBytes = 0;
  if (sentFiles && sentFiles.length > 0) {
    sentFiles.forEach((f) => {
      totalBytes += f.sizeBytes || 0;
    });
  }
  statTotalSize.textContent = formatBytes(totalBytes);
  statPort.textContent = serverInfo.port || 5199;
  statIp.textContent = serverInfo.ip || "127.0.0.1";

  // Badges
  sentBadge.textContent = sentCount;
  const receivedCount = receivedFiles ? receivedFiles.length : 0;
  receivedBadge.textContent = receivedCount;

  // Files lists
  renderFileList(sentFiles || [], sentFilesList, sentEmptyState, "send");
  renderFileList(receivedFiles || [], receivedFilesList, receivedEmptyState, "received");

  // API Tokens
  apiHostTokens.forEach((token) => {
    token.textContent = hostString;
  });

  // Settings form population
  if (config) {
    setAutostart.checked = config.autostart !== false;
    setOpenDashboard.checked = config.openDashboardAtStart !== false;
    setNotifications.checked = config.notifications !== false;
    setPort.value = config.port || 5199;
    setTheme.value = config.theme || "dark";
    applyTheme(config.theme);
  }

  // QR code if currently in connect view
  if (currentView === "connect") {
    generateQRCode();
  }
}

function renderFileList(files, listElement, emptyElement, tab) {
  listElement.innerHTML = "";

  if (!files || files.length === 0) {
    emptyElement.style.display = "flex";
    listElement.style.display = "none";
    return;
  }

  emptyElement.style.display = "none";
  listElement.style.display = "flex";

  files.forEach((file, index) => {
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

function copyServerUrl() {
  const { serverInfo } = currentState;
  const url = `http://${serverInfo.ip}:${serverInfo.port}`;
  clipboard.writeText(url);
  showToast("Server URL copied to clipboard!");
}

// ==========================
// Event Handlers: Files View
// ==========================

serverPill.addEventListener("click", copyServerUrl);
pillCopyBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  copyServerUrl();
});
sidebarServerCard.addEventListener("click", copyServerUrl);

sidebarOpenBrowserBtn.addEventListener("click", () => {
  ipcRenderer.send("dashboard:open-browser");
});

browseBtn.addEventListener("click", () => {
  ipcRenderer.send("dashboard:add-files");
});

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

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const targetTab = btn.dataset.tab;
    currentTab = targetTab;

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

removeAllBtn.addEventListener("click", () => {
  const count =
    currentTab === "send"
      ? currentState.sentFiles.length
      : currentState.receivedFiles.length;

  if (count === 0) {
    showToast("No files to remove");
    return;
  }

  ipcRenderer.send("dashboard:remove-all", currentTab);
  showToast(`Cleared all ${currentTab === "send" ? "shared" : "received"} files`);
});

// ==========================
// Event Handlers: Settings View
// ==========================

setPort.addEventListener("input", () => {
  const newPort = parseInt(setPort.value, 10);
  if (newPort && newPort !== (currentState.config ? currentState.config.port : 5199)) {
    restartServerBtn.style.display = "inline-block";
  } else {
    restartServerBtn.style.display = "none";
  }
});

setTheme.addEventListener("change", () => {
  applyTheme(setTheme.value);
});

settingsForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const newPort = parseInt(setPort.value, 10);
  if (isNaN(newPort) || newPort < 1024 || newPort > 65535) {
    showToast("Port must be between 1024 and 65535");
    return;
  }

  const updatedSettings = {
    autostart: setAutostart.checked,
    openDashboardAtStart: setOpenDashboard.checked,
    notifications: setNotifications.checked,
    port: newPort,
    theme: setTheme.value,
  };

  ipcRenderer.send("settings:save", updatedSettings);
  showToast("Settings saved successfully!");
});

restartServerBtn.addEventListener("click", () => {
  showToast("Restarting server on new port...");
  ipcRenderer.send("server:restart");
  restartServerBtn.style.display = "none";
});

openReceivedFolderBtn.addEventListener("click", () => {
  const receivedDir = path.join(os.homedir(), "Downloads", "LocalShare");
  ipcRenderer.send("dashboard:open-folder", receivedDir);
});

clearHistoryBtn.addEventListener("click", () => {
  if (confirm("Are you sure you want to clear your transfer history?")) {
    ipcRenderer.send("dashboard:clear-history");
    showToast("Transfer history cleared!");
  }
});

openLogsBtn.addEventListener("click", () => {
  ipcRenderer.send("logs:open");
});

// ==========================
// About View Population
// ==========================

function populateAboutView() {
  aboutRuntime.textContent = `Electron ${process.versions.electron} & Node.js ${process.version}`;
  aboutPlatform.textContent = `${os.type()} ${os.release()} (${os.arch()})`;
}

// ==========================
// IPC Listeners
// ==========================

ipcRenderer.on("dashboard:switch-tab", (event, tab) => {
  switchView(tab);
});

ipcRenderer.on("dashboard:state-updated", (event, state) => {
  if (state) {
    currentState = { ...currentState, ...state };
    renderDashboard();
  }
});

ipcRenderer.on("dashboard:clipboard-received", (event, data) => {
  showToast(`📋 Copied to clipboard: "${data.preview}"`);
});

// Legacy backward compatibility
ipcRenderer.on("file-lists", (event, { sentFiles, receivedFiles }) => {
  if (sentFiles) currentState.sentFiles = sentFiles;
  if (receivedFiles) currentState.receivedFiles = receivedFiles;
  renderDashboard();
});

// Initial boot
document.addEventListener("DOMContentLoaded", () => {
  populateAboutView();
  ipcRenderer.send("dashboard:get-state");
});
