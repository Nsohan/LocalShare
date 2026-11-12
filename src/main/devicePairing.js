/**
 * Confirm-on-phone pairing session manager and shared device record helpers.
 * All HTTP calls run in the main process with bounded reads and explicit denial/timeout handling.
 */
const os = require("os");
const {
  MAX_PROBE_BYTES,
  ipToInt,
  readBoundedText,
  cleanString,
} = require("./lanScanner");

const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_REQUEST_TIMEOUT_MS = 5000;
const DEFAULT_TOTAL_TIMEOUT_MS = 60000;

/**
 * Generate a stable, human-readable device ID such as `dev_cph2487_k3x9`.
 * @param {string} [label="device"]
 * @returns {string}
 */
function buildDeviceId(label = "device") {
  const slug = cleanString(String(label || "device"))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 16) || "device";
  const rand = Math.random().toString(36).slice(2, 6).padEnd(4, "0");
  return `dev_${slug}_${rand}`;
}

/**
 * Normalize a battery percentage value to integer 0-100, or null.
 * @param {unknown} raw
 * @returns {number|null}
 */
function normalizeBatteryLevel(raw) {
  if (
    typeof raw === "number" ||
    (typeof raw === "string" && raw.trim() !== "")
  ) {
    const n = Number(raw);
    if (Number.isFinite(n)) {
      return Math.round(Math.min(100, Math.max(0, n)));
    }
  }
  return null;
}

/**
 * Normalize a base URL to `http(s)://host[:port]` without trailing slash.
 * @param {string} rawUrl
 * @returns {{url: string, ip: string, port: number}|null}
 */
function normalizeEndpointUrl(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) return null;
  let str = rawUrl.trim();
  if (!/^https?:\/\//i.test(str)) {
    str = `http://${str}`;
  }
  try {
    const parsed = new URL(str);
    const portNum = parsed.port
      ? Number(parsed.port)
      : parsed.protocol === "https:"
        ? 443
        : 80;
    return {
      url: parsed.origin,
      ip: parsed.hostname,
      port: Number.isInteger(portNum) ? portNum : 8000,
    };
  } catch {
    return null;
  }
}

/**
 * Return a persisted device object stripped of runtime-only fields.
 * @param {Object} device
 * @param {string} [defaultProbePath="/alive"]
 * @returns {Object}
 */
function stripRuntimeDeviceFields(device, defaultProbePath = "/alive") {
  const endpoint =
    normalizeEndpointUrl(device.url) ||
    (device.ip
      ? normalizeEndpointUrl(`http://${device.ip}:${device.port || 8000}`)
      : null);

  const model =
    typeof device.model === "string" && cleanString(device.model)
      ? cleanString(device.model).slice(0, 64)
      : null;

  const deviceId =
    typeof device.deviceId === "string" && cleanString(device.deviceId)
      ? cleanString(device.deviceId).slice(0, 64)
      : null;

  const name =
    cleanString(String(device.name || "")) ||
    model ||
    (endpoint ? `Phone (${endpoint.ip})` : "Mobile Device");

  const probePathRaw = cleanString(String(device.probePath || defaultProbePath));
  const probePath = probePathRaw
    ? probePathRaw.startsWith("/")
      ? probePathRaw
      : `/${probePathRaw}`
    : "/alive";

  const record = {
    id:
      typeof device.id === "string" && device.id.trim()
        ? device.id.trim()
        : buildDeviceId(model || name),
    name,
    model,
    deviceId,
    ip: device.ip || (endpoint ? endpoint.ip : ""),
    port: Number(device.port) || (endpoint ? endpoint.port : 8000),
    url: endpoint ? endpoint.url : device.url || "",
    probePath,
    key: device.key ? String(device.key) : "",
    pairedAt: device.pairedAt || new Date().toISOString(),
    autoConnect: device.autoConnect !== false,
  };

  if (typeof device.token === "string" && cleanString(device.token)) {
    record.token = cleanString(device.token).slice(0, 128);
  }

  return record;
}

