// LocalShare Browser Client Script

let cachedFilesJson = "";
let currentTab = "download";
let pollTimer = null;
let toastTimer = null;
let activePreviewTextItem = null;
let copyBtnResetTimer = null;

// DOM Elements
const hostName = document.getElementById("hostName");
const hostIpPill = document.getElementById("hostIpPill");
const hostIpText = document.getElementById("hostIpText");
const copyHostIpBtn = document.getElementById("copyHostIpBtn");
const manualRefreshBtn = document.getElementById("manualRefreshBtn");
const refreshIcon = document.getElementById("refreshIcon");
let currentHostUrl = "";

const tabButtons = document.querySelectorAll(".tab-button");
const paneDownload = document.getElementById("paneDownload");
const paneUpload = document.getElementById("paneUpload");
const openSendTextBtn = document.getElementById("openSendTextBtn");
const sendTextModal = document.getElementById("sendTextModal");
const closeSendTextBtn = document.getElementById("closeSendTextBtn");
const cancelSendTextBtn = document.getElementById("cancelSendTextBtn");
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

const textPreviewModal = document.getElementById("textPreviewModal");
const textPreviewTitle = document.getElementById("textPreviewTitle");
const textPreviewMeta = document.getElementById("textPreviewMeta");
const textPreviewContent = document.getElementById("textPreviewContent");
const closeTextPreviewBtn = document.getElementById("closeTextPreviewBtn");
const cancelTextPreviewBtn = document.getElementById("cancelTextPreviewBtn");
const downloadTextPreviewBtn = document.getElementById("downloadTextPreviewBtn");
const copyTextPreviewBtn = document.getElementById("copyTextPreviewBtn");
const copyTextPreviewLabel = document.getElementById("copyTextPreviewLabel");

/**
 * Escape untrusted text before inserting into HTML strings.
 */
