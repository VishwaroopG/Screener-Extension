// Capture v2.7 store screenshots (1280x800, real extension UI).
// Usage: node capture-v2.7.js [--headed]
// Output: <workspace-root>/store-assets/screenshot_v2_7_*.png
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const HEADED = process.argv.includes('--headed');
const EXT_PATH = path.join(__dirname, '..', 'extension-code');
const OUT_DIR = path.join(__dirname, '..', '..', 'store-assets');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function stagePanel(page) {
  return page.evaluate(() => {
    document.documentElement.style.background = 'radial-gradient(1000px 500px at 50% 0%, #1a2740, #0b0e14 70%), #0b0e14';
    document.body.style.maxWidth = '460px';
    document.body.style.margin = '0 auto';
    document.body.style.minHeight = '100vh';
    document.body.style.boxShadow = '0 0 80px rgba(0,0,0,.65)';
  });
}

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const launchOpts = {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
  };
  if (!HEADED) {
    launchOpts.args.push(
      '--headless=new',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--disable-gpu-sandbox',
      '--no-sandbox'
    );
  }
  console.log('Launching', HEADED ? '(headed)' : '(new headless + swiftshader)', '...');
  const context = await chromium.launchPersistentContext('', launchOpts);

  let background = context.serviceWorkers().find((w) => w.url().includes('background'));
  if (!background) {
    try {
      background = await context.waitForEvent('serviceworker', { timeout: 20000 });
    } catch (e) {
      console.log('No service worker seen — continuing anyway.');
    }
  }
  const extensionId = background ? background.url().split('/')[2] : null;
  console.log('Extension ID:', extensionId);
  if (!extensionId) throw new Error('Extension did not load; aborting.');

  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const p of context.pages()) {
    if (p !== page) await p.close().catch(() => {});
  }

  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`, { waitUntil: 'domcontentloaded' });
  await sleep(1200);

  // Seed a multi-asset portfolio showing new Smart-Watchlist + crypto/forex/commodity badges.
  try {
    await page.evaluate(() => new Promise((resolve) => {
      const portfolios = {
        Sample: ['AAPL', 'MSFT', 'NVDA', 'BTC-USD', 'EURUSD=X', 'GC=F', 'RELIANCE.NS', 'TCS.NS'],
      };
      chrome.storage.local.set({
        portfolios,
        screenerWatchlist: portfolios.Sample,
        activePortfolioName: 'Sample',
        theme: 'dark',
        colorTags: { 'AAPL': 'entry', 'NVDA': 'watching', 'BTC-USD': 'exit' },
      }, () => resolve(true));
    }));
  } catch (e) { console.log('Seed skipped:', e.message); }

  // Force dark theme for premium store look.
  try {
    await page.evaluate(() => {
      if (!document.body.classList.contains('dark-mode')) {
        const btn = document.getElementById('theme-toggle');
        if (btn) btn.click();
      }
    });
    await sleep(600);
  } catch (e) {}

  await stagePanel(page);

  // Trigger a full sync so prices/ratios/sparklines are live, not placeholders.
  try {
    await page.evaluate(() => new Promise((resolve) => {
      try { chrome.runtime.sendMessage({ type: 'FORCE_SYNC' }, () => resolve(true)); }
      catch (e) { resolve(false); }
    }));
  } catch (e) {}
  try {
    await page.waitForFunction(() => {
      const el = document.getElementById('wl-items-container');
      return el && !/waiting for sync/i.test(el.textContent || '');
    }, { timeout: 90000 });
    console.log('Watchlist synced.');
  } catch (e) { console.log('Watchlist still syncing — continuing anyway.'); }
  await sleep(2500);

  const shot = (name) => page.screenshot({ path: path.join(OUT_DIR, name) }).then(() => console.log('Saved', name));

  // 1 — Dashboard: live multi-asset watchlist (P/E toggle, tags, sparklines, Live badge).
  await page.locator('#tab-search').click().catch(() => {});
  await sleep(1200);
  await shot('screenshot_v2_7_1_dashboard_1280x800.png');

  // 2 — Import modal: paste tickers to show Zerodha/Screener/TradingView import.
  try {
    await page.locator('#btn-import-watchlist').click();
    await sleep(800);
    await page.locator('#import-paste').fill('RELIANCE, INFY, AAPL\nHDFCBANK\nTCS');
    await sleep(600);
    await shot('screenshot_v2_7_2_import_1280x800.png');
    await page.locator('#btn-import-cancel').click().catch(() => {});
    await sleep(500);
  } catch (e) { console.log('Import shot skipped:', e.message); }

  // 3 — Markets: Mood gauge + breadth bar + heatmaps (the v2.6.6 headline).
  try {
    await page.locator('#tab-markets').click();
    await sleep(4000);
    await shot('screenshot_v2_7_3_markets_1280x800.png');
  } catch (e) { console.log('Markets shot skipped:', e.message); }

  // 4 — Advanced alerts modal: day-move spike, 52w breakouts, frequency, expiry, note, sound.
  try {
    await page.locator('#tab-search').click().catch(() => {});
    await sleep(800);
    await page.evaluate(() => {
      const m = document.getElementById('alert-modal');
      if (m) { m.style.display = 'flex'; m.style.position = 'absolute'; }
      const t = document.getElementById('alert-ticker');
      if (t) t.textContent = 'NVDA';
      const badge = document.getElementById('alert-cur-price-badge');
      if (badge) badge.textContent = '$218.29';
      const above = document.getElementById('alert-above');
      if (above) above.value = '240.00';
      const below = document.getElementById('alert-below');
      if (below) below.value = '195.50';
      const adv = document.getElementById('alert-advanced');
      if (adv) adv.open = true;
      const mv = document.getElementById('alert-movepct');
      if (mv) mv.value = '5';
      const h52 = document.getElementById('alert-high52');
      if (h52) h52.checked = true;
      const note = document.getElementById('alert-note');
      if (note) note.value = 'Trim into strength';
      const badgeAdv = document.getElementById('alert-advanced-badge');
      if (badgeAdv) { badgeAdv.style.display = 'inline-block'; badgeAdv.textContent = '3 active'; }
    });
    await sleep(800);
    await shot('screenshot_v2_7_4_alerts_1280x800.png');
    await page.evaluate(() => {
      const m = document.getElementById('alert-modal');
      if (m) m.style.display = 'none';
    });
    await sleep(400);
  } catch (e) { console.log('Alerts shot skipped:', e.message); }

  // 5 — News: portfolio + macro feeds with thumbnails.
  try {
    await page.locator('#tab-news').click();
    await sleep(3000);
    await shot('screenshot_v2_7_5_news_1280x800.png');
  } catch (e) { console.log('News shot skipped:', e.message); }

  // 6 — Ticker tape on a real site (content-script overlay at page bottom).
  try {
    await page.goto('https://www.screener.in', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    try {
      await page.waitForSelector('#screener-ticker-tape', { timeout: 25000 });
    } catch (e) { console.log('Tape element not detected — continuing.'); }
    await sleep(2000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await shot('screenshot_v2_7_6_tickertape_1280x800.png');
  } catch (e) { console.log('Tape shot skipped:', e.message); }

  await context.close();
  console.log('Done! Check store-assets for screenshot_v2_7_*_1280x800.png');
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
