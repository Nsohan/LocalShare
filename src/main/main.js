/**
 * Main Electron application entry point
 */
const {
  app,
  BrowserWindow,
  Notification,
  ipcMain,
  shell,
} = require("electron");
const path = require("path");
const fs = require("fs");
const cp = require("child_process");
const logger = require("../config/logger");

// Import local modules
const { createTray, updateTrayMenu } = require("./tray");
const { filterValidFiles } = require("./utils");
const { getConfig, setConfig, updateConfig } = require("../config/config");
const { showSettingsWindow } = require("./windows/settings");
const { showDashboardWindow } = require("./windows/dashboard");

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
let mainWindow = null;

/**
 * Clear all shared files
 */
function clearAllSharedFiles() {
  logger.info("Clearing all shared files");
  sharedFiles.length = 0; // Clear the array
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
      serverPath
    );

    // Make sure file paths are strings
    const sanitizedPaths = filePaths.filter(
      (p) => typeof p === "string" && fs.existsSync(p)
    );
    logger.debug("Sanitized file paths:", sanitizedPaths);

    serverProcess = cp.fork(serverPath, sanitizedPaths, {
      stdio: ["pipe", "pipe", "pipe", "ipc"],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        LOG_PATH: logger.getLogPath(), // Pass log path to child process
        PORT: serverPort, // Pass the port to use
      },
    });

    serverProcess.on("error", (err) => {
      logger.error("Server process error:", err);
      new Notification({
        title: "LocalShare Error",
        body: "Failed to start server. Please try again.",
        icon: path.join(__dirname, "../../build/icon.ico"),
      }).show();
    });

    serverProcess.on("exit", (code) => {
      logger.info(`Server process exited with code ${code}`);
      if (code !== 0 && code !== null) {
        new Notification({
          title: "LocalShare Error",
          body: "Server stopped unexpectedly.",
          icon: path.join(__dirname, "../../build/icon.ico"),
        }).show();
      }
    });

    serverProcess.stdout.on("data", (data) => {
      logger.info(`Server stdout: ${data.toString().trim()}`);
    });

    serverProcess.stderr.on("data", (data) => {
      logger.error(`Server stderr: ${data.toString().trim()}`);
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
      icon: path.join(__dirname, "../../build/icon.ico"),
    }).show();
    return false;
  }
}

/**
 * Create or show the main dashboard window
 */
function createMainWindow() {
  logger.debug("Creating/showing main dashboard window");

  // If window already exists, just show and focus it
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }

  // Create new dashboard window
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, "../../build/icon.ico"),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    show: true,
    center: true,
    title: "LocalShare Dashboard",
  });

  // Load the dashboard page
  const dashboardPath = path.join(__dirname, "../pages/dashboard/index.html");
  mainWindow.loadFile(dashboardPath);

  // Handle window closed
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Minimize to tray instead of closing (optional)
  mainWindow.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();

      // Show notification on first minimize
      if (!mainWindow.hasShownMinimizeNotification) {
        new Notification({
          title: "LocalShare",
          body: "LocalShare is still running in the background. Access it from the system tray.",
          icon: path.join(__dirname, "../../build/icon.ico"),
        }).show();
        mainWindow.hasShownMinimizeNotification = true;
      }
    }
  });

  return mainWindow;
}

// Handle second instance (when app is already running)
if (!gotTheLock) {
  logger.info("Another instance is already running, quitting...");
  app.quit();
} else {
  app.on("second-instance", async (event, commandLine) => {
    logger.info("Second instance detected with args:", commandLine);

    // Show main window when second instance is launched
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    } else {
      createMainWindow();
    }

    try {
      const newFiles = filterValidFiles(commandLine);

      if (newFiles.length > 0) {
        logger.info("New files to share:", newFiles);
        sharedFiles = [...new Set([...sharedFiles, ...newFiles])];
        await startServer(sharedFiles);
        updateTrayMenu(sharedFiles);

        // Notification logic
        if (newFiles.length === 1) {
          // Single file: show file name
          new Notification({
            title: "LocalShare",
            body: `File added: ${path.basename(newFiles[0])}`,
            icon: path.join(__dirname, "../../build/icon.ico"),
          }).show();
        } else {
          // Multiple files: show count
          new Notification({
            title: "LocalShare",
            body: `${newFiles.length} files added`,
            icon: path.join(__dirname, "../../build/icon.ico"),
          }).show();
        }
      } else {
        logger.info("No valid files found in second instance args.");
      }
    } catch (err) {
      logger.error("Error in second-instance handler:", err);
      new Notification({
        title: "LocalShare Error",
        body: "Failed to process new files. Check logs for details.",
        icon: path.join(__dirname, "../../build/icon.ico"),
      }).show();
    }
  });

  // IPC handlers

  // Open main dashboard window
  ipcMain.on("show-dashboard", () => {
    logger.info("IPC: Opening dashboard window");
    createMainWindow();
  });

  // Open settings window
  ipcMain.on("open-settings", () => {
    logger.info("IPC: Opening settings window");
    showSettingsWindow();
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

      // If autostart setting changed, update system login items and tray
      if (success && currentAutostart !== newSettings.autostart) {
        logger.info("Autostart setting changed, updating system and tray");

        // Update system login item settings
        app.setLoginItemSettings({
          openAtLogin: newSettings.autostart === true,
          path: process.execPath,
          args: [],
        });
      }

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

        new Notification({
          title: "LocalShare",
          body: `Server restarted on port ${port}`,
          icon: path.join(__dirname, "../../build/icon.ico"),
        }).show();
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

      // Create tray first - pass the clearAllSharedFiles function
      tray = createTray(
        sharedFiles,
        startServer,
        () => updateTrayMenu(sharedFiles),
        clearAllSharedFiles
      );

      // Check if dashboard should be opened at start
      const openDashboardAtStart = getConfig("openDashboardAtStart");
      if (openDashboardAtStart !== false) {
        // Default to true if undefined
        createMainWindow();
      }

      // Start server with shared files
      const success = await startServer(sharedFiles);
      logger.info("Server start result:", success);

      app.on("activate", () => {
        // On macOS, re-create window when dock icon is clicked
        if (BrowserWindow.getAllWindows().length === 0) {
          createMainWindow();
        } else if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      });
    } catch (err) {
      logger.error("Error during app startup:", err);
      new Notification({
        title: "LocalShare Error",
        body: "Failed to start app. Check logs for details.",
        icon: path.join(__dirname, "../../build/icon.ico"),
      }).show();
    }
  });

  app.on("window-all-closed", () => {
    logger.debug("All windows closed");
    // On Windows/Linux, keep running in tray when windows are closed

    // On macOS, follow the platform convention
    if (process.platform === "darwin") {
      // On macOS, keep the app running but hide windows
    } else {
      // On Windows/Linux, keep running in background with tray
    }
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
};
