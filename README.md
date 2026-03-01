# Flatmates enhancer

> Vibe coded with Claude Code

## Goal

Provide extra features on flatmates.com to annotate details about listings and people.

## Functional Requirements

### F1: Map Marker Status

Color-code property markers on the flatmates.com.au map view by user-assigned status.

**Target page**: `https://flatmates.com.au/rooms/{search-params}/maps`
- The `{search-params}` portion is variable (e.g. `bulimba-4171/males+min-300+max-450+private-room`)

**Statuses and colors**:

| Status      | Color        | Hex       |
|-------------|-------------|-----------|
| unseen      | (no change) | —         |
| unsuitable  | dark grey   | `#6b7280` |
| interesting | orange      | `#f59e0b` |
| messaged    | green       | `#22c55e` |
| rejected    | darker grey | `#374151` |

**DOM structure** (Google Maps):
- Cluster markers: `div.cluster` containing an `<img>` (cluster-icon-default.svg) + count `<div>`
- Individual markers: `div[role="button"][tabindex="-1"]` with transparent PNG
- Clicking a marker opens a `dialog` with a link containing the property ID (e.g. `/share-house-brisbane-wynnum-west-4178-P1827610` — the `P{number}` is the property ID)

**Storage**: `browser.storage.local`, keyed by property ID (e.g. `P1827610`)

## Install

### Chrome / Edge / Brave (persistent)

1. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`)
2. Enable **Developer mode** (toggle top-right)
3. Click **Load unpacked** → select this project folder
4. The extension persists across browser restarts

### Firefox (temporary)

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on** → select `manifest.json`
3. Extension is removed when Firefox closes — use `web-ext` for development instead

> For permanent Firefox install, the extension must be signed via [addons.mozilla.org](https://addons.mozilla.org).

## Development

### Run with auto-reload

**Firefox:**
```bash
npx web-ext run --source-dir .
```

**Chromium (Chrome/Edge/Brave):**
```bash
npx web-ext run --source-dir . --target chromium
```

Opens a temporary profile with the extension loaded. Auto-reloads on file changes.

### Storage persistence

Data is stored via `browser.storage.local`, which survives browser restarts. However, **how** you load the extension matters:

| Method | Storage persists? |
|---|---|
| Chromium "Load unpacked" | Yes — stable extension ID |
| Firefox `about:debugging` (temporary add-on) | **No** — extension ID changes each load, so storage is lost when Firefox closes |
| `web-ext run` | Yes, if you reuse the same profile (default behaviour) |
| Signed / installed extension | Yes |

### Lint

```bash
npx web-ext lint
```

## Tech

* Browser extension (Manifest V3, works in Firefox and Chromium)
* `browser.*` APIs
* Plain JS/HTML/CSS — no build step
* Data persists in `browser.storage.local`