function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Copy text to clipboard with fallback for non-HTTPS LAN origins (e.g. http://192.168.x.x).
 */
async function copyTextToClipboard(text) {
  if (!text) return false;

  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      // Fall through to execCommand fallback
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch (err) {
    copied = false;
  }
  document.body.removeChild(textarea);
  return copied;
}

/**
 * Derive a short title from the first few words of the first line when no custom label is given.
 */
function deriveTextTitle(content, customTitle = "") {
  const explicit = typeof customTitle === "string" ? customTitle.trim() : "";
  if (explicit) return explicit;

  const raw = typeof content === "string" ? content.trim() : "";
  if (!raw) return "Text snippet";

  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const firstLine = lines[0] || "";
  const words = firstLine.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "Text snippet";

  const maxWords = 4;
  const maxChars = 24;
  const picked = [];

  for (let i = 0; i < Math.min(words.length, maxWords); i++) {
    const candidate = picked.length > 0 ? `${picked.join(" ")} ${words[i]}` : words[i];
    if (candidate.length > maxChars) {
      if (picked.length === 0) {
        return `${words[0].slice(0, maxChars - 2)}..`;
      }
      break;
    }
    picked.push(words[i]);
  }

  const prefix = picked.join(" ");
  const isTruncated = picked.length < words.length || lines.length > 1;
  return isTruncated ? `${prefix}..` : prefix;
}

/**
 * Build a safe .txt download filename from the text item title/first words.
 */
function buildTextDownloadFilename(item) {
  const baseTitle = deriveTextTitle(item && item.content, item && item.title)
    .replace(/\.+$/, "")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  let safeBase = baseTitle.slice(0, 48).trim();
  if (!safeBase) safeBase = "shared-text";
  if (/\.txt$/i.test(safeBase)) return safeBase;
  return `${safeBase}.txt`;
}

/**
 * Download a shared text item as a .txt file (prefers server Content-Disposition endpoint).
 */
function downloadTextAsFile(item) {
  if (!item) return;
  const filename = buildTextDownloadFilename(item);

  if (item.downloadUrl) {
    const a = document.createElement("a");
    a.href = item.downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast(`✓ Downloaded ${filename}`);
    return;
  }

  const contentText = typeof item.content === "string" ? item.content : "";
  const blob = new Blob([contentText], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(`✓ Downloaded ${filename}`);
}

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
function buildHostUrl(ip, port) {
  if (!ip) return "";
  return port ? `http://${ip}:${port}` : `http://${ip}`;
}

function updateHostIpDisplay(ip, port) {
  if (!hostIpPill || !hostIpText) return;
  const url = buildHostUrl(ip, port);
  currentHostUrl = url;
  if (url) {
    hostIpText.textContent = url;
    hostIpPill.classList.add("visible");
  } else {
    hostIpText.textContent = "";
    hostIpPill.classList.remove("visible");
  }
}

function fetchServerInfo() {
  const locationHost = window.location.hostname;
  const isLocalAlias =
    !locationHost ||
    locationHost === "localhost" ||
    locationHost === "127.0.0.1" ||
    locationHost === "::1";
  const fallbackIp = isLocalAlias ? "" : locationHost;
  const fallbackPort = window.location.port || "";

  fetch("/api/server-info")
    .then((res) => res.json())
    .then((data) => {
      const hostLabel = data && data.hostname ? data.hostname : "Host PC";
      hostName.textContent = `Connected to ${hostLabel}`;

      const ip = (data && data.ip) || fallbackIp;
      const port = (data && data.port) || fallbackPort;
      updateHostIpDisplay(ip, port);
    })
    .catch(() => {
      hostName.textContent = "Host PC (Online)";
      updateHostIpDisplay(fallbackIp, fallbackPort);
    });
}

// Fetch and Render Shared Items (Files + Text) from PC
function loadSharedFiles(isManual = false) {
  if (isManual) {
    manualRefreshBtn.classList.add("spinning");
  }

  fetch("/api/shared-items", { cache: "no-store" })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((data) => {
      if (isManual) {
        setTimeout(() => manualRefreshBtn.classList.remove("spinning"), 400);
      }

      const files = Array.isArray(data)
        ? data
        : Array.isArray(data && data.files)
        ? data.files
        : [];
      const texts = Array.isArray(data && data.texts) ? data.texts : [];

      const fileItems = files.map((file) => ({ kind: "file", ...file }));
      const textItems = texts.map((text) => ({ kind: "text", ...text }));
      const combinedItems = [...textItems, ...fileItems];

      const newJson = JSON.stringify(combinedItems);
      if (newJson === cachedFilesJson && !isManual) {
        return; // No changes, avoid re-rendering
      }
      cachedFilesJson = newJson;

      renderSharedItems(combinedItems);
    })
    .catch((err) => {
      console.error("Error loading shared items:", err);
      if (isManual) {
        manualRefreshBtn.classList.remove("spinning");
        showToast("Error connecting to PC");
      }
    });
}

function formatSharedCountHint(fileCount, textCount) {
  const parts = [];
  if (fileCount > 0) parts.push(`${fileCount} file${fileCount === 1 ? "" : "s"}`);
  if (textCount > 0) parts.push(`${textCount} text${textCount === 1 ? "" : "s"}`);
  return `${parts.join(", ")} ready`;
}

function createFileRow(file) {
  const row = document.createElement("div");
  row.className = "file-row";

  const { cat, label } = getCategory(file.fileName);
  const safeName = escapeHtml(file.fileName || "Unknown file");
  const safeSize = escapeHtml(file.size || "Unknown");
  const safeUrl = escapeHtml(file.downloadUrl || "#");

  row.innerHTML = `
    <div class="file-left">
      <div class="file-ext ${cat}">${escapeHtml(label)}</div>
      <div class="file-text">
        <span class="file-title" title="${safeName}">${safeName}</span>
        <div class="file-sub">
          <span class="file-size-pill">${safeSize}</span>
        </div>
      </div>
    </div>
    <a href="${safeUrl}" class="file-download-btn" download="${safeName}">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      <span>Download</span>
    </a>
  `;

  return row;
}

function createTextCard(item) {
  const card = document.createElement("div");
  card.className = "text-card";
  card.tabIndex = 0;
  card.setAttribute("role", "button");

  const contentText = typeof item.content === "string" ? item.content : "";
  const titleText = deriveTextTitle(contentText, item.title);
  const compactSnippet = contentText.replace(/\s+/g, " ").trim();
  const charCount = contentText.length;

  card.setAttribute("aria-label", `Preview ${titleText}`);

  card.innerHTML = `
    <div class="text-card-body">
      <div class="text-card-title" title="${escapeHtml(titleText)}">${escapeHtml(titleText)}</div>
      <div class="text-card-snippet">${escapeHtml(compactSnippet)}</div>
    </div>
    <div class="text-card-footer">
      <span class="text-type-pill">TXT</span>
      <span class="text-card-meta">${charCount} chars</span>
    </div>
    <div class="text-card-hover-actions">
      <div class="text-card-hover-row">
        <button type="button" class="text-card-action-btn view" data-action="view">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
          <span>View</span>
        </button>
        <button type="button" class="text-card-action-btn copy" data-action="copy">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          <span>Copy</span>
        </button>
      </div>
      <button type="button" class="text-card-action-btn download" data-action="download">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        <span>Download</span>
      </button>
    </div>
  `;

  const viewBtn = card.querySelector('[data-action="view"]');
  const copyBtn = card.querySelector('[data-action="copy"]');
  const downloadBtn = card.querySelector('[data-action="download"]');

  viewBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openTextPreviewModal(item);
  });

  copyBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const ok = await copyTextToClipboard(contentText);
    showToast(ok ? "✓ Copied text to clipboard!" : "Could not copy text");
  });

  downloadBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    downloadTextAsFile(item);
  });

  card.addEventListener("click", () => {
    openTextPreviewModal(item);
  });

  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openTextPreviewModal(item);
    }
  });

  return card;
}

