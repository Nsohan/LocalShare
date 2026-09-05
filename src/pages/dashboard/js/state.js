const { clipboard } = require("electron");

// Global Dashboard State
const currentState = {
  serverInfo: { ip: "127.0.0.1", port: 5199 },
  sentFiles: [],
  receivedFiles: [],
  config: null,
  devices: [],
};

let currentTab = "send";
let currentView = "files";
let toastTimeout = null;

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function getFileCategory(ext) {
  if (!ext) return { cat: "file", label: "FILE" };
  const e = ext.toLowerCase();

  if (e === "pdf") return { cat: "pdf", label: "PDF" };
  if (["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp", "ico"].includes(e)) {
    return { cat: "img", label: e.toUpperCase() };
  }
  if (["mp4", "mkv", "mov", "avi", "webm", "wmv"].includes(e)) {
    return { cat: "video", label: e.toUpperCase() };
  }
  if (["mp3", "wav", "flac", "m4a", "aac", "ogg"].includes(e)) {
    return { cat: "audio", label: e.toUpperCase() };
  }
  if (["zip", "rar", "7z", "tar", "gz", "bz2"].includes(e)) {
    return { cat: "zip", label: e.toUpperCase() };
  }
  if (
    ["js", "ts", "py", "html", "css", "json", "cpp", "java", "c", "rs", "go"].includes(e)
  ) {
    return { cat: "code", label: e.toUpperCase() };
  }
  if (["doc", "docx", "txt", "md", "rtf", "csv", "xlsx", "xls", "pptx"].includes(e)) {
    return { cat: "doc", label: e.toUpperCase() };
  }
  return { cat: "file", label: e.slice(0, 4).toUpperCase() };
}

function showToast(message) {
  const toast = document.getElementById("toast");
  const toastMessage = document.getElementById("toastMessage");
  if (!toast || !toastMessage) return;

  if (toastTimeout) clearTimeout(toastTimeout);
  toastMessage.textContent = message;
  toast.classList.add("show");
  toastTimeout = setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}

function applyTheme(themeName) {
  if (themeName === "light") {
    document.body.setAttribute("data-theme", "light");
  } else if (themeName === "system") {
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
      document.body.setAttribute("data-theme", "light");
    } else {
      document.body.removeAttribute("data-theme");
    }
  } else {
    document.body.removeAttribute("data-theme");
  }
}

module.exports = {
  currentState,
  getCurrentTab: () => currentTab,
  setCurrentTab: (tab) => { currentTab = tab; },
  getCurrentView: () => currentView,
  setCurrentView: (view) => { currentView = view; },
  formatBytes,
  getFileCategory,
  showToast,
  applyTheme,
};
