// Boot to the dungeon in Firefox; prints page errors and WebGL/shader console output.
const { firefox } = require('playwright');
(async () => {
  const browser = await firefox.launch({ headless: false, firefoxUserPrefs: { 'webgl.force-enabled': true } });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0, 600)));
  page.on('console', m => { if (m.type() === 'error' || /rror|xception|shader|WebGL/i.test(m.text())) console.log('console', m.type(), m.text().slice(0, 600)); });
  await page.goto(process.argv[2] || 'http://localhost:8790/'); await page.waitForTimeout(15000);
  await page.screenshot({ path: __dirname + '/ff1.png' });
  for (const [x, y, w] of [[480, 408, 5000], [92, 204, 4000], [160, 557, 10000], [480, 403, 6000]]) { await page.mouse.click(x, y); await page.waitForTimeout(w); }
  await page.screenshot({ path: __dirname + '/ff2.png' });
  await browser.close();
})().catch(e => console.log('FAIL', e.message.slice(0, 500)));
