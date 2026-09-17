/**
 * LocalShare Desktop Dashboard
 * Main orchestrator script importing decentralized section modules
 */

const fs = require("fs");
const path = require("path");
const { ipcRenderer } = require("electron");

// Load HTML Section Partials synchronously into the DOM
function loadViewPartials() {
  const includeElements = document.querySelectorAll("[data-view-include]");
  includeElements.forEach((el) => {
    const relPath = el.getAttribute("data-view-include");
    const fullPath = path.join(__dirname, relPath);
    if (fs.existsSync(fullPath)) {
      el.outerHTML = fs.readFileSync(fullPath, "utf8");
    }
  });
}

// Immediately inject view partials so all elements exist
loadViewPartials();

// Section Controller Modules
const { currentState, showToast } = require("./js/state");
const { switchView, initNavigation, setNavigationCallbacks } = require("./js/navigation");
const { renderFilesView, initFiles } = require("./js/files");
const { generateQRCode, initConnect } = require("./js/connect");
const { renderDevicesList, initDevices } = require("./js/devices");
const { scanAdbDevices, checkScrcpyStatus, initMirror } = require("./js/mirror");
const { initModals, setOnDeviceAdded } = require("./js/modals");
const { updateApiTokens, initApi } = require("./js/api");
const { populateSettings, initSettings } = require("./js/settings");
const { populateAboutView } = require("./js/about");

// Master Dashboard Render Dispatcher
function renderDashboard() {
  renderFilesView();
  renderDevicesList(currentState.devices || []);
  updateApiTokens();
  populateSettings(currentState.config);
  generateQRCode();
}

// Wire Cross-Module Callbacks
setNavigationCallbacks({
  onConnectView: generateQRCode,
  onDevicesView: () => renderDevicesList(currentState.devices || []),
  onMirrorView: () => {
    checkScrcpyStatus();
    scanAdbDevices();
  },
});

setOnDeviceAdded(() => {
  renderDashboard();
});

// ==========================
// IPC Event Listeners
// ==========================

ipcRenderer.on("dashboard:switch-tab", (event, tab) => {
  switchView(tab);
});

ipcRenderer.on("dashboard:state-updated", (event, state) => {
  if (state) {
    Object.assign(currentState, state);
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

// Initialize all sections
initNavigation();
initFiles();
initConnect();
initDevices();
initMirror();
initModals();
initApi();
initSettings();
populateAboutView();

// Render initial state immediately
renderDashboard();

// Request initial state from Electron main process
ipcRenderer.send("dashboard:get-state");
