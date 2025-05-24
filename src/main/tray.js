/**
 * Tray functionality for LocalShare
 */
const { app, Tray, Menu, shell, dialog, Notification } = require("electron");
const path = require("path");
const logger = require("../config/logger");
const { showQRCodeWindow } = require("./windows/qrcode");
const { showAboutWindow } = require("./windows/about");
const { showDashboardWindow } = require("./windows/dashboard");
const { showSettingsWindow } = require("./windows/settings");
const { getLocalIP } = require("./utils");
const { getConfig, setConfig } = require("../config/config");

// Declare tray as global to prevent garbage collection
let tray = null;
let clearAllSharedFilesCallback = null;
let startServerCallback = null;
let updateTrayMenuCallback = null;

/**
 * Creates the system tray icon and menu
 * @param {Array} sharedFiles - Array of files being shared
 * @param {Function} startServer - Function to restart the server
 * @param {Function} updateTrayMenuCallback - Function to update tray menu
 * @param {Function} clearAllSharedFiles - Function to clear all shared files
 * @returns {Tray} - The created tray instance
 */
function createTray(
  sharedFiles = [],
  startServer = null,
  updateTrayMenuCb = null,
  clearAllSharedFiles = null
) {
  logger.info("Creating tray icon");

  // Store the callbacks globally so they can be used in updateTrayMenu
  clearAllSharedFilesCallback = clearAllSharedFiles;
  startServerCallback = startServer;
  updateTrayMenuCallback = updateTrayMenuCb;

  try {
    // First try the ICO file for Windows
    const iconPath = path.join(__dirname, "../../build/icon.ico");
    logger.debug("Tray icon path:", iconPath);

    // Check if icon exists
    const fs = require("fs");
    if (!fs.existsSync(iconPath)) {
      logger.error("Tray icon not found at:", iconPath);
      throw new Error(`Icon file not found at ${iconPath}`);
    }

    // Create tray with icon
    tray = new Tray(iconPath);
    tray.setToolTip("LocalShare - Double-click to open Dashboard");

    // Add double-click functionality to open dashboard
    tray.on("double-click", () => {
      logger.info("Tray double-clicked, opening dashboard");
      showDashboardWindow();
    });

    // Add single click functionality for Windows (optional)
    tray.on("click", () => {
      logger.info("Tray clicked");
      // On Windows, single click can also open dashboard
      if (process.platform === "win32") {
        showDashboardWindow();
      }
    });

    // Set up menu items
    updateTrayMenu(sharedFiles);

    // Log success
    logger.info("Tray icon created successfully");

    return tray;
  } catch (error) {
    logger.error("Error creating tray:", error);

    // Try fallback to PNG icon
    try {
      logger.info("Trying fallback PNG icon");
      const pngIconPath = path.join(__dirname, "../../icon.png");

      // Check if PNG icon exists
      const fs = require("fs");
      if (!fs.existsSync(pngIconPath)) {
        logger.error("PNG icon not found at:", pngIconPath);
        throw new Error(`PNG icon file not found at ${pngIconPath}`);
      }

      tray = new Tray(pngIconPath);
      tray.setToolTip("LocalShare - Double-click to open Dashboard");

      // Add event listeners for fallback icon too
      tray.on("double-click", () => {
        logger.info("Tray double-clicked (fallback icon), opening dashboard");
        showDashboardWindow();
      });

      tray.on("click", () => {
        logger.info("Tray clicked (fallback icon)");
        if (process.platform === "win32") {
          showDashboardWindow();
        }
      });

      updateTrayMenu(sharedFiles);

      logger.info("Tray created with fallback icon");
      return tray;
    } catch (fallbackError) {
      logger.error("Failed to create tray with fallback icon:", fallbackError);

      // Last resort - try to create a text-only tray
      logger.info("Creating text-only tray as last resort");
      tray = new Tray(path.join(__dirname, "../../public/favicon.ico"));
      tray.setToolTip("LocalShare - Double-click to open Dashboard");

      // Add event listeners for last resort icon too
      tray.on("double-click", () => {
        logger.info("Tray double-clicked (favicon), opening dashboard");
        showDashboardWindow();
      });

      tray.on("click", () => {
        logger.info("Tray clicked (favicon)");
        if (process.platform === "win32") {
          showDashboardWindow();
        }
      });

      updateTrayMenu(sharedFiles);

      return tray;
    }
  }
}

/**
 * Updates the tray menu with the current shared files
 * @param {Array} sharedFiles - Array of files being shared
 */
