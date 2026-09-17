/**
 * LocalShare Desktop Dashboard - Mirror Section Controller
 * Complete scrcpy Master Toolbox: Live Mirror, Stealth Mode, UHID Control, Screenshot to Clipboard,
 * MP4 Recording, HD Webcam, Battery Diagnostics, and Wireless ADB Pairing.
 */

const { ipcRenderer, shell } = require("electron");
const { currentState, showToast } = require("./state");

let isScanning = false;
let currentSelectedDevice = null;
let lastDetectedDevices = [];

// ADB Command Terminal History & State
let adbCommandHistory = [];
try {
  const saved = localStorage.getItem("localshare_adb_cmd_history");
  if (saved) adbCommandHistory = JSON.parse(saved);
} catch (e) {}
let historyIndex = -1;
let historyDraft = "";
let isExecutingAdbCmd = false;

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function saveAdbCommandHistory(cmd) {
  if (!cmd || !cmd.trim()) return;
  const trimmed = cmd.trim();
  // Don't duplicate if identical to last
  if (adbCommandHistory[adbCommandHistory.length - 1] !== trimmed) {
    adbCommandHistory.push(trimmed);
    if (adbCommandHistory.length > 50) adbCommandHistory.shift();
    try {
      localStorage.setItem("localshare_adb_cmd_history", JSON.stringify(adbCommandHistory));
    } catch (e) {}
  }
  historyIndex = -1;
  historyDraft = "";
}

/**
 * Check scrcpy & ADB binary status and update the compact inline status pill
 */
async function checkScrcpyStatus() {
  const pill = document.getElementById("mirrorEnginePill");
  const pillText = document.getElementById("mirrorEnginePillText");
  const warningBanner = document.getElementById("mirrorWarningBanner");
  const warningActions = document.getElementById("mirrorWarningActions");

  try {
    const status = await ipcRenderer.invoke("scrcpy:get-status");

    if (status && status.ready && status.adbReady) {
      if (pill) {
        pill.className = "mirror-engine-pill ready";
        pill.style.display = "inline-flex";
      }
      
      // Clean version string: e.g. "scrcpy 4.1"
      let ver = "v4.1";
      if (status.binaries?.scrcpy?.version) {
        const match = status.binaries.scrcpy.version.match(/scrcpy\s+([\d.]+)/i);
        if (match) ver = `v${match[1]}`;
      }

      if (pillText) {
        pillText.textContent = `scrcpy ${ver} • ${status.binaries.scrcpy.bundled ? "Bundled" : "System"}`;
      }
      if (warningBanner) warningBanner.style.display = "none";
    } else {
      if (pill) {
        pill.className = "mirror-engine-pill warning";
        pill.style.display = "inline-flex";
      }
      if (pillText) pillText.textContent = "Setup Required";

      if (warningBanner) {
        warningBanner.style.display = "flex";
        if (warningActions) {
          warningActions.innerHTML = `
            <button class="btn btn-secondary btn-sm" id="btnOpenScrcpyHelp">
              <span>Download scrcpy</span>
            </button>
          `;
          const btn = document.getElementById("btnOpenScrcpyHelp");
          if (btn) {
            btn.addEventListener("click", () => {
              shell.openExternal("https://github.com/genymobile/scrcpy/releases");
            });
          }
        }
      }
    }
  } catch (err) {
    console.error("Error checking scrcpy status:", err);
  }
}

/**
 * Retrieve current mirror options from UI inputs
 */
function getMirrorOptionsFromUI() {
  const maxSize = document.getElementById("mirrorMaxSizeSelect")?.value || "1080";
  const bitRate = document.getElementById("mirrorBitRateSelect")?.value || "8M";
  const maxFps = document.getElementById("mirrorMaxFpsSelect")?.value || "60";
  const turnScreenOff = document.getElementById("mirrorTurnScreenOffCheck")?.checked || false;
  const stayAwake = document.getElementById("mirrorStayAwakeCheck")?.checked ?? true;
  const alwaysOnTop = document.getElementById("mirrorAlwaysOnTopCheck")?.checked || false;
  const forwardAudio = document.getElementById("mirrorAudioCheck")?.checked ?? true;
  const record = document.getElementById("mirrorRecordCheck")?.checked || false;

  return {
    maxSize: Number(maxSize),
    bitRate,
    maxFps: Number(maxFps),
    turnScreenOff,
    stayAwake,
    alwaysOnTop,
    noAudio: !forwardAudio,
    record,
  };
}

