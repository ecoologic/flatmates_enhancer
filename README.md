# Flatmates enhancer

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

## Development

### Run with auto-reload (recommended)

**Firefox:**
```bash
npx web-ext run --source-dir .
```

**Chromium (Chrome/Edge/Brave):**
```bash
npx web-ext run --source-dir . --target chromium
```

Opens the browser with the extension loaded. Auto-reloads on file changes.

### Load manually

**Firefox:** `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on" → select `manifest.json`

**Chrome:** `chrome://extensions` → enable "Developer mode" → "Load unpacked" → select project folder

### Lint

```bash
npx web-ext lint
```

## Tech

* Browser extension (Manifest V3, works in Firefox and Chromium)
* `browser.*` APIs
* Plain JS/HTML/CSS — no build step
* Data persists in `browser.storage.local`
