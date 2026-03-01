(function () {
  "use strict";

  // ── Cross-browser compat (Firefox=browser, Chrome=chrome) ────────
  if (typeof browser === "undefined" && typeof chrome !== "undefined") {
    window.browser = chrome;
  }

  // ── Status definitions ────────────────────────────────────────────

  const STATUSES = {
    unseen: { label: "Unseen", color: null, svgFill: null, svgStroke: null },
    unsuitable: { label: "Unsuitable", color: "#6b7280", svgFill: "#f3f4f6", svgStroke: "#6b7280" },
    interesting: { label: "Interesting", color: "#f59e0b", svgFill: "#fef3c7", svgStroke: "#f59e0b" },
    messaged: { label: "Messaged", color: "#3b82f6", svgFill: "#dbeafe", svgStroke: "#3b82f6" },
    tumbleweed: { label: "Tumbleweed", color: "#a8a29e", svgFill: "#f5f5f4", svgStroke: "#a8a29e" },
    rejected: { label: "Rejected", color: "#374151", svgFill: "#f3f4f6", svgStroke: "#374151" },
  };

  const STATUS_ORDER = ["unseen", "unsuitable", "interesting", "messaged", "tumbleweed", "rejected"];

  // In-memory cache: { [propertyId]: { status, lat, lng, notes? } }
  let statusCache = {};

  // ── Storage helpers ─────────────────────────────────────────────

  async function loadStatuses() {
    const result = await browser.storage.local.get("propertyStatuses");
    statusCache = result.propertyStatuses || {};
  }

  async function saveStatus(propertyId, statusKey, lat, lng) {
    const existing = statusCache[propertyId] || {};
    if (statusKey === "unseen" && !existing.notes) {
      delete statusCache[propertyId];
    } else {
      statusCache[propertyId] = { ...existing, status: statusKey, lat, lng };
    }
    await browser.storage.local.set({ propertyStatuses: statusCache });
  }

  async function saveNotes(propertyId, notes) {
    const existing = statusCache[propertyId] || {};
    if (!notes && (!existing.status || existing.status === "unseen")) {
      delete statusCache[propertyId];
    } else {
      statusCache[propertyId] = {
        ...existing,
        status: existing.status || "unseen",
        notes: notes || undefined,
      };
    }
    await browser.storage.local.set({ propertyStatuses: statusCache });
  }

  // ── Property ID extraction ──────────────────────────────────────

  function extractPropertyId(href) {
    const match = href.match(/(P\d+)/);
    return match ? match[1] : null;
  }

  // ── Map state (Google Maps internals) ───────────────────────────

  function getMapState() {
    // Extract center lat/lng + zoom from the Google Maps link
    const link = document.querySelector('a[href*="maps.google.com"]');
    if (!link) return null;

    const href = link.getAttribute("href");
    const llMatch = href.match(/ll=([-\d.]+),([-\d.]+)/);
    const zMatch = href.match(/[?&]z=(\d+)/);
    if (!llMatch || !zMatch) return null;

    const centerLat = parseFloat(llMatch[1]);
    const centerLng = parseFloat(llMatch[2]);
    const zoom = parseInt(zMatch[1], 10);

    // Find the marker layer's transform offset
    // The z-103 and z-106 layers share a parent with a CSS transform
    const markerParent = findMarkerLayerParent();
    let tx = 0, ty = 0;
    if (markerParent) {
      const transform = markerParent.style.transform;
      const tMatch = transform && transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
      if (tMatch) {
        tx = parseFloat(tMatch[1]);
        ty = parseFloat(tMatch[2]);
      }
    }

    return { centerLat, centerLng, zoom, tx, ty };
  }

  function findMarkerLayerParent() {
    // The visual pin layer is at z-index 103. Its parent div has the transform.
    const allDivs = document.querySelectorAll('.gm-style div');
    for (const div of allDivs) {
      if (div.style.zIndex === "103") {
        return div.parentElement;
      }
    }
    return null;
  }

  function findVisualLayer() {
    const allDivs = document.querySelectorAll('.gm-style div');
    for (const div of allDivs) {
      if (div.style.zIndex === "103") return div;
    }
    return null;
  }

  // ── Mercator projection ─────────────────────────────────────────

  function latLngToWorld(lat, lng, zoom) {
    const worldSize = 256 * Math.pow(2, zoom);
    const worldX = ((lng + 180) / 360) * worldSize;
    const latRad = (lat * Math.PI) / 180;
    const worldY = worldSize * (0.5 - Math.log((1 + Math.sin(latRad)) / (1 - Math.sin(latRad))) / (4 * Math.PI));
    return { worldX, worldY };
  }

  function pixelToLatLng(left, top, mapState) {
    const { centerLat, centerLng, zoom, tx, ty } = mapState;
    const worldSize = 256 * Math.pow(2, zoom);
    const center = latLngToWorld(centerLat, centerLng, zoom);

    const worldX = left + center.worldX + tx;
    const worldY = top + center.worldY + ty;

    const lng = (worldX / worldSize) * 360 - 180;
    const n = Math.PI - (2 * Math.PI * worldY) / worldSize;
    const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return { lat, lng };
  }

  function latLngToPixel(lat, lng, mapState) {
    const { centerLat, centerLng, zoom, tx, ty } = mapState;
    const center = latLngToWorld(centerLat, centerLng, zoom);
    const point = latLngToWorld(lat, lng, zoom);

    const left = point.worldX - center.worldX - tx;
    const top = point.worldY - center.worldY - ty;
    return { left, top };
  }

  // ── Visual pin finding + recoloring ─────────────────────────────

  function findVisualPinByCoords(left, top, tolerance) {
    tolerance = tolerance || 5;
    const layer = findVisualLayer();
    if (!layer) return null;

    for (const div of layer.children) {
      const divLeft = parseFloat(div.style.left);
      const divTop = parseFloat(div.style.top);
      if (Math.abs(divLeft - left) <= tolerance && Math.abs(divTop - top) <= tolerance) {
        const img = div.querySelector("img");
        if (img && img.src && img.src.startsWith("data:image/svg")) {
          return img;
        }
      }
    }
    return null;
  }

  function findVisualPinByRect(screenX, screenY, tolerance) {
    tolerance = tolerance || 10;
    const layer = findVisualLayer();
    if (!layer) return null;

    let bestImg = null;
    let bestDist = Infinity;
    for (const div of layer.children) {
      const img = div.querySelector("img");
      if (!img || !img.src || !img.src.startsWith("data:image/svg")) continue;
      const rect = div.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dist = Math.sqrt((cx - screenX) ** 2 + (cy - screenY) ** 2);
      if (dist < bestDist) {
        bestDist = dist;
        bestImg = img;
      }
    }
    return bestDist <= tolerance ? bestImg : null;
  }

  function findActiveVisualPin() {
    // The clicked marker button gets tabindex="0"
    const active = document.querySelector('.gm-style div[role="button"][tabindex="0"]');
    if (!active) return null;

    // Match by bounding rect — both layers render at the same screen position
    const rect = active.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return findVisualPinByRect(cx, cy, rect.width);
  }

  function getActiveMarkerPixelCoords() {
    // Read left/top from the button element itself (not its parent)
    const active = document.querySelector('.gm-style div[role="button"][tabindex="0"]');
    if (!active) return null;

    const left = parseFloat(active.style.left);
    const top = parseFloat(active.style.top);
    if (isNaN(left) || isNaN(top)) return null;
    return { left, top };
  }

  function recolorPin(imgEl, statusKey) {
    if (!imgEl || !imgEl.src || !imgEl.src.startsWith("data:image/svg")) return;

    const status = STATUSES[statusKey];
    if (!status) return;

    // Decode the SVG data URI
    let svg;
    try {
      const encoded = imgEl.src.split(",")[1];
      svg = decodeURIComponent(encoded);
    } catch {
      // Try base64
      try {
        svg = atob(imgEl.src.split(",")[1]);
      } catch {
        return;
      }
    }

    if (statusKey === "unseen") {
      // Reset: replace any status fill/stroke back to defaults
      for (const s of Object.values(STATUSES)) {
        if (s.svgFill) {
          svg = svg.replace(new RegExp(`fill="${escapeRegex(s.svgFill)}"`, "gi"), 'fill="white"');
        }
        if (s.svgStroke) {
          svg = svg.replace(new RegExp(`stroke="${escapeRegex(s.svgStroke)}"`, "gi"), 'stroke="#ABB0B6"');
        }
      }
    } else {
      // Replace white fill → status fill, grey stroke → status stroke
      svg = svg.replace(/fill="white"/gi, `fill="${status.svgFill}"`);
      svg = svg.replace(/fill="#fff(?:fff)?"/gi, `fill="${status.svgFill}"`);
      svg = svg.replace(/stroke="#ABB0B6"/gi, `stroke="${status.svgStroke}"`);
      // Also handle if already recolored to a different status
      for (const s of Object.values(STATUSES)) {
        if (s.svgFill && s.svgFill !== status.svgFill) {
          svg = svg.replace(new RegExp(`fill="${escapeRegex(s.svgFill)}"`, "gi"), `fill="${status.svgFill}"`);
        }
        if (s.svgStroke && s.svgStroke !== status.svgStroke) {
          svg = svg.replace(new RegExp(`stroke="${escapeRegex(s.svgStroke)}"`, "gi"), `stroke="${status.svgStroke}"`);
        }
      }
    }

    imgEl.src = "data:image/svg+xml," + encodeURIComponent(svg);
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // ── Recolor active pin (after dialog opens) ─────────────────────

  function recolorActivePin(statusKey) {
    const img = findActiveVisualPin();
    if (img) recolorPin(img, statusKey);
  }

  // ── Pre-color all stored markers ────────────────────────────────

  function applyAllStoredColors() {
    const mapState = getMapState();
    if (!mapState) return;

    for (const [propertyId, data] of Object.entries(statusCache)) {
      if (!data.lat || !data.lng) continue;
      const pixel = latLngToPixel(data.lat, data.lng, mapState);
      const img = findVisualPinByCoords(pixel.left, pixel.top);
      if (img) recolorPin(img, data.status);
    }

    renderStatusCircles(mapState);
  }

  // ── Status circles overlay ──────────────────────────────────────
  // Circles live inside the marker layer parent (same coordinate space as pins)
  // so they pan naturally with the map. A periodic refresh handles zoom changes
  // and Google Maps rebuilding the layer.

  let circleLayer = null;

  function ensureCircleLayer() {
    if (circleLayer && document.contains(circleLayer)) return circleLayer;

    const visualLayer = findVisualLayer();
    if (!visualLayer) return null;

    // Place circles directly inside z-103 layer — exact same coordinate space as pins
    circleLayer = document.createElement("div");
    circleLayer.className = "fm-circle-layer";
    circleLayer.style.cssText = "position:absolute;left:0;top:0;pointer-events:none;";
    visualLayer.prepend(circleLayer);
    return circleLayer;
  }

  function renderStatusCircles(mapState) {
    const layer = ensureCircleLayer();
    if (!layer) return;

    layer.innerHTML = "";

    const CIRCLE_SIZE = 36;
    const HALF = CIRCLE_SIZE / 2;

    for (const [propertyId, data] of Object.entries(statusCache)) {
      if (!data.lat || !data.lng) continue;
      const status = STATUSES[data.status];
      if (!status || !status.color) continue;

      const pixel = latLngToPixel(data.lat, data.lng, mapState);
      const circle = document.createElement("div");
      circle.style.cssText = `position:absolute;left:${pixel.left - HALF}px;top:${pixel.top - HALF}px;width:${CIRCLE_SIZE}px;height:${CIRCLE_SIZE}px;border-radius:50%;background:${status.color};opacity:0.35;pointer-events:none;`;
      circle.dataset.propertyId = propertyId;
      layer.appendChild(circle);
    }
  }

  // ── Periodic circle refresh (handles zoom, layer rebuilds) ──────

  function observeMapState() {
    setInterval(() => {
      if (updating) return;
      updating = true;
      const mapState = getMapState();
      if (mapState) renderStatusCircles(mapState);
      updating = false;
    }, 3000);
  }

  // ── MutationObserver on visual marker layer ─────────────────────

  let markerLayerObserver = null;
  let updating = false;

  function observeMarkerLayer() {
    if (markerLayerObserver) markerLayerObserver.disconnect();

    const layer = findVisualLayer();
    if (!layer) {
      // Retry until the layer exists
      setTimeout(observeMarkerLayer, 1000);
      return;
    }

    const observerOpts = {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src"],
    };

    markerLayerObserver = new MutationObserver(() => {
      if (updating) return;
      updating = true;
      markerLayerObserver.disconnect();
      applyAllStoredColors();
      markerLayerObserver.observe(layer, observerOpts);
      updating = false;
    });

    markerLayerObserver.observe(layer, observerOpts);

    // Initial pass
    applyAllStoredColors();
  }

  // ── Status label (read-only pill in dialog) ─────────────────────

  function createStatusLabel(dialog, statusKey) {
    const existing = dialog.querySelector(".fm-status-badge");
    if (existing) existing.remove();

    const label = document.createElement("span");
    label.className = "fm-status-badge";
    applyStatusStyle(label, statusKey);
    dialog.appendChild(label);
    return label;
  }

  // ── Toolbar (bottom-right, contains status button + notes button) ─

  let toolbar = null;
  let floatingButton = null;
  let notesToggle = null;
  let notesPanel = null;
  let activePropertyContext = null; // { propertyId, lat, lng, dialogLabel }

  function ensureToolbar() {
    if (toolbar) return toolbar;
    toolbar = document.createElement("div");
    toolbar.className = "fm-toolbar";
    document.body.appendChild(toolbar);
    return toolbar;
  }

  function ensureButtonRow() {
    const bar = ensureToolbar();
    let row = bar.querySelector(".fm-toolbar-row");
    if (!row) {
      row = document.createElement("div");
      row.className = "fm-toolbar-row";
      bar.appendChild(row);
    }
    return row;
  }

  function ensureFloatingButton() {
    if (floatingButton) return floatingButton;

    const row = ensureButtonRow();

    floatingButton = document.createElement("button");
    floatingButton.className = "fm-status-button";
    floatingButton.type = "button";

    floatingButton.addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (!activePropertyContext) return;

      const { propertyId, lat, lng, dialogLabel } = activePropertyContext;
      const current = floatingButton.dataset.status || "unseen";
      const idx = STATUS_ORDER.indexOf(current);
      const next = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];

      await saveStatus(propertyId, next, lat, lng);
      applyStatusStyle(floatingButton, next);
      if (dialogLabel) applyStatusStyle(dialogLabel, next);
      recolorActivePin(next);
    });

    row.appendChild(floatingButton);
    return floatingButton;
  }

  // ── Notes button + panel ──────────────────────────────────────────

  function ensureNotesButton() {
    if (notesToggle) return notesToggle;

    const row = ensureButtonRow();

    notesToggle = document.createElement("button");
    notesToggle.className = "fm-notes-toggle";
    notesToggle.type = "button";
    notesToggle.textContent = "\u{1F4AC}"; // 💬
    notesToggle.title = "Notes";

    notesToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (!activePropertyContext) return;
      toggleNotesPanel();
    });

    row.appendChild(notesToggle);
    return notesToggle;
  }

  function ensureNotesPanel() {
    if (notesPanel) return notesPanel;

    notesPanel = document.createElement("div");
    notesPanel.className = "fm-notes-panel";

    const header = document.createElement("div");
    header.className = "fm-notes-header";

    const title = document.createElement("span");
    title.className = "fm-notes-title";
    header.appendChild(title);

    const closeBtn = document.createElement("button");
    closeBtn.className = "fm-notes-close";
    closeBtn.type = "button";
    closeBtn.textContent = "\u2715";
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeNotesPanel(true);
    });
    header.appendChild(closeBtn);

    const textarea = document.createElement("textarea");
    textarea.className = "fm-notes-textarea";
    textarea.placeholder = "Add notes about this property\u2026";

    const saveBtn = document.createElement("button");
    saveBtn.className = "fm-notes-save";
    saveBtn.type = "button";
    saveBtn.textContent = "Save";
    saveBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeNotesPanel(true);
    });

    notesPanel.appendChild(header);
    notesPanel.appendChild(textarea);
    notesPanel.appendChild(saveBtn);

    // Insert panel before the button row so it appears above
    const bar = ensureToolbar();
    bar.insertBefore(notesPanel, bar.firstChild);
    return notesPanel;
  }

  function toggleNotesPanel() {
    const panel = ensureNotesPanel();
    if (panel.style.display === "block") {
      closeNotesPanel(true);
    } else {
      openNotesPanel();
    }
  }

  function openNotesPanel() {
    if (!activePropertyContext) return;
    const panel = ensureNotesPanel();
    const { propertyId } = activePropertyContext;
    const stored = statusCache[propertyId];

    panel.querySelector(".fm-notes-title").textContent = "Notes for " + propertyId;
    panel.querySelector(".fm-notes-textarea").value = stored?.notes || "";
    panel.style.display = "block";
    panel.querySelector(".fm-notes-textarea").focus();
  }

  async function closeNotesPanel(save) {
    if (!notesPanel) return;
    if (save && activePropertyContext) {
      const text = notesPanel.querySelector(".fm-notes-textarea").value.trim();
      await saveNotes(activePropertyContext.propertyId, text);
      updateNotesIndicator(activePropertyContext.propertyId);
    }
    notesPanel.style.display = "none";
  }

  function updateNotesIndicator(propertyId) {
    if (!notesToggle) return;
    const hasNotes = !!(statusCache[propertyId]?.notes);
    notesToggle.dataset.hasNotes = hasNotes ? "true" : "false";
  }

  // ── Show / hide toolbar ───────────────────────────────────────────

  function showFloatingButton(propertyId, lat, lng, dialogLabel) {
    const btn = ensureFloatingButton();
    ensureNotesButton();
    const currentStatus = statusCache[propertyId]?.status || "unseen";
    activePropertyContext = { propertyId, lat, lng, dialogLabel };
    applyStatusStyle(btn, currentStatus);
    updateNotesIndicator(propertyId);
    ensureToolbar().style.display = "flex";
  }

  function hideFloatingButton() {
    if (toolbar) toolbar.style.display = "none";
    closeNotesPanel(false);
    activePropertyContext = null;
  }

  function applyStatusStyle(el, statusKey) {
    const status = STATUSES[statusKey];
    el.dataset.status = statusKey;
    el.textContent = status.label;

    if (status.color) {
      el.style.backgroundColor = status.color;
      el.style.color = "#fff";
    } else {
      el.style.backgroundColor = "#e5e7eb";
      el.style.color = "#6b7280";
    }
  }

  // ── Dialog observer ─────────────────────────────────────────────

  function observeDialogs() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // Skip mutations from our own toolbar
        if (mutation.target.closest?.(".fm-toolbar")) continue;

        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;

          const dialog = node.matches?.("[role='dialog']")
            ? node
            : node.querySelector?.("[role='dialog']");

          if (dialog) handleDialog(dialog);
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  function handleDialog(dialog) {
    // Debounce: skip if already processed
    if (dialog.querySelector(".fm-status-badge")) return;

    const link = dialog.querySelector("a[href*='-P']");
    if (!link) return;

    const propertyId = extractPropertyId(link.getAttribute("href"));
    if (!propertyId) return;

    // Calculate lat/lng from the active marker's pixel position
    const mapState = getMapState();
    const pos = getActiveMarkerPixelCoords();
    let lat = null, lng = null;

    if (mapState && pos) {
      const coords = pixelToLatLng(pos.left, pos.top, mapState);
      lat = coords.lat;
      lng = coords.lng;
    }

    // If we already have stored coords, use those
    const stored = statusCache[propertyId];
    if (stored?.lat && stored?.lng) {
      lat = stored.lat;
      lng = stored.lng;
    }

    // Apply border color for existing status
    const currentStatus = stored?.status || "unseen";
    if (STATUSES[currentStatus].color) {
      dialog.style.borderLeft = `4px solid ${STATUSES[currentStatus].color}`;
    }

    // Read-only label inside dialog (top-left)
    const dialogLabel = createStatusLabel(dialog, currentStatus);

    // Floating button (bottom-right of page)
    showFloatingButton(propertyId, lat, lng, dialogLabel);

    // Hide floating button when dialog is removed from DOM
    // Observe only the dialog's direct parent to avoid firing on every subtree mutation
    // (e.g. applyStatusStyle setting textContent would trigger a body-wide subtree observer,
    //  which could race and null out activePropertyContext mid-cycle)
    const dialogParent = dialog.parentElement || document.body;
    const removalObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const removed of m.removedNodes) {
          if (removed === dialog || removed.contains?.(dialog)) {
            hideFloatingButton();
            removalObserver.disconnect();
            return;
          }
        }
      }
    });
    removalObserver.observe(dialogParent, { childList: true });

    // Recolor the active pin to match stored status
    if (currentStatus !== "unseen") {
      recolorActivePin(currentStatus);
    }
  }

  // ── Init ────────────────────────────────────────────────────────

  async function init() {
    await loadStatuses();
    observeDialogs();
    observeMarkerLayer();
    observeMapState();
    console.log("[Flatmates Enhancer] v0.2 loaded.", Object.keys(statusCache).length, "properties tracked.");
  }

  init();
})();
