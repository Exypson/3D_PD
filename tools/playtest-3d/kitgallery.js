// Paints every terrain id (0..39) next to the hero in batches; checks each kit file loads; plus the Ratmogrify Rat King.
const { chromium } = require('playwright');
const OUT = __dirname;
const batches = [[0, 1, 2, 3, 5, 6, 7, 8], [9, 10, 11, 13, 14, 15, 17, 18], [19, 20, 21, 22, 24, 25, 26, 28], [29, 30, 31, 32, 33, 34, 37, 38], [4, 12, 16, 27, 23, 39, 35, 36]];
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const loaded = new Set(), errors = [], bad = [];
  let n = 0;
  for (const ids of batches.concat([['ratking']])) {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text().slice(0, 300)); if (/failed:/.test(m.text())) errors.push(m.text()); });
    page.on('response', r => { const u = r.url(); if (/models3d\/(tiles|characters)/.test(u)) (r.status() === 200 ? loaded.add(u.split('models3d/')[1]) : (!/char_Ghost\.glb/.test(u) && bad.push(r.status() + ' ' + u))); });
    await page.goto('http://localhost:8790/?test'); await page.waitForTimeout(9000);
    for (const [x, y, w] of [[480, 408, 4000], [92, 204, 3000], [160, 557, 9000], [480, 403, 3000]]) { await page.mouse.click(x, y); await page.waitForTimeout(w); }
    await page.mouse.move(480, 300);
    for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -300); await page.waitForTimeout(150); }
    if (ids[0] === 'ratking') {
      await page.evaluate(() => window.__spdSpawn('npcs.RatKing')); await page.waitForTimeout(2500);
      await page.screenshot({ path: `${OUT}/ratking_plain.png`, clip: { x: 230, y: 100, width: 500, height: 400 } });
      await page.evaluate(() => window.__spdArmorAbility('Ratmogrify')); await page.waitForTimeout(2500);
      await page.screenshot({ path: `${OUT}/ratking_ratmogrify.png`, clip: { x: 230, y: 100, width: 500, height: 400 } });
    } else {
      for (const id of ids) { await page.evaluate(id => window.__spdTerrain('' + id), id); await page.waitForTimeout(150); }
      await page.waitForTimeout(3500);
      await page.screenshot({ path: `${OUT}/kitgal_${n++}.png`, clip: { x: 230, y: 100, width: 500, height: 400 } });
    }
    await page.close();
  }
  const tiles = [...loaded].filter(f => f.startsWith('tiles/'));
  console.log('tile files loaded', tiles.length, '| characters', [...loaded].filter(f => f.startsWith('characters/')).join(' '));
  const all = require('fs').readdirSync('/home/user/3D_PD/core/src/main/assets/models3d/tiles/sewers').filter(f => f.endsWith('.glb'));
  console.log('never loaded:', all.filter(f => !tiles.includes('tiles/sewers/' + f)).join(' ') || 'none');
  console.log('http errors', bad.length, bad.slice(0, 5).join(' | '));
  console.log('errors', errors.length, errors.slice(0, 5).join(' | '));
  await browser.close();
})();
