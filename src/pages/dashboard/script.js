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
  devices: [],
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
    devices: [],
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
const navDevicesBadge = document.getElementById("navDevicesBadge");

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

// View: Your Devices
const statDevicesCount = document.getElementById("statDevicesCount");
const statDevicesOnline = document.getElementById("statDevicesOnline");
const statDevicesSubnet = document.getElementById("statDevicesSubnet");
const devicesList = document.getElementById("devicesList");
const devicesEmptyState = document.getElementById("devicesEmptyState");
const openAddDeviceModalBtn = document.getElementById("openAddDeviceModalBtn");
const emptyAddDeviceBtn = document.getElementById("emptyAddDeviceBtn");

// Modal: Add Device
const addDeviceModal = document.getElementById("addDeviceModal");
const closeAddDeviceModalBtn = document.getElementById("closeAddDeviceModalBtn");
const addDeviceForm = document.getElementById("addDeviceForm");
const deviceUrlInput = document.getElementById("deviceUrlInput");
const deviceNameInput = document.getElementById("deviceNameInput");
const regeneratePinBtn = document.getElementById("regeneratePinBtn");
const copyPinBtn = document.getElementById("copyPinBtn");
const pinDigit1 = document.getElementById("pinDigit1");
const pinDigit2 = document.getElementById("pinDigit2");
const pinDigit3 = document.getElementById("pinDigit3");
const pinDigit4 = document.getElementById("pinDigit4");
const pinDigit5 = document.getElementById("pinDigit5");
const pinDigit6 = document.getElementById("pinDigit6");
const pollingStatusCard = document.getElementById("pollingStatusCard");
const pollingStatusTitle = document.getElementById("pollingStatusTitle");
const pollingStatusSubtitle = document.getElementById("pollingStatusSubtitle");
const pollingAttemptChip = document.getElementById("pollingAttemptChip");
const pollingUrlChip = document.getElementById("pollingUrlChip");
const modalErrorAlert = document.getElementById("modalErrorAlert");
const modalErrorText = document.getElementById("modalErrorText");
const cancelPairingBtn = document.getElementById("cancelPairingBtn");
const startPairingBtn = document.getElementById("startPairingBtn");
const pairingBtnSpinner = document.getElementById("pairingBtnSpinner");
const startPairingBtnText = document.getElementById("startPairingBtnText");

