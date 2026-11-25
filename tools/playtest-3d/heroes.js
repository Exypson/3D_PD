const { chromium } = require('playwright');
const items = ['Gold', 'potions.PotionOfHealing', 'scrolls.ScrollOfUpgrade', 'rings.RingOfAccuracy', 'wands.WandOfMagicMissile', 'weapon.melee.Sword',
  'armor.PlateArmor', 'food.Food', 'bombs.Bomb', 'stones.StoneOfBlink', 'bags.VelvetPouch', 'weapon.melee.WarHammer'];
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { const t = m.text(); if (m.type() === 'error' || /failed|Exception/.test(t)) errors.push(t.slice(0, 200)); });
  await page.goto('http://localhost:8790/?test'); await page.waitForTimeout(9000);
  for (const [x, y, w] of [[480, 408, 4000], [92, 204, 3000], [160, 557, 9000], [480, 403, 3000]]) { await page.mouse.click(x, y); await page.waitForTimeout(w); }
  await page.mouse.move(480, 300);
  for (let i = 0; i < 7; i++) { await page.mouse.wheel(0, -300); await page.waitForTimeout(250); }
  for (const n of items) { await page.evaluate(n => window.__spdDrop(n), n); await page.waitForTimeout(250); }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: __dirname + '/items.png' });
  for (const c of ['MAGE', 'ROGUE', 'HUNTRESS', 'DUELIST', 'CLERIC']) {
    await page.evaluate(c => window.__spdHeroClass(c), c); await page.waitForTimeout(700);
    await page.screenshot({ path: __dirname + `/hero_${c}.png`, clip: { x: 330, y: 150, width: 300, height: 300 } });
  }
  console.log('errors ' + errors.length + ' ' + errors.slice(0, 5).join(' | '));
  await browser.close();
})();
