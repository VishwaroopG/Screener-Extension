// Recapture the classic store screenshots WITHOUT any website backdrop.
// Usage: node capture-classic.js [--headed]
// Output (workspace-root store-assets, unversioned canonical names):
//   screenshot_dashboard_1280x800.png
//   screenshot_news_1280x800.png
//   screenshot_markets_1280x800.png
//   screenshot_stockpopup_1280x800.png   (tape popup on a neutral page)
//   screenshot_contextmenu_1280x800.png  (staged illustration: native OS menus
//                                        cannot be captured by automation)
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

// Neutral, brand-free illustration of the right-click menu item.
// (Playwright can only screenshot page DOM, never the native OS menu,
// so this frame is a faithful replica, same as the previous listing art.)
const CONTEXT_MENU_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
*{margin:0;box-sizing:border-box}
body{width:1280px;height:800px;background:#eef1f4;color:#202124;
font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;position:relative;overflow:hidden}
.article{max-width:760px;margin:120px auto 0;background:#fff;border-radius:12px;
padding:48px 56px;box-shadow:0 2px 12px rgba(0,0,0,.08)}
.article h1{font-size:34px;font-weight:700;margin-bottom:18px;letter-spacing:-.01em}
.article p{font-size:17px;line-height:1.65;color:#3c4043;margin-bottom:14px}
.sel{background:#b3d7ff;border-radius:3px;padding:0 2px}
.menu{position:absolute;left:640px;top:330px;width:330px;background:#fff;border-radius:10px;
box-shadow:0 8px 30px rgba(0,0,0,.28);padding:7px 0;font-size:14px;color:#202124}
.mi{display:flex;align-items:center;gap:12px;padding:8px 18px;cursor:default}
.mi .k{margin-left:auto;color:#5f6368;font-size:12px}
.mi.hl{background:#e8f0fe;font-weight:500}
.sep{height:1px;background:#e1e3e6;margin:6px 0}
.mi svg{flex-shrink:0}
.note{position:absolute;bottom:36px;left:0;right:0;text-align:center;color:#80868b;font-size:14px}
</style></head><body>
<div class="article">
<h1>Chip stocks rally as AI demand accelerates</h1>
<p>Semiconductor shares extended gains on Thursday as investors bet the
build-out of AI data centers will keep order books full through next year.
Analysts pointed to strong guidance across the supply chain, from foundries
to networking equipment makers.</p>
<p>"... the recent performance of <span class="sel">NVIDIA Corp. (TICK: NVDA)</span>
has shown significant strength on heavy volume, attracting serious
institutional interest. In that stock, risk appetite and
momentum dynamics remain firmly positive."</p>
</div>
<div class="menu">
<div class="mi">Cut<span class="k">Ctrl+X</span></div>
<div class="mi">Copy<span class="k">Ctrl+C</span></div>
<div class="mi">Paste<span class="k">Ctrl+V</span></div>
<div class="sep"></div>
<div class="mi">Search Google for "NVIDIA Corp. ..."</div>
<div class="mi">Print...<span class="k">Ctrl+P</span></div>
<div class="mi">Inspect<span class="k">Ctrl+I</span></div>
<div class="sep"></div>
<div class="mi hl"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1a73e8" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>Add to Screener Watchlist</div>
<div class="sep"></div>
<div class="mi">Translate to English</div>
</div>
<div class="note">Right-click any ticker on any page to add it straight to your watchlist</div>
</body></html>`;

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
      console.log('No service worker seen  continuing anyway.');
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

  try {
    await page.evaluate(() => new Promise((resolve) => {
      const portfolios = { Sample: ['AAPL', 'MSFT', 'NVDA', 'TSLA'] };
      chrome.storage.local.set({
        portfolios,
        screenerWatchlist: portfolios.Sample,
        activePortfolioName: 'Sample',
        theme: 'dark',
      }, () => resolve(true));
    }));
  } catch (e) { console.log('Seed skipped:', e.message); }

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
  } catch (e) { console.log('Watchlist still syncing  continuing anyway.'); }
  await sleep(12000); // allow ratios/sparklines to fill

  const shot = (name) => page.screenshot({ path: path.join(OUT_DIR, name) }).then(() => console.log('Saved', name));

  // 1  Dashboard (clean, no website behind).
  await page.locator('#tab-search').click().catch(() => {});
  await sleep(1200);
  await shot('screenshot_dashboard_1280x800.png');

  // 2  Markets (clean).
  await page.locator('#tab-markets').click().catch(() => {});
  await sleep(4000);
  await shot('screenshot_markets_1280x800.png');

  // 3  News (clean).
  await page.locator('#tab-news').click().catch(() => {});
  await sleep(3000);
  await shot('screenshot_news_1280x800.png');

  // 4  Stock popup: neutral page + tape + open popup modal with chart.
  try {
    await page.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    try {
      await page.waitForSelector('#screener-ticker-tape .screener-clickable-ticker', { timeout: 25000 });
    } catch (e) { console.log('Tape tickers not detected  continuing.'); }
    await sleep(1500);
    // Prefer a company stock (has description + View Details) over an index card.
    // NOTE: stock items carry NO data-is-index attr (only indices have
    // data-is-index="true"), so select by ticker, not by ="false".
    const TICKER_SEL = '#screener-ticker-tape .screener-clickable-ticker[data-ticker="AAPL"]';
    try {
      await page.locator(TICKER_SEL).first.click({ timeout: 8000 });
    } catch (e) {
      console.log('Direct click missed (marquee moves)  dispatching synthetic click.');
      await page.evaluate((sel) => {
        const el = document.querySelector(sel) ||
          document.querySelector('#screener-ticker-tape .screener-clickable-ticker:not([data-is-index])') ||
          document.querySelector('#screener-ticker-tape .screener-clickable-ticker');
        if (el) {
          // Mirror a real click: mousedown sets the tape's drag-guard startX,
          // so the click handler does not mistake it for a drag (startX=0).
          const cx = 100;
          const cy = 100;
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, pageX: cx }));
          el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, pageX: cx }));
          el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, pageX: cx }));
        }
      }, TICKER_SEL);
    }
    try {
      await page.waitForSelector('.screener-modal-backdrop.visible', { timeout: 15000 });
    } catch (e) { console.log('Popup modal did not open  shooting tape only.'); }
    await sleep(4000); // allow chart + description to render
    await shot('screenshot_stockpopup_1280x800.png');
  } catch (e) { console.log('Stock popup shot skipped:', e.message); }

  // 5  Context menu (staged illustration on neutral art, no site branding).
  try {
    await page.setContent(CONTEXT_MENU_HTML);
    await page.setViewportSize({ width: 1280, height: 800 });
    await sleep(600);
    await shot('screenshot_contextmenu_1280x800.png');
  } catch (e) { console.log('Context menu shot skipped:', e.message); }

  await Promise.race([context.close(), sleep(10000)]).catch(() => {});
  console.log('Done! Check store-assets for screenshot_*_1280x800.png');
  process.exit(0);
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