function updateTrayMenu(sharedFiles = []) {
  logger.info("Updating tray menu");

  if (!tray) {
    logger.error("Tray is null, cannot update menu");
    return;
  }

  try {
    const ip = getLocalIP();
    const port = getConfig("port") || 5199; // Default port

    // Create template for the menu
    const contextMenu = Menu.buildFromTemplate([
      {
        label:
          sharedFiles.length > 0
            ? `Sharing ${sharedFiles.length} file${
                sharedFiles.length === 1 ? "" : "s"
              }`
            : "No files being shared",
        enabled: false,
      },
      { type: "separator" },
      {
        label: "📊 Open Dashboard",
        click: () => {
          logger.info("Opening dashboard from menu");
          showDashboardWindow();
        },
      },
      {
        label: "🌐 Open in Browser",
        click: () => {
          logger.info("Opening in browser");
          shell.openExternal(`http://localhost:${port}`);
        },
      },
      {
        label: "📱 Show QR Code",
        click: () => {
          logger.info("Showing QR code");
          showQRCodeWindow(`http://${ip}:${port}`);
        },
      },
      { type: "separator" },
      {
        label: `📡 Server: ${ip}:${port}`,
        enabled: false,
      },
      { type: "separator" },
      {
        label: "⚙️ Settings",
        click: () => {
          logger.info("Opening settings");
          showSettingsWindow();
        },
      },
      {
        label: "ℹ️ About",
        click: () => {
          showAboutWindow();
          logger.info("Opening About window");
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
    ]);

    // Add shared files submenu if there are files
    if (sharedFiles.length > 0) {
      const filesSubmenu = sharedFiles.slice(0, 10).map((filePath, index) => ({
        label: `${index + 1}. ${path.basename(filePath)}`,
        click: () => {
          logger.info("Opening file location:", filePath);
          shell.showItemInFolder(filePath);
        },
      }));

      if (sharedFiles.length > 10) {
        filesSubmenu.push(
          { type: "separator" },
          {
            label: `... and ${sharedFiles.length - 10} more files`,
            enabled: false,
          }
        );
      }

      // Add "Delete All Shared Files" button at the bottom of the submenu
      filesSubmenu.push(
        { type: "separator" },
        {
          label: "🗑️ Delete All Shared Files",
          click: async () => {
            logger.info("Delete All Shared Files clicked");

            // Show confirmation dialog
            const result = await dialog.showMessageBox({
              type: "warning",
              buttons: ["Cancel", "Delete All"],
              defaultId: 0,
              cancelId: 0,
              title: "Confirm Delete All",
              message: "Are you sure you want to remove all shared files?",
              detail:
                "This will stop sharing all files but won't delete them from your computer.",
            });

            if (result.response === 1) {
              // User clicked "Delete All"
              try {
                // Use the callback to clear shared files from main.js
                if (
                  clearAllSharedFilesCallback &&
                  typeof clearAllSharedFilesCallback === "function"
                ) {
                  const clearedFiles = clearAllSharedFilesCallback();
                  logger.info("Shared files cleared:", clearedFiles);
                } else {
                  logger.error("clearAllSharedFilesCallback is not available");
                  throw new Error(
                    "Unable to clear shared files - callback not available"
                  );
                }

                // Restart the server with empty files array
                if (
                  startServerCallback &&
                  typeof startServerCallback === "function"
                ) {
                  await startServerCallback([]);
                  logger.info("Server restarted with empty files");
                } else {
                  logger.error("startServerCallback is not available");
                }

                // Update the tray menu
                updateTrayMenu([]);

                // Show notification
                new Notification({
                  title: "LocalShare",
                  body: "All shared files have been removed!",
                  icon: path.join(__dirname, "../../build/icon.ico"),
                }).show();

                logger.info("All shared files deleted successfully");
              } catch (error) {
                logger.error("Error deleting all shared files:", error);

                // Show error notification
                new Notification({
                  title: "LocalShare - Error",
                  body: "Failed to remove shared files. Please try again.",
                  icon: path.join(__dirname, "../../build/icon.ico"),
                }).show();
              }
            }
          },
          enabled: sharedFiles.length > 0,
        }
      );

      // Insert files submenu after the server info
      const filesMenu = {
        label: `📁 Shared Files (${sharedFiles.length})`,
        submenu: filesSubmenu,
      };

      // Find the separator after server info and insert files menu
      const separatorIndex = contextMenu.items.findIndex(
        (item, index) =>
          index > 4 &&
          item.type === "separator" &&
          contextMenu.items[index - 1].label &&
          contextMenu.items[index - 1].label.includes("Server:")
      );

      if (separatorIndex !== -1) {
        const newTemplate = [
          ...contextMenu.items.slice(0, separatorIndex),
          filesMenu,
          ...contextMenu.items.slice(separatorIndex),
        ];

        const newContextMenu = Menu.buildFromTemplate(
          newTemplate.map((item) => ({
            ...item,
            // Convert menu items to template format
            label: item.label,
            type: item.type,
            enabled: item.enabled,
            checked: item.checked,
            click: item.click,
            submenu: item.submenu,
          }))
        );

        tray.setContextMenu(newContextMenu);
      } else {
        tray.setContextMenu(contextMenu);
      }
    } else {
      // Set the menu without files submenu
      tray.setContextMenu(contextMenu);
    }

    logger.info("Tray menu updated successfully");
  } catch (error) {
    logger.error("Error updating tray menu:", error);
  }
}

module.exports = {
  createTray,
  updateTrayMenu,
};
