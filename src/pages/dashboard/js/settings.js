const { ipcRenderer } = require("electron");
const path = require("path");
const os = require("os");
const { currentState, showToast, applyTheme } = require("./state");

function populateSettings(config) {
  if (!config) return;

  const setAutostart = document.getElementById("setAutostart");
  const setOpenDashboard = document.getElementById("setOpenDashboard");
  const setNotifications = document.getElementById("setNotifications");
  const setPort = document.getElementById("setPort");
  const setTheme = document.getElementById("setTheme");
  const setDeviceAutoConnect = document.getElementById("setDeviceAutoConnect");
  const setDeviceAutoScanNewNetworks = document.getElementById(
    "setDeviceAutoScanNewNetworks",
  );
  const setDeviceScanPort = document.getElementById("setDeviceScanPort");
  const setDeviceProbePath = document.getElementById("setDeviceProbePath");

  if (setAutostart) setAutostart.checked = config.autostart !== false;
  if (setOpenDashboard) setOpenDashboard.checked = config.openDashboardAtStart !== false;
  if (setNotifications) setNotifications.checked = config.notifications !== false;
  if (setPort) setPort.value = config.port || 5199;
  if (setTheme) {
    setTheme.value = config.theme || "dark";
    applyTheme(config.theme);
  }
  if (setDeviceAutoConnect) {
    setDeviceAutoConnect.checked = config.deviceAutoConnect !== false;
  }
  if (setDeviceAutoScanNewNetworks) {
    setDeviceAutoScanNewNetworks.checked =
      config.deviceAutoScanNewNetworks !== false;
  }
  if (setDeviceScanPort) {
    setDeviceScanPort.value = config.deviceScanPort || 8000;
  }
  if (setDeviceProbePath) {
    setDeviceProbePath.value = config.deviceProbePath || "/alive";
  }
}

function initSettings() {
  const settingsForm = document.getElementById("settingsForm");
  const setAutostart = document.getElementById("setAutostart");
  const setOpenDashboard = document.getElementById("setOpenDashboard");
  const setNotifications = document.getElementById("setNotifications");
  const setPort = document.getElementById("setPort");
  const setTheme = document.getElementById("setTheme");
  const setDeviceAutoConnect = document.getElementById("setDeviceAutoConnect");
  const setDeviceAutoScanNewNetworks = document.getElementById(
    "setDeviceAutoScanNewNetworks",
  );
  const setDeviceScanPort = document.getElementById("setDeviceScanPort");
  const setDeviceProbePath = document.getElementById("setDeviceProbePath");
  const restartServerBtn = document.getElementById("restartServerBtn");
  const openReceivedFolderBtn = document.getElementById("openReceivedFolderBtn");
  const clearHistoryBtn = document.getElementById("clearHistoryBtn");
  const openLogsBtn = document.getElementById("openLogsBtn");

  if (setPort) {
    setPort.addEventListener("input", () => {
      const newPort = parseInt(setPort.value, 10);
      if (newPort && newPort !== (currentState.config ? currentState.config.port : 5199)) {
        if (restartServerBtn) restartServerBtn.style.display = "inline-block";
      } else {
        if (restartServerBtn) restartServerBtn.style.display = "none";
      }
    });
  }

  if (setTheme) {
    setTheme.addEventListener("change", () => {
      applyTheme(setTheme.value);
    });
  }

  if (settingsForm) {
    settingsForm.addEventListener("submit", (e) => {
      e.preventDefault();

      const newPort = parseInt(setPort.value, 10);
      if (isNaN(newPort) || newPort < 1024 || newPort > 65535) {
        showToast("Port must be between 1024 and 65535");
        return;
      }

      const rawScanPort = setDeviceScanPort ? setDeviceScanPort.value.trim() : "8000";
      const newScanPort = rawScanPort === "" ? 8000 : Number(rawScanPort);
      if (!Number.isInteger(newScanPort) || newScanPort < 1 || newScanPort > 65535) {
        showToast("Phone companion port must be between 1 and 65535");
        return;
      }

      let probePath = (setDeviceProbePath ? setDeviceProbePath.value : "").trim();
      if (!probePath) {
        probePath = "/alive";
      } else {
        probePath = `/${probePath.replace(/^\/+/, "")}`;
      }
      if (
        probePath.length > 64 ||
        /[\s?#]/.test(probePath) ||
        probePath.includes("://")
      ) {
        showToast("Device liveness path must be a clean path like /alive");
        return;
      }
      if (setDeviceProbePath) {
        setDeviceProbePath.value = probePath;
      }

      const updatedSettings = {
        autostart: setAutostart.checked,
        openDashboardAtStart: setOpenDashboard.checked,
        notifications: setNotifications.checked,
        port: newPort,
        theme: setTheme.value,
        deviceAutoConnect: setDeviceAutoConnect
          ? setDeviceAutoConnect.checked
          : true,
        deviceAutoScanNewNetworks: setDeviceAutoScanNewNetworks
          ? setDeviceAutoScanNewNetworks.checked
          : true,
        deviceScanPort: newScanPort,
        deviceProbePath: probePath,
      };

      ipcRenderer.send("settings:save", updatedSettings);
      showToast("Settings saved successfully!");
    });
  }

  if (restartServerBtn) {
    restartServerBtn.addEventListener("click", () => {
      showToast("Restarting server on new port...");
      ipcRenderer.send("server:restart");
      restartServerBtn.style.display = "none";
    });
  }

  if (openReceivedFolderBtn) {
    openReceivedFolderBtn.addEventListener("click", () => {
      const receivedDir = path.join(os.homedir(), "Downloads", "LocalShare");
      ipcRenderer.send("dashboard:open-folder", receivedDir);
    });
  }

  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener("click", () => {
      if (confirm("Are you sure you want to clear your transfer history?")) {
        ipcRenderer.send("dashboard:clear-history");
        showToast("Transfer history cleared!");
      }
    });
  }

  if (openLogsBtn) {
    openLogsBtn.addEventListener("click", () => {
      ipcRenderer.send("logs:open");
    });
  }
}

module.exports = {
  populateSettings,
  initSettings,
};