const RUNTIME_ONLY_KEYS = [
  "status",
  "latencyMs",
  "battery",
  "mode",
  "lastSeenAt",
  "lastSeen",
  "unreachableReason",
];

/**
 * Migrate legacy device entries at startup: ensure `id`, `model`, `deviceId`,
 * and strip any persisted runtime status fields.
 * @param {unknown} devices
 * @param {string} [defaultProbePath="/alive"]
 * @returns {{devices: Object[], changed: boolean}}
 */
function ensureDeviceIdsInList(devices, defaultProbePath = "/alive") {
  if (!Array.isArray(devices)) {
    return { devices: [], changed: true };
  }

  let changed = false;
  const migrated = [];

  for (const raw of devices) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      changed = true;
      continue;
    }

    const hadRuntimeKeys = RUNTIME_ONLY_KEYS.some((k) => k in raw);
    const missingIdentityKeys =
      !raw.id ||
      typeof raw.id !== "string" ||
      raw.model === undefined ||
      raw.deviceId === undefined ||
      raw.probePath === undefined ||
      raw.autoConnect === undefined ||
      !raw.ip ||
      typeof raw.port !== "number";

    if (hadRuntimeKeys || missingIdentityKeys) {
      changed = true;
    }

    migrated.push(stripRuntimeDeviceFields(raw, defaultProbePath));
  }

  return { devices: migrated, changed };
}

/**
 * Find an existing saved device matching `candidate` by `id`, `deviceId`, `model`, or `url`.
 * Never merges two devices that have distinct non-null `deviceId` values.
 * @param {Object[]} devices
 * @param {Object} candidate
 * @returns {Object|null}
 */
function findMatchingDevice(devices, candidate) {
  if (!Array.isArray(devices) || !candidate || typeof candidate !== "object") {
    return null;
  }

  const candId =
    typeof candidate.id === "string" && candidate.id.trim()
      ? candidate.id.trim()
      : null;
  const candDeviceId =
    typeof candidate.deviceId === "string" && cleanString(candidate.deviceId)
      ? cleanString(candidate.deviceId)
      : null;
  const candModel =
    typeof candidate.model === "string" && cleanString(candidate.model)
      ? cleanString(candidate.model)
      : null;
  const candEndpoint = normalizeEndpointUrl(
    candidate.url ||
      (candidate.ip ? `http://${candidate.ip}:${candidate.port || 8000}` : ""),
  );

  for (const existing of devices) {
    if (!existing || typeof existing !== "object") continue;

    if (candId && existing.id && existing.id === candId) {
      return existing;
    }

    const exDeviceId =
      typeof existing.deviceId === "string" && cleanString(existing.deviceId)
        ? cleanString(existing.deviceId)
        : null;

    if (candDeviceId && exDeviceId) {
      if (candDeviceId === exDeviceId) return existing;
      continue; // Different explicit deviceIds represent distinct physical phones
    }

    const exModel =
      typeof existing.model === "string" && cleanString(existing.model)
        ? cleanString(existing.model)
        : null;

    if (candModel && exModel && candModel === exModel) {
      return existing;
    }

    const exEndpoint = normalizeEndpointUrl(
      existing.url ||
        (existing.ip ? `http://${existing.ip}:${existing.port || 8000}` : ""),
    );
    if (candEndpoint && exEndpoint && candEndpoint.url === exEndpoint.url) {
      return existing;
    }
  }

  return null;
}

/**
 * Insert or update a paired device record in the list without duplicating identity.
 * @param {Object[]} devices
 * @param {Object} incoming
 * @param {string} [defaultProbePath="/alive"]
 * @returns {{devices: Object[], savedDevice: Object, isNew: boolean}}
 */
