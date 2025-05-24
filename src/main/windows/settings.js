/**
 * Settings window for LocalShare
 * Manages settings UI and configuration
 */
const { BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { getConfig, updateConfig } = require("../../config/config");
const logger = require("../../config/logger");

let settingsWindow = null;

/**
 * Create and show the settings window
 */
function showSettingsWindow() {
  // If window exists already, focus it instead of creating a new one
  if (settingsWindow) {
    if (settingsWindow.isMinimized()) settingsWindow.restore();
    settingsWindow.focus();
    return settingsWindow;
  }

  logger.info("Creating settings window");

  // Create the browser window
  settingsWindow = new BrowserWindow({
    width: 600,
    height: 800,
    title: "LocalShare Settings",
    icon: path.join(__dirname, "../../../build/icon.ico"),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
    },
    resizable: true,
    minimizable: true,
    maximizable: false,
    autoHideMenuBar: true,
    show: false, // Don't show until ready
  });

  // Load the settings page
  settingsWindow.loadFile(
    path.join(__dirname, "../../pages/settings/index.html")
  );

  // Show window when ready
  settingsWindow.once("ready-to-show", () => {
    settingsWindow.show();
    logger.debug("Settings window shown");
  });

  // Send current settings when requested
  ipcMain.on("settings:get", (event) => {
    const config = getConfig();
    logger.debug("Sending config to settings window:", config);
    event.reply("settings:current", config);
  });

  // Handle settings save
  ipcMain.on("settings:save", (event, newSettings) => {
    logger.info("Saving new settings:", newSettings);
    try {
      // Update configuration
      const success = updateConfig(newSettings);

      // Apply new settings as needed
      applySettingsChanges(newSettings);

      event.reply("settings:saved", { success });

      if (success) {
        logger.info("Settings updated successfully");
      } else {
        logger.error("Failed to update settings");
      }
    } catch (err) {
      logger.error("Error saving settings:", err);
      event.reply("settings:saved", { success: false, error: err.message });
    }
  });

  // Handle window close
  settingsWindow.on("closed", () => {
    // Remove IPC listeners when window is closed
    ipcMain.removeAllListeners("settings:get");
    ipcMain.removeAllListeners("settings:save");
    settingsWindow = null;
    logger.debug("Settings window closed");
  });

  return settingsWindow;
}

/**
 * Apply settings changes that need to take effect immediately
 * @param {Object} newSettings - New settings object
 */
function applySettingsChanges(newSettings) {
  const { app } = require("electron");

  // Handle autostart setting
  if (newSettings.hasOwnProperty("autostart")) {
    logger.info("Updating autostart setting:", newSettings.autostart);
    app.setLoginItemSettings({
      openAtLogin: newSettings.autostart,
      path: process.execPath,
      args: [],
    });
  }

  // Handle theme change if needed
  if (newSettings.hasOwnProperty("theme")) {
    logger.info("Theme changed to:", newSettings.theme);
    // Any theme-related logic would go here
  }

  // Handle notification setting if needed
  if (newSettings.hasOwnProperty("notifications")) {
    logger.info("Notifications setting changed to:", newSettings.notifications);
    // Notification logic would go here
  }

  // Port changes would require server restart to take effect
  if (newSettings.hasOwnProperty("port")) {
    logger.info("Port changed to:", newSettings.port);
    logger.warn("Server restart required for port change to take effect");
    // Could implement server restart here or notify user
  }
}

module.exports = {
  showSettingsWindow,
};
