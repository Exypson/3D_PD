// Headless playtest: accounts, per-user saves, level generation, and a bot run from a start floor to DEMO_MAX_DEPTH.
// Usage: serve web/ (e.g. `python3 -m http.server 8765` inside web/), then `node test/playtest.js [url] [startFloor]`.
const { chromium } = require('playwright');
const assert = require('assert');
const URL = process.argv[2] || 'http://localhost:8765/';
const FROM = Number(process.argv[3] || 1);

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

  // --- generator: exit reachable from entrance through walkable tiles only (no locked/secret doors) ---
  const TO = await page.evaluate(() => DEMO_MAX_DEPTH);
  const unreachable = await page.evaluate(TO => {
    let bad = 0;
    for (let d = 1; d < TO; d++) for (let i = 0; i < (BOSS_DEPTHS[d] ? 0 : 60); i++){
      const L = generateLevel(d), seen = new Uint8Array(L.w*L.h), q = [L.entrance]; seen[L.entrance] = 1;
      while (q.length){ const c = q.pop(); for (const [dx,dy] of DIRS8){ const n = c + dx + dy*L.w;
        if (!seen[n] && TP.pass[L.tiles[n]] && diagOK(L, c % L.w, (c / L.w) | 0, n % L.w, (n / L.w) | 0)){ seen[n] = 1; q.push(n); } } }
      if (!seen[L.exit]) bad++;
      for (const c in L.traps){ const x = c % L.w, y = (c / L.w) | 0; // traps only inside rooms, never corridors
        if (!L.rooms.some(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h)) bad++; }
    }
    return bad;
  }, TO);
  assert.strictEqual(unreachable, 0, 'every generated non-boss floor has a walkable entrance-to-exit path and no corridor traps');
  console.log('generator: ok');

  // --- bot run, FROM to TO (hero made unkillable) ---
  const result = await page.evaluate(async ([FROM, TO]) => {
    const pd = window.__pd, wait = ms => new Promise(r => setTimeout(r, ms));
    if (FROM > 1){ pd.changeLevel('down', FROM); while (pd.G.depth !== FROM || pd.V.busy) await wait(50); }
    const PASS = new Set([2, 3, 6, 7, 8, 9, 10, 11, 12, 16]);
    let steps = 0, lastDepth = 0, stuck = 0, lastPos = '', hops = 0, bad = new Set(), known = 0, dry = false;
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
    while (steps++ < 2500 * (TO - FROM + 1)){
      await wait(15);
      const G = pd.G, L = pd.L, h = G.hero;
      if (G.over) return { ok: false, why: 'died: ' + G.deathCause, depth: G.depth };
      if (!document.getElementById('modal').hidden) pd.UI.closeWindow();
      if (pd.V.busy || pd.V.needProcess) continue;
      h.ht = h.hp = 9999; h.hunger = 0; // bot tests progression, not balance (it ignores telegraphed attacks)
      if (G.depth !== lastDepth){ lastDepth = G.depth; seen.add(G.depth); bad = new Set(); console.log('[bot] floor ' + G.depth + ' at step ' + steps); }
      const k = L.visited.reduce((a, v) => a + v, 0); if (k > known){ known = k; bad.clear(); dry = false; } // new ground: retry blacklisted targets
      const vis = m => pd.V.fov[m.y*L.w + m.x];
      const boss = L.mobs.find(m => !m.dead && MOBS[m.type].boss);
      const foe = L.mobs.find(m => !m.dead && !m.ally && !m.passive && m.type !== 'keeper' && vis(m) && !bad.has(m.y*L.w + m.x) && Math.max(Math.abs(m.x-h.x), Math.abs(m.y-h.y)) <= 6);
      const ex = L.exit % L.w, ey = (L.exit / L.w) | 0;
      if (G.depth === TO && L.bossDefeated && h.x === ex && h.y === ey){
        pd.UI.cellClick(h.x, h.y); await wait(300);
        return { ok: pd.G.depth === TO, why: 'gate', depth: pd.G.depth, boss: true, hops, seen: [...seen] };
      }
      const goal = boss || { x: ex, y: ey };
      let click;
      if (foe) click = [foe.x, foe.y];
      else if (boss && vis(boss) && !bad.has(boss.y*L.w + boss.x)) click = [boss.x, boss.y];
      else if (!boss && L.visited[L.exit]) click = [ex, ey];
      else { const f = frontier(L, goal.x, goal.y); if (f >= 0) click = [f % L.w, (f / L.w) | 0]; }
      if (click) pd.UI.cellClick(click[0], click[1]);
      else { pd.UI.cellClick(h.x, h.y); if (!dry){ dry = true;
          let map = '';
          for (let y = 0; y < L.h; y++){ let r = ''; for (let x = 0; x < L.w; x++){ const c = y*L.w + x, t = L.tiles[c];
            r += (x === h.x && y === h.y) ? '@' : !L.visited[c] ? ' ' : bad.has(c) ? 'x' : (L.traps[c] && !L.traps[c].hidden) ? '^' : '?#.+L5<>~"\',_PsWS:BT'[t]; } map += r.replace(/\s+$/, '') + '\n'; }
          console.log('[bot] nothing reachable to explore on floor ' + G.depth + ', searching\n' + map.replace(/^\n+|\n+$/g, '')); } } // search for secret doors
      const pos = G.depth + ':' + h.time; // no game time passed = the click did nothing
      stuck = pos === lastPos ? stuck + 1 : 0; lastPos = pos;
      if (stuck && click) bad.add(click[1]*L.w + click[0]); // seen but not reachable through explored tiles yet
      if (stuck > 80){ // last resort, counted in the result: hop next to the exit
        hops++; h.x = ex; h.y = ey + (PASS.has(L.tiles[(ey+1)*L.w + ex]) ? 1 : -1); stuck = 0;
        console.log('[bot] hop on floor ' + G.depth + ' clicking ' + JSON.stringify(click) + ' tile ' + (click ? L.tiles[click[1]*L.w + click[0]] : '-') + ' keys ' + JSON.stringify(h.keys) + ' log ' + JSON.stringify(pd.V.log.slice(-2).map(l => l.msg)));
      }
    }
    return { ok: false, why: 'step limit', depth: pd.G.depth, hops, seen: [...seen] };
  }, [FROM, TO]);
  console.log('bot:', JSON.stringify(result));
  await page.screenshot({ path: 'test/last-run.png' });
  assert(result.ok && result.boss, 'bot beat floor ' + TO + '\'s boss and hit the demo gate: ' + JSON.stringify(result));
  assert.strictEqual(result.hops, 0, 'bot never needed the teleport fallback');
  assert.deepStrictEqual(errors, [], 'no console errors');
  console.log('playtest: ok');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
