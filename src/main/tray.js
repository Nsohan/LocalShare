/**
 * Tray functionality for LocalShare
 * Provides quick access to server controls, file sharing, and system preferences.
 */
const {
  app,
  Tray,
  Menu,
  shell,
  dialog,
  Notification,
  clipboard,
} = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const logger = require("../config/logger");
const { showDashboardWindow } = require("./windows/dashboard");
const {
  getLocalIP,
  getAppIconPath,
  getAppNativeImage,
  getAppIcon,
} = require("./utils");
const { getConfig, setConfig } = require("../config/config");
const scrcpyManager = require("./scrcpy");

// Declare tray and callbacks as module globals
let tray = null;
let currentSharedFiles = [];
let connectedAdbDevices = [];
let adbPollInterval = null;
let clearAllSharedFilesCallback = null;
let startServerCallback = null;
let updateTrayMenuCallback = null;
let addFilesCallback = null;
let removeFileCallback = null;
let broadcastStateCallback = null;

/**
 * Explicitly update connected ADB devices from IPC or scan
 */
function updateTrayAdbDevices(input) {
  const deviceList = Array.isArray(input)
    ? input
    : Array.isArray(input?.devices)
      ? input.devices
      : [];
  const readyDevices = deviceList.filter((d) => d.state === "device");
  connectedAdbDevices = readyDevices;
  logger.info(
    `Tray ADB devices synced: ${readyDevices.length} ready device(s):`,
    readyDevices.map((d) => `${d.model || d.serial}`),
  );
  if (tray) {
    updateTrayMenu(currentSharedFiles);
  }
}

/**
 * Poll connected ADB devices and refresh tray menu if device state changed
 */
