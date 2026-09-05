/**
 * Dashboard window for LocalShare
 */
const { BrowserWindow, app } = require("electron");
const path = require("path");
const fs = require("fs");
const logger = require("../../config/logger");

let dashboardWindow = null;

/**
 * Returns the active dashboard window if not destroyed
 */
function getDashboardWindow() {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    return dashboardWindow;
  }
  return null;
}

/**
 * Creates or shows the dashboard window
 */
function showDashboardWindow() {
  logger.info("Attempting to show dashboard window");

  try {
    // If window already exists, restore and focus it
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
      if (dashboardWindow.isMinimized()) dashboardWindow.restore();
      dashboardWindow.show();
      dashboardWindow.focus();
      logger.info("Existing dashboard window shown and focused");
      return dashboardWindow;
    }

    // Resolve icon path safely
    let iconPath = path.join(__dirname, "../../../build/icon.ico");
    if (!fs.existsSync(iconPath)) {
      iconPath = path.join(__dirname, "../../../icon.png");
    }

    // Create new dashboard window
    dashboardWindow = new BrowserWindow({
      width: 980,
      height: 720,
      minWidth: 840,
      minHeight: 600,
      show: false,
      autoHideMenuBar: true,
      title: "LocalShare Dashboard",
      icon: iconPath,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    // Load dashboard page
    const dashboardPath = path.join(
      __dirname,
      "../../pages/dashboard/index.html"
    );
    dashboardWindow.loadFile(dashboardPath);

    dashboardWindow.once("ready-to-show", () => {
      dashboardWindow.show();
      logger.info("Dashboard window shown");
    });

    // Minimize to tray on close if app is not quitting
    dashboardWindow.on("close", (event) => {
      if (!app.isQuiting) {
        event.preventDefault();
        dashboardWindow.hide();
      }
    });

    dashboardWindow.on("closed", () => {
      logger.info("Dashboard window closed");
      dashboardWindow = null;
    });

    // Handle window errors
    dashboardWindow.webContents.on("render-process-gone", (event, details) => {
      logger.error("Dashboard render process gone:", details);
    });

    return dashboardWindow;
  } catch (error) {
    logger.error("Error creating dashboard window:", error);
    return null;
  }
}

module.exports = { showDashboardWindow, getDashboardWindow };

