const { ipcRenderer, clipboard } = require("electron");
const { currentState, showToast } = require("./state");
const { escapeHtml, sanitizeHttpUrl } = require("./devices");

let currentPairingPin = "123456";
let pairingPollInterval = null;
let pairingPollAttempt = 0;
let isPairing = false;
let onDeviceAddedCallback = null;
let activeConfirmSession = null;
let lastScanCandidates = [];
let scanInProgress = false;
let activeWriteTextTarget = null;
let isWritingText = false;

function setOnDeviceAdded(callback) {
  onDeviceAddedCallback = callback;
}

function generatePairingPin() {
  const pinNum = Math.floor(100000 + Math.random() * 900000).toString();
  currentPairingPin = pinNum;

  const pinDigit1 = document.getElementById("pinDigit1");
  const pinDigit2 = document.getElementById("pinDigit2");
  const pinDigit3 = document.getElementById("pinDigit3");
  const pinDigit4 = document.getElementById("pinDigit4");
  const pinDigit5 = document.getElementById("pinDigit5");
  const pinDigit6 = document.getElementById("pinDigit6");

  if (pinDigit1) pinDigit1.textContent = pinNum[0];
  if (pinDigit2) pinDigit2.textContent = pinNum[1];
  if (pinDigit3) pinDigit3.textContent = pinNum[2];
  if (pinDigit4) pinDigit4.textContent = pinNum[3];
  if (pinDigit5) pinDigit5.textContent = pinNum[4];
  if (pinDigit6) pinDigit6.textContent = pinNum[5];

  return pinNum;
}

function getSubnetHintAddresses() {
  const ip = currentState?.serverInfo?.ip;
  if (typeof ip === "string") {
    const parts = ip.split(".");
    if (parts.length === 4) {
      const prefix = `${parts[0]}.${parts[1]}.${parts[2]}`;
      return {
        placeholder: `${prefix}.10:8000`,
        hintText: `${prefix}.x:8000`,
      };
    }
  }
  return {
    placeholder: "192.168.1.10:8000",
    hintText: "192.168.1.x:8000",
  };
}

function showDiscoverView() {
  const discoverView = document.getElementById("discoverDevicesView");
  const confirmView = document.getElementById("confirmPhoneView");
  if (discoverView) discoverView.style.display = "block";
  if (confirmView) confirmView.style.display = "none";
}

function showConfirmView() {
  const discoverView = document.getElementById("discoverDevicesView");
  const confirmView = document.getElementById("confirmPhoneView");
  if (discoverView) discoverView.style.display = "none";
  if (confirmView) confirmView.style.display = "flex";
}

function setManualExpanded(expanded) {
  const form = document.getElementById("addDeviceForm");
  const toggleBtn = document.getElementById("toggleManualEntryBtn");
  if (form) form.style.display = expanded ? "flex" : "none";
  if (toggleBtn) toggleBtn.setAttribute("aria-expanded", expanded ? "true" : "false");
}

