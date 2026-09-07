# Screener Pro Agent Context

This file provides context for any AI agent working on the Screener Pro extension. Read this before making changes to understand the architecture, design choices, and past bugs.

## Project Overview
**Screener Pro** is a Chrome Extension (Manifest V3) that provides a live stock watchlist (side panel) and a globally injected ticker tape (content script) across all websites. It aggregates real-time data from Yahoo Finance (global markets/indices) and Screener.in (Indian equities).

## Architecture
- **`manifest.json`**: Manifest V3. Permissions include `sidePanel`, `storage`, `alarms`, `notifications`, `contextMenus`.
- **`background.js`**: Service worker. Handles the core API polling engine (Screener/Yahoo). Caches data heavily in `chrome.storage.local` to minimize network requests. Uses `chrome.alarms` to poll periodically.
- **`sidepanel.html` & `sidepanel.js`**: The UI layer. Vanilla JS (no frameworks). Manages portfolios, draggable watchlists, custom price alerts, AI-driven stock verdicts (based on P/E and ROCE), and Market Indices settings. Uses Google Material Outline SVGs.
- **`ticker_tape.js` & `ticker_tape.css`**: Content script injected into `<all_urls>`. Renders a continuous, GPU-accelerated marquee at the bottom of the screen. Caches are read instantly from `chrome.storage.local` to draw detailed stock popups/modals when a ticker is clicked.

## Critical Technical Guidelines & Past Learnings

### 1. Ticker Tape Scrolling Math
The ticker tape uses a continuous animation loop (`requestAnimationFrame`) with GPU-accelerated `translate3d`. To prevent infinite translation growth (which causes visual bugs when the tape is hidden via `display: none` and then shown again), we use a modulo operation:
```javascript
if (halfWidth > 0 && Math.abs(currentX) >= halfWidth) {
  currentX = currentX % halfWidth;
}
```

### 2. Modals in Content Scripts
When injecting modals via the content script (`ticker_tape.js`), do **not** use `document.getElementById()` to attach event listeners to the modal buttons. Depending on the website's DOM parsing state or structure, this can fail or conflict. Instead, use `.querySelector()` on the dynamically created wrapper:
```javascript
const closeBtn = modalBackdrop.querySelector('#screener-modal-close');
```

### 3. Yahoo Finance Data Edge Cases (Sparklines)
When fetching historical sparkline data from Yahoo Finance, it occasionally returns strings like `"N/A"` instead of an array of numbers. Always strictly check the type before iterating to prevent catastrophic script crashes:
```javascript
if (!Array.isArray(dataPoints) || dataPoints.length < 2) { return; }
```

### 4. DOM IDs and UI Cleanup
If removing an element or tab from `sidepanel.html`, you **must** remove the corresponding `document.getElementById` and `addEventListener` references in `sidepanel.js`. A single `null` reference during `DOMContentLoaded` will halt the entire side panel initialization.

### 5. Custom Market Indices
The "Edit Market Card" modal uses an HTML `<datalist>` for suggestions. This acts as a soft autocomplete—users can type any arbitrary name or Yahoo symbol (e.g., `^VIX`) and it will successfully save and fetch. Do not restrict this to a hardcoded `<select>`.

## Packaging
To deploy a new version:
1. Bump the version in `manifest.json`.
2. Package the extension using PowerShell: `Compress-Archive -Path "extension-code\*" -DestinationPath "screener-extension-v2.x.x.zip" -Force`
3. Commit and push to GitHub.
