// Tile centring at spawn, health bar over a hit rat, 4-item piles rolling over, items shrinking under the hero.
const { chromium } = require('playwright');
const OUT = __dirname + '/verify';
(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  await page.goto(process.argv[2] || 'http://localhost:8790/?test'); await page.waitForTimeout(9000);
  for (const [x, y, w] of [[480, 408, 4000], [92, 204, 3000], [160, 557, 9000], [480, 403, 3000]]) { await page.mouse.click(x, y); await page.waitForTimeout(w); }
  await page.mouse.move(480, 300); for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, -300); await page.waitForTimeout(120); }
  await page.waitForTimeout(2500);
  const shot = n => page.screenshot({ path: `${OUT}/${n}.png`, clip: { x: 240, y: 110, width: 480, height: 380 } });
  await shot('1_spawn');
  const W = 32;
  const hero = async () => +(await page.evaluate(() => window.__spdPlaceholders())).match(/hero=(\d+)/)[1];
  const floor = new Set(); for (const t of [1, 2, 14, 20, 9]) (await page.evaluate(t => window.__spdCells(t + 'v'), '' + t)).split(',').filter(Boolean).forEach(c => floor.add(+c));
  // rat: spawned on the first free neighbour in PathFinder.NEIGHBOURS8 order
  let h = await hero();
  const N8 = [-W - 1, -W, -W + 1, -1, 1, W - 1, W, W + 1];
  const ratCell = N8.map(d => h + d).find(c => floor.has(c) || [7].includes(c));
  await page.evaluate(() => window.__spdSpawnRat()); await page.waitForTimeout(600);
  for (let i = 0; i < 3; i++) { await page.evaluate(c => window.__spdTap('' + c), ratCell); await page.waitForTimeout(700); }
  await shot('2_hit_rat');
  await page.waitForTimeout(4000);
  // six items onto one floor cell two steps from the hero
  h = await hero();
  const d2 = c => Math.max(Math.abs(c % W - h % W), Math.abs((c / W | 0) - (h / W | 0)));
  const pile = [...floor].filter(c => d2(c) === 2 && c !== ratCell).sort((a, b) => N8.filter(d => floor.has(b + d)).length - N8.filter(d => floor.has(a + d)).length)[0];
  for (const it of ['food.Food', 'potions.PotionOfHealing', 'scrolls.ScrollOfIdentify', 'Gold', 'weapon.melee.Sword', 'Torch'])
    { await page.evaluate(n => window.__spdDrop(n), it + '#' + pile); await page.waitForTimeout(400); }
  await page.waitForTimeout(1500);
  await shot('3_pile');
  await page.evaluate(c => window.__spdTap('' + c), pile); await page.waitForTimeout(2500);
  await shot('4_on_pile');
  console.log('hero', h, 'rat', ratCell, 'pile', pile, 'errors', errors.length, errors.slice(0, 3).join(' | '));
  await browser.close();
})();
