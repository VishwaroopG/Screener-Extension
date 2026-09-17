// Promo walkthrough recorder for Ticker Screener (~60s, 1280x720, silent + burned-in captions).
// Usage: node promo-record.js [--headed]
//   Default runs in new-headless with software compositing (works without a
//   display). Pass --headed to record on your own screen instead.
// Output: <repo-root>/store-assets/promo_video_v2_3.webm
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const HEADED = process.argv.includes('--headed');
const EXT_PATH = path.join(__dirname, '..', 'extension-code');
const OUT_DIR = path.join(__dirname, '..', '..', 'store-assets');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CAPTION_CSS = `
#promo-caption{position:fixed;left:50%;bottom:26px;transform:translateX(-50%) translateY(8px);
max-width:1000px;padding:12px 26px;border-radius:999px;background:rgba(10,12,18,.88);
color:#fff;font:600 21px/1.35 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;letter-spacing:.01em;
text-align:center;z-index:2147483647;opacity:0;transition:opacity .45s ease,transform .45s ease;
box-shadow:0 8px 28px rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.14);pointer-events:none;white-space:nowrap;}
#promo-caption.show{opacity:1;transform:translateX(-50%) translateY(0);}`;

async function caption(page, text, holdMs) {
  await page.evaluate(
    ({ text, css }) => {
      let el = document.getElementById('promo-caption');
      if (!el) {
        const st = document.createElement('style');
        st.textContent = css;
        document.documentElement.appendChild(st);
        el = document.createElement('div');
        el.id = 'promo-caption';
        document.documentElement.appendChild(el);
      }
      el.textContent = text;
      requestAnimationFrame(() => el.classList.add('show'));
    },
    { text, css: CAPTION_CSS }
  );
  await sleep(600);
  await sleep(holdMs);
  await page.evaluate(() => {
    const el = document.getElementById('promo-caption');
    if (el) el.classList.remove('show');
  });
  await sleep(500);
}

// Center the narrow side panel as a floating card on a dark stage (1280x720).
async function showcaseFrame(page) {
  await page.evaluate(() => {
    document.documentElement.style.background = '#0b0e14';
    document.body.style.maxWidth = '430px';
    document.body.style.margin = '0 auto';
    document.body.style.minHeight = '100vh';
    document.body.style.boxShadow = '0 0 60px rgba(0,0,0,.6)';
  });
}

