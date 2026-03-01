# Plan: Map Marker Status Extension (v1)

## Context

Building a Firefox WebExtension that lets users assign a status to property listings on the flatmates.com.au map view. The status is persisted in `browser.storage.local` keyed by property ID (e.g. `P1669937`), which is stable across zoom/pan/DOM changes.

## DOM Findings

- **Map page URL**: `https://flatmates.com.au/rooms/{search-params}/maps`
- **Map engine**: Google Maps JS API (`.gm-style` container)
- **Marker dialog**: `[role="dialog"]` with class `gm-style-iw` — appears on marker click
- **Property link inside dialog**: `<a href="/share-house-brisbane-teneriffe-4005-P1669937">` — the `P{digits}` is the stable property ID
- **Price element class**: `.styles__rent___2q55z`
- **Dialog close button**: `button[aria-label="Close"]`
- Markers themselves are opaque `transparent.png` buttons — **cannot be directly styled**

## Approach: HTML/DOM only

1. MutationObserver watches for `[role="dialog"]` appearing in the DOM
2. When dialog appears, extract property ID from the `<a href>` inside it
3. Show a status picker bar below the dialog
4. On status selection, save to `browser.storage.local` as `{ propertyStatuses: { "P1669937": "interesting" } }`
5. Apply a colored border/badge to the dialog to reflect current status

## Files to Create/Modify

### `manifest.json` (rewrite existing)
- Manifest V2
- `permissions`: `["storage"]`
- `content_scripts`: match `*://flatmates.com.au/*/maps` and `*://www.flatmates.com.au/*/maps`
- JS: `content.js`, CSS: `content.css`
- `run_at`: `document_idle`

### `content.js` (rewrite existing)
1. **`loadStatuses()`** — read `propertyStatuses` from `browser.storage.local` into in-memory cache
2. **`saveStatus(propertyId, statusKey)`** — update cache + persist. Delete key if `unseen`
3. **`extractPropertyId(href)`** — regex `/(P\d+)/` on the link href
4. **`observeDialogs()`** — MutationObserver on `document.body` (childList + subtree). On added node matching `[role="dialog"]`, call `handleDialog()`
5. **`handleDialog(dialog)`**:
   - Find `a[href]` inside dialog, extract property ID
   - Look up current status from cache
   - Add colored left border + badge to dialog
   - Create and position status picker below dialog
6. **Status picker**: horizontal bar with 5 buttons (unseen, unsuitable, interesting, messaged, rejected), each with a color swatch. Active status highlighted. Click saves + updates badge + removes picker.

### `content.css` (rewrite existing)
- `#fm-status-picker` — dark bar, flex row, positioned absolute below dialog
- `.fm-status-btn` — button with swatch + label
- `.fm-status-badge` — small colored badge in dialog corner

### Statuses

| Key         | Label       | Color     |
|-------------|-------------|-----------|
| unseen      | Unseen      | (none)    |
| unsuitable  | Unsuitable  | `#6b7280` |
| interesting | Interesting | `#f59e0b` |
| messaged    | Messaged    | `#22c55e` |
| rejected    | Rejected    | `#374151` |

### Storage

```js
// browser.storage.local
{
  propertyStatuses: {
    "P1669937": "interesting",
    "P1827610": "rejected"
  }
}
```

### NOT in scope (v1)
- Pre-coloring map pins (markers are opaque images, can't restyle)
- Background script (not needed — content script handles everything)
- Extension popup/options page
- Icons (placeholder or omit)

## Verification

1. Load extension in Firefox via `about:debugging` → Load Temporary Add-on → select `manifest.json`
2. Navigate to `https://flatmates.com.au/rooms/bulimba-4171/males+min-300+max-450+private-room/maps`
3. Click a map marker → dialog should show with status badge ("Unseen") and picker bar below
4. Click "Interesting" → badge should turn orange, picker closes
5. Click same marker again → badge should show "Interesting" (persisted)
6. Reload page → click same marker → still "Interesting"
7. Set to "Unseen" → key removed from storage