// Modal: JSON Format Spec
const jsonFormatModal = document.getElementById("jsonFormatModal");
const closeJsonFormatModalBtn = document.getElementById("closeJsonFormatModalBtn");
const dismissJsonFormatModalBtn = document.getElementById("dismissJsonFormatModalBtn");
const devicesViewApiHelpBtn = document.getElementById("devicesViewApiHelpBtn");
const togglePairingApiHelpBtn = document.getElementById("togglePairingApiHelpBtn");
const inlineApiHelpBtn = document.getElementById("inlineApiHelpBtn");
const copySuccessJsonBtn = document.getElementById("copySuccessJsonBtn");
const copyPendingJsonBtn = document.getElementById("copyPendingJsonBtn");

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
  devices: "Your Devices",
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
  } else if (viewName === "devices") {
    renderDevicesList(currentState.devices || []);
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

  // Devices list
  renderDevicesList(currentState.devices || (config && config.devices) || []);

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

// ==========================
// Devices View & Pairing Logic
// ==========================

let currentPairingPin = "123456";
let pairingPollInterval = null;
let pairingPollAttempt = 0;
let isPairing = false;

function generatePairingPin() {
  const pinNum = Math.floor(100000 + Math.random() * 900000).toString();
  currentPairingPin = pinNum;

  if (pinDigit1) pinDigit1.textContent = pinNum[0];
  if (pinDigit2) pinDigit2.textContent = pinNum[1];
  if (pinDigit3) pinDigit3.textContent = pinNum[2];
  if (pinDigit4) pinDigit4.textContent = pinNum[3];
  if (pinDigit5) pinDigit5.textContent = pinNum[4];
  if (pinDigit6) pinDigit6.textContent = pinNum[5];

  return pinNum;
}

function openAddDeviceModal() {
  generatePairingPin();
  if (deviceUrlInput) {
    deviceUrlInput.value = "";
    deviceUrlInput.disabled = false;
  }
  if (deviceNameInput) {
    deviceNameInput.value = "";
    deviceNameInput.disabled = false;
  }
  if (modalErrorAlert) modalErrorAlert.style.display = "none";
  if (pollingStatusCard) pollingStatusCard.style.display = "none";
  if (startPairingBtn) startPairingBtn.disabled = false;
  if (pairingBtnSpinner) pairingBtnSpinner.style.display = "none";
  if (startPairingBtnText) startPairingBtnText.textContent = "Start Pairing";
  isPairing = false;

  if (pairingPollInterval) {
    clearInterval(pairingPollInterval);
    pairingPollInterval = null;
  }

  if (addDeviceModal) {
    addDeviceModal.style.display = "flex";
    setTimeout(() => {
      if (deviceUrlInput) deviceUrlInput.focus();
    }, 80);
  }
}

function closeAddDeviceModal() {
  if (pairingPollInterval) {
    clearInterval(pairingPollInterval);
    pairingPollInterval = null;
  }
  isPairing = false;
  if (addDeviceModal) addDeviceModal.style.display = "none";
}

async function startPairingWorkflow(rawUrl, customName) {
  let cleanUrl = rawUrl ? rawUrl.trim() : "";
  if (!cleanUrl) {
    if (modalErrorAlert) {
      modalErrorAlert.style.display = "flex";
      modalErrorText.textContent = "Please enter your device's server URL (e.g. 192.168.1.4:8000)";
    }
    return;
  }

  if (!/^https?:\/\//i.test(cleanUrl)) {
    cleanUrl = `http://${cleanUrl}`;
  }

  try {
    new URL(cleanUrl);
  } catch (e) {
    if (modalErrorAlert) {
      modalErrorAlert.style.display = "flex";
      modalErrorText.textContent = "Invalid URL format. Example: 192.168.1.4:8000";
    }
    return;
  }

  if (modalErrorAlert) modalErrorAlert.style.display = "none";
  isPairing = true;
  pairingPollAttempt = 0;

  if (deviceUrlInput) deviceUrlInput.disabled = true;
  if (deviceNameInput) deviceNameInput.disabled = true;
  if (startPairingBtn) startPairingBtn.disabled = true;
  if (pairingBtnSpinner) pairingBtnSpinner.style.display = "inline-block";
  if (startPairingBtnText) startPairingBtnText.textContent = "Pairing...";

  if (pollingStatusCard) {
    pollingStatusCard.style.display = "flex";
    pollingStatusTitle.textContent = "Connecting to device server...";
    pollingStatusSubtitle.textContent = `Waiting for 6-digit key (${currentPairingPin}) on phone...`;
    pollingAttemptChip.textContent = "Attempt #1";
    pollingUrlChip.textContent = cleanUrl.replace(/^https?:\/\//i, "");
  }

  async function pollStep() {
    if (!isPairing) return;
    pairingPollAttempt++;
    if (pollingAttemptChip) {
      pollingAttemptChip.textContent = `Attempt #${pairingPollAttempt}`;
    }

    try {
      const result = await ipcRenderer.invoke("devices:poll-check", {
        deviceUrl: cleanUrl,
        pairingKey: currentPairingPin,
      });

      if (result && result.connected) {
        if (pairingPollInterval) {
          clearInterval(pairingPollInterval);
          pairingPollInterval = null;
        }
        isPairing = false;

        const parsedUrl = new URL(cleanUrl);
        const autoName =
          result.deviceName ||
          customName ||
          `Phone (${parsedUrl.hostname})`;

        const newDevice = {
          id: Date.now().toString(),
          name: autoName,
          url: cleanUrl,
          ip: parsedUrl.hostname,
          port: parsedUrl.port || "80",
          key: currentPairingPin,
          status: "online",
          pairedAt: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
        };

        const saveRes = await ipcRenderer.invoke("devices:save", newDevice);
        if (saveRes && saveRes.success) {
          currentState.devices = saveRes.devices;
          renderDashboard();
        }

        showToast(`✓ "${autoName}" connected successfully!`);
        closeAddDeviceModal();
        return;
      }

      if (result && result.message && pollingStatusSubtitle) {
        pollingStatusSubtitle.textContent = result.message;
      }
    } catch (err) {
      if (pollingStatusSubtitle) {
        pollingStatusSubtitle.textContent = `Checking ${cleanUrl.replace(/^https?:\/\//i, "")}... (${err.message || "Connecting"})`;
      }
    }
  }

  await pollStep();
  if (isPairing) {
    pairingPollInterval = setInterval(pollStep, 1000);
  }
}

function renderDevicesList(devices) {
  const devList = devices || [];
  const count = devList.length;

  if (navDevicesBadge) navDevicesBadge.textContent = count;
  if (statDevicesCount) statDevicesCount.textContent = `${count} Device${count === 1 ? "" : "s"}`;

  let onlineCount = 0;
  devList.forEach((d) => {
    if (d.status === "online") onlineCount++;
  });
  if (statDevicesOnline) statDevicesOnline.textContent = `${onlineCount} Online`;

  if (statDevicesSubnet && currentState.serverInfo && currentState.serverInfo.ip) {
    const parts = currentState.serverInfo.ip.split(".");
    if (parts.length === 4) {
      statDevicesSubnet.textContent = `${parts[0]}.${parts[1]}.${parts[2]}.*`;
    }
  }

  if (!devicesList || !devicesEmptyState) return;

  if (count === 0) {
    devicesEmptyState.style.display = "flex";
    devicesList.style.display = "none";
    return;
  }

  devicesEmptyState.style.display = "none";
  devicesList.style.display = "grid";
  devicesList.innerHTML = "";

  devList.forEach((device) => {
    const card = document.createElement("div");
    card.className = "device-card";

    const isOnline = device.status === "online";
    const statusClass = isOnline ? "online" : "offline";
    const statusLabel = isOnline ? "Connected" : "Offline";

    card.innerHTML = `
      <div class="device-card-top">
        <div class="device-main-info">
          <div class="device-avatar">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
              <line x1="12" y1="18" x2="12.01" y2="18"></line>
            </svg>
          </div>
          <div class="device-name-wrap">
            <span class="device-title" title="${device.name}">${device.name}</span>
            <span class="device-type-label">Mobile Server</span>
          </div>
        </div>
        <span class="device-status-pill ${statusClass}" id="deviceStatus-${device.id}">
          <span class="status-dot"></span>
          <span>${statusLabel}</span>
        </span>
      </div>

      <div class="device-details-grid">
        <div class="device-detail-item">
          <span class="device-detail-label">Server URL</span>
          <a href="${device.url}" class="device-url-link" title="Open in browser">
            <span>${device.url.replace(/^https?:\/\//i, "")}</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
          </a>
        </div>
        <div class="device-detail-item">
          <span class="device-detail-label">Pairing Key</span>
          <span class="device-detail-value">${device.key || "------"}</span>
        </div>
        <div class="device-detail-item">
          <span class="device-detail-label">Paired On</span>
          <span class="device-detail-value" style="font-size: 0.72rem; color: var(--text-dim);">
            ${device.pairedAt ? new Date(device.pairedAt).toLocaleDateString() : "Recently"}
          </span>
        </div>
      </div>

      <div class="device-card-footer">
        <div class="device-card-actions">
          <button class="btn btn-sm btn-secondary" data-action="ping" data-id="${device.id}" title="Test HTTP connection to phone">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12.55a11 11 0 0 1 14.08 0"></path>
              <path d="M1.42 9a16 16 0 0 1 21.16 0"></path>
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
            </svg>
            <span>Test Ping</span>
          </button>
          <button class="btn btn-sm btn-secondary" data-action="browse" data-url="${device.url}" title="Open device URL in default browser">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
            </svg>
            <span>Open</span>
          </button>
          <button class="btn btn-sm btn-ghost danger" data-action="remove" data-id="${device.id}" data-name="${device.name}" title="Remove paired device">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            <span>Remove</span>
          </button>
        </div>
      </div>
    `;

    // Action listeners
    const pingBtn = card.querySelector('[data-action="ping"]');
    pingBtn.addEventListener("click", async () => {
      pingBtn.disabled = true;
      pingBtn.innerHTML = "<span>Pinging...</span>";
      const statusPill = document.getElementById(`deviceStatus-${device.id}`);
      if (statusPill) {
        statusPill.className = "device-status-pill checking";
        statusPill.innerHTML = '<span class="status-dot"></span><span>Checking...</span>';
      }

      try {
        const testRes = await ipcRenderer.invoke("devices:test-connection", device.url);
        if (testRes && testRes.online) {
          if (statusPill) {
            statusPill.className = "device-status-pill online";
            statusPill.innerHTML = '<span class="status-dot"></span><span>Connected</span>';
          }
          showToast(`✓ ${device.name} is reachable (${testRes.latencyMs}ms)`);
        } else {
          if (statusPill) {
            statusPill.className = "device-status-pill offline";
            statusPill.innerHTML = '<span class="status-dot"></span><span>Offline</span>';
          }
          showToast(`⚠️ ${device.name} is unreachable`);
        }
      } catch (err) {
        showToast(`Error pinging device: ${err.message}`);
      } finally {
        pingBtn.disabled = false;
        pingBtn.innerHTML = `
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12.55a11 11 0 0 1 14.08 0"></path>
            <path d="M1.42 9a16 16 0 0 1 21.16 0"></path>
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
          </svg>
          <span>Test Ping</span>
        `;
      }
    });

    const browseBtn = card.querySelector('[data-action="browse"]');
    browseBtn.addEventListener("click", (e) => {
      e.preventDefault();
      shell.openExternal(device.url);
    });

    const urlLink = card.querySelector(".device-url-link");
    urlLink.addEventListener("click", (e) => {
      e.preventDefault();
      shell.openExternal(device.url);
    });

    const removeBtn = card.querySelector('[data-action="remove"]');
    removeBtn.addEventListener("click", async () => {
      if (confirm(`Are you sure you want to remove "${device.name}"?`)) {
        const delRes = await ipcRenderer.invoke("devices:remove", device.id);
        if (delRes && delRes.success) {
          currentState.devices = delRes.devices;
          renderDashboard();
          showToast(`Removed "${device.name}"`);
        }
      }
    });

    devicesList.appendChild(card);
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
// Event Handlers: Devices & Modal
// ==========================

if (openAddDeviceModalBtn) {
  openAddDeviceModalBtn.addEventListener("click", openAddDeviceModal);
}

if (emptyAddDeviceBtn) {
  emptyAddDeviceBtn.addEventListener("click", openAddDeviceModal);
}

if (closeAddDeviceModalBtn) {
  closeAddDeviceModalBtn.addEventListener("click", closeAddDeviceModal);
}

if (cancelPairingBtn) {
  cancelPairingBtn.addEventListener("click", closeAddDeviceModal);
}

if (regeneratePinBtn) {
  regeneratePinBtn.addEventListener("click", () => {
    const pin = generatePairingPin();
    showToast(`Generated new pairing key: ${pin}`);
  });
}

if (copyPinBtn) {
  copyPinBtn.addEventListener("click", () => {
    clipboard.writeText(currentPairingPin);
    showToast(`Copied pairing key ${currentPairingPin} to clipboard!`);
  });
}

if (addDeviceForm) {
  addDeviceForm.addEventListener("submit", (e) => {
    e.preventDefault();
    startPairingWorkflow(deviceUrlInput.value, deviceNameInput.value);
  });
}

if (addDeviceModal) {
  addDeviceModal.addEventListener("click", (e) => {
    if (e.target === addDeviceModal) {
      closeAddDeviceModal();
    }
  });
}

// Modal: JSON Format Spec Handlers
function openJsonFormatModal() {
  if (jsonFormatModal) {
    jsonFormatModal.style.display = "flex";
  }
}

function closeJsonFormatModal() {
  if (jsonFormatModal) {
    jsonFormatModal.style.display = "none";
  }
}

if (devicesViewApiHelpBtn) {
  devicesViewApiHelpBtn.addEventListener("click", openJsonFormatModal);
}

if (togglePairingApiHelpBtn) {
  togglePairingApiHelpBtn.addEventListener("click", openJsonFormatModal);
}

if (inlineApiHelpBtn) {
  inlineApiHelpBtn.addEventListener("click", (e) => {
    e.preventDefault();
    openJsonFormatModal();
  });
}

if (closeJsonFormatModalBtn) {
  closeJsonFormatModalBtn.addEventListener("click", closeJsonFormatModal);
}

if (dismissJsonFormatModalBtn) {
  dismissJsonFormatModalBtn.addEventListener("click", closeJsonFormatModal);
}

if (jsonFormatModal) {
  jsonFormatModal.addEventListener("click", (e) => {
    if (e.target === jsonFormatModal) {
      closeJsonFormatModal();
    }
  });
}

if (copySuccessJsonBtn) {
  copySuccessJsonBtn.addEventListener("click", () => {
    const json = JSON.stringify({
      success: true,
      status: "connected",
      deviceName: "My Phone",
      message: "Device paired successfully"
    }, null, 2);
    clipboard.writeText(json);
    showToast("Copied Success JSON to clipboard!");
  });
}

if (copyPendingJsonBtn) {
  copyPendingJsonBtn.addEventListener("click", () => {
    const json = JSON.stringify({
      success: false,
      status: "pending",
      message: "Waiting for key entry on phone"
    }, null, 2);
    clipboard.writeText(json);
    showToast("Copied Pending JSON to clipboard!");
  });
}

// Global Escape Key to dismiss modals
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (jsonFormatModal && jsonFormatModal.style.display !== "none") {
      closeJsonFormatModal();
    } else if (addDeviceModal && addDeviceModal.style.display !== "none") {
      closeAddDeviceModal();
    }
  }
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
