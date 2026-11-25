const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const t00 = Date.now(); const reqs = [];
  page.on('request', r => { if (/models3d|music/.test(r.url())) reqs.push(((Date.now() - t00) / 1000).toFixed(1) + ' ' + r.url().split('/assets/')[1]); });
  await page.route(/models3d/, async r => { await new Promise(f => setTimeout(f, +(process.env.LAT || 800))); await r.continue(); });
  await page.goto('http://localhost:8790/?test'); await page.waitForTimeout(9000);
  for (const [x, y, w] of [[480, 408, 4000], [92, 204, 3000]]) { await page.mouse.click(x, y); await page.waitForTimeout(w); }
  await page.mouse.click(160, 557); await page.waitForTimeout(6000); await page.mouse.click(480, 403);
  const t0 = Date.now(); const tt = t0 - t00; console.log('enter at', (tt / 1000).toFixed(1)); let last = '';
  while (Date.now() - t0 < 16000) {
    const k = await page.evaluate(() => window.__spdKitStats && window.__spdKitStats());
    if (k !== last) { console.log(((Date.now() - t0) / 1000).toFixed(1) + 's', k); last = k; }
    await page.waitForTimeout(100);
  }
  await page.screenshot({ path: __dirname + '/entry2.png' });
  console.log('requests in order:'); reqs.slice(0, 40).forEach(r => console.log('  ' + r));
  await browser.close();
})();
