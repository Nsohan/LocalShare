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
  const execPath = path.resolve(process.execPath).toLowerCase();
  return args.filter((arg) => {
    try {
      const resolvedPath = path.resolve(arg).toLowerCase();
      return (
        fs.existsSync(arg) &&
        fs.statSync(arg).isFile() &&
        resolvedPath !== execPath &&
        !resolvedPath.includes("pcsrv.exe")
      );
    } catch (err) {
      console.error(`Error processing file ${arg}:`, err);
      return false;
    }
  });
}

module.exports = {
  getLocalIP,
  filterValidFiles,
};
