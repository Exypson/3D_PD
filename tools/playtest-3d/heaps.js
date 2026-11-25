// Every heap type, then every item class in batches; each heap must end up as a model (file loaded, no errors).
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = __dirname;
const ITEMS = fs.readFileSync(OUT + '/itemclasses.txt', 'utf8').trim().split('\n');
const HEAPS = ['CHEST', 'LOCKED_CHEST', 'CRYSTAL_CHEST', 'TOMB', 'SKELETON', 'REMAINS', 'FOR_SALE'].map(t => 'Gold@' + t);
const batches = [HEAPS];
for (let i = 0; i < ITEMS.length; i += 24) batches.push(ITEMS.slice(i, i + 24));
const only = process.argv[2] ? process.argv[2].split(',').map(Number) : null;
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const loaded = new Set(), errors = [], bad = [], failed = [];
  for (let b = 0; b < batches.length; b++) {
    if (only && !only.includes(b)) continue;
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { const t = m.text(); if (/drop .* failed/.test(t)) failed.push(t.slice(0, 140)); else if (m.type() === 'error' && !/404/.test(t)) errors.push(t.slice(0, 300)); });
    page.on('response', r => { const u = r.url(); if (/models3d\/(items|heaps)/.test(u)) (r.status() === 200 ? loaded.add(u.split('models3d/')[1]) : bad.push(r.status() + ' ' + u)); });
    await page.goto((process.env.BASE || 'http://localhost:8790/') + '?test'); await page.waitForTimeout(9000);
    for (const [x, y, w] of [[480, 408, 4000], [92, 204, 3000], [160, 557, 9000], [480, 403, 3000]]) { await page.mouse.click(x, y); await page.waitForTimeout(w); }
    await page.mouse.move(480, 300);
    for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, -300); await page.waitForTimeout(150); }
    for (const nm of batches[b]) { await page.evaluate(nm => window.__spdDrop(nm), nm); await page.waitForTimeout(120); }
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `${OUT}/heaps_${b}.png` });
    await page.close();
  }
  console.log('loaded', loaded.size, [...loaded].filter(f => f.startsWith('heaps')).sort().join(' '));
  console.log('drop failures', failed.length, failed.slice(0, 8).join(' | '));
  console.log('http errors', bad.length, bad.slice(0, 5).join(' | '));
  console.log('errors', errors.length, errors.slice(0, 5).join(' | '));
  await browser.close();
})();
