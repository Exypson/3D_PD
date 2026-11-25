// Walk around like a player (taps on the map), grabbing frames every 100 ms around the hero.
const { chromium } = require('playwright');
const OUT = __dirname + '/walk';
(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.argv[2] || 'http://localhost:8790/?test'); await page.waitForTimeout(9000);
  for (const [x, y, w] of [[480, 408, 4000], [92, 204, 3000], [160, 557, 9000], [480, 403, 3000]]) { await page.mouse.click(x, y); await page.waitForTimeout(w); }
  await page.mouse.move(480, 300); for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -300); await page.waitForTimeout(150); }
  await page.waitForTimeout(2000);
  let n = 0;
  const taps = [[300, 380], [650, 250], [480, 450], [330, 220], [620, 420]];
  for (const [x, y] of taps) {
    await page.mouse.click(x, y);
    for (let i = 0; i < 14; i++) { await page.screenshot({ path: `${OUT}/f${String(n++).padStart(3, '0')}.png` }); await page.waitForTimeout(60); }
  }
  console.log('frames', n, 'errors', errors.length, errors.slice(0, 2).join(' | '));
  await browser.close();
})();
