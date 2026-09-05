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

// Root page - serves the modern client interface
router.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../pages/home/index.html"));
});

// File download route
router.get("/download/:id", fileController.downloadFile);

// API Routes
router.get("/api/shared-file", apiController.getSharedFiles);
router.get("/api/notify", apiController.sendNotification);
router.post("/api/clipboard", apiController.copyToClipboard);
router.post("/api/text", apiController.copyToClipboard);
router.get("/api/clipboard", apiController.copyToClipboard);
router.get("/api/pair", apiController.handlePairCheck);
router.post("/api/pair", apiController.submitPairKey);

// Server Info Route
router.get("/api/server-info", (req, res) => {
  res.json({
    hostname: os.hostname(),
    platform: os.platform(),
    sharedCount: global.sharedFiles ? global.sharedFiles.length : 0,
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

