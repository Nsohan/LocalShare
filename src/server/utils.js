/**
 * Utility functions for the server
 */
const fs = require('fs');
const path = require('path');

/**
 * Setup shared files from command line arguments
 * @param {string[]} filePaths - Array of file paths
 * @returns {Array} Array of file objects with id, path, and name
 */
function setupSharedFiles(filePaths) {
  // Check if first argument is a JSON file (for backward compatibility)
  if (filePaths.length > 0) {
    const firstPath = filePaths[0];

    if (fs.existsSync(firstPath) && firstPath.endsWith('.json')) {
      try {
        // Read file paths from the JSON file
        const filePathsJson = fs.readFileSync(firstPath, 'utf8');
        const filePathsFromJson = JSON.parse(filePathsJson);

        // Process each file from JSON
        return processFilePaths(filePathsFromJson);
      } catch (err) {
        console.error('Error processing JSON file paths:', err);
      }
    }
  }

  // Standard handling for direct file paths
  return processFilePaths(filePaths);
}

/**
 * Process file paths to create file objects
 * @param {string[]} filePaths - Array of file paths
 * @returns {Array} Array of file objects
 */
function processFilePaths(filePaths) {
  return filePaths
    .filter(filePath => fs.existsSync(filePath) && fs.statSync(filePath).isFile())
    .map((filePath, index) => {
      // Get file stats for additional info
      const stats = fs.statSync(filePath);

      return {
        id: index,
        path: filePath,
        name: path.basename(filePath),
        size: formatFileSize(stats.size),
        dateAdded: new Date().toISOString()
      };
    });
}

/**
 * Format file size into human-readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Log helper function
 * @param {string} message - Message to log
 * @param {string} [type='info'] - Log type (info, error, warn)
 */
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();

  switch (type) {
    case 'error':
      console.error(`[${timestamp}] ERROR: ${message}`);
      break;
    case 'warn':
      console.warn(`[${timestamp}] WARNING: ${message}`);
      break;
    default:
      console.log(`[${timestamp}] INFO: ${message}`);
  }
}

module.exports = {
  setupSharedFiles,
  formatFileSize,
  log
};