/**
 * API controller for handling API requests
 */
const path = require('path');

/**
 * Get list of shared files
 */
function getSharedFiles(req, res) {
  if (global.sharedFiles && global.sharedFiles.length > 0) {
    res.json(
      global.sharedFiles.map(file => ({
        id: file.id,
        fileName: file.name,
        downloadUrl: `/download/${file.id}`,
        size: file.size || 'Unknown',
        dateAdded: file.dateAdded || new Date().toISOString()
      }))
    );
  } else {
    res.json([]);
  }
}

/**
 * Send notification to the server admin
 */
function sendNotification(req, res) {
  const title = req.query.title || 'LocalShare Notification';
  const message = req.query.message || 'A notification has been triggered';

  if (process.send) {
    process.send({
      type: "custom-notification",
      title,
      message,
    });
  }

  res.json({
    success: true,
    message: 'Notification sent to server admin!'
  });
}

/**
 * Copy received text to the host PC clipboard
 */
function copyToClipboard(req, res) {
  let text = "";

  if (typeof req.body === "string") {
    text = req.body;
  } else if (req.body && typeof req.body.text === "string") {
    text = req.body.text;
  } else if (req.body && typeof req.body.content === "string") {
    text = req.body.content;
  } else if (req.query && typeof req.query.text === "string") {
    text = req.query.text;
  }

  if (typeof text !== "string" || text.trim() === "") {
    return res.status(400).json({
      success: false,
      error: 'No text provided. Send JSON { "text": "..." }, plain text, or ?text=...',
    });
  }

  // Forward to Electron main process via child-process IPC
  if (process.send) {
    try {
      process.send({
        type: "clipboard-copy",
        text: text,
      });
    } catch (ipcErr) {
      console.error("Failed to forward clipboard to main process:", ipcErr);
    }
  }

  const preview = text.length > 50 ? text.slice(0, 50) + "..." : text;

  res.json({
    success: true,
    message: "Text copied to host clipboard!",
    length: text.length,
    preview,
  });
}

module.exports = {
  getSharedFiles,
  sendNotification,
  copyToClipboard,
};