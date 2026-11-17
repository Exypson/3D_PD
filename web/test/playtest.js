// Headless playtest: accounts, per-user saves, and a bot run through floors 1-5.
// Usage: serve web/ (e.g. `python3 -m http.server 8765` inside web/), then `node test/playtest.js [url]`.
const { chromium } = require('playwright');
const assert = require('assert');
const URL = process.argv[2] || 'http://localhost:8765/';

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); else if (m.text().startsWith('[bot]')) console.log(m.text()); });

  const auth = async (u, p, mode) => {
    await page.fill('#authf input[name=u]', u);
    await page.fill('#authf input[name=p]', p);
    await page.click(`#authf button[value=${mode}]`);
  };

  // --- accounts ---
  await page.goto(URL);
  await page.waitForSelector('#authf');
  assert.match(await page.evaluate(() => Auth.signUp('a b', 'secret1').catch(e => e.message)), /Username/);
  assert.match(await page.evaluate(() => Auth.signUp('carol', '123').catch(e => e.message)), /Password/);
  await auth('alice', 'secret1', 'up');
  await page.waitForSelector('#tstart');
  await page.click('#tstart');
  await page.waitForFunction(() => window.__pd.G && !window.__pd.G.over);
  assert(await page.evaluate(() => !!localStorage.getItem('pd3d_save_v1:alice')), 'alice has a save');

  await page.evaluate(() => { Auth.signOut(); location.reload(); });
  await page.waitForSelector('#authf');
  await auth('bob', 'secret2', 'up');
  await page.waitForSelector('#tstart');
  assert(!(await page.$('#tcont')), 'bob does not see alice\'s save');
  await page.click('#tout');
  await page.waitForSelector('#authf');
  await auth('alice', 'wrongpw', 'in');
  await page.waitForFunction(() => document.querySelector('#autherr').textContent.includes('Wrong'));
  await auth('Alice', 'secret1', 'in');
  await page.waitForSelector('#tcont');
  await page.click('#tcont');
  await page.waitForFunction(() => window.__pd.G && !window.__pd.G.over && document.querySelector('#title').hidden);
  console.log('accounts: ok');

  // --- bot run, floors 1-5 (hero kept alive; this tests progression, not balance) ---
  const result = await page.evaluate(async () => {
    const pd = window.__pd, wait = ms => new Promise(r => setTimeout(r, ms));
    let steps = 0, lastDepth = 0, stuck = 0, lastPos = '';
    const seen = new Set();
    while (steps++ < 6000){
      await wait(15);
      const G = pd.G, L = pd.L, h = G.hero;
      if (G.over) return { ok: false, why: 'died: ' + G.deathCause, depth: G.depth };
      if (!document.getElementById('modal').hidden) pd.UI.closeWindow();
      if (pd.V.busy || pd.V.needProcess) continue;
      h.hp = h.ht; h.hunger = 0;
      if (G.depth !== lastDepth){ lastDepth = G.depth; seen.add(G.depth); console.log('[bot] floor ' + G.depth + ' at step ' + steps); }
      const boss = L.mobs.find(m => !m.dead && pd.V && m.type === 'goo');
      const foe = L.mobs.find(m => !m.dead && !m.ally && !m.passive && m.type !== 'keeper' && pd.V.fov[m.y*L.w + m.x] && Math.max(Math.abs(m.x-h.x), Math.abs(m.y-h.y)) <= 6);
      const target = boss || foe;
      if (G.depth === 5 && L.bossDefeated && h.x === L.exit % L.w && h.y === ((L.exit / L.w) | 0)){
        pd.UI.cellClick(h.x, h.y); await wait(300);
        return { ok: pd.G.depth === 5, why: 'gate', depth: pd.G.depth, boss: true, seen: [...seen] };
      }
      if (target && !pd.V.fov[target.y*L.w + target.x]){ // unseen boss: walk to a free tile beside it
        const near = [[0,2],[2,0],[-2,0],[0,-2],[0,1],[1,0],[-1,0],[0,-1]].map(([dx,dy]) => [target.x+dx, target.y+dy])
          .find(([x,y]) => [2,3,8,9,10].includes(L.tiles[y*L.w + x]));
        pd.UI.cellClick(near ? near[0] : target.x, near ? near[1] : target.y);
      }
      else if (target) pd.UI.cellClick(target.x, target.y);
      else pd.UI.cellClick(L.exit % L.w, (L.exit / L.w) | 0);
      const pos = G.depth + ':' + h.x + ',' + h.y;
      stuck = pos === lastPos ? stuck + 1 : 0; lastPos = pos;
      if (stuck > 60){ // e.g. locked door or unreachable target: hop next to the exit
        const ex = L.exit % L.w, ey = (L.exit / L.w) | 0;
        h.x = ex; h.y = ey + (L.tiles[(ey+1)*L.w + ex] === 2 ? 1 : -1); stuck = 0;
      }
    }
    return { ok: false, why: 'step limit', depth: pd.G.depth, seen: [...seen] };
  });
  console.log('bot:', JSON.stringify(result));
  await page.screenshot({ path: 'test/last-run.png' });
  assert(result.ok && result.boss, 'bot reached the floor-5 gate after the boss: ' + JSON.stringify(result));
  assert.deepStrictEqual(errors, [], 'no console errors');
  console.log('playtest: ok');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
