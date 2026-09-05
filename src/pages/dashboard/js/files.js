const { ipcRenderer, clipboard } = require("electron");
const { currentState, getCurrentTab, setCurrentTab, getFileCategory, showToast } = require("./state");

function renderFilesView() {
  const statFilesCount = document.getElementById("statFilesCount");
  const statTotalSize = document.getElementById("statTotalSize");
  const statPort = document.getElementById("statPort");
  const statIp = document.getElementById("statIp");
  const sentBadge = document.getElementById("sentBadge");
  const receivedBadge = document.getElementById("receivedBadge");
  const navFilesBadge = document.getElementById("navFilesBadge");
  const sentFilesList = document.getElementById("sentFilesList");
  const receivedFilesList = document.getElementById("receivedFilesList");
  const sentEmptyState = document.getElementById("sentEmptyState");
  const receivedEmptyState = document.getElementById("receivedEmptyState");
  const serverStatusText = document.getElementById("serverStatusText");
  const sidebarServerStatus = document.getElementById("sidebarServerStatus");
  const sidebarServerIp = document.getElementById("sidebarServerIp");

  const { sentFiles = [], receivedFiles = [], serverInfo = {} } = currentState;

  if (statFilesCount) {
    statFilesCount.textContent = `${sentFiles.length} File${sentFiles.length !== 1 ? "s" : ""}`;
  }
  if (sentBadge) sentBadge.textContent = sentFiles.length;
  if (receivedBadge) receivedBadge.textContent = receivedFiles.length;
  if (navFilesBadge) navFilesBadge.textContent = sentFiles.length + receivedFiles.length;

  const ip = serverInfo.ip || "127.0.0.1";
  const port = serverInfo.port || 5199;

  if (statPort) statPort.textContent = port;
  if (statIp) statIp.textContent = ip;
  if (serverStatusText) {
    serverStatusText.textContent = `Online ${ip}:${port}`;
  }
  const serverPill = document.getElementById("serverPill");
  if (serverPill) {
    serverPill.title = `Click to copy: http://${ip}:${port}`;
  }
  if (sidebarServerStatus) {
    sidebarServerStatus.textContent = `Active`;
  }
  if (sidebarServerIp) {
    sidebarServerIp.textContent = `${ip}:${port}`;
  }

  // Calculate total size of shared files
  if (statTotalSize) {
    let totalBytes = 0;
    sentFiles.forEach((f) => {
      if (typeof f.bytes === "number") totalBytes += f.bytes;
    });
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    if (totalBytes === 0) {
      statTotalSize.textContent = "0 Bytes";
    } else {
      const i = Math.floor(Math.log(totalBytes) / Math.log(k));
      statTotalSize.textContent = parseFloat((totalBytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    }
  }

  if (sentFilesList && sentEmptyState) {
    renderFileList(sentFiles, sentFilesList, sentEmptyState, "send");
  }
  if (receivedFilesList && receivedEmptyState) {
    renderFileList(receivedFiles, receivedFilesList, receivedEmptyState, "received");
  }
}

function renderFileList(files, listElement, emptyElement, tab) {
  listElement.innerHTML = "";

  if (!files || files.length === 0) {
    emptyElement.style.display = "flex";
    listElement.style.display = "none";
    return;
  }

  emptyElement.style.display = "none";
  listElement.style.display = "flex";

  files.forEach((file, index) => {
    const card = document.createElement("div");
    card.className = "file-card";

    const { cat, label } = getFileCategory(file.extension);

    card.innerHTML = `
      <div class="file-meta-group">
        <div class="ext-badge ${cat}">${label}</div>
        <div class="file-info">
          <span class="file-name" title="${file.name}">${file.name}</span>
          <div class="file-subtext">
            <span class="file-size-tag">${file.size || "Unknown"}</span>
            <span class="file-path" title="${file.path || ""}">${file.path || ""}</span>
          </div>
        </div>
      </div>
      <div class="file-actions">
        ${
          file.path
            ? `<button class="action-btn" data-action="folder" title="Show in File Explorer">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
              </button>`
            : ""
        }
        <button class="action-btn" data-action="copy" title="Copy Direct Download Link">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
          </svg>
        </button>
        <button class="action-btn delete" data-action="remove" title="Remove from LocalShare">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;

    const folderBtn = card.querySelector('[data-action="folder"]');
    if (folderBtn) {
      folderBtn.addEventListener("click", () => {
        ipcRenderer.send("dashboard:open-folder", file.path);
      });
    }

    const copyBtn = card.querySelector('[data-action="copy"]');
    copyBtn.addEventListener("click", () => {
      const server = currentState.serverInfo;
      const downloadUrl = `http://${server.ip}:${server.port}/download/${file.id}`;
      clipboard.writeText(downloadUrl);
      showToast("Download link copied to clipboard!");
    });

    const removeBtn = card.querySelector('[data-action="remove"]');
    removeBtn.addEventListener("click", () => {
      ipcRenderer.send("dashboard:remove-file", {
        path: file.path,
        id: file.id !== undefined ? file.id : index,
        tab,
      });
      showToast(`Removed "${file.name}"`);
    });

    listElement.appendChild(card);
  });
}

function initFiles() {
  const dropzone = document.getElementById("dropzone");
  const browseBtn = document.getElementById("browseBtn");
  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabPanes = document.querySelectorAll(".tab-pane");
  const removeAllBtn = document.getElementById("removeAllBtn");

  if (browseBtn) {
    browseBtn.addEventListener("click", () => {
      ipcRenderer.send("dashboard:add-files");
    });
  }

  if (dropzone) {
    ["dragenter", "dragover"].forEach((eventName) => {
      document.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add("dragover");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      document.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove("dragover");
      });
    });

    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove("dragover");

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        const paths = Array.from(files)
          .map((f) => f.path)
          .filter((p) => typeof p === "string" && p.length > 0);

        if (paths.length > 0) {
          ipcRenderer.send("dashboard:add-files", paths);
          showToast(`Sharing ${paths.length} dropped file${paths.length > 1 ? "s" : ""}...`);
        }
      }
    });
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetTab = btn.dataset.tab;
      setCurrentTab(targetTab);

      tabButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      tabPanes.forEach((pane) => {
        pane.classList.remove("active");
        if (pane.id === `pane-${targetTab}`) {
          pane.classList.add("active");
        }
      });
    });
  });

  if (removeAllBtn) {
    removeAllBtn.addEventListener("click", () => {
      const currentTab = getCurrentTab();
      const count =
        currentTab === "send"
          ? currentState.sentFiles.length
          : currentState.receivedFiles.length;

      if (count === 0) {
        showToast("No files to remove");
        return;
      }

      ipcRenderer.send("dashboard:remove-all", currentTab);
      showToast(`Cleared all ${currentTab === "send" ? "shared" : "received"} files`);
    });
  }
}

module.exports = {
  renderFilesView,
  renderFileList,
  initFiles,
};
