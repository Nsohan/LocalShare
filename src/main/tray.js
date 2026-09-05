/**
 * Tray functionality for LocalShare
 * Provides quick access to server controls, file sharing, and system preferences.
 */
const { app, Tray, Menu, shell, dialog, Notification, clipboard } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const logger = require("../config/logger");
const { showDashboardWindow } = require("./windows/dashboard");
const { getLocalIP } = require("./utils");
const { getConfig, setConfig } = require("../config/config");

// Declare tray and callbacks as module globals
let tray = null;
let currentSharedFiles = [];
let clearAllSharedFilesCallback = null;
let startServerCallback = null;
let updateTrayMenuCallback = null;
let addFilesCallback = null;
let removeFileCallback = null;
let broadcastStateCallback = null;

/**
 * Get safe application icon path for notifications and tray
 */
function getAppIcon() {
  const icoPath = path.join(__dirname, "../../build/icon.ico");
  if (fs.existsSync(icoPath)) return icoPath;
  return path.join(__dirname, "../../icon.png");
}

/**
 * Creates the system tray icon and menu
 * @param {Array} sharedFiles - Array of files being shared
 * @param {Function} startServer - Function to restart the server
 * @param {Function} updateTrayMenuCb - Function to update tray menu
 * @param {Function} clearAllSharedFiles - Function to clear all shared files
 * @param {Object} options - Additional handlers (addFilesToShare, removeSharedFile, broadcastDashboardState)
 * @returns {Tray} - The created tray instance
 */
function createTray(
  sharedFiles = [],
  startServer = null,
  updateTrayMenuCb = null,
  clearAllSharedFiles = null,
  options = {}
) {
  logger.info("Creating tray icon");

  currentSharedFiles = Array.isArray(sharedFiles) ? sharedFiles : [];

  // Store callbacks
  clearAllSharedFilesCallback = clearAllSharedFiles;
  startServerCallback = startServer;
  updateTrayMenuCallback = updateTrayMenuCb;
  addFilesCallback = options.addFilesToShare || null;
  removeFileCallback = options.removeSharedFile || null;
  broadcastStateCallback = options.broadcastDashboardState || null;

  try {
    const iconPath = path.join(__dirname, "../../build/icon.ico");
    logger.debug("Tray icon path:", iconPath);

    if (!fs.existsSync(iconPath)) {
      throw new Error(`Icon file not found at ${iconPath}`);
    }

    tray = new Tray(iconPath);

    // Double-click opens the dashboard
    tray.on("double-click", () => {
      logger.info("Tray double-clicked, opening dashboard");
      showDashboardWindow();
    });

    // Single left-click also focuses dashboard on Windows
    tray.on("click", () => {
      if (process.platform === "win32") {
        showDashboardWindow();
      }
    });

    // Set up menu items
    updateTrayMenu(currentSharedFiles);
    logger.info("Tray icon created successfully");
    return tray;
  } catch (error) {
    logger.error("Error creating tray with primary icon:", error);

    // Fallback icon
    try {
      const pngIconPath = path.join(__dirname, "../../icon.png");
      if (!fs.existsSync(pngIconPath)) {
        throw new Error(`PNG icon file not found at ${pngIconPath}`);
      }

      tray = new Tray(pngIconPath);
      tray.on("double-click", () => showDashboardWindow());
      tray.on("click", () => {
        if (process.platform === "win32") showDashboardWindow();
      });

      updateTrayMenu(currentSharedFiles);
      logger.info("Tray created with fallback PNG icon");
      return tray;
    } catch (fallbackError) {
      logger.error("Failed to create tray with fallback icon:", fallbackError);
      return null;
    }
  }
}

/**
 * Updates the tray menu with current status, quick actions, and toggles
 * @param {Array} [sharedFiles] - Array of files being shared
 */
