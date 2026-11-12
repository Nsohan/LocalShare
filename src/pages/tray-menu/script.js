const { ipcRenderer } = require("electron");

const menuEl = document.getElementById("trayMenu");
let currentDepth = 0;
let activeSubmenuItemId = null;

function createArrowSvg() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "10");
  svg.setAttribute("height", "10");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2.4");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  const poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  poly.setAttribute("points", "9 18 15 12 9 6");
  svg.appendChild(poly);
  return svg;
}

function setActiveParent(itemId) {
  activeSubmenuItemId = itemId;
  const rows = menuEl.querySelectorAll(".menu-item");
  rows.forEach((row) => {
    if (row.dataset.itemId === itemId) {
      row.classList.add("active-parent");
    } else {
      row.classList.remove("active-parent");
    }
  });
}

function renderMenu(items, depth) {
  currentDepth = depth;
  activeSubmenuItemId = null;
  menuEl.innerHTML = "";

  items.forEach((item) => {
    if (item.type === "separator") {
      const sep = document.createElement("div");
      sep.className = "menu-separator";
      menuEl.appendChild(sep);
      return;
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "menu-item";
    btn.dataset.itemId = item.id;
    if (item.enabled === false) {
      btn.classList.add("disabled");
      btn.disabled = true;
    }

    const iconSlot = document.createElement("span");
    iconSlot.className = "menu-icon-slot";
    if (item.type === "checkbox") {
      if (item.checked) {
        const check = document.createElement("span");
        check.className = "menu-check";
        check.textContent = "✓";
        iconSlot.appendChild(check);
      }
    } else if (item.iconUrl) {
      const img = document.createElement("img");
      img.className = "menu-icon";
      img.src = item.iconUrl;
      img.alt = "";
      iconSlot.appendChild(img);
    }
    btn.appendChild(iconSlot);

    const label = document.createElement("span");
    label.className = "menu-label";
    label.textContent = item.label || "";
    btn.appendChild(label);

    if (item.hasSubmenu) {
      const arrow = document.createElement("span");
      arrow.className = "menu-arrow";
      arrow.appendChild(createArrowSvg());
      btn.appendChild(arrow);
    }

    btn.addEventListener("mouseenter", () => {
      if (item.enabled === false) return;
      if (item.hasSubmenu) {
        setActiveParent(item.id);
        const rect = btn.getBoundingClientRect();
        ipcRenderer.send("tray-menu:open-submenu", {
          depth: currentDepth,
          itemId: item.id,
          rect: {
            top: Math.round(rect.top),
            bottom: Math.round(rect.bottom),
            height: Math.round(rect.height),
          },
        });
      } else if (activeSubmenuItemId !== null) {
        setActiveParent(null);
        ipcRenderer.send("tray-menu:close-deeper", { depth: currentDepth });
      }
    });

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (item.enabled === false) return;
      if (item.hasSubmenu) {
        setActiveParent(item.id);
        const rect = btn.getBoundingClientRect();
        ipcRenderer.send("tray-menu:open-submenu", {
          depth: currentDepth,
          itemId: item.id,
          rect: {
            top: Math.round(rect.top),
            bottom: Math.round(rect.bottom),
            height: Math.round(rect.height),
          },
        });
        return;
      }
      ipcRenderer.send("tray-menu:click", {
        itemId: item.id,
        checked: item.type === "checkbox" ? !item.checked : undefined,
      });
    });

    menuEl.appendChild(btn);
  });

  const rect = menuEl.getBoundingClientRect();
  return {
    width: Math.ceil(rect.width),
    height: Math.ceil(rect.height),
  };
}

ipcRenderer.on("tray-menu:render", (_event, payload) => {
  const size = renderMenu(payload.items || [], payload.depth || 0);
  ipcRenderer.send("tray-menu:measured", {
    depth: payload.depth || 0,
    requestId: payload.requestId,
    width: size.width,
    height: size.height,
  });
});

ipcRenderer.on("tray-menu:clear-active", () => {
  setActiveParent(null);
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    ipcRenderer.send("tray-menu:close-all");
  }
});

