// Step pace (ms per tile) and walk-clip restarts during tap-to-travel walks.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  await page.goto(process.argv[2] || 'http://localhost:8790/?test'); await page.waitForTimeout(9000);
  for (const [x, y, w] of [[480, 408, 4000], [92, 204, 3000], [160, 557, 9000], [480, 403, 3000]]) { await page.mouse.click(x, y); await page.waitForTimeout(w); }
  const W = 32; const st = async () => { const m = (await page.evaluate(() => window.__spdPlaceholders())).match(/hero=(\d+) heroClips=(\d+)/); return [+m[1], +m[2]]; };
  const cells = []; for (const t of [1, 14, 20]) cells.push(...(await page.evaluate(t => window.__spdCells(t + 'v'), t)).split(',').filter(Boolean).map(Number));
  const steps = [], walks = [];
  for (let k = 0; k < 6; k++) {
    let [pos, clips0] = await st();
    const far = cells.filter(c => Math.max(Math.abs(c % W - pos % W), Math.abs((c / W | 0) - (pos / W | 0))) >= 3 && Math.max(Math.abs(c % W - pos % W), Math.abs((c / W | 0) - (pos / W | 0))) <= 8)[k] || cells[k * 3];
    await page.evaluate(c => window.__spdTap('' + c), far);
    let last = Date.now(), lastPos = pos, moved = 0, still = 0;
    while (still < 40) {
      const [p] = await st();
      if (p !== lastPos) { const now = Date.now(); if (moved > 0) steps.push(now - last); last = now; lastPos = p; moved++; still = 0; } else still++;
      await page.waitForTimeout(25);
    }
    const [, clips1] = await st();
    walks.push(`${moved} tiles, ${clips1 - clips0} clip starts`);
  }
  await page.screenshot({ path: __dirname + '/pace_end.png' });
  steps.sort((a, b) => a - b);
  console.log('ms per tile: median', steps[steps.length >> 1], 'p10', steps[Math.floor(steps.length * 0.1)], 'p90', steps[Math.floor(steps.length * 0.9)], 'n', steps.length);
  console.log('walks:', walks.join(' | '));
  await browser.close();
})();
