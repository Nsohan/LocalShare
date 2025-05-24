/**
 * QR Code window functionality
 */
const { BrowserWindow } = require("electron");
const QRCode = require("qrcode");
const path = require("path");
const { getLocalIP } = require("../utils");
const { getConfig } = require("../../config/config");

/**
 * Show QR code window with server URL
 */
function showQRCodeWindow() {
  const localIP = getLocalIP();
  const port = getConfig("port") || 5199;
  const url = `http://${localIP}:${port}`;

  QRCode.toDataURL(url, (err, dataUrl) => {
    if (err) {
      console.error("QRCode generation error:", err);
      return;
    }

    const win = new BrowserWindow({
      width: 400,
      height: 450,
      resizable: false,
      title: "QR Code",
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
      },
    });

    // Use a custom HTML page instead of data URL for more features
    win.loadURL(
      `data:text/html;charset=UTF-8,${encodeURIComponent(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>LocalShare QR Code</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                text-align: center;
                background-color: #f4f4f4;
                padding: 8px;
                margin: 0;
              }
              h3 {
                color: #333;
                margin-top: 8px;
              }
              .qr-container {
                background: white;
                padding: 8px;
                border-radius: 8px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                display: inline-block;
              }
              .url {
                margin-top: 10px;
                padding: 5px;
                background: #e8e8e8;
                border-radius: 4px;
                word-break: break-all;
                font-family: monospace;
              }
            </style>
          </head>
          <body>
            <h3>Scan QR Code to Access</h3>
            <div class="qr-container">
              <img src="${dataUrl}" alt="QR Code" width="300" height="300" />
            </div>
            <div class="url">${url}</div>
          </body>
        </html>
      `)}`
    );
  });
}

module.exports = {
  showQRCodeWindow,
};