function openTextPreviewModal(item) {
  if (!textPreviewModal || !item) return;

  activePreviewTextItem = item;
  const contentText = typeof item.content === "string" ? item.content : "";
  const titleText = deriveTextTitle(contentText, item.title);
  const lineCount = contentText ? contentText.split(/\r?\n/).length : 0;

  textPreviewTitle.textContent = titleText;
  textPreviewMeta.textContent = `${contentText.length.toLocaleString()} characters • ${lineCount} line${lineCount === 1 ? "" : "s"}`;
  textPreviewContent.textContent = contentText;
  if (copyTextPreviewLabel) copyTextPreviewLabel.textContent = "Copy";

  textPreviewModal.classList.add("open");
  textPreviewModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeTextPreviewModal() {
  if (!textPreviewModal) return;
  textPreviewModal.classList.remove("open");
  textPreviewModal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  activePreviewTextItem = null;
}

function openSendTextModal() {
  if (!sendTextModal) return;
  sendTextModal.classList.add("open");
  sendTextModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  if (clipboardInput) {
    requestAnimationFrame(() => clipboardInput.focus());
  }
}

function closeSendTextModal() {
  if (!sendTextModal) return;
  sendTextModal.classList.remove("open");
  sendTextModal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

// Render dynamic shared items (files + text cards)
function renderSharedItems(items) {
  const list = Array.isArray(items) ? items : [];
  downloadBadge.textContent = list.length;

  if (list.length === 0) {
    downloadEmpty.style.display = "flex";
    filesContainer.style.display = "none";
    downloadToolbar.style.display = "none";
    return;
  }

  const fileCount = list.filter((item) => item.kind !== "text").length;
  const textCount = list.filter((item) => item.kind === "text").length;

  downloadEmpty.style.display = "none";
  filesContainer.style.display = "grid";
  downloadToolbar.style.display = "flex";
  filesCountHint.textContent = formatSharedCountHint(fileCount, textCount);
  if (downloadAllBtn) {
    downloadAllBtn.style.display = fileCount > 0 ? "inline-flex" : "none";
  }

  filesContainer.innerHTML = "";

  list.forEach((item) => {
    const node = item.kind === "text" ? createTextCard(item) : createFileRow(item);
    filesContainer.appendChild(node);
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

// Copy Host URL from header pill
async function handleCopyHostUrl(e) {
  if (e) e.stopPropagation();
  if (!currentHostUrl) return;
  const ok = await copyTextToClipboard(currentHostUrl);
  showToast(ok ? `✓ Copied ${currentHostUrl}` : "Could not copy host URL");
}

if (copyHostIpBtn) {
  copyHostIpBtn.addEventListener("click", handleCopyHostUrl);
}
if (hostIpPill) {
  hostIpPill.addEventListener("click", handleCopyHostUrl);
}

// Download All
downloadAllBtn.addEventListener("click", downloadAllFiles);

// Text Preview Modal controls
if (closeTextPreviewBtn) {
  closeTextPreviewBtn.addEventListener("click", closeTextPreviewModal);
}
if (cancelTextPreviewBtn) {
  cancelTextPreviewBtn.addEventListener("click", closeTextPreviewModal);
}
if (downloadTextPreviewBtn) {
  downloadTextPreviewBtn.addEventListener("click", () => {
    if (!activePreviewTextItem) return;
    downloadTextAsFile(activePreviewTextItem);
  });
}
if (textPreviewModal) {
  textPreviewModal.addEventListener("click", (e) => {
    if (e.target === textPreviewModal) {
      closeTextPreviewModal();
    }
  });
}
if (copyTextPreviewBtn) {
  copyTextPreviewBtn.addEventListener("click", async () => {
    if (!activePreviewTextItem) return;
    const ok = await copyTextToClipboard(activePreviewTextItem.content || "");
    if (ok) {
      if (copyBtnResetTimer) clearTimeout(copyBtnResetTimer);
      if (copyTextPreviewLabel) copyTextPreviewLabel.textContent = "Copied!";
      showToast("✓ Copied text to clipboard!");
      copyBtnResetTimer = setTimeout(() => {
        if (copyTextPreviewLabel) copyTextPreviewLabel.textContent = "Copy";
      }, 1500);
    } else {
      showToast("Could not copy text");
    }
  });
}
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (textPreviewModal && textPreviewModal.classList.contains("open")) {
    closeTextPreviewModal();
  } else if (sendTextModal && sendTextModal.classList.contains("open")) {
    closeSendTextModal();
  }
});

// Send Text Modal controls
if (openSendTextBtn) {
  openSendTextBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openSendTextModal();
  });
}
if (closeSendTextBtn) {
  closeSendTextBtn.addEventListener("click", closeSendTextModal);
}
if (cancelSendTextBtn) {
  cancelSendTextBtn.addEventListener("click", closeSendTextModal);
}
if (sendTextModal) {
  sendTextModal.addEventListener("click", (e) => {
    if (e.target === sendTextModal) {
      closeSendTextModal();
    }
  });
}

// Tab switching
tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.tab;
    currentTab = target;

    tabButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    paneDownload.classList.toggle("active", target === "download");
    paneUpload.classList.toggle("active", target === "upload");
    if (panePair) panePair.classList.toggle("active", target === "pair");

    if (target === "download") {
      loadSharedFiles();
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

    const defaultBtnHtml = sendClipboardBtn.innerHTML;
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
        sendClipboardBtn.innerHTML = defaultBtnHtml;

        if (data.success) {
          clipboardInput.value = "";
          closeSendTextModal();
          showToast("✓ Copied to PC! Press Ctrl+V to paste.");
        } else {
          showToast("Error: " + (data.error || "Failed to copy"));
        }
      })
      .catch((err) => {
        sendClipboardBtn.disabled = false;
        sendClipboardBtn.innerHTML = defaultBtnHtml;
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

  // Smart background polling every 2s for live sync
  pollTimer = setInterval(() => {
    if (currentTab === "download" && document.visibilityState === "visible") {
      loadSharedFiles();
    }
  }, 2000);
});