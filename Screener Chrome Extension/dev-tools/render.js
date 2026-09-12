const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const svgContent = `<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <path d="M64 12 L116 64 L84 64 L84 116 L44 116 L44 64 L12 64 Z" fill="#4caf50" stroke="#1b5e20" stroke-width="4" stroke-linejoin="round"/>
</svg>`;

  await page.setContent(`
    <style>body{margin:0;padding:0;background:transparent;}</style>
    <div id="icon" style="width:128px;height:128px;">${svgContent}</div>
  `);
  
  const element = await page.locator('#icon');
  await element.screenshot({ path: 'icon_128.png', omitBackground: true });
  
  await browser.close();
  console.log('Saved transparent bold arrow icon');
})();
