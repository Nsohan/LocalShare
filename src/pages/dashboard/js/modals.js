const { ipcRenderer, clipboard } = require("electron");
const { currentState, showToast } = require("./state");

let currentPairingPin = "123456";
let pairingPollInterval = null;
let pairingPollAttempt = 0;
let isPairing = false;
let onDeviceAddedCallback = null;

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

function openAddDeviceModal() {
  const addDeviceModal = document.getElementById("addDeviceModal");
  const deviceUrlInput = document.getElementById("deviceUrlInput");
  const deviceNameInput = document.getElementById("deviceNameInput");
  const modalErrorAlert = document.getElementById("modalErrorAlert");
  const pollingStatusCard = document.getElementById("pollingStatusCard");
  const startPairingBtn = document.getElementById("startPairingBtn");
  const pairingBtnSpinner = document.getElementById("pairingBtnSpinner");
  const startPairingBtnText = document.getElementById("startPairingBtnText");

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
    clearTimeout(pairingPollInterval);
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
  const addDeviceModal = document.getElementById("addDeviceModal");
  if (pairingPollInterval) {
    clearTimeout(pairingPollInterval);
    clearInterval(pairingPollInterval);
    pairingPollInterval = null;
  }
  isPairing = false;
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
          if (onDeviceAddedCallback) {
            onDeviceAddedCallback(saveRes.devices);
          }
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

  // Sequential polling loop - awaits each step (allowing time for mobile popup)
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

  const jsonFormatModal = document.getElementById("jsonFormatModal");
  const closeJsonFormatModalBtn = document.getElementById("closeJsonFormatModalBtn");
  const dismissJsonFormatModalBtn = document.getElementById("dismissJsonFormatModalBtn");
  const devicesViewApiHelpBtn = document.getElementById("devicesViewApiHelpBtn");
  const togglePairingApiHelpBtn = document.getElementById("togglePairingApiHelpBtn");
  const inlineApiHelpBtn = document.getElementById("inlineApiHelpBtn");
  const copySuccessJsonBtn = document.getElementById("copySuccessJsonBtn");
  const copyPendingJsonBtn = document.getElementById("copyPendingJsonBtn");

  if (openAddDeviceModalBtn) openAddDeviceModalBtn.addEventListener("click", openAddDeviceModal);
  if (emptyAddDeviceBtn) emptyAddDeviceBtn.addEventListener("click", openAddDeviceModal);
  if (closeAddDeviceModalBtn) closeAddDeviceModalBtn.addEventListener("click", closeAddDeviceModal);
  if (cancelPairingBtn) cancelPairingBtn.addEventListener("click", closeAddDeviceModal);

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

  // Global Escape key
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (jsonFormatModal && jsonFormatModal.style.display !== "none") {
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
  generatePairingPin,
  initModals,
  setOnDeviceAdded,
};