function upsertDeviceInList(devices, incoming, defaultProbePath = "/alive") {
  const list = Array.isArray(devices) ? devices : [];
  const existing = findMatchingDevice(list, incoming);

  const mergedSource = existing
    ? {
        ...existing,
        ...incoming,
        id: existing.id,
        name: incoming.preserveExistingName
          ? existing.name
          : incoming.name || existing.name,
        model: incoming.model ?? existing.model ?? null,
        deviceId: incoming.deviceId ?? existing.deviceId ?? null,
        key: incoming.key || existing.key || "",
        pairedAt: incoming.pairedAt || existing.pairedAt || new Date().toISOString(),
        probePath: incoming.probePath || existing.probePath || defaultProbePath,
        autoConnect: existing.autoConnect !== false,
        token: incoming.token || existing.token,
      }
    : incoming;

  const savedDevice = stripRuntimeDeviceFields(mergedSource, defaultProbePath);
  const filtered = existing
    ? list.filter((d) => d.id !== existing.id)
    : [...list];

  return {
    devices: [savedDevice, ...filtered],
    savedDevice,
    isNew: !existing,
  };
}

/**
 * Perform a single bounded `/pair` HTTP request and classify the response.
 * Used by both `devicePairing` sessions and the legacy `devices:poll-check` handler.
 * @param {Object} params
 * @param {string} params.url
 * @param {string} params.pairingKey
 * @param {string} [params.pcName]
 * @param {number} [params.timeoutMs=5000]
 * @param {AbortSignal} [params.signal]
 * @param {Record<string, string>} [params.headers]
 */
async function fetchPairOnce({
  url,
  pairingKey,
  pcName = os.hostname(),
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  signal = null,
  headers = {},
}) {
  const parsedUrl = new URL(url);
  if (!parsedUrl.searchParams.has("key") && pairingKey) {
    parsedUrl.searchParams.set("key", pairingKey);
  }
  if (!parsedUrl.searchParams.has("pc") && pcName) {
    parsedUrl.searchParams.set("pc", pcName);
  }

  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      const abortErr = new Error("Aborted");
      abortErr.name = "AbortError";
      throw abortErr;
    }
    signal.addEventListener("abort", onExternalAbort, { once: true });
  }

  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const res = await fetch(parsedUrl.toString(), {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        Accept: "application/json, text/plain, */*",
        "X-Pairing-Key": String(pairingKey || ""),
        "X-Device-Type": "desktop",
        ...headers,
      },
    });

    if (
      res.type === "opaqueredirect" ||
      (res.status >= 300 && res.status < 400)
    ) {
      await res.body?.cancel?.().catch(() => {});
      return {
        state: "error",
        final: true,
        status: res.status,
        latencyMs: Date.now() - startedAt,
        message: "Unexpected redirect from device",
      };
    }

    const text = await readBoundedText(res, MAX_PROBE_BYTES, controller);
    if (text === null) {
      return {
        state: "error",
        final: true,
        status: res.status,
        latencyMs: Date.now() - startedAt,
        message: "Response exceeded size limit",
      };
    }

    let json = null;
    if (text.trim()) {
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          json = parsed;
        }
      } catch {
        // Non-JSON payload handled below
      }
    }

    const jsonStatus =
      typeof json?.status === "string" ? json.status.trim().toLowerCase() : "";

    if (
      res.status === 403 ||
      jsonStatus === "denied" ||
      jsonStatus === "rejected" ||
      json?.denied === true
    ) {
      return {
        state: "denied",
        final: true,
        status: res.status,
        latencyMs: Date.now() - startedAt,
        message: cleanString(json?.message) || "Pairing denied on phone",
        json,
      };
    }

    if (res.status >= 200 && res.status < 300) {
      if (json) {
        const isPending =
          json.success === false ||
          jsonStatus === "error" ||
          jsonStatus === "pending" ||
          json.paired === false ||
          json.waiting === true ||
          (res.status === 202 &&
            json.paired !== true &&
            json.success !== true &&
            jsonStatus !== "connected" &&
            jsonStatus !== "accepted");

        if (isPending) {
          return {
            state: "pending",
            final: false,
            status: res.status,
            latencyMs: Date.now() - startedAt,
            message:
              cleanString(json.message) || "Waiting for confirmation on phone",
            json,
          };
        }

        const phoneModel =
          typeof json.phoneModel === "string" && cleanString(json.phoneModel)
            ? cleanString(json.phoneModel).slice(0, 64)
            : null;
        const rawDeviceName =
          phoneModel ||
          json.name ||
          json.deviceName ||
          json.hostname ||
          json.model ||
          json.device ||
          null;
        const deviceName =
          typeof rawDeviceName === "string" && cleanString(rawDeviceName)
            ? cleanString(rawDeviceName).slice(0, 64)
            : null;
        const deviceId =
          typeof json.deviceId === "string" && cleanString(json.deviceId)
            ? cleanString(json.deviceId).slice(0, 64)
            : null;
        const battery = normalizeBatteryLevel(json.batteryLevel);
        const mode =
          typeof json.mode === "string" && cleanString(json.mode)
            ? cleanString(json.mode).slice(0, 32)
            : null;
        const token =
          typeof json.token === "string" && cleanString(json.token)
            ? cleanString(json.token).slice(0, 128)
            : null;

        return {
          state: "accepted",
          final: true,
          status: res.status,
          latencyMs: Date.now() - startedAt,
          message: cleanString(json.message) || "Paired",
          deviceName,
          phoneModel,
          deviceId,
          battery,
          mode,
          token,
          json,
        };
      }

      return {
        state: "plain_2xx",
        final: false,
        status: res.status,
        latencyMs: Date.now() - startedAt,
        text,
      };
    }

    return {
      state: "http_other",
      final: false,
      status: res.status,
      latencyMs: Date.now() - startedAt,
      message:
        cleanString(json?.message) ||
        `HTTP ${res.status}: Waiting for authorization...`,
      json,
    };
  } finally {
    clearTimeout(timer);
    if (signal) {
      signal.removeEventListener("abort", onExternalAbort);
    }
  }
}

