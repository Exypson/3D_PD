// Tight close-ups of given terrain ids (all cells, up to 6) on depth 1.
const { chromium } = require('playwright');
const OUT = __dirname, IDS = (process.argv[3] || '5,29,0').split(',');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  await page.goto(process.argv[2]); await page.waitForTimeout(9000);
  for (const [x, y, w] of [[480, 408, 4000], [92, 204, 3000], [160, 557, 9000], [480, 403, 3000]]) { await page.mouse.click(x, y); await page.waitForTimeout(w); }
  await page.mouse.move(480, 300);
  for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, -300); await page.waitForTimeout(150); }
  await page.evaluate(() => window.__spdReveal()); await page.waitForTimeout(2500);
  for (const id of IDS) {
    const cells = (await page.evaluate(t => window.__spdCells(t), id)).split(',').filter(Boolean).map(Number);
    for (const c of cells.slice(0, 6)) {
      await page.evaluate(c => window.__spdLook('' + c), c); await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/zoom/t${id}_${c}.png`, clip: { x: 280, y: 100, width: 400, height: 400 } });
    }
  }
  await browser.close();
})();
