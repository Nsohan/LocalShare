/**
 * Background device liveness monitor and IP relocation state machine.
 * Runs exclusively in the main process using a single-flight setTimeout chain
 * and keeps volatile status/battery/mode metrics in memory instead of disk.
 */
const lanScanner = require("./lanScanner");
const { stripRuntimeDeviceFields } = require("./devicePairing");

const DEFAULT_ONLINE_INTERVAL_MS = 10000;
const DEFAULT_RETRY_INTERVAL_MS = 3000;
const DEFAULT_BACKOFF_STEPS_MS = [15000, 30000, 60000];
const DEFAULT_FAST_PATH_TIMEOUT_MS = 1500;
const DEFAULT_SCAN_RATE_LIMIT_MS = 20000;
const DEFAULT_NETWORK_CHECK_INTERVAL_MS = 5000;
const DEFAULT_OFFLINE_NOTIFY_THRESHOLD_MS = 30000;
const DEFAULT_NOTIFY_THROTTLE_MS = 60000;
const MAX_KNOWN_SIGNATURES = 50;

/**
 * Compute a deterministic signature for the active non-virtual private LAN interfaces.
 * Changes whenever adapters connect/disconnect or receive a different IP/subnet.
 * @param {Array<Object>} interfaces
 * @returns {string}
 */
function computeNetworkSignature(interfaces) {
  if (!Array.isArray(interfaces) || interfaces.length === 0) {
    return "none";
  }
  return interfaces
    .map(
      (iface) =>
        `${iface.name || ""}@${iface.address || ""}/${iface.prefixLength ?? ""}`,
    )
    .sort()
    .join("|");
}

/**
 * Extract unique CIDR strings from LAN interface descriptors.
 * @param {Array<Object>} interfaces
 * @returns {string[]}
 */
function getInterfaceCidrs(interfaces) {
  if (!Array.isArray(interfaces)) return [];
  const seen = new Set();
  for (const iface of interfaces) {
    if (iface && typeof iface.cidr === "string" && iface.cidr) {
      seen.add(iface.cidr);
    }
  }
  return [...seen];
}

/**
 * Extract hostname/IP and port cleanly from a saved device record.
 * @param {Object} device
 * @param {number} defaultPort
 * @returns {{ip: string, port: number}|null}
 */
