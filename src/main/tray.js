/**
 * Tray functionality for LocalShare
 * Provides quick access to server controls, file sharing, and system preferences.
 */
const {
  app,
  Tray,
  shell,
  dialog,
  Notification,
  clipboard,
} = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");
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
const {
  showTrayMenu,
  closeAllTrayMenus,
  prewarmTrayMenu,
  destroyTrayMenuWindows,
} = require("./trayMenuWindow");

// Declare tray and callbacks as module globals
let tray = null;
let currentSharedFiles = [];
let connectedAdbDevices = [];
let latestMenuTemplate = [];
let adbPollInterval = null;
let clearAllSharedFilesCallback = null;
let startServerCallback = null;
let updateTrayMenuCallback = null;
let addFilesCallback = null;
let removeFileCallback = null;
let broadcastStateCallback = null;
let getPairedDevicesCallback = null;
let sendClipboardToDeviceCallback = null;
let sendFilesToDeviceCallback = null;
let lastPairedDevicesSig = "";
const trayMenuIconCache = new Map();

/**
 * Resolves and caches a file:// URL for a tray menu icon (prefers @2x for crisp HiDPI rendering)
 * @param {string} name - Icon basename inside src/assets/tray/
 * @returns {string|undefined}
 */
function getTrayMenuIconUrl(name) {
  if (trayMenuIconCache.has(name)) {
    return trayMenuIconCache.get(name);
  }
  const hiResPath = path.join(__dirname, "..", "assets", "tray", `${name}@2x.png`);
  const stdPath = path.join(__dirname, "..", "assets", "tray", `${name}.png`);
  const chosenPath = fs.existsSync(hiResPath)
    ? hiResPath
    : fs.existsSync(stdPath)
      ? stdPath
      : null;
  const url = chosenPath ? pathToFileURL(chosenPath).href : undefined;
  trayMenuIconCache.set(name, url);
  return url;
}

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
  getPairedDevicesCallback = options.getPairedDevices || null;
  sendClipboardToDeviceCallback = options.sendClipboardToDevice || null;
  sendFilesToDeviceCallback = options.sendFilesToDevice || null;

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
      closeAllTrayMenus();
      logger.info("Tray double-clicked, opening dashboard");
      showDashboardWindow();
    });

    // Single left-click also focuses dashboard on Windows
    tray.on("click", () => {
      closeAllTrayMenus();
      if (process.platform === "win32") {
        showDashboardWindow();
      }
    });

    // Right-click refreshes device scan and opens the custom cascading tray menu
    tray.on("right-click", (_event, bounds) => {
      pollAdbDevices();
      updateTrayMenu(currentSharedFiles);
      showTrayMenu(latestMenuTemplate, bounds);
    });

    // Start background polling
    if (!adbPollInterval) {
      adbPollInterval = setInterval(pollAdbDevices, 2500);
      pollAdbDevices();
    }

    // Set up menu items and pre-warm custom popup window
    updateTrayMenu(currentSharedFiles);
    prewarmTrayMenu();
    logger.info("Tray icon created successfully");
    return tray;
  } catch (error) {
    logger.error("Error creating tray icon:", error);
    return null;
  }
}

function sendToDashboardWhenReady(channel, payload) {
  const win = showDashboardWindow();
  if (!win || win.isDestroyed()) return;
  if (win.webContents.isLoading()) {
    win.webContents.once("did-finish-load", () => {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, payload);
      }
    });
  } else {
    win.webContents.send(channel, payload);
  }
}

function getSafeDeviceUrl(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) return null;
  let candidate = rawUrl.trim();
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) {
    candidate = `http://${candidate}`;
  }
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function getPairedDevicesList() {
  const list = getPairedDevicesCallback
    ? getPairedDevicesCallback()
    : getConfig("devices");
  return Array.isArray(list) ? list : [];
}

function getPairedDevicesSignature(devices) {
  return devices
    .map((d) => `${d?.id || ""}|${d?.name || ""}|${d?.status || ""}|${d?.url || ""}`)
    .join(";");
}

