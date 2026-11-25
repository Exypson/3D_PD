// Fresh run, then N random moves by keyboard; prints errors and game log lines, screenshots every 150 moves.
const { chromium } = require('playwright');
const N = Number(process.argv[2] || 600);
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = [], game = [];
  page.on('console', m => { const t = m.text(); if (/GPU stall|Controllers:/.test(t)) return; if (m.type() === 'error' || /Fatal|Exception/.test(t)) errors.push(t.slice(0, 4000)); else if (t.startsWith('GAME:')) game.push(t.slice(6, 120)); });
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 6).join(' | ')));
  await page.goto('http://localhost:8790/'); await page.waitForTimeout(9000);
  for (const [x, y, w] of [[480, 408, 4000], [92, 204, 3000], [160, 557, 9000], [480, 403, 3000]]) { await page.mouse.click(x, y); await page.waitForTimeout(w); }
  const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Numpad7', 'Numpad9', 'Numpad1', 'Numpad3'];
  let k = keys[0];
  for (let i = 1; i <= N; i++) {
    if (Math.random() < 0.25) k = keys[Math.floor(Math.random() * keys.length)]; // keep heading a while, so it gets out of rooms
    if (i % 20 === 0) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
    if (i % 7 === 0) { await page.mouse.click(330 + Math.random() * 300, 200 + Math.random() * 250); await page.waitForTimeout(600); }
    else { await page.keyboard.press(k); await page.waitForTimeout(90); }
    if (i % 150 === 0) await page.screenshot({ path: __dirname + `/fuzz${i}.png` });
    if (errors.length > 5) break;
  }
  console.log('ERRORS ' + errors.length + '\n' + errors.slice(0, 8).join('\n'));
  console.log('GAME LOG (' + game.length + ')\n' + [...new Set(game)].slice(-25).join('\n'));
  await browser.close();
})();
