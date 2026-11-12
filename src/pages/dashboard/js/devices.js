const { ipcRenderer, shell } = require("electron");
const { currentState, showToast } = require("./state");

/**
 * Escape untrusted text before inserting into HTML strings.
 * Prevents XSS in a renderer window that has Node integration enabled.
 * @param {unknown} value
 * @returns {string}
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
 * Validate and normalize an HTTP/HTTPS URL, returning null for unsafe protocols.
 * @param {string} rawUrl
 * @returns {string|null}
 */
function sanitizeHttpUrl(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) return null;
  let candidate = rawUrl.trim();
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) {
    candidate = `http://${candidate}`;
  }
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * Derive a display subnet string from serverInfo without assuming /24 when CIDR is known.
 * @param {Object|null} serverInfo
 * @returns {string}
 */
function formatSubnetDisplay(serverInfo) {
  if (serverInfo && typeof serverInfo.cidr === "string" && serverInfo.cidr) {
    return serverInfo.cidr;
  }
  if (serverInfo && typeof serverInfo.ip === "string" && serverInfo.ip) {
    return serverInfo.ip;
  }
  return "Wi-Fi LAN";
}

function getStatusPresentation(status) {
  if (status === "connected" || status === "online") {
    return { statusClass: "online", statusLabel: "Connected", isOnline: true };
  }
  if (status === "checking") {
    return { statusClass: "checking", statusLabel: "Checking...", isOnline: false };
  }
  return { statusClass: "offline", statusLabel: "Offline", isOnline: false };
}

function formatLastSeenText(device) {
  if (device?.lastSeenAt) {
    const d = new Date(device.lastSeenAt);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    }
  }
  if (device?.pairedAt) {
    const d = new Date(device.pairedAt);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString();
    }
  }
  return "Recently";
}

function applyTelemetryToCard(card, device) {
  const { statusClass, statusLabel, isOnline } = getStatusPresentation(device.status);

  const statusPill = card.querySelector('[data-role="status-pill"]');
  const statusText = card.querySelector('[data-role="status-text"]');
  if (statusPill) statusPill.className = `device-status-pill ${statusClass}`;
  if (statusText) statusText.textContent = statusLabel;

  const telemetryRow = card.querySelector('[data-role="telemetry"]');
  const batteryEl = card.querySelector('[data-role="battery"]');
  const modeEl = card.querySelector('[data-role="mode"]');
  const latencyEl = card.querySelector('[data-role="latency"]');

  const hasBattery = typeof device.battery === "number" && Number.isFinite(device.battery);
  const hasMode = typeof device.mode === "string" && device.mode.trim().length > 0;
  const hasLatency =
    isOnline && typeof device.latencyMs === "number" && Number.isFinite(device.latencyMs);

  if (batteryEl) {
    if (hasBattery) {
      batteryEl.textContent = `Battery ${device.battery}%`;
      batteryEl.style.display = "inline-flex";
    } else {
      batteryEl.textContent = "";
      batteryEl.style.display = "none";
    }
  }

  if (modeEl) {
    if (hasMode) {
      modeEl.textContent = device.mode;
      modeEl.style.display = "inline-flex";
    } else {
      modeEl.textContent = "";
      modeEl.style.display = "none";
    }
  }

  if (latencyEl) {
    if (hasLatency) {
      latencyEl.textContent = `${Math.round(device.latencyMs)} ms`;
      latencyEl.style.display = "inline-flex";
    } else {
      latencyEl.textContent = "";
      latencyEl.style.display = "none";
    }
  }

  if (telemetryRow) {
    telemetryRow.style.display = hasBattery || hasMode || hasLatency ? "flex" : "none";
  }

  const seenLabelEl = card.querySelector('[data-role="seen-label"]');
  const lastSeenEl = card.querySelector('[data-role="last-seen"]');
  if (seenLabelEl) {
    seenLabelEl.textContent = device.lastSeenAt ? "Last Seen" : "Paired On";
  }
  if (lastSeenEl) {
    lastSeenEl.textContent = formatLastSeenText(device);
  }

  const unreachableEl = card.querySelector('[data-role="unreachable"]');
  if (unreachableEl) {
    if (!isOnline && device.status === "offline" && device.unreachableReason) {
      unreachableEl.textContent = device.unreachableReason;
      unreachableEl.style.display = "block";
    } else {
      unreachableEl.textContent = "";
      unreachableEl.style.display = "none";
    }
  }
}

