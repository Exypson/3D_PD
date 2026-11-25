// Close-up frames of the hero fighting a rat plus sleeping monsters nearby.
const { chromium } = require('playwright');
const OUT = __dirname + '/fight';
(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
  await page.goto(process.argv[2] || 'http://localhost:8790/?test'); await page.waitForTimeout(9000);
  for (const [x, y, w] of [[480, 408, 4000], [92, 204, 3000], [160, 557, 9000], [480, 403, 3000]]) { await page.mouse.click(x, y); await page.waitForTimeout(w); }
  await page.mouse.move(480, 300); for (let i = 0; i < 14; i++) { await page.mouse.wheel(0, -300); await page.waitForTimeout(120); }
  await page.evaluate(() => window.__spdSpawn('Gnoll')); await page.waitForTimeout(500);
  await page.evaluate(() => window.__spdSpawnRat()); await page.waitForTimeout(400);
  let n = 0;
  for (let i = 0; i < 30; i++) { await page.screenshot({ path: `${OUT}/f${String(n++).padStart(2, '0')}.png`, clip: { x: 280, y: 120, width: 400, height: 360 } }); await page.waitForTimeout(90); }
  await browser.close();
})();