function resolveDeviceEndpoint(device, defaultPort = 8000) {
  if (!device || typeof device !== "object") return null;
  if (device.ip && typeof device.ip === "string") {
    return {
      ip: device.ip.trim(),
      port: Number(device.port) || defaultPort,
    };
  }
  if (device.url && typeof device.url === "string") {
    try {
      const str = /^https?:\/\//i.test(device.url.trim())
        ? device.url.trim()
        : `http://${device.url.trim()}`;
      const parsed = new URL(str);
      return {
        ip: parsed.hostname,
        port: Number(parsed.port) || Number(device.port) || defaultPort,
      };
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Verify whether an `/alive` probe response belongs to `device`.
 * Prevents false positives when DHCP assigns a phone's old IP to another host.
 * @param {Object} device
 * @param {Object} hit
 * @param {{isRelocate?: boolean}} [options]
 * @returns {boolean}
 */
function doesHitMatchDevice(device, hit, { isRelocate = false } = {}) {
  if (!device || !hit) return false;

  const devId =
    typeof device.deviceId === "string" && device.deviceId.trim()
      ? device.deviceId.trim()
      : null;
  const hitId =
    typeof hit.deviceId === "string" && hit.deviceId.trim()
      ? hit.deviceId.trim()
      : null;

  if (devId && hitId) {
    return devId === hitId;
  }

  const devModel =
    typeof device.model === "string" && device.model.trim()
      ? device.model.trim()
      : null;
  const hitModel =
    typeof hit.model === "string" && hit.model.trim()
      ? hit.model.trim()
      : null;

  if (devModel && hitModel) {
    return devModel === hitModel;
  }

  // On subnet relocate we require explicit deviceId or model identity match.
  if (isRelocate) {
    return false;
  }

  // Fast-path fallback only for legacy saved devices with neither deviceId nor model yet.
  return !devId && !devModel;
}

class DeviceWatcher {
  /**
   * @param {Object} deps
   * @param {Function} deps.getDevices - Returns current saved devices array
   * @param {Function} deps.saveDevices - Persists updated saved devices array (only on identity/IP changes)
   * @param {Function} deps.getConfig - Config key reader
   * @param {Function} [deps.saveKnownNetworks] - Persists updated knownNetworkSignatures array when a new CIDR is learned
   * @param {Function} [deps.emitStatus] - Emits lightweight runtime status updates to renderer
   * @param {Function} [deps.emitStateChanged] - Broadcasts full state when persisted devices change
   * @param {Function} [deps.notify] - Displays desktop notification `{ title, body }`
   * @param {Object} [deps.scanner] - LAN scanner implementation (`probe`, `scanSubnets`, `getLanInterfaces`)
   * @param {Map} [deps.runtimeMap] - Shared in-memory runtime map
   * @param {Object} [deps.logger]
   * @param {Object} [deps.options] - Timing/threshold overrides (useful for unit testing)
   */
  constructor({
    getDevices,
    saveDevices,
    getConfig,
    saveKnownNetworks = null,
    emitStatus = null,
    emitStateChanged = null,
    notify = null,
    scanner = lanScanner,
    runtimeMap = new Map(),
    logger = console,
    options = {},
  }) {
    this.getDevices = getDevices;
    this.saveDevices = saveDevices;
    this.getConfig = getConfig;
    this.saveKnownNetworks = saveKnownNetworks;
    this.emitStatus = emitStatus;
    this.emitStateChanged = emitStateChanged;
    this.notify = notify;
    this.scanner = scanner;
    this.runtimeMap = runtimeMap;
    this.logger = logger;

    this.onlineIntervalMs =
      options.onlineIntervalMs ?? DEFAULT_ONLINE_INTERVAL_MS;
    this.retryIntervalMs = options.retryIntervalMs ?? DEFAULT_RETRY_INTERVAL_MS;
    this.backoffStepsMs =
      Array.isArray(options.backoffStepsMs) && options.backoffStepsMs.length > 0
        ? options.backoffStepsMs
        : DEFAULT_BACKOFF_STEPS_MS;
    this.fastPathTimeoutMs =
      options.fastPathTimeoutMs ?? DEFAULT_FAST_PATH_TIMEOUT_MS;
    this.scanRateLimitMs =
      options.scanRateLimitMs ?? DEFAULT_SCAN_RATE_LIMIT_MS;
    this.networkCheckIntervalMs =
      options.networkCheckIntervalMs ?? DEFAULT_NETWORK_CHECK_INTERVAL_MS;
    this.offlineNotifyThresholdMs =
      options.offlineNotifyThresholdMs ?? DEFAULT_OFFLINE_NOTIFY_THRESHOLD_MS;
    this.notifyThrottleMs =
      options.notifyThrottleMs ?? DEFAULT_NOTIFY_THROTTLE_MS;
    this.now = typeof options.now === "function" ? options.now : () => Date.now();

    this.trackerMap = new Map();
    this.stopped = true;
    this.nextCheckTimer = null;
    this.networkPollTimer = null;
    this.activeCyclePromise = null;
    this.cycleAbortController = null;
    this.pendingRunOptions = null;
    this.lastFullScanAt = null;
    this.lastNetworkSignature = "none";
  }

  getRuntime() {
    return this.runtimeMap;
  }

  setDeviceRuntime(deviceId, runtime) {
    if (!deviceId || !runtime) return;
    this.runtimeMap.set(deviceId, {
      status: runtime.status || "online",
      latencyMs: runtime.latencyMs ?? null,
      battery: runtime.battery ?? null,
      mode: runtime.mode ?? null,
      lastSeenAt: runtime.lastSeenAt || null,
      unreachableReason: runtime.unreachableReason ?? null,
    });
    if (runtime.status === "online") {
      const tracker = this._getTracker(deviceId);
      tracker.consecutiveFailures = 0;
      tracker.backoffIndex = -1;
      tracker.offlineSince = null;
      tracker.nextAttemptAt = this.now() + this.onlineIntervalMs;
    }
  }

  removeDeviceRuntime(deviceId) {
    if (!deviceId) return;
    this.runtimeMap.delete(deviceId);
    this.trackerMap.delete(deviceId);
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.lastNetworkSignature = computeNetworkSignature(
      this.scanner.getLanInterfaces(),
    );
    this._startNetworkMonitor();
    this.scheduleNext(0);
  }

  stop() {
    this.stopped = true;
    if (this.nextCheckTimer) {
      clearTimeout(this.nextCheckTimer);
      this.nextCheckTimer = null;
    }
    if (this.networkPollTimer) {
      clearInterval(this.networkPollTimer);
      this.networkPollTimer = null;
    }
    if (this.cycleAbortController) {
      this.cycleAbortController.abort();
      this.cycleAbortController = null;
    }
    this.pendingRunOptions = null;
  }

  scheduleNext(delayMs) {
    if (this.stopped) return;
    if (this.nextCheckTimer) {
      clearTimeout(this.nextCheckTimer);
      this.nextCheckTimer = null;
    }
    const clamped = Math.max(0, Math.round(delayMs));
    this.nextCheckTimer = setTimeout(() => {
      this.nextCheckTimer = null;
      this.runCycle({ manual: false }).catch((err) => {
        this.logger?.error?.("DeviceWatcher scheduled cycle error:", err);
      });
    }, clamped);
    this.nextCheckTimer.unref?.();
  }

  async relocateNow(options = { manual: true }) {
    const manual = options?.manual !== false;
    if (manual) {
      this._resetBackoffForAll();
    }
    return this.runCycle({ manual, resetBackoff: true });
  }

  handleResume() {
    if (this.stopped) return Promise.resolve(null);
    this._resetBackoffForAll();
    return this.runCycle({ manual: false, resetBackoff: true });
  }

  handleDevicesChanged() {
    if (this.stopped) return;
    this.scheduleNext(0);
  }

  handleSettingsChanged() {
    if (this.stopped) return;
    this.scheduleNext(0);
  }

  checkNetworkChange() {
    if (this.stopped) return false;
    const currentSig = computeNetworkSignature(
      this.scanner.getLanInterfaces(),
    );
    if (currentSig === this.lastNetworkSignature) {
      return false;
    }
    this.logger?.info?.(
      `LAN signature changed: ${this.lastNetworkSignature} -> ${currentSig}`,
    );
    this.lastNetworkSignature = currentSig;
    this._resetBackoffForAll();
    this.scheduleNext(0);
    return true;
  }

  recordKnownNetworksFromInterfaces(interfaces) {
    if (typeof this.saveKnownNetworks !== "function") return;
    const cidrs = getInterfaceCidrs(interfaces);
    if (cidrs.length === 0) return;

    const current = Array.isArray(this.getConfig("knownNetworkSignatures"))
      ? this.getConfig("knownNetworkSignatures")
      : [];
    const currentSet = new Set(current);
    const additions = cidrs.filter((c) => !currentSet.has(c));
    if (additions.length === 0) return;

    const updated = [...additions, ...current].slice(0, MAX_KNOWN_SIGNATURES);
    this.saveKnownNetworks(updated);
  }

  _startNetworkMonitor() {
    if (this.networkPollTimer) {
      clearInterval(this.networkPollTimer);
    }
    if (this.networkCheckIntervalMs <= 0) return;
    this.networkPollTimer = setInterval(() => {
      try {
        this.checkNetworkChange();
      } catch (err) {
        this.logger?.error?.("Network monitor error:", err);
      }
    }, this.networkCheckIntervalMs);
    this.networkPollTimer.unref?.();
  }

  _getTracker(deviceId) {
    let tracker = this.trackerMap.get(deviceId);
    if (!tracker) {
      tracker = {
        consecutiveFailures: 0,
        backoffIndex: -1,
        offlineSince: null,
        lastNotifiedAt: 0,
        nextAttemptAt: 0,
      };
      this.trackerMap.set(deviceId, tracker);
    }
    return tracker;
  }

  _resetBackoffForAll() {
    for (const tracker of this.trackerMap.values()) {
      tracker.backoffIndex = -1;
      tracker.nextAttemptAt = 0;
    }
  }

  _notifyIfAllowed(tracker, title, body) {
    if (typeof this.notify !== "function") return;
    const nowTs = this.now();
    if (nowTs - tracker.lastNotifiedAt < this.notifyThrottleMs) {
      return;
    }
    tracker.lastNotifiedAt = nowTs;
    try {
      this.notify({ title, body });
    } catch (err) {
      this.logger?.error?.("DeviceWatcher notify error:", err);
    }
  }

  async runCycle({ manual = false, resetBackoff = false } = {}) {
    if (this.stopped) return null;

    if (resetBackoff) {
      this._resetBackoffForAll();
    }

    if (this.nextCheckTimer) {
      clearTimeout(this.nextCheckTimer);
      this.nextCheckTimer = null;
    }

    if (this.activeCyclePromise) {
      // Queue another pass if an explicit manual rescan or wake trigger arrived mid-cycle
      if (manual || resetBackoff) {
        this.pendingRunOptions = {
          manual: Boolean(this.pendingRunOptions?.manual || manual),
          resetBackoff: Boolean(
            this.pendingRunOptions?.resetBackoff || resetBackoff,
          ),
        };
      }
      return this.activeCyclePromise;
    }

    this.activeCyclePromise = (async () => {
      let nextRun = { manual, resetBackoff };
      let lastResult = null;
      while (nextRun && !this.stopped) {
        lastResult = await this._executeCycle(nextRun);
        nextRun = this.pendingRunOptions;
        this.pendingRunOptions = null;
      }
      return lastResult;
    })().finally(() => {
      this.activeCyclePromise = null;
    });

    return this.activeCyclePromise;
  }

  async _executeCycle({ manual = false } = {}) {
    if (this.stopped) return null;

    const savedDevices = Array.isArray(this.getDevices())
      ? this.getDevices()
      : [];

    const activeIds = new Set(savedDevices.map((d) => d.id));
    let pruned = false;
    for (const key of [...this.runtimeMap.keys()]) {
      if (!activeIds.has(key)) {
        this.runtimeMap.delete(key);
        pruned = true;
      }
    }
    for (const key of [...this.trackerMap.keys()]) {
      if (!activeIds.has(key)) {
        this.trackerMap.delete(key);
      }
    }

    if (savedDevices.length === 0) {
      if (pruned) this.emitStatus?.();
      return { checked: 0, relocated: 0 };
    }

    const globalAutoConnect = this.getConfig("deviceAutoConnect") !== false;
    if (!manual && !globalAutoConnect) {
      if (pruned) this.emitStatus?.();
      return { checked: 0, relocated: 0, paused: true };
    }

    const cycleController = new AbortController();
    this.cycleAbortController = cycleController;

    try {
      const defaultPort = Number(this.getConfig("deviceScanPort")) || 8000;
      const defaultProbePath = this.getConfig("deviceProbePath") || "/alive";
      const nowTs = this.now();

      const dueDevices = savedDevices.filter((device) => {
        if (!device || !device.id) return false;
        if (!manual && device.autoConnect === false) return false;
        if (manual) return true;
        const tracker = this._getTracker(device.id);
        return nowTs >= tracker.nextAttemptAt;
      });

      const devicePatches = new Map();
      const offlineForRelocate = [];
      let anyOnline = false;
      let checkedCount = 0;

      await Promise.all(
        dueDevices.map(async (device) => {
          if (this.stopped || cycleController.signal.aborted) return;

          const tracker = this._getTracker(device.id);
          const endpoint = resolveDeviceEndpoint(device, defaultPort);
          const probePath = device.probePath || defaultProbePath;
          const headers = device.token
            ? { "X-LocalShare-Token": device.token }
            : undefined;

          let hit = null;
          if (endpoint) {
            checkedCount++;
            hit = await this.scanner.probe(
              endpoint.ip,
              endpoint.port,
              probePath,
              this.fastPathTimeoutMs,
              {
                headers,
                signal: cycleController.signal,
              },
            );
          }

          if (this.stopped || cycleController.signal.aborted) return;

          if (hit && doesHitMatchDevice(device, hit, { isRelocate: false })) {
            anyOnline = true;
            const prevRuntime = this.runtimeMap.get(device.id);
            const offlineDuration = tracker.offlineSince
              ? this.now() - tracker.offlineSince
              : 0;
            const wasLongOffline =
              prevRuntime?.status === "offline" &&
              tracker.offlineSince &&
              offlineDuration > this.offlineNotifyThresholdMs;

            tracker.consecutiveFailures = 0;
            tracker.backoffIndex = -1;
            tracker.offlineSince = null;
            tracker.nextAttemptAt = this.now() + this.onlineIntervalMs;

            this.runtimeMap.set(device.id, {
              status: "online",
              latencyMs: hit.latencyMs,
              battery: hit.battery,
              mode: hit.mode,
              lastSeenAt: new Date(this.now()).toISOString(),
              unreachableReason: null,
            });

            if (
              (!device.model && hit.model) ||
              (!device.deviceId && hit.deviceId)
            ) {
              devicePatches.set(device.id, {
                model: device.model || hit.model || null,
                deviceId: device.deviceId || hit.deviceId || null,
              });
            }

            if (wasLongOffline) {
              this._notifyIfAllowed(
                tracker,
                "LocalShare - Device Reconnected",
                `"${device.name}" reconnected at ${hit.ip}`,
              );
            }
            return;
          }

          // Fast-path missed
          tracker.consecutiveFailures += 1;
          const prevRuntime = this.runtimeMap.get(device.id);
          const shouldGoOffline =
            manual || tracker.consecutiveFailures >= 2;

          if (!shouldGoOffline) {
            tracker.nextAttemptAt = this.now() + this.retryIntervalMs;
            this.runtimeMap.set(device.id, {
              status: "checking",
              latencyMs: null,
              battery: prevRuntime?.battery ?? null,
              mode: prevRuntime?.mode ?? null,
              lastSeenAt: prevRuntime?.lastSeenAt ?? null,
              unreachableReason: null,
            });
            return;
          }

          if (!tracker.offlineSince) {
            tracker.offlineSince = this.now();
          }
          this.runtimeMap.set(device.id, {
            status: "offline",
            latencyMs: null,
            battery: prevRuntime?.battery ?? null,
            mode: prevRuntime?.mode ?? null,
            lastSeenAt: prevRuntime?.lastSeenAt ?? null,
            unreachableReason:
              prevRuntime?.unreachableReason ||
              "Phone not reachable on this network",
          });

          if (manual || device.autoConnect !== false) {
            offlineForRelocate.push(device);
          }
        }),
      );

      if (this.stopped || cycleController.signal.aborted) {
        return null;
      }

      if (dueDevices.length > 0 || pruned) {
        this.emitStatus?.();
      }

      const currentInterfaces = this.scanner.getLanInterfaces();
      if (anyOnline && currentInterfaces.length > 0) {
        this.recordKnownNetworksFromInterfaces(currentInterfaces);
      }

      let relocatedCount = 0;

      if (offlineForRelocate.length > 0) {
        relocatedCount = await this._relocateDevices({
          offlineDevices: offlineForRelocate,
          interfaces: currentInterfaces,
          defaultPort,
          defaultProbePath,
          manual,
          devicePatches,
          signal: cycleController.signal,
        });
      }

      if (this.stopped || cycleController.signal.aborted) {
        return null;
      }

      if (devicePatches.size > 0) {
        await this._applyPersistedPatches(devicePatches, defaultProbePath);
      } else if (offlineForRelocate.length > 0) {
        this.emitStatus?.();
      }

      this._scheduleAfterCycle(savedDevices);
      return { checked: checkedCount, relocated: relocatedCount };
    } finally {
      if (this.cycleAbortController === cycleController) {
        this.cycleAbortController = null;
      }
    }
  }

  async _relocateDevices({
    offlineDevices,
    interfaces,
    defaultPort,
    defaultProbePath,
    manual,
    devicePatches,
    signal,
  }) {
    if (!Array.isArray(interfaces) || interfaces.length === 0) {
      for (const device of offlineDevices) {
        const tracker = this._getTracker(device.id);
        this._advanceOfflineBackoff(tracker);
        const rt = this.runtimeMap.get(device.id);
        if (rt) {
          rt.unreachableReason = "No active private Wi-Fi/LAN network";
        }
      }
      return 0;
    }

    const autoScanNew = this.getConfig("deviceAutoScanNewNetworks") !== false;
    const knownSignatures = Array.isArray(
      this.getConfig("knownNetworkSignatures"),
    )
      ? this.getConfig("knownNetworkSignatures")
      : [];
    const knownSet = new Set(knownSignatures);

    const eligibleInterfaces =
      manual || autoScanNew
        ? interfaces
        : interfaces.filter((iface) => knownSet.has(iface.cidr));

    if (eligibleInterfaces.length === 0) {
      for (const device of offlineDevices) {
        const tracker = this._getTracker(device.id);
        this._advanceOfflineBackoff(tracker);
        const rt = this.runtimeMap.get(device.id);
        if (rt) {
          rt.unreachableReason =
            "Auto-scan paused on this network (click Rescan)";
        }
      }
      return 0;
    }

    const elapsedSinceScan =
      this.lastFullScanAt !== null ? this.now() - this.lastFullScanAt : Infinity;
    if (!manual && this.lastFullScanAt !== null && elapsedSinceScan < this.scanRateLimitMs) {
      const waitMs = Math.max(250, this.scanRateLimitMs - elapsedSinceScan);
      for (const device of offlineDevices) {
        const tracker = this._getTracker(device.id);
        tracker.nextAttemptAt = this.now() + waitMs;
      }
      return 0;
    }

    // Group offline devices by port & probePath so common settings scan the subnet only once
    const groups = new Map();
    for (const device of offlineDevices) {
      const port = Number(device.port) || defaultPort;
      const probePath = device.probePath || defaultProbePath;
      const key = `${port}|${probePath}`;
      if (!groups.has(key)) {
        groups.set(key, { port, probePath, devices: [] });
      }
      groups.get(key).devices.push(device);
    }

    let relocatedCount = 0;

    for (const group of groups.values()) {
      if (this.stopped || signal.aborted) break;

      this.lastFullScanAt = this.now();
      const preferNear = group.devices[0]?.ip || null;
      const scanRes = await this.scanner.scanSubnets({
        port: group.port,
        path: group.probePath,
        preferNear,
        interfaces: eligibleInterfaces,
        signal,
      });

      if (this.stopped || signal.aborted) break;

      const candidates = Array.isArray(scanRes?.candidates)
        ? scanRes.candidates
        : [];

      let groupFoundAny = false;

      for (const device of group.devices) {
        const tracker = this._getTracker(device.id);
        const hit = candidates.find((cand) =>
          doesHitMatchDevice(device, cand, { isRelocate: true }),
        );

        if (hit) {
          groupFoundAny = true;
          const prevRuntime = this.runtimeMap.get(device.id);
          const ipChanged = device.ip !== hit.ip || device.port !== hit.port;
          const offlineDuration = tracker.offlineSince
            ? this.now() - tracker.offlineSince
            : 0;
          const shouldNotify =
            ipChanged ||
            (prevRuntime?.status === "offline" &&
              tracker.offlineSince &&
              offlineDuration > this.offlineNotifyThresholdMs);

          tracker.consecutiveFailures = 0;
          tracker.backoffIndex = -1;
          tracker.offlineSince = null;
          tracker.nextAttemptAt = this.now() + this.onlineIntervalMs;

          this.runtimeMap.set(device.id, {
            status: "online",
            latencyMs: hit.latencyMs,
            battery: hit.battery,
            mode: hit.mode,
            lastSeenAt: new Date(this.now()).toISOString(),
            unreachableReason: null,
          });

          const needsIdentityUpdate =
            ipChanged ||
            device.url !== hit.url ||
            (!device.model && hit.model) ||
            (!device.deviceId && hit.deviceId);

          if (needsIdentityUpdate) {
            relocatedCount += 1;
            devicePatches.set(device.id, {
              ip: hit.ip,
              port: hit.port,
              url: hit.url,
              model: device.model || hit.model || null,
              deviceId: device.deviceId || hit.deviceId || null,
            });
          }

          if (shouldNotify) {
            this._notifyIfAllowed(
              tracker,
              "LocalShare - Device Reconnected",
              `"${device.name}" reconnected at ${hit.ip}`,
            );
          }
        } else {
          this._advanceOfflineBackoff(tracker);
          const rt = this.runtimeMap.get(device.id);
          if (rt) {
            rt.unreachableReason = "Phone not reachable on this network";
          }
        }
      }

      if (groupFoundAny) {
        this.recordKnownNetworksFromInterfaces(eligibleInterfaces);
      }
    }

    return relocatedCount;
  }

  _advanceOfflineBackoff(tracker) {
    tracker.backoffIndex = Math.min(
      this.backoffStepsMs.length - 1,
      tracker.backoffIndex + 1,
    );
    const delay = this.backoffStepsMs[tracker.backoffIndex];
    tracker.nextAttemptAt = this.now() + delay;
    return delay;
  }

  async _applyPersistedPatches(devicePatches, defaultProbePath) {
    // Re-read current devices immediately before persisting so concurrent add/remove edits are preserved
    const freshDevices = Array.isArray(this.getDevices())
      ? this.getDevices()
      : [];
    let modified = false;

    const updated = freshDevices.map((device) => {
      const patch = devicePatches.get(device.id);
      if (!patch) return device;
      modified = true;
      return stripRuntimeDeviceFields({ ...device, ...patch }, defaultProbePath);
    });

    if (!modified) {
      this.emitStatus?.();
      return;
    }

    await this.saveDevices(updated);
    this.emitStateChanged?.();
  }

  _scheduleAfterCycle(savedDevices) {
    if (this.stopped) return;

    const globalAutoConnect = this.getConfig("deviceAutoConnect") !== false;
    if (!globalAutoConnect) return;

    const active = savedDevices.filter((d) => d && d.autoConnect !== false);
    if (active.length === 0) return;

    const nowTs = this.now();
    let soonestAt = Infinity;

    for (const device of active) {
      const tracker = this._getTracker(device.id);
      const targetAt =
        tracker.nextAttemptAt > 0
          ? tracker.nextAttemptAt
          : nowTs + this.onlineIntervalMs;
      if (targetAt < soonestAt) {
        soonestAt = targetAt;
      }
    }

    if (Number.isFinite(soonestAt)) {
      this.scheduleNext(Math.max(100, soonestAt - nowTs));
    }
  }
}

module.exports = {
  DeviceWatcher,
  computeNetworkSignature,
  getInterfaceCidrs,
  resolveDeviceEndpoint,
  doesHitMatchDevice,
};
