# Ticker Screener - Project Handover Document

## 1. Project Concept
**Ticker Screener** is a comprehensive Chrome Extension (Manifest V3) designed for investors and traders. It provides a live watchlist, a globally injected scrolling ticker tape, and portfolio tracking. 
The extension aggregates real-time and historical financial data by scraping Screener.in (for Indian stocks) and querying the Yahoo Finance API (for global stocks and market indices). It also fetches latest financial news from Google News RSS feeds.

## 2. Core Components & Architecture

### manifest.json
- **Version:** Manifest V3 (Current version: v2.0.78)
- **Permissions:** sidePanel, storage, larms, 
otifications, contextMenus, 	abs.
- **Host Permissions:** *://*.screener.in/*, *://*.yahoo.com/*, *://news.google.com/*, https://www.nseindia.com/*.
- **Content Scripts:** Injects 	icker_tape.js and 	icker_tape.css into <all_urls>.
- **Background:** Uses ackground.js as the service worker.

### ackground.js (The Service Worker)
- **Data Fetching:** Acts as the central hub for fetching data. 
  - etchScreenerData(): Scrapes Screener.in for Indian stocks (e.g., P/E, Market Cap).
  - etchYahooData(): Fetches data for global stocks/indices using Yahoo Finance API (query1.finance.yahoo.com).
  - etchIndices(): Automatically tracks major global indices (S&P 500, Nifty 50, Sensex, etc.) and their 1-Year sparklines (
ange=1y&interval=1d).
- **Live Price Polling:** pollFastPrices() runs aggressively in the background every few seconds to grab live price action without downloading full metrics, preserving existing sparkline data.
- **Formatting:** Cleans up scraped data using 
oundStringValue(), which formats numbers to 2 decimal places, except for 'Market Cap' which is dynamically stripped of decimals for a cleaner UI.
- **Communication:** Broadcasts updates to the UI and content scripts via chrome.runtime.sendMessage and chrome.tabs.sendMessage.

### sidepanel.js & sidepanel.html (The Side Panel UI)
- **Watchlist & Portfolios:** Renders the user's saved portfolios. Supports drag-and-drop reordering of rows.
- **Metrics Display:** Shows Last Price, P/E, Market Cap, 1Y Sparklines, and visual indicators (green/red arrows for 1D returns).
- **News Feed:** Dynamically fetches portfolio news by querying the Google News RSS feed for up to 15 stocks concurrently using Promise.all (which resolved earlier UI freezing/rate-limiting issues).
- **Alerts & Notes:** Users can attach custom notes or set price alerts on specific stocks.

### 	icker_tape.js & 	icker_tape.css (The Content Script)
- **Global Ticker:** Injects a sticky, bottom-anchored scrolling ticker tape on all web pages.
- **Interactivity:** Clicking a ticker pauses the tape and opens a detailed modal showing the stock/index's 1-Year price trend (Sparkline SVG) and key metrics.
- **State Management:** Listens to chrome.storage.onChanged to update live prices, red/green flash animations, and sparklines without requiring a page reload.

## 3. Current State & Recent Fixes (As of v2.0.78)
If you are picking up this project, here is exactly where we left off:
1. **1-Year Index Sparklines:** The index sparkline charts in the ticker tape modal were successfully upgraded from a 7-Day to a 1-Year trend. 
2. **Sparkline Override Bug Fixed:** Fixed a race condition where the aggressive pollFastPrices() loop was overwriting the marketIndices object and accidentally wiping out the 1-Year sparkline arrays. Sparklines are now safely persisted during live price updates.
3. **Market Cap Decimals:** The 
oundStringValue function was updated to format Market Capitalization without decimals (e.g., '83,908 Cr.' instead of '83,908.00 Cr.').
4. **Concurrent News Fetching:** The news tab limit was increased from 3 stocks to 15 stocks. It now fetches news concurrently, removing side panel UI lag.
5. **Encoding Resilience:** Addressed a critical issue where Windows PowerShell was corrupting UTF-8 characters (like rupees ₹ and bullets •) with Mojibake during string replacements. All string replacements must be handled safely to preserve UTF-8.

## 4. Pending Tasks / Next Steps
When resuming work, the immediate next features on the roadmap are:
1. **US Macro News Fallback:** If a user’s portfolio is completely empty, the News tab currently shows a dead 'No recent news' message. This needs to be updated to dynamically pull the latest top US Macro News (e.g., S&P 500, US Economy, Federal Reserve) from Google News as a fallback.
2. **'Sample' Portfolio Migration Script:** Write a migration or initialization script in ackground.js or sidepanel.js so that when a user installs the extension for the first time, their 'Sample' portfolio is automatically populated with top US tech stocks (AAPL, MSFT, NVDA, TSLA) so it isn't empty.

## 5. Instructions for the AI Agent
If you are an AI reading this file:
- You have full context of the extension's architecture, DOM injection logic, and background polling. 
- You can safely assume the workspace directory contains the extension-code/ folder with manifest.json, ackground.js, sidepanel.js, sidepanel.html, 	icker_tape.js, and 	icker_tape.css.
- **CRITICAL:** When modifying files, be extremely careful with file encodings. Do not use generic PowerShell Get-Content pipelines that corrupt UTF-8 files. Use safe Python scripts (encoding='utf-8') or proper AI tools (
eplace_file_content) for file edits to prevent Invalid or unexpected token Syntax Errors in the Chrome V8 engine caused by hidden null bytes or Mojibake.
