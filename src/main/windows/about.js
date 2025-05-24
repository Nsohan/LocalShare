/**
 * About window functionality
 */
const { BrowserWindow } = require("electron");
const path = require("path");

// Keep a reference to prevent garbage collection
let aboutWindow = null;

/**
 * Show the about window
 */
function showAboutWindow() {
  if (aboutWindow) {
    aboutWindow.focus();
    return;
  }

  aboutWindow = new BrowserWindow({
    width: 500,
    height: 600,
    resizable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    title: "About LocalShare",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Load the about HTML page
  aboutWindow.loadFile(path.join(__dirname, "../../pages/about/index.html"));

  aboutWindow.on("closed", () => {
    aboutWindow = null;
  });
}

module.exports = {
  showAboutWindow,
};