function updateTrayMenu(sharedFiles = null) {
  if (!tray) {
    logger.error("Tray is null, cannot update menu");
    return;
  }

  if (Array.isArray(sharedFiles)) {
    currentSharedFiles = sharedFiles;
  }

  try {
    const ip = getLocalIP();
    const port = getConfig("port") || 5199;
    const serverUrl = `http://${ip}:${port}`;
    const notificationsEnabled = getConfig("notifications") !== false;
    const autostartEnabled = getConfig("autostart") !== false;
    const fileCount = Array.isArray(currentSharedFiles) ? currentSharedFiles.length : 0;

    // Dynamic hover tooltip showing current network address and files count
    const countStr = fileCount === 1 ? "1 file" : `${fileCount} files`;
    tray.setToolTip(`LocalShare - Sharing ${countStr} • ${ip}:${port}`);

    const menuTemplate = [
      // Status Header (Click to copy server URL)
      {
        label: `🟢 LocalShare Active (Port ${port})`,
        click: () => {
          clipboard.writeText(serverUrl);
          logger.info("Copied server URL to clipboard from header:", serverUrl);
          if (notificationsEnabled) {
            new Notification({
              title: "LocalShare",
              body: `Server link copied: ${serverUrl}`,
              icon: getAppIcon(),
            }).show();
          }
        },
      },
      { type: "separator" },

      // Main Navigation & Fast File Operations
      {
        label: "📊 Open Dashboard",
        click: () => {
          logger.info("Opening dashboard from menu");
          const win = showDashboardWindow();
          if (win && !win.isDestroyed()) win.webContents.send("dashboard:switch-tab", "files");
        },
      },
      {
        label: "➕ Share Files...",
        click: async () => {
          logger.info("Tray: Share Files clicked");
          if (addFilesCallback) {
            await addFilesCallback();
          } else {
            showDashboardWindow();
          }
        },
      },
      {
        label: "📂 Open Received Folder",
        click: () => {
          const receivedDir = path.join(os.homedir(), "Downloads", "LocalShare");
          if (!fs.existsSync(receivedDir)) {
            fs.mkdirSync(receivedDir, { recursive: true });
          }
          logger.info("Opening received folder:", receivedDir);
          shell.openPath(receivedDir);
        },
      },
      { type: "separator" },

      // Quick Connection & Link Actions
      {
        label: "📱 Show QR Code",
        click: () => {
          logger.info("Showing QR code in dashboard");
          const win = showDashboardWindow();
          if (win && !win.isDestroyed()) win.webContents.send("dashboard:switch-tab", "connect");
        },
      },
      {
        label: "🌐 Open in Browser",
        click: () => {
          logger.info("Opening in browser");
          shell.openExternal(`http://localhost:${port}`);
        },
      },
    ];

    // Shared Files Section
    if (fileCount > 0) {
      const filesSubmenu = currentSharedFiles.slice(0, 15).map((filePath, index) => {
        const fileName = path.basename(filePath);
        return {
          label: `${index + 1}. ${fileName}`,
          submenu: [
            {
              label: "📂 Show in Folder",
              click: () => {
                logger.info("Showing in folder:", filePath);
                shell.showItemInFolder(filePath);
              },
            },
            {
              label: "📋 Copy Download Link",
              click: () => {
                const downloadUrl = `${serverUrl}/download/${index}`;
                clipboard.writeText(downloadUrl);
                logger.info("Copied download link:", downloadUrl);
                if (notificationsEnabled) {
                  new Notification({
                    title: "LocalShare",
                    body: `Download link copied for ${fileName}`,
                    icon: getAppIcon(),
                  }).show();
                }
              },
            },
            {
              label: "❌ Remove File",
              click: async () => {
                logger.info("Removing file from tray:", filePath);
                if (removeFileCallback) {
                  await removeFileCallback(filePath);
                }
              },
            },
          ],
        };
      });

      if (fileCount > 15) {
        filesSubmenu.push({
          label: `... and ${fileCount - 15} more files`,
          enabled: false,
        });
      }

      filesSubmenu.push({ type: "separator" });
      filesSubmenu.push({
        label: "🗑️ Remove All Shared Files",
        click: async () => {
          logger.info("Tray: Remove All Shared Files clicked");
          const result = await dialog.showMessageBox({
            type: "warning",
            buttons: ["Cancel", "Remove All"],
            defaultId: 0,
            cancelId: 0,
            title: "Confirm Remove All",
            message: "Are you sure you want to stop sharing all files?",
            detail: "This will stop sharing files immediately. No files will be deleted from your computer.",
          });

          if (result.response === 1) {
            try {
              if (clearAllSharedFilesCallback) {
                clearAllSharedFilesCallback();
              }
              if (startServerCallback) {
                await startServerCallback([]);
              }
              currentSharedFiles = [];
              updateTrayMenu([]);
              if (notificationsEnabled) {
                new Notification({
                  title: "LocalShare",
                  body: "All shared files have been removed from sharing.",
                  icon: getAppIcon(),
                }).show();
              }
            } catch (err) {
              logger.error("Error clearing shared files from tray:", err);
            }
          }
        },
      });

      menuTemplate.push(
        { type: "separator" },
        {
          label: `📁 Shared Files (${fileCount})`,
          submenu: filesSubmenu,
        }
      );
    } else {
      menuTemplate.push(
        { type: "separator" },
        {
          label: "📁 No files currently shared",
          enabled: false,
        }
      );
    }

    // Live Quick Settings Checkboxes
    menuTemplate.push(
      { type: "separator" },
      {
        label: "Desktop Notifications",
        type: "checkbox",
        checked: notificationsEnabled,
        click: (menuItem) => {
          const enabled = menuItem.checked;
          setConfig("notifications", enabled);
          logger.info("Tray toggled notifications:", enabled);
          updateTrayMenu(currentSharedFiles);
          if (broadcastStateCallback) broadcastStateCallback();
        },
      },
      {
        label: "Start with Windows",
        type: "checkbox",
        checked: autostartEnabled,
        click: (menuItem) => {
          const enabled = menuItem.checked;
          setConfig("autostart", enabled);
          app.setLoginItemSettings({
            openAtLogin: enabled,
            path: process.execPath,
            args: [],
          });
          logger.info("Tray toggled autostart:", enabled);
          updateTrayMenu(currentSharedFiles);
          if (broadcastStateCallback) broadcastStateCallback();
        },
      },
      { type: "separator" },
      {
        label: "⚙️ Settings",
        click: () => {
          logger.info("Opening settings in dashboard");
          const win = showDashboardWindow();
          if (win && !win.isDestroyed()) win.webContents.send("dashboard:switch-tab", "settings");
        },
      },
      { type: "separator" },
      {
        label: "❌ Exit LocalShare",
        click: () => {
          logger.info("Exit clicked, quitting app");
          app.quit();
        },
      }
    );

    const contextMenu = Menu.buildFromTemplate(menuTemplate);
    tray.setContextMenu(contextMenu);
    logger.info("Tray menu updated successfully");
  } catch (error) {
    logger.error("Error updating tray menu:", error);
  }
}

module.exports = {
  createTray,
  updateTrayMenu,
};
