// Modelled things have no name tags; a placeholder-only monster (no model) keeps its tag.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  await page.goto('http://localhost:8790/?test'); await page.waitForTimeout(9000);
  for (const [x, y, w] of [[480, 408, 4000], [92, 204, 3000], [160, 557, 9000], [480, 403, 3000]]) { await page.mouse.click(x, y); await page.waitForTimeout(w); }
  await page.mouse.move(480, 300); for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -300); await page.waitForTimeout(150); }
  for (const a of ['Gnoll', 'Crab', 'Skeleton']) { await page.evaluate(n => window.__spdSpawn(n), a); await page.waitForTimeout(300); }
  for (const d of ['Gold', 'Gold@CHEST', 'weapon.melee.Sword']) { await page.evaluate(n => window.__spdDrop(n), d); await page.waitForTimeout(300); }
  await page.evaluate(() => window.__spdTrap('BurningTrap')); await page.evaluate(() => window.__spdPlant('plants.Firebloom$Seed'));
  await page.waitForTimeout(4000);
  await page.screenshot({ path: __dirname + '/nolabels.png', clip: { x: 180, y: 80, width: 600, height: 440 } });
  console.log('errors', errors.length, errors.join(' | '));
  await browser.close();
})();