function renderScanCandidates(candidates = []) {
  const listEl = document.getElementById("scanCandidatesList");
  if (!listEl) return;

  lastScanCandidates = Array.isArray(candidates) ? candidates : [];
  listEl.innerHTML = "";

  if (lastScanCandidates.length === 0) {
    const empty = document.createElement("div");
    empty.className = "scan-empty-hint";
    empty.textContent =
      "No phones answered /alive on this LAN. Ensure Tasker HTTP server is listening on port 8000 (office guest Wi-Fi may block device-to-device traffic), or add manually below.";
    listEl.appendChild(empty);
    return;
  }

  lastScanCandidates.forEach((cand) => {
    const row = document.createElement("div");
    row.className = "scan-candidate-row";

    const title = escapeHtml(cand.model || `Phone (${cand.ip})`);
    const addr = escapeHtml(`${cand.ip}:${cand.port || 8000}`);
    const batBadge =
      typeof cand.battery === "number"
        ? `<span class="scan-badge">Battery ${escapeHtml(cand.battery)}%</span>`
        : "";
    const modeBadge = cand.mode
      ? `<span class="scan-badge">${escapeHtml(cand.mode)}</span>`
      : "";
    const latBadge =
      typeof cand.latencyMs === "number"
        ? `<span class="scan-badge">${escapeHtml(Math.round(cand.latencyMs))} ms</span>`
        : "";
    const pairedBadge = cand.alreadyPaired
      ? `<span class="scan-badge paired">Already paired</span>`
      : "";

    row.innerHTML = `
      <div class="scan-candidate-meta">
        <span class="scan-candidate-title">${title}</span>
        <span class="scan-candidate-sub">${addr}</span>
        <div class="scan-candidate-badges">${batBadge}${modeBadge}${latBadge}${pairedBadge}</div>
      </div>
      <button type="button" class="btn btn-sm btn-primary" data-action="pair-candidate">
        ${cand.alreadyPaired ? "Re-pair" : "Connect"}
      </button>
    `;

    const btn = row.querySelector('[data-action="pair-candidate"]');
    if (btn) {
      btn.addEventListener("click", () => {
        const nameInput = document.getElementById("deviceNameInput");
        const customName = nameInput ? nameInput.value.trim() : "";
        startConfirmPairingSession({
          ip: cand.ip,
          port: cand.port || 8000,
          model: cand.model || null,
          customName,
        });
      });
    }

    listEl.appendChild(row);
  });
}

async function runModalScan() {
  if (scanInProgress) return;
  const listEl = document.getElementById("scanCandidatesList");
  const subnetEl = document.getElementById("scanSubnetLabel");
  const scanBtn = document.getElementById("rescanPhonesBtn");
  const scanBtnText = document.getElementById("rescanPhonesBtnText");

  scanInProgress = true;
  if (scanBtn) scanBtn.disabled = true;
  if (scanBtnText) scanBtnText.textContent = "Scanning...";
  if (subnetEl) {
    const netLabel = currentState?.serverInfo?.cidr || currentState?.serverInfo?.ip || "local subnet";
    subnetEl.textContent = `Scanning ${netLabel} (:8000/alive)...`;
  }
  if (listEl) {
    listEl.innerHTML = '<div class="scan-empty-hint">Searching local network for phones...</div>';
  }

  try {
    const res = await ipcRenderer.invoke("devices:scan", {});
    if (subnetEl) {
      if (res?.lan?.cidr) {
        subnetEl.textContent = `Subnet ${res.lan.cidr} • scanned ${res.scanned || 0} hosts (${res.tookMs || 0}ms)`;
      } else {
        subnetEl.textContent = "No active private LAN interface detected";
      }
    }
    renderScanCandidates(res?.candidates || []);
  } catch (err) {
    if (subnetEl) subnetEl.textContent = "Network scan error";
    if (listEl) {
      listEl.innerHTML = "";
      const errDiv = document.createElement("div");
      errDiv.className = "scan-empty-hint";
      errDiv.textContent = `Scan failed: ${err.message}`;
      listEl.appendChild(errDiv);
    }
  } finally {
    scanInProgress = false;
    if (scanBtn) scanBtn.disabled = false;
    if (scanBtnText) scanBtnText.textContent = "Scan Network";
  }
}

async function cancelActiveConfirmSession() {
  const session = activeConfirmSession;
  activeConfirmSession = null;
  if (session && session.attemptId) {
    try {
      await ipcRenderer.invoke("devices:pair-cancel", {
        attemptId: session.attemptId,
      });
    } catch {
      // Ignore cancel cleanup errors
    }
  }
}