/**
 * Create a main-process pairing manager for `/pair` confirm-on-phone sessions.
 * @param {Object} deps
 * @param {Function} deps.saveDevice - async/sync callback receiving normalized paired device + runtime info
 * @param {Function} deps.emitProgress - callback receiving `{ attemptId, status, message, device?, code? }`
 * @param {Function} [deps.getHostname]
 * @param {number} [deps.pollIntervalMs=1000]
 * @param {number} [deps.requestTimeoutMs=5000]
 * @param {number} [deps.totalTimeoutMs=60000]
 */
function createPairingManager({
  saveDevice,
  emitProgress,
  getHostname = () => os.hostname(),
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  totalTimeoutMs = DEFAULT_TOTAL_TIMEOUT_MS,
}) {
  const activeSessions = new Map();

  function cancelSession(attemptId) {
    const session = activeSessions.get(attemptId);
    if (!session) return false;
    session.cancelled = true;
    if (session.timer) {
      clearTimeout(session.timer);
      session.timer = null;
    }
    session.abortController.abort();
    activeSessions.delete(attemptId);
    return true;
  }

  function stopAll() {
    for (const id of [...activeSessions.keys()]) {
      cancelSession(id);
    }
  }

  function startPairing({
    ip,
    port = 8000,
    model = null,
    customName = "",
    probePath = "/alive",
  }) {
    // Cancel any previous open pairing session so stale attempts do not linger
    stopAll();

    const numPort = Number(port) || 8000;
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const attemptId = `pair_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    if (
      ipToInt(ip) === null ||
      !Number.isInteger(numPort) ||
      numPort < 1 ||
      numPort > 65535
    ) {
      setImmediate(() => {
        emitProgress?.({
          attemptId,
          status: "error",
          message: "Invalid device IP or port",
        });
      });
      return { attemptId, code };
    }

    const session = {
      attemptId,
      code,
      cancelled: false,
      abortController: new AbortController(),
      timer: null,
      deadline: Date.now() + totalTimeoutMs,
    };
    activeSessions.set(attemptId, session);

    const runLoop = async () => {
      const targetUrl = `http://${ip}:${numPort}/pair`;

      while (!session.cancelled && activeSessions.has(attemptId)) {
        const remainingMs = session.deadline - Date.now();
        if (remainingMs <= 0) {
          activeSessions.delete(attemptId);
          emitProgress?.({
            attemptId,
            status: "timeout",
            message: "No response from phone",
          });
          return;
        }

        const stepTimeoutMs = Math.min(requestTimeoutMs, remainingMs);

        try {
          const result = await fetchPairOnce({
            url: targetUrl,
            pairingKey: code,
            pcName: getHostname(),
            timeoutMs: stepTimeoutMs,
            signal: session.abortController.signal,
          });

          if (session.cancelled || !activeSessions.has(attemptId)) return;

          if (result.state === "denied") {
            activeSessions.delete(attemptId);
            emitProgress?.({
              attemptId,
              status: "denied",
              message: result.message || "Pairing denied on phone",
            });
            return;
          }

          if (result.state === "error") {
            activeSessions.delete(attemptId);
            emitProgress?.({
              attemptId,
              status: "error",
              message: result.message || "Pairing failed",
            });
            return;
          }

          if (result.state === "accepted") {
            activeSessions.delete(attemptId);
            const resolvedModel =
              result.phoneModel ||
              (typeof model === "string" && cleanString(model)
                ? cleanString(model).slice(0, 64)
                : null);
            const resolvedName =
              cleanString(customName) ||
              resolvedModel ||
              result.deviceName ||
              `Phone (${ip})`;

            const saved = await saveDevice({
              name: resolvedName,
              model: resolvedModel,
              deviceId: result.deviceId || null,
              ip,
              port: numPort,
              url: `http://${ip}:${numPort}`,
              probePath,
              key: code,
              pairedAt: new Date().toISOString(),
              autoConnect: true,
              token: result.token || undefined,
              runtime: {
                status: "online",
                latencyMs: result.latencyMs,
                battery: result.battery,
                mode: result.mode,
                lastSeenAt: new Date().toISOString(),
              },
            });

            emitProgress?.({
              attemptId,
              status: "accepted",
              message: result.message || "Paired",
              device: saved,
            });
            return;
          }

          emitProgress?.({
            attemptId,
            status: "pending",
            message: result.message || "Waiting for confirmation on phone",
          });
        } catch (err) {
          if (session.cancelled || !activeSessions.has(attemptId)) return;
          emitProgress?.({
            attemptId,
            status: "pending",
            message: "Waiting for confirmation on phone...",
          });
        }

        if (session.cancelled || !activeSessions.has(attemptId)) return;

        const timeLeft = session.deadline - Date.now();
        if (timeLeft <= 0) {
          activeSessions.delete(attemptId);
          emitProgress?.({
            attemptId,
            status: "timeout",
            message: "No response from phone",
          });
          return;
        }

        await new Promise((resolve) => {
          session.timer = setTimeout(() => {
            session.timer = null;
            resolve();
          }, Math.min(pollIntervalMs, timeLeft));
        });
      }
    };

    // Defer execution until after startPairing returns { attemptId, code }
    setImmediate(() => {
      runLoop().catch((err) => {
        if (!session.cancelled && activeSessions.has(attemptId)) {
          activeSessions.delete(attemptId);
          emitProgress?.({
            attemptId,
            status: "error",
            message: err?.message || "Pairing error",
          });
        }
      });
    });

    return { attemptId, code };
  }

  return {
    startPairing,
    cancelPairing: cancelSession,
    stopAll,
    getActiveCount: () => activeSessions.size,
  };
}

module.exports = {
  buildDeviceId,
  normalizeBatteryLevel,
  normalizeEndpointUrl,
  stripRuntimeDeviceFields,
  ensureDeviceIdsInList,
  findMatchingDevice,
  upsertDeviceInList,
  fetchPairOnce,
  createPairingManager,
};

