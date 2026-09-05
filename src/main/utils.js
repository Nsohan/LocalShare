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

      // Never auto-share electron executable, server helpers, or files inside node_modules (e.g. electronmon hooks)
      if (
        resolvedPath === execPath ||
        resolvedPath.includes("pcsrv.exe") ||
        resolvedPath.includes("node_modules")
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

module.exports = {
  getLocalIP,
  filterValidFiles,
};
