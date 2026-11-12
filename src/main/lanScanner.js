/**
 * LAN discovery and bounded HTTP probing for LocalShare mobile servers.
 * Runs exclusively in the Electron main process (or Node CLI tests).
 */
const os = require("os");

const MAX_PROBE_BYTES = 4096;
const DEFAULT_SCAN_PORT = 8000;
const DEFAULT_PROBE_PATH = "/alive";
const DEFAULT_TIMEOUT_MS = 750;
const DEFAULT_CONCURRENCY = 80;
const DEFAULT_MAX_HOSTS = 1024;

const VIRTUAL_OR_VPN_RE =
  /vethernet|hyper-v|\bwsl\b|virtualbox|vbox|vmware|vmnet|docker|podman|\bveth|\bvirbr|tun\d*|tap\d*|\bvpn\b|wireguard|\bwg\d*|tailscale|zerotier|hamachi|nordlynx|proton|loopback|teredo|isatap|bluetooth|pseudo/i;

const PREFERRED_PHYSICAL_RE = /wi-?fi|wlan|wireless|ethernet|eth\d*|en\d+/i;

/**
 * Parse a dotted IPv4 address string into an unsigned 32-bit integer, or null if invalid.
 * @param {string} ip
 * @returns {number|null}
 */
function ipToInt(ip) {
  if (typeof ip !== "string") return null;
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;
  let num = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const octet = Number(part);
    if (octet < 0 || octet > 255) return null;
    num = (num * 256 + octet) >>> 0;
  }
  return num;
}

/**
 * Convert an unsigned 32-bit integer to dotted IPv4 string.
 * @param {number} num
 * @returns {string}
 */
function intToIp(num) {
  return [
    (num >>> 24) & 255,
    (num >>> 16) & 255,
    (num >>> 8) & 255,
    num & 255,
  ].join(".");
}

/**
 * Count leading 1-bits in an IPv4 netmask integer.
 * Returns null if the mask is non-contiguous.
 * @param {number} maskInt
 * @returns {number|null}
 */
function netmaskToPrefix(maskInt) {
  if (maskInt === null) return null;
  let prefix = 0;
  let seenZero = false;
  for (let bit = 31; bit >= 0; bit--) {
    const isOne = ((maskInt >>> bit) & 1) === 1;
    if (isOne) {
      if (seenZero) return null;
      prefix++;
    } else {
      seenZero = true;
    }
  }
  return prefix;
}

/**
 * Check whether an IPv4 address belongs to RFC 1918 private LAN space.
 * @param {string} ip
 * @returns {boolean}
 */
