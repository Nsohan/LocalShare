/**
 * Custom multi-level frameless tray menu controller.
 * Keeps nested submenus cascading consistently in one direction (never overlapping parent levels).
 */
const { BrowserWindow, ipcMain, screen } = require("electron");
const path = require("path");
const logger = require("../config/logger");

const TRAY_MENU_HTML = path.join(__dirname, "../pages/tray-menu/index.html");
const OVERLAP_NUDGE_PX = 2;
const SUBMENU_MIN_FIT_PX = 230;

const windowSlots = new Map();
let activeItemMap = new Map();
const activeParentByDepth = new Map();
let activeSessionId = 0;
let requestCounter = 0;
let pendingRequests = new Map();
let blurCloseTimer = null;
let ipcRegistered = false;

function ensureIpcHandlers() {
  if (ipcRegistered) return;
  ipcRegistered = true;

  ipcMain.on("tray-menu:measured", (_event, payload) => {
    const { depth, requestId, width, height } = payload || {};
    const pending = pendingRequests.get(requestId);
    if (!pending) return;
    pendingRequests.delete(requestId);
    if (pending.sessionId !== activeSessionId) return;

    placeAndShowWindow(
      depth,
      Math.max(180, Number(width) || 220),
      Math.max(36, Number(height) || 120),
      pending,
    );
  });

  ipcMain.on("tray-menu:open-submenu", (_event, payload) => {
    const { depth, itemId, rect } = payload || {};
    const parentDepth = depth || 0;
    const nextDepth = parentDepth + 1;
    const entry = activeItemMap.get(itemId);
    if (!entry || !Array.isArray(entry.children) || entry.children.length === 0) {
      activeParentByDepth.delete(parentDepth);
      closeDeeperThan(parentDepth);
      return;
    }
    if (
      activeParentByDepth.get(parentDepth) === itemId &&
      windowSlots.get(nextDepth)?.visible
    ) {
      return;
    }
    activeParentByDepth.set(parentDepth, itemId);
    closeDeeperThan(nextDepth);
    requestMenuRender(nextDepth, entry.children, { parentRect: rect });
  });

  ipcMain.on("tray-menu:close-deeper", (_event, payload) => {
    const depth = payload?.depth ?? 0;
    activeParentByDepth.delete(depth);
    closeDeeperThan(depth);
  });

  ipcMain.on("tray-menu:click", (_event, payload) => {
    const { itemId, checked } = payload || {};
    const entry = activeItemMap.get(itemId);
    const rawItem = entry?.rawItem;
    closeAllTrayMenus();
    if (rawItem && typeof rawItem.click === "function") {
      try {
        const menuItemArg =
          rawItem.type === "checkbox"
            ? { ...rawItem, checked: Boolean(checked) }
            : rawItem;
        rawItem.click(menuItemArg);
      } catch (err) {
        logger.error("Error executing tray menu action:", err);
      }
    }
  });

  ipcMain.on("tray-menu:close-all", () => {
    closeAllTrayMenus();
  });
}

