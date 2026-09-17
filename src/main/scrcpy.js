/**
 * Scrcpy and ADB Process Manager for LocalShare
 * Handles binary location, ADB device discovery, wireless switching,
 * and spawning/tracking scrcpy mirror sessions.
 */

const { spawn, execFile } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");
const logger = require("../config/logger");

// Map of active scrcpy sessions: sessionId -> { id, serial, process, options, startedAt }
const activeSessions = new Map();

/**
 * Locate scrcpy and adb binaries on the system
 * Prioritizes bundled binaries, then falls back to system PATH.
 */
function getBinaryPaths() {
  const isWin = process.platform === "win32";
  const scrcpyExeName = isWin ? "scrcpy.exe" : "scrcpy";
  const adbExeName = isWin ? "adb.exe" : "adb";

  const searchCandidates = [
    // 1. Packaged extraResources in production
    path.join(process.resourcesPath || "", "bin", "scrcpy"),
    path.join(process.resourcesPath || "", "bin"),
    // 2. Local workspace development folder
    path.join(__dirname, "../../bin/scrcpy"),
    path.join(__dirname, "../../bin"),
    path.join(process.cwd(), "bin", "scrcpy"),
    path.join(process.cwd(), "bin"),
  ];

  let resolvedScrcpy = null;
  let resolvedAdb = null;
  let isBundled = false;

  for (const dir of searchCandidates) {
    if (!dir) continue;
    const testScrcpy = path.join(dir, scrcpyExeName);
    const testAdb = path.join(dir, adbExeName);

    if (fs.existsSync(testScrcpy) && !resolvedScrcpy) {
      resolvedScrcpy = testScrcpy;
      isBundled = true;
    }
    if (fs.existsSync(testAdb) && !resolvedAdb) {
      resolvedAdb = testAdb;
    }
  }

  // Fallback to system command names if not found in bundle
  return {
    scrcpyPath: resolvedScrcpy || scrcpyExeName,
    adbPath: resolvedAdb || adbExeName,
    isBundled,
    foundScrcpy: Boolean(resolvedScrcpy),
    foundAdb: Boolean(resolvedAdb),
  };
}

/**
 * Check if binaries can be executed and retrieve version info
 */
async function checkBinaries() {
  const binaries = getBinaryPaths();

  const checkCommand = (binPath, args = ["--version"]) => {
    return new Promise((resolve) => {
      execFile(binPath, args, { timeout: 3000 }, (error, stdout, stderr) => {
        if (error) {
          resolve({ available: false, error: error.message, version: null });
        } else {
          const firstLine = (stdout || stderr || "").trim().split("\n")[0];
          resolve({ available: true, version: firstLine, path: binPath });
        }
      });
    });
  };

  const [scrcpyStatus, adbStatus] = await Promise.all([
    checkCommand(binaries.scrcpyPath, ["--version"]),
    checkCommand(binaries.adbPath, ["version"]),
  ]);

  return {
    ready: scrcpyStatus.available,
    adbReady: adbStatus.available,
    binaries: {
      scrcpy: {
        ...scrcpyStatus,
        path: binaries.scrcpyPath,
        bundled: binaries.isBundled,
      },
      adb: {
        ...adbStatus,
        path: binaries.adbPath,
        bundled: binaries.isBundled,
      },
    },
  };
}

/**
 * Execute an ADB command and return stdout
 */
function runAdb(args = [], timeout = 8000) {
  const { adbPath } = getBinaryPaths();
  return new Promise((resolve, reject) => {
    execFile(adbPath, args, { timeout }, (error, stdout, stderr) => {
      if (error) {
        logger.error(`ADB error (${args.join(" ")}):`, error.message, stderr);
        return reject(new Error(stderr?.trim() || error.message));
      }
      resolve(stdout ? stdout.trim() : "");
    });
  });
}

/**
 * Capture screenshot from Android device, save to Downloads and copy to clipboard
 */
