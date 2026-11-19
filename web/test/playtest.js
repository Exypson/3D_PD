// Headless playtest: accounts, per-user saves, level generation, every game system (classes, abilities, attacks,
// monsters, bosses, traps, items, shop, save/load, hunger, level-up, secrets, death), then a bot run to DEMO_MAX_DEPTH.
// Usage: serve web/ (e.g. `python3 -m http.server 8765` inside web/), then `node test/playtest.js [url] [startFloor] [walk]`.
const { chromium } = require('playwright');
const assert = require('assert');
const URL = process.argv[2] || 'http://localhost:8765/';
const FROM = Number(process.argv[3] || 1);
const WALK = process.argv[4] === 'walk'; // walk-only: monsters are cleared, the bot just explores and takes the stairs

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
  await page.evaluate(() => { saveGame(); showTitle(); });                     // menu: "Save and return to title"
  await page.click('#tout');
  await page.waitForSelector('#authf');
  await auth('bob', 'secret2', 'in');
  await page.waitForSelector('#tstart');
  const bobBefore = await page.evaluate(() => localStorage.getItem('pd3d_save_v1:bob'));
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));     // closing the tab auto-saves
  assert.strictEqual(await page.evaluate(() => localStorage.getItem('pd3d_save_v1:bob')), bobBefore, 'a signed-out player\'s run is never saved into the next player\'s slot');
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

  // --- systems: every class + ability, attacks, monsters, bosses, traps, items, shop, save/load, hunger, level-up, secrets, death ---
  const sys = await page.evaluate(async (TO) => {
    const pd = window.__pd, wait = ms => new Promise(r => setTimeout(r, ms));
    const passed = [], failed = [];
    const check = (name, ok, info) => (ok ? passed : failed).push(ok ? name : name + ' :: ' + JSON.stringify(info === undefined ? '' : info));
    const section = async (name, fn) => { try { await fn(); } catch (e) { failed.push(name + ' threw: ' + (e && e.stack || e)); } };
    const modal = () => !document.getElementById('modal').hidden;
    const ready = async () => { for (let i = 0; i < 600 && (pd.V.busy || pd.V.needProcess); i++) await wait(15); if (modal()) pd.UI.closeWindow(); };
    const god = () => { const h = pd.G.hero; h.ht = Math.max(h.ht, 9999); h.hp = h.ht; h.hunger = 0; for (const k of ['para','frozen','rooted','sleep','charm','terror','amok']) delete h.buffs[k]; };
    const clearBlobs = () => { for (const k of ['fire','toxic','para','frost']) pd.L[k].fill(0); pd.L.web.fill(0); pd.V.blobDirty = true; };
    const doAct = async (fn, keepAlive = true) => { await ready(); if (keepAlive) god(); const r = pd.act(fn); await ready(); if (keepAlive) god(); return r; };
    const near = (x, y, dist) => { const L = pd.L, out = []; for (let dy = -dist; dy <= dist; dy++) for (let dx = -dist; dx <= dist; dx++){ const nx = x+dx, ny = y+dy;
      if ((dx || dy) && Math.max(Math.abs(dx), Math.abs(dy)) === dist && inb(L, nx, ny) && TP.pass[L.tiles[ny*L.w+nx]] && !charAt(nx, ny) && !L.traps[ny*L.w+nx] && L.tiles[ny*L.w+nx] !== T.EXIT && L.tiles[ny*L.w+nx] !== T.ENTRANCE
        && (dist > 1 || diagOK(L, x, y, nx, ny)) && (dist === 1 || losClear(L, x, y, nx, ny))) out.push([nx, ny]); } return out; };
    const clearMobs = () => { pd.L.mobs = pd.L.mobs.filter(m => MOBS[m.type].passive); pd.Render.sync(); };
    const spawn = (type, dist = 1) => { const h = pd.G.hero; const c = near(h.x, h.y, dist)[0] || near(h.x, h.y, 1)[0];
      const m = mkMob(type, c[0], c[1]); m.state = 'hunting'; m.target = { x: h.x, y: h.y }; m.time = h.time + 0.5; pd.L.mobs.push(m); pd.Render.sync(); return m; };
    const gone = m => m.dead || !pd.L.mobs.includes(m);
    const hurt = m => gone(m) || m.hp < m.ht;
    const kill = m => { for (let i = 0; i < 4 && !gone(m); i++) damage(m, m.hp + 9999, pd.G.hero); };
    const fresh = async cls => { pd.newGame(cls); await wait(400); await ready(); god(); clearMobs(); };
    const goTo = async d => { await ready(); pd.changeLevel('down', d); for (let i = 0; i < 400 && (pd.G.depth !== d || pd.V.busy); i++) await wait(25); await ready(); god(); };
    const meleeUntil = async (m, maxTurns) => { for (let i = 0; i < maxTurns && !gone(m); i++){ const h = pd.G.hero;
      if (Math.max(Math.abs(m.x-h.x), Math.abs(m.y-h.y)) !== 1){ m.x = near(h.x, h.y, 1)[0][0]; m.y = near(h.x, h.y, 1)[0][1]; pd.Render.sync(true); }
      await doAct(() => heroMove(m.x - pd.G.hero.x, m.y - pd.G.hero.y)); } };

    const openSpot = n => { const L = pd.L, h = pd.G.hero, ok = (x, y) => inb(L, x, y) && TP.pass[L.tiles[y*L.w + x]] && !charAt(x, y) && !L.traps[y*L.w + x] && ![T.EXIT, T.ENTRANCE, T.DOOR].includes(L.tiles[y*L.w + x]);
      for (let c = 0; c < L.w*L.h; c++){ const x = c % L.w, y = (c / L.w) | 0; if (!ok(x, y)) continue;
        for (const [dx, dy] of DIRS4){ const cells = []; for (let k = 1; k <= n && ok(x + dx*k, y + dy*k); k++) cells.push([x + dx*k, y + dy*k]);
          if (cells.length === n){ h.x = x; h.y = y; pd.Render.sync(true); updateFOV(); return cells; } } } return null; };
    const put = (type, [x, y]) => { const m = mkMob(type, x, y); m.state = 'hunting'; m.buffs.para = { t: 999 }; m.hp = m.ht = 500; m.time = pd.G.hero.time + 0.5; pd.L.mobs.push(m); pd.Render.sync(); return m; };

    // classes, starting kit, melee, class abilities
    for (const cls of Object.keys(CLASSES)) await section('class ' + cls, async () => {
      await fresh(cls);
      const h = pd.G.hero;
      check(cls + ': starts with a weapon and armor', !!h.eq.weapon && !!h.eq.armor);
      const rat = spawn('rat'); await meleeUntil(rat, 60);
      check(cls + ': melee kills a rat', gone(rat));
      if (cls === 'warrior'){
        h.shield = 0; for (let i = 0; i < 20; i++) await doAct(heroWait);
        check('warrior: seal shield recharges', h.shield > 0, h.shield);
        const stone = h.inv.find(i => i.k === 'missile'), q0 = stone.qty, m = spawn('rat', 2);
        await doAct(() => throwItem(stone, m.x, m.y));
        check('warrior: throws a stone', (stone.qty || 0) < q0 || !findItem(stone.id), stone.qty);
      }
      if (cls === 'mage'){
        const staff = h.eq.weapon, m = spawn('gnoll', 2), c0 = staff.ch;
        await doAct(() => zapWand(staff, m.x, m.y));
        check('mage: staff zap spends a charge', staff.ch === c0 - 1, [c0, staff.ch]);
        check('mage: staff bolt hurts the target', hurt(m), m.hp);
      }
      if (cls === 'rogue'){
        const cloak = h.eq.art;
        await doAct(() => toggleCloak(cloak)); check('rogue: cloak turns invisible', !!h.buffs.invis);
        await doAct(() => toggleCloak(cloak)); check('rogue: cloak toggles off', !h.buffs.invis);
        const knives = h.inv.find(i => i.k === 'missile'), q0 = knives.qty, m = spawn('rat', 2);
        await doAct(() => throwItem(knives, m.x, m.y));
        check('rogue: throws a knife', (knives.qty || 0) < q0 || !findItem(knives.id), knives.qty);
      }
      if (cls === 'huntress'){
        const bow = h.inv.find(i => i.k === 'bow'), m = spawn('gnoll', 2);
        for (let i = 0; i < 12 && !hurt(m); i++){ if (gone(m)) break; await doAct(() => shootBow(bow, m.x, m.y)); }
        check('huntress: spirit bow hits', hurt(m), m.hp);
      }
    });

    // items
    await section('items', async () => {
      await fresh('warrior'); const h = pd.G.hero; h.str = 18;
      for (const t of Object.keys(POTIONS)){ const it = mkPotion(t); h.inv.push(it); await doAct(() => drinkPotion(it)); clearBlobs();
        check('potion: drink ' + t, !findItem(it.id)); }
      { const it = mkPotion('frost'); h.inv.push(it); const m = spawn('gnoll', 2); await doAct(() => throwItem(it, m.x, m.y));
        check('potion: thrown frost freezes', !!(m.buffs.frozen || m.buffs.chill) || gone(m), m.buffs); clearBlobs(); clearMobs(); }
      for (const t of Object.keys(SCROLLS)){ const it = mkScroll(t); h.inv.push(it, mkWeapon('sword')); clearMobs(); spawn('rat', 2);
        await ready(); god(); pd.act(() => readScroll(it)); await wait(150);
        if (modal()){ const slot = [...document.querySelectorAll('#modal .slot[data-id]')].find(b => b.style.opacity !== '0.3' && !b.disabled); if (slot) slot.click(); }
        await ready(); clearBlobs();
        check('scroll: read ' + t, !findItem(it.id)); }
      clearMobs();
      for (const t of Object.keys(WANDS)){ const w = mkWand(t, 2); h.inv.push(w); clearMobs(); const m = spawn('gnoll', 2), c0 = w.ch;
        await doAct(() => zapWand(w, m.x, m.y)); clearBlobs();
        check('wand: zap ' + t, w.ch === c0 - 1, [c0, w.ch]); }
      clearMobs(); h.inv.length = 0; // the backpack holds 20 items; earlier checks filled it
      for (const t of Object.keys(RINGS)){ const r = mkRing(t, 1); h.inv.push(r);
        await doAct(() => heroEquip(r)); const on = isEquipped(r); await doAct(() => heroUnequip(r));
        check('ring: wear and remove ' + t, on && !isEquipped(r)); }
      h.inv.length = 0;
      for (const t of Object.keys(WEAPONS)){ const w = mkWeapon(t, 0); h.inv.push(w); await doAct(() => heroEquip(w));
        const rat = spawn('rat'); await meleeUntil(rat, 40);
        check('weapon: equip and fight with ' + t, h.eq.weapon === w && gone(rat)); clearMobs(); }
      for (const t of Object.keys(ARMORS)){ const a = mkArmor(t, 0); h.inv.push(a); await doAct(() => heroEquip(a));
        check('armor: equip ' + t, h.eq.armor === a); }
      for (const t of Object.keys(FOODS)){ const f = mkFood(t); h.inv.push(f); h.hunger = 200; await doAct(() => heroEat(f), false);
        check('food: eat ' + t, !findItem(f.id) && h.hunger < 200, h.hunger); }
      for (const t of Object.keys(MISSILES)){ const it = mkMissile(t, 3); h.inv.push(it); const m = spawn('gnoll', 2);
        await doAct(() => throwItem(it, m.x, m.y));
        check('missile: throw ' + t, it.qty < 3 || !findItem(it.id), it.qty); clearMobs(); }
    });

    // traps
    await section('traps', async () => {
      await fresh('warrior');
      for (const t of Object.keys(TRAPS)){ clearMobs(); clearBlobs(); god(); const h = pd.G.hero;
        const spot = openSpot(1)[0], c = spot[1]*pd.L.w + spot[0]; // a teleport trap can leave the hero boxed in, so start each trap from open ground
        pd.L.traps[c] = { t, hidden: false, active: true }; pd.V.trapDirty = true;
        await doAct(() => heroMove(spot[0] - h.x, spot[1] - h.y));
        check('trap: ' + t + ' triggers', !pd.L.traps[c].active);
        clearBlobs(); }
    });

    // monsters of every region, each fighting the hero, then dying
    await section('monsters', async () => {
      await fresh('warrior');
      for (const d of [3, 8, 13, 18, 23].filter(d => d < TO)){
        await goTo(d);
        const types = [...new Set([d-2, d-1, d, d+1].flatMap(x => mobRotation(x)))];
        for (const type of types){ clearMobs(); clearBlobs(); god();
          const m = spawn(type, 2), t0 = m.time, h = pd.G.hero; let hurtHero = 0;
          for (let i = 0; i < 20 && !gone(m) && !hurtHero; i++){ await ready(); god(); h.shield = 0; const hp0 = h.hp; pd.act(heroWait); await ready(); hurtHero += Math.max(0, hp0 - h.hp); }
          check('monster: ' + type + ' acts', gone(m) || m.time > t0, [t0, m.time]);
          check('monster: ' + type + ' hurts the hero', hurtHero > 0);
          kill(m); await ready();
          check('monster: ' + type + ' dies', gone(m)); }
      }
    });

    // bosses: fight a few turns, then the kill unseals the stairs
    await section('bosses', async () => {
      await fresh('warrior');
      for (const d of Object.keys(BOSS_DEPTHS).map(Number).filter(d => d <= TO)){
        await goTo(d); clearBlobs();
        const L = pd.L, boss = L.mobs.find(m => MOBS[m.type].boss), h = pd.G.hero;
        const spot = near(boss.x, boss.y, 2)[0] || near(boss.x, boss.y, 1)[0]; h.x = spot[0]; h.y = spot[1]; pd.Render.sync(true); updateFOV();
        wakeBoss(boss); const t0 = boss.time; let hurtHero = 0;
        for (let i = 0; i < 25 && !gone(boss); i++){ await ready(); god(); h.shield = 0; const hp0 = h.hp; pd.act(heroWait); await ready(); hurtHero += Math.max(0, hp0 - h.hp); clearBlobs(); }
        check('boss: ' + boss.type + ' fights', boss.time > t0, [t0, boss.time]);
        check('boss: ' + boss.type + ' hurts the hero', hurtHero > 0);
        for (const g of L.mobs.filter(m => MOBS[m.type].bossMinion)){ kill(g); check('boss guardian: ' + g.type + ' dies', gone(g)); }
        kill(boss); await ready();
        check('boss: ' + boss.type + ' dies and unseals the stairs', L.bossDefeated && L.tiles[L.exit] === T.EXIT);
      }
    });

    // subclasses: chosen after the floor-10 boss, then one concrete effect each
    await section('subclasses', async () => {
      await fresh('warrior'); await goTo(10);
      const boss = pd.L.mobs.find(m => MOBS[m.type].boss); kill(boss); await wait(1800);
      const opts = [...document.querySelectorAll('#modal [data-pick]')].map(b => b.dataset.pick);
      check('subclass: the floor-10 boss offers the class\'s two paths', opts.join() === 'juggernaut,duelist', opts);
      document.querySelector('#modal [data-pick="juggernaut"]')?.click();
      const h = pd.G.hero; check('subclass: picking a path sets it', h.sub === 'juggernaut', h.sub);
      clearMobs(); god(); damage(h, 3, 'test'); damage(h, 3, 'test');
      check('juggernaut: hits taken build momentum', h.mom === 2, h.mom);
      let cells = openSpot(2), m = put('gnoll', cells[0]);
      await doAct(() => heroMove(m.x - h.x, m.y - h.y));
      check('juggernaut: the next strike spends momentum and knocks back', h.mom === 0 && m.x === cells[1][0] && m.y === cells[1][1], [h.mom, m.x, m.y, cells[1]]);
      clearMobs(); h.sub = 'duelist'; h.duel = 0; cells = openSpot(1); m = put('golem', cells[0]);
      for (let i = 0; i < 3; i++) await doAct(() => heroMove(m.x - h.x, m.y - h.y));
      check('duelist: every third hit on a lone enemy is critical', pd.V.log.slice(-8).some(l => l.msg === 'Critical hit!'), pd.V.log.slice(-4).map(l => l.msg));
      await fresh('mage'); let hm = pd.G.hero, staff = hm.eq.weapon; hm.sub = 'runesmith';
      cells = openSpot(3); m = put('gnoll', cells[2]);
      await doAct(() => zapWand(staff, m.x, m.y));
      const rc = Number(Object.keys(pd.L.traps).find(k => pd.L.traps[k].rune));
      check('runesmith: a staff bolt leaves a rune', !Number.isNaN(rc) && rc === cells[1][1]*pd.L.w + cells[1][0], [rc, cells]);
      check('runesmith: monsters do not avoid runes', mobPassable(rc, false));
      onEnter(m, rc, false); check('runesmith: a monster stepping on a rune sets it off', !pd.L.traps[rc].active);
      clearMobs(); clearBlobs(); hm.sub = 'conduit'; staff.ch = 0; cells = openSpot(3); m = put('gnoll', cells[1]); const m2 = put('gnoll', cells[2]);
      await ready(); hm.ht = hm.hp = 500; hm.regen = 0; pd.act(() => zapWand(staff, m.x, m.y)); await ready();
      check('conduit: zapping an empty staff costs 3 health', hm.hp === 497, hm.hp);
      check('conduit: the bolt arcs to a second enemy', m2.hp < m2.ht, m2.hp);
      await fresh('rogue'); const hr = pd.G.hero; hr.sub = 'shade'; cells = openSpot(1); m = put('golem', cells[0]);
      await doAct(() => toggleCloak(hr.eq.art)); await doAct(() => heroMove(m.x - hr.x, m.y - hr.y));
      check('shade: a strike from invisibility slays a non-boss', gone(m) && hr.cd.shade > 0, [m.hp, hr.cd.shade]);
      clearMobs(); hr.sub = 'scavenger'; cells = openSpot(1); m = mkMob('thief', cells[0][0], cells[0][1]); m.state = 'hunting'; m.time = hr.time + 0.5; pd.L.mobs.push(m); pd.Render.sync();
      let hurtHero = 0; for (let i = 0; i < 20 && !hurtHero; i++){ await ready(); god(); const hp0 = hr.hp; pd.act(heroWait); await ready(); hurtHero += Math.max(0, hp0 - hr.hp); }
      check('scavenger: thieves cannot rob you', hurtHero > 0 && !m.stolen, [hurtHero, !!m.stolen]);
      await fresh('huntress'); const hh = pd.G.hero, bow = hh.inv.find(i => i.k === 'bow'); hh.sub = 'tracker';
      cells = openSpot(2); m = put('gnoll', cells[1]);
      for (let i = 0; i < 6 && !m.buffs.marked; i++) await doAct(() => shootBow(bow, m.x, m.y));
      const hp1 = m.hp; damage(m, 8, hh);
      check('tracker: arrows mark, and marked enemies take 25% more damage', !!m.buffs.marked && hp1 - m.hp === 10, [!!m.buffs.marked, hp1 - m.hp]);
      clearMobs(); pd.L.web.fill(0); hh.sub = 'thornweaver'; cells = openSpot(2); m = put('gnoll', cells[1]);
      await doAct(() => shootBow(bow, m.x, m.y));
      check('thornweaver: arrows sprout brambles and root the target', pd.L.web.some(v => v) && !!m.buffs.rooted, [pd.L.web.some(v => v), !!m.buffs.rooted]);
    });

    // powers: chosen after the floor-15 guardian, then each one works and recharges
    await section('powers', async () => {
      await fresh('warrior'); await goTo(15);
      kill(pd.L.mobs.find(m => MOBS[m.type].boss)); await wait(1800);
      const opts = [...document.querySelectorAll('#modal [data-pick]')].map(b => b.dataset.pick);
      check('power: the floor-15 guardian offers three powers', opts.join() === 'blink,shockwave,secondwind', opts);
      document.querySelector('#modal [data-pick="blink"]')?.click(); await wait(50);
      const h = pd.G.hero;
      check('power: picking one sets it, ready to use, with a HUD button', h.ab === 'blink' && h.abCh === 100 && !document.getElementById('b-ab').hidden, [h.ab, h.abCh]);
      clearMobs(); let cells = openSpot(3);
      const [tx, ty] = cells[2], ox = h.x, oy = h.y;
      check('blink step: refuses a tile more than 4 away', useAbility(h.x + 9, h.y) === false && h.abCh === 100);
      await doAct(() => useAbility(tx, ty));
      check('blink step: teleports and leaves a decoy', h.x === tx && h.y === ty && pd.L.mobs.some(m => m.type === 'image' && m.x === ox && m.y === oy) && h.abCh < 100, [h.x, h.y, h.abCh]);
      for (let i = 0; i < 10; i++) await doAct(heroWait);
      const c0 = h.abCh; const r = spawn('rat'); kill(r);
      check('power: recharges a point a turn and 10 per kill', c0 >= 10 && h.abCh === Math.min(100, c0 + 10), [c0, h.abCh]);
      clearMobs(); h.ab = 'shockwave'; h.abCh = 100; cells = openSpot(2);
      const g = put('gnoll', cells[0]); delete g.buffs.para;
      await doAct(() => useAbility());
      check('shockwave: knocks back and stuns adjacent enemies', g.x === cells[1][0] && g.y === cells[1][1] && !!g.buffs.para, [g.x, g.y, !!g.buffs.para]);
      clearMobs(); h.ab = 'secondwind'; h.abCh = 100; await ready(); h.ht = 100; h.hp = 10; h.regen = 0; h.buffs.poison = { t: 9 }; h.buffs.burning = { t: 5 };
      pd.act(() => useAbility()); await ready();
      check('second wind: heals 30% and clears poison and fire', h.hp >= 39 && !h.buffs.poison && !h.buffs.burning, [h.hp, Object.keys(h.buffs)]);
    });

    // alchemy: a cauldron on the third floor of each region; three items brew one
    await section('alchemy', async () => {
      await fresh('warrior'); await goTo(3);
      const L = pd.L, h = pd.G.hero, pot = L.mobs.find(m => m.type === 'cauldron');
      check('alchemy: a cauldron stands on floor 3', !!pot);
      check('alchemy: the cauldron cannot be hurt', !!pot && invulnerable(pot));
      h.inv.length = 0;
      const ps = ['toxic', 'frost', 'haste'].map(t => mkPotion(t)); h.inv.push(...ps);
      let made = brew(ps);
      check('alchemy: three potions brew an identified potion', !!made && made.k === 'potion' && made.t !== 'strength' && isTypeKnown(made) && ps.every(x => !findItem(x.id)), made && made.t);
      const st = mkScroll('teleport'); st.qty = 2; const sc = mkScroll('mapping'); h.inv.push(st, sc);
      made = brew([st, st, sc]);
      check('alchemy: three scrolls (one stack used twice) make an identified scroll', !!made && made.k === 'scroll' && made.t !== 'upgrade' && !findItem(st.id) && !findItem(sc.id), made && made.t);
      const rem = [mkPotion('toxic'), mkPotion('frost'), mkFood('small')]; h.inv.push(...rem);
      made = brew(rem);
      check('alchemy: two potions and a food make healing', !!made && made.t === 'healing');
      const bad = [mkFood('ration'), mkFood('small'), mkFood('pasty')]; h.inv.push(...bad);
      check('alchemy: a mix with no recipe does nothing and keeps the items', brew(bad) === null && bad.every(x => findItem(x.id)));
      check('alchemy: discovered recipes are remembered', ['brew', 'scribe', 'remedy'].every(k => pd.G.recipes && pd.G.recipes[k]));
      h.inv.length = 0; const ui = ['toxic', 'frost', 'haste'].map(t => mkPotion(t)); h.inv.push(...ui);
      const adj = near(pot.x, pot.y, 1)[0]; h.x = adj[0]; h.y = adj[1]; pd.Render.sync(true); updateFOV();
      await ready(); pd.act(() => heroMove(pot.x - h.x, pot.y - h.y)); await wait(150);
      for (const x of ui) document.querySelector('#agrid .slot[data-id="' + x.id + '"]')?.click();
      document.getElementById('abrew')?.click(); await ready();
      check('alchemy: walking into the cauldron, picking three items and brewing works', h.inv.length === 1 && h.inv[0].k === 'potion' && ui.every(x => !findItem(x.id)), h.inv.map(i => i.t));
    });

    // quests: one NPC on the second floor of each region, done end to end through the dialog buttons
    await section('quests', async () => {
      const ui = sel => document.querySelector('#modal ' + sel);
      const talkTo = async m => { await ready(); pd.UI.interact(m); await wait(80); };
      await fresh('warrior'); await goTo(2);
      let L = pd.L, h = pd.G.hero, npc = L.mobs.find(m => m.type === 'lamplighter');
      check('quest: the lamplighter waits on floor 2 with three braziers', !!npc && L.mobs.filter(m => m.type === 'brazier').length === 3);
      await talkTo(npc); ui('[data-q="yes"]')?.click();
      check('lamplighter: the quest can be accepted', questOf('lamplighter').state === 'active');
      for (const b of L.mobs.filter(m => m.type === 'brazier')) await doAct(() => lightBrazier(b));
      check('lamplighter: all three braziers light', questOf('lamplighter').lit === 3);
      h.inv.length = 0; await talkTo(npc); ui('[data-q="weapon"]')?.click(); await wait(50);
      check('lamplighter: the reward is a +1 weapon, then the ghost departs', h.inv.some(i => i.k === 'weapon' && i.lvl === 1) && questOf('lamplighter').state === 'done' && !L.mobs.includes(npc));

      await goTo(7); L = pd.L; npc = L.mobs.find(m => m.type === 'cartographer');
      check('quest: the cartographer waits on floor 7', !!npc);
      await talkTo(npc); ui('[data-q="yes"]')?.click();
      check('cartographer: accepting makes them follow, and they can now be hurt', !!npc.escort && npc.ally && !invulnerable(npc));
      { const nb0 = near(h.x, h.y, 1)[0]; npc.x = nb0[0]; npc.y = nb0[1]; pd.Render.sync(true); await ready();
        pd.act(() => heroMove(nb0[0] - h.x, nb0[1] - h.y)); const noDialog = document.getElementById('modal').hidden; await ready();
        check('cartographer: walking into them swaps places, with no dialog', noDialog && h.x === nb0[0] && h.y === nb0[1], [noDialog, h.x, h.y, nb0]); }
      const ex = cx_(L.exit), ey = cy_(L.exit), by = near(ex, ey, 1)[0]; h.x = by[0]; h.y = by[1];
      const nb = near(h.x, h.y, 1)[0]; npc.x = nb[0]; npc.y = nb[1]; pd.Render.sync(true);
      h.inv.length = 0; pd.changeLevel('down'); for (let i = 0; i < 200 && (pd.G.depth !== 8 || pd.V.busy); i++) await wait(25);
      const seenCells = pd.L.visited.reduce((a, v) => a + v, 0);
      check('cartographer: reaching the stairs together gives 2 mapping scrolls and maps the next floor', questOf('cartographer').state === 'done' && h.inv.filter(i => i.t === 'mapping').reduce((a, i) => a + i.qty, 0) === 2 && seenCells > 400, [questOf('cartographer').state, seenCells]);
      await fresh('warrior'); await goTo(7); npc = pd.L.mobs.find(m => m.type === 'cartographer');
      await talkTo(npc); ui('[data-q="yes"]')?.click(); damage(npc, 999, 'test');
      check('cartographer: the quest fails if they die', questOf('cartographer').state === 'failed');
      await fresh('warrior'); await goTo(7); L = pd.L; npc = L.mobs.find(m => m.type === 'cartographer');
      await talkTo(npc); ui('[data-q="yes"]')?.click();
      npc.x = cx_(L.entrance); npc.y = cy_(L.entrance); { const b2 = near(cx_(L.exit), cy_(L.exit), 1)[0]; pd.G.hero.x = b2[0]; pd.G.hero.y = b2[1]; } pd.Render.sync(true);
      pd.changeLevel('down'); for (let i = 0; i < 200 && (pd.G.depth !== 8 || pd.V.busy); i++) await wait(25);
      check('cartographer: left behind, the quest fails and they cannot be escorted later', questOf('cartographer').state === 'failed' && !pd.G.levels[7].mobs.some(m => m.type === 'cartographer'));

      await fresh('warrior'); await goTo(12); L = pd.L; h = pd.G.hero; npc = L.mobs.find(m => m.type === 'foreman');
      check('quest: the foreman waits on floor 12 with three ore veins', !!npc && L.mobs.filter(m => m.type === 'ore').length === 3);
      await talkTo(npc); ui('[data-q="yes"]')?.click();
      const o1 = L.mobs.find(m => m.type === 'ore'), sp = near(o1.x, o1.y, 2)[0], sl = mkMob('gnoll', sp[0], sp[1]); sl.state = 'sleeping'; sl.time = h.time + 0.5; L.mobs.push(sl); pd.Render.sync();
      for (const o of L.mobs.filter(m => m.type === 'ore')) for (let k = 0; k < 3; k++) await doAct(() => mineOre(o));
      check('foreman: three veins mined, three blows each', questOf('foreman').ore === 3 && !L.mobs.some(m => m.type === 'ore'));
      check('foreman: mining is loud and wakes monsters nearby', sl.state !== 'sleeping');
      clearMobs(); h.inv.length = 0; const tgt = mkWeapon('sword', 0), src = mkWeapon('mace', 3), cur = mkWeapon('spear', 2); cur.cursed = true; h.eq.weapon = cur; h.inv.push(tgt, src);
      await talkTo(npc); ui('[data-q="reforge"]')?.click(); await wait(80);
      ui('.slot[data-id="' + tgt.id + '"]')?.click(); await wait(80);
      check('foreman: an equipped cursed weapon cannot be melted down', ui('.slot[data-id="' + cur.id + '"]')?.style.opacity === '0.3');
      ui('.slot[data-id="' + src.id + '"]')?.click(); await wait(50);
      check('foreman: reforging moves the upgrades onto the chosen item', tgt.lvl === 3 && !findItem(src.id) && questOf('foreman').state === 'done', tgt.lvl);

      await goTo(17); L = pd.L; npc = L.mobs.find(m => m.type === 'scholar');
      check('quest: the scholar waits on floor 17', !!npc);
      for (let i = 0; i < 6; i++) kill(spawn('rat', 2));
      await talkTo(npc); ui('[data-q="yes"]')?.click();
      check('scholar: kills made before accepting count', (L.kills || 0) >= 6, L.kills);
      h.inv.length = 0; await talkTo(npc); const offer1 = [...document.querySelectorAll('#modal [data-q]')].map(b => b.dataset.q).join();
      await talkTo(npc); const offer2 = [...document.querySelectorAll('#modal [data-q]')].map(b => b.dataset.q).join();
      check('scholar: reopening shows the same wand offer', offer1 === offer2 && offer1.split(',').length === 3, [offer1, offer2]);
      const wb = ui('[data-q]:not([data-q="bye"])'), wk = wb && wb.dataset.q; wb?.click(); await wait(50);
      check('scholar: the reward is the chosen wand at +2', h.inv.some(i => i.k === 'wand' && i.t === wk && i.lvl === 2) && questOf('scholar').state === 'done', wk);

      await goTo(22); L = pd.L; npc = L.mobs.find(m => m.type === 'bargainer');
      check('quest: the bargainer waits on floor 22', !!npc);
      const str0 = h.str; await talkTo(npc); ui('[data-q="blood"]')?.click(); await wait(50);
      check('bargainer: blood for strength (+2 STR, a fifth less health for good)', h.str === str0 + 2 && h.htMul === 0.8 && questOf('bargainer').state === 'done');
      await talkTo(npc); check('bargainer: only one deal per run', !ui('[data-q="blood"]'));
      await fresh('warrior'); await goTo(22); const h2 = pd.G.hero; h2.gold = 500; h2.inv.length = 0; const ring = mkRing('might', 1); h2.inv.push(ring);
      await talkTo(pd.L.mobs.find(m => m.type === 'bargainer')); ui('[data-q="gold"]')?.click(); await wait(80); ui('.slot[data-id="' + ring.id + '"]')?.click(); await wait(50);
      check('bargainer: gold for craft (300 gold, +1 upgrade)', ring.lvl === 2 && h2.gold === 200, [ring.lvl, h2.gold]);
    });

    // challenges
    await section('challenges', async () => {
      pd.newGame('warrior', { dark: true, glass: true, starving: true, blind: true }); await wait(400); await ready();
      const h = pd.G.hero, L = pd.L;
      let far = 0; for (let c = 0; c < L.w*L.h; c++) if (pd.V.fov[c]) far = Math.max(far, Math.abs(c % L.w - h.x), Math.abs(((c / L.w) | 0) - h.y));
      check('challenge: darkness limits sight to 4 tiles', far <= 4, far);
      check('challenge: glass hero starts at half health', h.ht === 10 && h.hp === 10, [h.hp, h.ht]);
      let drMax = 0; for (let i = 0; i < 300; i++) drMax = Math.max(drMax, heroDR());
      check('challenge: glass hero armor blocks double', drMax > armorDRMax(h.eq.armor), drMax);
      const f = mkFood('ration'); h.inv.push(f); h.hunger = 400; await doAct(() => heroEat(f), false);
      check('challenge: starving halves food', h.hunger >= 250 && h.hunger <= 252, h.hunger);
      const w = mkWeapon('sword', 0); w.known = false; for (let i = 0; i < 30; i++) weaponUsed(w);
      check('challenge: blind faith never identifies gear by use', !w.known);
      const s4 = scoreOf(), saved = pd.G.ch; pd.G.ch = {}; const s0 = scoreOf(); pd.G.ch = saved;
      check('challenge: each one adds 25% score', s4 === s0 * 2, [s0, s4]);
      pd.newGame('warrior', { swarm: true, noupgrade: true }); await wait(400); await ready();
      const lv = [2, 3, 4].map(d => generateLevel(d));
      check('challenge: swarming spawns more monsters, none asleep', lv.every(l => l.mobLimit >= Math.round((3 + l.depth % 5) * 1.5) && l.mobs.every(m => m.state !== 'sleeping')), lv.map(l => l.mobLimit));
      const scrolls = [pd.L, ...lv].flatMap(l => Object.values(l.heaps).flat()).filter(i => i.k === 'scroll');
      check('challenge: no upgrades swaps them for recharging', !scrolls.some(i => i.t === 'upgrade') && scrolls.some(i => i.t === 'recharging'), scrolls.map(i => i.t));
    });

    // shop, save/load, hunger, level-up, secret doors, death
    await section('misc', async () => {
      await fresh('warrior'); await goTo(6); const h = pd.G.hero;
      const c = Object.keys(pd.L.heaps).map(Number).find(k => pd.L.heaps[k].some(i => i.price));
      if (c === undefined) check('shop: floor 6 has a shop', false);
      else { h.gold = 99999; const it = pd.L.heaps[c].find(i => i.price), price = it.price; pd.UI.openBuy(c); await wait(100); document.getElementById('byes').click(); await ready();
        check('shop: buy an item (it may join a stack you already carry)', h.gold === 99999 - price && allItems().some(i => i === it || sameStack(i, it)), [h.gold, price]); }
      const lv = h.lvl; earnExp(maxExp(h.lvl) - h.exp); check('hero levels up', h.lvl === lv + 1, [lv, h.lvl]);
      const before = { depth: pd.G.depth, lvl: h.lvl, inv: h.inv.length, x: h.x, y: h.y };
      pd.startGameFrom(pd.loadSave(pd.serialize())); await ready();
      const h2 = pd.G.hero; check('save and load round-trip', h2.lvl === before.lvl && pd.G.depth === before.depth && h2.inv.length === before.inv && h2.x === before.x && h2.y === before.y, before);
      h2.hunger = 440; for (let i = 0; i < 15; i++){ await ready(); pd.act(heroWait); await ready(); h2.hp = h2.ht; }
      check('hunger reaches starving', h2.hunger >= 450, h2.hunger);
      const s = near(h2.x, h2.y, 1).find(([x, y]) => x === h2.x || y === h2.y), sc = s[1]*pd.L.w + s[0];
      pd.L.tiles[sc] = T.SECRET; searchAround(1, 1); check('search reveals a secret door', pd.L.tiles[sc] === T.DOOR);
      h2.ht = 20; h2.hp = 5; damage(h2, 500, 'a test'); await wait(2600);
      check('death ends the run', pd.G.over && modal() && /died/i.test(document.getElementById('modal').textContent));
      check('death is recorded in best runs', JSON.parse(localStorage.getItem(rankKey()) || '[]').length > 0);
    });
    if (TO >= 26) await section('victory', async () => {
      if (modal()) pd.UI.closeWindow();
      await fresh('warrior'); await goTo(26);
      const L = pd.L, ped = Object.keys(L.heaps).map(Number).find(c => L.heaps[c].some(i => i.k === 'amulet')), h = pd.G.hero;
      h.x = cx_(ped); h.y = cy_(ped) + 1; pd.Render.sync(true); updateFOV();
      await doAct(() => heroMove(0, -1)); await wait(2600);
      check('taking the Amulet wins the run', pd.G.over && pd.V.won && modal() && /amulet/i.test(document.getElementById('modal').textContent));
    });
    return { passed, failed };
  }, TO);
  for (const f of sys.failed) console.log('  FAIL ' + f);
  console.log('systems: ' + sys.passed.length + ' passed, ' + sys.failed.length + ' failed');
  assert.strictEqual(sys.failed.length, 0, 'all systems checks pass');
  await page.evaluate(() => { if (!window.__pd.G || window.__pd.G.over) { if (!document.getElementById('modal').hidden) window.__pd.UI.closeWindow(); window.__pd.newGame('warrior'); } });
  await page.waitForTimeout(800);

  // --- bot run, FROM to TO (hero made unkillable) ---
  const result = await page.evaluate(async ([FROM, TO, WALK]) => {
    const pd = window.__pd, wait = ms => new Promise(r => setTimeout(r, ms));
    if (FROM > 1){ pd.changeLevel('down', FROM); while (pd.G.depth !== FROM || pd.V.busy) await wait(50); }
    const PASS = new Set([2, 3, 6, 7, 8, 9, 10, 11, 12, 16]);
    let trapMsg = null, steps = 0, lastDepth = 0, stuck = 0, lastPos = '', hops = 0, bad = new Set(), known = 0, dry = false;
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
      if (G.over) return pd.V.won ? { ok: G.depth === TO, why: 'victory', depth: G.depth, boss: true, hops, seen: [...seen] } : { ok: false, why: 'died: ' + G.deathCause, depth: G.depth };
      if (!document.getElementById('modal').hidden) pd.UI.closeWindow();
      if (steps % 500 === 0) console.log('[bot] heartbeat step ' + steps + ' floor ' + G.depth + ' at ' + h.x + ',' + h.y + ' busy ' + pd.V.busy + ' np ' + pd.V.needProcess + ' seed ' + G.seed);
      if (pd.V.busy || pd.V.needProcess) continue;
      h.ht = h.hp = 9999; h.hunger = 0; // bot tests progression, not balance (it ignores telegraphed attacks)
      if (WALK){ for (const m of L.mobs) if (MOBS[m.type].boss && !L.bossDefeated) onBossDeath(m); // unseal the stairs as a kill would
        L.mobs = L.mobs.filter(m => m.ally || MOBS[m.type].passive); }
      if (G.depth !== lastDepth){ lastDepth = G.depth; seen.add(G.depth); bad = new Set(); console.log('[bot] floor ' + G.depth + ' at step ' + steps); }
      const k = L.visited.reduce((a, v) => a + v, 0); if (k > known){ known = k; bad.clear(); dry = false; } // new ground: retry blacklisted targets
      const vis = m => pd.V.fov[m.y*L.w + m.x];
      const boss = L.mobs.find(m => !m.dead && MOBS[m.type].boss);
      const foe = L.mobs.find(m => !m.dead && !m.ally && !MOBS[m.type].passive && vis(m) && !bad.has(m.y*L.w + m.x) && Math.max(Math.abs(m.x-h.x), Math.abs(m.y-h.y)) <= 6);
      const ex = L.exit % L.w, ey = (L.exit / L.w) | 0;
      if (G.depth === TO && L.bossDefeated && h.x === ex && h.y === ey){
        pd.UI.cellClick(h.x, h.y); await wait(300);
        return { ok: pd.G.depth === TO, why: 'gate', depth: pd.G.depth, boss: true, hops, seen: [...seen] };
      }
      const amulet = L.exit < 0 ? Object.keys(L.heaps).map(Number).find(c => L.heaps[c].some(i => i.k === 'amulet')) : undefined;
      const goal = boss || (amulet !== undefined ? { x: cx_(amulet), y: cy_(amulet) } : { x: ex, y: ey });
      let click;
      if (foe) click = [foe.x, foe.y];
      else if (boss && vis(boss) && !bad.has(boss.y*L.w + boss.x)) click = [boss.x, boss.y];
      else if (!boss && amulet !== undefined && L.visited[amulet]) click = [goal.x, goal.y];
      else if (!boss && L.exit >= 0 && L.visited[L.exit]) click = [ex, ey];
      else { const f = frontier(L, goal.x, goal.y); if (f >= 0) click = [f % L.w, (f / L.w) | 0]; }
      if (click) pd.UI.cellClick(click[0], click[1]);
      else if (bad.size) bad.clear(); // retry once: a blacklisted cell may have been blocked only by a monster that has since moved
      else { pd.UI.cellClick(h.x, h.y); if (!dry){ dry = true;
          let map = '';
          for (let y = 0; y < L.h; y++){ let r = ''; for (let x = 0; x < L.w; x++){ const c = y*L.w + x, t = L.tiles[c];
            r += (x === h.x && y === h.y) ? '@' : !L.visited[c] ? ' ' : bad.has(c) ? 'x' : (L.traps[c] && !L.traps[c].hidden) ? '^' : '?#.+L5<>~"\',_PsWS:BT'[t]; } map += r.replace(/\s+$/, '') + '\n'; }
          console.log('[bot] nothing reachable to explore on floor ' + G.depth + ', searching\n' + map.replace(/^\n+|\n+$/g, '')); } } // search for secret doors
      const lastMsg = pd.V.log.at(-1); // the log keeps 60 entries, so compare the entry itself, not the log length
      if (lastMsg !== trapMsg && lastMsg?.msg?.startsWith('A trap blocks')){ trapMsg = lastMsg; // as a player would: step onto the blocking trap on purpose
        const t = DIRS8.map(([dx,dy]) => [h.x+dx, h.y+dy]).find(([x,y]) => { const tr = L.traps[y*L.w + x]; return tr && tr.active && !tr.hidden && diagOK(L, h.x, h.y, x, y); });
        if (t) pd.UI.cellClick(t[0], t[1]);
      }
      const pos = G.depth + ':' + h.time; // no game time passed = the click did nothing
      stuck = pos === lastPos ? stuck + 1 : 0; lastPos = pos;
      if (stuck && click) bad.add(click[1]*L.w + click[0]); // seen but not reachable through explored tiles yet
      if (stuck > 80){ // last resort, counted in the result: hop next to the exit
        hops++; const spot = DIRS8.map(([dx,dy]) => [ex+dx, ey+dy]).find(([x,y]) => PASS.has(L.tiles[y*L.w + x]) && !charAt(x, y)); if (spot){ h.x = spot[0]; h.y = spot[1]; } stuck = 0;
        console.log('[bot] hop on floor ' + G.depth + ' clicking ' + JSON.stringify(click) + ' tile ' + (click ? L.tiles[click[1]*L.w + click[0]] : '-') + ' keys ' + JSON.stringify(h.keys) + ' log ' + JSON.stringify(pd.V.log.slice(-2).map(l => l.msg)));
      }
    }
    return { ok: false, why: 'step limit', depth: pd.G.depth, hops, seen: [...seen] };
  }, [FROM, TO, WALK]);
  console.log('bot:', JSON.stringify(result));
  await page.screenshot({ path: 'test/last-run.png' });
  assert(result.ok && result.boss, 'bot reached the end (demo gate or victory) on floor ' + TO + ': ' + JSON.stringify(result));
  assert.strictEqual(result.hops, 0, 'bot never needed the teleport fallback');
  assert.deepStrictEqual(errors, [], 'no console errors');
  console.log('playtest: ok');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
