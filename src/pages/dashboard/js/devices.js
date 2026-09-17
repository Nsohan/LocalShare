const { ipcRenderer, shell } = require("electron");
const { currentState, showToast } = require("./state");

function renderDevicesList(devices = []) {
  const devicesList = document.getElementById("devicesList");
  const devicesEmptyState = document.getElementById("devicesEmptyState");
  const statDevicesCount = document.getElementById("statDevicesCount");
  const statDevicesOnline = document.getElementById("statDevicesOnline");
  const statDevicesSubnet = document.getElementById("statDevicesSubnet");
  const navDevicesBadge = document.getElementById("navDevicesBadge");

  if (!devicesList || !devicesEmptyState) return;

  const count = devices ? devices.length : 0;
  if (statDevicesCount) statDevicesCount.textContent = `${count} Device${count !== 1 ? "s" : ""}`;
  if (navDevicesBadge) navDevicesBadge.textContent = count;

  const { serverInfo } = currentState;
  if (statDevicesSubnet && serverInfo && serverInfo.ip) {
    const parts = serverInfo.ip.split(".");
    if (parts.length === 4) {
      statDevicesSubnet.textContent = `${parts[0]}.${parts[1]}.${parts[2]}.*`;
    }
  }

  devicesList.innerHTML = "";

  if (!devices || devices.length === 0) {
    devicesEmptyState.style.display = "flex";
    devicesList.style.display = "none";
    if (statDevicesOnline) statDevicesOnline.textContent = "0 Online";
    return;
  }

  devicesEmptyState.style.display = "none";
  devicesList.style.display = "grid";

  const onlineCount = devices.filter((d) => d.status === "connected" || d.status === "online").length;
  if (statDevicesOnline) statDevicesOnline.textContent = `${onlineCount} Online`;

  devices.forEach((device) => {
    const card = document.createElement("div");
    card.className = "device-card";

    const isOnline = device.status === "connected" || device.status === "online";
    const statusClass = isOnline ? "online" : "offline";
    const statusLabel = isOnline ? "Connected" : "Offline";

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
            <span class="device-title" title="${device.name}">${device.name}</span>
            <span class="device-type-label">Mobile Server</span>
          </div>
        </div>
        <span class="device-status-pill ${statusClass}" id="deviceStatus-${device.id}">
          <span class="status-dot"></span>
          <span>${statusLabel}</span>
        </span>
      </div>

      <div class="device-details-grid">
        <div class="device-detail-item">
          <span class="device-detail-label">Server URL</span>
          <a href="${device.url}" class="device-url-link" title="Open in browser">
            <span>${device.url.replace(/^https?:\/\//i, "")}</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
          </a>
        </div>
        <div class="device-detail-item">
          <span class="device-detail-label">Pairing Key</span>
          <span class="device-detail-value">${device.key || "------"}</span>
        </div>
        <div class="device-detail-item">
          <span class="device-detail-label">Paired On</span>
          <span class="device-detail-value" style="font-size: 0.72rem; color: var(--text-dim);">
            ${device.pairedAt ? new Date(device.pairedAt).toLocaleDateString() : "Recently"}
          </span>
        </div>
      </div>

      <div class="device-card-footer">
        <div class="device-card-actions">
          <button class="btn btn-sm btn-secondary" data-action="ping" data-id="${device.id}" title="Test HTTP connection to phone">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12.55a11 11 0 0 1 14.08 0"></path>
              <path d="M1.42 9a16 16 0 0 1 21.16 0"></path>
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
            </svg>
            <span>Test Ping</span>
          </button>
          <button class="btn btn-sm btn-primary" data-action="mirror" data-url="${device.url}" data-name="${device.name}" title="Mirror phone screen with scrcpy">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="8" y1="21" x2="16" y2="21"></line>
              <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
            <span>Mirror</span>
          </button>
          <button class="btn btn-sm btn-secondary" data-action="browse" data-url="${device.url}" title="Open device URL in default browser">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
            </svg>
            <span>Open</span>
          </button>
          <button class="btn btn-sm btn-ghost danger" data-action="remove" data-id="${device.id}" data-name="${device.name}" title="Remove paired device">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            <span>Remove</span>
          </button>
        </div>
      </div>
    `;

    // Action listeners
    const mirrorBtn = card.querySelector('[data-action="mirror"]');
    if (mirrorBtn) {
      mirrorBtn.addEventListener("click", () => {
        try {
          const rawUrl = device.url || "";
          const hostMatch = rawUrl.match(/https?:\/\/([^/:]+)/i);
          const hostIp = hostMatch ? hostMatch[1] : "";
          
          const { switchView } = require("./navigation");
          switchView("mirror");

          if (hostIp) {
            const ipInput = document.getElementById("wirelessIpInput");
            if (ipInput) ipInput.value = hostIp;
          }
        } catch (e) {
          console.error("Error switching to mirror view:", e);
        }
      });
    }
    const pingBtn = card.querySelector('[data-action="ping"]');
    pingBtn.addEventListener("click", async () => {
      pingBtn.disabled = true;
      pingBtn.innerHTML = "<span>Pinging...</span>";
      const statusPill = document.getElementById(`deviceStatus-${device.id}`);
      if (statusPill) {
        statusPill.className = "device-status-pill checking";
        statusPill.innerHTML = '<span class="status-dot"></span><span>Checking...</span>';
      }

      try {
        const testRes = await ipcRenderer.invoke("devices:test-connection", device.url);
        if (testRes && testRes.online) {
          if (statusPill) {
            statusPill.className = "device-status-pill online";
            statusPill.innerHTML = '<span class="status-dot"></span><span>Connected</span>';
          }
          showToast(`✓ ${device.name} is reachable (${testRes.latencyMs}ms)`);
        } else {
          if (statusPill) {
            statusPill.className = "device-status-pill offline";
            statusPill.innerHTML = '<span class="status-dot"></span><span>Offline</span>';
          }
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

    const browseBtn = card.querySelector('[data-action="browse"]');
    browseBtn.addEventListener("click", (e) => {
      e.preventDefault();
      shell.openExternal(device.url);
    });

    const urlLink = card.querySelector(".device-url-link");
    urlLink.addEventListener("click", (e) => {
      e.preventDefault();
      shell.openExternal(device.url);
    });

    const removeBtn = card.querySelector('[data-action="remove"]');
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

    devicesList.appendChild(card);
  });
}

function initDevices() {
  // Initial render when view loaded
  renderDevicesList(currentState.devices || []);
}

module.exports = {
  renderDevicesList,
  initDevices,
};