async function takeScreenshot(serial) {
  const { adbPath } = getBinaryPaths();
  const screenshotsDir = path.join(
    os.homedir(),
    "Downloads",
    "LocalShare",
    "Screenshots",
  );
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `phone_screenshot_${timestamp}.png`;
  const filePath = path.join(screenshotsDir, filename);

  const args = serial
    ? ["-s", serial, "exec-out", "screencap", "-p"]
    : ["exec-out", "screencap", "-p"];

  return new Promise((resolve, reject) => {
    logger.info(`Taking screenshot for ${serial || "default"} -> ${filePath}`);
    const fileStream = fs.createWriteStream(filePath);
    const proc = spawn(adbPath, args, { stdio: ["ignore", "pipe", "pipe"] });

    proc.stdout.pipe(fileStream);

    let errData = "";
    proc.stderr.on("data", (chunk) => {
      errData += chunk.toString();
    });

    proc.on("error", (err) => {
      fileStream.close();
      logger.error("Screenshot process error:", err);
      reject(err);
    });

    proc.on("close", (code) => {
      fileStream.close(() => {
        if (
          code !== 0 ||
          !fs.existsSync(filePath) ||
          fs.statSync(filePath).size < 1000
        ) {
          logger.error(`Screenshot failed with code ${code}: ${errData}`);
          try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          } catch (e) {}
          return reject(
            new Error(errData.trim() || `Screenshot failed (code ${code})`),
          );
        }

        // Copy to clipboard via Electron nativeImage/clipboard if available
        let copiedToClipboard = false;
        try {
          const { clipboard, nativeImage } = require("electron");
          if (clipboard && nativeImage) {
            const img = nativeImage.createFromPath(filePath);
            clipboard.writeImage(img);
            copiedToClipboard = true;
            logger.info("Screenshot copied to Windows clipboard.");
          }
        } catch (e) {
          logger.warn("Could not copy screenshot to clipboard:", e.message);
        }

        resolve({
          success: true,
          filePath,
          filename,
          copiedToClipboard,
        });
      });
    });
  });
}

/**
 * Get device battery and health status via dumpsys battery
 */
async function getDeviceBattery(serial) {
  try {
    const args = serial
      ? ["-s", serial, "shell", "dumpsys", "battery"]
      : ["shell", "dumpsys", "battery"];
    const raw = await runAdb(args, 4000);
    const lines = raw.split("\n");

    const data = {
      level: 100,
      scale: 100,
      status: "Unknown",
      health: "Good",
      voltage: null,
      temperature: null,
      isCharging: false,
      powerSource: "Battery",
    };

    const statusMap = {
      1: "Unknown",
      2: "Charging",
      3: "Discharging",
      4: "Not Charging",
      5: "Full",
    };

    const healthMap = {
      1: "Unknown",
      2: "Good",
      3: "Overheat",
      4: "Dead",
      5: "Over Voltage",
      6: "Unspecified Failure",
      7: "Cold",
    };

    lines.forEach((line) => {
      const parts = line.split(":");
      if (parts.length < 2) return;
      const k = parts[0].trim().toLowerCase();
      const v = parts[1].trim();

      if (k === "level") data.level = parseInt(v, 10) || data.level;
      if (k === "scale") data.scale = parseInt(v, 10) || 100;
      if (k === "status") {
        const num = parseInt(v, 10);
        data.status = statusMap[num] || v;
        data.isCharging = num === 2 || num === 5;
      }
      if (k === "health") {
        const num = parseInt(v, 10);
        data.health = healthMap[num] || v;
      }
      if (k === "voltage") {
        const mv = parseInt(v, 10);
        data.voltage = (mv / 1000).toFixed(2) + "V";
      }
      if (k === "temperature") {
        const temp = parseInt(v, 10);
        data.temperature = (temp / 10).toFixed(1) + "°C";
      }
      if (k === "ac powered" && v.toLowerCase() === "true")
        data.powerSource = "AC Charger";
      if (k === "usb powered" && v.toLowerCase() === "true")
        data.powerSource = "USB Port";
      if (k === "wireless powered" && v.toLowerCase() === "true")
        data.powerSource = "Wireless Pad";
    });

    data.percent = Math.round((data.level / data.scale) * 100);
    return { success: true, battery: data };
  } catch (err) {
    logger.error("Failed to get battery info:", err);
    return { success: false, error: err.message };
  }
}

