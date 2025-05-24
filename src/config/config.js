/**
 * Configuration management for LocalShare
 * Handles reading and writing to a JSON config file
 */
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

// Path to the config file in the user data directory
const CONFIG_FILE = path.join(app.getPath("userData"), "config.json");

// Default configuration values
const DEFAULT_CONFIG = {
  autostart: true,
  openDashboardAtStart: true,
  port: 5199,
  notifications: true,
  lastFiles: [],
  receivedFiles: [],
  theme: "light",
};

/**
 * Ensures the config file exists, creates it with defaults if not
 */
function ensureConfigFile() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      // Create config directory if it doesn't exist
      const configDir = path.dirname(CONFIG_FILE);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      // Write default config
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
      console.log(`Created default config at ${CONFIG_FILE}`);
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
