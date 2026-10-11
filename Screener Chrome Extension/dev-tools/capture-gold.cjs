// Full-screen store screenshots with the signature gold border (v2.3/v2.5 style).
// Headless composite: REAL Economic Times page (with live ticker tape) on the left +
// REAL extension panel UI on the right, 5px #FFC107 border around the panel.
// Usage: node capture-gold.cjs
// Output: <workspace-root>/store-assets/screenshot_v2_7_*_1280x800_gold.png
const { chromium } = require('playwright');
const { Jimp } = require('jimp');
const path = require('path');
const fs = require('fs');
const os = require('os');

const EXT_PATH = path.join(__dirname, '..', 'extension-code');
const OUT_DIR = path.join(__dirname, '..', '..', 'store-assets');
const PAGE_W = 890;   // page column (matches v2.3 gold composition)
const PANEL_W = 390;  // docked-panel column
const W = 1280, H = 800;
const GOLD = 0xffc107ff;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function composite(pageShot, panelShot, outName) {
  const canvas = new Jimp({ width: W, height: H, color: 0x0b0e14ff });
  canvas.composite(await Jimp.read(pageShot), 0, 0);
  canvas.composite(await Jimp.read(panelShot), PAGE_W, 0);
  // 5px gold border around the panel rect (888,0)-(1279,799), drawn inside.
  const barH = new Jimp({ width: W - PAGE_W + 2, height: 5, color: GOLD });
  const barV = new Jimp({ width: 5, height: H, color: GOLD });
  canvas.composite(barH, PAGE_W - 2, 0);
  canvas.composite(barH, PAGE_W - 2, H - 5);
  canvas.composite(barV, PAGE_W - 2, 0);
  canvas.composite(barV, W - 5, 0);
  const out = path.join(OUT_DIR, outName);
  await canvas.write(out);
  console.log('Saved', outName);
}

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gold-shots-'));
  console.log('Launching (headless, swiftshader) ...');
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    viewport: { width: W, height: H },
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      '--headless=new',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--disable-gpu-sandbox',
      '--no-sandbox',
      '--force-device-scale-factor=1',
    ],
  });

  let background = context.serviceWorkers().find((w) => w.url().includes('background'));
  if (!background) {
    try { background = await context.waitForEvent('serviceworker', { timeout: 20000 }); }
    catch (e) { console.log('No service worker seen - continuing anyway.'); }
  }
  const extensionId = background ? background.url().split('/')[2] : null;
  console.log('Extension ID:', extensionId);
  if (!extensionId) throw new Error('Extension did not load; aborting.');

  // Panel tab: the real sidepanel UI, rendered at docked-panel width.
  const panel = await context.newPage();
  for (const p of context.pages()) {
    if (p !== panel && !p.url().includes('sidepanel')) await p.close().catch(() => {});
  }
  await panel.setViewportSize({ width: PANEL_W, height: H });
  console.log('Panel viewport set; opening sidepanel.html ...');
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`, { waitUntil: 'domcontentloaded' });
  console.log('Sidepanel loaded.');
  await sleep(1200);

  try {
    await panel.evaluate(() => new Promise((resolve) => {
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

  try {
    await panel.evaluate(() => {
      if (!document.body.classList.contains('dark-mode')) {
        const btn = document.getElementById('theme-toggle');
        if (btn) btn.click();
      }
    });
    await sleep(600);
  } catch (e) {}

  try {
    await panel.evaluate(() => new Promise((resolve) => {
      try { chrome.runtime.sendMessage({ type: 'FORCE_SYNC' }, () => resolve(true)); }
      catch (e) { resolve(false); }
    }));
  } catch (e) {}
  try {
    await panel.waitForFunction(() => {
      const el = document.getElementById('wl-items-container');
      return el && !/waiting for sync/i.test(el.textContent || '');
    }, { timeout: 90000 });
    console.log('Watchlist synced.');
  } catch (e) { console.log('Watchlist still syncing - continuing anyway.'); }
  await sleep(2500);

  // Page tab: real site with the live ticker-tape overlay, at page-column width.
  console.log('Opening page tab (Economic Times) ...');
  const page = await context.newPage();
  await page.setViewportSize({ width: PAGE_W, height: H });
  await page.goto('https://economictimes.indiatimes.com/', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  console.log('Page loaded.');
  // Best-effort dismissal of consent/login overlays (never fatal).
  try {
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const t = btns.find((b) => /accept|agree|got it|continue|ok/i.test(b.textContent || ''));
      if (t) t.click();
    });
  } catch (e) {}
  try {
    await page.waitForSelector('#screener-ticker-tape', { timeout: 25000 });
    console.log('Tape detected.');
  } catch (e) { console.log('Tape element not detected - continuing.'); }
  await sleep(2500);

  const pageShot = (n) => { console.log('shot page' + n); return page.screenshot({ path: path.join(tmp, `page${n}.png`) }); };
  const panelShot = (n) => { console.log('shot panel' + n); return panel.screenshot({ path: path.join(tmp, `panel${n}.png`) }); };
  const gold = (n, name) => composite(path.join(tmp, `page${n}.png`), path.join(tmp, `panel${n}.png`), name);

  // 1 - Dashboard: live multi-asset watchlist.
  await panel.locator('#tab-search').click().catch(() => {});
  await sleep(1200);
  await pageShot(1); await panelShot(1);
  await gold(1, 'screenshot_v2_7_1_dashboard_1280x800_gold.png');

  // 2 - Import modal.
  try {
    await panel.locator('#btn-import-watchlist').click();
    await sleep(800);
    await panel.locator('#import-paste').fill('RELIANCE, INFY, AAPL\nHDFCBANK\nTCS');
    await sleep(600);
    await pageShot(2); await panelShot(2);
    await gold(2, 'screenshot_v2_7_2_import_1280x800_gold.png');
    await panel.locator('#btn-import-cancel').click().catch(() => {});
    await sleep(500);
  } catch (e) { console.log('Import shot skipped:', e.message); }

  // 3 - Markets: Mood gauge + breadth + heatmaps.
  try {
    await panel.locator('#tab-markets').click();
    await sleep(4000);
    await pageShot(3); await panelShot(3);
    await gold(3, 'screenshot_v2_7_3_markets_1280x800_gold.png');
  } catch (e) { console.log('Markets shot skipped:', e.message); }

  // 4 - Advanced alerts modal.
  try {
    await panel.locator('#tab-search').click().catch(() => {});
    await sleep(800);
    await panel.evaluate(() => {
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
    await pageShot(4); await panelShot(4);
    await gold(4, 'screenshot_v2_7_4_alerts_1280x800_gold.png');
    await panel.evaluate(() => {
      const m = document.getElementById('alert-modal');
      if (m) m.style.display = 'none';
    });
    await sleep(400);
  } catch (e) { console.log('Alerts shot skipped:', e.message); }

  // 5 - News tab.
  try {
    await panel.locator('#tab-news').click();
    await sleep(3000);
    await pageShot(5); await panelShot(5);
    await gold(5, 'screenshot_v2_7_5_news_1280x800_gold.png');
  } catch (e) { console.log('News shot skipped:', e.message); }

  // 6 - Tape hero: ET markets page behind, dashboard panel.
  try {
    await panel.locator('#tab-search').click().catch(() => {});
    await page.goto('https://economictimes.indiatimes.com/markets', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    try { await page.waitForSelector('#screener-ticker-tape', { timeout: 25000 }); }
    catch (e) { console.log('Tape element not detected on company page - continuing.'); }
    await sleep(2500);
    await pageShot(6); await panelShot(6);
    await gold(6, 'screenshot_v2_7_6_tickertape_1280x800_gold.png');
  } catch (e) { console.log('Tape shot skipped:', e.message); }

  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  await context.close();
  console.log('Done! Check store-assets for screenshot_v2_7_*_1280x800_gold.png');
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
