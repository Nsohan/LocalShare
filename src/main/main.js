/**
 * Main Electron application entry point
 */
const {
  app,
  BrowserWindow,
  Notification,
  ipcMain,
  shell,
  dialog,
  clipboard,
} = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const cp = require("child_process");
const logger = require("../config/logger");

// Import local modules
const { createTray, updateTrayMenu } = require("./tray");
const { filterValidFiles, getLocalIP } = require("./utils");
const { getConfig, setConfig, updateConfig } = require("../config/config");
const {
  showDashboardWindow,
  getDashboardWindow,
} = require("./windows/dashboard");

// Make sure app is ready before requiring config
let configReady = false;

// Set application name and ID
app.name = "LocalShare";
app.setAppUserModelId("com.nhs.LocalShare");

// Ensure only one instance
const gotTheLock = app.requestSingleInstanceLock();

// Global variables
let serverProcess = null;
let sharedFiles = [];
let tray = null;

/**
 * Get safe application icon path
 */
function getAppIcon() {
  const icoPath = path.join(__dirname, "../../build/icon.ico");
  if (fs.existsSync(icoPath)) return icoPath;
  return path.join(__dirname, "../../icon.png");
}

/**
 * Show notification if user enabled notifications in settings
 */
function showAppNotification(options) {
  if (getConfig("notifications") === false) {
    logger.debug("Notifications suppressed by user config:", options.title);
    return;
  }
  try {
    new Notification({
      ...options,
      icon: options.icon || getAppIcon(),
    }).show();
  } catch (err) {
    logger.error("Error showing notification:", err);
  }
}

/**
 * Focus dashboard and switch to a specific tab
 */
function navigateDashboard(tab = "files") {
  const win = showDashboardWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send("dashboard:switch-tab", tab);
  }
  return win;
}

/**
 * Format bytes to readable size
 */
function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Format shared files array with rich metadata
 */
function getFormattedFiles(filePaths = sharedFiles) {
  return filePaths
    .filter(
      (filePath) => typeof filePath === "string" && fs.existsSync(filePath),
    )
    .map((filePath, index) => {
      try {
        const stats = fs.statSync(filePath);
        const ext = path.extname(filePath).toLowerCase().replace(".", "");
        return {
          id: index,
          path: filePath,
          name: path.basename(filePath),
          size: formatFileSize(stats.size),
          sizeBytes: stats.size,
          extension: ext || "file",
          dateAdded: stats.mtime
            ? stats.mtime.toISOString()
            : new Date().toISOString(),
        };
      } catch (err) {
        return {
          id: index,
          path: filePath,
          name: path.basename(filePath),
          size: "Unknown",
          sizeBytes: 0,
          extension: "file",
          dateAdded: new Date().toISOString(),
        };
      }
    });
}

/**
 * Get the full dashboard state object
 */
function getDashboardState() {
  const port = getConfig("port") || 5199;
  const ip = getLocalIP();
  return {
    sentFiles: getFormattedFiles(),
    receivedFiles: getConfig("receivedFiles") || [],
    devices: getConfig("devices") || [],
    serverInfo: {
      ip,
      port,
      url: `http://${ip}:${port}`,
      isRunning: serverProcess !== null,
    },
    config: getConfig(),
  };
}

/**
 * Broadcast updated state to the dashboard window
 */
function broadcastDashboardState() {
  const win = getDashboardWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send("dashboard:state-updated", getDashboardState());
    win.webContents.send("file-lists", {
      sentFiles: getFormattedFiles(),
      receivedFiles: getConfig("receivedFiles") || [],
    });
  }
}

/**
 * Clear all shared files
 */
function clearAllSharedFiles() {
  logger.info("Clearing all shared files");
  sharedFiles.length = 0; // Clear the array
  broadcastDashboardState();
  return sharedFiles;
}

/**
 * Start the server with specified file paths
 * @param {string[]} filePaths - Array of file paths to share
 * @param {number} [port] - Optional port number to use
 * @returns {Promise<boolean>} Success status
 */