function isPrivateIPv4(ip) {
  const n = ipToInt(ip);
  if (n === null) return false;
  const a = (n >>> 24) & 255;
  const b = (n >>> 16) & 255;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/**
 * Return all eligible non-internal, non-virtual private IPv4 LAN adapters.
 * @param {Record<string, os.NetworkInterfaceInfo[]>} [networkInterfacesMap]
 * @returns {Array<{name: string, address: string, netmask: string, prefixLength: number, networkAddress: string, cidr: string, mac: string}>}
 */
function getLanInterfaces(networkInterfacesMap = null) {
  const nets = networkInterfacesMap || os.networkInterfaces();
  const candidates = [];

  for (const [name, addrs] of Object.entries(nets || {})) {
    if (!Array.isArray(addrs) || VIRTUAL_OR_VPN_RE.test(name)) continue;

    for (const net of addrs) {
      const isIPv4 = net.family === "IPv4" || net.family === 4;
      if (!isIPv4 || net.internal) continue;
      if (!isPrivateIPv4(net.address)) continue;

      const ipInt = ipToInt(net.address);
      const maskInt = ipToInt(net.netmask || "255.255.255.0");
      const prefixLength = netmaskToPrefix(maskInt);
      if (ipInt === null || maskInt === null || prefixLength === null) continue;

      const networkInt = (ipInt & maskInt) >>> 0;
      const networkAddress = intToIp(networkInt);

      candidates.push({
        name,
        address: net.address,
        netmask: net.netmask || "255.255.255.0",
        prefixLength,
        networkAddress,
        cidr: `${networkAddress}/${prefixLength}`,
        mac: net.mac || "",
      });
    }
  }

  candidates.sort((a, b) => {
    const aScore = PREFERRED_PHYSICAL_RE.test(a.name) ? 0 : 1;
    const bScore = PREFERRED_PHYSICAL_RE.test(b.name) ? 0 : 1;
    if (aScore !== bScore) return aScore - bScore;
    return a.name.localeCompare(b.name);
  });

  return candidates;
}

/**
 * Return the primary eligible LAN interface, or null if none found.
 * @param {Record<string, os.NetworkInterfaceInfo[]>} [networkInterfacesMap]
 */
function getLanInterface(networkInterfacesMap = null) {
  const list = getLanInterfaces(networkInterfacesMap);
  return list.length > 0 ? list[0] : null;
}

/**
 * Enumerate scannable host IPv4 addresses for a subnet, bounded by `max`.
 * Prioritizes addresses near `preferNear` (or `address` on large subnets).
 * @param {string} address
 * @param {string} netmask
 * @param {number|{max?: number, includeSelf?: boolean, preferNear?: string|null}} [maxOrOptions]
 * @returns {string[]}
 */
function listHosts(address, netmask, maxOrOptions = DEFAULT_MAX_HOSTS) {
  const opts =
    typeof maxOrOptions === "number"
      ? { max: maxOrOptions }
      : maxOrOptions || {};
  const max = Math.max(0, Math.min(opts.max ?? DEFAULT_MAX_HOSTS, DEFAULT_MAX_HOSTS));
  const includeSelf = opts.includeSelf === true;
  const preferNear = opts.preferNear || null;

  if (max === 0) return [];

  const selfInt = ipToInt(address);
  const maskInt = ipToInt(netmask || "255.255.255.0");
  const prefix = netmaskToPrefix(maskInt);
  if (selfInt === null || maskInt === null || prefix === null) return [];

  if (prefix === 32) {
    return includeSelf ? [intToIp(selfInt)] : [];
  }

  const networkInt = (selfInt & maskInt) >>> 0;
  const broadcastInt = (networkInt | (~maskInt >>> 0)) >>> 0;
  const startInt = prefix === 31 ? networkInt : networkInt + 1;
  const endInt = prefix === 31 ? broadcastInt : broadcastInt - 1;
  if (startInt > endInt) return [];

  const nearIntRaw = ipToInt(preferNear);
  const nearInSubnet =
    nearIntRaw !== null && nearIntRaw >= startInt && nearIntRaw <= endInt;
  const anchorInt = nearInSubnet ? nearIntRaw : selfInt;
  const totalHosts = endInt - startInt + 1;

  const hosts = [];
  if (totalHosts <= max && !nearInSubnet) {
    for (let cur = startInt; cur <= endInt; cur++) {
      if (!includeSelf && cur === selfInt) continue;
      hosts.push(intToIp(cur));
    }
    return hosts;
  }

  // Radiate outward from anchorInt so nearby IPs are probed first and large subnets stay bounded
  const pushIfValid = (candidateInt) => {
    if (candidateInt < startInt || candidateInt > endInt) return;
    if (!includeSelf && candidateInt === selfInt) return;
    hosts.push(intToIp(candidateInt));
  };

  pushIfValid(anchorInt);
  const maxOffset = Math.max(anchorInt - startInt, endInt - anchorInt);
  for (let offset = 1; offset <= maxOffset && hosts.length < max; offset++) {
    if (anchorInt + offset <= endInt) {
      pushIfValid(anchorInt + offset);
      if (hosts.length >= max) break;
    }
    if (anchorInt - offset >= startInt) {
      pushIfValid(anchorInt - offset);
    }
  }

  return hosts;
}

/**
 * Strip ASCII control characters and trim a string.
 * @param {unknown} value
 * @returns {string}
 */
function cleanString(value) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

/**
 * Read at most `maxBytes` from a Web Fetch Response body stream.
 * Returns null if the body exceeds `maxBytes`.
 * @param {Response} res
 * @param {number} maxBytes
 * @param {AbortController} controller
 * @returns {Promise<string|null>}
 */
async function readBoundedText(res, maxBytes, controller) {
  const contentLengthHeader = res.headers?.get("content-length");
  if (contentLengthHeader !== null && contentLengthHeader !== undefined) {
    const declared = Number(contentLengthHeader);
    if (Number.isFinite(declared) && declared > maxBytes) {
      controller.abort();
      return null;
    }
  }

  if (!res.body || typeof res.body.getReader !== "function") {
    const text = await res.text();
    return Buffer.byteLength(text, "utf8") > maxBytes ? null : text;
  }

  const reader = res.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel().catch(() => {});
          controller.abort();
          return null;
        }
        chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
      }
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, totalBytes).toString("utf8");
}

