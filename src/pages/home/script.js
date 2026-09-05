// LocalShare Browser Client Script

let cachedFilesJson = "";
let currentTab = "download";
let pollTimer = null;
let toastTimer = null;

// DOM Elements
const hostName = document.getElementById("hostName");
const manualRefreshBtn = document.getElementById("manualRefreshBtn");
const refreshIcon = document.getElementById("refreshIcon");

const tabButtons = document.querySelectorAll(".tab-button");
const paneDownload = document.getElementById("paneDownload");
const paneUpload = document.getElementById("paneUpload");
const paneClipboard = document.getElementById("paneClipboard");
const clipboardInput = document.getElementById("clipboardInput");
const sendClipboardBtn = document.getElementById("sendClipboardBtn");

const panePair = document.getElementById("panePair");
const mobilePinInput = document.getElementById("mobilePinInput");
const submitMobilePinBtn = document.getElementById("submitMobilePinBtn");
const pairSuccessMsg = document.getElementById("pairSuccessMsg");

const downloadBadge = document.getElementById("downloadBadge");
const filesContainer = document.getElementById("filesContainer");
const downloadEmpty = document.getElementById("downloadEmpty");
const downloadToolbar = document.getElementById("downloadToolbar");
const filesCountHint = document.getElementById("filesCountHint");
const downloadAllBtn = document.getElementById("downloadAllBtn");

const uploadDropzone = document.getElementById("uploadDropzone");
const selectFilesBtn = document.getElementById("selectFilesBtn");
const cameraBtn = document.getElementById("cameraBtn");
const filePicker = document.getElementById("filePicker");
const cameraPicker = document.getElementById("cameraPicker");

const uploadProgressCard = document.getElementById("uploadProgressCard");
const progressTitle = document.getElementById("progressTitle");
const progressPercent = document.getElementById("progressPercent");
const progressBarFill = document.getElementById("progressBarFill");
const progressSubtext = document.getElementById("progressSubtext");

const uploadSuccessCard = document.getElementById("uploadSuccessCard");
const successCountText = document.getElementById("successCountText");
const uploadMoreBtn = document.getElementById("uploadMoreBtn");

const webToast = document.getElementById("webToast");
const webToastText = document.getElementById("webToastText");

// Format file size
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// Map file extension to category
function getCategory(fileName) {
  if (!fileName) return { cat: "file", label: "FILE" };
  const parts = fileName.split(".");
  const ext = parts.length > 1 ? parts.pop().toLowerCase() : "";

  if (ext === "pdf") return { cat: "pdf", label: "PDF" };
  if (["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp", "ico"].includes(ext)) {
    return { cat: "img", label: ext.toUpperCase() };
  }
  if (["mp4", "mkv", "mov", "avi", "webm", "wmv"].includes(ext)) {
    return { cat: "video", label: ext.toUpperCase() };
  }
  if (["mp3", "wav", "flac", "m4a", "aac", "ogg"].includes(ext)) {
    return { cat: "audio", label: ext.toUpperCase() };
  }
  if (["zip", "rar", "7z", "tar", "gz", "bz2"].includes(ext)) {
    return { cat: "zip", label: ext.toUpperCase() };
  }
  if (["js", "ts", "py", "html", "css", "json", "cpp", "java", "c", "rs", "go"].includes(ext)) {
    return { cat: "code", label: ext.toUpperCase() };
  }
  if (["doc", "docx", "txt", "md", "rtf", "csv", "xlsx", "xls", "pptx"].includes(ext)) {
    return { cat: "doc", label: ext.toUpperCase() };
  }
  return { cat: "file", label: ext ? ext.slice(0, 4).toUpperCase() : "FILE" };
}

// Show Toast
function showToast(msg) {
  if (toastTimer) clearTimeout(toastTimer);
  webToastText.textContent = msg;
  webToast.classList.add("show");
  toastTimer = setTimeout(() => {
    webToast.classList.remove("show");
  }, 2500);
}

// Fetch Host Device Info
function fetchServerInfo() {
  fetch("/api/server-info")
    .then((res) => res.json())
    .then((data) => {
      if (data && data.hostname) {
        hostName.textContent = `Connected to ${data.hostname}`;
      } else {
        hostName.textContent = "Connected to Host PC";
      }
    })
    .catch(() => {
      hostName.textContent = "Host PC (Online)";
    });
}