function createSlotWindow(depth) {
  const existing = windowSlots.get(depth);
  if (existing && existing.win && !existing.win.isDestroyed()) {
    return existing;
  }

  const win = new BrowserWindow({
    width: 230,
    height: 120,
    show: false,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: "#24262b",
    hasShadow: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  win.setAlwaysOnTop(true, "pop-up-menu");
  win.setMenuBarVisibility(false);

  const readyPromise = new Promise((resolve) => {
    win.webContents.once("did-finish-load", () => resolve());
  });

  win.on("blur", () => {
    scheduleBlurClose();
  });

  win.on("closed", () => {
    windowSlots.delete(depth);
  });

  win.loadFile(TRAY_MENU_HTML);

  const slot = {
    depth,
    win,
    readyPromise,
    visible: false,
    bounds: null,
    cascadeDir: "left",
  };
  windowSlots.set(depth, slot);
  return slot;
}

function scheduleBlurClose() {
  if (blurCloseTimer) {
    clearTimeout(blurCloseTimer);
  }
  blurCloseTimer = setTimeout(() => {
    blurCloseTimer = null;
    const focused = BrowserWindow.getFocusedWindow();
    const isMenuFocused = Array.from(windowSlots.values()).some(
      (slot) =>
        slot.visible &&
        slot.win &&
        !slot.win.isDestroyed() &&
        slot.win === focused,
    );
    if (!isMenuFocused) {
      closeAllTrayMenus();
    }
  }, 90);
}

function serializeTemplate(template = []) {
  const itemMap = new Map();

  function walk(items, prefix) {
    return items.map((rawItem, idx) => {
      const id = prefix ? `${prefix}.${idx}` : `${idx}`;
      const hasSubmenu =
        Array.isArray(rawItem.submenu) && rawItem.submenu.length > 0;
      const children = hasSubmenu ? walk(rawItem.submenu, id) : [];
      itemMap.set(id, { rawItem, children });

      return {
        id,
        type: rawItem.type || "normal",
        label: rawItem.label || "",
        iconUrl: rawItem.iconUrl || null,
        checked: Boolean(rawItem.checked),
        enabled: rawItem.enabled !== false,
        hasSubmenu,
      };
    });
  }

  return {
    rootItems: walk(template, ""),
    itemMap,
  };
}

async function requestMenuRender(depth, items, meta = {}) {
  const sessionId = activeSessionId;
  const slot = createSlotWindow(depth);
  await slot.readyPromise;
  if (sessionId !== activeSessionId || slot.win.isDestroyed()) return;

  const requestId = ++requestCounter;
  pendingRequests.set(requestId, {
    sessionId,
    anchor: meta.anchor || null,
    parentRect: meta.parentRect || null,
  });

  slot.win.webContents.send("tray-menu:render", {
    depth,
    requestId,
    items,
  });
}

function placeAndShowWindow(depth, width, height, meta) {
  const slot = windowSlots.get(depth);
  if (!slot || !slot.win || slot.win.isDestroyed()) return;

  let x = 0;
  let y = 0;
  let cascadeDir = "left";

  if (depth === 0) {
    const anchor = meta.anchor || screen.getCursorScreenPoint();
    const workArea = screen.getDisplayNearestPoint(anchor).workArea;

    x = Math.max(
      workArea.x + 4,
      Math.min(anchor.x, workArea.x + workArea.width - width - 4),
    );
    if (anchor.y > workArea.y + workArea.height / 2) {
      y = Math.max(workArea.y + 4, anchor.y - height);
    } else {
      y = Math.min(workArea.y + workArea.height - height - 4, anchor.y);
    }

    const rightSpace = workArea.x + workArea.width - (x + width);
    const leftSpace = x - workArea.x;
    if (rightSpace >= SUBMENU_MIN_FIT_PX) {
      cascadeDir = "right";
    } else if (leftSpace >= SUBMENU_MIN_FIT_PX || leftSpace >= rightSpace) {
      cascadeDir = "left";
    } else {
      cascadeDir = "right";
    }
  } else {
    const parentSlot = windowSlots.get(depth - 1);
    const parentBounds = parentSlot?.bounds;
    if (!parentBounds) return;

    const workArea = screen.getDisplayNearestPoint({
      x: parentBounds.x,
      y: parentBounds.y,
    }).workArea;

    const inheritedDir = parentSlot.cascadeDir || "left";
    const leftX = parentBounds.x - width + OVERLAP_NUDGE_PX;
    const rightX = parentBounds.x + parentBounds.width - OVERLAP_NUDGE_PX;

    if (inheritedDir === "left") {
      if (
        leftX < workArea.x + 4 &&
        rightX + width <= workArea.x + workArea.width - 4
      ) {
        cascadeDir = "right";
        x = rightX;
      } else {
        cascadeDir = "left";
        x = Math.max(workArea.x + 4, leftX);
      }
    } else {
      if (
        rightX + width > workArea.x + workArea.width - 4 &&
        leftX >= workArea.x + 4
      ) {
        cascadeDir = "left";
        x = leftX;
      } else {
        cascadeDir = "right";
        x = Math.min(workArea.x + workArea.width - width - 4, rightX);
      }
    }

    const itemTop = meta.parentRect?.top ?? 0;
    y = Math.max(
      workArea.y + 4,
      Math.min(
        parentBounds.y + itemTop - 5,
        workArea.y + workArea.height - height - 4,
      ),
    );
  }

  x = Math.round(x);
  y = Math.round(y);
  const w = Math.round(width);
  const h = Math.round(height);

  slot.cascadeDir = cascadeDir;
  slot.bounds = { x, y, width: w, height: h };
  slot.visible = true;

  slot.win.setResizable(true);
  slot.win.setContentSize(w, h);
  slot.win.setPosition(x, y);
  slot.win.setResizable(false);
  slot.win.setAlwaysOnTop(true, "pop-up-menu");

  if (depth === 0) {
    slot.win.show();
    slot.win.focus();
  } else {
    slot.win.showInactive();
  }
}

function closeDeeperThan(maxKeepDepth) {
  for (const d of Array.from(activeParentByDepth.keys())) {
    if (d > maxKeepDepth) {
      activeParentByDepth.delete(d);
    }
  }
  for (const [depth, slot] of windowSlots.entries()) {
    if (depth > maxKeepDepth && slot.visible) {
      slot.visible = false;
      slot.bounds = null;
      if (slot.win && !slot.win.isDestroyed()) {
        slot.win.hide();
      }
    }
  }
}

function closeAllTrayMenus() {
  if (blurCloseTimer) {
    clearTimeout(blurCloseTimer);
    blurCloseTimer = null;
  }
  activeSessionId++;
  pendingRequests.clear();
  activeParentByDepth.clear();
  for (const slot of windowSlots.values()) {
    slot.visible = false;
    slot.bounds = null;
    if (slot.win && !slot.win.isDestroyed()) {
      slot.win.hide();
    }
  }
}

function showTrayMenu(template = [], bounds = null) {
  ensureIpcHandlers();
  if (blurCloseTimer) {
    clearTimeout(blurCloseTimer);
    blurCloseTimer = null;
  }

  closeDeeperThan(0);
  activeSessionId++;
  pendingRequests.clear();

  const { rootItems, itemMap } = serializeTemplate(template);
  activeItemMap = itemMap;

  const cursor = screen.getCursorScreenPoint();
  const anchor =
    cursor ||
    (bounds
      ? { x: bounds.x + Math.round(bounds.width / 2), y: bounds.y }
      : { x: 0, y: 0 });

  requestMenuRender(0, rootItems, { anchor });
}

function prewarmTrayMenu() {
  ensureIpcHandlers();
  createSlotWindow(0);
}

function destroyTrayMenuWindows() {
  closeAllTrayMenus();
  for (const slot of windowSlots.values()) {
    if (slot.win && !slot.win.isDestroyed()) {
      slot.win.destroy();
    }
  }
  windowSlots.clear();
}

module.exports = {
  showTrayMenu,
  closeAllTrayMenus,
  prewarmTrayMenu,
  destroyTrayMenuWindows,
};
