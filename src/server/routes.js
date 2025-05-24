/**
 * Express routes for LocalShare server
 */
const express = require("express");
const path = require("path");
const router = express.Router();

// Import controllers
const fileController = require("./controllers/fileController");
const apiController = require("./controllers/apiController");

// Root page - redirect to home page if files are shared, otherwise show welcome
router.get("/", (req, res) => {
  if (global.sharedFiles && global.sharedFiles.length > 0) {
    // Files are being shared, show file list
    res.sendFile(path.join(__dirname, "../pages/home/index.html"));
  } else {
    // No files shared, show welcome page
    res.sendFile(path.join(__dirname, "../pages/home/index.html"));
  }
});

// About page
router.get("/about", (req, res) => {
  res.sendFile(path.join(__dirname, "../pages/about/index.html"));
});

// QR Code page
router.get("/qrcode", (req, res) => {
  res.sendFile(path.join(__dirname, "../pages/qrcode/index.html"));
});

// File download route
router.get("/download/:id", fileController.downloadFile);

// API Routes
router.get("/api/shared-file", apiController.getSharedFiles);
router.get("/api/notify", apiController.sendNotification);

module.exports = router;
