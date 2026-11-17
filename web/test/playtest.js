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
    const PASS = new Set([2, 3, 6, 7, 8, 9, 10, 11, 12, 16]);
    let steps = 0, lastDepth = 0, stuck = 0, lastPos = '', hops = 0, bad = new Set();
    const seen = new Set();
    // nearest explored, walkable cell that borders unexplored space (closest to the goal), skipping cells that failed
    const frontier = (L, tx, ty) => {
      let best = -1, bd = Infinity;
      for (let c = 0; c < L.w*L.h; c++){
        if (!L.visited[c] || !PASS.has(L.tiles[c]) || bad.has(c)) continue;
        const x = c % L.w, y = (c / L.w) | 0;
        if (![[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy]) => !L.visited[(y+dy)*L.w + x+dx])) continue;
        const d = Math.abs(x-tx) + Math.abs(y-ty);
        if (d < bd){ bd = d; best = c; }
      }
      return best;
    };
    while (steps++ < 6000){
      await wait(15);
      const G = pd.G, L = pd.L, h = G.hero;
      if (G.over) return { ok: false, why: 'died: ' + G.deathCause, depth: G.depth };
      if (!document.getElementById('modal').hidden) pd.UI.closeWindow();
      if (pd.V.busy || pd.V.needProcess) continue;
      h.hp = h.ht; h.hunger = 0;
      if (G.depth !== lastDepth){ lastDepth = G.depth; seen.add(G.depth); bad = new Set(); console.log('[bot] floor ' + G.depth + ' at step ' + steps); }
      const vis = m => pd.V.fov[m.y*L.w + m.x];
      const boss = L.mobs.find(m => !m.dead && m.type === 'goo');
      const foe = L.mobs.find(m => !m.dead && !m.ally && !m.passive && m.type !== 'keeper' && vis(m) && Math.max(Math.abs(m.x-h.x), Math.abs(m.y-h.y)) <= 6);
      const ex = L.exit % L.w, ey = (L.exit / L.w) | 0;
      if (G.depth === 5 && L.bossDefeated && h.x === ex && h.y === ey){
        pd.UI.cellClick(h.x, h.y); await wait(300);
        return { ok: pd.G.depth === 5, why: 'gate', depth: pd.G.depth, boss: true, hops, seen: [...seen] };
      }
      const goal = boss || { x: ex, y: ey };
      let click;
      if (foe) click = [foe.x, foe.y];
      else if (boss && vis(boss)) click = [boss.x, boss.y];
      else if (!boss && L.visited[L.exit]) click = [ex, ey];
      else { const f = frontier(L, goal.x, goal.y); if (f >= 0) click = [f % L.w, (f / L.w) | 0]; }
      if (click) pd.UI.cellClick(click[0], click[1]);
      else pd.UI.cellClick(h.x, h.y); // nothing left to explore: search for secret doors
      const pos = G.depth + ':' + h.x + ',' + h.y;
      stuck = pos === lastPos ? stuck + 1 : 0; lastPos = pos;
      if (stuck === 3 && click) bad.add(click[1]*L.w + click[0]);
      if (stuck > 80){ // last resort, counted in the result: hop next to the exit
        hops++; h.x = ex; h.y = ey + (PASS.has(L.tiles[(ey+1)*L.w + ex]) ? 1 : -1); stuck = 0;
        console.log('[bot] hop on floor ' + G.depth);
      }
    }
    return { ok: false, why: 'step limit', depth: pd.G.depth, hops, seen: [...seen] };
  });
  console.log('bot:', JSON.stringify(result));
  await page.screenshot({ path: 'test/last-run.png' });
  assert(result.ok && result.boss, 'bot reached the floor-5 gate after the boss: ' + JSON.stringify(result));
  assert.deepStrictEqual(errors, [], 'no console errors');
  console.log('playtest: ok');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
