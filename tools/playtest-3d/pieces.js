// Descends depths 1..5 listing set pieces; close-ups of each piece. Retries new runs until a Rat King room was seen.
const { chromium } = require('playwright');
const OUT = __dirname, TRIES = +(process.argv[2] || 4);
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errors = [], bad = [], seen = {};
  for (let run = 0; run < TRIES && !(seen['RatKingRoom.RatKingRoomDeco'] && seen['GooBossRoom.GooNest']); run++) {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text().slice(0, 300)); });
    page.on('response', r => { if (r.status() >= 400 && !/char_Ghost\.glb|setpiece_GooBossRoom\.GooNest\.glb/.test(r.url())) bad.push(r.status() + ' ' + r.url()); });
    await page.goto('http://localhost:8790/?test'); await page.waitForTimeout(9000);
    for (const [x, y, w] of [[480, 408, 4000], [92, 204, 3000], [160, 557, 9000], [480, 403, 3000]]) { await page.mouse.click(x, y); await page.waitForTimeout(w); }
    await page.mouse.move(480, 300);
    for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -300); await page.waitForTimeout(150); }
    for (let d = 1; d <= 5; d++) {
      if (d > 1) { await page.evaluate(() => window.__spdDescend()); await page.waitForTimeout(7000); }
      if (run > 0 && d === 5 && seen['GooBossRoom.GooNest']) break;
      await page.evaluate(() => window.__spdReveal()); await page.waitForTimeout(2500);
      const list = (await page.evaluate(() => window.__spdPieces())).split(',').filter(Boolean);
      const stats = await page.evaluate(() => window.__spdKitStats());
      console.log(`run ${run} depth ${d}: ${list.join(' ') || '-'} | kit ${stats}`);
      for (const p of list) {
        const [name, cell] = p.split('@');
        if ((seen[name] = (seen[name] || 0) + 1) > 2) continue;
        await page.evaluate(c => window.__spdLook(c), cell); await page.waitForTimeout(1200);
        await page.screenshot({ path: `${OUT}/piece_${name}_${run}_${d}.png`, clip: { x: 230, y: 80, width: 500, height: 440 } });
      }
    }
    await page.close();
  }
  console.log('seen', JSON.stringify(seen));
  console.log('http errors', bad.length, bad.slice(0, 5).join(' | '));
  console.log('errors', errors.length, errors.slice(0, 3).join(' | '));
  await browser.close();
})();
