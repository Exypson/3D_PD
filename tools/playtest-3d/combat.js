const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8790/?test';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = [], game = [];
  page.on('console', m => { const t = m.text(); if (/GPU stall|Controllers:/.test(t)) return; if (m.type() === 'error' || /Fatal|Exception/.test(t)) errors.push(t.slice(0, 400)); else if (t.startsWith('GAME:')) game.push(t.slice(6, 120)); });
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  await page.goto(URL); await page.waitForTimeout(9000);
  for (const [x, y, w] of [[480, 408, 4000], [92, 204, 3000], [160, 557, 9000], [480, 403, 3000]]) { await page.mouse.click(x, y); await page.waitForTimeout(w); }
  console.log('hook:', await page.evaluate(() => typeof window.__spdSpawnRat));
  let shot = 0;
  for (let round = 0; round < 3; round++) {
    await page.evaluate(() => window.__spdSpawnRat()); await page.waitForTimeout(800);
    await page.screenshot({ path: __dirname + `/combat${shot++}.png` });
    for (let i = 0; i < 4; i++) for (const k of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Numpad7', 'Numpad9', 'Numpad1', 'Numpad3']) {
      await page.keyboard.press(k); await page.waitForTimeout(120);
      if (/hit|bite|miss|defeat|kill|slain/i.test(game.join(' ')) && shot < 10 && Math.random() < 0.2) await page.screenshot({ path: __dirname + `/combat${shot++}.png` });
    }
  }
  console.log('ERRORS ' + errors.length + '\n' + errors.slice(0, 5).join('\n'));
  console.log('GAME LOG (' + game.length + ')\n' + game.slice(-15).join('\n'));
  await browser.close();
})();