function updateStatsSummary(devices = []) {
  const statDevicesCount = document.getElementById("statDevicesCount");
  const statDevicesOnline = document.getElementById("statDevicesOnline");
  const statDevicesSubnet = document.getElementById("statDevicesSubnet");
  const navDevicesBadge = document.getElementById("navDevicesBadge");
  const emptySubnetHint = document.getElementById("emptyDeviceSubnetHint");

  const list = Array.isArray(devices) ? devices : [];
  const count = list.length;

  if (statDevicesCount) {
    statDevicesCount.textContent = `${count} Device${count !== 1 ? "s" : ""}`;
  }
  if (navDevicesBadge) {
    navDevicesBadge.textContent = String(count);
  }

  const onlineCount = list.filter(
    (d) => d && (d.status === "connected" || d.status === "online"),
  ).length;
  const checkingCount = list.filter((d) => d && d.status === "checking").length;

  if (statDevicesOnline) {
    if (checkingCount > 0 && onlineCount === 0) {
      statDevicesOnline.textContent = `${checkingCount} Checking`;
    } else if (checkingCount > 0) {
      statDevicesOnline.textContent = `${onlineCount} Online (${checkingCount} Checking)`;
    } else {
      statDevicesOnline.textContent = `${onlineCount} Online`;
    }
  }

  const { serverInfo } = currentState;
  if (statDevicesSubnet) {
    statDevicesSubnet.textContent = formatSubnetDisplay(serverInfo);
  }
  if (emptySubnetHint && serverInfo?.ip) {
    const parts = serverInfo.ip.split(".");
    if (parts.length === 4) {
      emptySubnetHint.textContent = `${parts[0]}.${parts[1]}.${parts[2]}.x:8000`;
    }
  }
}