async function startConfirmPairingSession({ ip, port = 8000, model = null, customName = "" }) {
  await cancelActiveConfirmSession();

  const titleEl = document.getElementById("confirmPhoneTitle");
  const subEl = document.getElementById("confirmPhoneSubtitle");
  const codeEl = document.getElementById("confirmCodeDigits");
  const targetEl = document.getElementById("confirmPhoneTarget");
  const statusEl = document.getElementById("confirmPhoneStatusText");
  const errBox = document.getElementById("confirmPhoneErrorAlert");
  const retryBtn = document.getElementById("retryConfirmPairingBtn");

  if (titleEl) titleEl.textContent = "Confirm on your phone";
  if (subEl) subEl.textContent = "Check that this 6-digit code matches the notification on your phone, then tap Connect.";
  if (targetEl) targetEl.textContent = `${model || "Phone"} (${ip}:${port})`;
  if (statusEl) statusEl.textContent = "Sending pairing request...";
  if (errBox) errBox.style.display = "none";
  if (retryBtn) retryBtn.style.display = "none";

  showConfirmView();

  try {
    const startRes = await ipcRenderer.invoke("devices:pair-start", {
      ip,
      port,
      model,
      customName,
    });
    activeConfirmSession = {
      attemptId: startRes.attemptId,
      code: startRes.code,
      ip,
      port,
      model,
      customName,
    };
    if (codeEl) codeEl.textContent = startRes.code || "------";
  } catch (err) {
    if (errBox) {
      errBox.style.display = "flex";
      const errText = document.getElementById("confirmPhoneErrorText");
      if (errText) errText.textContent = err.message || "Could not start pairing";
    }
    if (retryBtn) retryBtn.style.display = "inline-flex";
  }
}

function handlePairProgress(progress) {
  if (!progress || !activeConfirmSession || progress.attemptId !== activeConfirmSession.attemptId) {
    return;
  }

  const titleEl = document.getElementById("confirmPhoneTitle");
  const statusEl = document.getElementById("confirmPhoneStatusText");
  const errBox = document.getElementById("confirmPhoneErrorAlert");
  const errText = document.getElementById("confirmPhoneErrorText");
  const retryBtn = document.getElementById("retryConfirmPairingBtn");

  if (progress.status === "pending") {
    if (statusEl) statusEl.textContent = progress.message || "Waiting for confirmation on phone...";
    return;
  }

  if (progress.status === "accepted") {
    const pairedName = progress.device?.name || activeConfirmSession.model || "Device";
    activeConfirmSession = null;
    if (onDeviceAddedCallback) {
      onDeviceAddedCallback(currentState.devices || []);
    }
    showToast(`✓ "${pairedName}" connected successfully!`);
    closeAddDeviceModal();
    return;
  }

  // Final failure states: denied / timeout / error
  const lastParams = { ...activeConfirmSession };
  activeConfirmSession = null;
  activeConfirmSession = {
    ip: lastParams.ip,
    port: lastParams.port,
    model: lastParams.model,
    customName: lastParams.customName,
    attemptId: null,
  };

  if (titleEl) {
    titleEl.textContent =
      progress.status === "denied"
        ? "Denied on phone"
        : progress.status === "timeout"
          ? "No response from phone"
          : "Pairing failed";
  }
  if (statusEl) statusEl.textContent = "Pairing stopped.";
  if (errBox) errBox.style.display = "flex";
  if (errText) {
    errText.textContent =
      progress.message ||
      (progress.status === "denied"
        ? "Pairing was cancelled on your phone."
        : "No confirmation received from phone.");
  }
  if (retryBtn) retryBtn.style.display = "inline-flex";
}