const CARD = (title, sub, badge) => `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>*{margin:0;box-sizing:border-box}body{height:100vh;display:flex;align-items:center;justify-content:center;
background:radial-gradient(1000px 500px at 50% 20%,#16233b,#0b0e14 70%);color:#fff;
font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif}
.card{text-align:center;padding:0 60px}.badge{display:inline-block;font-size:15px;font-weight:700;letter-spacing:.22em;
color:#7ee2a8;border:1px solid rgba(126,226,168,.4);border-radius:999px;padding:8px 22px;margin-bottom:26px}
h1{font-size:64px;font-weight:800;letter-spacing:-.02em;margin-bottom:14px}
h1 span{color:#4caf50}p{font-size:23px;color:#b9c2d0;font-weight:400}</style></head>
<body><div class="card"><div class="badge">${badge}</div><h1>${title}</h1><p>${sub}</p></div></body></html>`;

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const launchOpts = {
    headless: false,
    viewport: { width: 1280, height: 720 },
    args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
    recordVideo: { dir: OUT_DIR, size: { width: 1280, height: 720 } },
  };
  if (!HEADED) {
    // Display-less recording: new headless supports extensions, and the
    // software compositor makes screencast frames actually render.
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
      background = await context.waitForEvent('serviceworker', { timeout: 15000 });
    } catch (e) {
      console.log('No service worker seen yet — continuing anyway.');
    }
  }
  const extensionId = background ? background.url().split('/')[2] : null;
  console.log('Extension ID:', extensionId);
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 720 });
  // Persistent contexts open with a default blank tab that would also be
  // recorded — close it so only our walkthrough page ends up on video.
  for (const p of context.pages()) {
    if (p !== page) await p.close().catch(() => {});
  }

  // Scene 1 — title card (0-6s)
  await page.setContent(CARD('Ticker <span>Screener</span>', 'Live watchlist & ticker tape for investors', 'SCREENCAST'));
  await caption(page, 'Meet Ticker Screener — markets, right in your browser', 4500);

  if (!extensionId) throw new Error('Extension did not load; aborting.');

  // Scene 2 — dashboard (6-17s)
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`, { waitUntil: 'domcontentloaded' });
  await showcaseFrame(page);
  // Seed holiday data + force a full watchlist sync so the recording shows
  // live prices and correct holiday status even on a fresh profile.
  try {
    const holData = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', '..', 'market-holidays.json'), 'utf8')
    );
    if (holData && holData.holidays) {
      await page.evaluate((holidays) => {
        chrome.storage.local.set({ marketHolidays: holidays, marketHolidaysFetchedAt: Date.now() });
      }, holData.holidays);
    }
  } catch (e) {
    console.log('Holiday seeding skipped:', e.message);
  }
  try {
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          try {
            chrome.runtime.sendMessage({ type: 'FORCE_SYNC' }, () => resolve(true));
          } catch (e) {
            resolve(false);
          }
        })
    );
  } catch (e) {}
  try {
    await page.waitForFunction(
      () => {
        const el = document.getElementById('wl-items-container');
        return el && !/waiting for sync/i.test(el.textContent || '');
      },
      { timeout: 60000 }
    );
    console.log('Watchlist synced.');
  } catch (e) {
    console.log('Watchlist still syncing — continuing anyway.');
  }
  await caption(page, 'Your live watchlist, right in the side panel', 4200);
  await page.mouse.move(640, 400);
  await page.mouse.wheel(0, 500);
  await sleep(1800);

  // Scene 3 — search + verdict (17-29s)
  await page.locator('#input-search').fill('RELIANCE');
  await sleep(800);
  await page.locator('#btn-search').click();
  try {
    await page.waitForFunction(
      () => {
        const el = document.getElementById('results-search');
        return el && !/scraping|loading/i.test(el.textContent || '');
      },
      { timeout: 15000 }
    );
  } catch (e) {
    console.log('Search results slow — continuing with what is on screen.');
  }
  await caption(page, 'One search: price, ratios and an instant verdict', 5000);

  // Scene 4 — markets (29-38s)
  await page.locator('#tab-markets').click();
  await page.waitForTimeout(3000);
  await caption(page, 'World markets and the economy at a glance', 4500);

  // Scene 5 — news (38-46s)
  await page.locator('#tab-news').click();
  await page.waitForTimeout(2500);
  await caption(page, 'Stock news without ever switching tabs', 4000);

  // Scene 6 — ticker tape on a real site (46-57s)
  await page.goto('https://www.screener.in', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  try {
    await page.waitForSelector('#screener-ticker-tape', { timeout: 20000 });
  } catch (e) {
    console.log('Ticker tape element not detected — continuing.');
  }
  await page.waitForTimeout(1500);
  await caption(page, 'A live ticker tape on every website you visit', 4200);
  await page.mouse.move(640, 300);
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, 350);
    await sleep(900);
  }

  // Scene 7 — end card (57-63s)
  await page.setContent(
    CARD('Ticker <span>Screener</span>', 'Free for Chrome & Firefox — install in one click', 'TRY IT TODAY')
  );
  await caption(page, 'Free for Chrome and Firefox', 4500);

  const videoSrc = await page.video().path().catch(() => null);
  await context.close();
  // Move THIS page's recording (not any stray blank-tab video) to the final name.
  const candidates = [videoSrc].filter(Boolean);
  if (!candidates.length) {
    const files = fs
      .readdirSync(OUT_DIR)
      .filter((f) => f.endsWith('.webm') && f.startsWith('page@'))
      .map((f) => ({ f, t: fs.statSync(path.join(OUT_DIR, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    if (files.length) candidates.push(path.join(OUT_DIR, files[0].f));
  }
  if (candidates.length) {
    const dest = path.join(OUT_DIR, 'promo_video_v2_3.webm');
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
    fs.renameSync(candidates[0], dest);
    const kb = Math.round(fs.statSync(dest).size / 1024);
    console.log('Saved', dest, `(${kb} KB)`);
  }
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