function renderDevicesList(devices = []) {
  const devicesList = document.getElementById("devicesList");
  const devicesEmptyState = document.getElementById("devicesEmptyState");

  if (!devicesList || !devicesEmptyState) return;

  const list = Array.isArray(devices) ? devices : [];
  updateStatsSummary(list);

  devicesList.innerHTML = "";

  if (list.length === 0) {
    devicesEmptyState.style.display = "flex";
    devicesList.style.display = "none";
    return;
  }

  devicesEmptyState.style.display = "none";
  devicesList.style.display = "grid";

  list.forEach((device) => {
    const card = document.createElement("div");
    card.className = "device-card";
    card.dataset.deviceId = device.id || "";
    card.dataset.deviceUrl = device.url || "";

    const safeUrl = sanitizeHttpUrl(device.url);
    const { statusClass, statusLabel } = getStatusPresentation(device.status);
    const displayName = escapeHtml(device.name || "Mobile Device");
    const subLabel = escapeHtml(
      device.model && device.model !== device.name
        ? device.model
        : "Mobile Server",
    );
    const safeUrlText = escapeHtml(
      safeUrl ? safeUrl.replace(/^https?:\/\//i, "") : device.ip || "Invalid URL",
    );
    const safeHref = safeUrl ? escapeHtml(safeUrl) : "#";
    const safeKey = escapeHtml(device.key || "------");
    const safeId = escapeHtml(device.id || "");

    card.innerHTML = `
      <div class="device-card-top">
        <div class="device-main-info">
          <div class="device-avatar">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
              <line x1="12" y1="18" x2="12.01" y2="18"></line>
            </svg>
          </div>
          <div class="device-name-wrap">
            <span class="device-title" title="${displayName}">${displayName}</span>
            <span class="device-type-label">${subLabel}</span>
          </div>
        </div>
        <div class="device-card-top-right">
          <span class="device-status-pill ${statusClass}" data-role="status-pill" id="deviceStatus-${safeId}">
            <span class="status-dot"></span>
            <span data-role="status-text">${escapeHtml(statusLabel)}</span>
          </span>
          <button type="button" class="device-remove-icon-btn" data-action="remove" title="Remove paired device" aria-label="Remove paired device">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        </div>
      </div>

      <div class="device-telemetry-row" data-role="telemetry" style="display: none;">
        <span class="device-chip battery" data-role="battery" title="Battery level" style="display: none;"></span>
        <span class="device-chip mode" data-role="mode" title="Phone ringer mode" style="display: none;"></span>
        <span class="device-chip latency" data-role="latency" title="Last probe round-trip time" style="display: none;"></span>
      </div>

      <div class="device-details-grid">
        <div class="device-detail-item">
          <span class="device-detail-label">Server URL</span>
          <a href="${safeHref}" class="device-url-link" data-role="url-link" title="Open in browser">
            <span>${safeUrlText}</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
          </a>
        </div>
        <div class="device-detail-item">
          <span class="device-detail-label">Pairing Key</span>
          <span class="device-detail-value">${safeKey}</span>
        </div>
        <div class="device-detail-item">
          <span class="device-detail-label" data-role="seen-label">Paired On</span>
          <span class="device-detail-value" data-role="last-seen" style="font-size: 0.72rem; color: var(--text-dim);"></span>
        </div>
      </div>

      <div class="device-unreachable-note" data-role="unreachable" style="display: none;"></div>

      <div class="device-card-footer">
        <div class="device-card-actions">
          <button type="button" class="btn btn-sm btn-secondary" data-action="ping" title="Test HTTP connection to phone">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12.55a11 11 0 0 1 14.08 0"></path>
              <path d="M1.42 9a16 16 0 0 1 21.16 0"></path>
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
            </svg>
            <span>Test Ping</span>
          </button>
          <button type="button" class="btn btn-sm btn-secondary" data-action="browse" title="Open device URL in default browser">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
            </svg>
            <span>Open</span>
          </button>
          <button type="button" class="btn btn-sm btn-secondary" data-action="send-clipboard" title="Send PC clipboard text to phone clipboard (/command?clip=)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
            </svg>
            <span>Send Clipboard</span>
          </button>
          <button type="button" class="btn btn-sm btn-secondary" data-action="write-text" title="Type text onto phone (/command?write=)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
            <span>Write Text</span>
          </button>
          <button type="button" class="btn btn-sm btn-primary device-action-full" data-action="send-file" title="Send file(s) to phone (POST /files)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            <span>Send File</span>
          </button>
        </div>
      </div>
    `;

    applyTelemetryToCard(card, device);

    const targetUrl = safeUrl || device.url || "";

    const pingBtn = card.querySelector('[data-action="ping"]');
    if (pingBtn) {
      pingBtn.addEventListener("click", async () => {
        pingBtn.disabled = true;
        pingBtn.textContent = "Pinging...";
        const statusPill = card.querySelector('[data-role="status-pill"]');
        const statusText = card.querySelector('[data-role="status-text"]');
        if (statusPill) statusPill.className = "device-status-pill checking";
        if (statusText) statusText.textContent = "Checking...";

        try {
          const testRes = await ipcRenderer.invoke("devices:test-connection", targetUrl);
          if (testRes && testRes.online) {
            if (statusPill) statusPill.className = "device-status-pill online";
            if (statusText) statusText.textContent = "Connected";
            showToast(`✓ ${device.name} is reachable (${testRes.latencyMs}ms)`);
          } else {
            if (statusPill) statusPill.className = "device-status-pill offline";
            if (statusText) statusText.textContent = "Offline";
            showToast(`⚠️ ${device.name} is unreachable`);
          }
        } catch (err) {
          showToast(`Error pinging device: ${err.message}`);
        } finally {
          pingBtn.disabled = false;
          pingBtn.innerHTML = `
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12.55a11 11 0 0 1 14.08 0"></path>
              <path d="M1.42 9a16 16 0 0 1 21.16 0"></path>
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
            </svg>
            <span>Test Ping</span>
          `;
        }
      });
    }

    const sendClipboardBtn = card.querySelector('[data-action="send-clipboard"]');
    if (sendClipboardBtn) {
      if (!safeUrl) sendClipboardBtn.disabled = true;
      const defaultClipHtml = sendClipboardBtn.innerHTML;
      sendClipboardBtn.addEventListener("click", async () => {
        if (!safeUrl) return;
        sendClipboardBtn.disabled = true;
        sendClipboardBtn.textContent = "Sending...";
        try {
          const res = await ipcRenderer.invoke("devices:send-clipboard", {
            deviceUrl: safeUrl,
          });
          if (res && res.success) {
            showToast(`✓ Sent clipboard to ${device.name}: "${res.preview}"`);
          } else if (res && res.empty) {
            showToast("⚠️ PC clipboard has no text");
          } else {
            showToast(`⚠️ Failed to send clipboard: ${res?.error || "Device unreachable"}`);
          }
        } catch (err) {
          showToast(`Error sending clipboard: ${err.message}`);
        } finally {
          sendClipboardBtn.disabled = !safeUrl;
          sendClipboardBtn.innerHTML = defaultClipHtml;
        }
      });
    }

    const writeTextBtn = card.querySelector('[data-action="write-text"]');
    if (writeTextBtn) {
      if (!safeUrl) writeTextBtn.disabled = true;
      writeTextBtn.addEventListener("click", () => {
        if (!safeUrl) return;
        const { openWriteTextModal } = require("./modals");
        openWriteTextModal({
          deviceName: device.name || "Device",
          deviceUrl: safeUrl,
        });
      });
    }

    const sendFileBtn = card.querySelector('[data-action="send-file"]');
    if (sendFileBtn) {
      if (!safeUrl) sendFileBtn.disabled = true;
      const defaultFileHtml = sendFileBtn.innerHTML;
      sendFileBtn.addEventListener("click", async () => {
        if (!safeUrl) return;
        sendFileBtn.disabled = true;
        sendFileBtn.textContent = "Sending...";
        try {
          const res = await ipcRenderer.invoke("devices:send-file", {
            deviceUrl: safeUrl,
          });
          if (res && res.canceled) {
            return;
          }
          if (res && res.success) {
            if (res.failed && res.failed.length > 0) {
              showToast(`⚠️ Sent ${res.sentCount}/${res.totalCount} file(s) to ${device.name}`);
            } else {
              showToast(`✓ Sent ${res.sentCount} file${res.sentCount !== 1 ? "s" : ""} to ${device.name}`);
            }
          } else {
            showToast(`⚠️ Failed to send file: ${res?.error || "Device unreachable"}`);
          }
        } catch (err) {
          showToast(`Error sending file: ${err.message}`);
        } finally {
          sendFileBtn.disabled = !safeUrl;
          sendFileBtn.innerHTML = defaultFileHtml;
        }
      });
    }

    const openExternalSafe = (e) => {
      e.preventDefault();
      if (!safeUrl) {
        showToast("⚠️ Blocked unsafe or invalid device URL");
        return;
      }
      shell.openExternal(safeUrl);
    };

    const browseBtn = card.querySelector('[data-action="browse"]');
    if (browseBtn) {
      if (!safeUrl) browseBtn.disabled = true;
      browseBtn.addEventListener("click", openExternalSafe);
    }

    const urlLink = card.querySelector('[data-role="url-link"]');
    if (urlLink) {
      urlLink.addEventListener("click", openExternalSafe);
    }

    const removeBtn = card.querySelector('[data-action="remove"]');
    if (removeBtn) {
      removeBtn.addEventListener("click", async () => {
        if (confirm(`Are you sure you want to remove "${device.name}"?`)) {
          const delRes = await ipcRenderer.invoke("devices:remove", device.id);
          if (delRes && delRes.success) {
            currentState.devices = delRes.devices;
            renderDevicesList(currentState.devices);
            showToast(`Removed "${device.name}"`);
          }
        }
      });
    }

    devicesList.appendChild(card);
  });
}

/**
 * Patch runtime status/battery/mode/latency onto existing device cards without re-rendering
 * the full dashboard or regenerating QR codes. Falls back to renderDevicesList on structural changes.
 * @param {Array<Object>|{devices?: Array<Object>, serverInfo?: Object}} payload
 */
function patchDeviceStatuses(payload) {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.devices)
      ? payload.devices
      : [];

  currentState.devices = list;
  if (payload && !Array.isArray(payload) && payload.serverInfo) {
    currentState.serverInfo = {
      ...(currentState.serverInfo || {}),
      ...payload.serverInfo,
    };
  }

  const devicesList = document.getElementById("devicesList");
  const devicesEmptyState = document.getElementById("devicesEmptyState");
  if (!devicesList || !devicesEmptyState) return;

  const existingCards = [...devicesList.querySelectorAll(".device-card")];
  const sameShape =
    existingCards.length === list.length &&
    list.every(
      (dev, idx) =>
        existingCards[idx]?.dataset?.deviceId === (dev.id || "") &&
        existingCards[idx]?.dataset?.deviceUrl === (dev.url || ""),
    );

  if (!sameShape) {
    renderDevicesList(list);
    return;
  }

  updateStatsSummary(list);
  list.forEach((device, idx) => {
    applyTelemetryToCard(existingCards[idx], device);
  });
}

