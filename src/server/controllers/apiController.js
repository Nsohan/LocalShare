/**
 * API controller for handling API requests
 */
const path = require('path');

/**
 * Build serialized file items list from global.sharedFiles
 */
function mapSharedFiles() {
  if (!global.sharedFiles || global.sharedFiles.length === 0) {
    return [];
  }
  return global.sharedFiles.map((file) => ({
    id: file.id,
    fileName: file.name,
    downloadUrl: `/download/${file.id}`,
    size: file.size || "Unknown",
    dateAdded: file.dateAdded || new Date().toISOString(),
  }));
}

/**
 * Get list of shared files
 */
function getSharedFiles(req, res) {
  res.json(mapSharedFiles());
}

/**
 * Get combined shared files and shared text items
 */
function getSharedItems(req, res) {
  const files = mapSharedFiles();
  const texts = Array.isArray(global.sharedTexts)
    ? global.sharedTexts.map((item) => ({
        kind: "text",
        id: item.id,
        title: item.title || "",
        content: typeof item.content === "string" ? item.content : "",
        createdAt: item.createdAt || new Date().toISOString(),
        downloadUrl: `/download-text/${encodeURIComponent(item.id)}`,
      }))
    : [];

  res.json({ files, texts });
}

/**
 * Download a shared text item as a .txt file
 */
function downloadSharedText(req, res) {
  const targetId = String(req.params.id || "");
  const textItem = Array.isArray(global.sharedTexts)
    ? global.sharedTexts.find((item) => String(item.id) === targetId)
    : null;

  if (!textItem) {
    return res.status(404).send("Shared text not found");
  }

  const rawTitle = (textItem.title || "shared-text").toString().replace(/\.+$/, "");
  const cleaned =
    rawTitle
      .replace(/[\\/:*?"<>|\r\n]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 48)
      .trim() || "shared-text";
  const filename = /\.txt$/i.test(cleaned) ? cleaned : `${cleaned}.txt`;
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, "_") || "shared-text.txt";

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  );
  res.send(typeof textItem.content === "string" ? textItem.content : "");
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

const authorizedPairingKeys = new Set();
const os = require("os");

/**
 * Handle pairing check from remote device or desktop
 */
function handlePairCheck(req, res) {
  const key = req.query.key || req.headers["x-pairing-key"];
  if (!key) {
    return res.status(400).json({ success: false, message: "Missing pairing key" });
  }

  const strKey = String(key).trim();
  if (authorizedPairingKeys.has(strKey)) {
    return res.json({
      success: true,
      status: "connected",
      hostname: os.hostname(),
      platform: os.platform(),
      message: "Device paired successfully",
    });
  }

  // Pending
  return res.status(202).json({
    success: false,
    status: "pending",
    message: "Waiting for key entry on phone",
  });
}

/**
 * Submit pairing key from phone
 */
function submitPairKey(req, res) {
  const key = (req.body && req.body.key) || req.query.key;
  if (!key) {
    return res.status(400).json({ success: false, message: "Pairing key is required" });
  }

  const strKey = String(key).trim();
  authorizedPairingKeys.add(strKey);

  // Auto-expire pairing key after 5 minutes
  setTimeout(() => authorizedPairingKeys.delete(strKey), 300000);

  res.json({
    success: true,
    message: "Key accepted. Pair confirmed.",
    key: strKey,
  });
}

module.exports = {
  getSharedFiles,
  getSharedItems,
  downloadSharedText,
  sendNotification,
  copyToClipboard,
  handlePairCheck,
  submitPairKey,
};