/**
 * Dashboard window for LocalShare
 */
const { BrowserWindow } = require("electron");
const path = require("path");
const logger = require("../../config/logger");

let dashboardWindow = null;

/**
 * Creates or shows the dashboard window
 */
function showDashboardWindow() {
  logger.info("Attempting to show dashboard window");

  try {
    // If window already exists, show it
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
      dashboardWindow.show();
      dashboardWindow.focus();
      logger.info("Existing dashboard window shown");
      return;
    }

    // Create new dashboard window
    dashboardWindow = new BrowserWindow({
      width: 800,
      height: 600,
      show: false,
      autoHideMenuBar: true,
      title: "LocalShare Dashboard",
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

    dashboardWindow.on("closed", () => {
      logger.info("Dashboard window closed");
      dashboardWindow = null;
    });

    // Handle window errors
    dashboardWindow.webContents.on("render-process-gone", (event, details) => {
      logger.error("Dashboard render process gone:", details);
    });
  } catch (error) {
    logger.error("Error creating dashboard window:", error);
  }
}

module.exports = { showDashboardWindow };
