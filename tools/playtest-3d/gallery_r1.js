const { chromium } = require('playwright');
const batches = [
  ['Rat', 'Albino', 'Gnoll', 'Crab', 'Snake', 'Slime', 'Swarm', 'CausticSlime', 'GreatCrab'],
  ['FetidRat', 'GnollTrickster', 'GnollExile', 'HermitCrab', 'Thief', 'Bandit', 'npcs.Ghost', 'npcs.RatKing', 'Goo'],
];
const _old = [
  ['Gnoll', 'Crab', 'Snake', 'Slime', 'Swarm', 'Albino', 'GnollTrickster', 'Crab', 'Bat', 'Spinner'],
  ['Skeleton', 'Thief', 'DM100', 'Guard', 'Necromancer', 'Brute', 'Shaman$RedShaman', 'Ghoul', 'Monk', 'Warlock'],
  ['Elemental$FireElemental', 'Elemental$FrostElemental', 'Golem', 'Succubus', 'Eye', 'Scorpio', 'Wraith', 'Bee', 'Piranha', 'Statue'],
];
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errors = [];
  for (let b = 0; b < batches.length; b++) {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
    page.on('pageerror', e => errors.push('b' + b + ' ' + e.message));
    page.on('console', m => { const t = m.text(); if (m.type() === 'error' || /failed|Exception/.test(t)) errors.push('b' + b + ' ' + t.slice(0, 200)); });
    await page.goto('http://localhost:8790/?test'); await page.waitForTimeout(9000);
    for (const [x, y, w] of [[480, 408, 4000], [92, 204, 3000], [160, 557, 9000], [480, 403, 3000]]) { await page.mouse.click(x, y); await page.waitForTimeout(w); }
    await page.mouse.move(480, 300);
    for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, -300); await page.waitForTimeout(250); }
    for (const n of batches[b]) { await page.evaluate(n => window.__spdSpawn(n), n); await page.waitForTimeout(300); }
    await page.waitForTimeout(6000);
    await page.screenshot({ path: __dirname + `/gal${b}.png` });
    await page.close();
  }
  console.log('errors ' + errors.length + '\n' + errors.slice(0, 10).join('\n'));
  await browser.close();
})();