// Fetch and Render Shared Files from PC
function loadSharedFiles(isManual = false) {
  if (isManual) {
    manualRefreshBtn.classList.add("spinning");
  }

  fetch("/api/shared-file")
    .then((res) => res.json())
    .then((files) => {
      if (isManual) {
        setTimeout(() => manualRefreshBtn.classList.remove("spinning"), 400);
      }

      const newJson = JSON.stringify(files);
      if (newJson === cachedFilesJson && !isManual) {
        return; // No changes, avoid re-rendering
      }
      cachedFilesJson = newJson;

      renderSharedFiles(files || []);
    })
    .catch((err) => {
      console.error("Error loading files:", err);
      if (isManual) {
        manualRefreshBtn.classList.remove("spinning");
        showToast("Error connecting to PC");
      }
    });
}

// Render the files
function renderSharedFiles(files) {
  downloadBadge.textContent = files.length;

  if (!files || files.length === 0) {
    downloadEmpty.style.display = "flex";
    filesContainer.style.display = "none";
    downloadToolbar.style.display = "none";
    return;
  }

  downloadEmpty.style.display = "none";
  filesContainer.style.display = "flex";
  downloadToolbar.style.display = "flex";
  filesCountHint.textContent = `${files.length} file${files.length === 1 ? "" : "s"} ready to download`;

  filesContainer.innerHTML = "";

  files.forEach((file) => {
    const row = document.createElement("div");
    row.className = "file-row";

    const { cat, label } = getCategory(file.fileName);

    row.innerHTML = `
      <div class="file-left">
        <div class="file-ext ${cat}">${label}</div>
        <div class="file-text">
          <span class="file-title" title="${file.fileName}">${file.fileName}</span>
          <div class="file-sub">
            <span class="file-size-pill">${file.size || "Unknown"}</span>
          </div>
        </div>
      </div>
      <a href="${file.downloadUrl}" class="file-download-btn" download="${file.fileName}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        <span>Download</span>
      </a>
    `;

    filesContainer.appendChild(row);
  });
}

// Download All sequential trigger
function downloadAllFiles() {
  const downloadLinks = filesContainer.querySelectorAll(".file-download-btn");
  if (downloadLinks.length === 0) return;

  showToast(`Starting download of ${downloadLinks.length} files...`);

  downloadLinks.forEach((link, index) => {
    setTimeout(() => {
      const a = document.createElement("a");
      a.href = link.href;
      a.download = link.getAttribute("download") || "";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }, index * 350);
  });
}

// File Upload Handler via XMLHttpRequest (with live progress)
function uploadSelectedFiles(filesList) {
  if (!filesList || filesList.length === 0) return;

  const files = Array.from(filesList);
  const formData = new FormData();

  let totalSize = 0;
  files.forEach((file) => {
    formData.append("files", file);
    totalSize += file.size;
  });

  // UI state for progress
  uploadSuccessCard.style.display = "none";
  uploadProgressCard.style.display = "flex";
  progressTitle.textContent = `Uploading ${files.length} file${files.length > 1 ? "s" : ""}...`;
  progressPercent.textContent = "0%";
  progressBarFill.style.width = "0%";
  progressSubtext.textContent = `0 MB / ${formatBytes(totalSize)}`;

  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/upload", true);

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const percent = Math.min(100, Math.round((e.loaded / e.total) * 100));
      progressBarFill.style.width = `${percent}%`;
      progressPercent.textContent = `${percent}%`;
      progressSubtext.textContent = `${formatBytes(e.loaded)} / ${formatBytes(e.total)}`;
    }
  };

  xhr.onload = () => {
    uploadProgressCard.style.display = "none";
    if (xhr.status >= 200 && xhr.status < 300) {
      try {
        const res = JSON.parse(xhr.responseText);
        uploadSuccessCard.style.display = "flex";
        successCountText.innerHTML = `Saved <strong>${files.length} file${files.length > 1 ? "s" : ""}</strong> to host PC in <strong>Downloads/LocalShare</strong>.`;
        showToast("Files transferred successfully to PC!");
      } catch (err) {
        showToast("Upload completed!");
      }
    } else {
      showToast("Upload failed. Server error: " + xhr.status);
    }
    // Reset file pickers
    filePicker.value = "";
    cameraPicker.value = "";
  };

  xhr.onerror = () => {
    uploadProgressCard.style.display = "none";
    showToast("Network error uploading files. Check connection.");
  };

  xhr.send(formData);
}

