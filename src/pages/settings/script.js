/**
 * Settings page script for LocalShare
 * Manages user interface for settings
 */
const { ipcRenderer, shell } = require("electron");

// DOM Elements
const settingsForm = document.getElementById("settingsForm");
const autostart = document.getElementById("autostart");
const openDashboardAtStart = document.getElementById("openDashboardAtStart");
const notifications = document.getElementById("notifications");
const port = document.getElementById("port");
const theme = document.getElementById("theme");
const clearHistory = document.getElementById("clearHistory");
const openLogs = document.getElementById("openLogs");
const saveButton = document.getElementById("saveButton");
const cancelButton = document.getElementById("cancelButton");
const notification = document.getElementById("notification");
const notificationMessage = document.getElementById("notificationMessage");
const restartButton = document.createElement("button"); // New restart button

// Setup restart button (initially hidden)
restartButton.id = "restartButton";
restartButton.className = "warning-button";
restartButton.textContent = "Restart Server";
restartButton.style.display = "none";
document.querySelector("footer").insertBefore(restartButton, cancelButton);

// Current settings
let currentSettings = {};
let portChanged = false;

// Request current settings from main process
document.addEventListener("DOMContentLoaded", () => {
  console.log("Settings page loaded, requesting current settings");
  ipcRenderer.send("settings:get");
});

// Receive current settings from main process
ipcRenderer.on("settings:current", (event, config) => {
  console.log("Received settings:", config);
  currentSettings = config;
  populateForm(config);

  // Reset port changed flag when settings are loaded
  portChanged = false;
  restartButton.style.display = "none";
});

// Handle settings save response
ipcRenderer.on("settings:saved", (event, response) => {
  console.log("Settings save response:", response);

  if (response.success) {
    // Always show success notification
    showNotification("Settings saved successfully!", "success");

    // If port was changed, show the restart button and additional warning
    if (portChanged) {
      restartButton.style.display = "inline-block";
      // Show additional warning notification after a brief delay
      setTimeout(() => {
        showNotification(
          "Server restart required for port change to take effect",
          "warning"
        );
      }, 800);
    } else {
      restartButton.style.display = "none";
    }

    // Update current settings
    currentSettings = response.updatedConfig || currentSettings;

    // Notify main process to update tray menu with new autostart state
    console.log("Requesting tray menu update after settings save");
    ipcRenderer.send("tray:update", currentSettings.autostart);
  } else {
    showNotification(
      `Error saving settings: ${response.error || "Unknown error"}`,
      "error"
    );
  }
});

// Handle server restart response
ipcRenderer.on("server:restarted", (event, response) => {
  if (response.success) {
    showNotification(
      "Server restarted successfully on port " + currentSettings.port,
      "success"
    );
    restartButton.style.display = "none";
    portChanged = false;
  } else {
    showNotification(
      `Failed to restart server: ${response.error || "Unknown error"}`,
      "error"
    );
  }
});

// Populate form with current settings
function populateForm(config) {
  // Set form values
  autostart.checked = config.autostart === true;
  openDashboardAtStart.checked = config.openDashboardAtStart === true;
  notifications.checked = config.notifications === true;
  port.value = config.port || 5199;
  theme.value = config.theme || "light";

  // Apply current theme to page
  applyTheme(config.theme);
}

// Apply theme to the page
function applyTheme(themeName) {
  if (themeName === "dark") {
    document.body.setAttribute("data-theme", "dark");
  } else if (themeName === "system") {
    // Check system preference
    if (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
      document.body.setAttribute("data-theme", "dark");
    } else {
      document.body.setAttribute("data-theme", "light");
    }
  } else {
    // Default to light
    document.body.setAttribute("data-theme", "light");
  }
}

// Save settings
function saveSettings() {
  const newSettings = {
    autostart: autostart.checked,
    openDashboardAtStart: openDashboardAtStart.checked,
    notifications: notifications.checked,
    port: parseInt(port.value, 10),
    theme: theme.value,
  };

  // Validate port
  if (
    isNaN(newSettings.port) ||
    newSettings.port < 1024 ||
    newSettings.port > 65535
  ) {
    showNotification("Port must be between 1024 and 65535", "error");
    return;
  }

  // Check if port has changed
  portChanged = currentSettings.port !== newSettings.port;

  console.log(
    "Saving new settings:",
    newSettings,
    "Port changed:",
    portChanged
  );

  // Show immediate saving feedback
  showNotification("Saving settings...", "success");

  // Disable save button temporarily to prevent multiple clicks
  saveButton.disabled = true;
  saveButton.textContent = "Saving...";

  // Send new settings to main process
  ipcRenderer.send("settings:save", newSettings);

  // Re-enable save button after a short delay (in case of no response)
  setTimeout(() => {
    saveButton.disabled = false;
    saveButton.textContent = "Save Settings";
  }, 800);
}

// Restart server with new port
function restartServer() {
  console.log("Restarting server with new port:", currentSettings.port);
  showNotification("Restarting server...", "success");
  ipcRenderer.send("server:restart");
  restartButton.disabled = true;
  restartButton.textContent = "Restarting...";

  // Re-enable after a short delay
  setTimeout(() => {
    restartButton.disabled = false;
    restartButton.textContent = "Restart Server";
  }, 3000);
}

// Clear recent files history
function clearRecentFiles() {
  // Show confirmation dialog
  const confirmClear = confirm(
    "Are you sure you want to clear your recent files history?"
  );

  if (confirmClear) {
    const updatedSettings = {
      ...currentSettings,
      lastFiles: [],
    };

    console.log("Clearing recent files history");
    showNotification("Clearing recent files...", "success");
    ipcRenderer.send("settings:save", updatedSettings);
  }
}

// Open logs file
function openLogsFile() {
  console.log("Opening logs file");
  showNotification("Opening logs...", "success");
  ipcRenderer.send("logs:open");
}

// Show notification - Enhanced version
function showNotification(message, type) {
  // Clear any existing timeout
  if (window.notificationTimeout) {
    clearTimeout(window.notificationTimeout);
  }

  // Update notification content and show
  notificationMessage.textContent = message;
  notification.className = "notification " + type;

  console.log(`Showing ${type} notification: ${message}`);

  // Hide after 3 seconds (4 seconds for warnings to give more time to read)
  const hideDelay = type === "warning" ? 4000 : 3000;
  window.notificationTimeout = setTimeout(() => {
    notification.className = "notification";
  }, hideDelay);
}

// Listen for port input changes
port.addEventListener("input", () => {
  const newPort = parseInt(port.value, 10);
  // Highlight if port is different from current settings
  if (!isNaN(newPort) && newPort !== currentSettings.port) {
    port.classList.add("modified");
  } else {
    port.classList.remove("modified");
  }
});

// Listen for theme changes
theme.addEventListener("change", () => {
  applyTheme(theme.value);
});

// Event listeners
saveButton.addEventListener("click", saveSettings);
cancelButton.addEventListener("click", () => window.close());
clearHistory.addEventListener("click", clearRecentFiles);
openLogs.addEventListener("click", openLogsFile);
restartButton.addEventListener("click", restartServer);

// Prevent form submission (handle with our save button instead)
settingsForm.addEventListener("submit", (e) => {
  e.preventDefault();
});