/**
 * Update the Target Device selector dropdown in the ADB Terminal
 */
function updateAdbDeviceSelector(devices = []) {
  const select = document.getElementById("adbCmdDeviceSelect");
  const targetPill = document.getElementById("adbCmdTargetPill");
  if (!select) return;

  const previousVal = select.value;
  select.innerHTML = "";

  const autoOpt = document.createElement("option");
  autoOpt.value = "auto";
  autoOpt.textContent = devices.length > 0 
    ? `Auto (${devices[0].model || devices[0].serial})`
    : "Auto (First Connected)";
  select.appendChild(autoOpt);

  if (devices.length > 1) {
    const allOpt = document.createElement("option");
    allOpt.value = "all";
    allOpt.textContent = `All Connected Devices (${devices.length})`;
    select.appendChild(allOpt);
  }

  for (const d of devices) {
    const opt = document.createElement("option");
    opt.value = d.serial;
    const isConn = d.isWireless ? "Wi-Fi" : "USB";
    opt.textContent = `${d.model || "Device"} • ${d.serial} [${isConn}]`;
    select.appendChild(opt);
  }

  // Restore previous selection if valid
  const hasPrev = Array.from(select.options).some(o => o.value === previousVal);
  if (hasPrev) {
    select.value = previousVal;
  } else {
    select.value = "auto";
  }

  updateAdbTargetPill();
}

/**
 * Update the visual prompt tag in the input bar
 */
function updateAdbTargetPill() {
  const select = document.getElementById("adbCmdDeviceSelect");
  const targetPill = document.getElementById("adbCmdTargetPill");
  if (!select || !targetPill) return;

  const val = select.value;
  if (val === "auto") {
    if (lastDetectedDevices.length > 0) {
      targetPill.textContent = `-s ${lastDetectedDevices[0].serial}`;
      targetPill.title = `Targeting: ${lastDetectedDevices[0].model || "Device"} (${lastDetectedDevices[0].serial})`;
    } else {
      targetPill.textContent = `-s auto`;
      targetPill.title = "Auto-targeting first connected ADB device";
    }
  } else if (val === "all") {
    targetPill.textContent = `-s all (${lastDetectedDevices.length})`;
    targetPill.title = `Executing simultaneously on all ${lastDetectedDevices.length} devices`;
  } else {
    targetPill.textContent = `-s ${val}`;
    targetPill.title = `Targeting device ${val}`;
  }
}

/**
 * Select a specific device in the ADB Command Terminal and scroll to it
 */
