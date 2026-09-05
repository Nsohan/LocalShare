const { clipboard } = require("electron");
const { currentState, showToast } = require("./state");

function updateApiTokens() {
  const apiHostTokens = document.querySelectorAll(".api-host-token");
  const { serverInfo } = currentState;
  const hostString = `${serverInfo.ip}:${serverInfo.port}`;

  apiHostTokens.forEach((token) => {
    token.textContent = hostString;
  });
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

  updateApiTokens();
}

module.exports = {
  updateApiTokens,
  initApi,
};