async function startServer(filePaths = [], port = null) {
  // Get port from config if not specified
  const serverPort = port || getConfig("port") || 5199;

  logger.info(`Starting server on port ${serverPort} with files:`, filePaths);
  try {
    if (serverProcess) {
      logger.info("Killing existing server process...");
      await new Promise((resolve, reject) => {
        serverProcess.on("exit", () => {
          logger.info("Previous server process terminated.");
          resolve();
        });
        serverProcess.on("error", (err) => {
          logger.error("Error killing server process:", err);
          reject(err);
        });

        // Try to kill gracefully
        try {
          serverProcess.kill("SIGTERM");
        } catch (err) {
          logger.error("Error during kill:", err);
          // Force resolve anyway to continue
          resolve();
        }
      });
      serverProcess = null;
    }

    // Make sure server file exists
    const serverPath = path.join(__dirname, "../server/server.js");
    if (!fs.existsSync(serverPath)) {
      throw new Error(`Server file not found at ${serverPath}`);
    }

    logger.info(
      `Forking new server process on port ${serverPort}:`,
      serverPath,
    );

    // Make sure file paths are strings
    const sanitizedPaths = filePaths.filter(
      (p) => typeof p === "string" && fs.existsSync(p),
    );
    logger.debug("Sanitized file paths:", sanitizedPaths);

    serverProcess = cp.fork(serverPath, sanitizedPaths, {
      stdio: ["pipe", "pipe", "pipe", "ipc"],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        LOG_PATH: logger.getLogPath(), // Pass log path to child process
        PORT: serverPort, // Pass the port to use
        NOTIFICATIONS: getConfig("notifications") === false ? "false" : "true",
      },
    });

    serverProcess.on("error", (err) => {
      logger.error("Server process error:", err);
      new Notification({
        title: "LocalShare Error",
        body: "Failed to start server. Please try again.",
        icon: getAppIcon(),
      }).show();
    });

    serverProcess.on("exit", (code) => {
      logger.info(`Server process exited with code ${code}`);
      if (code !== 0 && code !== null) {
        new Notification({
          title: "LocalShare Error",
          body: "Server stopped unexpectedly.",
          icon: getAppIcon(),
        }).show();
      }
    });

    serverProcess.stdout.on("data", (data) => {
      logger.info(`Server stdout: ${data.toString().trim()}`);
    });

    serverProcess.stderr.on("data", (data) => {
      logger.error(`Server stderr: ${data.toString().trim()}`);
    });

    // Handle IPC messages from child server process
    serverProcess.on("message", (msg) => {
      if (msg && msg.type === "files-received" && Array.isArray(msg.files)) {
        logger.info("Server process reported received files:", msg.files);
        const currentReceived = getConfig("receivedFiles") || [];
        const updated = [...msg.files, ...currentReceived];
        setConfig("receivedFiles", updated);
        broadcastDashboardState();

        const fileCount = msg.files.length;
        if (fileCount > 0) {
          showAppNotification({
            title: "LocalShare - File Received",
            body:
              fileCount === 1
                ? `Received "${msg.files[0].name}" (${msg.files[0].size})`
                : `Received ${fileCount} files in Downloads/LocalShare`,
          });
        }
      } else if (
        msg &&
        msg.type === "clipboard-copy" &&
        typeof msg.text === "string"
      ) {
        logger.info(
          "Received remote clipboard text (length:",
          msg.text.length,
          ")",
        );
        clipboard.writeText(msg.text);

        const preview =
          msg.text.length > 60 ? msg.text.slice(0, 60) + "..." : msg.text;
        showAppNotification({
          title: "LocalShare - Copied to Clipboard",
          body: `"${preview}" (Ready to Ctrl+V)`,
        });

        const win = getDashboardWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send("dashboard:clipboard-received", {
            text: msg.text,
            preview,
            length: msg.text.length,
          });
        }
      } else if (msg && msg.type === "custom-notification") {
        showAppNotification({
          title: msg.title || "LocalShare",
          body: msg.message || "",
        });
      }
    });

    // Save last files to config
    if (configReady) {
      setConfig("lastFiles", sanitizedPaths);
    }

    return true;
  } catch (err) {
    logger.error("Error in startServer:", err);
    new Notification({
      title: "LocalShare Error",
      body: "Failed to start server. Check logs for details.",
      icon: getAppIcon(),
    }).show();
    return false;
  }
}

