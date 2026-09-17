const { currentState, getCurrentView, setCurrentView } = require("./state");

const VIEW_TITLES = {
  files: "Files & Sharing",
  connect: "Connect & QR Code",
  devices: "Your Devices",
  mirror: "Screen Mirror & Remote Control",
  api: "API Explorer",
  settings: "Application Settings",
  about: "About LocalShare",
};

let qrCodeCallback = null;
let devicesRenderCallback = null;
let mirrorRenderCallback = null;

function setNavigationCallbacks({ onConnectView, onDevicesView, onMirrorView }) {
  if (onConnectView) qrCodeCallback = onConnectView;
  if (onDevicesView) devicesRenderCallback = onDevicesView;
  if (onMirrorView) mirrorRenderCallback = onMirrorView;
}

function switchView(viewName) {
  if (!VIEW_TITLES[viewName]) viewName = "files";
  setCurrentView(viewName);

  const navItems = document.querySelectorAll(".nav-item");
  const viewPanels = document.querySelectorAll(".view-panel");
  const viewTitle = document.getElementById("viewTitle");

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

  if (viewTitle) {
    viewTitle.textContent = VIEW_TITLES[viewName];
  }

  // Specific view hooks
  if (viewName === "connect" && qrCodeCallback) {
    qrCodeCallback();
  } else if (viewName === "devices" && devicesRenderCallback) {
    devicesRenderCallback(currentState.devices || []);
  } else if (viewName === "mirror" && mirrorRenderCallback) {
    mirrorRenderCallback();
  }
}

function initNavigation() {
  const navItems = document.querySelectorAll(".nav-item");
  navItems.forEach((btn) => {
    btn.addEventListener("click", () => {
      switchView(btn.dataset.view);
    });
  });
}

module.exports = {
  VIEW_TITLES,
  switchView,
  initNavigation,
  setNavigationCallbacks,
};
