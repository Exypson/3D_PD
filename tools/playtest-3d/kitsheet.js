// Close-up of up to K cells of every terrain type present on depths 1..N, as one contact sheet per depth.
const { chromium } = require('playwright');
const OUT = __dirname, DEPTHS = +(process.argv[3] || 1), K = 2;
const NAMES = ["CHASM","EMPTY","GRASS","EMPTY_WELL","WALL","DOOR","OPEN_DOOR","ENTRANCE","EXIT","EMBERS","LOCKED_DOOR","PEDESTAL","WALL_DECO","BARRICADE","EMPTY_SP","HIGH_GRASS","SECRET_DOOR","SECRET_TRAP","TRAP","INACTIVE_TRAP","EMPTY_DECO","LOCKED_EXIT","UNLOCKED_EXIT","CUSTOM_DECO","WELL","STATUE","STATUE_SP","BOOKSHELF","ALCHEMY","WATER","FURROWED_GRASS","CRYSTAL_DOOR","CUSTOM_DECO_EMPTY","REGION_DECO","REGION_DECO_ALT","MINE_CRYSTAL","MINE_BOULDER","ENTRANCE_SP","HERO_LKD_DR","CUSTOM_DECO_WTR"];
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text().slice(0, 300)); });
  await page.goto(process.argv[2] || 'http://localhost:8790/?test'); await page.waitForTimeout(9000);
  for (const [x, y, w] of [[480, 408, 4000], [92, 204, 3000], [160, 557, 9000], [480, 403, 3000]]) { await page.mouse.click(x, y); await page.waitForTimeout(w); }
  await page.mouse.move(480, 300);
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -300); await page.waitForTimeout(200); }
  for (let d = 1; d <= DEPTHS; d++) {
    if (d > 1) { await page.evaluate(() => window.__spdDescend()); await page.waitForTimeout(7000); }
    await page.evaluate(() => window.__spdReveal()); await page.waitForTimeout(3000);
    const shots = [];
    for (let t = 0; t < NAMES.length; t++) {
      const cells = (await page.evaluate(t => window.__spdCells('' + t), t)).split(',').filter(Boolean).map(Number);
      if (!cells.length) continue;
      // spread the picks over the level
      for (let k = 0; k < Math.min(K, cells.length); k++) {
        const c = cells[Math.floor(k * cells.length / K)];
        await page.evaluate(c => window.__spdLook('' + c), c); await page.waitForTimeout(700);
        const f = `${OUT}/sheet/d${d}_${NAMES[t]}_${c}.png`;
        await page.screenshot({ path: f, clip: { x: 330, y: 150, width: 300, height: 300 } });
        shots.push(f);
      }
    }
    console.log(`depth ${d}: ${shots.length} shots, kit ${await page.evaluate(() => window.__spdKitStats())}`);
  }
  console.log('errors', errors.length, errors.slice(0, 3).join(' | '));
  await browser.close();
})();