async function pollAdbDevices() {
  try {
    const res = await scrcpyManager.listAdbDevices();
    const deviceList = Array.isArray(res)
      ? res
      : Array.isArray(res?.devices)
        ? res.devices
        : [];
    const readyDevices = deviceList.filter((d) => d.state === "device");
    const oldSig = connectedAdbDevices
      .map((d) => `${d.serial}_${d.model}`)
      .join(",");
    const newSig = readyDevices.map((d) => `${d.serial}_${d.model}`).join(",");

    if (
      oldSig !== newSig ||
      connectedAdbDevices.length !== readyDevices.length
    ) {
      logger.info(
        `ADB devices in tray updated: found ${readyDevices.length} device(s):`,
        readyDevices.map((d) => d.model || d.serial),
      );
      connectedAdbDevices = readyDevices;
      if (tray) {
        updateTrayMenu(currentSharedFiles);
      }
    }
  } catch (err) {
    logger.debug("Error polling ADB devices for tray:", err.message);
  }
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
  options = {},
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
    const appNativeImg = getAppNativeImage();
    const appIconPath = getAppIconPath();
    logger.debug("Tray icon path resolved:", appIconPath);

    if (appNativeImg) {
      tray = new Tray(appNativeImg);
    } else if (appIconPath) {
      tray = new Tray(appIconPath);
    } else {
      throw new Error("No valid icon image found for tray");
    }

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

    // Right-click or hover refreshes device scan
    tray.on("right-click", () => {
      pollAdbDevices();
    });

    // Start background polling
    if (!adbPollInterval) {
      adbPollInterval = setInterval(pollAdbDevices, 2500);
      pollAdbDevices();
    }

    // Set up menu items
    updateTrayMenu(currentSharedFiles);
    logger.info("Tray icon created successfully");
    return tray;
  } catch (error) {
    logger.error("Error creating tray icon:", error);
    return null;
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
    const fileCount = Array.isArray(currentSharedFiles)
      ? currentSharedFiles.length
      : 0;

    // Dynamic hover tooltip showing current network address and files count
    const countStr = fileCount === 1 ? "1 file" : `${fileCount} files`;
    tray.setToolTip(`LocalShare - Sharing ${countStr} • ${ip}:${port}`);

    // Start background ADB device polling if not started
    if (!adbPollInterval) {
      adbPollInterval = setInterval(pollAdbDevices, 3000);
      pollAdbDevices();
    }

    // Device Detection & Screen Mirroring Submenu
    const primaryDevice =
      connectedAdbDevices.length > 0 ? connectedAdbDevices[0] : null;
    const deviceName = primaryDevice
      ? primaryDevice.model
        ? primaryDevice.model.replace(/_/g, " ")
        : primaryDevice.serial
      : null;

    let mirrorSubmenu = [];

    if (primaryDevice) {
      mirrorSubmenu = [
        {
          label: "📳 Open Mirror Dashboard",
          click: () => {
            logger.info("Tray: Opening Screen Mirror dashboard");
            const win = showDashboardWindow();
            if (win && !win.isDestroyed()) {
              win.webContents.send("dashboard:switch-tab", "mirror");
            }
          },
        },
        { type: "separator" },
        {
          label: `⚡ Live Screen Mirror`,
          click: () => {
            logger.info(
              "Tray: Directly starting Live Mirror for",
              primaryDevice.serial,
            );
            scrcpyManager.startMirror({
              serial: primaryDevice.serial,
              model: primaryDevice.model,
            });
            if (notificationsEnabled) {
              new Notification({
                title: "LocalShare Screen Mirror",
                body: `Launching Live Mirror for ${deviceName}`,
                icon: getAppIcon(),
              }).show();
            }
          },
        },
        {
          label: `🕶️ Stealth Mode (Screen Off)`,
          click: () => {
            logger.info(
              "Tray: Directly starting Stealth Mirror for",
              primaryDevice.serial,
            );
            scrcpyManager.startMirror({
              serial: primaryDevice.serial,
              model: primaryDevice.model,
              turnScreenOff: true,
              stayAwake: true,
            });
            if (notificationsEnabled) {
              new Notification({
                title: "LocalShare Stealth Mode",
                body: `Mirroring ${deviceName} (Phone Screen OFF)`,
                icon: getAppIcon(),
              }).show();
            }
          },
        },
        {
          label: `⌨️ Keyboard & Mouse Control (UHID)`,
          click: () => {
            logger.info(
              "Tray: Directly starting UHID for",
              primaryDevice.serial,
            );
            scrcpyManager.startMirror({
              serial: primaryDevice.serial,
              model: primaryDevice.model,
              mode: "uhid",
              noVideo: true,
              noAudio: true,
              keyboardUhid: true,
              mouseUhid: true,
            });
            if (notificationsEnabled) {
              new Notification({
                title: "LocalShare Remote Control",
                body: `Keyboard & Mouse connected to ${deviceName}`,
                icon: getAppIcon(),
              }).show();
            }
          },
        },
        {
          label: `📸 Take Screenshots`,
          click: async () => {
            logger.info(
              "Tray: Directly taking screenshot for",
              primaryDevice.serial,
            );
            try {
              const res = await scrcpyManager.takeScreenshot(
                primaryDevice.serial,
              );
              if (notificationsEnabled) {
                new Notification({
                  title: "LocalShare Screenshot",
                  body: `Captured ${deviceName} screen! Saved to Downloads & copied to clipboard`,
                  icon: getAppIcon(),
                }).show();
              }
            } catch (err) {
              logger.error("Screenshot failed from tray:", err);
              if (notificationsEnabled) {
                new Notification({
                  title: "Screenshot Failed",
                  body: err.message,
                  icon: getAppIcon(),
                }).show();
              }
            }
          },
        },
        {
          label: `🎥 Record Screen to MP4`,
          click: () => {
            logger.info(
              "Tray: Directly recording screen for",
              primaryDevice.serial,
            );
            scrcpyManager.startMirror({
              serial: primaryDevice.serial,
              model: primaryDevice.model,
              record: true,
            });
            if (notificationsEnabled) {
              new Notification({
                title: "LocalShare Recording",
                body: `Recording ${deviceName} to Downloads/LocalShare/Recordings`,
                icon: getAppIcon(),
              }).show();
            }
          },
        },
        {
          label: `📷 Phone HD Webcam Mode`,
          click: () => {
            logger.info(
              "Tray: Directly launching webcam mode for",
              primaryDevice.serial,
            );
            scrcpyManager.startMirror({
              serial: primaryDevice.serial,
              model: primaryDevice.model,
              mode: "camera",
              videoSource: "camera",
            });
            if (notificationsEnabled) {
              new Notification({
                title: "LocalShare HD Webcam",
                body: `Streaming ${deviceName} camera as webcam`,
                icon: getAppIcon(),
              }).show();
            }
          },
        },
        { type: "separator" },
        {
          label: "📶 Connect via Wireless IP...",
          click: () => {
            const win = showDashboardWindow();
            if (win && !win.isDestroyed()) {
              win.webContents.send("dashboard:switch-tab", "mirror");
            }
          },
        },
      ];
    } else {
      mirrorSubmenu = [
        {
          label: "📳 Open Mirror Dashboard",
          click: () => {
            const win = showDashboardWindow();
            if (win && !win.isDestroyed()) {
              win.webContents.send("dashboard:switch-tab", "mirror");
            }
          },
        },
        { type: "separator" },
        {
          label: "⚠️ No Device Connected",
          enabled: false,
        },
        {
          label: "🔄 Scan for Connected Devices",
          click: async () => {
            await pollAdbDevices();
            if (notificationsEnabled) {
              new Notification({
                title: "LocalShare ADB Scan",
                body:
                  connectedAdbDevices.length > 0
                    ? `Found ${connectedAdbDevices.length} device(s)`
                    : "No ADB devices detected. Plug in phone via USB with USB Debugging enabled.",
                icon: getAppIcon(),
              }).show();
            }
          },
        },
        {
          label: "📶 Connect via Wireless IP...",
          click: () => {
            const win = showDashboardWindow();
            if (win && !win.isDestroyed()) {
              win.webContents.send("dashboard:switch-tab", "mirror");
            }
          },
        },
      ];
    }

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
          if (win && !win.isDestroyed())
            win.webContents.send("dashboard:switch-tab", "files");
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
          const receivedDir = path.join(
            os.homedir(),
            "Downloads",
            "LocalShare",
          );
          if (!fs.existsSync(receivedDir)) {
            fs.mkdirSync(receivedDir, { recursive: true });
          }
          logger.info("Opening received folder:", receivedDir);
          shell.openPath(receivedDir);
        },
      },
      { type: "separator" },

      // Screen Mirroring & Control Submenu (Shows on Hover)
      {
        label: deviceName
          ? `📳 Screen Mirroring (${deviceName})`
          : "📳 Screen Mirroring (No Device)",
        submenu: mirrorSubmenu,
      },
      { type: "separator" },

      // Quick Connection & Link Actions
      {
        label: "📱 Show QR Code",
        click: () => {
          logger.info("Showing QR code in dashboard");
          const win = showDashboardWindow();
          if (win && !win.isDestroyed())
            win.webContents.send("dashboard:switch-tab", "connect");
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
      const filesSubmenu = currentSharedFiles
        .slice(0, 15)
        .map((filePath, index) => {
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
            detail:
              "This will stop sharing files immediately. No files will be deleted from your computer.",
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
        },
      );
    } else {
      menuTemplate.push(
        { type: "separator" },
        {
          label: "📁 No files currently shared",
          enabled: false,
        },
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
          if (win && !win.isDestroyed())
            win.webContents.send("dashboard:switch-tab", "settings");
        },
      },
      { type: "separator" },
      {
        label: "❌ Exit LocalShare",
        click: () => {
          logger.info("Exit clicked, quitting app");
          app.quit();
        },
      },
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
  pollAdbDevices,
  updateTrayAdbDevices,
};