/**
 * Validate and normalize a parsed probe JSON object.
 * Does not require `ok: true` so existing Tasker `/alive` responses work,
 * but rejects explicit `ok: false` or invalid/missing `phoneModel`.
 * @param {unknown} raw
 * @param {string} ip
 * @param {number} port
 * @param {number} latencyMs
 * @returns {{ip: string, port: number, url: string, latencyMs: number, model: string, deviceId: string|null, battery: number|null, mode: string|null}|null}
 */
function normalizeProbePayload(raw, ip, port, latencyMs) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (raw.ok === false) return null;

  const model = cleanString(raw.phoneModel);
  if (model.length < 1 || model.length > 64) return null;

  let deviceId = null;
  if (typeof raw.deviceId === "string") {
    const cleanedId = cleanString(raw.deviceId);
    if (cleanedId.length >= 1 && cleanedId.length <= 64) {
      deviceId = cleanedId;
    }
  }

  let battery = null;
  if (
    typeof raw.batteryLevel === "number" ||
    (typeof raw.batteryLevel === "string" && raw.batteryLevel.trim() !== "")
  ) {
    const parsedBattery = Number(raw.batteryLevel);
    if (Number.isFinite(parsedBattery)) {
      battery = Math.round(Math.min(100, Math.max(0, parsedBattery)));
    }
  }

  let mode = null;
  if (typeof raw.mode === "string") {
    const cleanedMode = cleanString(raw.mode);
    if (cleanedMode.length > 0) {
      mode = cleanedMode.slice(0, 32);
    }
  }

  return {
    ip,
    port,
    url: `http://${ip}:${port}`,
    latencyMs,
    model,
    deviceId,
    battery,
    mode,
  };
}

/**
 * Probe a single host for a LocalShare mobile `/alive` endpoint.
 * Rejects redirects, timeouts, oversized payloads (> 4 KB), and invalid payloads.
 * @param {string} ip
 * @param {number} [port=8000]
 * @param {string} [probePath="/alive"]
 * @param {number} [timeoutMs=750]
 * @param {{headers?: Record<string, string>, signal?: AbortSignal}} [options]
 */
async function probe(
  ip,
  port = DEFAULT_SCAN_PORT,
  probePath = DEFAULT_PROBE_PATH,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  options = {},
) {
  if (ipToInt(ip) === null) return null;
  const numPort = Number(port);
  if (!Number.isInteger(numPort) || numPort < 1 || numPort > 65535) return null;

  const normalizedPath =
    typeof probePath === "string" && probePath.trim()
      ? probePath.trim().startsWith("/")
        ? probePath.trim()
        : `/${probePath.trim()}`
      : DEFAULT_PROBE_PATH;

  const controller = new AbortController();
  const externalSignal = options?.signal;
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) return null;
    externalSignal.addEventListener("abort", onExternalAbort, { once: true });
  }

  const startedAt = Date.now();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`http://${ip}:${numPort}${normalizedPath}`, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        Accept: "application/json, text/plain, */*",
        ...(options?.headers || {}),
      },
    });

    if (res.status < 200 || res.status >= 300) {
      await res.body?.cancel?.().catch(() => {});
      return null;
    }

    const text = await readBoundedText(res, MAX_PROBE_BYTES, controller);
    if (!text) return null;

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return null;
    }

    return normalizeProbePayload(parsed, ip, numPort, Date.now() - startedAt);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener("abort", onExternalAbort);
    }
  }
}

