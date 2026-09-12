const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const extensionPath = path.join(__dirname, 'screener-extension');
  const outDir = path.join(__dirname, 'store-assets');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  console.log('Launching browser with extension...');
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ],
    recordVideo: {
      dir: outDir,
      size: { width: 1280, height: 720 }
    },
    viewport: { width: 1280, height: 720 }
  });

  // Find the background service worker to get the extension ID
  console.log('Finding extension ID...');
  let [background] = context.serviceWorkers();
  if (!background) {
    background = await context.waitForEvent('serviceworker');
  }
  
  const extensionId = background.url().split('/')[2];
  console.log('Extension ID:', extensionId);

  const page = await context.newPage();
  
  // Navigate to Screener to show the Ticker Tape overlay
  console.log('Navigating to website for floating widget screenshot...');
  try {
    await page.goto('https://www.screener.in', { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    console.log('Navigation took too long, proceeding anyway...');
  }
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(outDir, 'screenshot_4.png') });
  
  // Navigate to Side Panel
  console.log('Navigating to Side Panel...');
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  
  // Wait for UI to load
  await page.waitForTimeout(1000);
  
  // Take screenshot 5 (Side Panel)
  await page.screenshot({ path: path.join(outDir, 'screenshot_5.png') });

  // Record a short video sequence
  console.log('Recording interactions...');
  const input = page.locator('#input-search');
  await input.fill('TATA MOTORS');
  await page.click('#btn-search');
  
  await page.waitForTimeout(4000); // let search complete
  
  const addBtn = page.locator('#btn-search-add-wl');
  if (await addBtn.isVisible()) {
    await addBtn.click();
  }
  
  await page.click('#tab-watchlist');
  await page.waitForTimeout(2000);
  
  // Toggle dark mode
  await page.click('#theme-toggle');
  await page.waitForTimeout(2000);

  // Close context to save video
  await context.close();
  
  console.log('Done! Check store-assets for screenshot_4, screenshot_5, and the webm video.');
})();
