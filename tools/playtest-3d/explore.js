// Plays by tapping far explored floor cells (fighting what it meets), sampling placeholder counts every 100 ms.
const { chromium } = require('playwright');
const OUT = __dirname + '/explore';
(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  if (process.env.LATENCY) await page.route(/models3d/, async r => { await new Promise(f => setTimeout(f, +process.env.LATENCY)); await r.continue(); });
  await page.goto(process.argv[2] || 'http://localhost:8790/?test'); await page.waitForTimeout(9000);
  for (const [x, y, w] of [[480, 408, 4000], [92, 204, 3000], [160, 557, 9000], [480, 403, 3000]]) { await page.mouse.click(x, y); await page.waitForTimeout(w); }
  await page.mouse.move(480, 300); for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -300); await page.waitForTimeout(150); }
  if (process.argv[4] === 'reveal') { await page.evaluate(() => window.__spdReveal()); await page.waitForTimeout(2000); }
  const seen = {}; let samples = 0, withStandIns = 0, shots = 0;
  const EMPTYISH = [1, 2, 9, 14, 15, 20, 30, 6];
  for (let step = 0; step < +(process.argv[3] || 40); step++) {
    // pick a random explored passable-looking cell
    const cells = [];
    for (const t of EMPTYISH) cells.push(...(await page.evaluate(t => window.__spdCells(t + 'v'), t)).split(',').filter(Boolean).map(Number));
    const doors = (await page.evaluate(() => window.__spdCells('5v'))).split(',').filter(Boolean).map(Number);
    const pool = doors.length && Math.random() < 0.6 ? doors : cells;
    const target = pool[Math.floor(Math.random() * pool.length)];
    await page.evaluate(c => window.__spdTap('' + c), target);
    if (step < 0) { await page.waitForTimeout(1500); await page.screenshot({ path: OUT + '/step' + step + '.png' }); console.log('tap', target, 'doors', doors.join(' ')); }
    for (let i = 0; i < 25; i++) {
      const p = await page.evaluate(() => window.__spdPlaceholders());
      samples++;
      const m = p.match(/plainCells=(\d+) standIns=\[(.*)\]/);
      if (m && (m[1] !== '0' || m[2] !== '')) {
        withStandIns++; seen[p] = (seen[p] || 0) + 1;
        if (shots < 8 && withStandIns % 4 === 1) await page.screenshot({ path: `${OUT}/s${shots++}.png` });
      }
      await page.waitForTimeout(100);
    }
  }
  await page.screenshot({ path: OUT + '/end.png' });
  console.log('samples', samples, 'with placeholders', withStandIns);
  Object.entries(seen).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, v]) => console.log(v, k));
  console.log('kit', await page.evaluate(() => window.__spdKitStats()), 'errors', errors.length, errors.slice(0, 2).join(' | '));
  await browser.close();
})();