/**
 * Refreshes the tray menu only when the paired devices list or status changes
 */
function syncTrayPairedDevices() {
  if (!tray) return;
  const pairedDevices = getPairedDevicesList();
  const sig = getPairedDevicesSignature(pairedDevices);
  if (sig !== lastPairedDevicesSig) {
    updateTrayMenu(currentSharedFiles);
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
          label: "Open ADB Devices",
          iconUrl: getTrayMenuIconUrl("phone"),
          click: () => {
            logger.info("Tray: Opening ADB Devices dashboard");
            const win = showDashboardWindow();
            if (win && !win.isDestroyed()) {
              win.webContents.send("dashboard:switch-tab", "mirror");
            }
          },
        },
        { type: "separator" },
        {
          label: "Live Screen Mirror",
          iconUrl: getTrayMenuIconUrl("mirror"),
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
          label: "Stealth Mode (Screen Off)",
          iconUrl: getTrayMenuIconUrl("stealth"),
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
          label: "Keyboard & Mouse Control (UHID)",
          iconUrl: getTrayMenuIconUrl("keyboard"),
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
          label: "Take Screenshots",
          iconUrl: getTrayMenuIconUrl("screenshot"),
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
          label: "Record Screen to MP4",
          iconUrl: getTrayMenuIconUrl("record"),
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
          label: "Phone HD Webcam Mode",
          iconUrl: getTrayMenuIconUrl("webcam"),
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
          label: "Connect via Wireless IP...",
          iconUrl: getTrayMenuIconUrl("wifi"),
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
          label: "Open ADB Devices",
          iconUrl: getTrayMenuIconUrl("phone"),
          click: () => {
            const win = showDashboardWindow();
            if (win && !win.isDestroyed()) {
              win.webContents.send("dashboard:switch-tab", "mirror");
            }
          },
        },
        { type: "separator" },
        {
          label: "No Device Connected",
          iconUrl: getTrayMenuIconUrl("warning"),
          enabled: false,
        },
        {
          label: "Scan for Connected Devices",
          iconUrl: getTrayMenuIconUrl("refresh"),
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
          label: "Connect via Wireless IP...",
          iconUrl: getTrayMenuIconUrl("wifi"),
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
      // Status Header & Quick Connection Submenu (Shows on Hover)
      {
        label: `Active (${ip}:${port})`,
        iconUrl: getTrayMenuIconUrl("active"),
        submenu: [
          {
            label: "Show QR Code",
            iconUrl: getTrayMenuIconUrl("qr"),
            click: () => {
              logger.info("Showing QR code in dashboard");
              const win = showDashboardWindow();
              if (win && !win.isDestroyed())
                win.webContents.send("dashboard:switch-tab", "connect");
            },
          },
          {
            label: "Open in Browser",
            iconUrl: getTrayMenuIconUrl("browser"),
            click: () => {
              logger.info("Opening in browser");
              shell.openExternal(`http://localhost:${port}`);
            },
          },
        ],
      },
      { type: "separator" },

      // Main Navigation & Fast File Operations
      {
        label: "Open Dashboard",
        iconUrl: getTrayMenuIconUrl("dashboard"),
        click: () => {
          logger.info("Opening dashboard from menu");
          const win = showDashboardWindow();
          if (win && !win.isDestroyed())
            win.webContents.send("dashboard:switch-tab", "files");
        },
      },
      {
        label: "Share Files...",
        iconUrl: getTrayMenuIconUrl("add"),
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
        label: "Open Received Folder",
        iconUrl: getTrayMenuIconUrl("folder"),
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

      // ADB Devices & Control Submenu (Shows on Hover)
      {
        label: deviceName
          ? `ADB Devices (${deviceName})`
          : "ADB Devices (No Device)",
        iconUrl: getTrayMenuIconUrl("phone"),
        submenu: mirrorSubmenu,
      },
    ];

    // My Device (Paired Devices) Submenu
    const pairedDevices = getPairedDevicesList();
    lastPairedDevicesSig = getPairedDevicesSignature(pairedDevices);

    const notifyTrayDeviceResult = (body) => {
      if (notificationsEnabled) {
        new Notification({
          title: "LocalShare",
          body,
          icon: getAppIcon(),
        }).show();
      }
    };

    const otherDevicesSubmenu = [
      {
        label: "Open My Device",
        iconUrl: getTrayMenuIconUrl("phone"),
        click: () => {
          logger.info("Tray: Opening My Device dashboard");
          sendToDashboardWhenReady("dashboard:switch-tab", "devices");
        },
      },
      { type: "separator" },
    ];

    if (pairedDevices.length > 0) {
      pairedDevices.slice(0, 15).forEach((device) => {
        const devName = device.name || device.model || device.ip || "Paired Device";
        const isOnline =
          device.status === "connected" || device.status === "online";
        const statusText = isOnline
          ? "Online"
          : device.status === "checking"
            ? "Checking..."
            : "Offline";
        const fallbackUrl = device.ip
          ? `http://${device.ip}:${getConfig("deviceScanPort") || 8000}`
          : "";
        const safeUrl = getSafeDeviceUrl(device.url || fallbackUrl);

        otherDevicesSubmenu.push({
          label: `${devName} (${statusText})`,
          iconUrl: getTrayMenuIconUrl(isOnline ? "active" : "phone"),
          submenu: [
            {
              label: "Send Clipboard",
              iconUrl: getTrayMenuIconUrl("copy"),
              enabled: Boolean(safeUrl && sendClipboardToDeviceCallback),
              click: async () => {
                if (!safeUrl || !sendClipboardToDeviceCallback) return;
                logger.info("Tray: Sending clipboard to device:", devName);
                const res = await sendClipboardToDeviceCallback({
                  deviceUrl: safeUrl,
                });
                if (res && res.success) {
                  notifyTrayDeviceResult(
                    `Sent clipboard to ${devName}: "${res.preview}"`,
                  );
                } else if (res && res.empty) {
                  notifyTrayDeviceResult("PC clipboard has no text");
                } else {
                  notifyTrayDeviceResult(
                    `Failed to send clipboard to ${devName}: ${res?.error || "Device unreachable"}`,
                  );
                }
              },
            },
            {
              label: "Write Text...",
              iconUrl: getTrayMenuIconUrl("keyboard"),
              enabled: Boolean(safeUrl),
              click: () => {
                if (!safeUrl) return;
                logger.info("Tray: Opening Write Text for device:", devName);
                sendToDashboardWhenReady("devices:focus-write-text", {
                  deviceId: device.id || "",
                  deviceUrl: safeUrl,
                });
              },
            },
            {
              label: "Send File...",
              iconUrl: getTrayMenuIconUrl("files"),
              enabled: Boolean(safeUrl && sendFilesToDeviceCallback),
              click: async () => {
                if (!safeUrl || !sendFilesToDeviceCallback) return;
                logger.info("Tray: Sending file(s) to device:", devName);
                const res = await sendFilesToDeviceCallback({
                  deviceUrl: safeUrl,
                });
                if (res && res.canceled) return;
                if (res && res.success) {
                  if (res.failed && res.failed.length > 0) {
                    notifyTrayDeviceResult(
                      `Sent ${res.sentCount}/${res.totalCount} file(s) to ${devName}`,
                    );
                  } else {
                    notifyTrayDeviceResult(
                      `Sent ${res.sentCount} file${res.sentCount !== 1 ? "s" : ""} to ${devName}`,
                    );
                  }
                } else {
                  notifyTrayDeviceResult(
                    `Failed to send file to ${devName}: ${res?.error || "Device unreachable"}`,
                  );
                }
              },
            },
            { type: "separator" },
            {
              label: "Open in Browser",
              iconUrl: getTrayMenuIconUrl("browser"),
              enabled: Boolean(safeUrl),
              click: () => {
                if (safeUrl) {
                  logger.info("Tray: Opening paired device in browser:", safeUrl);
                  shell.openExternal(safeUrl);
                }
              },
            },
            {
              label: "Copy Device URL",
              iconUrl: getTrayMenuIconUrl("copy"),
              enabled: Boolean(safeUrl),
              click: () => {
                if (safeUrl) {
                  clipboard.writeText(safeUrl);
                  logger.info("Tray: Copied paired device URL:", safeUrl);
                  notifyTrayDeviceResult(`Device URL copied: ${safeUrl}`);
                }
              },
            },
            {
              label: "View in Dashboard",
              iconUrl: getTrayMenuIconUrl("dashboard"),
              click: () => {
                sendToDashboardWhenReady("dashboard:switch-tab", "devices");
              },
            },
          ],
        });
      });

      if (pairedDevices.length > 15) {
        otherDevicesSubmenu.push({
          label: `... and ${pairedDevices.length - 15} more devices`,
          enabled: false,
        });
      }
    } else {
      otherDevicesSubmenu.push(
        {
          label: "No Paired Devices",
          iconUrl: getTrayMenuIconUrl("warning"),
          enabled: false,
        },
        {
          label: "Pair via QR Code...",
          iconUrl: getTrayMenuIconUrl("qr"),
          click: () => {
            sendToDashboardWhenReady("dashboard:switch-tab", "connect");
          },
        },
      );
    }

    menuTemplate.push({
      label:
        pairedDevices.length > 0
          ? `My Device (${pairedDevices.length})`
          : "My Device (No Device)",
      iconUrl: getTrayMenuIconUrl("phone"),
      submenu: otherDevicesSubmenu,
    });

    // Shared Files Section
    if (fileCount > 0) {
      const filesSubmenu = currentSharedFiles
        .slice(0, 15)
        .map((filePath, index) => {
          const fileName = path.basename(filePath);
          return {
            label: `${index + 1}. ${fileName}`,
            iconUrl: getTrayMenuIconUrl("files"),
            submenu: [
              {
                label: "Show in Folder",
                iconUrl: getTrayMenuIconUrl("folder"),
                click: () => {
                  logger.info("Showing in folder:", filePath);
                  shell.showItemInFolder(filePath);
                },
              },
              {
                label: "Copy Download Link",
                iconUrl: getTrayMenuIconUrl("copy"),
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
                label: "Remove File",
                iconUrl: getTrayMenuIconUrl("exit"),
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
        label: "Remove All Shared Files",
        iconUrl: getTrayMenuIconUrl("trash"),
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
          label: `Shared Files (${fileCount})`,
          iconUrl: getTrayMenuIconUrl("folder"),
          submenu: filesSubmenu,
        },
      );
    } else {
      menuTemplate.push(
        { type: "separator" },
        {
          label: "No files currently shared",
          iconUrl: getTrayMenuIconUrl("folder"),
          enabled: false,
        },
      );
    }

    // Settings Submenu & Exit
    menuTemplate.push(
      { type: "separator" },
      {
        label: "Settings",
        iconUrl: getTrayMenuIconUrl("settings"),
        submenu: [
          {
            label: "Open Settings",
            iconUrl: getTrayMenuIconUrl("settings"),
            click: () => {
              logger.info("Opening settings in dashboard");
              const win = showDashboardWindow();
              if (win && !win.isDestroyed())
                win.webContents.send("dashboard:switch-tab", "settings");
            },
          },
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
        ],
      },
      { type: "separator" },
      {
        label: "Exit LocalShare",
        iconUrl: getTrayMenuIconUrl("exit"),
        click: () => {
          logger.info("Exit clicked, quitting app");
          app.quit();
        },
      },
    );

    latestMenuTemplate = menuTemplate;
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
  syncTrayPairedDevices,
  destroyTrayMenuWindows,
};
