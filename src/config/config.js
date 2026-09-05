/**
 * Configuration management for LocalShare
 * Handles reading and writing to a JSON config file
 */
const fs = require("fs");
const path = require("path");

// Safe userData path resolver (supports Electron main process and child/node scripts)
function getUserDataPath() {
  try {
    const electron = require("electron");
    if (electron && electron.app && typeof electron.app.getPath === "function") {
      return electron.app.getPath("userData");
    }
  } catch (e) {
    // Ignore error in non-electron environments
  }
  const appData =
    process.env.APPDATA ||
    (process.platform === "darwin"
      ? path.join(process.env.HOME || "", "Library", "Application Support")
      : path.join(process.env.HOME || "", ".config"));
  return path.join(appData, "LocalShare");
}

// Path to the config file in the user data directory
const CONFIG_FILE = path.join(getUserDataPath(), "config.json");

// Default configuration values
const DEFAULT_CONFIG = {
  autostart: true,
  openDashboardAtStart: true,
  port: 5199,
  notifications: true,
  lastFiles: [],
  receivedFiles: [],
  devices: [],
  theme: "light",
};

/**
 * Ensures the config file exists, creates it with defaults if not
 */
function ensureConfigFile() {
  try {
    const configDir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    if (!fs.existsSync(CONFIG_FILE)) {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
      console.log(`Created default config at ${CONFIG_FILE}`);
    } else {
      // Validate JSON content
      try {
        const raw = fs.readFileSync(CONFIG_FILE, "utf8");
        JSON.parse(raw);
      } catch (parseErr) {
        console.warn(`Corrupted config at ${CONFIG_FILE}, restoring defaults`);
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
      }
    }
  } catch (err) {
    console.error("Error initializing config file:", err);
  }
}

/**
 * Get the entire config object or a specific key
 * @param {string} [key] - Optional key to get specific config value
 * @returns {any} The config value or entire config object
 */
function getConfig(key = null) {
  try {
    ensureConfigFile();
    const configData = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));

    if (key) {
      return configData[key] !== undefined
        ? configData[key]
        : DEFAULT_CONFIG[key];
    }

    return { ...DEFAULT_CONFIG, ...configData };
  } catch (err) {
    console.error("Error reading config:", err);
    return key ? DEFAULT_CONFIG[key] : DEFAULT_CONFIG;
  }
}

/**
 * Set a config value
 * @param {string} key - Config key to set
 * @param {any} value - Value to set
 * @returns {boolean} Success status
 */
function setConfig(key, value) {
  try {
    ensureConfigFile();

    const configData = getConfig();
    configData[key] = value;

    fs.writeFileSync(CONFIG_FILE, JSON.stringify(configData, null, 2));
    return true;
  } catch (err) {
    console.error("Error writing config:", err);
    return false;
  }
}

/**
 * Update multiple config values at once
 * @param {Object} newValues - Object with new config values
 * @returns {boolean} Success status
 */
function updateConfig(newValues) {
  try {
    ensureConfigFile();

    const configData = getConfig();
    const updatedConfig = { ...configData, ...newValues };

    fs.writeFileSync(CONFIG_FILE, JSON.stringify(updatedConfig, null, 2));
    return true;
  } catch (err) {
    console.error("Error updating config:", err);
    return false;
  }
}

// Initialize config file
ensureConfigFile();

module.exports = {
  getConfig,
  setConfig,
  updateConfig,
  CONFIG_FILE,
};
