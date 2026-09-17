/**
 * Utility functions for the main process
 */
const os = require("os");
const fs = require("fs");
const path = require("path");
const network = require("network");
const logger = require("../config/logger");

/**
 * Get the local IP address
 * @returns {string} Local IP address or localhost if none found
 */
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "localhost";
}

/**
 * Filter out invalid files from the command line arguments
 * @param {string[]} args - Command line arguments
 * @returns {string[]} Valid file paths
 */
function filterValidFiles(args) {
  if (!Array.isArray(args) || args.length === 0) return [];

  const execPath = path.resolve(process.execPath).toLowerCase();
  const validFiles = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (typeof arg !== "string" || !arg) continue;

    // Skip CLI flags and their argument values (e.g. --require <file>)
    if (arg.startsWith("-")) {
      if (arg === "--require" || arg === "-r" || arg === "--inspect") {
        i++; // Skip the required module path that follows the flag
      }
      continue;
    }

    try {
      const resolvedPath = path.resolve(arg).toLowerCase();
      const baseName = path.basename(resolvedPath).toLowerCase();

      // Never auto-share electron/localshare executable, runtime helpers, or files inside node_modules
      if (
        resolvedPath === execPath ||
        baseName === "localshare.exe" ||
        baseName === "electron.exe" ||
        baseName === "pcsrv.exe" ||
        resolvedPath.includes("node_modules") ||
        resolvedPath.endsWith("localshare.exe")
      ) {
        continue;
      }

      if (fs.existsSync(arg) && fs.statSync(arg).isFile()) {
        validFiles.push(path.resolve(arg));
      }
    } catch (err) {
      console.error(`Error processing file ${arg}:`, err);
    }
  }

  return validFiles;
}

/**
 * Resolves application icon path safely across dev and packaged modes
 */
function getAppIconPath() {
  const electron = require("electron");
  const electronApp = electron?.app;
  const root = path.join(__dirname, "../..");
  const appPath = electronApp?.getAppPath ? electronApp.getAppPath() : root;

  const candidates = [
    path.join(root, "build", "icon.ico"),
    path.join(root, "build", "icon.png"),
    path.join(root, "icon.png"),
    path.join(appPath, "build", "icon.ico"),
    path.join(appPath, "build", "icon.png"),
    path.join(appPath, "icon.png"),
    path.join(process.resourcesPath || "", "icon.png"),
    path.join(process.resourcesPath || "", "build", "icon.ico"),
  ];

  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return path.join(root, "icon.png");
}

/**
 * Returns nativeImage for window and tray icons
 */
function getAppNativeImage() {
  try {
    const { nativeImage } = require("electron");
    const iconPath = getAppIconPath();
    if (iconPath && fs.existsSync(iconPath)) {
      const img = nativeImage.createFromPath(iconPath);
      if (!img.isEmpty()) return img;
    }
  } catch (e) {
    // Ignore
  }
  return null;
}

/**
 * Returns icon file path string suitable for Notifications and BrowserWindow
 */
function getAppIcon() {
  return getAppIconPath();
}

module.exports = {
  getLocalIP,
  filterValidFiles,
  getAppIconPath,
  getAppNativeImage,
  getAppIcon,
};
