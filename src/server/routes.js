/**
 * Express routes for LocalShare server
 */
const express = require("express");
const path = require("path");
const os = require("os");
const router = express.Router();

// Import controllers
const fileController = require("./controllers/fileController");
const apiController = require("./controllers/apiController");
const { getLanInterface } = require("../main/lanScanner");

/**
 * Resolve the primary LAN IPv4 address for display on connected clients.
 */
function getServerIp() {
  const lan = getLanInterface();
  if (lan && lan.address) {
    return lan.address;
  }
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      const isIPv4 = net.family === "IPv4" || net.family === 4;
      if (isIPv4 && !net.internal) {
        return net.address;
      }
    }
  }
  return "";
}

// Root page - serves the modern client interface
router.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../pages/home/index.html"));
});

// File & shared text download routes
router.get("/download/:id", fileController.downloadFile);
router.get("/download-text/:id", apiController.downloadSharedText);

// API Routes
router.get("/api/shared-file", apiController.getSharedFiles);
router.get("/api/shared-items", apiController.getSharedItems);
router.get("/api/notify", apiController.sendNotification);
router.post("/api/clipboard", apiController.copyToClipboard);
router.post("/api/text", apiController.copyToClipboard);
router.get("/api/clipboard", apiController.copyToClipboard);
router.get("/api/pair", apiController.handlePairCheck);
router.post("/api/pair", apiController.submitPairKey);

// Server Info Route
router.get("/api/server-info", (req, res) => {
  const fileCount = global.sharedFiles ? global.sharedFiles.length : 0;
  const textCount = global.sharedTexts ? global.sharedTexts.length : 0;
  res.json({
    hostname: os.hostname(),
    ip: getServerIp(),
    platform: os.platform(),
    sharedCount: fileCount + textCount,
    port: parseInt(process.env.PORT) || 5199,
  });
});

// File Upload Route (supports up to 50 files per batch)
router.post(
  "/api/upload",
  fileController.uploadMiddleware.array("files", 50),
  fileController.uploadFiles
);

module.exports = router;

