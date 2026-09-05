const { ipcRenderer, clipboard } = require("electron");
let QRCode;
try {
  QRCode = require("qrcode");
} catch (e) {
  QRCode = window.QRCode;
}
const { currentState, showToast } = require("./state");

function copyServerUrl() {
  const { serverInfo } = currentState;
  const ip = serverInfo.ip || "127.0.0.1";
  const port = serverInfo.port || 5199;
  const url = `http://${ip}:${port}`;
  clipboard.writeText(url);
  showToast("Server URL copied to clipboard!");
}

function generateQRCode() {
  const qrCodeImg = document.getElementById("qrCodeImg");
  const connectUrlText = document.getElementById("connectUrlText");
  if (!qrCodeImg || !connectUrlText) return;

  const { serverInfo } = currentState;
  const ip = serverInfo.ip || "127.0.0.1";
  const port = serverInfo.port || 5199;
  const url = `http://${ip}:${port}`;
  connectUrlText.textContent = url;

  if (QRCode && QRCode.toDataURL) {
    QRCode.toDataURL(url, { width: 220, margin: 1 }, (err, dataUrl) => {
      if (!err && dataUrl) {
        qrCodeImg.src = dataUrl;
      } else if (err) {
        console.error("QRCode generation error:", err);
      }
    });
  }
}

function initConnect() {
  const serverPill = document.getElementById("serverPill");
  const pillCopyBtn = document.getElementById("pillCopyBtn");
  const sidebarServerCard = document.getElementById("sidebarServerCard");
  const sidebarOpenBrowserBtn = document.getElementById("sidebarOpenBrowserBtn");
  const copyConnectUrlBtn = document.getElementById("copyConnectUrlBtn");

  if (serverPill) serverPill.addEventListener("click", copyServerUrl);
  if (pillCopyBtn) {
    pillCopyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      copyServerUrl();
    });
  }
  if (sidebarServerCard) sidebarServerCard.addEventListener("click", copyServerUrl);
  if (sidebarOpenBrowserBtn) {
    sidebarOpenBrowserBtn.addEventListener("click", () => {
      ipcRenderer.send("dashboard:open-browser");
    });
  }
  if (copyConnectUrlBtn) {
    copyConnectUrlBtn.addEventListener("click", () => {
      const { serverInfo } = currentState;
      const url = `http://${serverInfo.ip}:${serverInfo.port}`;
      clipboard.writeText(url);
      showToast("Connection URL copied to clipboard!");
    });
  }
}

module.exports = {
  copyServerUrl,
  generateQRCode,
  initConnect,
};