function resetManualFormUi() {
  const deviceUrlInput = document.getElementById("deviceUrlInput");
  const deviceNameInput = document.getElementById("deviceNameInput");
  const modalErrorAlert = document.getElementById("modalErrorAlert");
  const pollingStatusCard = document.getElementById("pollingStatusCard");
  const startPairingBtn = document.getElementById("startPairingBtn");
  const pairingBtnSpinner = document.getElementById("pairingBtnSpinner");
  const startPairingBtnText = document.getElementById("startPairingBtnText");
  const manualUrlHint = document.getElementById("manualUrlHint");

  const { placeholder, hintText } = getSubnetHintAddresses();

  generatePairingPin();
  if (deviceUrlInput) {
    deviceUrlInput.value = "";
    deviceUrlInput.disabled = false;
    deviceUrlInput.placeholder = placeholder;
  }
  if (manualUrlHint) {
    manualUrlHint.textContent = `Enter your phone's local IP and port (e.g. ${hintText})`;
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
}

function stopManualPollLoop() {
  if (pairingPollInterval) {
    clearTimeout(pairingPollInterval);
    clearInterval(pairingPollInterval);
    pairingPollInterval = null;
  }
  isPairing = false;
}

function openAddDeviceModal() {
  const addDeviceModal = document.getElementById("addDeviceModal");
  stopManualPollLoop();
  cancelActiveConfirmSession();
  resetManualFormUi();
  showDiscoverView();
  setManualExpanded(false);

  if (addDeviceModal) {
    addDeviceModal.style.display = "flex";
    runModalScan();
  }
}

function closeAddDeviceModal() {
  const addDeviceModal = document.getElementById("addDeviceModal");
  stopManualPollLoop();
  cancelActiveConfirmSession();
  if (addDeviceModal) addDeviceModal.style.display = "none";
}

function openJsonFormatModal() {
  const jsonFormatModal = document.getElementById("jsonFormatModal");
  if (jsonFormatModal) {
    jsonFormatModal.style.display = "flex";
  }
}

function closeJsonFormatModal() {
  const jsonFormatModal = document.getElementById("jsonFormatModal");
  if (jsonFormatModal) {
    jsonFormatModal.style.display = "none";
  }
}

async function startPairingWorkflow(rawUrl, customName) {
  const modalErrorAlert = document.getElementById("modalErrorAlert");
  const modalErrorText = document.getElementById("modalErrorText");
  const deviceUrlInput = document.getElementById("deviceUrlInput");
  const deviceNameInput = document.getElementById("deviceNameInput");
  const startPairingBtn = document.getElementById("startPairingBtn");
  const pairingBtnSpinner = document.getElementById("pairingBtnSpinner");
  const startPairingBtnText = document.getElementById("startPairingBtnText");
  const pollingStatusCard = document.getElementById("pollingStatusCard");
  const pollingStatusTitle = document.getElementById("pollingStatusTitle");
  const pollingStatusSubtitle = document.getElementById("pollingStatusSubtitle");
  const pollingAttemptChip = document.getElementById("pollingAttemptChip");
  const pollingUrlChip = document.getElementById("pollingUrlChip");

  const { hintText } = getSubnetHintAddresses();
  const cleanUrl = sanitizeHttpUrl(rawUrl);

  if (!rawUrl || !rawUrl.trim()) {
    if (modalErrorAlert && modalErrorText) {
      modalErrorAlert.style.display = "flex";
      modalErrorText.textContent = `Please enter your device's server URL (e.g. ${hintText})`;
    }
    return;
  }

  if (!cleanUrl) {
    if (modalErrorAlert && modalErrorText) {
      modalErrorAlert.style.display = "flex";
      modalErrorText.textContent = `Invalid URL format. Example: ${hintText}`;
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
    if (pollingStatusTitle) pollingStatusTitle.textContent = "Connecting to device server...";
    if (pollingStatusSubtitle) {
      pollingStatusSubtitle.textContent = `Waiting for 6-digit key (${currentPairingPin}) on phone...`;
    }
    if (pollingAttemptChip) pollingAttemptChip.textContent = "Attempt #1";
    if (pollingUrlChip) pollingUrlChip.textContent = cleanUrl.replace(/^https?:\/\//i, "");
  }

  const restoreManualButtons = () => {
    if (deviceUrlInput) deviceUrlInput.disabled = false;
    if (deviceNameInput) deviceNameInput.disabled = false;
    if (startPairingBtn) startPairingBtn.disabled = false;
    if (pairingBtnSpinner) pairingBtnSpinner.style.display = "none";
    if (startPairingBtnText) startPairingBtnText.textContent = "Start Pairing";
  };

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

      if (!isPairing) return;

      if (result && result.connected) {
        stopManualPollLoop();

        const parsedUrl = new URL(cleanUrl);
        const autoName =
          customName?.trim() ||
          result.phoneModel ||
          result.deviceName ||
          `Phone (${parsedUrl.hostname})`;

        const newDevice = {
          name: autoName,
          model: result.phoneModel || null,
          deviceId: result.deviceId || null,
          url: cleanUrl,
          ip: parsedUrl.hostname,
          port: Number(parsedUrl.port) || 8000,
          key: currentPairingPin,
          token: result.token || undefined,
          battery: result.battery ?? null,
          mode: result.mode ?? null,
          pairedAt: new Date().toISOString(),
        };

        const saveRes = await ipcRenderer.invoke("devices:save", newDevice);
        if (saveRes && saveRes.success) {
          currentState.devices = saveRes.devices;
          if (onDeviceAddedCallback) {
            onDeviceAddedCallback(saveRes.devices);
          }
        }

        showToast(`✓ "${autoName}" connected successfully!`);
        closeAddDeviceModal();
        return;
      }

      if (result && (result.denied || result.final)) {
        stopManualPollLoop();
        restoreManualButtons();
        if (pollingStatusCard) pollingStatusCard.style.display = "none";
        if (modalErrorAlert && modalErrorText) {
          modalErrorAlert.style.display = "flex";
          modalErrorText.textContent = result.message || "Pairing denied on phone";
        }
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

  // Sequential polling loop - awaits each step until connected, denied, or cancelled
  (async function runPollLoop() {
    while (isPairing) {
      await pollStep();
      if (!isPairing) break;
      await new Promise((resolve) => {
        pairingPollInterval = setTimeout(resolve, 1000);
      });
    }
  })();
}

function openWriteTextModal({ deviceName = "Device", deviceUrl = "" } = {}) {
  const modal = document.getElementById("writeTextModal");
  const targetLabel = document.getElementById("writeTextTargetLabel");
  const input = document.getElementById("writeTextModalInput");
  const errBox = document.getElementById("writeTextErrorAlert");
  const submitBtn = document.getElementById("submitWriteTextBtn");
  const submitText = document.getElementById("submitWriteTextBtnText");
  const pasteBtn = document.getElementById("pasteWriteTextBtn");
  const cancelBtn = document.getElementById("cancelWriteTextBtn");

  if (!modal || !deviceUrl) return false;

  activeWriteTextTarget = { deviceName, deviceUrl };
  isWritingText = false;

  if (targetLabel) {
    targetLabel.textContent = `Send text to ${deviceName} (${deviceUrl.replace(/^https?:\/\//i, "")})`;
  }
  if (errBox) errBox.style.display = "none";
  if (submitBtn) submitBtn.disabled = false;
  if (submitText) submitText.textContent = "Write";
  if (pasteBtn) pasteBtn.disabled = false;
  if (cancelBtn) cancelBtn.disabled = false;
  if (input) {
    input.disabled = false;
    input.value = "";
  }

  modal.style.display = "flex";
  if (input) {
    requestAnimationFrame(() => input.focus());
  }
  return true;
}

function closeWriteTextModal() {
  const modal = document.getElementById("writeTextModal");
  const errBox = document.getElementById("writeTextErrorAlert");
  if (modal) modal.style.display = "none";
  if (errBox) errBox.style.display = "none";
  activeWriteTextTarget = null;
  isWritingText = false;
}

async function submitWriteTextModal() {
  if (isWritingText || !activeWriteTextTarget) return;

  const input = document.getElementById("writeTextModalInput");
  const errBox = document.getElementById("writeTextErrorAlert");
  const errText = document.getElementById("writeTextErrorText");
  const submitBtn = document.getElementById("submitWriteTextBtn");
  const submitText = document.getElementById("submitWriteTextBtnText");
  const pasteBtn = document.getElementById("pasteWriteTextBtn");
  const cancelBtn = document.getElementById("cancelWriteTextBtn");

  const text = input ? input.value : "";
  if (!text) {
    if (errBox) errBox.style.display = "flex";
    if (errText) errText.textContent = "Please enter or paste text to write.";
    if (input) input.focus();
    return;
  }

  isWritingText = true;
  if (errBox) errBox.style.display = "none";
  if (input) input.disabled = true;
  if (submitBtn) submitBtn.disabled = true;
  if (pasteBtn) pasteBtn.disabled = true;
  if (cancelBtn) cancelBtn.disabled = true;
  if (submitText) submitText.textContent = "Writing...";

  try {
    const res = await ipcRenderer.invoke("devices:write-text", {
      deviceUrl: activeWriteTextTarget.deviceUrl,
      text,
    });
    if (res && res.success) {
      const targetName = activeWriteTextTarget.deviceName;
      if (input) input.value = "";
      closeWriteTextModal();
      showToast(`✓ Sent text to ${targetName}`);
    } else {
      if (errBox) errBox.style.display = "flex";
      if (errText) errText.textContent = res?.error || "Device unreachable";
    }
  } catch (err) {
    if (errBox) errBox.style.display = "flex";
    if (errText) errText.textContent = err.message || "Failed to write text";
  } finally {
    isWritingText = false;
    if (input) input.disabled = false;
    if (submitBtn) submitBtn.disabled = false;
    if (pasteBtn) pasteBtn.disabled = false;
    if (cancelBtn) cancelBtn.disabled = false;
    if (submitText) submitText.textContent = "Write";
    if (activeWriteTextTarget && input) {
      input.focus();
    }
  }
}

function initModals() {
  const openAddDeviceModalBtn = document.getElementById("openAddDeviceModalBtn");
  const emptyAddDeviceBtn = document.getElementById("emptyAddDeviceBtn");
  const closeAddDeviceModalBtn = document.getElementById("closeAddDeviceModalBtn");
  const cancelPairingBtn = document.getElementById("cancelPairingBtn");
  const addDeviceForm = document.getElementById("addDeviceForm");
  const addDeviceModal = document.getElementById("addDeviceModal");
  const deviceUrlInput = document.getElementById("deviceUrlInput");
  const deviceNameInput = document.getElementById("deviceNameInput");
  const regeneratePinBtn = document.getElementById("regeneratePinBtn");
  const copyPinBtn = document.getElementById("copyPinBtn");
  const rescanPhonesBtn = document.getElementById("rescanPhonesBtn");
  const toggleManualEntryBtn = document.getElementById("toggleManualEntryBtn");
  const backFromConfirmBtn = document.getElementById("backFromConfirmBtn");
  const retryConfirmPairingBtn = document.getElementById("retryConfirmPairingBtn");
  const cancelConfirmPairingBtn = document.getElementById("cancelConfirmPairingBtn");

  const jsonFormatModal = document.getElementById("jsonFormatModal");
  const closeJsonFormatModalBtn = document.getElementById("closeJsonFormatModalBtn");
  const dismissJsonFormatModalBtn = document.getElementById("dismissJsonFormatModalBtn");
  const devicesViewApiHelpBtn = document.getElementById("devicesViewApiHelpBtn");
  const togglePairingApiHelpBtn = document.getElementById("togglePairingApiHelpBtn");
  const inlineApiHelpBtn = document.getElementById("inlineApiHelpBtn");
  const copyAliveJsonBtn = document.getElementById("copyAliveJsonBtn");
  const copySuccessJsonBtn = document.getElementById("copySuccessJsonBtn");
  const copyPendingJsonBtn = document.getElementById("copyPendingJsonBtn");
  const copyDeniedJsonBtn = document.getElementById("copyDeniedJsonBtn");

  if (openAddDeviceModalBtn) openAddDeviceModalBtn.addEventListener("click", openAddDeviceModal);
  if (emptyAddDeviceBtn) emptyAddDeviceBtn.addEventListener("click", openAddDeviceModal);
  if (closeAddDeviceModalBtn) closeAddDeviceModalBtn.addEventListener("click", closeAddDeviceModal);
  if (cancelPairingBtn) cancelPairingBtn.addEventListener("click", closeAddDeviceModal);

  if (rescanPhonesBtn) {
    rescanPhonesBtn.addEventListener("click", () => {
      runModalScan();
    });
  }

  if (toggleManualEntryBtn) {
    toggleManualEntryBtn.addEventListener("click", () => {
      const form = document.getElementById("addDeviceForm");
      const isHidden = !form || form.style.display === "none";
      setManualExpanded(isHidden);
      if (isHidden && deviceUrlInput) {
        setTimeout(() => deviceUrlInput.focus(), 40);
      }
    });
  }

  if (backFromConfirmBtn) {
    backFromConfirmBtn.addEventListener("click", async () => {
      await cancelActiveConfirmSession();
      showDiscoverView();
    });
  }

  if (cancelConfirmPairingBtn) {
    cancelConfirmPairingBtn.addEventListener("click", closeAddDeviceModal);
  }

  if (retryConfirmPairingBtn) {
    retryConfirmPairingBtn.addEventListener("click", () => {
      if (activeConfirmSession && activeConfirmSession.ip) {
        startConfirmPairingSession(activeConfirmSession);
      }
    });
  }

  if (regeneratePinBtn) {
    regeneratePinBtn.addEventListener("click", () => {
      const pin = generatePairingPin();
      showToast(`Generated new key: ${pin}`);
    });
  }

  if (copyPinBtn) {
    copyPinBtn.addEventListener("click", () => {
      clipboard.writeText(currentPairingPin);
      showToast(`Key ${currentPairingPin} copied to clipboard!`);
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

  // JSON Spec Modal Handlers
  if (devicesViewApiHelpBtn) devicesViewApiHelpBtn.addEventListener("click", openJsonFormatModal);
  if (togglePairingApiHelpBtn) togglePairingApiHelpBtn.addEventListener("click", openJsonFormatModal);
  if (inlineApiHelpBtn) {
    inlineApiHelpBtn.addEventListener("click", (e) => {
      e.preventDefault();
      openJsonFormatModal();
    });
  }
  if (closeJsonFormatModalBtn) closeJsonFormatModalBtn.addEventListener("click", closeJsonFormatModal);
  if (dismissJsonFormatModalBtn) dismissJsonFormatModalBtn.addEventListener("click", closeJsonFormatModal);

  if (jsonFormatModal) {
    jsonFormatModal.addEventListener("click", (e) => {
      if (e.target === jsonFormatModal) {
        closeJsonFormatModal();
      }
    });
  }

  if (copyAliveJsonBtn) {
    copyAliveJsonBtn.addEventListener("click", () => {
      const json = JSON.stringify(
        {
          phoneModel: "CPH2487",
          batteryLevel: 81,
          mode: "General",
          deviceId: "dev_optional_stable_id",
        },
        null,
        2,
      );
      clipboard.writeText(json);
      showToast("Copied /alive JSON to clipboard!");
    });
  }

  if (copySuccessJsonBtn) {
    copySuccessJsonBtn.addEventListener("click", () => {
      const json = JSON.stringify(
        {
          success: true,
          status: "connected",
          phoneModel: "CPH2487",
          batteryLevel: 81,
          mode: "General",
          message: "Device paired successfully",
        },
        null,
        2,
      );
      clipboard.writeText(json);
      showToast("Copied Success JSON to clipboard!");
    });
  }

  if (copyPendingJsonBtn) {
    copyPendingJsonBtn.addEventListener("click", () => {
      const json = JSON.stringify(
        {
          success: false,
          status: "pending",
          message: "Waiting for confirmation on phone",
        },
        null,
        2,
      );
      clipboard.writeText(json);
      showToast("Copied Pending JSON to clipboard!");
    });
  }

  if (copyDeniedJsonBtn) {
    copyDeniedJsonBtn.addEventListener("click", () => {
      const json = JSON.stringify(
        {
          success: false,
          status: "denied",
          message: "Pairing cancelled on phone",
        },
        null,
        2,
      );
      clipboard.writeText(json);
      showToast("Copied Denied JSON to clipboard!");
    });
  }

  // Write Text Modal Handlers
  const writeTextModal = document.getElementById("writeTextModal");
  const closeWriteTextModalBtn = document.getElementById("closeWriteTextModalBtn");
  const cancelWriteTextBtn = document.getElementById("cancelWriteTextBtn");
  const pasteWriteTextBtn = document.getElementById("pasteWriteTextBtn");
  const writeTextModalForm = document.getElementById("writeTextModalForm");
  const writeTextModalInput = document.getElementById("writeTextModalInput");

  if (closeWriteTextModalBtn) closeWriteTextModalBtn.addEventListener("click", closeWriteTextModal);
  if (cancelWriteTextBtn) cancelWriteTextBtn.addEventListener("click", closeWriteTextModal);

  if (pasteWriteTextBtn) {
    pasteWriteTextBtn.addEventListener("click", () => {
      const clipText = clipboard.readText() || "";
      if (!clipText) {
        showToast("⚠️ PC clipboard has no text");
        if (writeTextModalInput) writeTextModalInput.focus();
        return;
      }
      if (writeTextModalInput) {
        const start = writeTextModalInput.selectionStart ?? writeTextModalInput.value.length;
        const end = writeTextModalInput.selectionEnd ?? writeTextModalInput.value.length;
        const current = writeTextModalInput.value;
        writeTextModalInput.value = current.slice(0, start) + clipText + current.slice(end);
        const caret = start + clipText.length;
        writeTextModalInput.setSelectionRange(caret, caret);
        writeTextModalInput.focus();
      }
      const errBox = document.getElementById("writeTextErrorAlert");
      if (errBox) errBox.style.display = "none";
    });
  }

  if (writeTextModalForm) {
    writeTextModalForm.addEventListener("submit", (e) => {
      e.preventDefault();
      submitWriteTextModal();
    });
  }

  if (writeTextModalInput) {
    writeTextModalInput.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        submitWriteTextModal();
      }
    });
  }

  if (writeTextModal) {
    writeTextModal.addEventListener("click", (e) => {
      if (e.target === writeTextModal) {
        closeWriteTextModal();
      }
    });
  }

  // Global Escape key
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (writeTextModal && writeTextModal.style.display !== "none") {
        closeWriteTextModal();
      } else if (jsonFormatModal && jsonFormatModal.style.display !== "none") {
        closeJsonFormatModal();
      } else if (addDeviceModal && addDeviceModal.style.display !== "none") {
        closeAddDeviceModal();
      }
    }
  });
}

module.exports = {
  openAddDeviceModal,
  closeAddDeviceModal,
  openJsonFormatModal,
  closeJsonFormatModal,
  openWriteTextModal,
  closeWriteTextModal,
  generatePairingPin,
  renderScanCandidates,
  startConfirmPairingSession,
  startPairingWorkflow,
  handlePairProgress,
  initModals,
  setOnDeviceAdded,
};
