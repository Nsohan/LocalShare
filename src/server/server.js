/**
 * Express server for LocalShare
 */
const express = require("express");
const path = require("path");
const fs = require("fs");
const notifier = require("node-notifier");
const { createHttpTerminator } = require("http-terminator");

// Setup simple logging for server process
const LOG_FILE =
  process.env.LOG_PATH || path.join(process.cwd(), "localshare-server.log");

function log(level, message, ...args) {
  try {
    const timestamp = new Date().toISOString();
    let logMessage = `[${timestamp}] [SERVER] [${level}] ${message}`;

    if (args.length > 0) {
      args.forEach((arg) => {
        if (typeof arg === "object") {
          try {
            logMessage += " " + JSON.stringify(arg);
          } catch (e) {
            logMessage += " [Object]";
          }
        } else {
          logMessage += " " + arg;
        }
      });
    }

    // Write to log file
    fs.appendFileSync(LOG_FILE, logMessage + "\n");

    // Also log to console
    if (level === "ERROR") console.error(logMessage);
    else if (level === "WARN") console.warn(logMessage);
    else console.log(logMessage);
  } catch (err) {
    console.error("Error writing to log file:", err);
  }
}

// Create log functions
const logger = {
  info: (msg, ...args) => log("INFO", msg, ...args),
  error: (msg, ...args) => log("ERROR", msg, ...args),
  warn: (msg, ...args) => log("WARN", msg, ...args),
  debug: (msg, ...args) => log("DEBUG", msg, ...args),
};

// Process exit handler
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down server...");
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down server...");
  process.exit(0);
});

process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception:", err);
  process.exit(1);
});

// Import routes and utils
const routes = require("./routes");
const { setupSharedFiles } = require("./utils");

logger.info("Server starting...");
logger.debug("Command line args:", process.argv);
logger.debug("Current directory:", process.cwd());

// Create Express app
const app = express();

// HTTP terminator for graceful shutdown
let httpTerminator = null;

try {
  // Initialize shared files from command line arguments
  logger.debug("Setting up shared files from args:", process.argv.slice(2));
  global.sharedFiles = setupSharedFiles(process.argv.slice(2));
  logger.info(`Initialized ${global.sharedFiles.length} shared files`);

  // Log middleware
  app.use((req, res, next) => {
    if (!req.path.startsWith("/api") && !req.path.includes(".")) {
      logger.info(`Page visited: ${req.path}`);
    }
    logger.debug(`Request: ${req.method} ${req.path}`);
    next();
  });

  // Basic error handler
  app.use((err, req, res, next) => {
    logger.error("Express error:", err);
    res.status(500).send("Server error");
  });

  // Set up static file serving - use absolute paths
  // Make sure paths exist before setting up static serving
  const publicDir = path.join(__dirname, "../../public");
  const pagesDir = path.join(__dirname, "../pages");

  logger.debug("Checking for public directory:", publicDir);
  if (fs.existsSync(publicDir)) {
    logger.debug("Public directory exists, serving static files");
    app.use(express.static(publicDir));
  } else {
    logger.error("Public directory not found:", publicDir);
  }

  logger.debug("Checking for pages directory:", pagesDir);
  if (fs.existsSync(pagesDir)) {
    logger.debug("Pages directory exists, serving static files");
    app.use("/pages", express.static(pagesDir));
  } else {
    logger.error("Pages directory not found:", pagesDir);
  }

  // Use routes
  app.use("/", routes);

  // Add a fallback route that helps debug if files exist
  app.use((req, res) => {
    logger.warn(`404 for ${req.path}`);

    // For HTML requests, send debugging info
    if (req.accepts("html")) {
      let debugInfo = "<h1>LocalShare - Page Not Found</h1>";
      debugInfo += `<p>The path "${req.path}" was not found.</p>`;

      // Debug available directories
      debugInfo += "<h2>Debug Info:</h2>";
      debugInfo += `<p>Public directory (${publicDir}): ${
        fs.existsSync(publicDir) ? "Exists" : "Missing"
      }</p>`;
      debugInfo += `<p>Pages directory (${pagesDir}): ${
        fs.existsSync(pagesDir) ? "Exists" : "Missing"
      }</p>`;

      // For specific known pages, check if they exist
      const importantFiles = [
        {
          name: "Home page HTML",
          path: path.join(pagesDir, "home/index.html"),
        },
        { name: "Home page CSS", path: path.join(pagesDir, "home/style.css") },
        { name: "Home page JS", path: path.join(pagesDir, "home/script.js") },
      ];

      debugInfo += "<h3>Key Files:</h3><ul>";
      importantFiles.forEach((file) => {
        debugInfo += `<li>${file.name} (${file.path}): ${
          fs.existsSync(file.path) ? "Exists" : "Missing"
        }</li>`;
      });
      debugInfo += "</ul>";

      res.status(404).send(debugInfo);
    } else {
      res.status(404).send("Not found");
    }
  });

  // Get port from environment variable passed from main process
  // Fall back to default 5199 if not specified
  const PORT = parseInt(process.env.PORT) || 5199;

  logger.info(`Using configured port: ${PORT}`);

  function startServer(port) {
    try {
      const server = app.listen(port, () => {
        logger.info(`Server running at http://localhost:${port}`);

        // Save the terminator
        httpTerminator = createHttpTerminator({ server });

        // Notify about shared files
        if (global.sharedFiles.length > 0) {
          if (global.sharedFiles.length === 1) {
            logger.info(`Sharing file: ${global.sharedFiles[0].name}`);
            try {
              notifier.notify({
                title: "LocalShare File Shared",
                message: `Sharing file: ${global.sharedFiles[0].name}`,
                icon: path.join(__dirname, "../../build/icon.ico"),
              });
            } catch (err) {
              logger.error("Error showing notification:", err);
            }
          } else {
            logger.info(`Sharing ${global.sharedFiles.length} files`);
            try {
              notifier.notify({
                title: "LocalShare Files Shared",
                message: `${global.sharedFiles.length} files shared`,
                icon: path.join(__dirname, "../../build/icon.ico"),
              });
            } catch (err) {
              logger.error("Error showing notification:", err);
            }
          }
        }
      });

      server.on("error", (err) => {
        if (err.code === "EADDRINUSE") {
          logger.warn(`Port ${port} is in use, trying port ${port + 1}`);
          startServer(port + 1);
        } else {
          logger.error("Server error:", err);
          try {
            notifier.notify({
              title: "LocalShare Error",
              message: "Failed to start server. Please try again.",
              icon: path.join(__dirname, "../../build/icon.ico"),
            });
          } catch (notifyErr) {
            logger.error("Error showing notification:", notifyErr);
          }
        }
      });
    } catch (err) {
      logger.error("Error starting server:", err);
    }
  }

  // Start with the configured port
  startServer(PORT);
} catch (err) {
  logger.error("Critical server initialization error:", err);
  process.exit(1);
}