/**
 * Create or show the main dashboard window
 */
function createMainWindow() {
  return showDashboardWindow();
}

/**
 * Add files to share (via file picker dialog or passed file paths)
 * @param {string[]|null} customPaths
 * @returns {Promise<string[]>} updated sharedFiles
 */
async function addFilesToShare(customPaths = null) {
  try {
    let pathsToAdd = [];
    if (Array.isArray(customPaths) && customPaths.length > 0) {
      pathsToAdd = filterValidFiles(customPaths);
    } else {
      const win = getDashboardWindow();
      const result = await dialog.showOpenDialog(win || undefined, {
        title: "Select Files to Share",
        buttonLabel: "Share",
        properties: ["openFile", "multiSelections"],
      });
      if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
        pathsToAdd = filterValidFiles(result.filePaths);
      }
    }

    if (pathsToAdd.length > 0) {
      sharedFiles = [...new Set([...sharedFiles, ...pathsToAdd])];
      await startServer(sharedFiles);
      updateTrayMenu(sharedFiles);
      broadcastDashboardState();

      showAppNotification({
        title: "LocalShare",
        body: `${pathsToAdd.length} file${pathsToAdd.length > 1 ? "s" : ""} added to share`,
      });
    }
  } catch (err) {
    logger.error("Error adding files to share:", err);
  }
  return sharedFiles;
}

/**
 * Remove a shared file by file path or index
 * @param {string|null} filePath
 * @param {number|null} id
 * @returns {Promise<string[]>} updated sharedFiles
 */
async function removeSharedFile(filePath = null, id = null) {
  try {
    if (filePath) {
      sharedFiles = sharedFiles.filter((p) => p !== filePath);
    } else if (typeof id === "number" && sharedFiles[id] !== undefined) {
      sharedFiles.splice(id, 1);
    }
    await startServer(sharedFiles);
    updateTrayMenu(sharedFiles);
    broadcastDashboardState();
  } catch (err) {
    logger.error("Error removing shared file:", err);
  }
  return sharedFiles;
}

