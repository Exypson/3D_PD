// 4 s CPU profile of the renderer thread at the start position; top self-time functions + idle share.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  await page.goto(process.argv[2]); await page.waitForTimeout(9000);
  for (const [x, y, w] of [[480, 408, 4000], [92, 204, 3000], [160, 557, 9000], [480, 403, 3000]]) { await page.mouse.click(x, y); await page.waitForTimeout(w); }
  await page.waitForTimeout(3000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start');
  await page.waitForTimeout(4000);
  const { profile } = await cdp.send('Profiler.stop');
  const self = {}; const dt = {}; const byId = {};
  profile.nodes.forEach(n => byId[n.id] = n);
  const counts = {}; profile.samples.forEach(s => counts[s] = (counts[s] || 0) + 1);
  let total = 0;
  for (const id in counts) { const n = byId[id]; const k = n.callFrame.functionName || '(anon)'; self[k] = (self[k] || 0) + counts[id]; total += counts[id]; }
  const top = Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, 18);
  console.log('samples', total); top.forEach(([k, v]) => console.log((100 * v / total).toFixed(1) + '%', k));
  await browser.close();
})();
