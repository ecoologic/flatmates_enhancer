# Current Progress — Map Marker Status Extension v0.3

## Status: UI refactored — floating button + dialog label, visually confirmed

### What changed in v0.3

**UI split: dialog label (read-only) + floating page button (clickable)**

1. **content.css** —
   - `.fm-status-badge` moved from `right: 6px` → `left: 6px`, changed to `pointer-events: none` (read-only label)
   - New `.fm-status-button` — `position: fixed; bottom: 24px; right: 24px`, `z-index: 10000`, with box-shadow

2. **content.js** —
   - `createStatusBadge()` replaced by `createStatusLabel()` — creates a `<span>` (not `<button>`), no click handler
   - New `ensureFloatingButton()` / `showFloatingButton()` / `hideFloatingButton()` — singleton `<button>` appended to `document.body`
   - Shared `applyStatusStyle(el, statusKey)` — used by both label and button
   - `activePropertyContext` tracks `{ propertyId, lat, lng, dialogLabel }` for the floating button's click handler
   - `handleDialog()` now:
     - Creates read-only label via `createStatusLabel()`
     - Shows floating button via `showFloatingButton()`
     - Sets up a MutationObserver to `hideFloatingButton()` when dialog is removed from DOM
   - Floating button click cycles status and updates both itself and the dialog label

### What's verified in Playwright

| Feature | Status |
|---------|--------|
| Extension loads, init logs | OK |
| Dialog observer fires on marker click | OK |
| Read-only label appears in dialog (top-left, "UNSEEN") | OK — screenshot `test-new-ui.png` |
| Floating button appears at bottom-right ("UNSEEN") | OK — screenshot `test-new-ui.png` |
| Floating button click cycles status | **Untested** — was about to test when session interrupted |
| Dialog label updates when button clicked | **Untested** |
| SVG recoloring | **Untested** in browser |
| Pre-coloring stored markers | **Untested** |
| Floating button hides when dialog closes | **Untested** |
| Persistence across reload | **Untested** |

### What to test next

1. **Floating button click** — Use `document.querySelector('.fm-status-button').click()` via `page.evaluate()`. Verify both button and dialog label text cycle together.
2. **Pin recoloring** — After setting a status, check if the active pin's SVG src changes.
3. **Button hide on dialog close** — Click elsewhere on map, verify floating button disappears.
4. **Pre-coloring on reload** — Set a status, reload page, check if `applyAllStoredColors()` recolors.
5. **Reset to unseen** — Cycle back to unseen, verify pin returns to default.

### Playwright test setup (for next session)

```js
// 1. Navigate
await page.goto('https://flatmates.com.au/rooms/brisbane/maps');

// 2. Wait for map clusters to load (~5s)

// 3. Mock browser.storage.local
await page.evaluate(() => {
  const store = {};
  window.browser = {
    storage: { local: {
      get: async (key) => typeof key === 'string' ? { [key]: store[key] } : store,
      set: async (obj) => Object.assign(store, obj)
    }}
  };
});

// 4. Inline CSS (file:// blocked in Chromium)
await page.evaluate(() => {
  const style = document.createElement('style');
  style.textContent = `/* copy from content.css */`;
  document.head.appendChild(style);
});

// 5. Inject content.js
await page.addScriptTag({ path: '/Users/erik/dev/projects/flatmates/content.js' });

// 6. Zoom: click cluster "201" → click cluster "2" → individual pins at z18
// 7. Click individual pin via page.evaluate: buttons[n].click()
// 8. Wait ~2s for dialog
```

### Bugs found and fixed during testing

1. **`findActiveMarkerPosition` read from wrong element** — Was reading `active.parentElement.style.left` (the z-106 container, always `0px`). Fixed to read from `active.style.left` directly. Renamed to `getActiveMarkerPixelCoords`.
2. **`recolorPin` unseen reset destroyed text color** — Was replacing ALL `fill="*"` with `fill="white"`, which turned the price text invisible. Fixed to only replace known status fill/stroke colors back to defaults.
3. **`findVisualPin` left/top matching fragile** — Added `findVisualPinByRect` using `getBoundingClientRect()` for active marker matching (distance=0 confirmed). Kept `findVisualPinByCoords` for Mercator-based pre-coloring.

## DOM Findings (verified in Playwright on live site)

### Marker layers

| Layer | z-index | Contents | Coordinate system |
|-------|---------|----------|-------------------|
| Visual pins | 103 (container) | Children are divs with `<img src="data:image/svg+xml,...">` | `left/top` on each child div, relative to 50%/50% + transform parent |
| Interaction buttons | 106 (container) | Children are `div[role="button"]` with `transparent.png` | `left/top` on each button element itself (NOT parent) |

Both layers use the **same coordinate values** for the same marker (confirmed: bounding rect distance = 0).

### SVG structure

**Unselected pin:**
```xml
<rect ... fill="white"></rect>           <!-- background -->
<text ... fill="#2F3A4A">$300</text>     <!-- price text (dark) -->
<rect ... stroke="#ABB0B6"></rect>       <!-- border -->
```

**Selected/active pin:**
```xml
<rect ... fill="#2F3A4A"></rect>          <!-- background (dark) -->
<text ... fill="white">$350</text>       <!-- price text (white) -->
<rect ... stroke="#ABB0B6"></rect>        <!-- border -->
```

Recoloring targets `fill="white"` → status fill and `stroke="#ABB0B6"` → status stroke on **unselected** pins only.

### Playwright limitation

Playwright's click action is intercepted by Google Maps overlay elements. Must use `element.click()` via `page.evaluate()` for any click inside the map/dialog area.