/**
 * List all connected Android devices with rich metadata
 */
async function listAdbDevices() {
  try {
    const rawOutput = await runAdb(["devices", "-l"]);
    const lines = rawOutput
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const devices = [];

    // First line is usually "List of devices attached"
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.startsWith("*")) continue;

      const tokens = line.split(/\s+/);
      if (tokens.length < 2) continue;

      const serial = tokens[0];
      const state = tokens[1]; // 'device', 'unauthorized', 'offline'

      const isWireless =
        serial.includes(":") ||
        /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(serial);

      // Parse key-value properties like model:Pixel_6 product:oriole transport_id:1
      let model = "";
      let product = "";
      let transportId = "";

      for (let j = 2; j < tokens.length; j++) {
        const [k, v] = tokens[j].split(":");
        if (k === "model") model = v.replace(/_/g, " ");
        if (k === "product") product = v;
        if (k === "transport_id") transportId = v;
      }

      // Check if this device has an active mirror session
      const activeSession = Array.from(activeSessions.values()).find(
        (s) => s.serial === serial,
      );

      devices.push({
        serial,
        state, // 'device' (ready), 'unauthorized', 'offline'
        model: model || (isWireless ? "Wireless Device" : "Android Device"),
        product,
        transportId,
        isWireless,
        isMirroring: Boolean(activeSession),
        sessionId: activeSession ? activeSession.id : null,
      });
    }

    return { success: true, devices };
  } catch (err) {
    logger.error("Failed to list ADB devices:", err);
    return { success: false, error: err.message, devices: [] };
  }
}

/**
 * Switch a connected USB device to TCP/IP wireless mode on specified port
 */
