const { clipboard, ipcRenderer } = require("electron");
const { currentState, showToast } = require("./state");

function syncDirectPasteUI(enabled) {
  const toggle = document.getElementById("apiDirectPasteToggle");
  const desc = document.getElementById("apiClipboardDesc");
  if (toggle) {
    toggle.checked = !!enabled;
  }
  if (desc) {
    desc.innerHTML = enabled
      ? '<span class="paste-status-on">Direct Paste: ON</span>'
      : '<span class="paste-status-off">Direct Paste: OFF (Ctrl+V)</span>';
  }
}

function updateApiTokens() {
  const apiHostTokens = document.querySelectorAll(".api-host-token");
  const { serverInfo, config } = currentState;
  const hostString = `${serverInfo.ip}:${serverInfo.port}`;

  apiHostTokens.forEach((token) => {
    token.textContent = hostString;
  });

  if (config) {
    syncDirectPasteUI(config.directPaste);
  }
}

function initApi() {
  const apiCodeBlocks = document.querySelectorAll(".api-code-block");
  apiCodeBlocks.forEach((block) => {
    block.style.cursor = "pointer";
    block.setAttribute("title", "Click to copy curl command");
    block.addEventListener("click", () => {
      const codeText = block.innerText.trim();
      clipboard.writeText(codeText);
      showToast("cURL command copied to clipboard!");
    });
  });

  const apiDirectPasteToggle = document.getElementById("apiDirectPasteToggle");
  if (apiDirectPasteToggle) {
    apiDirectPasteToggle.addEventListener("change", () => {
      const isChecked = apiDirectPasteToggle.checked;
      syncDirectPasteUI(isChecked);
      ipcRenderer.send("settings:update-direct-paste", isChecked);
      showToast(
        isChecked
          ? "Direct paste enabled - incoming text will paste automatically"
          : "Direct paste disabled - press Ctrl+V to paste"
      );
    });
  }

  updateApiTokens();
}

module.exports = {
  updateApiTokens,
  syncDirectPasteUI,
  initApi,
};
