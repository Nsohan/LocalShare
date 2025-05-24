/**
 * Logger utility for LocalShare
 * Provides consistent logging to files and console
 */
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const os = require('os');

// Define log levels
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

class Logger {
  constructor() {
    // Set up log directory - use app data directory for persistent logs
    this.logDir = path.join(app?.getPath('userData') || os.tmpdir(), 'logs');
    this.logFile = path.join(this.logDir, `localshare-${new Date().toISOString().split('T')[0]}.log`);
    this.level = LOG_LEVELS.DEBUG; // Default to most verbose logging

    // Create log directory if it doesn't exist
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }

      // Write header to log file
      this._appendToLogFile(`\n\n=== LocalShare Log Started at ${new Date().toISOString()} ===\n`);
      this._appendToLogFile(`App version: ${app?.getVersion() || 'unknown'}\n`);
      this._appendToLogFile(`OS: ${os.platform()} ${os.release()}\n`);
      this._appendToLogFile(`Node version: ${process.version}\n`);
      this._appendToLogFile(`Electron: ${process.versions.electron || 'unknown'}\n`);
      this._appendToLogFile(`Process args: ${process.argv.join(' ')}\n\n`);

      this.info('Logger initialized successfully');
    } catch (error) {
      console.error('Failed to initialize logger:', error);
    }
  }

  _appendToLogFile(message) {
    try {
      fs.appendFileSync(this.logFile, message);
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  _formatMessage(level, message) {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] ${message}`;
  }

  _log(level, message, ...args) {
    if (LOG_LEVELS[level] <= this.level) {
      let formattedMessage = this._formatMessage(level, message);

      // Handle additional args by stringifying them
      if (args.length > 0) {
        args.forEach(arg => {
          if (typeof arg === 'object') {
            try {
              formattedMessage += ' ' + JSON.stringify(arg);
            } catch (e) {
              formattedMessage += ' [Object]';
            }
          } else {
            formattedMessage += ' ' + arg;
          }
        });
      }

      // Write to log file
      this._appendToLogFile(formattedMessage + '\n');

      // Also log to console with appropriate method
      switch (level) {
        case 'ERROR':
          console.error(formattedMessage);
          break;
        case 'WARN':
          console.warn(formattedMessage);
          break;
        case 'INFO':
          console.info(formattedMessage);
          break;
        case 'DEBUG':
          console.debug(formattedMessage);
          break;
      }
    }
  }

  error(message, ...args) {
    this._log('ERROR', message, ...args);
  }

  warn(message, ...args) {
    this._log('WARN', message, ...args);
  }

  info(message, ...args) {
    this._log('INFO', message, ...args);
  }

  debug(message, ...args) {
    this._log('DEBUG', message, ...args);
  }

  getLogPath() {
    return this.logFile;
  }
}

// Create a singleton instance
const logger = new Logger();

module.exports = logger;