async function enableTcpIp(serial, port = 5555) {
  try {
    const args = serial
      ? ["-s", serial, "tcpip", String(port)]
      : ["tcpip", String(port)];
    logger.info(
      `Enabling TCP/IP mode on port ${port} for device ${serial || "default"}`,
    );
    const output = await runAdb(args);
    return {
      success: true,
      message: output || `Switched to TCP/IP port ${port}`,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Connect to an Android device over Wi-Fi
 */
async function connectWireless(ip, port = 5555) {
  try {
    if (!ip) throw new Error("IP address is required");
    const target = ip.includes(":") ? ip : `${ip}:${port}`;
    logger.info(`Connecting to wireless device at ${target}`);
    const output = await runAdb(["connect", target]);

    const isConnected = output.toLowerCase().includes("connected to");
    return {
      success: isConnected,
      message: output,
      target,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Disconnect from a wireless Android device
 */
async function disconnectWireless(target) {
  try {
    if (!target) throw new Error("Target address is required");
    logger.info(`Disconnecting wireless device ${target}`);
    const output = await runAdb(["disconnect", target]);
    return { success: true, message: output };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Launch scrcpy mirror session
 * @param {Object} options
 * @param {Function} [onExit] - callback when process terminates
 */
function startMirror(options = {}, onExit = null) {
  const { scrcpyPath, adbPath } = getBinaryPaths();
  const sessionId = `mirror_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

  // Ensure recording directory exists if requested
  let recordPath = null;
  if (options.record) {
    const downloadsDir = path.join(
      os.homedir(),
      "Downloads",
      "LocalShare",
      "Recordings",
    );
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const deviceName = (options.model || "screen").replace(
      /[^a-zA-Z0-9_-]/g,
      "_",
    );
    recordPath = path.join(downloadsDir, `${deviceName}_${timestamp}.mp4`);
  }

  // Construct CLI arguments
  const args = [];

  // Target device serial
  if (options.serial) {
    args.push("-s", options.serial);
  }

  // Custom Window Title
  const title =
    options.windowTitle ||
    `LocalShare Mirror - ${options.model || options.serial || "Android"}`;
  args.push("--window-title", title);

  // Video resolution / max size
  if (options.maxSize && Number(options.maxSize) > 0) {
    args.push("--max-size", String(options.maxSize));
  }

  // Video bitrate
  if (options.bitRate) {
    args.push("--video-bit-rate", String(options.bitRate));
  }

  // Max FPS
  if (options.maxFps && Number(options.maxFps) > 0) {
    args.push("--max-fps", String(options.maxFps));
  }

  // Audio configuration
  if (options.noAudio === true) {
    args.push("--no-audio");
  }

  // Mode specific flags
  if (options.mode === "uhid_control") {
    args.push("--no-video", "--no-audio", "--keyboard=uhid", "--mouse=uhid");
  } else if (options.mode === "camera_webcam") {
    args.push("--video-source=camera");
  }

  // Display and control flags
  if (options.turnScreenOff || options.mode === "stealth") {
    args.push("--turn-screen-off");
  }

  if (options.stayAwake || options.mode === "stealth") {
    args.push("--stay-awake");
  }

  if (options.alwaysOnTop) {
    args.push("--always-on-top");
  }

  if (options.fullscreen) {
    args.push("--fullscreen");
  }

  if (options.noControl) {
    args.push("--no-control");
  }

  if (recordPath || options.mode === "record") {
    if (!recordPath) {
      const downloadsDir = path.join(
        os.homedir(),
        "Downloads",
        "LocalShare",
        "Recordings",
      );
      if (!fs.existsSync(downloadsDir)) {
        fs.mkdirSync(downloadsDir, { recursive: true });
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const deviceName = (options.model || "screen").replace(
        /[^a-zA-Z0-9_-]/g,
        "_",
      );
      recordPath = path.join(downloadsDir, `${deviceName}_${timestamp}.mp4`);
    }
    args.push("--record", recordPath);
  }

  // Pass ADB path environment variable if bundled ADB is used
  const env = { ...process.env };
  if (adbPath && fs.existsSync(adbPath)) {
    env.ADB = adbPath;
    const adbDir = path.dirname(adbPath);
    env.PATH = `${adbDir}${path.delimiter}${env.PATH || ""}`;
  }

  logger.info(`Spawning scrcpy: ${scrcpyPath} ${args.join(" ")}`);

  try {
    const proc = spawn(scrcpyPath, args, {
      env,
      detached: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const sessionInfo = {
      id: sessionId,
      serial: options.serial || "default",
      model: options.model || "Android Device",
      mode: options.mode || "live",
      pid: proc.pid,
      recordPath,
      options,
      startedAt: Date.now(),
      process: proc,
    };

    activeSessions.set(sessionId, sessionInfo);

    proc.stdout.on("data", (data) => {
      logger.debug(`[scrcpy ${sessionId}]:`, data.toString().trim());
    });

    proc.stderr.on("data", (data) => {
      logger.info(`[scrcpy ${sessionId}]:`, data.toString().trim());
    });

    proc.on("error", (err) => {
      logger.error(`scrcpy process error (${sessionId}):`, err);
      activeSessions.delete(sessionId);
      if (onExit) onExit(sessionId, -1, err.message);
    });

    proc.on("close", (code) => {
      logger.info(`scrcpy session ${sessionId} closed with code ${code}`);
      activeSessions.delete(sessionId);
      if (onExit) onExit(sessionId, code, null);
    });

    return {
      success: true,
      sessionId,
      pid: proc.pid,
      recordPath,
      mode: options.mode || "live",
    };
  } catch (err) {
    logger.error("Failed to spawn scrcpy process:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Stop a running scrcpy mirror session
 */
function stopMirror(sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session) {
    return { success: false, error: "Session not found or already stopped" };
  }

  try {
    logger.info(`Stopping scrcpy session ${sessionId} (PID ${session.pid})`);
    if (process.platform === "win32") {
      // Force kill on Windows to ensure SDL window closes immediately
      spawn("taskkill", ["/pid", String(session.pid), "/f", "/t"]);
    } else {
      session.process.kill("SIGTERM");
    }
    activeSessions.delete(sessionId);
    return { success: true };
  } catch (err) {
    logger.error(`Error stopping scrcpy session ${sessionId}:`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Clean up all running scrcpy sessions (e.g. on application exit)
 */
function stopAllSessions() {
  logger.info(
    `Terminating all active scrcpy sessions (${activeSessions.size})`,
  );
  for (const [sessionId, session] of activeSessions.entries()) {
    try {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(session.pid), "/f", "/t"]);
      } else {
        session.process.kill("SIGTERM");
      }
    } catch (e) {
      // ignore
    }
  }
  activeSessions.clear();
}

/**
 * Get list of currently running mirror sessions
 */
function getActiveSessions() {
  return Array.from(activeSessions.values()).map((s) => ({
    id: s.id,
    serial: s.serial,
    model: s.model,
    mode: s.mode,
    pid: s.pid,
    recordPath: s.recordPath,
    startedAt: s.startedAt,
    options: s.options,
  }));
}

/**
 * Parse an arbitrary command string into arguments array, respecting quotes
 */
function parseCommandArgs(cmdStr) {
  const args = [];
  let current = "";
  let inQuotes = false;
  let quoteChar = "";

  for (let i = 0; i < cmdStr.length; i++) {
    const char = cmdStr[i];
    if ((char === '"' || char === "'") && !inQuotes) {
      inQuotes = true;
      quoteChar = char;
    } else if (char === quoteChar && inQuotes) {
      inQuotes = false;
      quoteChar = "";
    } else if (char === " " && !inQuotes) {
      if (current.length > 0) {
        args.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }
  if (current.length > 0) {
    args.push(current);
  }
  return args;
}

/**
 * Execute an arbitrary ADB command against a specific device or all devices
 * @param {Object} params - { serial, command, timeoutMs }
 */
async function executeCustomAdbCommand({ serial, command, timeoutMs = 15000 } = {}) {
  const { adbPath } = getBinaryPaths();
  if (!command || typeof command !== "string" || !command.trim()) {
    return { success: false, error: "Command cannot be empty" };
  }

  let cleanCmd = command.trim();
  // Strip leading "adb " if user prefixed it
  if (/^adb\s+/i.test(cleanCmd)) {
    cleanCmd = cleanCmd.replace(/^adb\s+/i, "");
  }

  // Support running on all online devices
  if (serial === "all") {
    const devList = await listAdbDevices();
    const readyDevices = (devList.devices || []).filter((d) => d.state === "device");
    if (readyDevices.length === 0) {
      return { success: false, error: "No online devices connected." };
    }
    const results = await Promise.all(
      readyDevices.map((d) =>
        executeCustomAdbCommand({ serial: d.serial, command: cleanCmd, timeoutMs })
      )
    );
    return {
      success: results.every((r) => r.success),
      isMultiDevice: true,
      command: cleanCmd,
      results,
    };
  }

  const rawArgs = parseCommandArgs(cleanCmd);
  if (rawArgs.length === 0) {
    return { success: false, error: "No valid arguments provided" };
  }

  const finalArgs = [];
  if (serial && serial !== "default") {
    finalArgs.push("-s", serial);
  }
  finalArgs.push(...rawArgs);

  const startTime = Date.now();

  return new Promise((resolve) => {
    logger.info(`Executing ADB command: ${adbPath} ${finalArgs.join(" ")}`);
    execFile(
      adbPath,
      finalArgs,
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const durationMs = Date.now() - startTime;
        const outStr = stdout ? stdout.toString().trim() : "";
        const errStr = stderr ? stderr.toString().trim() : "";

        if (error) {
          logger.warn(
            `ADB command failed (${finalArgs.join(" ")}):`,
            error.message
          );
          return resolve({
            success: false,
            command: cleanCmd,
            serial: serial || "default",
            args: finalArgs,
            stdout: outStr,
            stderr: errStr || error.message,
            error: error.message,
            exitCode: error.code || 1,
            durationMs,
          });
        }

        resolve({
          success: true,
          command: cleanCmd,
          serial: serial || "default",
          args: finalArgs,
          stdout: outStr,
          stderr: errStr,
          exitCode: 0,
          durationMs,
        });
      }
    );
  });
}

module.exports = {
  getBinaryPaths,
  checkBinaries,
  listAdbDevices,
  enableTcpIp,
  connectWireless,
  disconnectWireless,
  takeScreenshot,
  getDeviceBattery,
  executeCustomAdbCommand,
  startMirror,
  stopMirror,
  stopAllSessions,
  getActiveSessions,
};
