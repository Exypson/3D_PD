const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = [], models = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('request', r => { if (/models3d/.test(r.url())) models.push(r.url()); });
  await page.goto(process.argv[2]); await page.waitForTimeout(9000);
  for (const [x, y, w] of [[480, 408, 4000], [92, 204, 3000], [160, 557, 9000], [480, 403, 3000]]) { await page.mouse.click(x, y); await page.waitForTimeout(w); }
  for (let i = 0; i < 6; i++) { await page.mouse.click(300 + i * 60, 250); await page.waitForTimeout(800); }
  await page.screenshot({ path: __dirname + '/twod.png' });
  console.log('2d: model requests', models.length, '| errors', errors.length, errors.slice(0, 3).join(' | '));
  await browser.close();
})();