function initDevices() {
  renderDevicesList(currentState.devices || []);

  const rescanBtn = document.getElementById("rescanDevicesBtn");
  const rescanText = document.getElementById("rescanDevicesBtnText");
  if (rescanBtn && !rescanBtn.dataset.bound) {
    rescanBtn.dataset.bound = "1";
    rescanBtn.addEventListener("click", async () => {
      rescanBtn.disabled = true;
      if (rescanText) rescanText.textContent = "Scanning...";
      try {
        const res = await ipcRenderer.invoke("devices:rescan");
        if (res && Array.isArray(res.devices)) {
          patchDeviceStatuses(res.devices);
        }
        showToast(res?.started ? "Device scan complete" : "Device watcher inactive");
      } catch (err) {
        showToast(`Rescan failed: ${err.message}`);
      } finally {
        rescanBtn.disabled = false;
        if (rescanText) rescanText.textContent = "Rescan";
      }
    });
  }
}

function focusDeviceWriteInput({ deviceId = "", deviceUrl = "" } = {}) {
  const list = Array.isArray(currentState.devices) ? currentState.devices : [];
  if (list.length === 0) return false;

  const targetDevice =
    list.find((d) => deviceId && d.id === deviceId) ||
    list.find((d) => deviceUrl && sanitizeHttpUrl(d.url) === sanitizeHttpUrl(deviceUrl)) ||
    list.find((d) => Boolean(sanitizeHttpUrl(d.url)));
  if (!targetDevice) return false;

  const safeUrl = sanitizeHttpUrl(targetDevice.url);
  if (!safeUrl) return false;

  const { openWriteTextModal } = require("./modals");
  return openWriteTextModal({
    deviceName: targetDevice.name || "Device",
    deviceUrl: safeUrl,
  });
}

module.exports = {
  escapeHtml,
  sanitizeHttpUrl,
  formatSubnetDisplay,
  renderDevicesList,
  patchDeviceStatuses,
  focusDeviceWriteInput,
  initDevices,
};