function selectDeviceInTerminal(serial) {
  const select = document.getElementById("adbCmdDeviceSelect");
  const input = document.getElementById("adbCmdInput");
  const terminalSection = document.getElementById("adbTerminalSection");

  if (select) {
    select.value = serial;
    updateAdbTargetPill();
  }

  if (terminalSection) {
    terminalSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  if (input) {
    input.focus();
    input.select();
  }
  showToast(`🎯 ADB Terminal targeted to ${serial}`);
}

/**
 * Render ADB devices list with live Battery Diagnostics and quick actions
 */
async function renderAdbDevices(devices = []) {
  lastDetectedDevices = devices || [];
  const listEl = document.getElementById("adbDevicesList");
  const emptyEl = document.getElementById("adbEmptyState");
  const badgeEl = document.getElementById("adbOnlineBadge");

  // Update terminal device dropdown
  updateAdbDeviceSelector(lastDetectedDevices);

  if (!listEl || !emptyEl) return;

  const count = devices ? devices.length : 0;
  if (badgeEl) badgeEl.textContent = `${count} Device${count !== 1 ? "s" : ""}`;

  if (count > 0 && !currentSelectedDevice) {
    currentSelectedDevice = devices[0];
  } else if (count === 0) {
    currentSelectedDevice = null;
  }

  listEl.innerHTML = "";

  if (count === 0) {
    emptyEl.style.display = "flex";
    listEl.style.display = "none";
    return;
  }

  emptyEl.style.display = "none";
  listEl.style.display = "flex";

  for (const device of devices) {
    const card = document.createElement("div");
    card.className = `adb-device-card ${device.isMirroring ? "mirroring" : ""}`;

    const isReady = device.state === "device";
    const stateClass = isReady ? "ready" : device.state === "unauthorized" ? "unauthorized" : "offline";
    const stateText = isReady ? "Ready" : device.state === "unauthorized" ? "Needs Permission" : "Offline";

    card.innerHTML = `
      <div class="adb-device-header">
        <div class="adb-device-info">
          <div class="adb-device-avatar">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
              <line x1="12" y1="18" x2="12.01" y2="18"></line>
            </svg>
          </div>
          <div class="adb-device-names">
            <span class="adb-device-title">${device.model || "Android Device"}</span>
            <span class="adb-device-serial">${device.serial}</span>
          </div>
        </div>

        <div class="adb-badge-group">
          <span class="adb-conn-badge ${device.isWireless ? "wifi" : "usb"}">
            ${device.isWireless ? "Wi-Fi (TCP/IP)" : "USB"}
          </span>
          <span class="adb-state-pill ${stateClass}">
            <span class="status-dot"></span>
            <span>${stateText}</span>
          </span>
        </div>
      </div>

      <!-- Battery & Diagnostic Status Row -->
      <div class="adb-battery-row" id="batteryRow-${device.serial.replace(/[^a-zA-Z0-9]/g, '_')}">
        <div class="adb-battery-item">
          <span>🔋 Battery:</span>
          <span class="adb-battery-val" id="batLevel-${device.serial.replace(/[^a-zA-Z0-9]/g, '_')}">Reading...</span>
        </div>
        <div class="adb-battery-item">
          <span>⚡ Status:</span>
          <span class="adb-battery-val" id="batStatus-${device.serial.replace(/[^a-zA-Z0-9]/g, '_')}">-</span>
        </div>
        <div class="adb-battery-item">
          <span>🌡️ Temp:</span>
          <span class="adb-battery-val" id="batTemp-${device.serial.replace(/[^a-zA-Z0-9]/g, '_')}">-</span>
        </div>
      </div>

      <div class="adb-device-actions">
        <button class="btn btn-sm btn-secondary" data-action="open-terminal" data-serial="${device.serial}" title="Open ADB Command Terminal for this device">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="4 17 10 11 4 5"></polyline>
            <line x1="12" y1="19" x2="20" y2="19"></line>
          </svg>
          <span>Terminal</span>
        </button>

        <button class="btn btn-sm btn-secondary" data-action="screenshot" data-serial="${device.serial}" title="Take Screenshot to Downloads and Clipboard">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
          </svg>
          <span>Screenshot</span>
        </button>

        <button class="btn btn-sm btn-secondary" data-action="stealth" data-serial="${device.serial}" data-model="${device.model}" title="Mirror on PC with Phone Screen OFF">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          </svg>
          <span>Stealth</span>
        </button>

        ${
          !device.isWireless && isReady
            ? `<button class="btn btn-sm btn-secondary" data-action="switch-wifi" data-serial="${device.serial}" title="Switch to Wireless ADB mode (port 5555)">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M5 12.55a11 11 0 0 1 14.08 0"></path>
                </svg>
                <span>Wi-Fi Mode</span>
              </button>`
            : ""
        }

        ${
          device.isWireless
            ? `<button class="btn btn-sm btn-ghost danger" data-action="disconnect-wifi" data-target="${device.serial}" title="Disconnect wireless ADB">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
                <span>Disconnect</span>
              </button>`
            : ""
        }

        ${
          device.isMirroring
            ? `<button class="btn btn-sm btn-danger" data-action="stop-mirror" data-session="${device.sessionId}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="6" y="6" width="12" height="12"></rect>
                </svg>
                <span>Stop Mirror</span>
              </button>`
            : `<button class="btn btn-sm btn-primary" data-action="start-mirror" data-serial="${device.serial}" data-model="${device.model}" ${!isReady ? "disabled" : ""}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                <span>Live Mirror</span>
              </button>`
        }
      </div>
    `;

    // Attach Action listeners
    const terminalBtn = card.querySelector('[data-action="open-terminal"]');
    if (terminalBtn) {
      terminalBtn.addEventListener("click", () => selectDeviceInTerminal(device.serial));
    }

    const startBtn = card.querySelector('[data-action="start-mirror"]');
    if (startBtn) {
      startBtn.addEventListener("click", () => launchToolboxAction("live", device));
    }

    const stopBtn = card.querySelector('[data-action="stop-mirror"]');
    if (stopBtn) {
      stopBtn.addEventListener("click", () => stopMirroring(device.sessionId));
    }

    const stealthBtn = card.querySelector('[data-action="stealth"]');
    if (stealthBtn) {
      stealthBtn.addEventListener("click", () => launchToolboxAction("stealth", device));
    }

    const screenshotBtn = card.querySelector('[data-action="screenshot"]');
    if (screenshotBtn) {
      screenshotBtn.addEventListener("click", () => captureScreenshotAction(device.serial));
    }

    const wifiBtn = card.querySelector('[data-action="switch-wifi"]');
    if (wifiBtn) {
      wifiBtn.addEventListener("click", () => switchDeviceToWifi(device.serial));
    }

    const disconnectBtn = card.querySelector('[data-action="disconnect-wifi"]');
    if (disconnectBtn) {
      disconnectBtn.addEventListener("click", () => disconnectWirelessAdb(device.serial));
    }

    listEl.appendChild(card);

    // Fetch and populate battery info asynchronously
    if (isReady) {
      fetchDeviceBatteryInfo(device.serial);
    }
  }
}

/**
 * Fetch and display battery diagnostics on device card
 */
async function fetchDeviceBatteryInfo(serial) {
  try {
    const key = serial.replace(/[^a-zA-Z0-9]/g, "_");
    const res = await ipcRenderer.invoke("scrcpy:get-battery", serial);

    if (res && res.success && res.battery) {
      const { percent, isCharging, temperature, voltage, status } = res.battery;
      const levelEl = document.getElementById(`batLevel-${key}`);
      const statusEl = document.getElementById(`batStatus-${key}`);
      const tempEl = document.getElementById(`batTemp-${key}`);

      if (levelEl) levelEl.textContent = `${percent}% ${isCharging ? "⚡" : ""}`;
      if (statusEl) statusEl.textContent = status || (isCharging ? "Charging" : "Battery");
      if (tempEl) tempEl.textContent = `${temperature || "--"} (${voltage || "--"})`;
    }
  } catch (e) {
    console.debug("Battery info fetch skipped:", e.message);
  }
}

/**
 * Scan for connected ADB devices
 */
async function scanAdbDevices() {
  if (isScanning) return;
  isScanning = true;

  const refreshBtn = document.getElementById("mirrorRefreshDevicesBtn");
  if (refreshBtn) refreshBtn.classList.add("loading");

  try {
    const res = await ipcRenderer.invoke("scrcpy:list-devices");
    if (res && res.success) {
      renderAdbDevices(res.devices);
    } else {
      renderAdbDevices([]);
    }
  } catch (err) {
    console.error("Error scanning ADB devices:", err);
    renderAdbDevices([]);
  } finally {
    isScanning = false;
    if (refreshBtn) refreshBtn.classList.remove("loading");
  }
}

/**
 * Launch any tool action from the Master Toolbox (Live, Stealth, UHID, Screenshot, Record, Camera)
 */
async function launchToolboxAction(actionType, targetDevice = null) {
  const device = targetDevice || currentSelectedDevice || (lastDetectedDevices.length > 0 ? lastDetectedDevices[0] : null);

  if (actionType === "screenshot") {
    return captureScreenshotAction(device ? device.serial : null);
  }

  if (!device && lastDetectedDevices.length === 0) {
    showToast("⚠️ Please connect an Android device or connect via Wireless IP first.");
    const ipInput = document.getElementById("wirelessIpInput");
    if (ipInput) ipInput.focus();
    return;
  }

  const baseOptions = getMirrorOptionsFromUI();
  const options = {
    serial: device ? device.serial : null,
    model: device ? device.model : "Android Device",
    ...baseOptions,
    mode: actionType,
  };

  if (actionType === "uhid") {
    options.mode = "uhid_control";
    showToast(`🕹️ Launching UHID Keyboard & Mouse Control for ${device ? device.model : "device"}...`);
  } else if (actionType === "stealth") {
    options.mode = "stealth";
    showToast(`🕶️ Launching Stealth Mirror (Phone screen OFF)...`);
  } else if (actionType === "record") {
    options.mode = "record";
    showToast(`🎥 Starting Screen Mirroring with MP4 recording...`);
  } else if (actionType === "camera") {
    options.mode = "camera_webcam";
    showToast(`📷 Starting HD Camera Webcam mode...`);
  } else {
    options.mode = "live";
    showToast(`🚀 Launching Live Mirroring for ${device ? device.model : "device"}...`);
  }

  try {
    const res = await ipcRenderer.invoke("scrcpy:start-session", options);
    if (res && res.success) {
      showToast(`✓ scrcpy launched (${options.mode})`);
      if (res.recordPath) {
        showToast(`🎥 Recording to Downloads/LocalShare/Recordings`);
      }
      setTimeout(scanAdbDevices, 500);
    } else {
      showToast(`❌ Failed to start: ${res.error || "Unknown error"}`);
    }
  } catch (err) {
    showToast(`❌ Error: ${err.message}`);
  }
}

/**
 * Capture screenshot from phone, save to Downloads and copy to clipboard
 */
async function captureScreenshotAction(serial) {
  showToast("📸 Capturing screenshot from phone...");
  try {
    const res = await ipcRenderer.invoke("scrcpy:take-screenshot", serial);
    if (res && res.success) {
      showToast(`✓ Screenshot saved to Downloads & copied to clipboard! [Ctrl+V]`);
    } else {
      showToast(`❌ Screenshot capture failed: ${res.error || "Device not responding"}`);
    }
  } catch (err) {
    showToast(`❌ Screenshot Error: ${err.message}`);
  }
}

/**
 * Stop mirroring session
 */
async function stopMirroring(sessionId) {
  if (!sessionId) return;
  try {
    const res = await ipcRenderer.invoke("scrcpy:stop-session", sessionId);
    if (res && res.success) {
      showToast("Mirroring session stopped.");
      setTimeout(scanAdbDevices, 400);
    }
  } catch (err) {
    console.error("Error stopping mirror session:", err);
  }
}

/**
 * Switch USB device to TCP/IP wireless mode
 */
async function switchDeviceToWifi(serial) {
  showToast("Switching device to Wi-Fi mode (port 5555)...");
  try {
    const res = await ipcRenderer.invoke("scrcpy:enable-tcpip", { serial, port: 5555 });
    if (res && res.success) {
      showToast("✓ Switched to wireless mode. You can now connect via Wi-Fi IP!");
      scanAdbDevices();
    } else {
      showToast(`❌ Failed: ${res.error || "Could not switch to TCP/IP"}`);
    }
  } catch (err) {
    showToast(`❌ Error: ${err.message}`);
  }
}

/**
 * Connect to Wireless ADB IP
 */
async function connectWirelessAdb(ip, port = 5555) {
  const btn = document.getElementById("wirelessConnectBtn");
  if (btn) btn.disabled = true;

  showToast(`Connecting to ${ip}:${port}...`);
  try {
    const res = await ipcRenderer.invoke("scrcpy:connect-wireless", { ip, port });
    if (res && res.success) {
      showToast(`✓ Successfully connected to ${res.target}`);
      scanAdbDevices();
    } else {
      showToast(`❌ Connection failed: ${res.message || res.error || "Device unreachable"}`);
    }
  } catch (err) {
    showToast(`❌ Error: ${err.message}`);
  } finally {
    if (btn) btn.disabled = false;
  }
}

/**
 * Disconnect Wireless ADB
 */
async function disconnectWirelessAdb(target) {
  try {
    const res = await ipcRenderer.invoke("scrcpy:disconnect-wireless", target);
    if (res && res.success) {
      showToast(`Disconnected ${target}`);
      scanAdbDevices();
    }
  } catch (err) {
    showToast(`❌ Error: ${err.message}`);
  }
}

/**
 * Run custom ADB command typed by user or clicked from presets
 */
async function runAdbCustomCommand(cmdToRun = null) {
  if (isExecutingAdbCmd) return;

  const input = document.getElementById("adbCmdInput");
  const runBtn = document.getElementById("adbRunCmdBtn");
  const deviceSelect = document.getElementById("adbCmdDeviceSelect");
  const terminalScreen = document.getElementById("adbTerminalOutput");

  const rawCmd = (cmdToRun !== null ? cmdToRun : (input ? input.value : "")).trim();

  if (!rawCmd) {
    if (input) {
      input.focus();
      input.classList.add("input-error-shake");
      setTimeout(() => input.classList.remove("input-error-shake"), 500);
    }
    showToast("⚠️ Please enter an ADB command to run");
    return;
  }

  // Save to history & update input
  saveAdbCommandHistory(rawCmd);
  if (input) input.value = rawCmd;

  const selectedTarget = deviceSelect ? deviceSelect.value : "auto";
  let targetSerial = selectedTarget;
  if (selectedTarget === "auto") {
    targetSerial = lastDetectedDevices.length > 0 ? lastDetectedDevices[0].serial : undefined;
  }

  // Target label for prompt display
  let displayTarget = "";
  if (selectedTarget === "all") {
    displayTarget = `-s all (${lastDetectedDevices.length})`;
  } else if (targetSerial) {
    displayTarget = `-s ${targetSerial}`;
  }

  isExecutingAdbCmd = true;
  if (runBtn) {
    runBtn.disabled = true;
    runBtn.classList.add("loading");
    runBtn.innerHTML = `
      <span class="btn-spinner"></span>
      <span>Running...</span>
    `;
  }

  // Current timestamp formatted HH:MM:SS
  const now = new Date();
  const timeStr = now.toTimeString().split(" ")[0];

  // Clean prompt command display
  let cleanCmdDisplay = rawCmd;
  if (/^adb\s+/i.test(cleanCmdDisplay)) {
    cleanCmdDisplay = cleanCmdDisplay.replace(/^adb\s+/i, "");
  }

  // Create terminal entry block
  const block = document.createElement("div");
  block.className = "terminal-cmd-block running";
  block.innerHTML = `
    <div class="terminal-prompt-line">
      <span class="prompt-icon">➜</span>
      <span class="prompt-prefix">adb</span>
      ${displayTarget ? `<span class="prompt-target-tag">${escapeHtml(displayTarget)}</span>` : ""}
      <span class="prompt-cmd">${escapeHtml(cleanCmdDisplay)}</span>
      <span class="prompt-time">${timeStr}</span>
    </div>
    <div class="terminal-output-body pending">
      <div class="terminal-running-indicator">
        <span class="terminal-spinner"></span>
        <span>Executing ADB command...</span>
      </div>
    </div>
  `;

  if (terminalScreen) {
    terminalScreen.appendChild(block);
    terminalScreen.scrollTop = terminalScreen.scrollHeight;
  }

  try {
    const res = await ipcRenderer.invoke("scrcpy:exec-command", {
      serial: selectedTarget === "all" ? "all" : targetSerial,
      command: rawCmd,
    });

    block.classList.remove("running");
    const outputBody = block.querySelector(".terminal-output-body");

    if (res && res.isMultiDevice && Array.isArray(res.results)) {
      // Multi-device output rendering
      let multiHtml = "";
      for (const devRes of res.results) {
        const isDevOk = devRes.success;
        const text = devRes.stdout || devRes.stderr || devRes.error || "(No output)";
        multiHtml += `
          <div class="multi-device-subentry ${isDevOk ? 'sub-ok' : 'sub-err'}">
            <div class="multi-dev-header">
              <span class="multi-dev-badge">📱 ${escapeHtml(devRes.serial)}</span>
              <span class="multi-dev-status ${isDevOk ? 'ok' : 'err'}">${isDevOk ? 'exit 0' : 'err ' + (devRes.exitCode || 1)}</span>
              <span class="multi-dev-duration">${devRes.durationMs}ms</span>
            </div>
            <pre class="terminal-pre ${isDevOk ? 'text-success' : 'text-error'}">${escapeHtml(text)}</pre>
          </div>
        `;
      }

      if (outputBody) {
        outputBody.className = `terminal-output-body ${res.success ? 'success' : 'error'}`;
        outputBody.innerHTML = multiHtml;
      }

      // Add footer summary
      const footer = document.createElement("div");
      footer.className = "terminal-status-footer";
      footer.innerHTML = `
        <span class="status-code-pill ${res.success ? 'ok' : 'err'}">${res.success ? 'ALL OK' : 'PARTIAL / ERROR'}</span>
        <span class="status-duration">${res.results.reduce((acc, r) => acc + (r.durationMs || 0), 0)}ms total</span>
        <span class="status-device-tag">${res.results.length} Devices</span>
      `;
      block.appendChild(footer);

    } else if (res) {
      const isSuccess = Boolean(res.success);
      const outputText = isSuccess
        ? (res.stdout || res.stderr || "(Command completed with no output)")
        : (res.stderr || res.stdout || res.error || "Execution failed");

      if (outputBody) {
        outputBody.className = `terminal-output-body ${isSuccess ? 'success' : 'error'}`;
        outputBody.innerHTML = `<pre class="terminal-pre ${isSuccess ? 'text-success' : 'text-error'}">${escapeHtml(outputText)}</pre>`;
      }

      const footer = document.createElement("div");
      footer.className = "terminal-status-footer";
      footer.innerHTML = `
        <span class="status-code-pill ${isSuccess ? 'ok' : 'err'}">${isSuccess ? 'exit 0' : 'exit ' + (res.exitCode || 1)}</span>
        <span class="status-duration">${res.durationMs || 0}ms</span>
        <span class="status-device-tag">${escapeHtml(res.serial || targetSerial || "default")}</span>
      `;
      block.appendChild(footer);
    } else {
      if (outputBody) {
        outputBody.className = "terminal-output-body error";
        outputBody.innerHTML = `<pre class="terminal-pre text-error">No response from main process.</pre>`;
      }
    }

    if (terminalScreen) {
      terminalScreen.scrollTop = terminalScreen.scrollHeight;
    }

  } catch (err) {
    block.classList.remove("running");
    const outputBody = block.querySelector(".terminal-output-body");
    if (outputBody) {
      outputBody.className = "terminal-output-body error";
      outputBody.innerHTML = `<pre class="terminal-pre text-error">IPC Error: ${escapeHtml(err.message)}</pre>`;
    }
    showToast(`❌ Command failed: ${err.message}`);
  } finally {
    isExecutingAdbCmd = false;
    if (runBtn) {
      runBtn.disabled = false;
      runBtn.classList.remove("loading");
      runBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3" fill="currentColor"></polygon>
        </svg>
        <span>Run</span>
      `;
    }
  }
}

/**
 * Clear the ADB terminal output screen
 */
function clearTerminalOutput() {
  const terminalScreen = document.getElementById("adbTerminalOutput");
  if (terminalScreen) {
    terminalScreen.innerHTML = `
      <div class="terminal-welcome-line">
        <span class="term-dim">// Terminal output cleared.</span>
      </div>
    `;
    showToast("Terminal screen cleared");
  }
}

/**
 * Copy entire text content of the terminal output to clipboard
 */
function copyTerminalOutput() {
  const terminalScreen = document.getElementById("adbTerminalOutput");
  if (!terminalScreen) return;

  const rawText = terminalScreen.innerText || terminalScreen.textContent;
  if (!rawText || !rawText.trim()) {
    showToast("Terminal is empty");
    return;
  }

  navigator.clipboard.writeText(rawText).then(() => {
    showToast("📋 Terminal output copied to clipboard!");
  }).catch((err) => {
    console.error("Failed to copy clipboard:", err);
    showToast("❌ Could not copy to clipboard");
  });
}

/**
 * Initialize Mirror Module Events
 */
function initMirror() {
  const refreshBtn = document.getElementById("mirrorRefreshDevicesBtn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      checkScrcpyStatus();
      scanAdbDevices();
    });
  }

  const emptyScanBtn = document.getElementById("emptyScanBtn");
  if (emptyScanBtn) {
    emptyScanBtn.addEventListener("click", scanAdbDevices);
  }

  const setupHelpBtn = document.getElementById("mirrorSetupHelpBtn");
  if (setupHelpBtn) {
    setupHelpBtn.addEventListener("click", () => {
      shell.openExternal("https://github.com/genymobile/scrcpy#prerequisites");
    });
  }

  // Master Toolbox action buttons
  const toolButtons = document.querySelectorAll("[data-tool-action]");
  toolButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const action = btn.getAttribute("data-tool-action");
      launchToolboxAction(action);
    });
  });

  // Wireless connect form
  const wirelessForm = document.getElementById("wirelessConnectForm");
  if (wirelessForm) {
    wirelessForm.addEventListener("submit", (e) => {
      e.preventDefault();
      let ip = document.getElementById("wirelessIpInput")?.value.trim() || "";
      const port = document.getElementById("wirelessPortInput")?.value || 5555;

      if (!ip.startsWith("192.168.") && !ip.includes(".")) {
        ip = `192.168.${ip}`;
      }

      if (ip) {
        connectWirelessAdb(ip, port);
      }
    });
  }

  // ADB Command Form & Inputs
  const adbCmdForm = document.getElementById("adbCommandForm");
  const adbCmdInput = document.getElementById("adbCmdInput");
  const adbInputClearBtn = document.getElementById("adbInputClearBtn");
  const adbCmdDeviceSelect = document.getElementById("adbCmdDeviceSelect");
  const adbClearTerminalBtn = document.getElementById("adbClearTerminalBtn");
  const adbCopyTerminalBtn = document.getElementById("adbCopyTerminalBtn");

  if (adbCmdForm) {
    adbCmdForm.addEventListener("submit", (e) => {
      e.preventDefault();
      runAdbCustomCommand();
    });
  }

  if (adbCmdInput) {
    // Toggle clear button on input
    adbCmdInput.addEventListener("input", () => {
      if (adbInputClearBtn) {
        adbInputClearBtn.style.display = adbCmdInput.value ? "flex" : "none";
      }
    });

    // Arrow Up / Down command history navigation
    adbCmdInput.addEventListener("keydown", (e) => {
      if (e.key === "ArrowUp") {
        if (adbCommandHistory.length === 0) return;
        e.preventDefault();
        if (historyIndex === -1) {
          historyDraft = adbCmdInput.value;
          historyIndex = adbCommandHistory.length - 1;
        } else if (historyIndex > 0) {
          historyIndex--;
        }
        adbCmdInput.value = adbCommandHistory[historyIndex] || "";
        if (adbInputClearBtn) adbInputClearBtn.style.display = "flex";
      } else if (e.key === "ArrowDown") {
        if (historyIndex === -1) return;
        e.preventDefault();
        if (historyIndex < adbCommandHistory.length - 1) {
          historyIndex++;
          adbCmdInput.value = adbCommandHistory[historyIndex] || "";
        } else {
          historyIndex = -1;
          adbCmdInput.value = historyDraft;
        }
        if (adbInputClearBtn) {
          adbInputClearBtn.style.display = adbCmdInput.value ? "flex" : "none";
        }
      }
    });
  }

  if (adbInputClearBtn) {
    adbInputClearBtn.addEventListener("click", () => {
      if (adbCmdInput) {
        adbCmdInput.value = "";
        adbCmdInput.focus();
      }
      adbInputClearBtn.style.display = "none";
    });
  }

  if (adbCmdDeviceSelect) {
    adbCmdDeviceSelect.addEventListener("change", () => {
      updateAdbTargetPill();
    });
  }

  if (adbClearTerminalBtn) {
    adbClearTerminalBtn.addEventListener("click", clearTerminalOutput);
  }

  if (adbCopyTerminalBtn) {
    adbCopyTerminalBtn.addEventListener("click", copyTerminalOutput);
  }

  // Preset Chips
  const presetChips = document.querySelectorAll(".adb-chip[data-adb-cmd]");
  presetChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const cmd = chip.getAttribute("data-adb-cmd");
      if (cmd) {
        if (adbCmdInput) {
          adbCmdInput.value = cmd;
          if (adbInputClearBtn) adbInputClearBtn.style.display = "flex";
        }
        runAdbCustomCommand(cmd);
      }
    });
  });

  // Listen for session ended IPC events
  ipcRenderer.on("scrcpy:session-ended", (event, data) => {
    scanAdbDevices();
  });

  // Initial check and scan
  checkScrcpyStatus();
  scanAdbDevices();
}

module.exports = {
  checkScrcpyStatus,
  scanAdbDevices,
  renderAdbDevices,
  launchToolboxAction,
  captureScreenshotAction,
  runAdbCustomCommand,
  clearTerminalOutput,
  copyTerminalOutput,
  initMirror,
};
