const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = []; page.on('response', r => { if (r.url().includes('models3d')) console.log(r.status(), r.url().split('models3d/')[1]); });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); if (m.text().includes('[labels]')) console.log(m.text()); });
  await page.goto(process.argv[2] || 'http://localhost:8790/?test'); await page.waitForTimeout(9000);
  for (const [x, y, w] of [[480, 408, 4000], [92, 204, 3000], [160, 557, 9000], [480, 403, 3000]]) { await page.mouse.click(x, y); await page.waitForTimeout(w); }
  await page.mouse.move(480, 300);
  for (let i = 0; i < 16; i++) { await page.mouse.wheel(0, -300); await page.waitForTimeout(300); }
  await page.evaluate(() => window.__spdSpawnRat()); await page.waitForTimeout(1500);
  await page.screenshot({ path: __dirname + '/side1.png' });
  await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(250);
  await page.screenshot({ path: __dirname + '/side2.png' });
  console.log('errors', errors.length, errors.slice(0, 3).join(' | '));
  await browser.close();
})();