// Handle second instance (when app is already running)
if (!gotTheLock) {
  logger.info("Another instance is already running, quitting...");
  app.quit();
} else {
  app.on("second-instance", async (event, commandLine) => {
    logger.info("Second instance detected with args:", commandLine);

    // Show main window when second instance is launched
    const win = showDashboardWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("dashboard:switch-tab", "files");
    }

    try {
      const rawArgs = Array.isArray(commandLine) ? commandLine.slice(1) : [];
      const newFiles = filterValidFiles(rawArgs);

      if (newFiles.length > 0) {
        logger.info("New files to share:", newFiles);
        sharedFiles = [...new Set([...sharedFiles, ...newFiles])];
        await startServer(sharedFiles);
        updateTrayMenu(sharedFiles);
        broadcastDashboardState();

        // Notification logic
        if (newFiles.length === 1) {
          // Single file: show file name
          showAppNotification({
            title: "LocalShare",
            body: `File added: ${path.basename(newFiles[0])}`,
          });
        } else {
          // Multiple files: show count
          showAppNotification({
            title: "LocalShare",
            body: `${newFiles.length} files added`,
          });
        }
      } else {
        logger.info("No valid files found in second instance args.");
      }
    } catch (err) {
      logger.error("Error in second-instance handler:", err);
      showAppNotification({
        title: "LocalShare Error",
        body: "Failed to process new files. Check logs for details.",
      });
    }
  });

  // ==========================
  // IPC Handlers
  // ==========================

  // Dashboard navigation request
  ipcMain.on("dashboard:navigate", (event, tab) => {
    navigateDashboard(tab);
  });

  // Dashboard state query
  ipcMain.on("dashboard:get-state", (event) => {
    event.sender.send("dashboard:state-updated", getDashboardState());
  });

  // Legacy dashboard support
  ipcMain.on("get-file-lists", (event) => {
    event.sender.send("file-lists", {
      sentFiles: getFormattedFiles(),
      receivedFiles: getConfig("receivedFiles") || [],
    });
  });

  // Add files to share (via file picker dialog or drag-and-drop paths)
  ipcMain.on("dashboard:add-files", async (event, customPaths = null) => {
    await addFilesToShare(customPaths);
  });

  // Remove single file
  ipcMain.on(
    "dashboard:remove-file",
    async (event, { path: filePath, id, tab }) => {
      try {
        if (tab === "send" || !tab) {
          await removeSharedFile(filePath, id);
        } else if (tab === "received") {
          const received = getConfig("receivedFiles") || [];
          const updated = received.filter(
            (item, index) => index !== id && item.path !== filePath,
          );
          setConfig("receivedFiles", updated);
          broadcastDashboardState();
        }
      } catch (err) {
        logger.error("Error removing file:", err);
      }
    },
  );

  ipcMain.on("remove-file", async (event, data) => {
    const filePath =
      data && data.path
        ? data.path
        : typeof data.id === "number" && sharedFiles[data.id]
          ? sharedFiles[data.id]
          : null;
    ipcMain.emit("dashboard:remove-file", event, {
      path: filePath,
      id: data.id,
      tab: data.tab,
    });
  });

  // Remove all files
  ipcMain.on("dashboard:remove-all", async (event, tab) => {
    try {
      if (tab === "send" || !tab) {
        sharedFiles.length = 0;
        await startServer(sharedFiles);
        updateTrayMenu(sharedFiles);
        broadcastDashboardState();
      } else if (tab === "received") {
        setConfig("receivedFiles", []);
        broadcastDashboardState();
      }
    } catch (err) {
      logger.error("Error removing all files:", err);
    }
  });

  ipcMain.on("remove-all-files", async (event, tab) => {
    ipcMain.emit("dashboard:remove-all", event, tab);
  });

  // Clear all history (recent files and received files)
  ipcMain.on("dashboard:clear-history", (event) => {
    setConfig("lastFiles", []);
    setConfig("receivedFiles", []);
    broadcastDashboardState();
    event.sender.send("dashboard:history-cleared", { success: true });
    showAppNotification({
      title: "LocalShare",
      body: "Transfer history cleared successfully.",
    });
  });

  // Quick action: Open QR code view
  ipcMain.on("dashboard:open-qr", () => {
    navigateDashboard("connect");
  });

  // Quick action: Open in browser
  ipcMain.on("dashboard:open-browser", () => {
    const port = getConfig("port") || 5199;
    shell.openExternal(`http://localhost:${port}`);
  });

  // Quick action: Reveal in file manager
  ipcMain.on("dashboard:open-folder", (event, filePath) => {
    if (filePath && fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
    }
  });

  // Quick action: Copy server link
  ipcMain.on("dashboard:copy-link", (event) => {
    const port = getConfig("port") || 5199;
    const ip = getLocalIP();
    const url = `http://${ip}:${port}`;
    clipboard.writeText(url);
  });

  // ==========================
  // Device Pairing & Polling IPC
  // ==========================

  // Poll device server to check if 6-digit key was entered and accepted
  ipcMain.handle("devices:poll-check", async (event, { deviceUrl, pairingKey }) => {
    if (!deviceUrl) {
      return { connected: false, error: "Empty URL", message: "Enter device URL" };
    }

    let urlStr = deviceUrl.trim();
    if (!/^https?:\/\//i.test(urlStr)) {
      urlStr = `http://${urlStr}`;
    }

    try {
      const parsedUrl = new URL(urlStr);
      // Append pairing parameters if not already present
      if (!parsedUrl.searchParams.has("key")) {
        parsedUrl.searchParams.set("key", pairingKey);
      }
      parsedUrl.searchParams.set("pc", os.hostname());

      logger.info(`devices:poll-check fetching: ${parsedUrl.toString()}`);

      const controller = new AbortController();
      // Allow up to 25s for mobile user to enter PIN in popup dialog
      const timeoutId = setTimeout(() => controller.abort(), 25000);

      const res = await fetch(parsedUrl.toString(), {
        method: "GET",
        signal: controller.signal,
        headers: {
          Accept: "application/json, text/plain, */*",
          "X-Pairing-Key": pairingKey,
          "X-Device-Type": "desktop",
        },
      });

      clearTimeout(timeoutId);
      logger.info(`devices:poll-check response status: ${res.status}`);

      const contentType = res.headers.get("content-type") || "";
      let data = null;
      let text = "";

      if (contentType.includes("application/json")) {
        try {
          data = await res.json();
          logger.info(`devices:poll-check JSON body:`, data);
        } catch (e) {
          text = await res.text();
        }
      } else {
        text = await res.text();
      }

      // 2xx response
      if (res.status >= 200 && res.status < 300) {
        if (data) {
          // If JSON explicitly marks pending or failure
          if (
            data.success === false ||
            data.status === "error" ||
            data.status === "pending" ||
            data.paired === false ||
            data.waiting === true
          ) {
            return {
              connected: false,
              status: res.status,
              message: data.message || "Waiting for key entry on mobile...",
            };
          }

          return {
            connected: true,
            status: res.status,
            deviceName:
              data.name ||
              data.deviceName ||
              data.hostname ||
              data.model ||
              data.device ||
              null,
            data,
          };
        }

        const lowerText = text.toLowerCase().trim();
        if (
          lowerText.includes("wait") ||
          lowerText.includes("pending") ||
          lowerText.includes("unauthorized") ||
          lowerText.includes("invalid") ||
          lowerText.includes("not ready")
        ) {
          return {
            connected: false,
            status: res.status,
            message: "Waiting for key entry on mobile...",
          };
        }

        return {
          connected: true,
          status: res.status,
          text,
        };
      }

      return {
        connected: false,
        status: res.status,
        message: `HTTP ${res.status}: Waiting for authorization...`,
      };
    } catch (err) {
      logger.error("devices:poll-check error:", err);
      if (err.name === "AbortError" || err.message?.includes("aborted")) {
        return { connected: false, error: "timeout", message: "Waiting for PIN entry on phone..." };
      }
      return {
        connected: false,
        error: err.code || err.message,
        message: `${err.message || "Connection failed"}`,
      };
    }
  });

  // Save new paired device
  ipcMain.handle("devices:save", async (event, newDevice) => {
    try {
      const devices = getConfig("devices") || [];
      const filtered = devices.filter(
        (d) => d.id !== newDevice.id && d.url !== newDevice.url,
      );
      const updated = [newDevice, ...filtered];
      setConfig("devices", updated);
      broadcastDashboardState();

      showAppNotification({
        title: "LocalShare - Device Connected",
        body: `"${newDevice.name}" was successfully paired!`,
      });

      return { success: true, devices: updated };
    } catch (err) {
      logger.error("Error saving device:", err);
      return { success: false, error: err.message };
    }
  });

  // Remove paired device
  ipcMain.handle("devices:remove", async (event, deviceId) => {
    try {
      const devices = getConfig("devices") || [];
      const updated = devices.filter((d) => d.id !== deviceId);
      setConfig("devices", updated);
      broadcastDashboardState();
      return { success: true, devices: updated };
    } catch (err) {
      logger.error("Error removing device:", err);
      return { success: false, error: err.message };
    }
  });

  // Test single device connection
  ipcMain.handle("devices:test-connection", async (event, deviceUrl) => {
    const start = Date.now();
    try {
      let urlStr = deviceUrl.trim();
      if (!/^https?:\/\//i.test(urlStr)) urlStr = `http://${urlStr}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(urlStr, { signal: controller.signal });
      clearTimeout(timeoutId);
      return {
        online: res.status < 500,
        status: res.status,
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      return {
        online: false,
        error: err.message,
        latencyMs: Date.now() - start,
      };
    }
  });

  // Open main dashboard window
  ipcMain.on("show-dashboard", () => {
    logger.info("IPC: Opening dashboard window");
    showDashboardWindow();
  });

  // Open settings view
  ipcMain.on("open-settings", () => {
    logger.info("IPC: Navigating to settings view");
    navigateDashboard("settings");
  });

  // Get settings
  ipcMain.on("settings:get", (event) => {
    logger.info("IPC: Getting settings");
    const config = getConfig();
    event.sender.send("settings:current", config);
  });

  // Save settings including tray synchronization
  ipcMain.on("settings:save", (event, newSettings) => {
    logger.info("IPC: Saving settings", newSettings);
    try {
      // Get current autostart setting before updating
      const currentAutostart = getConfig("autostart");

      // Save the new settings
      const success = updateConfig(newSettings);

      // If autostart setting changed, update system login items
      if (success && currentAutostart !== newSettings.autostart) {
        logger.info("Autostart setting changed, updating system");
        app.setLoginItemSettings({
          openAtLogin: newSettings.autostart === true,
          path: process.execPath,
          args: [],
        });
      }

      broadcastDashboardState();
      updateTrayMenu(sharedFiles);

      event.sender.send("settings:saved", {
        success,
        updatedConfig: getConfig(),
      });
    } catch (err) {
      logger.error("Error saving settings:", err);
      event.sender.send("settings:saved", {
        success: false,
        error: err.message,
      });
    }
  });

  // Open logs file
  ipcMain.on("logs:open", (event) => {
    logger.info("IPC: Opening logs file");
    try {
      shell.openPath(logger.getLogPath());
    } catch (err) {
      logger.error("Error opening logs file:", err);
    }
  });

  // Restart server (for port changes)
  ipcMain.on("server:restart", async (event) => {
    logger.info("IPC: Restarting server");
    try {
      // Get the current port from config
      const port = getConfig("port");

      // Restart the server with the new port
      const success = await startServer(sharedFiles, port);

      if (success) {
        // Update tray menu with new port info
        updateTrayMenu(sharedFiles, port);
        broadcastDashboardState();

        showAppNotification({
          title: "LocalShare",
          body: `Server restarted on port ${port}`,
        });
      }

      event.sender.send("server:restarted", { success });
    } catch (err) {
      logger.error("Error restarting server:", err);
      event.sender.send("server:restarted", {
        success: false,
        error: err.message,
      });
    }
  });

  // Application ready event
  app.whenReady().then(async () => {
    logger.info("App starting with initial args:", process.argv);
    try {
      // Now we can safely access config
      configReady = true;

      // Set autostart based on config (default is true)
      const autostart = getConfig("autostart");
      logger.info("Setting login item settings:", { autostart });

      app.setLoginItemSettings({
        openAtLogin: autostart === false ? false : true, // Default to true if undefined
        path: process.execPath,
        args: [],
      });

      // Process initial files from command line arguments
      const initialFiles = filterValidFiles(process.argv.slice(1));
      sharedFiles = initialFiles || [];
      logger.info("Initial shared files:", sharedFiles);

      // Create tray with quick action handlers and live state sync
      tray = createTray(
        sharedFiles,
        startServer,
        () => updateTrayMenu(sharedFiles),
        clearAllSharedFiles,
        {
          addFilesToShare,
          removeSharedFile,
          broadcastDashboardState,
        },
      );

      // Check if dashboard should be opened at start
      const openDashboardAtStart = getConfig("openDashboardAtStart");
      if (openDashboardAtStart !== false) {
        showDashboardWindow();
      }

      // Start server with shared files
      const success = await startServer(sharedFiles);
      logger.info("Server start result:", success);

      app.on("activate", () => {
        showDashboardWindow();
      });
    } catch (err) {
      logger.error("Error during app startup:", err);
      new Notification({
        title: "LocalShare Error",
        body: "Failed to start app. Check logs for details.",
        icon: getAppIcon(),
      }).show();
    }
  });

  app.on("window-all-closed", () => {
    logger.debug("All windows closed");
  });

  // Handle app quit properly
  app.on("before-quit", () => {
    app.isQuiting = true;
    logger.info("App quitting...");
    if (serverProcess) {
      logger.info("Killing server process on app quit...");
      try {
        serverProcess.kill("SIGTERM");
      } catch (err) {
        logger.error("Error killing server process during quit:", err);
      }
      serverProcess = null;
    }
  });
}

// Export functions needed by other modules
module.exports = {
  sharedFiles,
  startServer,
  createMainWindow,
  clearAllSharedFiles,
  addFilesToShare,
  removeSharedFile,
  broadcastDashboardState,
  navigateDashboard,
  showAppNotification,
};
