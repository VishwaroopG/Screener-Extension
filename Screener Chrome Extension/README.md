# 📈 Ticker Screener — Live Watchlist, Markets & Ticker Tape

**Ticker Screener** (v2.5.1) is a free Manifest V3 browser extension for Chrome and Firefox that turns every browser tab into a focused market workspace: a live watchlist with multiple portfolios, a 10-economy Markets tab, interactive price charts, and a ticker tape that moves with you.

## ✨ Features

- **📊 Live watchlist & portfolios:** Indian (NSE/BSE) and global stocks with live price, day change, sparkline trend, P/E, market cap, dividend yield and ROCE. Draggable tickers, CSV export, AI verdict per stock.
- **🌍 10-economy Markets tab:** USA, India, UK, Singapore, Japan, Hong Kong, Germany, France, Australia, Canada — index heatmap, separated top gainers/losers, and live World Bank macro indicators.
- **🚀 Ticker tape:** Live prices on any page. Pause, 0.5x–3.0x speed, top/bottom position, themes, sizes, scroll direction, per-site disable.
- **📉 Interactive charts:** 1M–MAX ranges, hover price-and-date crosshair; the line is green when the period return is positive, red when negative.
- **🕒 World market clocks:** Draggable tiles across 15 markets, time-ordered by default, click to swap.
- **🔔 Price alerts, 🖱️ right-click to add any company, 🌙 dark mode, 🌐 55 languages, 🔄 cross-device sync.**

## ⚙️ How it works

No backend, no account — everything stays in your browser's local storage:

- **Yahoo Finance** — live prices, indices, charts and sparklines.
- **Finviz** — US fundamentals (with Yahoo Finance fallback).
- **Screener.in** — financial ratios for Indian stocks (P/E, ROCE, market cap).
- **World Bank** — macro indicators. **Google News RSS** — news.

## 📦 Install / package

- Chrome: `powershell -ExecutionPolicy Bypass -File dev-tools/build-chrome.ps1` → `Screener-Extension-vX.Y.zip` (load unpacked from `extension-code/` for development).
- Firefox: same command from the `Screener  Firefox extension` folder using its own `dev-tools/build-firefox.ps1` (see `agent.md`).
- Store listing copy lives in `../store-assets/store-description.txt`.

## ❤️ Support

Independent project by Vishwaroop Galgali. Join **@GlobalMarketPulseLive** on Telegram for stock market updates and research reports, or [buy me a coffee](https://buymeacoffee.com/vgexperiments).

## 📜 License

MIT — see [LICENSE](LICENSE) for details.
