/**
 * Standalone floating Write Text modal window launched from the system tray
 */
const { BrowserWindow, screen, nativeTheme } = require("electron");
const path = require("path");
const logger = require("../../config/logger");
const { getAppIconPath, getAppNativeImage } = require("../utils");

let writeTextModalWindow = null;

function resolveTheme(theme) {
  if (theme === "light") return "light";
  if (theme === "dark") return "dark";
  return nativeTheme.shouldUseDarkColors ? "dark" : "light";
}

function getCenteredBounds(winWidth, winHeight) {
  const cursorPoint = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPoint);
  const workArea = display?.workArea || { x: 0, y: 0, width: 1280, height: 800 };
  return {
    x: Math.round(workArea.x + (workArea.width - winWidth) / 2),
    y: Math.round(workArea.y + (workArea.height - winHeight) / 2),
  };
}

/**
 * Open or focus the standalone Write Text modal window without showing the dashboard
 */
function showWriteTextModalWindow({
  deviceName = "Device",
  deviceUrl = "",
  theme = "dark",
} = {}) {
  if (!deviceUrl) return null;

  const resolvedTheme = resolveTheme(theme);
  const initPayload = {
    deviceName,
    deviceUrl,
    theme: resolvedTheme,
  };

  try {
    if (writeTextModalWindow && !writeTextModalWindow.isDestroyed()) {
      const bounds = writeTextModalWindow.getBounds();
      const { x, y } = getCenteredBounds(bounds.width, bounds.height);
      writeTextModalWindow.setPosition(x, y);
      writeTextModalWindow.webContents.send("write-text-modal:init", initPayload);
      if (writeTextModalWindow.isMinimized()) writeTextModalWindow.restore();
      writeTextModalWindow.show();
      writeTextModalWindow.focus();
      return writeTextModalWindow;
    }

    const winWidth = 500;
    const winHeight = 420;
    const { x, y } = getCenteredBounds(winWidth, winHeight);
    const appIcon = getAppNativeImage() || getAppIconPath();

    writeTextModalWindow = new BrowserWindow({
      width: winWidth,
      height: winHeight,
      x,
      y,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      title: `Write Text - ${deviceName}`,
      icon: appIcon,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    writeTextModalWindow.setAlwaysOnTop(true, "pop-up-menu");

    const pagePath = path.join(
      __dirname,
      "../../pages/write-text-modal/index.html"
    );
    writeTextModalWindow.loadFile(pagePath);

    writeTextModalWindow.webContents.once("did-finish-load", () => {
      if (writeTextModalWindow && !writeTextModalWindow.isDestroyed()) {
        writeTextModalWindow.webContents.send("write-text-modal:init", initPayload);
      }
    });

    writeTextModalWindow.once("ready-to-show", () => {
      if (writeTextModalWindow && !writeTextModalWindow.isDestroyed()) {
        writeTextModalWindow.show();
        writeTextModalWindow.focus();
      }
    });

    writeTextModalWindow.on("closed", () => {
      writeTextModalWindow = null;
    });

    return writeTextModalWindow;
  } catch (err) {
    logger.error("Failed to open standalone Write Text modal window:", err);
    return null;
  }
}

function closeWriteTextModalWindow() {
  if (writeTextModalWindow && !writeTextModalWindow.isDestroyed()) {
    writeTextModalWindow.close();
  }
  writeTextModalWindow = null;
}

module.exports = {
  showWriteTextModalWindow,
  closeWriteTextModalWindow,
};

