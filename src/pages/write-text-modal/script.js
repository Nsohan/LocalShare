const { ipcRenderer, clipboard } = require("electron");

const targetLabel = document.getElementById("writeTextTargetLabel");
const form = document.getElementById("writeTextModalForm");
const input = document.getElementById("writeTextModalInput");
const errBox = document.getElementById("writeTextErrorAlert");
const errText = document.getElementById("writeTextErrorText");
const closeBtn = document.getElementById("closeWriteTextModalBtn");
const cancelBtn = document.getElementById("cancelWriteTextBtn");
const pasteBtn = document.getElementById("pasteWriteTextBtn");
const submitBtn = document.getElementById("submitWriteTextBtn");
const submitText = document.getElementById("submitWriteTextBtnText");

let activeTarget = { deviceName: "Device", deviceUrl: "" };
let isSubmitting = false;

function applyTheme(theme) {
  document.body.setAttribute("data-theme", theme === "light" ? "light" : "dark");
}

function showError(message) {
  if (errText) errText.textContent = message;
  if (errBox) errBox.style.display = "flex";
}

function hideError() {
  if (errBox) errBox.style.display = "none";
}

function setSubmitting(busy) {
  isSubmitting = busy;
  if (input) input.disabled = busy;
  if (submitBtn) submitBtn.disabled = busy;
  if (pasteBtn) pasteBtn.disabled = busy;
  if (cancelBtn) cancelBtn.disabled = busy;
  if (submitText) submitText.textContent = busy ? "Writing..." : "Write";
}

function closeModalWindow() {
  window.close();
}

ipcRenderer.on("write-text-modal:init", (_event, payload = {}) => {
  activeTarget = {
    deviceName: payload.deviceName || "Device",
    deviceUrl: payload.deviceUrl || "",
  };

  applyTheme(payload.theme);

  if (targetLabel) {
    const cleanHost = activeTarget.deviceUrl.replace(/^https?:\/\//i, "");
    targetLabel.textContent = cleanHost
      ? `Send text to ${activeTarget.deviceName} (${cleanHost})`
      : `Type text onto ${activeTarget.deviceName}`;
  }

  hideError();
  setSubmitting(false);
  if (input) {
    input.value = "";
    requestAnimationFrame(() => input.focus());
  }
});

async function submitWriteText() {
  if (isSubmitting) return;
  if (!activeTarget.deviceUrl) {
    showError("No target device selected.");
    return;
  }

  const text = input ? input.value : "";
  if (!text) {
    showError("Please enter or paste text to write.");
    if (input) input.focus();
    return;
  }

  hideError();
  setSubmitting(true);

  try {
    const res = await ipcRenderer.invoke("devices:write-text", {
      deviceName: activeTarget.deviceName,
      deviceUrl: activeTarget.deviceUrl,
      text,
      notify: true,
    });

    if (res && res.success) {
      closeModalWindow();
      return;
    }

    showError(res?.error || "Device unreachable");
  } catch (err) {
    showError(err?.message || "Failed to write text");
  } finally {
    setSubmitting(false);
    if (input) input.focus();
  }
}

if (closeBtn) closeBtn.addEventListener("click", closeModalWindow);
if (cancelBtn) cancelBtn.addEventListener("click", closeModalWindow);

if (pasteBtn) {
  pasteBtn.addEventListener("click", () => {
    const clipText = clipboard.readText() || "";
    if (!clipText) {
      showError("PC clipboard has no text.");
      if (input) input.focus();
      return;
    }

    if (input) {
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      const current = input.value;
      input.value = current.slice(0, start) + clipText + current.slice(end);
      const caret = start + clipText.length;
      input.setSelectionRange(caret, caret);
      input.focus();
    }
    hideError();
  });
}

if (form) {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submitWriteText();
  });
}

if (input) {
  input.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      submitWriteText();
    }
  });
}

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeModalWindow();
  }
});