// ==========================
// Event Listeners
// ==========================

// Manual refresh
manualRefreshBtn.addEventListener("click", () => {
  loadSharedFiles(true);
  fetchServerInfo();
});

// Download All
downloadAllBtn.addEventListener("click", downloadAllFiles);

// Tab switching
tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.tab;
    currentTab = target;

    tabButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    paneDownload.classList.toggle("active", target === "download");
    paneUpload.classList.toggle("active", target === "upload");
    paneClipboard.classList.toggle("active", target === "clipboard");
    if (panePair) panePair.classList.toggle("active", target === "pair");

    if (target === "download") {
      loadSharedFiles();
    } else if (target === "clipboard") {
      clipboardInput.focus();
    } else if (target === "pair") {
      if (mobilePinInput) mobilePinInput.focus();
    }
  });
});

// Submit 6-digit key from mobile
if (submitMobilePinBtn) {
  submitMobilePinBtn.addEventListener("click", () => {
    const key = mobilePinInput ? mobilePinInput.value.trim() : "";
    if (!key || key.length !== 6) {
      showToast("Please enter a valid 6-digit key");
      return;
    }

    submitMobilePinBtn.disabled = true;
    submitMobilePinBtn.textContent = "Verifying with PC...";

    fetch("/api/pair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    })
      .then((res) => res.json())
      .then((data) => {
        submitMobilePinBtn.disabled = false;
        submitMobilePinBtn.textContent = "Authorize & Pair Device";
        if (data.success) {
          if (pairSuccessMsg) pairSuccessMsg.style.display = "block";
          showToast("✓ Key verified! Phone paired with PC.");
        } else {
          showToast(data.message || "Failed to verify key");
        }
      })
      .catch((err) => {
        submitMobilePinBtn.disabled = false;
        submitMobilePinBtn.textContent = "Authorize & Pair Device";
        showToast("Error connecting to PC server");
      });
  });
}

// Send Text to PC Clipboard
if (sendClipboardBtn) {
  sendClipboardBtn.addEventListener("click", () => {
    const text = clipboardInput.value.trim();
    if (!text) {
      showToast("Please enter or paste text to send");
      return;
    }

    sendClipboardBtn.disabled = true;
    sendClipboardBtn.innerHTML = "<span>Sending to PC...</span>";

    fetch("/api/clipboard", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    })
      .then((res) => res.json())
      .then((data) => {
        sendClipboardBtn.disabled = false;
        sendClipboardBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
          <span>Copy to PC Clipboard</span>
        `;

        if (data.success) {
          showToast("✓ Copied to PC! Press Ctrl+V to paste.");
          clipboardInput.value = "";
        } else {
          showToast("Error: " + (data.error || "Failed to copy"));
        }
      })
      .catch((err) => {
        sendClipboardBtn.disabled = false;
        sendClipboardBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
          <span>Copy to PC Clipboard</span>
        `;
        showToast("Network error sending text to PC");
      });
  });
}

// File picker triggers
selectFilesBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  filePicker.click();
});

cameraBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  cameraPicker.click();
});

uploadDropzone.addEventListener("click", () => {
  filePicker.click();
});

filePicker.addEventListener("change", () => {
  if (filePicker.files.length > 0) {
    uploadSelectedFiles(filePicker.files);
  }
});

cameraPicker.addEventListener("change", () => {
  if (cameraPicker.files.length > 0) {
    uploadSelectedFiles(cameraPicker.files);
  }
});

// Drag and drop in upload zone
uploadDropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadDropzone.classList.add("dragover");
});

uploadDropzone.addEventListener("dragleave", () => {
  uploadDropzone.classList.remove("dragover");
});

uploadDropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadDropzone.classList.remove("dragover");
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    uploadSelectedFiles(e.dataTransfer.files);
  }
});

// Send more button
uploadMoreBtn.addEventListener("click", () => {
  uploadSuccessCard.style.display = "none";
  filePicker.click();
});

// Initial boot
document.addEventListener("DOMContentLoaded", () => {
  fetchServerInfo();
  loadSharedFiles();

  // Smart background polling every 3.5s for live sync
  pollTimer = setInterval(() => {
    if (currentTab === "download" && document.visibilityState === "visible") {
      loadSharedFiles();
    }
  }, 3500);
});