/**
 * Scan all eligible LAN subnets concurrently for Tasker `/alive` responders.
 * @param {Object} [options]
 * @param {number} [options.port=8000]
 * @param {string} [options.path="/alive"]
 * @param {number} [options.timeoutMs=750]
 * @param {number} [options.concurrency=80]
 * @param {string|null} [options.preferNear=null]
 * @param {boolean} [options.includeSelf=false]
 * @param {number} [options.maxHosts=1024]
 * @param {Array} [options.interfaces=null]
 * @param {AbortSignal|null} [options.signal=null]
 */
async function scanSubnets(options = {}) {
  const {
    port = DEFAULT_SCAN_PORT,
    path = DEFAULT_PROBE_PATH,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    concurrency = DEFAULT_CONCURRENCY,
    preferNear = null,
    includeSelf = false,
    maxHosts = DEFAULT_MAX_HOSTS,
    interfaces = null,
    signal = null,
  } = options || {};

  const scanStart = Date.now();
  const lanIfs = Array.isArray(interfaces) ? interfaces : getLanInterfaces();

  const preferInt = ipToInt(preferNear);
  const orderedIfs = [...lanIfs];
  if (preferInt !== null && orderedIfs.length > 1) {
    orderedIfs.sort((a, b) => {
      const aNet = ipToInt(a.networkAddress);
      const aMask = ipToInt(a.netmask);
      const bNet = ipToInt(b.networkAddress);
      const bMask = ipToInt(b.netmask);
      const aMatch = aNet !== null && aMask !== null && ((preferInt & aMask) >>> 0) === aNet ? 0 : 1;
      const bMatch = bNet !== null && bMask !== null && ((preferInt & bMask) >>> 0) === bNet ? 0 : 1;
      return aMatch - bMatch;
    });
  }

  const seen = new Set();
  const targets = [];
  const globalMax = Math.max(0, Math.min(maxHosts, DEFAULT_MAX_HOSTS));

  for (const iface of orderedIfs) {
    const remaining = globalMax - targets.length;
    if (remaining <= 0) break;
    const hosts = listHosts(iface.address, iface.netmask, {
      max: remaining,
      includeSelf,
      preferNear,
    });
    for (const host of hosts) {
      if (targets.length >= globalMax) break;
      if (!seen.has(host)) {
        seen.add(host);
        targets.push(host);
      }
    }
  }

  const candidates = [];
  let cursor = 0;
  let scanned = 0;
  const workerCount = Math.min(Math.max(1, concurrency), targets.length || 1);

  if (targets.length > 0 && !signal?.aborted) {
    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (cursor < targets.length && !signal?.aborted) {
          const ip = targets[cursor++];
          scanned++;
          const hit = await probe(ip, port, path, timeoutMs, { signal });
          if (hit) candidates.push(hit);
        }
      }),
    );
  }

  const primary = orderedIfs[0] || null;
  return {
    lan: primary
      ? {
          name: primary.name,
          ip: primary.address,
          netmask: primary.netmask,
          cidr: primary.cidr,
          network: primary.networkAddress,
          prefixLength: primary.prefixLength,
        }
      : null,
    interfaces: orderedIfs.map((i) => ({
      name: i.name,
      ip: i.address,
      netmask: i.netmask,
      cidr: i.cidr,
      network: i.networkAddress,
      prefixLength: i.prefixLength,
    })),
    scanned,
    tookMs: Date.now() - scanStart,
    candidates,
  };
}

module.exports = {
  MAX_PROBE_BYTES,
  getLanInterfaces,
  getLanInterface,
  listHosts,
  probe,
  scanSubnets,
  ipToInt,
  intToIp,
  netmaskToPrefix,
  isPrivateIPv4,
  normalizeProbePayload,
  readBoundedText,
  cleanString,
};
