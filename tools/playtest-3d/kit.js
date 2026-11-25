// Tile kit check: per depth 1..N, coverage stats, FPS, screenshots (hero view + revealed overview).
const { chromium } = require('playwright');
const OUT = __dirname, DEPTHS = +(process.argv[3] || 5);
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = [], bad = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text().slice(0, 300)); });
  page.on('response', r => { if (r.status() >= 400 && !/char_Ghost\.glb/.test(r.url())) bad.push(r.status() + ' ' + r.url()); });
  await page.goto(process.argv[2] || 'http://localhost:8790/?test'); await page.waitForTimeout(9000);
  for (const [x, y, w] of [[480, 408, 4000], [92, 204, 3000], [160, 557, 9000], [480, 403, 3000]]) { await page.mouse.click(x, y); await page.waitForTimeout(w); }
  const fps = () => page.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(Math.round(n / 2)); }; requestAnimationFrame(f); }));
  for (let d = 1; d <= DEPTHS; d++) {
    if (d > 1) { await page.evaluate(() => window.__spdDescend()); await page.waitForTimeout(7000); }
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/kit_d${d}_hero.png` });
    const f1 = await fps();
    await page.evaluate(() => window.__spdReveal()); await page.waitForTimeout(3000);
    await page.mouse.move(480, 300);
    for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 300); await page.waitForTimeout(200); }
    await page.waitForTimeout(2500);
    const stats = await page.evaluate(() => window.__spdKitStats());
    const f2 = await fps();
    await page.screenshot({ path: `${OUT}/kit_d${d}_all.png` });
    for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -300); await page.waitForTimeout(150); }
    console.log(`depth ${d}: kit ${stats} | fps hero ${f1}, overview ${f2}`);
  }
  console.log('http errors', bad.length, bad.slice(0, 5).join(' | '));
  console.log('errors', errors.length, errors.slice(0, 3).join(' | '));
  await browser.close();
})();
