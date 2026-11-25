// Places every trap (active + used) and every plant in batches next to the hero; checks each expected model file loads.
const { chromium } = require('playwright');
const OUT = __dirname;
const TRAPS = 'AlarmTrap BlazingTrap BurningTrap ChillingTrap ConfusionTrap CorrosionTrap CursingTrap DisarmingTrap DisintegrationTrap DistortionTrap ExplosiveTrap FlashingTrap FlockTrap FrostTrap GatewayTrap GeyserTrap GnollRockfallTrap GrimTrap GrippingTrap GuardianTrap OozeTrap PitfallTrap PoisonDartTrap RockfallTrap ShockingTrap StormTrap SummoningTrap TeleportationTrap TenguDartTrap ToxicTrap WarpingTrap WeakeningTrap WornDartTrap'.split(' ');
const PLANTS = 'BlandfruitBush Blindweed Earthroot Fadeleaf Firebloom Icecap Mageroyal Rotberry Sorrowmoss Starflower Stormvine Sungrass Swiftthistle'.split(' ').map(p => `plants.${p}$Seed`)
  .concat(['items.wands.WandOfRegrowth$Dewcatcher$Seed', 'items.wands.WandOfRegrowth$Seedpod$Seed']);
const batches = [];
for (let i = 0; i < TRAPS.length; i += 11) batches.push(['trap', TRAPS.slice(i, i + 11)]);
for (let i = 0; i < TRAPS.length; i += 11) batches.push(['trap', TRAPS.slice(i, i + 11).map(t => t + '!')]);
batches.push(['plant', PLANTS.slice(0, 8)], ['plant', PLANTS.slice(8)]);
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  let n = 0; const loaded = new Set(), errors = [], bad = [];
  for (const [kind, names] of batches) {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text().slice(0, 300)); if (/failed:/.test(m.text())) errors.push(m.text()); });
    page.on('response', r => { const u = r.url(); if (/models3d\/(traps|plants)/.test(u)) (r.status() === 200 ? loaded.add(u.split('models3d/')[1]) : bad.push(r.status() + ' ' + u)); });
    await page.goto((process.env.BASE || 'http://localhost:8790/') + '?test'); await page.waitForTimeout(9000);
    for (const [x, y, w] of [[480, 408, 4000], [92, 204, 3000], [160, 557, 9000], [480, 403, 3000]]) { await page.mouse.click(x, y); await page.waitForTimeout(w); }
    await page.mouse.move(480, 300);
    for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -300); await page.waitForTimeout(150); }
    for (const nm of names) { await page.evaluate(([k, nm]) => k === 'trap' ? window.__spdTrap(nm) : window.__spdPlant(nm), [kind, nm]); await page.waitForTimeout(150); }
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${OUT}/props_${n++}.png` });
    await page.close();
  }
  console.log('loaded', loaded.size, [...loaded].sort().join(' '));
  console.log('http errors', bad.length, bad.slice(0, 5).join(' | '));
  console.log('errors', errors.length, errors.slice(0, 5).join(' | '));
  await browser.close();
})();
