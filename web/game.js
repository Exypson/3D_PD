'use strict';
/* ============================================================
   Pixel Dungeon 3D, a GPLv3 fork of Shattered Pixel Dungeon.
   Mechanics follow Shattered Pixel Dungeon by Evan Debenham (GPLv3):
   https://github.com/00-evan/shattered-pixel-dungeon
   All art in this file is procedurally generated.
   ============================================================ */

// ---------- RNG ----------
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
const R = {
  f: Math.random,
  float(a, b){ return b === undefined ? this.f()*(a===undefined?1:a) : a + this.f()*(b-a); },
  int(a, b){ return b === undefined ? Math.floor(this.f()*a) : a + Math.floor(this.f()*(b-a)); }, // [a,b)
  range(a, b){ if (b < a) return a; return a + Math.floor(this.f()*(b-a+1)); }, // inclusive
  normal(a, b){ if (b <= a) return a; return Math.floor((this.range(a,b) + this.range(a,b))/2); }, // NormalIntRange
  chance(p){ return this.f() < p; },
  pick(arr){ return arr[Math.floor(this.f()*arr.length)]; },
  shuffle(arr){ for (let i=arr.length-1;i>0;i--){ const j=Math.floor(this.f()*(i+1)); const t=arr[i]; arr[i]=arr[j]; arr[j]=t; } return arr; },
  weighted(map){ // {key:weight}
    let tot=0; for (const k in map) tot += map[k];
    let r = this.f()*tot;
    for (const k in map){ r -= map[k]; if (r < 0) return k; }
    for (const k in map) return k;
  }
};
function withSeed(seed, fn){
  const prev = R.f; R.f = mulberry32(seed);
  try { return fn(); } finally { R.f = prev; }
}
function hash2(x, y, s){ let h = (x*374761393 + y*668265263 + (s||0)*1442695041) | 0; h = Math.imul(h ^ (h>>>13), 1274126177); return ((h ^ (h>>>16)) >>> 0) / 4294967296; }

// ---------- grid helpers ----------
const DIRS8 = [[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
const DIRS4 = [[0,-1],[1,0],[0,1],[-1,0]];
const clamp = (v,a,b) => v < a ? a : (v > b ? b : v);
const lerp = (a,b,t) => a + (b-a)*t;
const cheb = (x0,y0,x1,y1) => Math.max(Math.abs(x0-x1), Math.abs(y0-y1));
const dist2 = (x0,y0,x1,y1) => (x0-x1)*(x0-x1)+(y0-y1)*(y0-y1);
function cap(s){ return s.charAt(0).toUpperCase() + s.slice(1); }
function esc(s){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function aOrAn(s){ return /^[aeiou]/i.test(s) ? 'an ' + s : 'a ' + s; }

// ---------- tiles ----------
const T = {
  EMPTY:0, WALL:1, FLOOR:2, DOOR:3, LOCKED:4, SECRET:5, ENTRANCE:6, EXIT:7, WATER:8, HGRASS:9, GRASS:10,
  EMBERS:11, PEDESTAL:12, WALL_DECO:13, STATUE:14, SEALED:15, SPFLOOR:16, BOOKSHELF:17, THRONE:18
};
const TILE_N = 19;
const TP = { pass:new Uint8Array(TILE_N), los:new Uint8Array(TILE_N), solid:new Uint8Array(TILE_N), flam:new Uint8Array(TILE_N), wall:new Uint8Array(TILE_N) };
(function(){
  const pass = [T.FLOOR,T.DOOR,T.ENTRANCE,T.EXIT,T.WATER,T.HGRASS,T.GRASS,T.EMBERS,T.PEDESTAL,T.SPFLOOR];
  pass.forEach(t => TP.pass[t] = 1);
  [T.WALL,T.WALL_DECO,T.SECRET,T.EMPTY,T.DOOR,T.LOCKED,T.HGRASS,T.BOOKSHELF].forEach(t => TP.los[t] = 1);
  [T.WALL,T.WALL_DECO,T.SECRET,T.EMPTY,T.LOCKED,T.STATUE,T.BOOKSHELF,T.SEALED,T.THRONE].forEach(t => TP.solid[t] = 1);
  [T.HGRASS,T.GRASS,T.BOOKSHELF].forEach(t => TP.flam[t] = 1);
  [T.WALL,T.WALL_DECO,T.SECRET,T.BOOKSHELF].forEach(t => TP.wall[t] = 1);
})();
const TILE_NAMES = {
  [T.WALL]:'Wall', [T.WALL_DECO]:'Wall', [T.SECRET]:'Wall', [T.FLOOR]:'Floor', [T.DOOR]:'Door', [T.LOCKED]:'Locked door',
  [T.ENTRANCE]:'Stairs up', [T.EXIT]:'Stairs down', [T.WATER]:'Shallow water', [T.HGRASS]:'Tall grass', [T.GRASS]:'Trampled grass',
  [T.EMBERS]:'Embers', [T.PEDESTAL]:'Pedestal', [T.STATUE]:'Statue', [T.SEALED]:'Sealed stairs', [T.SPFLOOR]:'Ornate floor',
  [T.BOOKSHELF]:'Bookshelf', [T.THRONE]:'Throne', [T.EMPTY]:'Darkness'
};
const TILE_DESC = {
  [T.WATER]:'Murky water. Walking through it puts out flames.',
  [T.HGRASS]:'Tall grass blocks line of sight. Trampling it may shake loose dewdrops.',
  [T.LOCKED]:'This door is locked. An iron key from this floor will open it.',
  [T.SEALED]:'A magical barrier seals these stairs. Defeat the guardian of this floor.',
  [T.EXIT]:'Stairs leading deeper into the dungeon.',
  [T.ENTRANCE]:'Stairs leading back up.',
  [T.EMBERS]:'Smouldering embers. They are harmless to walk on.',
  [T.STATUE]:'An old stone statue, worn smooth by the ages.',
  [T.PEDESTAL]:'A stone pedestal. Something valuable was meant to rest here.'
};
// ============================================================
// DATA TABLES (stats from Shattered Pixel Dungeon source)
// ============================================================
const REGIONS = [
  { key:'sewers', name:'Sewers',  fog:0x0b1512, amb:0x5d7a6c, ground:0x1c2420, light:0xffcf94, fogDensity:0.050,
    water:[0.16,0.33,0.28], torch:0xffa94d },
  { key:'prison', name:'Prison',  fog:0x0d1016, amb:0x6a7388, ground:0x1d2028, light:0xffd6a0, fogDensity:0.050,
    water:[0.18,0.27,0.36], torch:0xff9a3d },
  { key:'caves',  name:'Caves',   fog:0x140f0b, amb:0x80664a, ground:0x2a2016, light:0xffc283, fogDensity:0.055,
    water:[0.14,0.30,0.38], torch:0xffb050 },
  { key:'city',   name:'Dwarven Metropolis', fog:0x120e17, amb:0x7a6a8e, ground:0x221c28, light:0xffe0b0, fogDensity:0.045,
    water:[0.20,0.30,0.46], torch:0xffc766 },
  { key:'halls',  name:'Demon Halls', fog:0x16070a, amb:0x8a4a52, ground:0x24100f, light:0xffb19a, fogDensity:0.050,
    water:[0.40,0.10,0.08], torch:0xff5a3a }
];
const regionOf = d => Math.min(4, Math.floor((d-1)/5));
const BOSS_DEPTHS = { 5:'goo', 10:'tengu', 15:'dm300', 20:'king', 25:'yog' };

// ---------- Mobs ----------
// hp, def(evasion), att(accuracy), dmg, dr, exp, max(level cap for exp)
const MOBS = {
  rat:     { name:'Marsupial Rat', hp:8, def:2, att:8, dmg:[1,4], dr:[0,1], exp:1, max:5,
             model:{k:'rat', c:0x8a8079, c2:0xd9a3a0}, desc:'A sewer rat grown fat on refuse. It bites anything that wanders too close.' },
  snake:   { name:'Sewer Snake', hp:4, def:25, att:10, dmg:[1,4], dr:[0,0], exp:2, max:7, loot:0.25, lootK:'potion',
             model:{k:'snake', c:0x5c8f3c, c2:0xc8d65a}, desc:'Fast and slippery, this snake is very hard to hit. Surprise attacks always land, though.' },
  gnoll:   { name:'Gnoll Scout', hp:12, def:4, att:10, dmg:[1,6], dr:[0,2], exp:2, max:8, loot:0.5, lootK:'gold',
             model:{k:'humanoid', c:0xb58a4f, c2:0x6b4a2a, head:0xc89a5c, ears:true, snout:true, weapon:'spear', scale:0.95}, desc:'A hyena-like humanoid scavenger. Scouts carry a crude spear and some loose coin.' },
  crab:    { name:'Sewer Crab', hp:15, def:5, att:12, dmg:[1,7], dr:[0,4], exp:4, max:9, speed:2, loot:0.167, lootK:'meat',
             model:{k:'crab', c:0xc8562f, c2:0xf0a060}, desc:'This armored crab scuttles twice as fast as you can walk. Its shell soaks up blows.' },
  swarm:   { name:'Swarm of Flies', hp:50, def:5, att:10, dmg:[1,4], dr:[0,0], exp:3, max:9, flying:true, split:true, loot:0.167, lootK:'potion:healing',
             model:{k:'swarm', c:0x2a2a2a, c2:0x9fd36a}, desc:'A buzzing cloud of carrion flies. Striking it splits the swarm in two.' },
  slime:   { name:'Caustic Slime', hp:20, def:5, att:12, dmg:[2,5], dr:[0,0], exp:4, max:9, slime:true, loot:0.2, lootK:'weapon',
             model:{k:'blob', c:0x77c043, c2:0xcef59a, scale:0.8}, desc:'A wobbling mass of ooze. Heavy blows lose much of their force inside its body.' },
  goo:     { name:'Goo', hp:100, def:8, att:10, dmg:[1,8], dr:[0,2], exp:10, max:30, boss:true,
             model:{k:'blob', c:0x3a5530, c2:0xff6a2a, scale:1.5, mound:true}, desc:'A heaving mass of corrupted sludge. When it pumps itself up, step away before it bursts.' },

  skeleton:{ name:'Skeleton', hp:25, def:9, att:12, dmg:[2,10], dr:[0,5], exp:5, max:10, explode:true, loot:0.167, lootK:'weapon',
             model:{k:'humanoid', c:0xe2dccb, c2:0xbdb5a0, head:0xefe9d8, bony:true, weapon:'sword'}, desc:'The animated bones of a long-dead prisoner. When destroyed, its bones burst outward.' },
  thief:   { name:'Crazy Thief', hp:20, def:12, att:12, dmg:[1,10], dr:[0,3], exp:5, max:11, steal:true, loot:0.1, lootK:'any',
             model:{k:'humanoid', c:0x4a4f6b, c2:0x2a2c3a, head:0xd8b08c, hood:0x3b3f58, weapon:'dagger'}, desc:'A deranged escaped convict. He snatches whatever he can grab and then runs for it.' },
  dm100:   { name:'DM-100', hp:20, def:8, att:11, dmg:[2,8], dr:[0,4], exp:6, max:13, ranged:{range:6, dmg:[3,10], kind:'lightning', chance:0.7}, loot:0.2, lootK:'scroll',
             model:{k:'robot', c:0x7a8696, c2:0x4fd0ff, scale:0.85}, desc:'A dwarven mining drone repurposed as a guard. It discharges bolts of lightning.' },
  guard:   { name:'Prison Guard', hp:40, def:10, att:12, dmg:[4,12], dr:[0,7], exp:7, max:14, chain:true, loot:0.2, lootK:'armor',
             model:{k:'humanoid', c:0x4d5866, c2:0x2c323a, head:0x8b939e, helm:0x8b939e, weapon:'mace', scale:1.05}, desc:'An undead guard still wearing its armor. It can lash out with a chain to pull prisoners in close.' },
  necro:   { name:'Necromancer', hp:40, def:14, att:10, dmg:[1,4], dr:[0,5], exp:7, max:14, summoner:true, keepAway:3, loot:0.2, lootK:'potion:healing',
             model:{k:'humanoid', c:0x2d2238, c2:0x7a4ca8, head:0xcfc7b0, hood:0x1e1726, weapon:'staff', glow:0x9b6cff}, desc:'A robed spellcaster who raises skeletons to fight for it and keeps its distance.' },
  tengu:   { name:'Tengu', hp:160, def:15, att:20, dmg:[6,12], dr:[0,5], exp:20, max:30, boss:true,
             model:{k:'humanoid', c:0x3c434c, c2:0x23272d, head:0x14171b, hood:0x2b3038, visor:0x5ff0e0, collar:0x6a6f76, robe:true, weapon:'dagger', dual:true, scale:1.2}, desc:'A masked assassin who blinks away when wounded and peppers you with shuriken.' },

  bat:     { name:'Vampire Bat', hp:30, def:15, att:16, dmg:[5,18], dr:[0,4], exp:7, max:15, speed:2, flying:true, drain:true, loot:0.167, lootK:'potion:healing',
             model:{k:'bat', c:0x3a2a33, c2:0xff4444}, desc:'A large, fast bat that drinks blood to heal itself.' },
  brute:   { name:'Gnoll Brute', hp:40, def:15, att:20, dmg:[5,25], dr:[0,8], exp:8, max:16, enrage:true, loot:0.5, lootK:'gold',
             model:{k:'humanoid', c:0x8c6a3a, c2:0x4a3320, head:0xa47b46, ears:true, snout:true, weapon:'axe', scale:1.25}, desc:'A hulking gnoll warrior. Wound it badly and it flies into a rage, hitting much harder.' },
  shaman:  { name:'Gnoll Shaman', hp:35, def:15, att:18, dmg:[5,10], dr:[0,6], exp:8, max:16, ranged:{range:6, dmg:[6,15], kind:'bolt', chance:0.6, effect:'weak'}, loot:0.1, lootK:'wand',
             model:{k:'humanoid', c:0x6b5a8c, c2:0x3a2f4f, head:0xb38c55, ears:true, snout:true, weapon:'staff', glow:0xb07cff}, desc:'A gnoll mystic who hurls bolts of dark magic.' },
  spinner: { name:'Cave Spinner', hp:50, def:17, att:22, dmg:[10,20], dr:[0,6], exp:9, max:17, poison:true, webber:true, loot:0.125, lootK:'meat',
             model:{k:'spider', c:0x3e3a34, c2:0xc0e040}, desc:'A giant cave spider. Its bite is venomous and it spins sticky webs.' },
  dm200:   { name:'DM-200', hp:80, def:12, att:20, dmg:[10,25], dr:[0,8], exp:9, max:17, gasVent:true, loot:0.2, lootK:'armor',
             model:{k:'robot', c:0x8d7a52, c2:0x9fe05a, scale:1.2}, desc:'A heavy mining machine. It vents caustic gas when its target is out of reach.' },
  dm300:   { name:'DM-300', hp:260, def:15, att:20, dmg:[15,25], dr:[0,10], exp:30, max:30, boss:true,
             model:{k:'robot', c:0xb08a3a, c2:0xff7a30, scale:1.7, excavator:true}, desc:'An enormous dwarven excavator gone rogue. It vents toxic fumes and shakes rocks loose from the ceiling.' },

  ghoul:   { name:'Dwarven Ghoul', hp:45, def:20, att:24, dmg:[16,22], dr:[0,4], exp:5, max:20, revive:true, loot:0.2, lootK:'gold',
             model:{k:'humanoid', c:0x6a7a6a, c2:0x3a4a3a, head:0x9aa88a, hunched:true, scale:0.95}, desc:'A dwarf who fed on the dead. Unless finished properly, it may rise again.' },
  elemental:{name:'Fire Elemental', hp:60, def:20, att:25, dmg:[20,25], dr:[0,5], exp:10, max:20, flying:true, burns:true, ranged:{range:4, dmg:[12,18], kind:'fire', chance:0.35},
             model:{k:'elemental', c:0xff7a20, c2:0xffe080}, desc:'Living flame. Its touch sets you ablaze.' },
  warlock: { name:'Dwarf Warlock', hp:70, def:18, att:25, dmg:[12,18], dr:[0,8], exp:11, max:21, ranged:{range:7, dmg:[12,18], kind:'bolt', chance:0.7, effect:'weak'}, loot:0.5, lootK:'potion',
             model:{k:'humanoid', c:0x3a2c52, c2:0xd0a040, head:0xd8b08c, beard:0xb0b0b8, hat:0x2a2040, weapon:'staff', glow:0xffa040, scale:0.9}, desc:'A dwarven mage of dark arts. Its bolts sap your strength.' },
  monk:    { name:'Dwarf Monk', hp:70, def:30, att:30, dmg:[12,25], dr:[0,2], exp:11, max:21, atkDelay:0.5, loot:0.083, lootK:'food',
             model:{k:'humanoid', c:0xc87a2a, c2:0x7a3a1a, head:0xd8b08c, beard:0x8a5a3a, scale:0.9}, desc:'A dwarven martial artist. Lightning-fast fists and very hard to hit.' },
  golem:   { name:'Golem', hp:120, def:15, att:28, dmg:[25,30], dr:[0,12], exp:12, max:22, atkDelay:1.5, loot:0.2, lootK:'weapon',
             model:{k:'golem', c:0x8a8270, c2:0x60e0ff, scale:1.35}, desc:'A towering construct of enchanted stone. Slow to swing, but devastating.' },
  king:    { name:'King of Dwarves', hp:300, def:22, att:26, dmg:[15,25], dr:[0,10], exp:40, max:30, boss:true,
             model:{k:'humanoid', c:0x4a4038, c2:0x2a2420, head:0x6a6e78, eye:0xc070ff, robe:true, collar:0x8a7a5a, halo:0xc070ff, core:0xc070ff, weapon:'staff', glow:0xd090ff, scale:1.3}, desc:'The last king of the dwarves, now a necromancer. He calls his dead subjects to his side.' },

  succubus:{ name:'Succubus', hp:80, def:25, att:40, dmg:[25,30], dr:[0,10], exp:12, max:25, charm:true, drain:true, loot:0.33, lootK:'scroll',
             model:{k:'humanoid', c:0x9a2a5a, c2:0x2a0a1a, head:0xe0a0b0, horns:0x2a0a1a, wings:0x5a1a2a, scale:1.0}, desc:'A demon that charms its prey and drinks their vitality.' },
  eye:     { name:'Evil Eye', hp:100, def:20, att:30, dmg:[20,30], dr:[0,10], exp:13, max:26, flying:true, beam:true, loot:0.5, lootK:'potion',
             model:{k:'eye', c:0x6a1a2a, c2:0xffd040}, desc:'A floating eye that charges a deadly beam. Break its line of sight while it gathers power.' },
  scorpio: { name:'Scorpio', hp:110, def:24, att:36, dmg:[30,40], dr:[0,16], exp:14, max:27, ranged:{range:6, dmg:[30,40], kind:'spit', chance:0.5, effect:'cripple'}, keepAway:2, loot:0.5, lootK:'potion:healing',
             model:{k:'scorpion', c:0x5a2a1a, c2:0xff8a30}, desc:'A demonic scorpion that prefers to sting from range. Its venom cripples.' },
  ripper:  { name:'Ripper Demon', hp:60, def:22, att:30, dmg:[15,25], dr:[0,4], exp:9, max:26, leap:true,
             model:{k:'quad', c:0x4a1a1a, c2:0xff3030, scale:0.9}, desc:'A small, vicious demon that leaps across the room to tear at you.' },
  larva:   { name:"God's Larva", hp:20, def:12, att:30, dmg:[15,25], dr:[0,4], exp:5, max:30,
             model:{k:'blob', c:0x5a3a5a, c2:0xff60a0, scale:0.6}, desc:'A writhing spawn of the Old God.' },
  fistb:   { name:'Burning Fist', hp:180, def:20, att:36, dmg:[18,32], dr:[0,15], exp:0, max:30, burns:true, ranged:{range:5, dmg:[15,25], kind:'fire', chance:0.3}, bossMinion:true,
             model:{k:'fist', c:0x2e2622, c2:0xffa030}, desc:'A floating claw wreathed in flame, bound to Yog-Dzewa.' },
  fistr:   { name:'Rotting Fist', hp:180, def:20, att:36, dmg:[18,32], dr:[0,15], exp:0, max:30, poison:true, bossMinion:true,
             model:{k:'fist', c:0x26301f, c2:0xa0ff50}, desc:'A floating claw oozing rot, bound to Yog-Dzewa.' },
  yog:     { name:'Yog-Dzewa', hp:600, def:0, att:0, dmg:[0,0], dr:[0,0], exp:50, max:30, boss:true, immobile:true,
             model:{k:'yog', c:0x16121c, c2:0xff4a28}, desc:'The Old God, sealed in living stone beneath the dungeon. Destroy its guardians before you can harm it.' },

  image:   { name:'Mirror Image', hp:1, def:10, att:10, dmg:[1,4], dr:[0,0], exp:0, max:0, ally:true,
             model:{k:'hero'}, desc:'A magical copy of you. It fades on the first hit.' },
  keeper:  { name:'Shopkeeper', hp:9999, def:999, att:0, dmg:[0,0], dr:[0,0], exp:0, max:0, passive:true,
             model:{k:'humanoid', c:0x7a5a2a, c2:0xd8c070, head:0xd8b08c, beard:0x9a7a5a, hat:0x5a3a1a, scale:0.95}, desc:'A merchant who somehow does business this deep. Walk onto an item to buy it, or tap the shopkeeper to sell.' }
};

const MOB_ROTATION = {
  1:['rat','rat','rat','snake'], 2:['rat','rat','snake','gnoll','gnoll'], 3:['rat','snake','gnoll','gnoll','gnoll','swarm','crab'],
  4:['gnoll','swarm','crab','crab','slime','slime'],
  6:['skeleton','skeleton','skeleton','thief','swarm'], 7:['skeleton','skeleton','skeleton','thief','dm100','guard'],
  8:['skeleton','skeleton','thief','dm100','dm100','guard','guard','necro'], 9:['skeleton','thief','dm100','dm100','guard','guard','necro','necro'],
  11:['bat','bat','bat','brute','shaman'], 12:['bat','bat','brute','brute','shaman','spinner'], 13:['bat','brute','brute','shaman','shaman','spinner','spinner','dm200'],
  14:['bat','brute','shaman','shaman','spinner','spinner','dm200','dm200'],
  16:['ghoul','ghoul','ghoul','elemental','warlock'], 17:['ghoul','elemental','elemental','warlock','monk'], 18:['ghoul','elemental','warlock','warlock','monk','monk','golem'],
  19:['elemental','warlock','warlock','monk','monk','golem','golem','golem'],
  21:['succubus','succubus','eye'], 22:['succubus','eye','ripper'], 23:['succubus','eye','eye','scorpio','ripper'], 24:['succubus','eye','eye','scorpio','scorpio','scorpio','ripper'],
};
function mobRotation(d){ return MOB_ROTATION[d] || MOB_ROTATION[d-1] || MOB_ROTATION[24]; }

// ---------- Weapons ----------
// min = tier+lvl ; max = base*(tier+1) + lvl*(tier+1)
const WEAPONS = {
  wornsword:{ name:'Worn Shortsword', tier:1, shape:'sword', desc:'A battered old shortsword. Reliable enough to start a career of adventuring.' },
  dagger:   { name:'Dagger', tier:1, base:4, sneak:true, shape:'dagger', desc:'A simple blade. Surprise attacks with it always deal near-maximum damage.' },
  gloves:   { name:'Studded Gloves', tier:1, base:3, delay:0.5, shape:'gloves', desc:'Fists reinforced with studs. Weak, but you strike twice as fast.' },
  staff:    { name:"Mage's Staff", tier:1, base:4, shape:'staff', staff:true, unique:true, desc:'A staff with a wand of magic missile set in its head. Zap it to fire a bolt; upgrades boost both the staff and the wand.' },
  shortsword:{name:'Shortsword', tier:2, shape:'sword', desc:'A sturdy, well-balanced blade.' },
  handaxe:  { name:'Hand Axe', tier:2, base:4, acc:1.32, shape:'axe', desc:'A light axe. Its weight makes it unusually accurate but a little less deadly.' },
  spear:    { name:'Spear', tier:2, base:6, delay:1.5, reach:2, shape:'spear', desc:'A long spear that strikes enemies two tiles away. Slow to recover.' },
  quarterstaff:{ name:'Quarterstaff', tier:2, base:4, block:2, shape:'staff2', desc:'A thick staff that helps parry blows, reducing damage taken.' },
  sword:    { name:'Sword', tier:3, shape:'sword', desc:'A classic soldier\'s sword.' },
  mace:     { name:'Mace', tier:3, base:4, acc:1.28, shape:'mace', desc:'A heavy, flanged mace. Accurate, if a bit less damaging.' },
  scimitar: { name:'Scimitar', tier:3, base:4, delay:0.8, shape:'scimitar', desc:'A curved blade that is quick to swing.' },
  longsword:{ name:'Longsword', tier:4, shape:'sword', desc:'A long, two-handed sword of fine steel.' },
  battleaxe:{ name:'Battle Axe', tier:4, base:4, acc:1.24, shape:'axe', desc:'A great axe that rarely misses.' },
  flail:    { name:'Flail', tier:4, base:7, acc:0.8, shape:'mace', desc:'A spiked ball on a chain. Huge damage but hard to aim.' },
  greatsword:{name:'Greatsword', tier:5, shape:'sword', desc:'A massive blade only the strongest can wield.' },
  warhammer:{ name:'War Hammer', tier:5, base:4, acc:1.2, shape:'hammer', desc:'A huge hammer, steady and accurate.' },
  glaive:   { name:'Glaive', tier:5, base:6, delay:1.5, reach:2, shape:'spear', desc:'A polearm with a heavy blade that reaches two tiles.' },
};
const WEAPON_TIERS = { 1:['dagger','gloves','wornsword'], 2:['shortsword','handaxe','spear','quarterstaff'], 3:['sword','mace','scimitar'], 4:['longsword','battleaxe','flail'], 5:['greatsword','warhammer','glaive'] };
const TIER_PROBS = [ [0,75,20,4,1], [0,25,50,20,5], [0,0,40,50,10], [0,0,20,40,40], [0,0,0,20,80] ];
const ARMORS = {
  cloth:  { name:'Cloth Armor', tier:1, desc:'Thin padded cloth. Better than nothing.' },
  leather:{ name:'Leather Armor', tier:2, desc:'Boiled leather, light and supple.' },
  mail:   { name:'Mail Armor', tier:3, desc:'Interlocking metal rings that turn aside blades.' },
  scale:  { name:'Scale Armor', tier:4, desc:'Overlapping metal scales sewn onto leather.' },
  plate:  { name:'Plate Armor', tier:5, desc:'Full plate. Heavy, and very hard to get through.' },
};
const ARMOR_BY_TIER = ['', 'cloth','leather','mail','scale','plate'];
const MISSILES = {
  stone:   { name:'Throwing Stone', tier:1, min:2, max:5, brk:0, desc:'A smooth stone that fits the hand. It never breaks.' },
  knife:   { name:'Throwing Knife', tier:1, min:2, max:6, brk:0.1, sneak:true, desc:'A balanced knife. Surprise throws deal extra damage.' },
  dart:    { name:'Dart', tier:1, min:1, max:4, brk:0.15, desc:'A small, sharp dart.' },
  shuriken:{ name:'Shuriken', tier:2, min:4, max:8, brk:0.1, delay:0.5, desc:'A star-shaped blade thrown in a flick of the wrist. Very fast to throw.' },
  tomahawk:{ name:'Tomahawk', tier:3, min:6, max:15, brk:0.12, desc:'A throwing axe that bites deep.' },
  javelin: { name:'Javelin', tier:4, min:8, max:20, brk:0.12, desc:'A heavy throwing spear.' },
};
const MISSILE_TIERS = {1:['stone','knife','dart'], 2:['shuriken','dart'], 3:['tomahawk','shuriken'], 4:['javelin','tomahawk'], 5:['javelin']};

// ---------- Potions, scrolls, rings, wands ----------
const POTIONS = {
  healing:   { name:'Healing', prob:3, good:true, val:30, desc:'Mends wounds instantly and cures most ailments.' },
  strength:  { name:'Strength', prob:0, good:true, val:50, desc:'Permanently increases your strength by one point.' },
  experience:{ name:'Experience', prob:1, good:true, val:50, desc:'Grants an entire level of experience.' },
  mindvision:{ name:'Mind Vision', prob:2, good:true, val:30, desc:'Lets you sense every creature on the floor for a while.' },
  invisibility:{ name:'Invisibility', prob:1, good:true, val:40, desc:'You vanish from sight for a while. Monsters lose track of you.' },
  haste:     { name:'Haste', prob:1, good:true, val:40, desc:'You move three times as fast for a short time.' },
  levitation:{ name:'Levitation', prob:1, good:true, val:35, desc:'You float above the ground, safe from traps and water.' },
  flame:     { name:'Liquid Flame', prob:2, good:false, val:30, desc:'Bursts into flames when the bottle breaks. Best thrown.' },
  toxic:     { name:'Toxic Gas', prob:2, good:false, val:30, desc:'Releases a cloud of poisonous gas. Throw it at enemies.' },
  paralytic: { name:'Paralytic Gas', prob:1, good:false, val:40, desc:'Releases a gas that freezes muscles in place. Throw it.' },
  frost:     { name:'Frost', prob:2, good:false, val:30, desc:'Flash-freezes everything nearby when shattered.' },
  purity:    { name:'Purity', prob:1, good:true, val:40, desc:'Cleanses nearby gases and protects you from them for a while.' },
};
const POTION_COLORS = { crimson:'#d22b2b', amber:'#f09a1c', golden:'#f2d23a', jade:'#2fae5f', turquoise:'#2fc9c2', azure:'#3a7fe0',
  indigo:'#5a3fc8', magenta:'#d43aa8', bistre:'#7a4a28', charcoal:'#3a3a3e', silver:'#c8ccd4', ivory:'#efe6c8' };
const SCROLLS = {
  upgrade:     { name:'Upgrade', prob:0, val:50, desc:'Permanently improves one item by one level and dispels its curse.' },
  identify:    { name:'Identify', prob:3, val:30, desc:'Reveals the true nature of one item.' },
  removecurse: { name:'Remove Curse', prob:2, val:30, desc:'Lifts curses from all of your equipment.' },
  mapping:     { name:'Magic Mapping', prob:1, val:40, desc:'Reveals the layout of the floor, including secret doors.' },
  teleport:    { name:'Teleportation', prob:1, val:40, desc:'Whisks you to a random location on the floor.' },
  lullaby:     { name:'Lullaby', prob:1, val:40, desc:'A soothing melody puts nearby creatures to sleep.' },
  rage:        { name:'Rage', prob:1, val:40, desc:'An awful shriek. Every monster on the floor rushes toward you, and nearby ones turn on each other.' },
  terror:      { name:'Terror', prob:1, val:40, desc:'Fills nearby enemies with dread, making them flee.' },
  recharging:  { name:'Recharging', prob:1, val:40, desc:'Restores all charges of your wands and magical gear.' },
  mirror:      { name:'Mirror Image', prob:2, val:40, desc:'Creates two illusory copies of you that fight at your side.' },
  retribution: { name:'Retribution', prob:1, val:40, desc:'Unleashes holy force on everything you can see. Stronger the more hurt you are.' },
  transmute:   { name:'Transmutation', prob:1, val:40, desc:'Turns one item into a different item of the same kind.' },
};
const SCROLL_RUNES = ['KAUNAN','SOWILO','LAGUZ','YNGVI','GYFU','RAIDO','ISAZ','MANNAZ','NAUDIZ','BERKANAN','ODAL','TIWAZ'];
const RINGS = {
  accuracy: { name:'Accuracy', desc:'Makes your attacks more accurate.' },
  evasion:  { name:'Evasion', desc:'Helps you dodge attacks.' },
  haste:    { name:'Haste', desc:'Lets you move faster.' },
  might:    { name:'Might', desc:'Grants extra strength and health.' },
  tenacity: { name:'Tenacity', desc:'Reduces damage taken, more so when you are badly hurt.' },
  wealth:   { name:'Wealth', desc:'Monsters drop items and gold more often.' },
  energy:   { name:'Energy', desc:'Wands and magical items recharge faster.' },
};
const RING_GEMS = { garnet:'#b8233a', ruby:'#e01e3c', topaz:'#f2a31c', emerald:'#21b05a', onyx:'#2a2a30', opal:'#b8e0e8',
  tourmaline:'#e05aa0', sapphire:'#2a5ae0', amethyst:'#9a4ae0', quartz:'#e8e8f0', agate:'#c87a4a', diamond:'#d8f4ff' };
const WANDS = {
  missile:  { name:'Magic Missile', color:'#c49aff', desc:'Fires a bolt of pure magic.' },
  fire:     { name:'Fireblast', color:'#ff8a30', desc:'Releases a cone of flame that ignites anything it touches.' },
  lightning:{ name:'Lightning', color:'#9ae0ff', desc:'Calls down lightning that arcs between nearby targets.' },
  frost:    { name:'Frost', color:'#a0e8ff', desc:'Fires a freezing bolt that slows its target.' },
  disint:   { name:'Disintegration', color:'#ff4ad0', desc:'Fires a beam that pierces through walls and every creature in its path.' },
  blast:    { name:'Blast Wave', color:'#e8d8a0', desc:'A burst of force that blows enemies away. Slamming into walls hurts.' },
};
const WAND_WOOD = ['#6a4a2a','#8a6a3a','#4a3a2a','#9a7a5a','#5a3a3a','#7a6a5a'];
const FOODS = {
  ration: { name:'Food Ration', sat:300, val:10, desc:'Dry, dense travel food. Enough to stave off hunger for a long while.' },
  small:  { name:'Small Ration', sat:150, val:5, desc:'A small portion of travel food.' },
  pasty:  { name:'Pasty', sat:450, val:20, desc:'A hearty meat pie. Very filling.' },
  meat:   { name:'Mystery Meat', sat:150, val:5, desc:'Eat at your own risk. It might not agree with you.' },
};
const TRAPS = {
  fire:     { name:'Fire trap', color:'#ff7a2a', desc:'Bursts into flames when stepped on.' },
  poison:   { name:'Poison dart trap', color:'#9ad84a', desc:'Fires a poisoned dart.' },
  teleport: { name:'Teleportation trap', color:'#4ad0ff', desc:'Teleports whoever steps on it.' },
  alarm:    { name:'Alarm trap', color:'#ff4a4a', desc:'Shrieks loudly, alerting every monster on the floor.' },
  paralysis:{ name:'Paralytic trap', color:'#f0e04a', desc:'Releases paralytic gas.' },
  toxic:    { name:'Toxic gas trap', color:'#6ab04a', desc:'Releases a cloud of toxic gas.' },
  frost:    { name:'Chilling trap', color:'#a8e8ff', desc:'Freezes the area around it.' },
  grip:     { name:'Gripping trap', color:'#b0b0b0', desc:'Steel jaws snap shut, wounding and crippling.' },
  summon:   { name:'Summoning trap', color:'#4ae0b0', desc:'Summons monsters from elsewhere on the floor.' },
};
const TRAP_POOLS = [
  ['grip','poison','teleport','alarm','frost'],
  ['grip','poison','teleport','alarm','toxic','fire','paralysis'],
  ['fire','toxic','paralysis','summon','teleport','frost','alarm'],
  ['fire','toxic','paralysis','summon','frost','teleport'],
  ['fire','toxic','paralysis','summon','frost','teleport','alarm'],
];

const CLASSES = {
  warrior: { name:'Warrior', desc:'Tough and steady. Starts with a worn sword and a broken seal that shields him while his armor holds.', color:0xb8392e },
  mage:    { name:'Mage', desc:'Fights with a magic staff that fires bolts. Knows scrolls of upgrade and potions of liquid flame.', color:0x6a4ac8 },
  rogue:   { name:'Rogue', desc:'Strikes from the shadows with a dagger. His cloak turns him invisible; he spots secrets easily.', color:0x3a4250 },
  huntress:{ name:'Huntress', desc:'Shoots a spirit bow with endless arrows that grows stronger as she levels up.', color:0x3a8a4a },
};

const BUFF_INFO = {
  poison:{n:'Poisoned', c:'#94c94e'}, burning:{n:'Burning', c:'#ff8a3a'}, para:{n:'Paralyzed', c:'#f0e04a'}, frozen:{n:'Frozen', c:'#a8e8ff'},
  chill:{n:'Chilled', c:'#a8d8ff'}, cripple:{n:'Crippled', c:'#c0a080'}, weak:{n:'Weakened', c:'#b07ce0'}, rooted:{n:'Rooted', c:'#d0d0a0'},
  haste:{n:'Hasted', c:'#ffe060'}, invis:{n:'Invisible', c:'#c0d8ff'}, mind:{n:'Mind vision', c:'#c49aff'}, levit:{n:'Levitating', c:'#a0f0ff'},
  purity:{n:'Gas immune', c:'#e0f0ff'}, sleep:{n:'Asleep', c:'#8090c0'}, terror:{n:'Terrified', c:'#ff8080'}, amok:{n:'Amok', c:'#ff5050'},
  charm:{n:'Charmed', c:'#ff80c0'}, cloak:{n:'Shadows', c:'#8a9ab8'}, starving:{n:'Starving', c:'#ff6a5a'}, hungry:{n:'Hungry', c:'#f2b24c'}
};
// ============================================================
// LEVEL GENERATION
// ============================================================
function newLevel(depth, w, h){
  const n = w*h;
  return { depth, w, h, region: regionOf(depth), tiles: new Uint8Array(n), visited: new Uint8Array(n),
    mobs: [], heaps: {}, traps: {}, fire: new Float32Array(n), toxic: new Float32Array(n), para: new Float32Array(n),
    frost: new Float32Array(n), web: new Uint8Array(n), warnings: [], torches: [], decor: [],
    entrance: -1, exit: -1, respawn: 50, mobLimit: 0, boss: null, bossDefeated: false, shop: false, arena: null, time: 0 };
}
const cidx = (L,x,y) => y*L.w + x;
const inb = (L,x,y) => x >= 0 && y >= 0 && x < L.w && y < L.h;

class MinHeap { constructor(){ this.a=[]; } push(k,v){ const a=this.a; a.push([k,v]); let i=a.length-1; while(i>0){ const p=(i-1)>>1; if(a[p][0]<=a[i][0]) break; [a[p],a[i]]=[a[i],a[p]]; i=p; } }
  pop(){ const a=this.a; const top=a[0]; const last=a.pop(); if(a.length){ a[0]=last; let i=0; for(;;){ const l=2*i+1, r=l+1; let m=i; if(l<a.length&&a[l][0]<a[m][0]) m=l; if(r<a.length&&a[r][0]<a[m][0]) m=r; if(m===i) break; [a[m],a[i]]=[a[i],a[m]]; i=m; } } return top; }
  get size(){ return this.a.length; } }

function generateLevel(depth){
  const seed = ((G.seed * 9973) ^ (depth * 7919 + 12345)) >>> 0;
  return withSeed(seed, () => {
    let L;
    if (depth >= 26) L = genLast(depth);
    else if (BOSS_DEPTHS[depth]) L = genBoss(depth);
    else { for (let i = 0; i < 80 && !L; i++) L = genRegular(depth); }
    if (!L) throw new Error('Level generation failed');
    return L;
  });
}

function genRegular(depth){
  const W = 44, H = 44;
  const L = newLevel(depth, W, H);
  const t = L.tiles;
  const reg = L.region;
  const rooms = [];
  const target = 9 + R.int(4) + Math.min(3, Math.floor(depth/6));
  for (let tries = 0; rooms.length < target && tries < 500; tries++){
    let w = R.range(4, 8), h = R.range(4, 7);
    const roll = R.f();
    if (roll < 0.15){ w = R.range(3,4); h = R.range(3,4); }
    else if (roll > 0.86){ w = R.range(8,12); h = R.range(7,10); }
    const x = R.range(2, W - w - 3), y = R.range(2, H - h - 3);
    let ok = true;
    for (const r of rooms) if (x - 3 < r.x + r.w && x + w + 3 > r.x && y - 3 < r.y + r.h && y + h + 3 > r.y){ ok = false; break; }
    if (ok) rooms.push({ x, y, w, h, id: rooms.length, cx: x + (w>>1), cy: y + (h>>1), doors: [], links: [], type: 'normal' });
  }
  if (rooms.length < 6) return null;
  const inside = new Int16Array(W*H).fill(-1), perim = new Int16Array(W*H).fill(-1), corner = new Uint8Array(W*H);
  for (const r of rooms){
    for (let yy = r.y - 1; yy <= r.y + r.h; yy++) for (let xx = r.x - 1; xx <= r.x + r.w; xx++){
      const c = cidx(L,xx,yy);
      if (xx >= r.x && xx < r.x + r.w && yy >= r.y && yy < r.y + r.h){ inside[c] = r.id; t[c] = T.FLOOR; }
      else { perim[c] = r.id; if ((xx === r.x-1 || xx === r.x+r.w) && (yy === r.y-1 || yy === r.y+r.h)) corner[c] = 1; }
    }
  }
  // MST (Prim) + extra loops
  const edges = [];
  const inTree = new Set([0]);
  while (inTree.size < rooms.length){
    let best = null, bd = 1e9;
    for (const a of inTree) for (const b of rooms){ if (inTree.has(b.id)) continue;
      const d = dist2(rooms[a].cx, rooms[a].cy, b.cx, b.cy); if (d < bd){ bd = d; best = [a, b.id]; } }
    edges.push(best); inTree.add(best[1]);
  }
  let extra = 0;
  for (let i = 0; i < rooms.length; i++) for (let j = i+1; j < rooms.length; j++){
    if (edges.some(e => (e[0]===i&&e[1]===j)||(e[0]===j&&e[1]===i))) continue;
    if (dist2(rooms[i].cx, rooms[i].cy, rooms[j].cx, rooms[j].cy) < 18*18 && R.chance(0.2) && extra < rooms.length/3){ edges.push([i,j]); extra++; }
  }
  const corr = new Uint8Array(W*H);
  for (const [ia, ib] of edges){
    const a = rooms[ia], b = rooms[ib];
    const path = astarCorr(L, a, b, inside, perim, corner, corr);
    if (!path) continue;
    for (const c of path){
      if (perim[c] >= 0){ if (t[c] !== T.DOOR){ t[c] = T.DOOR; rooms[perim[c]].doors.push(c); } }
      else if (inside[c] < 0){ t[c] = T.FLOOR; corr[c] = 1; }
    }
    a.links.push(ib); b.links.push(ia);
  }
  // connectivity
  const reach = floodPass(L, cidx(L, rooms[0].cx, rooms[0].cy));
  for (const r of rooms) if (!reach[cidx(L, r.cx, r.cy)]) return null;
  // stairs rooms
  const entR = R.pick(rooms.filter(r => r.w*r.h <= 49)) || rooms[0];
  const dmap = floodDist(L, cidx(L, entR.cx, entR.cy));
  let exR = null, bestD = -1;
  for (const r of rooms){ if (r === entR) continue; const d = dmap[cidx(L, r.cx, r.cy)]; if (d > bestD){ bestD = d; exR = r; } }
  entR.type = 'entrance'; exR.type = 'exit';
  // special rooms
  const leaves = R.shuffle(rooms.filter(r => r.type === 'normal' && r.doors.length === 1));
  if ([6,11,16,21].includes(depth)){
    let sr = leaves.find(r => r.w*r.h >= 16 && r.w >= 4 && r.h >= 4) || rooms.find(r => r.type === 'normal' && r.w*r.h >= 16);
    if (sr){ sr.type = 'shop'; L.shop = true; leaves.splice(leaves.indexOf(sr), 1); }
  }
  let vault = null, secret = null;
  if (leaves.length && R.chance(0.65)){ vault = leaves.shift(); vault.type = 'vault'; t[vault.doors[0]] = T.LOCKED; }
  if (leaves.length && R.chance(0.4)){ secret = leaves.shift(); secret.type = 'secret'; t[secret.doors[0]] = T.SECRET; }
  // decorate rooms
  const waterP = [0.45, 0.15, 0.25, 0.15, 0.10][reg], grassP = [0.25, 0.1, 0.45, 0.15, 0.1][reg];
  for (const r of rooms){
    if (r.type === 'shop' || r.type === 'vault'){ for (let yy=r.y; yy<r.y+r.h; yy++) for (let xx=r.x; xx<r.x+r.w; xx++) t[cidx(L,xx,yy)] = T.SPFLOOR; continue; }
    if (R.chance(waterP)) patch(L, r, T.WATER, R.range(1,2));
    if (R.chance(grassP)) patch(L, r, T.HGRASS, R.range(1,3));
    if (reg === 4 && R.chance(0.4)) patch(L, r, T.EMBERS, 2);
    if (reg === 3 && R.chance(0.3) && r.w >= 5 && r.h >= 5){ for (let yy=r.y+1; yy<r.y+r.h-1; yy++) for (let xx=r.x+1; xx<r.x+r.w-1; xx++) t[cidx(L,xx,yy)] = T.SPFLOOR; }
    if (r.w >= 7 && r.h >= 7 && R.chance(reg === 3 ? 0.6 : 0.35)){
      for (const [sx, sy] of [[r.x+1,r.y+1],[r.x+r.w-2,r.y+1],[r.x+1,r.y+r.h-2],[r.x+r.w-2,r.y+r.h-2]]) t[cidx(L,sx,sy)] = T.STATUE;
    }
    if (reg === 1 && r.w >= 5 && R.chance(0.25)){ // prison library shelves along top wall
      for (let xx = r.x+1; xx < r.x+r.w-1; xx++){ const c = cidx(L, xx, r.y-1); if (t[c] === T.EMPTY && perim[c] === r.id && !corner[c]) t[c] = T.BOOKSHELF; }
    }
  }
  // walls
  buildWalls(L);
  // torches: one or two per room on top/side walls
  for (const r of rooms){
    const cand = [];
    for (let xx = r.x; xx < r.x + r.w; xx++){ cand.push([xx, r.y-1, 0, 1]); cand.push([xx, r.y+r.h, 0, -1]); }
    for (let yy = r.y; yy < r.y + r.h; yy++){ cand.push([r.x-1, yy, 1, 0]); cand.push([r.x+r.w, yy, -1, 0]); }
    R.shuffle(cand);
    let n = r.w*r.h > 30 ? 2 : 1;
    for (const [x, y, fx, fy] of cand){ if (n <= 0) break;
      const c = cidx(L,x,y); if (t[c] !== T.WALL) continue;
      if (!TP.pass[t[cidx(L, x+fx, y+fy)]]) continue;
      t[c] = T.WALL_DECO; L.torches.push({ c, fx, fy }); n--; }
  }
  // stairs
  L.entrance = placeInRoom(L, entR, true); t[L.entrance] = T.ENTRANCE;
  L.exit = placeInRoom(L, exR, true); t[L.exit] = T.EXIT;
  L.rooms = rooms.map(r => ({ x:r.x, y:r.y, w:r.w, h:r.h, type:r.type }));
  // traps
  const nTraps = Math.min(9, R.range(1, 3) + Math.floor(depth/3));
  const pool = TRAP_POOLS[reg];
  for (let i = 0, tries = 0; i < nTraps && tries < 200; tries++){
    const c = R.int(W*H); const x = c % W, y = (c / W) | 0;
    if (t[c] !== T.FLOOR && t[c] !== T.GRASS) continue;
    if (inside[c] < 0 || ['shop','vault','entrance'].includes(rooms[inside[c]].type)) continue; // rooms only, never corridors (as in RegularPainter.paintTraps)
    if (cheb(x, y, L.entrance % W, (L.entrance/W)|0) < 3 || cheb(x,y, L.exit % W, (L.exit/W)|0) < 2) continue;
    if (L.traps[c]) continue;
    L.traps[c] = { t: R.pick(pool), hidden: depth > 1 ? R.chance(0.7) : R.chance(0.4), active: true };
    i++;
  }
  // items
  const normal = rooms.filter(r => r.type === 'normal' || r.type === 'exit' || r.type === 'entrance');
  const drop = (it, rr) => { const rm = rr || R.pick(normal); const c = freeCellInRoom(L, rm); if (c >= 0) addHeap(L, c, it); };
  while (posNeeded(depth)){ G.limited.pos++; drop(mkPotion('strength')); }
  while (souNeeded(depth)){ G.limited.sou++; drop(mkScroll('upgrade')); }
  if (R.chance(0.55)) drop(mkFood('ration')); else if (R.chance(0.6)) drop(mkFood(R.chance(0.3)?'pasty':'small'));
  const nItems = 3 + R.int(2) + (R.chance(0.3) ? 1 : 0);
  for (let i = 0; i < nItems; i++) drop(randomItem(depth));
  const nGold = R.range(1, 3);
  for (let i = 0; i < nGold; i++) drop(mkGold(depth));
  if (vault){
    const c = cidx(L, vault.cx, vault.cy); t[c] = T.PEDESTAL;
    addHeap(L, c, vaultItem(depth));
    if (vault.w*vault.h > 12) { const c2 = freeCellInRoom(L, vault); if (c2 >= 0) addHeap(L, c2, R.chance(0.5) ? mkGold(depth) : randomItem(depth)); }
    const keyRoom = R.pick(normal.filter(r => r !== vault));
    const kc = freeCellInRoom(L, keyRoom); addHeap(L, kc, mkKey(depth));
  }
  if (secret){
    const n = R.range(1, 3);
    for (let i = 0; i < n; i++){ const c = freeCellInRoom(L, secret); if (c >= 0) addHeap(L, c, R.chance(0.4) ? mkGold(depth) : randomItem(depth)); }
  }
  if (L.shop){ const sr = rooms.find(r => r.type === 'shop'); fillShop(L, sr, depth); }
  // mobs
  const nMobs = 3 + (depth % 5) + R.int(3);
  L.mobLimit = nMobs;
  const rot = R.shuffle(mobRotation(depth).slice());
  const ex = L.entrance % W, ey = (L.entrance / W) | 0;
  for (let i = 0, tries = 0; i < nMobs && tries < 500; tries++){
    const c = R.int(W*H); const x = c % W, y = (c/W)|0;
    if (!TP.pass[t[c]] || t[c] === T.DOOR || t[c] === T.ENTRANCE) continue;
    if (inside[c] >= 0 && ['entrance','shop','vault','secret'].includes(rooms[inside[c]].type)) continue;
    if (cheb(x, y, ex, ey) < 9) continue;
    if (mobAt(L, x, y)) continue;
    const m = mkMob(rot[i % rot.length], x, y);
    m.state = R.chance(0.6) ? 'sleeping' : 'wandering';
    L.mobs.push(m); i++;
  }
  return L;
}

function astarCorr(L, a, b, inside, perim, corner, corr){
  const W = L.w, H = L.h, t = L.tiles;
  const start = cidx(L, a.cx, a.cy), goal = cidx(L, b.cx, b.cy);
  const g = new Float32Array(W*H).fill(1e9), from = new Int32Array(W*H).fill(-1);
  const heap = new MinHeap(); g[start] = 0; heap.push(0, start);
  const gx = b.cx, gy = b.cy;
  while (heap.size){
    const [, c] = heap.pop();
    if (c === goal) break;
    const x = c % W, y = (c/W)|0;
    for (const [dx, dy] of DIRS4){
      const nx = x+dx, ny = y+dy;
      if (nx < 1 || ny < 1 || nx >= W-1 || ny >= H-1) continue;
      const n = ny*W + nx;
      let cost;
      if (inside[n] >= 0) cost = (inside[n] === a.id || inside[n] === b.id) ? 1 : -1;
      else if (perim[n] >= 0){
        if (perim[n] !== a.id && perim[n] !== b.id) cost = -1;
        else if (corner[n]) cost = -1;
        else if (t[n] === T.DOOR) cost = 1;
        else {
          cost = 12;
          for (const [ex, ey] of DIRS4){ const m = (ny+ey)*W + nx+ex; if (t[m] === T.DOOR) cost = 60; }
        }
      } else cost = corr[n] ? 1 : 2.5;
      if (cost < 0) continue;
      const ng = g[c] + cost;
      if (ng < g[n]){ g[n] = ng; from[n] = c; heap.push(ng + Math.abs(nx-gx) + Math.abs(ny-gy), n); }
    }
  }
  if (from[goal] < 0) return null;
  const path = []; for (let c = goal; c !== start && c >= 0; c = from[c]) path.push(c);
  return path;
}

function patch(L, r, tile, count){
  for (let k = 0; k < count; k++){
    const px = R.range(r.x, r.x + r.w - 1), py = R.range(r.y, r.y + r.h - 1);
    const rad = R.float(1.2, Math.max(1.8, Math.min(r.w, r.h) * 0.55));
    for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++){
      const d = Math.sqrt(dist2(xx, yy, px, py)) + (hash2(xx, yy, L.depth) - 0.5) * 1.2;
      const c = cidx(L, xx, yy);
      if (d < rad && L.tiles[c] === T.FLOOR) L.tiles[c] = tile;
      else if (tile === T.HGRASS && d < rad + 1 && L.tiles[c] === T.FLOOR) L.tiles[c] = T.GRASS;
    }
  }
}
function buildWalls(L){
  const t = L.tiles, W = L.w, H = L.h;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
    const c = y*W + x; if (t[c] !== T.EMPTY) continue;
    let near = false;
    for (const [dx,dy] of DIRS8){ const nx=x+dx, ny=y+dy; if (nx<0||ny<0||nx>=W||ny>=H) continue; const v = t[ny*W+nx]; if (v !== T.EMPTY && !TP.wall[v]) { near = true; break; } }
    if (near) t[c] = T.WALL;
  }
}
function placeInRoom(L, r, avoidDoors){
  for (let tries = 0; tries < 200; tries++){
    const x = R.range(r.x + (r.w > 3 ? 1 : 0), r.x + r.w - 1 - (r.w > 3 ? 1 : 0)), y = R.range(r.y + (r.h > 3 ? 1 : 0), r.y + r.h - 1 - (r.h > 3 ? 1 : 0));
    const c = cidx(L, x, y);
    if (L.tiles[c] === T.STATUE || L.tiles[c] === T.WATER) continue;
    if (avoidDoors){ let bad = false; for (const [dx,dy] of DIRS8){ const v = L.tiles[cidx(L,x+dx,y+dy)]; if (v === T.DOOR || v === T.LOCKED || v === T.SECRET) bad = true; } if (bad && tries < 150) continue; }
    return c;
  }
  return cidx(L, r.cx, r.cy);
}
function freeCellInRoom(L, r){
  for (let tries = 0; tries < 100; tries++){
    const x = R.range(r.x, r.x + r.w - 1), y = R.range(r.y, r.y + r.h - 1);
    const c = cidx(L, x, y);
    const v = L.tiles[c];
    if (!TP.pass[v] || v === T.ENTRANCE || v === T.EXIT || v === T.DOOR) continue;
    if (L.heaps[c] || L.traps[c]) continue;
    return c;
  }
  return -1;
}
function floodPass(L, start){
  const seen = new Uint8Array(L.w*L.h); const q = [start]; seen[start] = 1;
  while (q.length){ const c = q.pop(); const x = c % L.w, y = (c/L.w)|0;
    for (const [dx,dy] of DIRS4){ const n = cidx(L,x+dx,y+dy); if (!seen[n] && (TP.pass[L.tiles[n]] || L.tiles[n]===T.LOCKED || L.tiles[n]===T.SECRET || L.tiles[n]===T.STATUE)){ seen[n]=1; q.push(n); } } }
  return seen;
}
function floodDist(L, start){
  const d = new Int32Array(L.w*L.h).fill(-1); const q = [start]; d[start] = 0;
  for (let i = 0; i < q.length; i++){ const c = q[i]; const x = c % L.w, y = (c/L.w)|0;
    for (const [dx,dy] of DIRS4){ const n = cidx(L,x+dx,y+dy); if (d[n] < 0 && TP.pass[L.tiles[n]]){ d[n] = d[c]+1; q.push(n); } } }
  return d;
}
function addHeap(L, c, item){ if (!item) return; (L.heaps[c] || (L.heaps[c] = [])).push(item); }

function posNeeded(depth){
  const left = 2 - (G.limited.pos - Math.floor(depth/5)*2);
  if (left <= 0) return false;
  const f = depth % 5;
  let target = 2 - Math.floor(f/2);
  if (f % 2 === 1 && R.int(2) === 0) target--;
  return target < left;
}
function souNeeded(depth){
  const left = 3 - (G.limited.sou - Math.floor(depth/5)*3);
  if (left <= 0) return false;
  const f = depth % 5;
  return R.int(5 - f) < left;
}

function fillShop(L, r, depth){
  const kc = cidx(L, r.cx, r.y);
  const keeper = mkMob('keeper', r.cx, r.y); keeper.state = 'passive'; L.mobs.push(keeper);
  const stock = [];
  const tier = clamp(regionOf(depth) + 2, 2, 5);
  stock.push(mkArmor(ARMOR_BY_TIER[tier], 0));
  stock.push(mkWeapon(R.pick(WEAPON_TIERS[tier]), 0));
  stock.push(mkFood('ration'));
  stock.push(mkPotion('healing'));
  stock.push(mkPotion(randomPotionType()));
  stock.push(mkScroll(R.chance(0.5) ? 'identify' : 'removecurse'));
  stock.push(mkScroll(randomScrollType()));
  stock.push(mkMissile(R.pick(MISSILE_TIERS[Math.min(5, tier)]), R.range(3,5)));
  if (R.chance(0.5)) stock.push(mkWand(R.pick(Object.keys(WANDS)), 0));
  else stock.push(mkRing(R.pick(Object.keys(RINGS)), 1));
  for (const it of stock){
    it.cursed = false; if (it.lvl < 0) it.lvl = 0;
    it.price = Math.max(10, Math.round(itemValue(it) * 5 * (Math.floor(depth/5) + 1)));
    let c = -1;
    for (let k = 0; k < 60 && c < 0; k++){ const cc = freeCellInRoom(L, r); if (cc >= 0 && cc !== kc && cheb(cc%L.w, (cc/L.w)|0, r.cx, r.y) > 0) c = cc; }
    if (c >= 0) addHeap(L, c, it);
  }
}

function genBoss(depth){
  const W = 33, H = 40;
  const L = newLevel(depth, W, H);
  const t = L.tiles;
  const boss = BOSS_DEPTHS[depth];
  const room = (x0,y0,x1,y1,tile) => { for (let y=y0;y<=y1;y++) for (let x=x0;x<=x1;x++) t[cidx(L,x,y)] = tile; };
  // entrance room
  room(14, 32, 18, 36, T.FLOOR);
  // corridor + doors
  room(16, 29, 16, 30, T.FLOOR); t[cidx(L,16,31)] = T.DOOR; t[cidx(L,16,28)] = T.DOOR;
  // arena
  const ax0 = 8, ay0 = 11, ax1 = 24, ay1 = 27;
  room(ax0, ay0, ax1, ay1, T.FLOOR);
  L.arena = { x0: ax0, y0: ay0, x1: ax1, y1: ay1 };
  // exit room
  room(14, 3, 18, 7, T.FLOOR); t[cidx(L,16,8)] = T.DOOR; t[cidx(L,16,9)] = T.FLOOR; t[cidx(L,16,10)] = T.DOOR;
  L.entrance = cidx(L, 16, 35); t[L.entrance] = T.ENTRANCE;
  L.exit = cidx(L, 16, 4); t[L.exit] = T.SEALED;
  const cx = 16, cy = 19;
  if (boss === 'goo'){
    for (const [px,py] of [[11,14],[21,14],[11,24],[21,24],[16,19]]){ for (let y=py-1;y<=py+1;y++) for (let x=px-1;x<=px+1;x++) if (hash2(x,y,5) < 0.85) t[cidx(L,x,y)] = T.WATER; }
    for (let i=0;i<30;i++){ const x=R.range(ax0,ax1), y=R.range(ay0,ay1); if (t[cidx(L,x,y)]===T.FLOOR) t[cidx(L,x,y)] = R.chance(0.5)?T.HGRASS:T.GRASS; }
  } else if (boss === 'tengu'){
    for (let y=ay0;y<=ay1;y++) for (let x=ax0;x<=ax1;x++) if ((x+y)%2===0) t[cidx(L,x,y)] = T.SPFLOOR;
    for (const [sx,sy] of [[11,14],[21,14],[11,24],[21,24]]) t[cidx(L,sx,sy)] = T.STATUE;
  } else if (boss === 'dm300'){
    for (let i=0;i<10;i++){ const x=R.range(ax0+2,ax1-2), y=R.range(ay0+2,ay1-2); if (cheb(x,y,cx,cy)>2 && x!==16) t[cidx(L,x,y)] = T.STATUE; }
    for (let i=0;i<40;i++){ const x=R.range(ax0,ax1), y=R.range(ay0,ay1); if (t[cidx(L,x,y)]===T.FLOOR) t[cidx(L,x,y)] = R.chance(0.6)?T.GRASS:T.HGRASS; }
  } else if (boss === 'king'){
    for (let y=ay0;y<=ay1;y++) for (let x=14;x<=18;x++) t[cidx(L,x,y)] = T.SPFLOOR;
    for (let y=ay0+2;y<=ay1-2;y+=3){ t[cidx(L,11,y)] = T.STATUE; t[cidx(L,21,y)] = T.STATUE; }
    t[cidx(L,16,ay0+2)] = T.THRONE;
  } else if (boss === 'yog'){
    for (let y=ay0;y<=ay1;y++) for (let x=ax0;x<=ax1;x++) if (hash2(x,y,25) < 0.35) t[cidx(L,x,y)] = T.EMBERS;
  }
  buildWalls(L);
  // torches along arena walls
  for (let x = ax0+1; x <= ax1-1; x += 4){ const c = cidx(L,x,ay0-1); if (t[c]===T.WALL){ t[c]=T.WALL_DECO; L.torches.push({c, fx:0, fy:1}); } }
  for (let y = ay0+2; y <= ay1-2; y += 5){ for (const [x,fx] of [[ax0-1,1],[ax1+1,-1]]){ const c = cidx(L,x,y); if (t[c]===T.WALL){ t[c]=T.WALL_DECO; L.torches.push({c, fx, fy:0}); } } }
  { const c = cidx(L,15,31); if (t[c]===T.WALL){ t[c]=T.WALL_DECO; L.torches.push({c, fx:0, fy:1}); } }
  L.rooms = [{x:14,y:32,w:5,h:5,type:'entrance'},{x:ax0,y:ay0,w:ax1-ax0+1,h:ay1-ay0+1,type:'arena'},{x:14,y:3,w:5,h:5,type:'exit'}];
  // boss
  let bm;
  if (boss === 'goo') bm = mkMob('goo', cx, cy);
  else if (boss === 'tengu') bm = mkMob('tengu', cx, 15);
  else if (boss === 'dm300') bm = mkMob('dm300', cx, 16);
  else if (boss === 'king') bm = mkMob('king', cx, ay0+3);
  else if (boss === 'yog'){
    bm = mkMob('yog', cx, 14);
    const f1 = mkMob('fistb', 12, 17), f2 = mkMob('fistr', 20, 17);
    f1.state = f2.state = 'sleeping'; f1.bossWake = f2.bossWake = true;
    L.mobs.push(f1, f2);
  }
  bm.state = 'sleeping'; bm.bossWake = true;
  L.mobs.push(bm); L.boss = bm.id;
  L.mobLimit = 0;
  // a little help before the fight
  addHeap(L, cidx(L, 15, 33), R.chance(0.5) ? mkFood('ration') : mkPotion('healing'));
  return L;
}

function genLast(depth){
  const W = 23, H = 23;
  const L = newLevel(depth, W, H);
  const t = L.tiles;
  for (let y = 6; y <= 16; y++) for (let x = 6; x <= 16; x++) t[cidx(L,x,y)] = (Math.abs(x-11)+Math.abs(y-11) < 4) ? T.SPFLOOR : T.EMBERS;
  for (let y = 17; y <= 19; y++) t[cidx(L,11,y)] = T.FLOOR;
  t[cidx(L,11,17)] = T.DOOR;
  for (let y = 18; y <= 21; y++) for (let x = 9; x <= 13; x++) t[cidx(L,x,y)] = T.FLOOR;
  t[cidx(L,11,17)] = T.DOOR;
  buildWalls(L);
  for (const [x,y] of [[8,5],[14,5]]){ const c = cidx(L,x,y); t[c] = T.WALL_DECO; L.torches.push({c, fx:0, fy:1}); }
  for (const [x,y] of [[8,8],[14,8],[8,14],[14,14]]) t[cidx(L,x,y)] = T.STATUE;
  L.entrance = cidx(L, 11, 20); t[L.entrance] = T.ENTRANCE;
  L.exit = -1;
  const pc = cidx(L, 11, 10); t[pc] = T.PEDESTAL;
  addHeap(L, pc, mkItem('amulet', 'amulet'));
  L.rooms = [{x:6,y:6,w:11,h:11,type:'normal'}];
  return L;
}
// ============================================================
// ITEMS
// ============================================================
function mkItem(k, t, extra){ return Object.assign({ id: ++G.nid, k, t, qty: 1, lvl: 0, known: false, cursed: false, ench: null }, extra || {}); }
function rollLevel(){ let l = 0; if (R.int(4) === 0){ l++; if (R.int(5) === 0) l++; } return l; }
function mkWeapon(t, lvl){
  const it = mkItem('weapon', t);
  if (lvl === undefined){
    it.lvl = rollLevel();
    const roll = R.f();
    if (roll < 0.25){ it.cursed = true; it.lvl = -R.range(1, 2); }
    else if (roll > 0.85) it.ench = R.pick(['blazing','chilling','vampiric','shocking']);
  } else it.lvl = lvl;
  if (WEAPONS[t].staff){ it.ch = it.chMax = staffMax(it); it.partial = 0; }
  return it;
}
function mkArmor(t, lvl){
  const it = mkItem('armor', t);
  if (lvl === undefined){
    it.lvl = rollLevel();
    const roll = R.f();
    if (roll < 0.25){ it.cursed = true; it.lvl = -R.range(1, 2); }
    else if (roll > 0.85) it.ench = R.pick(['thorns','bulwark']);
  } else it.lvl = lvl;
  return it;
}
function mkMissile(t, qty){ return mkItem('missile', t, { qty: qty || R.range(2,4), known: true }); }
function mkPotion(t){ return mkItem('potion', t, { known: true }); }
function mkScroll(t){ return mkItem('scroll', t, { known: true }); }
function mkFood(t){ return mkItem('food', t, { known: true }); }
function mkGold(depth){ return mkItem('gold', 'gold', { qty: R.range(30 + depth*10, 60 + depth*20), known: true }); }
function mkKey(depth){ return mkItem('key', 'iron', { depth, known: true }); }
function mkWand(t, lvl){ const it = mkItem('wand', t, { lvl: lvl === undefined ? rollLevel() : lvl }); it.ch = it.chMax = wandMax(it); it.partial = 0; it.zaps = 0; return it; }
function mkRing(t, lvl){
  const it = mkItem('ring', t);
  if (lvl === undefined){ it.lvl = 1 + rollLevel(); if (R.chance(0.3)){ it.cursed = true; it.lvl = -R.range(1, 3); } }
  else it.lvl = lvl;
  it.worn = 0;
  return it;
}
function wandMax(it){ return (it.t === 'missile' ? 3 : 2) + Math.max(0, it.lvl); }
function staffMax(it){ return 3 + Math.max(0, it.lvl); }
function randomPotionType(){ const m = {}; for (const k in POTIONS) if (POTIONS[k].prob) m[k] = POTIONS[k].prob; return R.weighted(m); }
function randomScrollType(){ const m = {}; for (const k in SCROLLS) if (SCROLLS[k].prob) m[k] = SCROLLS[k].prob; return R.weighted(m); }
function randomTier(depth){ const p = TIER_PROBS[regionOf(depth)]; return 1 + Number(R.weighted({0:p[0],1:p[1],2:p[2],3:p[3],4:p[4]})); }
function randomItem(depth){
  const cat = R.weighted({ potion:16, scroll:16, weapon:6, armor:4, missile:4, wand:3, ring:2, food:3 });
  switch (cat){
    case 'potion': return mkPotion(randomPotionType());
    case 'scroll': return mkScroll(randomScrollType());
    case 'weapon': return mkWeapon(R.pick(WEAPON_TIERS[randomTier(depth)]));
    case 'armor': return mkArmor(ARMOR_BY_TIER[randomTier(depth)]);
    case 'missile': return mkMissile(R.pick(MISSILE_TIERS[Math.min(5, randomTier(depth))]));
    case 'wand': return mkWand(R.pick(Object.keys(WANDS)));
    case 'ring': return mkRing(R.pick(Object.keys(RINGS)));
    case 'food': return mkFood(R.chance(0.7) ? 'ration' : (R.chance(0.5) ? 'pasty' : 'small'));
  }
}
function vaultItem(depth){
  const r = R.f();
  const tier = Math.min(5, randomTier(depth) + (R.chance(0.3) ? 1 : 0));
  if (r < 0.25) return mkWand(R.pick(Object.keys(WANDS)), R.range(1,2));
  if (r < 0.45) return mkRing(R.pick(Object.keys(RINGS)), R.range(1,2));
  if (r < 0.7) { const w = mkWeapon(R.pick(WEAPON_TIERS[tier]), R.range(1,2)); if (R.chance(0.4)) w.ench = R.pick(['blazing','chilling','vampiric','shocking']); return w; }
  if (r < 0.9) { const a = mkArmor(ARMOR_BY_TIER[tier], R.range(1,2)); if (R.chance(0.3)) a.ench = R.pick(['thorns','bulwark']); return a; }
  return mkPotion(R.chance(0.5) ? 'experience' : 'healing');
}
function lootItem(kind, depth){
  if (!kind) return null;
  if (kind.startsWith('potion:')) return mkPotion(kind.split(':')[1]);
  switch (kind){
    case 'gold': return mkGold(depth);
    case 'potion': return mkPotion(randomPotionType());
    case 'scroll': return mkScroll(randomScrollType());
    case 'meat': return mkFood('meat');
    case 'food': return mkFood(R.chance(0.5) ? 'pasty' : 'ration');
    case 'weapon': return mkWeapon(R.pick(WEAPON_TIERS[randomTier(depth)]));
    case 'armor': return mkArmor(ARMOR_BY_TIER[randomTier(depth)]);
    case 'wand': return mkWand(R.pick(Object.keys(WANDS)));
    default: return randomItem(depth);
  }
}

const STACKABLE = { potion:1, scroll:1, food:1, missile:1 };
function sameStack(a, b){ return STACKABLE[a.k] && a.k === b.k && a.t === b.t; }

// ---------- identification knowledge ----------
function isTypeKnown(it){
  if (it.k === 'potion') return !!G.known.potion[it.t];
  if (it.k === 'scroll') return !!G.known.scroll[it.t];
  if (it.k === 'ring') return !!G.known.ring[it.t];
  return true;
}
function learnType(it){
  if (it.k === 'potion' && !G.known.potion[it.t]){ G.known.potion[it.t] = true; return true; }
  if (it.k === 'scroll' && !G.known.scroll[it.t]){ G.known.scroll[it.t] = true; return true; }
  if (it.k === 'ring' && !G.known.ring[it.t]){ G.known.ring[it.t] = true; return true; }
  return false;
}
function identify(it){ learnType(it); it.known = true; if (it.cursed) it.curseKnown = true; }
function levelKnown(it){ return it.known || ['potion','scroll','food','missile','gold','key','amulet','cloak','bow'].includes(it.k); }

// ---------- naming ----------
function sgn(n){ return n >= 0 ? '+' + n : String(n); }
function baseName(it){
  switch (it.k){
    case 'weapon': return WEAPONS[it.t].name;
    case 'armor': return ARMORS[it.t].name;
    case 'missile': return MISSILES[it.t].name;
    case 'potion': return isTypeKnown(it) ? 'Potion of ' + POTIONS[it.t].name : cap(G.looks.potion[it.t]) + ' potion';
    case 'scroll': return isTypeKnown(it) ? 'Scroll of ' + SCROLLS[it.t].name : 'Scroll "' + G.looks.scroll[it.t] + '"';
    case 'ring': return isTypeKnown(it) ? 'Ring of ' + RINGS[it.t].name : cap(G.looks.ring[it.t]) + ' ring';
    case 'wand': return 'Wand of ' + WANDS[it.t].name;
    case 'food': return FOODS[it.t].name;
    case 'gold': return 'Gold';
    case 'key': return 'Iron key';
    case 'amulet': return 'Amulet of Yendor';
    case 'bow': return 'Spirit Bow';
    case 'cloak': return 'Cloak of Shadows';
    case 'dew': return 'Dewdrop';
  }
  return it.k;
}
function itemName(it, withQty){
  let n = baseName(it);
  if (['weapon','armor','ring','wand','bow','cloak'].includes(it.k) && levelKnown(it) && (it.lvl !== 0 || it.k === 'ring')) n = sgn(it.lvl) + ' ' + n;
  if (it.ench && it.known){ const e = ENCH_NAMES[it.ench]; if (e) n = it.k === 'weapon' ? e + ' ' + n : n + ' of ' + e; }
  if (it.k === 'gold') return it.qty + ' gold';
  if (withQty && it.qty > 1) n = it.qty + '× ' + n;
  return n;
}
const ENCH_NAMES = { blazing:'Blazing', chilling:'Chilling', vampiric:'Vampiric', shocking:'Shocking', thorns:'Thorns', bulwark:'the Bulwark' };
const ENCH_DESC = { blazing:'It sometimes sets enemies ablaze.', chilling:'It sometimes chills enemies, slowing them.', vampiric:'It sometimes drains life from enemies to heal you.',
  shocking:'It sometimes releases lightning that arcs to nearby enemies.', thorns:'It sometimes returns damage to attackers.', bulwark:'It is reinforced with an extra layer of protection.' };

function itemValue(it){
  const lv = Math.max(0, it.lvl || 0);
  switch (it.k){
    case 'weapon': return 20 * WEAPONS[it.t].tier * (1 + lv) * (it.cursed ? 0.5 : 1);
    case 'armor': return 20 * ARMORS[it.t].tier * (1 + lv) * (it.cursed ? 0.5 : 1);
    case 'missile': return 6 * MISSILES[it.t].tier * it.qty;
    case 'potion': return POTIONS[it.t].val * it.qty;
    case 'scroll': return SCROLLS[it.t].val * it.qty;
    case 'ring': return 75 * (1 + lv);
    case 'wand': return 75 * (1 + lv);
    case 'food': return FOODS[it.t].val * it.qty;
  }
  return 0;
}

// ---------- weapon / armor math ----------
function strReq(tier, lvl){ lvl = Math.max(0, lvl); return (8 + tier*2) - Math.floor((Math.sqrt(8*lvl + 1) - 1)/2); }
function weaponMin(it){ const w = WEAPONS[it.t]; return Math.max(0, w.tier + it.lvl); }
function weaponMax(it){ const w = WEAPONS[it.t]; return Math.max(weaponMin(it), (w.base || 5)*(w.tier+1) + it.lvl*(w.tier+1)); }
function armorDRMax(it){ const a = ARMORS[it.t]; return Math.max(0, a.tier*(2 + it.lvl)) + (it.ench === 'bulwark' ? 2 : 0); }
function armorDRMin(it){ return Math.max(0, it.lvl); }
function missileMin(it){ const m = MISSILES[it.t]; return m.min; }
function missileMax(it){ const m = MISSILES[it.t]; return m.max; }
function bowMin(it){ return 1 + Math.floor(G.hero.lvl/5) + Math.max(0, it.lvl); }
function bowMax(it){ return 6 + Math.floor(G.hero.lvl/2) + 2*Math.max(0, it.lvl); }
function wandDmg(it){
  const l = Math.max(0, it.lvl);
  switch (it.t){
    case 'missile': return [2 + l, 8 + 2*l];
    case 'fire': return [2 + l, 6 + 3*l];
    case 'lightning': return [5 + l, 10 + 5*l];
    case 'frost': return [2 + l, 8 + 5*l];
    case 'disint': return [2 + l, 8 + 4*l];
    case 'blast': return [1 + l, 4 + 2*l];
  }
  return [1, 2];
}
function staffWand(it){ return { t:'missile', lvl: it.lvl }; }

// ---------- description ----------
function itemInfo(it){
  const h = G.hero;
  const tags = [];
  let stats = '', desc = '';
  const knownLv = levelKnown(it);
  switch (it.k){
    case 'weapon': {
      const w = WEAPONS[it.t]; const req = strReq(w.tier, it.lvl);
      stats = `Tier ${w.tier} weapon · ${knownLv ? weaponMin(it) + '–' + weaponMax(it) : weaponMin({t:it.t,lvl:0}) + '–' + weaponMax({t:it.t,lvl:0}) + '?'} damage · needs ${req} STR`;
      if (w.delay) stats += w.delay < 1 ? ' · fast' : ' · slow';
      if (w.reach) stats += ' · reach 2';
      if (w.acc) stats += w.acc > 1 ? ' · accurate' : ' · inaccurate';
      if (req > heroStr()) tags.push(['too heavy', 'var(--blood)']);
      if (w.staff) stats += ` · ${it.ch}/${it.chMax} charges`;
      desc = w.desc;
      if (it.ench && it.known) desc += ' ' + ENCH_DESC[it.ench];
      break;
    }
    case 'armor': {
      const a = ARMORS[it.t]; const req = strReq(a.tier, it.lvl);
      stats = `Tier ${a.tier} armor · blocks ${knownLv ? armorDRMin(it) + '–' + armorDRMax(it) : '0–' + (a.tier*2) + '?'} · needs ${req} STR`;
      if (req > heroStr()) tags.push(['too heavy', 'var(--blood)']);
      desc = a.desc; if (it.ench && it.known) desc += ' ' + ENCH_DESC[it.ench];
      break;
    }
    case 'missile': { const m = MISSILES[it.t]; stats = `Thrown · ${m.min}–${m.max} damage`; desc = m.desc; break; }
    case 'potion': desc = isTypeKnown(it) ? POTIONS[it.t].desc : 'An unidentified potion. Drink it or throw it to learn what it does. Harmful potions are best thrown.'; break;
    case 'scroll': desc = isTypeKnown(it) ? SCROLLS[it.t].desc : 'An unidentified scroll covered in runes. Read it to find out what it does.'; break;
    case 'ring': desc = isTypeKnown(it) ? RINGS[it.t].desc + ' Wear it for a while to learn its strength.' : 'An unidentified ring. Put it on to learn its power, but beware of curses.'; break;
    case 'wand': { const d = wandDmg(it); stats = `${it.ch}/${it.chMax} charges` + (knownLv ? '' : ' (level unknown)') + (it.t !== 'blast' || true ? ` · ${knownLv ? d[0]+'–'+d[1] : '?'} damage` : ''); desc = WANDS[it.t].desc; break; }
    case 'food': stats = `Restores ${FOODS[it.t].sat} satiety`; desc = FOODS[it.t].desc; break;
    case 'bow': stats = `${bowMin(it)}–${bowMax(it)} damage · endless arrows`; desc = 'A bow that conjures arrows of spirit energy. Its damage grows as you level up.'; break;
    case 'cloak': stats = `${Math.floor(it.ch)}/${it.chMax} charge`; desc = 'Activate it to melt into the shadows and become invisible. Draining charge while active, it recharges over time.'; break;
    case 'amulet': desc = 'The Amulet of Yendor. Legends say it grants its bearer the power to shape fate itself.'; break;
    case 'key': desc = 'An iron key. It opens a locked door on this floor.'; break;
  }
  if (it.cursed && (it.curseKnown || it.known)) tags.push(['cursed', 'var(--blood)']);
  else if (['weapon','armor','ring','wand'].includes(it.k) && !it.known) tags.push(['unidentified', 'var(--dim)']);
  if (isEquipped(it)) tags.push(['equipped', 'var(--xp)']);
  if (it.price) tags.push([it.price + ' gold', 'var(--gold)']);
  return { name: itemName(it), stats, desc, tags };
}
// ============================================================
// GAME CORE
// ============================================================
let G = null;     // serializable game state
let L = null;     // current level
const V = { fov: null, log: [], pendingStairs: null, pendingBuy: null, busy: false, needProcess: false, lastSave: 0, mind: false, dmapCache: new Map(), visibleFoes: new Set() };

const isHero = ch => ch && ch.type === 'hero';
const isAlly = ch => ch && (ch.type === 'hero' || ch.ally);
function chName(ch){ if (!ch) return 'something'; if (isHero(ch)) return 'you'; return MOBS[ch.type].name; }
function theName(ch){ if (isHero(ch)) return 'you'; const n = MOBS[ch.type].name; return (MOBS[ch.type].boss ? '' : 'the ') + n; }
function TheName(ch){ return cap(theName(ch)); }

function log(msg, cls){ V.log.push({ msg, cls: cls || 'info', t: performance.now() }); if (V.log.length > 60) V.log.shift(); if (typeof UI !== 'undefined') UI.logChanged(); }

function mobAt(Lv, x, y){ for (const m of Lv.mobs) if (m.x === x && m.y === y && !m.dead) return m; return null; }
function charAt(x, y){ const h = G.hero; if (h.x === x && h.y === y) return h; return mobAt(L, x, y); }
function cellOpen(c){ const x = c % L.w, y = (c / L.w) | 0; return !!charAt(x, y) || !!L.heaps[c]; }
function blocksLOS(Lv, x, y){
  if (x < 0 || y < 0 || x >= Lv.w || y >= Lv.h) return true;
  const c = y*Lv.w + x, t = Lv.tiles[c];
  if (!TP.los[t]) return false;
  if (t === T.DOOR) return !cellOpen(c);
  return true;
}
function isSolidCorner(Lv, x, y){ if (x < 0 || y < 0 || x >= Lv.w || y >= Lv.h) return true; const t = Lv.tiles[y*Lv.w+x]; return TP.solid[t] || t === T.DOOR || t === T.LOCKED || t === T.SECRET; }
function diagOK(Lv, x, y, nx, ny){ if (nx === x || ny === y) return true; return !isSolidCorner(Lv, nx, y) && !isSolidCorner(Lv, x, ny); }

// ---------- FOV (recursive shadowcasting) ----------
const OCT = [[1,0,0,-1,-1,0,0,1],[0,1,-1,0,0,-1,1,0],[0,1,1,0,0,-1,-1,0],[1,0,0,1,-1,0,0,-1]];
function computeFOV(Lv, ox, oy, radius, out){
  out.fill(0); out[oy*Lv.w + ox] = 1;
  for (let o = 0; o < 8; o++) castLight(Lv, ox, oy, 1, 1.0, 0.0, radius, OCT[0][o], OCT[1][o], OCT[2][o], OCT[3][o], out);
}
function castLight(Lv, cx, cy, row, start, end, radius, xx, xy, yx, yy, out){
  if (start < end) return;
  const r2 = (radius + 0.5) * (radius + 0.5);
  let newStart = 0;
  for (let j = row; j <= radius; j++){
    let dx = -j - 1, dy = -j, blocked = false;
    while (dx <= 0){
      dx++;
      const X = cx + dx*xx + dy*xy, Y = cy + dx*yx + dy*yy;
      const ls = (dx - 0.5)/(dy + 0.5), rs = (dx + 0.5)/(dy - 0.5);
      if (start < rs) continue; else if (end > ls) break;
      if (X >= 0 && Y >= 0 && X < Lv.w && Y < Lv.h && dx*dx + dy*dy < r2) out[Y*Lv.w + X] = 1;
      const bl = blocksLOS(Lv, X, Y);
      if (blocked){ if (bl){ newStart = rs; continue; } else { blocked = false; start = newStart; } }
      else if (bl && j < radius){ blocked = true; castLight(Lv, cx, cy, j+1, start, ls, radius, xx, xy, yx, yy, out); newStart = rs; }
    }
    if (blocked) break;
  }
}
function updateFOV(){
  const h = G.hero, n = L.w*L.h;
  if (!V.fov || V.fov.length !== n) V.fov = new Uint8Array(n);
  computeFOV(L, h.x, h.y, 8, V.fov);
  for (let i = 0; i < n; i++) if (V.fov[i]) L.visited[i] = 1;
  V.mind = !!h.buffs.mind;
}
function heroSees(x, y){ return V.fov && V.fov[y*L.w + x] === 1; }
function losClear(Lv, x0, y0, x1, y1){
  const pts = linePts(x0, y0, x1, y1);
  for (let i = 1; i < pts.length - 1; i++) if (blocksLOS(Lv, pts[i][0], pts[i][1])) return false;
  return true;
}
function linePts(x0, y0, x1, y1){
  const pts = []; let dx = Math.abs(x1-x0), dy = -Math.abs(y1-y0), sx = x0<x1?1:-1, sy = y0<y1?1:-1, err = dx+dy, x = x0, y = y0;
  for (let k = 0; k < 200; k++){ pts.push([x,y]); if (x === x1 && y === y1) break; const e2 = 2*err; if (e2 >= dy){ err += dy; x += sx; } if (e2 <= dx){ err += dx; y += sy; } }
  return pts;
}
// projectile path. stops at walls; at first character unless pierce; extends past target when extend.
function bolt(x0, y0, x1, y1, opts){
  opts = opts || {};
  const range = opts.range || 30;
  let tx = x1, ty = y1;
  if (opts.extend && (tx !== x0 || ty !== y0)){ const dx = tx-x0, dy = ty-y0; const k = 40/Math.max(Math.abs(dx),Math.abs(dy)); tx = Math.round(x0 + dx*k); ty = Math.round(y0 + dy*k); }
  const pts = linePts(x0, y0, tx, ty);
  const path = []; const hits = []; let end = [x0, y0];
  for (let i = 1; i < pts.length && i <= range; i++){
    const [x, y] = pts[i];
    if (!inb(L, x, y)) break;
    const t = L.tiles[y*L.w + x];
    if (!opts.walls && (TP.solid[t] || t === T.LOCKED)) break;
    path.push([x, y]); end = [x, y];
    const ch = charAt(x, y);
    if (ch && !(opts.skipSelf && ch === opts.self)){ hits.push(ch); if (!opts.pierce) break; }
    if (!opts.extend && x === x1 && y === y1) break;
  }
  return { path, end, hits, ch: hits[0] || null };
}

// ---------- hero ----------
function createHero(cls){
  const h = { id: ++G.nid, type:'hero', cls, x:0, y:0, hp:20, ht:20, str:10, lvl:1, exp:0, att:10, def:5, time:0, hunger:0, gold:0,
    shield:0, buffs:{}, inv:[], eq:{ weapon:null, armor:null, art:null, ring1:null, ring2:null }, keys:{}, regen:0, starve:0, sp:0, cd:{} };
  G.hero = h;
  const armor = mkArmor('cloth', 0); armor.known = true; h.eq.armor = armor;
  h.inv.push(mkFood('ration'));
  const q = (it, i) => { G.quick[i] = { id: it.id, k: it.k, t: it.t }; };
  if (cls === 'warrior'){
    const w = mkWeapon('wornsword', 0); w.known = true; h.eq.weapon = w;
    const s = mkMissile('stone', 3); h.inv.push(s); q(s, 0);
    G.known.potion.healing = true; G.known.scroll.rage = true;
  } else if (cls === 'mage'){
    const w = mkWeapon('staff', 0); w.known = true; h.eq.weapon = w; q(w, 0);
    G.known.scroll.upgrade = true; G.known.potion.flame = true;
  } else if (cls === 'rogue'){
    const w = mkWeapon('dagger', 0); w.known = true; h.eq.weapon = w;
    const c = mkItem('cloak', 'cloak', { known: true, ch: 4, chMax: 4, partial: 0, active: false }); h.eq.art = c; q(c, 0);
    const k = mkMissile('knife', 3); h.inv.push(k); q(k, 1);
    G.known.scroll.mapping = true; G.known.potion.invisibility = true;
  } else {
    const w = mkWeapon('gloves', 0); w.known = true; h.eq.weapon = w;
    const b = mkItem('bow', 'bow', { known: true }); h.inv.push(b); q(b, 0);
    G.known.potion.mindvision = true; G.known.scroll.lullaby = true;
  }
  return h;
}
function ringLevel(type){ const h = G.hero; let s = 0; for (const k of ['ring1','ring2']){ const r = h.eq[k]; if (r && r.t === type) s += r.lvl; } return s; }
function heroStr(){ return G.hero.str + ringLevel('might'); }
function updateHT(){
  const h = G.hero; const old = h.ht;
  h.ht = Math.round((20 + 5*(h.lvl-1)) * (1 + 0.035*ringLevel('might')));
  if (h.ht > old) h.hp += h.ht - old;
  h.hp = Math.min(h.hp, h.ht);
}
function maxExp(lvl){ return 5 + lvl*5; }
function earnExp(n){
  const h = G.hero; if (n <= 0) return;
  h.exp += n; FX.text(h.x, h.y, '+' + n + ' EXP', '#7fe0c0', 0.25);
  while (h.exp >= maxExp(h.lvl) && h.lvl < 30){
    h.exp -= maxExp(h.lvl); h.lvl++; h.att++; h.def++;
    updateHT();
    log('Welcome to level ' + h.lvl + '! You feel stronger.', 'good'); FX.levelUp(h); Sound.play('level');
  }
  if (h.lvl >= 30) h.exp = Math.min(h.exp, maxExp(30));
}
function heroAttackSkill(){
  const h = G.hero; let acc = h.att; const w = h.eq.weapon;
  if (w){ const wd = WEAPONS[w.t]; acc *= (wd.acc || 1); const deficit = strReq(wd.tier, w.lvl) - heroStr(); if (deficit > 0) acc /= Math.pow(1.5, deficit); }
  return acc * Math.pow(1.3, ringLevel('accuracy'));
}
function heroDefenseSkill(){
  const h = G.hero; let ev = h.def; const a = h.eq.armor;
  if (a){ const deficit = strReq(ARMORS[a.t].tier, a.lvl) - heroStr(); if (deficit > 0) ev /= Math.pow(1.5, deficit); }
  return ev * Math.pow(1.125, ringLevel('evasion'));
}
function heroDamage(surprise){
  const h = G.hero, w = h.eq.weapon;
  let d;
  if (!w) d = R.normal(1, Math.max(1, heroStr() - 8));
  else {
    const mn = weaponMin(w), mx = weaponMax(w);
    d = (surprise && WEAPONS[w.t].sneak) ? R.normal(Math.round(lerp(mn, mx, 0.75)), mx) : R.normal(mn, mx);
    const excess = heroStr() - strReq(WEAPONS[w.t].tier, w.lvl);
    if (excess > 0) d += R.int(0, excess + 1);
  }
  if (h.buffs.weak) d = Math.floor(d * 0.67);
  return d;
}
function heroDR(){
  const h = G.hero, a = h.eq.armor; let dr = 0;
  if (a){ dr = R.normal(armorDRMin(a), armorDRMax(a)); const deficit = strReq(ARMORS[a.t].tier, a.lvl) - heroStr(); if (deficit > 0) dr -= deficit; }
  const w = h.eq.weapon; if (w && WEAPONS[w.t].block) dr += R.int(0, WEAPONS[w.t].block + Math.max(0, w.lvl) + 1);
  return Math.max(0, dr);
}
function moveCost(ch){
  let s = 1;
  if (isHero(ch)){ s = Math.pow(1.175, ringLevel('haste')); if (ch.buffs.haste) s *= 3; }
  else { const d = MOBS[ch.type]; s = d.speed || 1; if (ch.supercharged) s *= 1.5; }
  if (ch.buffs.cripple) s /= 2;
  if (ch.buffs.chill) s /= 1.5;
  return 1 / s;
}
function attackDelay(ch){
  let d = 1;
  if (isHero(ch)){ const w = ch.eq.weapon; if (w) d = WEAPONS[w.t].delay || 1; }
  else d = MOBS[ch.type].atkDelay || 1;
  if (ch.buffs.chill) d *= 1.5;
  return d;
}
function heroStealth(){ const h = G.hero; return 1 + (h.cls === 'rogue' ? 1 : 0); }
function heroInvisible(){ return !!G.hero.buffs.invis; }

// ---------- mobs ----------
function mkMob(type, x, y){
  const d = MOBS[type];
  return { id: ++G.nid, type, x, y, hp: d.hp, ht: d.hp, time: G ? (G.hero ? G.hero.time : 0) : 0, state: 'wandering', target: null, buffs: {}, ally: !!d.ally, cd: {} };
}
function isSurprised(m){
  if (isHero(m)) return false;
  return m.state === 'sleeping' || m.state === 'wandering' || m.buffs.para || m.buffs.frozen || m.buffs.sleep || (heroInvisible() && !m.ally) || m.state === 'passive';
}
function attackSkillOf(ch, target){
  if (isHero(ch)) return heroAttackSkill();
  if (ch.type === 'image') return heroAttackSkill();
  return MOBS[ch.type].att;
}
function defenseSkillOf(ch, att){
  if (ch.buffs.para || ch.buffs.frozen || ch.buffs.sleep || ch.buffs.rooted && false) return 0;
  if (isHero(ch)) return heroDefenseSkill();
  return MOBS[ch.type].def;
}
function hitCheck(att, def, accMul){
  const a = attackSkillOf(att, def) * (accMul || 1), d = defenseSkillOf(def, att);
  if (d <= 0) return true;
  return R.float(a) >= R.float(d);
}
function mobDamage(m){
  const d = MOBS[m.type];
  let lo = d.dmg[0], hi = d.dmg[1];
  if (m.type === 'brute' && m.enraged){ lo = 15; hi = 40; }
  if (m.type === 'goo' && m.hp*2 <= m.ht) hi = 12;
  if (m.type === 'image') return Math.max(1, Math.floor(heroDamage(false) / 2));
  let dmg = R.normal(lo, hi);
  if (m.buffs.weak) dmg = Math.floor(dmg * 0.67);
  return dmg;
}
function drOf(ch){
  if (isHero(ch)) return heroDR();
  const d = MOBS[ch.type]; return R.normal(d.dr[0], d.dr[1]);
}

// ---------- combat ----------
function doAttack(att, def, opts){
  opts = opts || {};
  if (def.dead || att.dead) return false;
  const surprise = isHero(att) && !isAlly(def) && isSurprised(def);
  if (!opts.ranged) FX.attack(att, def);
  if (isHero(att) && att.buffs.charm && att.buffs.charm.src === def.id){ log('You are charmed and cannot bring yourself to attack!', 'warn'); return false; }
  let hit = opts.autoHit || surprise || hitCheck(att, def, opts.accMul);
  if (!hit){
    FX.text(def.x, def.y, 'miss', '#c8c0b0', opts.delay || 0); Sound.play('miss');
    if (!isHero(def)) alertMob(def, att);
    return false;
  }
  let dmg = opts.dmg !== undefined ? opts.dmg : (isHero(att) ? heroDamage(surprise) : mobDamage(att));
  if (opts.dmgMul) dmg = Math.round(dmg * opts.dmgMul);
  if (surprise && !opts.dmgFixed){ FX.text(def.x, def.y, '!', '#f2b24c', opts.delay || 0); if (opts.sneakBonus) dmg = Math.round(dmg * 1.5); }
  dmg = Math.max(0, dmg - drOf(def));
  dmg = attackProc(att, def, dmg);
  dmg = defenseProc(def, att, dmg);
  if (isHero(att) && att.eq.weapon && !opts.ranged) weaponUsed(att.eq.weapon);
  if (isHero(att) && (att.buffs.invis || (att.eq.art && att.eq.art.active))){ breakInvis(); }
  damage(def, dmg, att, opts);
  return true;
}
function breakInvis(){
  const h = G.hero;
  if (h.eq.art && h.eq.art.k === 'cloak' && h.eq.art.active){ h.eq.art.active = false; }
  if (h.buffs.invis && !h.buffs.invis.potion){ delete h.buffs.invis; }
  else if (h.buffs.invis && h.buffs.invis.potion){ delete h.buffs.invis; log('You become visible again.', 'warn'); }
}
function weaponUsed(w){
  if (w.known) return;
  w.uses = (w.uses || 0) + 1;
  if (w.uses >= 20){ identify(w); log('You are now familiar enough with your ' + baseName(w) + ' to identify it. It is ' + itemName(w) + '.', 'good'); }
}
function attackProc(att, def, dmg){
  if (isHero(att)){
    const w = att.eq.weapon;
    if (w && w.ench && dmg > 0 && R.chance(0.2 + 0.03*Math.max(0, w.lvl))){
      if (w.ench === 'blazing'){ addBuff(def, 'burning', 6); FX.burst(def.x, def.y, 0xff8a30, 10); }
      else if (w.ench === 'chilling'){ addBuff(def, 'chill', 4); FX.burst(def.x, def.y, 0xa8e8ff, 10); }
      else if (w.ench === 'vampiric'){ const heal = Math.min(att.ht - att.hp, Math.max(1, Math.round(dmg*0.4))); if (heal > 0){ att.hp += heal; FX.text(att.x, att.y, '+' + heal, '#7fe07f'); } }
      else if (w.ench === 'shocking'){ for (const m of L.mobs) if (!m.dead && !m.ally && m !== def && cheb(m.x,m.y,def.x,def.y) <= 2){ FX.lightning(def, m); damage(m, Math.max(1, Math.round(dmg*0.4)), att); } }
      if (!w.known) { /* enchant reveals itself on proc */ }
    }
    return dmg;
  }
  const d = MOBS[att.type];
  if (!d) return dmg;
  if (dmg > 0){
    if (d.poison && R.chance(0.5)) addBuff(def, 'poison', 6 + Math.floor(G.depth/3));
    if (d.burns && R.chance(0.5)) addBuff(def, 'burning', 6);
    if (d.drain){ const heal = Math.min(att.ht - att.hp, Math.max(0, Math.round(dmg*0.5))); if (heal > 0){ att.hp += heal; FX.text(att.x, att.y, '+' + heal, '#7fe07f', 0.15); } }
    if (d.charm && isHero(def) && R.chance(0.3)){ def.buffs.charm = { t: 5, src: att.id }; log('You are charmed by ' + theName(att) + '!', 'bad'); }
    if (att.type === 'fistr' && R.chance(0.4)) addGas('toxic', cellOf(def), 120);
    if (d.steal && isHero(def) && !att.stolen) thiefSteal(att);
  }
  return dmg;
}
function defenseProc(def, att, dmg){
  if (isHero(def)){
    const a = def.eq.armor;
    if (a && a.ench === 'thorns' && dmg > 0 && att && !isHero(att) && R.chance(0.25)){ const r = Math.max(1, Math.round(dmg*0.5)); damage(att, r, def); }
    if (a && !a.known && dmg > 0){ a.uses = (a.uses||0) + 1; if (a.uses >= 15){ identify(a); log('You are now familiar enough with your ' + baseName(a) + ' to identify it. It is ' + itemName(a) + '.', 'good'); } }
  }
  return dmg;
}
function invulnerable(ch){
  if (ch.type === 'keeper') return true;
  if (ch.type === 'yog') return L.mobs.some(m => !m.dead && (m.type === 'fistb' || m.type === 'fistr'));
  return false;
}
function damage(ch, dmg, src, opts){
  if (!ch || ch.dead || G.over && isHero(ch)) return;
  opts = opts || {};
  if (invulnerable(ch)){ FX.text(ch.x, ch.y, 'immune', '#c0c0c0', opts.delay || 0); return; }
  dmg = Math.max(0, Math.round(dmg));
  if (isHero(ch)){
    const ten = ringLevel('tenacity');
    if (ten) dmg = Math.round(dmg * Math.pow(0.85, ten * (1 - ch.hp/ch.ht)));
    if (ch.shield > 0 && dmg > 0){ const s = Math.min(ch.shield, dmg); ch.shield -= s; dmg -= s; if (s) FX.text(ch.x, ch.y, '-' + s, '#c8d4e8', opts.delay || 0); }
    ch.lastHurt = G.hero.time;
  } else {
    const d = MOBS[ch.type];
    if (d.slime && dmg > 4) dmg = 4 + Math.floor((Math.sqrt(8*(dmg-4)+1)-1)/2);
    if (ch.type === 'king' && L.mobs.some(m => m.kingMinion && !m.dead && cheb(m.x,m.y,ch.x,ch.y) <= 4)){ dmg = Math.ceil(dmg * 0.5); }
  }
  if (dmg > 0 || !isHero(ch)) FX.hurt(ch, dmg, opts.delay || 0, opts.color);
  if (dmg <= 0) return;
  ch.hp -= dmg;
  if (ch.buffs.frozen) delete ch.buffs.frozen;
  if (ch.buffs.sleep) delete ch.buffs.sleep;
  if (!isHero(ch)){
    if (src && src !== ch && ch.state !== 'passive') alertMob(ch, src);
    onMobDamaged(ch, dmg, src);
  } else Sound.play('hurt');
  if (ch.hp <= 0) die(ch, src);
}
function alertMob(m, src){
  if (m.state === 'passive' || m.dead) return;
  if (m.state === 'sleeping' || m.state === 'wandering'){ m.state = 'hunting'; FX.alert(m); }
  if (src && src.x !== undefined){ m.target = { x: src.x, y: src.y }; }
  if (m.buffs.sleep) delete m.buffs.sleep;
}
function die(ch, src){
  if (ch.dead) return;
  if (isHero(ch)){
    ch.hp = 0; ch.dead = true; G.over = true;
    G.deathCause = src ? (src.type ? (isHero(src) ? 'your own hand' : aOrAn(MOBS[src.type].name)) : String(src)) : 'unknown causes';
    if (src && src.type && MOBS[src.type] && MOBS[src.type].boss) G.deathCause = MOBS[src.type].name;
    log('You die...', 'bad'); FX.die(ch); Sound.play('death');
    endRun(false);
    return;
  }
  const d = MOBS[ch.type];
  if (d.revive && !ch.revived && R.chance(0.5)){
    ch.revived = true; ch.hp = Math.ceil(ch.ht/2); ch.buffs.para = { t: 3 }; log(TheName(ch) + ' collapses, but begins to stir...', 'warn'); FX.hurt(ch, 0); return;
  }
  ch.dead = true;
  const i = L.mobs.indexOf(ch); if (i >= 0) L.mobs.splice(i, 1);
  FX.die(ch);
  if (!ch.ally){
    if (heroSees(ch.x, ch.y)) log(TheName(ch) + ' is slain.', 'info');
    G.stats.kills++;
    if (!ch.noexp && G.hero.lvl <= d.max) earnExp(d.exp);
    const c = cellOf(ch);
    if (ch.stolen){ addHeap(L, c, ch.stolen); ch.stolen = null; }
    const wealth = Math.pow(1.2, ringLevel('wealth'));
    if (d.loot && R.chance(d.loot * wealth)) addHeap(L, c, lootItem(d.lootK, G.depth));
    if (d.explode){ FX.burst(ch.x, ch.y, 0xe8e0d0, 18); for (const o of charsNear(ch.x, ch.y, 1)) damage(o, Math.max(0, R.normal(6, 12) - drOf(o)), ch); }
    if (d.boss) onBossDeath(ch);
  } else if (ch.type === 'image' && heroSees(ch.x, ch.y)) { /* fades */ }
  Sound.play('kill');
}
function charsNear(x, y, r){ const out = []; const h = G.hero; if (!h.dead && cheb(h.x,h.y,x,y) <= r && !(h.x===x&&h.y===y)) out.push(h); for (const m of L.mobs) if (!m.dead && cheb(m.x,m.y,x,y) <= r && !(m.x===x&&m.y===y)) out.push(m); return out; }
const cellOf = ch => ch.y*L.w + ch.x;
const cx_ = c => c % L.w, cy_ = c => (c / L.w) | 0;

function thiefSteal(m){
  const h = G.hero;
  const cand = h.inv.filter(it => !['bow'].includes(it.k));
  if (!cand.length) return;
  const it = R.pick(cand);
  let taken;
  if (it.qty > 1 && STACKABLE[it.k]){ it.qty--; taken = Object.assign({}, it, { id: ++G.nid, qty: 1 }); }
  else { h.inv.splice(h.inv.indexOf(it), 1); taken = it; }
  m.stolen = taken; m.state = 'fleeing'; m.fleeT = 30;
  log(TheName(m) + ' stole your ' + itemName(taken) + '!', 'bad');
}

// ---------- buffs ----------
function addBuff(ch, key, t, extra){
  if (ch.dead) return;
  if (!isHero(ch)){
    const d = MOBS[ch.type];
    if (key === 'burning' && (ch.type === 'elemental' || ch.type === 'fistb')) return;
    if (d.boss && (key === 'para' || key === 'frozen' || key === 'sleep')) { t = Math.min(t, 2); }
    if (ch.type === 'yog' || ch.type === 'keeper') return;
  }
  if (isHero(ch) && ch.buffs.purity && key === 'para') return;
  if (key === 'burning' && L.tiles[cellOf(ch)] === T.WATER) return;
  const b = ch.buffs[key];
  if (b) b.t = Math.max(b.t, t); else ch.buffs[key] = Object.assign({ t }, extra || {});
  if (key === 'burning' && ch.buffs.frozen) delete ch.buffs.frozen;
  if (key === 'frozen' && ch.buffs.burning) delete ch.buffs.burning;
  if (isHero(ch)){
    const msg = { poison:'You are poisoned!', burning:'You catch fire!', para:'You are paralyzed!', frozen:'You are frozen solid!', cripple:'You are crippled!', weak:'You feel weakened.', rooted:'You are stuck in place!' }[key];
    if (msg && !b) log(msg, 'bad');
  }
}
function tickBuffs(ch){
  const b = ch.buffs;
  for (const k of Object.keys(b)){
    const v = b[k];
    if (ch.dead) return;
    if (k === 'poison'){ const dmg = Math.floor(v.t/3) + 1; damage(ch, dmg, 'poison', { color: '#94c94e' }); if (ch.dead && isHero(ch)) G.deathCause = 'poison'; }
    if (k === 'burning'){
      if (L.tiles[cellOf(ch)] === T.WATER){ delete b[k]; continue; }
      const dmg = R.normal(1, 3 + Math.floor(G.depth/4)); damage(ch, dmg, 'burning', { color: '#ff9a4a' });
      if (ch.dead && isHero(ch)) G.deathCause = 'burning';
      const c = cellOf(ch); if (TP.flam[L.tiles[c]] && !L.fire[c]) L.fire[c] = 4;
    }
    if (k === 'invis' && isHero(ch) && v.cloak) continue;
    if (k === 'charm' && !L.mobs.some(m => m.id === v.src)){ delete b[k]; continue; }
    if (v.t !== undefined && v.t < 9999){
      v.t -= 1;
      if (v.t <= 0){ delete b[k];
        if (isHero(ch)){ const msg = { haste:'You slow down.', invis:'You become visible again.', mind:'Your mind vision fades.', levit:'You float gently to the ground.', para:'You can move again.', frozen:'You thaw out.' }[k]; if (msg) log(msg, 'info'); }
        if (!isHero(ch) && k === 'terror' && ch.state === 'fleeing') ch.state = 'hunting';
      }
    }
  }
}

// ---------- blobs ----------
const GAS_KEYS = ['toxic','para','frost'];
function addGas(kind, c, vol){ if (c < 0) return; L[kind][c] += vol; V.blobDirty = true; }
function addFire(c, t){ if (c < 0) return; const tile = L.tiles[c]; if (tile === T.WATER || TP.solid[tile]) return; L.fire[c] = Math.max(L.fire[c], t || 4); V.blobDirty = true; }
function gasPermeable(c){ const t = L.tiles[c]; return TP.pass[t] || t === T.STATUE && false; }
function evolveBlobs(){
  const n = L.w*L.h, W = L.w;
  if (!V.tmp || V.tmp.length !== n) V.tmp = new Float32Array(n);
  let any = false;
  for (const key of GAS_KEYS){
    const a = L[key]; let has = false;
    for (let i = 0; i < n; i++) if (a[i] > 0){ has = true; break; }
    if (!has) continue;
    any = true;
    const out = V.tmp; out.fill(0);
    for (let c = 0; c < n; c++){
      const v = a[c]; if (v <= 0) continue;
      const x = c % W, y = (c / W) | 0;
      let cnt = 1; const nb = [c];
      for (const [dx,dy] of DIRS4){ const nx = x+dx, ny = y+dy; if (nx<0||ny<0||nx>=W||ny>=L.h) continue; const m = ny*W+nx; if (gasPermeable(m)){ cnt++; nb.push(m); } }
      const share = v / cnt; for (const m of nb) out[m] += share;
    }
    for (let c = 0; c < n; c++){ let v = out[c] * 0.96 - 0.6; a[c] = v < 1 ? 0 : v; }
  }
  // fire
  const fire = L.fire; let fireAny = false;
  const spread = [];
  for (let c = 0; c < n; c++){
    if (fire[c] <= 0) continue; fireAny = true;
    const x = c % W, y = (c / W) | 0;
    if (L.web[c]){ L.web[c] = 0; }
    for (const [dx,dy] of DIRS4){ const m = (y+dy)*W + x+dx; if (m >= 0 && m < n && TP.flam[L.tiles[m]] && fire[m] <= 0 && R.chance(0.6)) spread.push(m); }
    if (L.tiles[c] === T.HGRASS || L.tiles[c] === T.GRASS){ L.tiles[c] = T.EMBERS; V.tilesDirty = true; }
    const heap = L.heaps[c];
    if (heap){ for (let i = heap.length-1; i >= 0; i--) if (heap[i].k === 'scroll' && !heap[i].price){ heap.splice(i,1); if (heroSees(x,y)) log('A scroll burns up!', 'warn'); } if (!heap.length) delete L.heaps[c]; }
    fire[c] -= 1; if (fire[c] < 0) fire[c] = 0;
  }
  for (const m of spread) if (L.tiles[m] !== T.WATER) fire[m] = 4;
  if (any || fireAny || spread.length) V.blobDirty = true;
}
function blobEffects(ch){
  const c = cellOf(ch);
  if (L.fire[c] > 0) addBuff(ch, 'burning', 6);
  const immune = isHero(ch) && ch.buffs.purity;
  const nonBreath = !isHero(ch) && ['skeleton','dm100','dm200','dm300','golem','elemental','yog','fistb','fistr','keeper','image'].includes(ch.type);
  if (!immune && !nonBreath){
    if (L.toxic[c] > 0){ damage(ch, 1 + Math.floor(G.depth/5), 'toxic gas', { color:'#94c94e' }); if (ch.dead && isHero(ch)) G.deathCause = 'toxic gas'; }
    if (L.para[c] > 0) addBuff(ch, 'para', 2);
  }
  if (!immune && L.frost[c] > 0 && !ch.dead){ if (ch.buffs.chill) addBuff(ch, 'frozen', 3); addBuff(ch, 'chill', 4); damage(ch, R.normal(1, 2 + Math.floor(G.depth/5)), 'frost', { color:'#a8e8ff' }); }
}

// ---------- environment tick ----------
function envTick(){
  G.envTime += 1; G.stats.turns++;
  const h = G.hero;
  // hero needs
  h.hunger += 1;
  if (h.hunger === 300) log('You are hungry.', 'warn');
  if (h.hunger === 450) log('You are starving!', 'bad');
  if (h.hunger >= 450){
    h.hunger = 450; h.starve += h.ht / 1000 + 0.05;
    if (h.starve >= 1){ const d = Math.floor(h.starve); h.starve -= d; damage(h, d, 'starvation'); if (h.dead) G.deathCause = 'starvation'; }
  } else if (h.hp < h.ht){
    h.regen += 0.1 * (h.lvl >= 10 ? 1.25 : 1);
    while (h.regen >= 1 && h.hp < h.ht){ h.regen -= 1; h.hp++; }
  } else h.regen = 0;
  // warrior seal shield
  if (h.cls === 'warrior' && h.eq.armor){ const maxS = 3 + 2*Math.max(0, h.eq.armor.lvl) + ARMORS[h.eq.armor.t].tier; h.sp += 1/7; if (h.sp >= 1){ h.sp -= 1; if (h.shield < maxS) h.shield++; } h.shieldMax = maxS; }
  // charges
  const energy = Math.pow(1.175, ringLevel('energy'));
  for (const it of allItems()){
    if (it.k === 'wand' || (it.k === 'weapon' && WEAPONS[it.t].staff)){
      const max = it.k === 'wand' ? wandMax(it) : staffMax(it); it.chMax = max;
      if (it.ch < max){ const missing = max - it.ch; it.partial += energy / (10 + 40 * Math.pow(0.875, missing)) * (it.k === 'weapon' ? 1.2 : 1); if (it.partial >= 1){ it.partial -= 1; it.ch++; } }
    }
    if (it.k === 'cloak'){
      it.chMax = 4 + Math.max(0, it.lvl);
      if (it.active){ it.ch -= 0.25; h.buffs.invis = { t: 9999, cloak: true }; if (it.ch <= 0){ it.ch = 0; it.active = false; delete h.buffs.invis; log('Your cloak runs out of energy.', 'warn'); } }
      else { if (h.buffs.invis && h.buffs.invis.cloak) delete h.buffs.invis; if (it.ch < it.chMax) it.ch = Math.min(it.chMax, it.ch + energy/12); }
    }
    if (it.k === 'ring' && isEquipped(it) && !it.known){ it.worn = (it.worn || 0) + 1; if (it.worn >= 150){ identify(it); log('You are now familiar with your ring. It is a ' + itemName(it) + '.', 'good'); } }
  }
  tickBuffs(h);
  if (!h.dead) blobEffects(h);
  for (const m of L.mobs.slice()){
    if (m.dead) continue;
    tickBuffs(m);
    if (!m.dead) blobEffects(m);
    if (!m.dead && m.type === 'goo' && L.tiles[cellOf(m)] === T.WATER && m.hp < m.ht){ m.hp = Math.min(m.ht, m.hp + (m.hp*2 < m.ht ? 2 : 1)); }
    for (const k in m.cd) if (m.cd[k] > 0) m.cd[k]--;
    if (m.type === 'image'){ m.life = (m.life || 60) - 1; if (m.life <= 0) die(m, null); }
  }
  for (const k in h.cd) if (h.cd[k] > 0) h.cd[k]--;
  evolveBlobs();
  resolveWarnings();
  // respawn
  if (L.mobLimit > 0){
    L.respawn -= 1;
    if (L.respawn <= 0){
      L.respawn = 50;
      const hostile = L.mobs.filter(m => !m.ally && m.state !== 'passive').length;
      if (hostile < L.mobLimit) spawnWanderer();
    }
  }
}
function spawnWanderer(){
  for (let tries = 0; tries < 100; tries++){
    const c = R.int(L.w*L.h); const x = c % L.w, y = (c/L.w)|0;
    if (!TP.pass[L.tiles[c]] || L.tiles[c] === T.DOOR || V.fov[c] || charAt(x,y) || inLockedRoom(x, y)) continue;
    if (cheb(x, y, G.hero.x, G.hero.y) < 10) continue;
    const m = mkMob(R.pick(mobRotation(G.depth)), x, y); m.state = 'wandering'; m.time = G.hero.time;
    L.mobs.push(m); return m;
  }
  return null;
}

// ---------- warnings (telegraphed attacks) ----------
function addWarning(cells, kind, t, data){ const w = Object.assign({ cells, kind, t }, data || {}); L.warnings.push(w); V.warnDirty = true; return w; }
function resolveWarnings(){
  if (!L.warnings.length) return;
  const keep = [];
  for (const w of L.warnings){
    w.t -= 1;
    if (w.t > 0){ keep.push(w); continue; }
    const src = w.src ? L.mobs.find(m => m.id === w.src) : null;
    if (w.src && !src) continue;
    switch (w.kind){
      case 'pump': {
        src.pumping = false;
        FX.burst(src.x, src.y, 0x203020, 30, 1.6); FX.shake(0.25);
        for (const o of charsNear(src.x, src.y, 1)) if (!o.dead) damage(o, Math.max(0, R.normal(1, 12) * 3 - drOf(o)), src);
        if (heroSees(src.x, src.y)) log('Goo unleashes a massive blow!', 'bad');
        break;
      }
      case 'beam': case 'laser': {
        if (src.dead) break;
        const fromX = src.x, fromY = src.y;
        const last = w.cells[w.cells.length-1];
        FX.beam(fromX, fromY, cx_(last), cy_(last), w.kind === 'laser' ? 0xff3a20 : 0xffd040);
        for (const c of w.cells){ const ch = charAt(cx_(c), cy_(c)); if (ch && ch !== src && !(ch.type === 'yog')) damage(ch, R.normal(w.dmg[0], w.dmg[1]), src); }
        Sound.play('zap');
        break;
      }
      case 'rock': {
        FX.shake(0.2);
        for (const c of w.cells){ FX.burst(cx_(c), cy_(c), 0x8a7a60, 6, 0.8); const ch = charAt(cx_(c), cy_(c)); if (ch && ch !== src){ damage(ch, Math.max(0, R.normal(w.dmg[0], w.dmg[1]) - drOf(ch)), src || 'falling rocks'); if (!ch.dead) addBuff(ch, 'para', 1); } }
        break;
      }
      case 'bomb': {
        FX.shake(0.25); Sound.play('boom');
        for (const c of w.cells){ FX.burst(cx_(c), cy_(c), 0xff8a30, 8, 1); const ch = charAt(cx_(c), cy_(c)); if (ch && ch !== src) damage(ch, Math.max(0, R.normal(w.dmg[0], w.dmg[1]) - drOf(ch)), src || 'a bomb'); if (R.chance(0.5)) addFire(c, 3); }
        break;
      }
      case 'leap': {
        if (src.dead) break;
        const tc = w.cells[0]; const tx = cx_(tc), ty = cy_(tc);
        let dest = null;
        if (!charAt(tx, ty) && TP.pass[L.tiles[tc]]) dest = [tx, ty];
        else { for (const [dx,dy] of DIRS8){ const nx = tx+dx, ny = ty+dy; if (inb(L,nx,ny) && TP.pass[L.tiles[ny*L.w+nx]] && !charAt(nx,ny)){ dest = [nx, ny]; break; } } }
        if (dest){ src.x = dest[0]; src.y = dest[1]; FX.leap(src); onEnter(src, cellOf(src), false); const e = charAt(tx, ty); if (e && e !== src && isAlly(e) && cheb(e.x,e.y,src.x,src.y) <= 1) doAttack(src, e, { accMul: 1.5 }); }
        src.leaping = false;
        break;
      }
    }
  }
  L.warnings = keep; V.warnDirty = true;
}

// ---------- traps ----------
function triggerTrap(c, ch){
  const tr = L.traps[c]; if (!tr || !tr.active) return;
  tr.hidden = false; tr.active = false; V.trapDirty = true;
  const x = cx_(c), y = cy_(c);
  if (heroSees(x, y)) log((isHero(ch) ? 'You trigger ' : TheName(ch) + ' triggers ') + aOrAn(TRAPS[tr.t].name.toLowerCase()) + '!', isHero(ch) ? 'bad' : 'info');
  Sound.play('trap');
  FX.burst(x, y, parseInt(TRAPS[tr.t].color.slice(1), 16), 14);
  switch (tr.t){
    case 'fire': for (const [dx,dy] of [[0,0],...DIRS8]) addFire((y+dy)*L.w + x+dx, 5); addBuff(ch, 'burning', 6); break;
    case 'poison': addBuff(ch, 'poison', 8 + Math.floor(G.depth/2)); break;
    case 'teleport': teleportChar(ch); break;
    case 'alarm': for (const m of L.mobs) if (!m.ally && m.state !== 'passive'){ m.state = 'hunting'; m.target = { x, y }; } log('A shrill alarm echoes through the halls!', 'warn'); break;
    case 'paralysis': addGas('para', c, 260); break;
    case 'toxic': addGas('toxic', c, 400); break;
    case 'frost': for (const [dx,dy] of [[0,0],...DIRS8]){ const n = (y+dy)*L.w + x+dx; if (TP.pass[L.tiles[n]]) addGas('frost', n, 40); } break;
    case 'grip': damage(ch, R.normal(1, 4 + G.depth), 'a gripping trap'); addBuff(ch, 'cripple', 8); addBuff(ch, 'rooted', 3); break;
    case 'summon': { let n = 2; for (const [dx,dy] of R.shuffle(DIRS8.slice())){ if (n <= 0) break; const nx = x+dx, ny = y+dy; if (inb(L,nx,ny) && TP.pass[L.tiles[ny*L.w+nx]] && !charAt(nx,ny)){ const m = mkMob(R.pick(mobRotation(G.depth)), nx, ny); m.state = 'hunting'; m.time = G.hero.time + 1; L.mobs.push(m); FX.spawn(m); n--; } } break; }
  }
}
function teleportChar(ch, near){
  for (let tries = 0; tries < 300; tries++){
    const c = R.int(L.w*L.h); const x = c % L.w, y = (c/L.w)|0;
    if (!TP.pass[L.tiles[c]] || L.tiles[c] === T.EXIT || L.tiles[c] === T.ENTRANCE || charAt(x,y) || (L.traps[c] && L.traps[c].active)) continue;
    if (L.heaps[c] && L.heaps[c].some(i => i.price)) continue;
    if (inLockedRoom(x, y)) continue;
    if (near && cheb(x,y,near.x,near.y) > near.r) continue;
    if (L.arena && near === undefined && isHero(ch) && false) continue;
    FX.puff(ch.x, ch.y);
    ch.x = x; ch.y = y; FX.teleport(ch);
    if (isHero(ch)){ log('You are teleported.', 'mag'); updateFOV(); }
    return true;
  }
  return false;
}

function inLockedRoom(x, y){
  if (!L.rooms) return false;
  for (const r of L.rooms) if ((r.type === 'vault' || r.type === 'secret') && x >= r.x - 1 && x <= r.x + r.w && y >= r.y - 1 && y <= r.y + r.h) return true;
  return false;
}
// ---------- searching ----------
function searchAround(r, chance){
  const h = G.hero; let found = false;
  for (let y = h.y - r; y <= h.y + r; y++) for (let x = h.x - r; x <= h.x + r; x++){
    if (!inb(L, x, y)) continue;
    const c = y*L.w + x;
    if (!V.fov[c]) continue;
    if (L.tiles[c] === T.SECRET && R.chance(chance)){ L.tiles[c] = T.DOOR; V.tilesDirty = true; found = true; FX.burst(x, y, 0xf2b24c, 10); }
    const tr = L.traps[c]; if (tr && tr.hidden && R.chance(chance)){ tr.hidden = false; V.trapDirty = true; found = true; FX.burst(x, y, 0xf2b24c, 8); }
  }
  if (found){ log('You notice something hidden nearby!', 'good'); Sound.play('secret'); }
  return found;
}

// ---------- items: inventory ----------
function allItems(){ const h = G.hero; const out = h.inv.slice(); for (const k of ['weapon','armor','art','ring1','ring2']) if (h.eq[k]) out.push(h.eq[k]); return out; }
function findItem(id){ return allItems().find(it => it.id === id) || null; }
function isEquipped(it){ const e = G.hero.eq; return e.weapon === it || e.armor === it || e.art === it || e.ring1 === it || e.ring2 === it; }
function quickItem(i){
  const q = G.quick[i]; if (!q) return null;
  let it = findItem(q.id);
  if (!it && STACKABLE[q.k]){ it = allItems().find(o => o.k === q.k && o.t === q.t) || null; if (it) q.id = it.id; }
  return it;
}
function setQuick(it, i){ for (let j = 0; j < G.quick.length; j++) if (G.quick[j] && G.quick[j].id === it.id) G.quick[j] = null; G.quick[i] = { id: it.id, k: it.k, t: it.t }; UI.update(); }
function takeOne(it){
  const h = G.hero;
  if (it.qty > 1){ it.qty--; return Object.assign({}, it, { id: ++G.nid, qty: 1 }); }
  const i = h.inv.indexOf(it); if (i >= 0) h.inv.splice(i, 1);
  for (const k in h.eq) if (h.eq[k] === it) h.eq[k] = null;
  return it;
}
function removeItem(it){ const h = G.hero; const i = h.inv.indexOf(it); if (i >= 0) h.inv.splice(i, 1); for (const k in h.eq) if (h.eq[k] === it) h.eq[k] = null; }
function collect(it){
  const h = G.hero;
  switch (it.k){
    case 'gold': h.gold += it.qty; G.stats.gold += it.qty; FX.text(h.x, h.y, '+' + it.qty, '#f3d062'); Sound.play('gold'); return true;
    case 'key': h.keys[it.depth] = (h.keys[it.depth] || 0) + 1; log('You pick up an iron key.', 'good'); Sound.play('pickup'); return true;
    case 'dew': { const heal = Math.min(h.ht - h.hp, Math.max(1, Math.round(h.ht * 0.05))); if (heal > 0){ h.hp += heal; FX.text(h.x, h.y, '+' + heal, '#7fe07f'); } return true; }
    case 'amulet': victory(); return true;
  }
  if (STACKABLE[it.k]){
    const s = h.inv.find(o => sameStack(o, it));
    if (s){ s.qty += it.qty; log('You now have ' + itemName(s, true) + '.', 'good'); Sound.play('pickup'); return true; }
  }
  if (h.inv.length >= 20){ log('Your pack is too full for the ' + itemName(it) + '.', 'warn'); return false; }
  h.inv.push(it);
  log('You now have ' + itemName(it, true) + '.', 'good'); Sound.play('pickup');
  for (const q of G.quick) if (q && !findItem(q.id) && q.k === it.k && q.t === it.t) q.id = it.id;
  return true;
}
function pickupAt(c){
  const heap = L.heaps[c]; if (!heap) return;
  for (let i = 0; i < heap.length;){
    const it = heap[i];
    if (it.price){ V.pendingBuy = c; i++; continue; }
    if (collect(it)) heap.splice(i, 1); else i++;
    if (G.over) break;
  }
  if (!heap.length) delete L.heaps[c];
  V.itemsDirty = true;
}
function dropItem(it){
  const one = STACKABLE[it.k] ? it : it;
  if (isEquipped(it) && it.cursed){ log('You can\'t remove a cursed item!', 'bad'); return false; }
  removeItem(one);
  if (it.k === 'cloak' && it.active){ it.active = false; delete G.hero.buffs.invis; }
  addHeap(L, cellOf(G.hero), one); V.itemsDirty = true;
  log('You drop ' + itemName(one, true) + '.');
  return 1;
}

// ---------- level transitions ----------
function changeLevel(dir, toDepth){
  if (dir === 'down' && G.depth >= DEMO_MAX_DEPTH){
    log('The stairs end in fresh rubble. The way deeper opens in the next update.', 'mag');
    UI.toast('End of the demo', REGIONS[regionOf(G.depth)].name + ' cleared');
    saveGame(); UI.update();
    return;
  }
  V.busy = true;
  UI.fade(true, dir === 'down' ? 'Descending…' : (dir === 'up' ? 'Ascending…' : 'Falling…'), () => {
    const h = G.hero;
    // allies don't follow
    L.mobs = L.mobs.filter(m => m.type !== 'image');
    G.depth = toDepth || (G.depth + (dir === 'down' ? 1 : -1));
    if (!G.levels[G.depth]) G.levels[G.depth] = generateLevel(G.depth);
    L = G.levels[G.depth];
    let c = dir === 'up' ? L.exit : L.entrance;
    if (c < 0) c = L.entrance;
    h.x = cx_(c); h.y = cy_(c);
    const occ = mobAt(L, h.x, h.y); if (occ) teleportChar(occ);
    for (const m of L.mobs) m.time = Math.max(m.time, h.time);
    if (G.envTime < h.time) G.envTime = Math.floor(h.time);
    G.stats.deepest = Math.max(G.stats.deepest, G.depth);
    V.dmapCache.clear();
    updateFOV();
    Render.buildLevel(L);
    Render.sync(true);
    UI.update();
    if (dir === 'down' && !L.entered){
      const reg = REGIONS[L.region];
      if (G.depth % 5 === 1) UI.toast(reg.name, 'Floor ' + G.depth);
      if (BOSS_DEPTHS[G.depth]) log('You sense a powerful presence on this floor. The stairs onward are sealed.', 'warn');
      else if (G.depth === 26) log('A strange stillness hangs in the air. You have reached the bottom.', 'mag');
      else if (L.shop) log('You hear the clinking of coins. A shop is on this floor.', 'good');
    }
    log((dir === 'up' ? 'You ascend to floor ' : 'You descend to floor ') + G.depth + '.', 'info');
    L.entered = true;
    saveGame();
    UI.fade(false);
    V.busy = false;
  });
}

// ---------- turn processing ----------
function processTurns(){
  const h = G.hero;
  let guard = 0;
  while (guard++ < 3000){
    if (G.over || V.pendingStairs) return;
    let mt = Infinity, mb = null;
    for (const m of L.mobs){ if (!m.dead && m.time < mt){ mt = m.time; mb = m; } }
    const ht = h.time, et = G.envTime;
    if (ht <= et && ht <= mt){
      if (h.buffs.para || h.buffs.frozen){ h.time += 1; updateFOV(); continue; }
      V.needProcess = false;
      return;
    }
    if (et <= mt){ envTick(); continue; }
    const before = mb.time;
    mobAct(mb);
    if (mb.time <= before) mb.time = before + 1;
  }
  V.needProcess = true;
}
function heroBusy(){ return G.over || V.busy || V.needProcess; }
function act(fn){
  if (!G || heroBusy()) return false;
  const h = G.hero;
  const cost = fn();
  if (cost === false || cost === null || cost === undefined) { UI.update(); return false; }
  h.time += cost;
  afterHero();
  return true;
}
function afterHero(){
  updateFOV();
  if (V.pendingStairs){ const d = V.pendingStairs; V.pendingStairs = null; Render.sync(); changeLevel(d); return; }
  if (V.won) return;
  processTurns();
  updateFOV();
  Render.sync();
  UI.update();
  if (V.pendingBuy !== null && V.pendingBuy !== undefined){ const c = V.pendingBuy; V.pendingBuy = null; if (!G.over) UI.openBuy(c); }
  if (!G.over && G.stats.turns - V.lastSave > 40){ V.lastSave = G.stats.turns; saveGame(); }
}

// ---------- hero actions ----------
function heroMove(dx, dy){
  const h = G.hero; const nx = h.x + dx, ny = h.y + dy;
  if (!inb(L, nx, ny)) return false;
  const c = ny*L.w + nx, tile = L.tiles[c];
  const m = mobAt(L, nx, ny);
  if (m && m.type === 'keeper'){ UI.openSell(); return false; }
  if (m && !m.ally){
    if (!diagOK(L, h.x, h.y, nx, ny)) return false;
    return heroAttack(m);
  }
  if (h.buffs.rooted){ log('You are stuck and can\'t move!', 'warn'); return 1; }
  if (tile === T.LOCKED){
    if ((h.keys[G.depth] || 0) > 0){ h.keys[G.depth]--; L.tiles[c] = T.DOOR; V.tilesDirty = true; log('You unlock the door.', 'good'); Sound.play('unlock'); return 1; }
    log('This door is locked. You need an iron key from this floor.', 'warn'); return false;
  }
  if (tile === T.SEALED){ log('A magical barrier seals the stairs. Defeat the guardian of this floor first.', 'warn'); return false; }
  if (!TP.pass[tile]) return false;
  if (!diagOK(L, h.x, h.y, nx, ny)) return false;
  const cost = moveCost(h);
  if (m && m.ally){ m.x = h.x; m.y = h.y; FX.move(m); }
  h.x = nx; h.y = ny;
  FX.move(h);
  onEnter(h, c, true);
  return cost;
}
function onEnter(ch, c, voluntary){
  const tile = L.tiles[c];
  const flying = isHero(ch) ? !!ch.buffs.levit : !!MOBS[ch.type].flying;
  if (tile === T.HGRASS && !flying){ L.tiles[c] = T.GRASS; V.tilesDirty = true; if (isHero(ch) && R.chance(0.08)) addHeap(L, c, mkItem('dew','dew',{known:true})); }
  if (L.web[c] && !flying){ L.web[c] = 0; V.blobDirty = true; addBuff(ch, 'rooted', 4); if (heroSees(ch.x,ch.y)) log((isHero(ch)?'You are':TheName(ch)+' is') + ' caught in a web!', isHero(ch)?'bad':'info'); }
  if (tile === T.WATER && ch.buffs.burning) delete ch.buffs.burning;
  if (isHero(ch)){
    pickupAt(c);
    if (!flying && L.traps[c] && L.traps[c].active) triggerTrap(c, ch);
    if (!ch.dead){
      if (R.chance(ch.cls === 'rogue' ? 0.35 : 0.15)) searchAround(1, 1);
      if (voluntary && tile === T.EXIT) V.pendingStairs = 'down';
      else if (voluntary && tile === T.ENTRANCE){ if (G.depth > 1) V.pendingStairs = 'up'; else log('Daylight beckons from above, but you cannot leave without the Amulet of Yendor.', 'info'); }
    }
  } else {
    const tr = L.traps[c];
    if (!flying && tr && tr.active && tr.hidden) triggerTrap(c, ch);
  }
}
function heroAttack(m){
  const h = G.hero;
  if (m.type === 'keeper') return false;
  doAttack(h, m);
  Sound.play('swing');
  return attackDelay(h);
}
function canReach(h, m){
  const w = h.eq.weapon; const reach = w ? (WEAPONS[w.t].reach || 1) : 1;
  const d = cheb(h.x, h.y, m.x, m.y);
  if (d === 1) return diagOK(L, h.x, h.y, m.x, m.y);
  if (d <= reach){ const b = bolt(h.x, h.y, m.x, m.y); return b.ch === m; }
  return false;
}
function heroWait(){ searchAround(G.hero.cls === 'rogue' ? 2 : 1, 1); return 1; }
function heroEat(it){
  const h = G.hero; const f = FOODS[it.t];
  takeOne(it);
  h.hunger = Math.max(0, h.hunger - f.sat);
  log('You eat the ' + f.name.toLowerCase() + '. That hit the spot.', 'good'); Sound.play('eat');
  if (it.t === 'meat' && R.chance(0.3)){
    const r = R.int(4);
    if (r === 0){ log('Oh, it\'s hot!', 'bad'); addBuff(h, 'burning', 4); }
    else if (r === 1){ log('You can\'t feel your legs!', 'bad'); addBuff(h, 'para', 3); }
    else if (r === 2){ log('You are not feeling well.', 'bad'); addBuff(h, 'poison', 5); }
    else { log('You feel sluggish.', 'bad'); addBuff(h, 'cripple', 8); }
  }
  return 1;
}
function heroEquip(it){
  const h = G.hero;
  let slot = null;
  if (it.k === 'weapon') slot = 'weapon';
  else if (it.k === 'armor') slot = 'armor';
  else if (it.k === 'cloak') slot = 'art';
  else if (it.k === 'ring') slot = !h.eq.ring1 ? 'ring1' : (!h.eq.ring2 ? 'ring2' : (h.eq.ring1.cursed ? 'ring2' : 'ring1'));
  if (!slot) return false;
  const old = h.eq[slot];
  if (old && old.cursed){ old.curseKnown = true; log('Your ' + itemName(old) + ' is cursed. You can\'t remove it.', 'bad'); return false; }
  removeItem(it);
  if (old) h.inv.push(old);
  h.eq[slot] = it;
  if (it.k === 'ring' && !isTypeKnown(it)){ learnType(it); log('This is ' + aOrAn(baseName(it)) + '.', 'mag'); }
  if (it.cursed){ it.curseKnown = true; log('The ' + itemName(it) + ' tightens around you painfully. It is cursed!', 'bad'); }
  else log('You equip the ' + itemName(it) + '.');
  if (it.k === 'weapon' || it.k === 'armor'){
    const tier = it.k === 'weapon' ? WEAPONS[it.t].tier : ARMORS[it.t].tier;
    if (strReq(tier, it.lvl) > heroStr()) log('You lack the strength to use it well.', 'warn');
  }
  if (it.k === 'ring') updateHT();
  Sound.play('equip');
  return it.k === 'armor' ? 2 : 1;
}
function heroUnequip(it){
  const h = G.hero;
  if (it.cursed){ it.curseKnown = true; log('The ' + itemName(it) + ' is cursed. You can\'t remove it.', 'bad'); return false; }
  if (h.inv.length >= 20){ log('Your pack is full.', 'warn'); return false; }
  for (const k in h.eq) if (h.eq[k] === it) h.eq[k] = null;
  if (it.k === 'cloak' && it.active){ it.active = false; delete h.buffs.invis; }
  h.inv.push(it);
  if (it.k === 'ring') updateHT();
  log('You remove the ' + itemName(it) + '.');
  return 1;
}
function toggleCloak(it){
  const h = G.hero;
  if (!isEquipped(it)){ log('Equip the cloak first.', 'warn'); return false; }
  if (it.active){ it.active = false; delete h.buffs.invis; log('You step out of the shadows.'); return 1; }
  if (it.ch < 1){ log('Your cloak needs to recharge.', 'warn'); return false; }
  it.active = true; h.buffs.invis = { t: 9999, cloak: true };
  for (const m of L.mobs) if (!m.ally && m.state === 'hunting' && cheb(m.x,m.y,h.x,h.y) > 1){ m.state = 'wandering'; m.target = { x: h.x, y: h.y }; }
  log('You melt into the shadows.', 'mag'); FX.puff(h.x, h.y);
  return 1;
}

// ---------- potions ----------
function drinkPotion(it){
  const h = G.hero; takeOne(it);
  const wasKnown = isTypeKnown(it);
  learnType(it);
  Sound.play('drink');
  const t = it.t;
  if (!wasKnown) log('It was a potion of ' + POTIONS[t].name + '.', 'mag');
  switch (t){
    case 'healing': h.hp = h.ht; for (const k of ['poison','cripple','weak','burning','chill']) delete h.buffs[k]; FX.heal(h); log('Your wounds heal completely.', 'good'); break;
    case 'strength': h.str++; FX.levelUp(h); log('Newfound strength surges through your body. (' + h.str + ' STR)', 'good'); break;
    case 'experience': earnExp(maxExp(h.lvl) - h.exp); break;
    case 'mindvision': h.buffs.mind = { t: 30 }; log('You can sense the presence of other creatures.', 'mag'); break;
    case 'invisibility': h.buffs.invis = { t: 25, potion: true }; for (const m of L.mobs) if (!m.ally && m.state === 'hunting'){ m.state = 'wandering'; } log('You turn invisible.', 'mag'); FX.puff(h.x, h.y); break;
    case 'haste': h.buffs.haste = { t: 20 }; log('You feel energetic!', 'good'); break;
    case 'levitation': h.buffs.levit = { t: 25 }; log('You float into the air!', 'mag'); break;
    case 'purity': clearGases(cellOf(h), 3); h.buffs.purity = { t: 15 }; log('The air around you is purified.', 'mag'); break;
    default: shatterPotion(t, cellOf(h)); break;
  }
  return 1;
}
function clearGases(c, r){ const x0 = cx_(c), y0 = cy_(c); for (let y = y0-r; y <= y0+r; y++) for (let x = x0-r; x <= x0+r; x++){ if (!inb(L,x,y)) continue; const n = y*L.w+x; for (const k of GAS_KEYS) L[k][n] = 0; L.fire[n] = 0; } V.blobDirty = true; }
function shatterPotion(t, c){
  const x = cx_(c), y = cy_(c);
  const col = POTION_COLORS[G.looks.potion[t]];
  FX.burst(x, y, parseInt(col.slice(1), 16), 16); Sound.play('shatter');
  const seen = heroSees(x, y);
  const known = isTypeKnown({ k:'potion', t });
  switch (t){
    case 'flame': for (const [dx,dy] of [[0,0],...DIRS8]){ const n = (y+dy)*L.w + x+dx; if (inb(L,x+dx,y+dy) && TP.pass[L.tiles[n]]) addFire(n, 5); } { const ch = charAt(x,y); if (ch) addBuff(ch, 'burning', 6); } break;
    case 'toxic': addGas('toxic', c, 700); break;
    case 'paralytic': addGas('para', c, 500); break;
    case 'frost': for (const [dx,dy] of [[0,0],...DIRS8]){ const nx = x+dx, ny = y+dy; if (!inb(L,nx,ny)) continue; const n = ny*L.w+nx; if (TP.pass[L.tiles[n]]){ addGas('frost', n, 30); L.fire[n] = 0; } const ch = charAt(nx, ny); if (ch){ addBuff(ch, 'frozen', 4); addBuff(ch, 'chill', 6); } } break;
    case 'purity': clearGases(c, 3); break;
    default: if (seen && !known) log('The flask shatters and ' + G.looks.potion[t] + ' liquid splashes harmlessly.', 'info'); return;
  }
  if (seen && !known){ G.known.potion[t] = true; log('It was a potion of ' + POTIONS[t].name + '.', 'mag'); }
}

// ---------- scrolls ----------
function readScroll(it){
  const h = G.hero;
  const t = it.t;
  const wasKnown = isTypeKnown(it);
  const consume = () => { takeOne(it); learnType(it); if (!wasKnown) log('It was a scroll of ' + SCROLLS[t].name + '.', 'mag'); Sound.play('read'); };
  const pick = (title, filter, apply) => {
    if (!wasKnown){ consume(); }
    UI.chooseItem(title, filter, (sel) => {
      if (!sel){ if (wasKnown) return; else { act(() => 1); return; } }
      if (wasKnown) consume();
      apply(sel); act(() => 1);
    });
    return false;
  };
  switch (t){
    case 'upgrade': return pick('Upgrade an item', i => ['weapon','armor','ring','wand','bow','cloak'].includes(i.k), sel => {
      sel.lvl++; if (sel.cursed){ sel.cursed = false; log('The curse on your ' + baseName(sel) + ' is dispelled.', 'good'); }
      if (sel.k === 'wand'){ sel.chMax = wandMax(sel); sel.ch = Math.min(sel.ch + 1, sel.chMax); }
      if (sel.k === 'weapon' && WEAPONS[sel.t].staff){ sel.chMax = staffMax(sel); sel.ch = Math.min(sel.ch + 1, sel.chMax); }
      if (sel.k === 'ring') updateHT();
      log('Your ' + baseName(sel) + ' glows brightly.', 'good'); FX.levelUp(h); });
    case 'identify': return pick('Identify an item', i => !(i.known && isTypeKnown(i)) && ['weapon','armor','ring','wand','potion','scroll'].includes(i.k), sel => {
      identify(sel); log('It is ' + itemName(sel, true) + '.', 'mag'); });
    case 'transmute': return pick('Transmute an item', i => ['weapon','armor','ring','wand','potion','scroll'].includes(i.k) && !(i.k==='weapon' && WEAPONS[i.t].unique) && !isEquipped(i), sel => {
      const pool = sel.k === 'weapon' ? WEAPON_TIERS[WEAPONS[sel.t].tier].concat([]) : sel.k === 'armor' ? Object.keys(ARMORS).filter(a => ARMORS[a].tier === ARMORS[sel.t].tier) :
        sel.k === 'ring' ? Object.keys(RINGS) : sel.k === 'wand' ? Object.keys(WANDS) : sel.k === 'potion' ? Object.keys(POTIONS).filter(p => p !== 'strength') : Object.keys(SCROLLS).filter(s => s !== 'upgrade');
      const opts = pool.filter(p => p !== sel.t && !(sel.k === 'weapon' && WEAPONS[p].unique));
      if (!opts.length){ log('Nothing happens.', 'info'); return; }
      const old = itemName(sel); sel.t = R.pick(opts); if (sel.k === 'wand'){ sel.chMax = wandMax(sel); sel.ch = Math.min(sel.ch, sel.chMax); }
      log('Your ' + old + ' transforms into ' + itemName(sel, true) + '!', 'mag'); });
  }
  consume();
  switch (t){
    case 'removecurse': { let any = false; for (const i of allItems()) if (i.cursed){ i.cursed = false; i.curseKnown = false; if (i.lvl < 0) i.lvl = 0; any = true; } log(any ? 'Your belongings are cleansed of malevolent magic.' : 'Your pack glows with a cleansing light, but nothing happens.', any ? 'good' : 'info'); FX.heal(h); break; }
    case 'mapping': {
      for (let c = 0; c < L.w*L.h; c++){ const tt = L.tiles[c]; if (tt === T.SECRET){ L.tiles[c] = T.DOOR; V.tilesDirty = true; } if (tt !== T.EMPTY) L.visited[c] = 1; const tr = L.traps[c]; if (tr) tr.hidden = false; }
      V.trapDirty = true; log('An image of your surroundings forms in your mind!', 'mag'); FX.burst(h.x, h.y, 0x79a6f5, 20); break; }
    case 'teleport': teleportChar(h); break;
    case 'lullaby': for (const m of L.mobs) if (!m.ally && V.fov[cellOf(m)] && !MOBS[m.type].boss){ m.state = 'sleeping'; m.buffs.sleep = { t: 15 }; FX.text(m.x, m.y, 'z', '#a0b0ff'); } log('The scroll plays a soothing melody. You feel drowsy.', 'mag'); break;
    case 'rage': for (const m of L.mobs) if (!m.ally && m.state !== 'passive'){ m.state = 'hunting'; m.target = { x: h.x, y: h.y }; if (V.fov[cellOf(m)] && !MOBS[m.type].boss) m.buffs.amok = { t: 10 }; } log('The scroll emits an enraging roar that echoes throughout the dungeon!', 'warn'); FX.shake(0.2); break;
    case 'terror': for (const m of L.mobs) if (!m.ally && V.fov[cellOf(m)] && m.state !== 'passive' && !MOBS[m.type].boss){ m.buffs.terror = { t: 15 }; m.state = 'fleeing'; FX.text(m.x, m.y, '!', '#ff8080'); } log('A flash of red light overwhelms your enemies with terror!', 'mag'); FX.burst(h.x, h.y, 0xff4040, 24); break;
    case 'recharging': for (const i of allItems()){ if (i.k === 'wand' || (i.k === 'weapon' && WEAPONS[i.t].staff) || i.k === 'cloak') i.ch = i.chMax; } log('A surge of energy courses through your pack!', 'mag'); FX.burst(h.x, h.y, 0x9ae0ff, 20); break;
    case 'mirror': { let n = 2; for (const [dx,dy] of R.shuffle(DIRS8.slice())){ if (n <= 0) break; const nx = h.x+dx, ny = h.y+dy; if (inb(L,nx,ny) && TP.pass[L.tiles[ny*L.w+nx]] && !charAt(nx,ny)){ const m = mkMob('image', nx, ny); m.state = 'hunting'; m.time = h.time + 1; m.life = 60; L.mobs.push(m); FX.spawn(m); n--; } } log('Mirror images of you appear!', 'mag'); break; }
    case 'retribution': { const pow = 1 - h.hp/h.ht; let any = false; for (const m of L.mobs.slice()) if (!m.ally && V.fov[cellOf(m)] && m.state !== 'passive'){ any = true; FX.burst(m.x, m.y, 0xfff0c0, 12); damage(m, Math.round(h.lvl + m.ht * 0.6 * pow + R.int(5)), h); } log(any ? 'A blast of holy light sears your enemies!' : 'A blast of light flashes, but nothing is nearby.', 'mag'); FX.flash(); break; }
  }
  return 1;
}

// ---------- ranged ----------
function throwItem(it, tx, ty){
  const h = G.hero;
  const one = takeOne(it);
  const b = bolt(h.x, h.y, tx, ty);
  const [ex, ey] = b.end;
  const t = 0.04 * b.path.length + 0.06;
  FX.projectile(h.x, h.y, ex, ey, one, t);
  breakInvisLater();
  if (one.k === 'potion'){ shatterPotion(one.t, ey*L.w + ex); Sound.play('throw'); return 1; }
  if (one.k === 'missile' && b.ch && !b.ch.ally){
    const m = MISSILES[one.t];
    const d = cheb(h.x, h.y, b.ch.x, b.ch.y);
    let dmg = R.normal(m.min, m.max); const excess = heroStr() - (8 + m.tier*2); if (excess > 0) dmg += R.int(0, excess + 1);
    if (h.buffs.weak) dmg = Math.floor(dmg*0.67);
    const surpr = isSurprised(b.ch);
    if (surpr && m.sneak) dmg = Math.round(dmg * 1.5);
    doAttack(h, b.ch, { ranged: true, dmg, accMul: d > 1 ? 1.5 : 1, delay: t });
    if (!R.chance(m.brk)) addHeap(L, cellOf(b.ch), one);
    Sound.play('throw');
    return m.delay || 1;
  }
  if (b.ch && one.k !== 'missile'){ addHeap(L, cellOf(b.ch), one); }
  else addHeap(L, ey*L.w + ex, one);
  V.itemsDirty = true; Sound.play('throw');
  return 1;
}
function breakInvisLater(){ if (G.hero.buffs.invis) breakInvis(); }
function shootBow(it, tx, ty){
  const h = G.hero;
  const b = bolt(h.x, h.y, tx, ty);
  const [ex, ey] = b.end;
  const t = 0.03 * b.path.length + 0.05;
  FX.projectile(h.x, h.y, ex, ey, { k:'arrow' }, t);
  breakInvisLater();
  Sound.play('bow');
  if (b.ch && !b.ch.ally){
    let dmg = R.normal(bowMin(it), bowMax(it)); if (h.buffs.weak) dmg = Math.floor(dmg*0.67);
    const surpr = isSurprised(b.ch); if (surpr) dmg = Math.round(dmg * 1.25);
    doAttack(h, b.ch, { ranged: true, dmg, accMul: 1.25, delay: t });
  }
  return 1;
}
function zapWand(it, tx, ty){
  const h = G.hero;
  const isStaff = it.k === 'weapon';
  const wt = isStaff ? 'missile' : it.t;
  const wl = Math.max(0, it.lvl);
  if (it.ch < 1){ log('Your ' + baseName(it) + ' fizzles; it has no charges left.', 'warn'); return 1; }
  it.ch--;
  if (!isStaff && !it.known){ it.zaps = (it.zaps||0) + 1; if (it.zaps >= 3){ identify(it); log('You are now familiar with your ' + baseName(it) + '. It is ' + itemName(it) + '.', 'good'); } }
  breakInvisLater();
  const [lo, hi] = wandDmg({ t: wt, lvl: wl });
  const col = parseInt(WANDS[wt].color.slice(1), 16);
  Sound.play('zap');
  if (wt === 'fire'){
    const range = 3 + Math.floor(wl/2);
    const ang = Math.atan2(ty - h.y, tx - h.x);
    const cells = [];
    for (let y = h.y - range; y <= h.y + range; y++) for (let x = h.x - range; x <= h.x + range; x++){
      if (!inb(L,x,y) || (x === h.x && y === h.y)) continue;
      const d = Math.sqrt(dist2(x,y,h.x,h.y)); if (d > range + 0.5) continue;
      let da = Math.abs(Math.atan2(y - h.y, x - h.x) - ang); if (da > Math.PI) da = 2*Math.PI - da;
      if (da > 0.55) continue;
      if (!losClear(L, h.x, h.y, x, y) || TP.solid[L.tiles[y*L.w+x]]) continue;
      cells.push([x,y]);
    }
    FX.cone(h.x, h.y, cells, col);
    for (const [x,y] of cells){ const c = y*L.w+x; if (TP.flam[L.tiles[c]] || R.chance(0.3)) addFire(c, 3); const ch = charAt(x,y); if (ch && ch !== h){ damage(ch, R.normal(lo, hi), h, { delay: 0.15 }); addBuff(ch, 'burning', 5); } }
    return 1;
  }
  if (wt === 'disint'){
    const range = 6 + wl*2;
    const b = bolt(h.x, h.y, tx, ty, { extend: true, pierce: true, walls: true, range });
    const [ex, ey] = b.end;
    FX.beam(h.x, h.y, ex, ey, col);
    for (const ch of b.hits) if (ch !== h) damage(ch, R.normal(lo, hi) + Math.floor(b.hits.length/2), h, { delay: 0.1 });
    return 1;
  }
  const b = bolt(h.x, h.y, tx, ty);
  const [ex, ey] = b.end;
  const t = 0.035 * b.path.length + 0.05;
  if (wt === 'lightning'){
    FX.lightningTo(h.x, h.y, ex, ey);
    const targets = [];
    if (b.ch) targets.push(b.ch);
    if (b.ch) for (const o of charsNear(b.ch.x, b.ch.y, 2)) if (o !== h && targets.length < 4 && losClear(L, b.ch.x, b.ch.y, o.x, o.y)) targets.push(o);
    for (let i = 1; i < targets.length; i++) FX.lightning(targets[0], targets[i]);
    const inWater = b.ch && L.tiles[cellOf(b.ch)] === T.WATER;
    for (const ch of targets){ let d = R.normal(lo, hi); if (targets.length > 1) d = Math.round(d * 0.8); if (inWater) d = Math.round(d * 1.3); damage(ch, d, h, { delay: 0.08 }); }
    return 1;
  }
  FX.bolt(h.x, h.y, ex, ey, col, t);
  const ch = b.ch;
  if (!ch){ if (wt === 'blast') FX.burst(ex, ey, col, 14); return 1; }
  if (wt === 'missile'){ damage(ch, R.normal(lo, hi), h, { delay: t }); }
  else if (wt === 'frost'){ damage(ch, R.normal(lo, hi), h, { delay: t }); if (!ch.dead){ if (ch.buffs.chill) addBuff(ch, 'frozen', 3); else addBuff(ch, 'chill', 4 + wl); } }
  else if (wt === 'blast'){
    damage(ch, R.normal(lo, hi), h, { delay: t });
    if (!ch.dead && !MOBS[ch.type]?.immobile && !MOBS[ch.type]?.boss){
      const dx = Math.sign(ch.x - h.x), dy = Math.sign(ch.y - h.y);
      let dist = 2 + Math.floor(wl/2), moved = 0;
      while (dist-- > 0){
        const nx = ch.x + dx, ny = ch.y + dy;
        if (!inb(L,nx,ny) || !TP.pass[L.tiles[ny*L.w+nx]] || charAt(nx,ny) || !diagOK(L, ch.x, ch.y, nx, ny)){ if (moved >= 0) { damage(ch, R.normal(lo, hi), h, { delay: t + 0.1 }); FX.shake(0.12); } break; }
        ch.x = nx; ch.y = ny; moved++;
      }
      FX.move(ch);
      if (moved && !ch.dead) onEnter(ch, cellOf(ch), false);
    }
  }
  return 1;
}

// ---------- boss death / victory ----------
function onBossDeath(m){
  if (m.type === 'yog') { for (const o of L.mobs.slice()) if (o.type === 'larva') die(o, null); }
  L.bossDefeated = true;
  if (L.exit >= 0 && L.tiles[L.exit] === T.SEALED){ L.tiles[L.exit] = T.EXIT; V.tilesDirty = true; }
  for (const o of L.mobs.slice()) if (o.kingMinion) die(o, null);
  const c = cellOf(m);
  addHeap(L, c, mkGold(G.depth * 2));
  addHeap(L, c, vaultItem(G.depth + 2));
  if (m.type === 'goo') addHeap(L, c, mkPotion('healing'));
  log(MOBS[m.type].name + ' has been defeated! The way onward is open.', 'good');
  UI.toast('Victory', MOBS[m.type].name + ' falls');
  FX.shake(0.4); Sound.play('boss');
  V.itemsDirty = true;
}
function victory(){
  V.won = true; G.over = true;
  log('You hold the Amulet of Yendor. Its power is yours!', 'good');
  endRun(true);
}
// ============================================================
// MOB AI
// ============================================================
function mobPassable(c, flying){
  const t = L.tiles[c];
  if (!TP.pass[t]) return false;
  if (!flying){ const tr = L.traps[c]; if (tr && tr.active && !tr.hidden) return false; }
  return true;
}
function distMap(tx, ty, flying){
  if (V.dmapStamp !== G.envTime){ V.dmapCache.clear(); V.dmapStamp = G.envTime; }
  const key = (ty*L.w + tx)*2 + (flying ? 1 : 0);
  let dm = V.dmapCache.get(key);
  if (dm) return dm;
  const n = L.w*L.h, W = L.w;
  dm = new Int16Array(n).fill(-1);
  const q = new Int32Array(n); let qh = 0, qt = 0;
  const s = ty*W + tx; dm[s] = 0; q[qt++] = s;
  while (qh < qt){
    const c = q[qh++]; const x = c % W, y = (c / W) | 0; const nd = dm[c] + 1;
    for (let k = 0; k < 8; k++){
      const dx = DIRS8[k][0], dy = DIRS8[k][1]; const nx = x+dx, ny = y+dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= L.h) continue;
      const m = ny*W + nx;
      if (dm[m] >= 0 || !mobPassable(m, flying)) continue;
      if (dx && dy && !diagOK(L, x, y, nx, ny)) continue;
      dm[m] = nd; q[qt++] = m;
    }
  }
  V.dmapCache.set(key, dm);
  return dm;
}
function moveMob(m, nx, ny){
  const c = ny*L.w + nx;
  m.x = nx; m.y = ny; FX.move(m);
  m.time += moveCost(m);
  onEnter(m, c, false);
}
function stepToward(m, tx, ty){
  if (m.buffs.rooted){ m.time += 1; return true; }
  const flying = !!MOBS[m.type].flying;
  const dm = distMap(tx, ty, flying);
  const cur = dm[cellOf(m)];
  let best = [], bd = cur < 0 ? 32767 : cur;
  for (const [dx,dy] of DIRS8){
    const nx = m.x+dx, ny = m.y+dy; if (!inb(L,nx,ny)) continue;
    const n = ny*L.w+nx; const d = dm[n];
    if (d < 0 || !diagOK(L, m.x, m.y, nx, ny) || charAt(nx, ny)) continue;
    if (d < bd){ bd = d; best = [[nx,ny]]; } else if (d === bd && best.length) best.push([nx,ny]);
  }
  if (!best.length && cur >= 0){
    // try to sidestep around a blocker
    for (const [dx,dy] of R.shuffle(DIRS8.slice())){
      const nx = m.x+dx, ny = m.y+dy; if (!inb(L,nx,ny)) continue;
      const d = dm[ny*L.w+nx];
      if (d === cur && diagOK(L, m.x, m.y, nx, ny) && !charAt(nx,ny) && R.chance(0.35)){ best = [[nx,ny]]; break; }
    }
  }
  if (!best.length && cur < 0){
    // target unreachable: greedy
    let bc = cheb(m.x,m.y,tx,ty);
    for (const [dx,dy] of DIRS8){ const nx = m.x+dx, ny = m.y+dy; if (!inb(L,nx,ny)) continue; const n = ny*L.w+nx;
      if (!mobPassable(n, flying) || !diagOK(L,m.x,m.y,nx,ny) || charAt(nx,ny)) continue;
      const d = cheb(nx,ny,tx,ty); if (d < bc){ bc = d; best = [[nx,ny]]; } }
  }
  if (!best.length) return false;
  const [nx, ny] = R.pick(best);
  moveMob(m, nx, ny);
  return true;
}
function stepAway(m, fx, fy){
  if (m.buffs.rooted){ return false; }
  const flying = !!MOBS[m.type].flying;
  const dm = distMap(fx, fy, flying);
  const cur = dm[cellOf(m)];
  let best = null, bd = cur;
  for (const [dx,dy] of DIRS8){
    const nx = m.x+dx, ny = m.y+dy; if (!inb(L,nx,ny)) continue;
    const n = ny*L.w+nx; const d = dm[n];
    if (d < 0 || !diagOK(L, m.x, m.y, nx, ny) || charAt(nx,ny)) continue;
    if (d > bd || (d === bd && best === null && R.chance(0.3))){ bd = d; best = [nx, ny]; }
  }
  if (!best) return false;
  moveMob(m, best[0], best[1]);
  return true;
}
function canSeeHero(m){
  const h = G.hero;
  if (h.dead || !V.fov[cellOf(m)]) return false;
  if (heroInvisible()) return false;
  return true;
}
function canSeeChar(m, o){
  if (isHero(o)) return canSeeHero(m);
  return cheb(m.x,m.y,o.x,o.y) <= 8 && losClear(L, m.x, m.y, o.x, o.y);
}
function findEnemy(m){
  let best = null, bd = 99;
  const consider = (o) => { if (!o || o.dead || o === m) return; const d = cheb(m.x,m.y,o.x,o.y); if (d < bd && canSeeChar(m, o)){ bd = d; best = o; } };
  if (m.ally){
    for (const o of L.mobs) if (!o.ally && o.state !== 'passive' && !(o.type === 'yog' && invulnerable(o))) consider(o);
    return best;
  }
  if (!(G.hero.buffs.charm && false)) consider(G.hero);
  for (const o of L.mobs) if (o.ally) consider(o);
  if (m.buffs.amok) for (const o of L.mobs) if (!o.ally && o.state !== 'passive') consider(o);
  return best;
}
function notices(m, e){
  const d = cheb(m.x, m.y, e.x, e.y); const st = isHero(e) ? heroStealth() : 1;
  return m.state === 'sleeping' ? R.float(d + st) < 1 : R.float(d/2 + st) < 1;
}
function clearShot(m, e){ const b = bolt(m.x, m.y, e.x, e.y); return b.ch === e; }

function mobAct(m){
  const d = MOBS[m.type];
  if (m.buffs.para || m.buffs.frozen || m.buffs.sleep || m.pumping || m.leaping){ m.time += 1; return; }
  if (m.state === 'passive'){ m.time += 1; return; }
  if (m.bossWake && m.state === 'sleeping'){
    const h = G.hero, A = L.arena;
    if (A && h.x >= A.x0 && h.x <= A.x1 && h.y >= A.y0 && h.y <= A.y1 && heroSees(m.x, m.y)){ wakeBoss(m); }
    else { m.time += 1; return; }
  }
  if (d.immobile){ yogAct(m); return; }
  if (m.ally){ allyAct(m); return; }
  const e = findEnemy(m);
  if (m.state === 'sleeping'){
    if (e && notices(m, e)){ m.state = 'hunting'; m.target = { x: e.x, y: e.y }; FX.alert(m); }
    m.time += 1; return;
  }
  if (m.buffs.terror) m.state = 'fleeing';
  if (m.state === 'wandering'){
    if (e && notices(m, e)){ m.state = 'hunting'; m.target = { x: e.x, y: e.y }; FX.alert(m); }
    else { wander(m); return; }
  }
  if (m.state === 'fleeing'){
    if (!m.buffs.terror && !m.stolen){ m.state = 'hunting'; }
    else {
      const th = e || G.hero;
      if (stepAway(m, th.x, th.y)) return;
      if (e && cheb(m.x,m.y,e.x,e.y) === 1 && diagOK(L,m.x,m.y,e.x,e.y)){ mobMelee(m, e); return; }
      m.time += 1; return;
    }
  }
  // hunting
  if (e){
    m.target = { x: e.x, y: e.y };
    if (d.boss && bossAbility(m, e)) return;
    if (specialAbility(m, e)) return;
    const dist = cheb(m.x, m.y, e.x, e.y);
    if (dist === 1 && diagOK(L, m.x, m.y, e.x, e.y)){ mobMelee(m, e); return; }
    if (d.ranged && dist <= d.ranged.range && clearShot(m, e)){
      const keep = d.keepAway && dist <= d.keepAway + 1;
      if (keep || R.chance(d.ranged.chance)){ mobRanged(m, e); return; }
    }
    if (d.keepAway && dist < d.keepAway && stepAway(m, e.x, e.y)) return;
    if (d.keepAway && dist <= d.keepAway && d.summoner){ m.time += 1; return; }
    if (stepToward(m, e.x, e.y)) return;
    m.time += 1; return;
  }
  if (m.target){
    if (m.x === m.target.x && m.y === m.target.y){ m.target = null; m.state = 'wandering'; m.time += 1; return; }
    if (stepToward(m, m.target.x, m.target.y)) return;
    m.target = null; m.state = 'wandering';
  }
  m.time += 1;
}
function wander(m){
  if (!m.wt || (m.x === m.wt.x && m.y === m.wt.y) || R.chance(0.04)){
    const rm = L.rooms && L.rooms.length ? R.pick(L.rooms) : null;
    m.wt = rm ? { x: R.range(rm.x, rm.x + rm.w - 1), y: R.range(rm.y, rm.y + rm.h - 1) } : { x: m.x, y: m.y };
  }
  if (!stepToward(m, m.wt.x, m.wt.y)){ m.wt = null; m.time += 1; }
}
function allyAct(m){
  const e = findEnemy(m);
  if (e){
    if (cheb(m.x,m.y,e.x,e.y) === 1 && diagOK(L,m.x,m.y,e.x,e.y)){ mobMelee(m, e); return; }
    if (stepToward(m, e.x, e.y)) return;
  } else {
    const h = G.hero;
    if (cheb(m.x,m.y,h.x,h.y) > 2 && stepToward(m, h.x, h.y)) return;
  }
  m.time += 1;
}
function mobMelee(m, e){
  doAttack(m, e);
  Sound.play(isHero(e) ? 'swing2' : 'swing');
  m.time += attackDelay(m);
}
function mobRanged(m, e){
  const r = MOBS[m.type].ranged;
  const dist = Math.max(1, cheb(m.x,m.y,e.x,e.y));
  const t = 0.035*dist + 0.05;
  const colors = { lightning:0x9ae0ff, bolt:0xb07cff, fire:0xff7a20, spit:0xa0d040 };
  if (r.kind === 'lightning') FX.lightningTo(m.x, m.y, e.x, e.y); else FX.bolt(m.x, m.y, e.x, e.y, colors[r.kind] || 0xffffff, t);
  Sound.play('zap');
  let dmg = R.normal(r.dmg[0], r.dmg[1]);
  if (r.kind === 'lightning' && L.tiles[cellOf(e)] === T.WATER) dmg = Math.round(dmg*1.3);
  const hit = doAttack(m, e, { ranged: true, dmg, delay: t });
  if (hit && !e.dead){
    if (r.effect === 'weak' && R.chance(0.5)) addBuff(e, 'weak', 10);
    if (r.effect === 'cripple') addBuff(e, 'cripple', 6);
    if (r.kind === 'fire' && R.chance(0.5)) addBuff(e, 'burning', 5);
  }
  m.time += 1;
}
function freeAdj(x, y, flyOk){
  const out = [];
  for (const [dx,dy] of DIRS8){ const nx = x+dx, ny = y+dy; if (!inb(L,nx,ny)) continue; const c = ny*L.w+nx; if (TP.pass[L.tiles[c]] && !charAt(nx,ny) && diagOK(L,x,y,nx,ny)) out.push([nx,ny]); }
  return R.shuffle(out);
}
function summonAt(type, x, y, flags){
  const spots = freeAdj(x, y); if (!spots.length) return null;
  const [nx, ny] = spots[0];
  const m = mkMob(type, nx, ny); m.state = 'hunting'; m.time = G.hero.time + 1; Object.assign(m, flags || {});
  L.mobs.push(m); FX.spawn(m);
  return m;
}
function specialAbility(m, e){
  const d = MOBS[m.type];
  const dist = cheb(m.x, m.y, e.x, e.y);
  if (d.chain && !m.cd.chain && dist >= 2 && dist <= 4 && R.chance(0.5) && clearShot(m, e) && !MOBS[e.type]?.boss){
    const b = bolt(m.x, m.y, e.x, e.y);
    const [px, py] = b.path[0];
    if (!charAt(px, py) && TP.pass[L.tiles[py*L.w+px]]){
      FX.chain(m, e);
      e.x = px; e.y = py; FX.move(e, true);
      if (isHero(e)){ log('The guard pulls you in with its chain!', 'bad'); updateFOV(); }
      addBuff(e, 'cripple', 3);
      m.cd.chain = 10; m.time += 1; return true;
    }
  }
  if (d.summoner && !m.cd.summon && !L.mobs.some(o => o.id === m.minion && !o.dead)){
    const sk = summonAt('skeleton', e.x, e.y) || summonAt('skeleton', m.x, m.y);
    if (sk){ m.minion = sk.id; m.cd.summon = 10; if (heroSees(m.x, m.y)) log('The necromancer raises a skeleton!', 'warn'); m.time += 1; return true; }
  }
  if (d.gasVent && !m.cd.gas && dist >= 2 && dist <= 6 && R.chance(0.5) && clearShot(m, e)){
    FX.bolt(m.x, m.y, e.x, e.y, 0x9fe05a, 0.25); addGas('toxic', cellOf(e), 350);
    if (heroSees(m.x, m.y)) log('DM-200 vents a cloud of caustic gas!', 'warn');
    m.cd.gas = 12; m.time += 1; return true;
  }
  if (d.webber && !m.cd.web && dist >= 2 && dist <= 5 && R.chance(0.4) && clearShot(m, e)){
    FX.bolt(m.x, m.y, e.x, e.y, 0xeeeeee, 0.2);
    for (const [dx,dy] of [[0,0],...DIRS4]){ const nx = e.x+dx, ny = e.y+dy; if (inb(L,nx,ny) && TP.pass[L.tiles[ny*L.w+nx]]) L.web[ny*L.w+nx] = 1; }
    L.web[cellOf(e)] = 0; addBuff(e, 'rooted', 3); V.blobDirty = true;
    if (heroSees(m.x, m.y)) log('The spinner shoots a sticky web!', 'warn');
    m.cd.web = 10; m.time += 1; return true;
  }
  if (d.beam && !m.cd.beam && dist <= 6 && clearShot(m, e)){
    const b = bolt(m.x, m.y, e.x, e.y, { extend: true, pierce: true, range: 9 });
    addWarning(b.path.map(([x,y]) => y*L.w+x), 'beam', 1, { src: m.id, dmg: [30, 50] });
    m.pumping = true; m.cd.beam = 7; FX.charge(m, 0xffd040);
    if (heroSees(m.x, m.y)) log('The evil eye is gathering power!', 'warn');
    m.time += 1; return true;
  }
  if (d.leap && !m.cd.leap && dist >= 2 && dist <= 5 && clearShot(m, e)){
    addWarning([cellOf(e)], 'leap', 1, { src: m.id });
    m.leaping = true; m.cd.leap = 6; FX.charge(m, 0xff3030);
    m.time += 1; return true;
  }
  if (d.charm && !m.cd.blink && dist >= 3 && dist <= 6 && R.chance(0.5)){
    const spots = freeAdj(e.x, e.y);
    if (spots.length){ FX.puff(m.x, m.y); m.x = spots[0][0]; m.y = spots[0][1]; FX.teleport(m); m.cd.blink = 8; m.time += 1; return true; }
  }
  return false;
}
function onMobDamaged(m, dmg, src){
  const d = MOBS[m.type];
  if (m.hp <= 0) return;
  if (d.split && m.hp >= 2){
    const spots = freeAdj(m.x, m.y);
    if (spots.length){
      const c = mkMob('swarm', spots[0][0], spots[0][1]);
      c.hp = Math.floor(m.hp/2); m.hp -= c.hp; c.ht = m.ht; c.state = 'hunting'; c.noexp = true; c.time = m.time; c.target = m.target;
      L.mobs.push(c); FX.spawn(c);
    }
  }
  if (d.enrage && !m.enraged && m.hp*2 <= m.ht){ m.enraged = true; if (heroSees(m.x,m.y)) log('The gnoll brute is enraged!', 'warn'); FX.burst(m.x, m.y, 0xff3030, 12); }
  if (m.type === 'tengu'){
    m.dmgAcc = (m.dmgAcc || 0) + dmg;
    if (m.dmgAcc >= 22){ m.dmgAcc = 0; tenguBlink(m); }
  }
  if (m.type === 'dm300' && !m.supercharged && m.hp*2 <= m.ht){ m.supercharged = true; log('DM-300 overheats and starts moving faster!', 'warn'); FX.burst(m.x, m.y, 0xff7a30, 20); }
}
function tenguBlink(m){
  const A = L.arena; const h = G.hero;
  for (let tries = 0; tries < 80; tries++){
    const x = R.range(A.x0, A.x1), y = R.range(A.y0, A.y1);
    if (!TP.pass[L.tiles[y*L.w+x]] || charAt(x,y) || cheb(x,y,h.x,h.y) < 4) continue;
    FX.puff(m.x, m.y); m.x = x; m.y = y; FX.teleport(m);
    if (heroSees(x,y) || true) log('Tengu vanishes in a puff of smoke!', 'warn');
    return;
  }
}
function wakeBoss(m){
  m.state = 'hunting'; m.target = { x: G.hero.x, y: G.hero.y };
  for (const o of L.mobs) if (o.bossWake && o.state === 'sleeping'){ o.state = 'hunting'; o.target = { x: G.hero.x, y: G.hero.y }; }
  const lines = {
    goo: 'GLURP-GLURP! A mass of ooze heaves itself toward you!',
    tengu: 'Tengu: "Fugitive spotted. I\'ll put you back where you belong."',
    dm300: 'DM-300: "UNAUTHORIZED PERSONNEL DETECTED."',
    king: 'King of Dwarves: "How dare you trespass in my halls! Rise, my subjects!"',
    yog: 'The sealed stone cracks with light. Yog-Dzewa\'s guardians rise.',
  };
  const key = m.type === 'fistb' || m.type === 'fistr' ? 'yog' : m.type;
  if (lines[key] && !L.bossAnnounced){ L.bossAnnounced = true; log(lines[key], 'bad'); UI.toast(MOBS[key === 'yog' ? 'yog' : m.type].name, 'Floor ' + G.depth + ' guardian'); Sound.play('boss'); }
}
function bossAbility(m, e){
  const dist = cheb(m.x, m.y, e.x, e.y);
  switch (m.type){
    case 'goo':
      if (!m.cd.pump && dist <= 2 && R.chance(0.45)){
        const cells = [cellOf(m)];
        for (const [dx,dy] of DIRS8){ const nx = m.x+dx, ny = m.y+dy; if (inb(L,nx,ny) && TP.pass[L.tiles[ny*L.w+nx]]) cells.push(ny*L.w+nx); }
        addWarning(cells, 'pump', 1, { src: m.id });
        m.pumping = true; m.cd.pump = 7; FX.charge(m, 0xff5040);
        log('Goo is pumping itself up! Step away!', 'warn');
        m.time += 1; return true;
      }
      return false;
    case 'tengu':
      if (m.hp*2 < m.ht && !m.cd.bomb){
        const cells = [];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){ const nx = e.x+dx, ny = e.y+dy; if (inb(L,nx,ny) && TP.pass[L.tiles[ny*L.w+nx]]) cells.push(ny*L.w+nx); }
        FX.projectile(m.x, m.y, e.x, e.y, { k:'bomb' }, 0.3);
        addWarning(cells, 'bomb', 2, { dmg: [8, 16] });
        log('Tengu throws a bomb!', 'warn');
        m.cd.bomb = 6; m.time += 1; return true;
      }
      if (dist >= 2 && clearShot(m, e) && R.chance(0.6)){
        const t = 0.035*dist + 0.05;
        FX.projectile(m.x, m.y, e.x, e.y, { k:'shuriken' }, t); Sound.play('throw');
        doAttack(m, e, { ranged: true, dmg: R.normal(6, 12), delay: t });
        m.time += 1; return true;
      }
      return false;
    case 'dm300':
      if (!m.cd.ab && dist <= 7){
        if (R.chance(0.5) && clearShot(m, e)){
          FX.bolt(m.x, m.y, e.x, e.y, 0x9fe05a, 0.3); addGas('toxic', cellOf(e), 500);
          log('DM-300 vents a cloud of toxic gas!', 'warn');
        } else {
          const cells = [];
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){ const nx = e.x+dx, ny = e.y+dy; if (inb(L,nx,ny) && TP.pass[L.tiles[ny*L.w+nx]]) cells.push(ny*L.w+nx); }
          addWarning(cells, 'rock', 1, { src: m.id, dmg: [10, 20] });
          log('DM-300 slams the ground. Rocks begin to fall!', 'warn'); FX.shake(0.15);
        }
        m.cd.ab = R.range(6, 9); m.time += 1; return true;
      }
      return false;
    case 'king': {
      if (!m.phase2 && m.hp*2 < m.ht){
        m.phase2 = true; m.waves = Math.max(3, m.waves || 0);
        const tc = [16, L.arena.y0 + 3];
        if (!charAt(tc[0], tc[1])){ FX.puff(m.x, m.y); m.x = tc[0]; m.y = tc[1]; FX.teleport(m); }
        for (const t of ['monk','warlock','ghoul']) summonAt(t, m.x, m.y, { kingMinion: true, noexp: true });
        log('King of Dwarves: "Enough! My finest warriors will end you!"', 'bad');
        m.cd.summon = 14; m.time += 1; return true;
      }
      if (!m.cd.summon && (m.waves || 0) < (m.phase2 ? 6 : 3)){
        const alive = L.mobs.filter(o => o.kingMinion && !o.dead).length;
        if (alive < 4){
          m.waves = (m.waves || 0) + 1;
          const types = m.phase2 ? ['monk','warlock'] : ['ghoul','ghoul'];
          for (const t of types) summonAt(t, m.x, m.y, { kingMinion: true, noexp: true });
          log('The King of Dwarves summons his subjects!', 'warn'); FX.charge(m, 0xff60ff);
          m.cd.summon = 12; m.time += 1; return true;
        }
      }
      return false;
    }
  }
  return false;
}
function yogAct(m){
  m.time += 1;
  if (m.state === 'sleeping') return;
  const h = G.hero;
  const fists = L.mobs.some(o => !o.dead && (o.type === 'fistb' || o.type === 'fistr'));
  if (!m.cd.laser && heroSees(m.x, m.y) && !h.dead){
    const b = bolt(m.x, m.y, h.x, h.y, { extend: true, pierce: true, range: 24 });
    addWarning(b.path.map(([x,y]) => y*L.w+x), 'laser', 1, { src: m.id, dmg: [22, 36] });
    FX.charge(m, 0xff3020);
    log('Yog-Dzewa\'s gaze burns toward you! Get out of its path!', 'warn');
    m.cd.laser = fists ? 6 : 4;
  }
  if (!m.cd.larva && L.mobs.filter(o => o.type === 'larva' && !o.dead).length < 4){
    const lv = summonAt('larva', m.x, m.y + 1) || summonAt('larva', m.x, m.y);
    if (lv) lv.noexp = false;
    m.cd.larva = fists ? 10 : 6;
  }
}
// ============================================================
// PROCEDURAL PIXEL TEXTURES (atlas) + ICONS
// ============================================================
const TS = 32, AN = 16, AS = TS*AN; // tile px, tiles per row, atlas px
const TILE = { F0:0, F1:1, F2:2, F3:3, W0:4, W1:5, W2:6, WTOP:7, WATERBED:8, GRASSF:9, EMBER:10, SPF:11, DOOR:12, WOOD:13, STEP:14, STEPSIDE:15,
  PED:16, PEDSIDE:17, STONE:18, SHELF:19, LDOOR:20, VOID:23, THRONE:24, TRAP:25, PIT:26, METAL:27, CLOTH:28 };
const PALS = [
  { floor:[[74,88,76],[82,98,84],[64,76,66]], grout:[34,42,37], wall:[[80,94,84],[90,106,94],[68,80,72]], mortar:[36,44,40], top:[30,37,34], moss:[92,126,60], wbed:[46,66,58], grass:[78,118,52], accent:[150,124,70], wood:[100,72,44], metal:[112,122,118], sp:[[70,96,90],[60,84,78]], style:'flag' },
  { floor:[[88,92,102],[98,102,114],[76,80,90]], grout:[40,42,50], wall:[[96,100,112],[108,112,124],[82,86,98]], mortar:[44,46,54], top:[34,36,42], moss:[96,108,84], wbed:[56,68,86], grass:[90,116,72], accent:[160,84,60], wood:[92,68,46], metal:[134,138,146], sp:[[120,96,70],[100,80,60]], style:'cobble' },
  { floor:[[112,86,62],[124,96,68],[98,74,54]], grout:[62,46,34], wall:[[128,98,66],[142,110,74],[110,84,58]], mortar:[72,52,38], top:[52,40,30], moss:[104,140,70], wbed:[60,82,90], grass:[116,142,62], accent:[80,210,210], wood:[104,76,50], metal:[142,122,100], sp:[[120,100,80],[100,80,62]], style:'rock' },
  { floor:[[118,104,128],[130,116,140],[106,92,116]], grout:[58,48,64], wall:[[152,128,98],[166,142,110],[136,114,88]], mortar:[82,66,52], top:[64,54,52], moss:[112,122,82], wbed:[70,84,128], grass:[112,132,82], accent:[226,186,84], wood:[112,82,58], metal:[204,174,104], sp:[[150,40,56],[120,30,44]], style:'tile' },
  { floor:[[60,36,38],[68,42,42],[50,30,32]], grout:[22,10,12], wall:[[72,42,44],[82,48,48],[60,34,36]], mortar:[26,12,14], top:[24,14,16], moss:[150,46,30], wbed:[90,24,18], grass:[124,64,42], accent:[255,110,40], wood:[72,42,38], metal:[124,92,92], sp:[[40,20,24],[90,30,30]], style:'obsidian' },
];
function makeAtlas(region){
  const P = PALS[region];
  const cv = document.createElement('canvas'); cv.width = cv.height = AS;
  const ecv = document.createElement('canvas'); ecv.width = ecv.height = AS;
  const ctx = cv.getContext('2d'), ectx = ecv.getContext('2d');
  const img = ctx.createImageData(AS, AS), eimg = ectx.createImageData(AS, AS);
  const D = img.data, E = eimg.data;
  for (let i = 3; i < E.length; i += 4) E[i] = 255;
  const seed = region*1000 + 7;
  const N = (x, y, s) => hash2(x, y, seed + (s||0));
  const sh = (c, f) => [c[0]*f, c[1]*f, c[2]*f];
  const mix = (a, b, t) => [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t];
  function paint(tile, fn){
    const ox = (tile % AN)*TS, oy = Math.floor(tile / AN)*TS;
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++){
      const r = fn(x, y); const c = r.c || r; const i = ((oy+y)*AS + ox + x)*4;
      // quantize lightly for a pixel-art palette feel
      D[i] = clamp(Math.round(c[0]/4)*4, 0, 255); D[i+1] = clamp(Math.round(c[1]/4)*4, 0, 255); D[i+2] = clamp(Math.round(c[2]/4)*4, 0, 255); D[i+3] = 255;
      if (r.g){ E[i] = clamp(r.g[0],0,255); E[i+1] = clamp(r.g[1],0,255); E[i+2] = clamp(r.g[2],0,255); }
    }
  }
  // ---- floor pattern: stones contained within the tile ----
  function floorStone(x, y, v){
    const s = P.style;
    if (s === 'rock'){
      const n1 = N(x>>1, y>>1, v*13), n2 = N(x>>2, y>>2, v*7+1), n3 = N(x, y, v*3+2);
      let c = P.floor[(n2*3)|0];
      c = sh(c, 0.88 + n1*0.18 + (n3 > 0.93 ? 0.18 : 0) - (n3 < 0.05 ? 0.2 : 0));
      if (N(x>>2, y>>2, v+99) > 0.86 && N(x,y,v+5) > 0.4) c = sh(P.grout, 1.3);
      return { c };
    }
    if (s === 'cobble'){
      const cx = x >> 3, cy = y >> 3; const lx = x & 7, ly = y & 7;
      const id = cx + cy*4 + v*16;
      if (lx === 0 || ly === 0) return { c: sh(P.grout, 0.9 + N(x,y,v)*0.2) };
      let c = P.floor[(N(id, 0, 11)*3)|0];
      let f = 0.92 + N(x, y, v+3)*0.14;
      if (ly === 1 || lx === 1) f += 0.12; if (ly === 7 || lx === 7) f -= 0.14;
      if ((lx === 1 || lx === 7) && (ly === 1 || ly === 7)) return { c: sh(P.grout, 1.2) };
      return { c: sh(c, f) };
    }
    if (s === 'tile'){
      const lx = x & 15, ly = y & 15; const id = (x>>4) + (y>>4)*2 + v*4;
      if (lx === 0 || ly === 0) return { c: P.grout };
      let c = P.floor[(N(id,0,5)*3)|0];
      let f = 1;
      if (lx === 1 || ly === 1) f = 1.2; else if (lx === 15 || ly === 15) f = 0.78;
      else if (lx >= 4 && lx <= 12 && ly >= 4 && ly <= 12 && (lx === 4 || lx === 12 || ly === 4 || ly === 12)) f = 0.86;
      if (lx > 1 && ly > 1 && lx + ly < 9) f += 0.06;
      return { c: sh(c, f * (0.96 + N(x,y,v)*0.06)) };
    }
    if (s === 'obsidian'){
      const lx = x & 15, ly = y & 15; const id = (x>>4) + (y>>4)*2 + v*4;
      if (lx === 0 || ly === 0) return { c: P.grout };
      let c = P.floor[(N(id,0,5)*3)|0];
      let f = 0.9 + N(x>>1, y>>1, v)*0.15; if (lx === 1 || ly === 1) f += 0.15;
      // glowing cracks
      const crack = Math.abs(Math.sin((x*0.7 + y*0.35) + N(id,1,2)*6)) < 0.08 && N(x,y,v+4) > 0.35 && v !== 0;
      if (crack) return { c: [210, 70, 30], g: [190, 60, 20] };
      return { c: sh(c, f) };
    }
    // flagstones (sewers): quadrants, optionally split
    const qx = x >> 4, qy = y >> 4, lx = x & 15, ly = y & 15;
    const split = N(qx, qy, v*5) ;
    let sx = lx, sy = ly, sid = qx + qy*2;
    if (split < 0.35){ if (ly >= 8){ sy = ly - 8; sid += 10; } }
    else if (split < 0.6){ if (lx >= 8){ sx = lx - 8; sid += 20; } }
    const w = split < 0.35 ? 16 : (split < 0.6 ? 8 : 16), h = split < 0.35 ? 8 : 16;
    if (x === 0 || y === 0 || sx === 0 || sy === 0) {
      if (N(x, y, v+31) > 0.7 && region === 0) return { c: sh(P.moss, 0.7 + N(x,y,2)*0.3) };
      return { c: sh(P.grout, 0.9 + N(x,y,v)*0.2) };
    }
    let c = P.floor[(N(sid, v, 3)*3)|0];
    let f = 0.93 + N(x, y, v+9)*0.1;
    if (sy === 1 || sx === 1) f += 0.12; if (sy === h-1 || sx === w-1) f -= 0.12;
    if (N(x>>1, y>>1, v+77) > 0.94) f -= 0.18;
    return { c: sh(c, f) };
  }
  paint(TILE.F0, (x,y) => floorStone(x,y,0));
  paint(TILE.F1, (x,y) => floorStone(x,y,1));
  paint(TILE.F2, (x,y) => { const r = floorStone(x,y,2); if (N(x>>1,y>>1,51) > 0.9) r.c = sh(r.c, 0.75); return r; });
  paint(TILE.F3, (x,y) => {
    const r = floorStone(x,y,3);
    if (region === 0 && N(x>>2,y>>2,61) > 0.72) r.c = mix(r.c, P.moss, 0.55);
    if (region === 1 && N(x>>1,y>>1,61) > 0.88) r.c = mix(r.c, [90,30,26], 0.5);
    if (region === 2 && N(x,y,61) > 0.95) r.c = [P.accent[0], P.accent[1], P.accent[2]];
    if (region === 3 && N(x>>2,y>>2,61) > 0.85) r.c = sh(r.c, 1.15);
    return r;
  });
  // ---- walls ----
  function wall(x, y, v){
    const s = P.style;
    if (s === 'rock'){
      const n1 = N(x>>2, y>>2, v+40), n2 = N(x>>1, y>>1, v+41), n3 = N(x, y, v+42);
      let c = P.wall[(n1*3)|0];
      let f = 0.85 + n2*0.22 + (n3 > 0.92 ? 0.15 : 0);
      if (Math.abs(Math.sin(x*0.5 + y*0.9 + v)) < 0.06) f = 0.55;
      if (y > 27) f *= 0.82;
      if (v === 2 && N(x>>1,y>>1,9) > 0.9) return { c: P.accent, g: sh(P.accent, 0.8) };
      return { c: sh(c, f) };
    }
    const bw = s === 'tile' ? 16 : (s === 'obsidian' ? 16 : 10), bh = s === 'tile' ? 16 : 8;
    const row = Math.floor(y / bh), off = (row % 2) * (bw >> 1);
    const xx = x + off, col = Math.floor(xx / bw), lx = xx % bw, ly = y % bh;
    if (ly === 0 || lx === 0 || x === 0) return { c: sh(P.mortar, 0.9 + N(x,y,v)*0.2) };
    let c = P.wall[(N(col, row, v*3+5)*3)|0];
    let f = 0.92 + N(x, y, v+17)*0.1;
    if (ly === 1) f += 0.16; if (ly === bh-1) f -= 0.16; if (lx === 1) f += 0.06; if (lx === bw-1) f -= 0.08;
    if (s === 'tile' && ly === 8 && region === 3 && v === 2) return { c: P.accent, g: sh(P.accent, 0.25) };
    let out = sh(c, f);
    if (region === 0 && y > 22 && N(x, y>>1, v+71) > 0.55 - (y-22)*0.04) out = mix(out, P.moss, 0.6);
    if (region === 4 && v === 2 && Math.abs(Math.sin(x*0.8 - y*0.4)) < 0.07) return { c: [220,80,30], g: [200,60,20] };
    if (v === 1 && N(x>>1, y>>1, 13) > 0.93) out = sh(out, 0.7);
    return { c: out };
  }
  paint(TILE.W0, (x,y) => wall(x,y,0));
  paint(TILE.W1, (x,y) => wall(x,y,1));
  paint(TILE.W2, (x,y) => {
    const r = wall(x,y,2);
    if (region === 0 && x >= 11 && x <= 20 && y >= 18 && y <= 27){ // sewer grate
      const gx = (x - 11) % 3 === 0, gy = (y-18) === 0 || (y-18) === 9;
      return { c: (gx || gy) ? P.metal : [16,22,18] };
    }
    if (region === 1 && x >= 9 && x <= 22 && y >= 6 && y <= 20){ // barred window
      const gx = (x - 9) % 4 === 0 || x === 22, gy = y === 6 || y === 20;
      return { c: (gx || gy) ? P.metal : [14,14,18] };
    }
    if (region === 3 && y >= 4 && y <= 28 && x >= 12 && x <= 19){ // banner
      const edge = x === 12 || x === 19; const tri = y > 24 && Math.abs(x - 15.5) < (y - 24);
      if (tri) return r;
      return { c: edge ? P.accent : [120, 36, 52] };
    }
    return r;
  });
  paint(TILE.WTOP, (x,y) => {
    const edge = x === 0 || y === 0 || x === 31 || y === 31;
    const f = 0.85 + N(x>>1, y>>1, 91)*0.3;
    return { c: edge ? sh(P.wall[0], 0.7) : sh(P.top, f) };
  });
  paint(TILE.WATERBED, (x,y) => ({ c: sh(P.wbed, 0.8 + N(x>>1,y>>1,21)*0.35) }));
  paint(TILE.GRASSF, (x,y) => {
    const base = floorStone(x,y,1);
    const n = N(x, y, 33);
    if (n > 0.45){ const g = N(x, y>>1, 34); return { c: sh(P.grass, 0.65 + g*0.5) }; }
    return { c: mix(base.c, P.grass, 0.25) };
  });
  paint(TILE.EMBER, (x,y) => {
    const base = sh(P.floor[2], 0.5 + N(x>>1,y>>1,41)*0.25);
    const n = N(x, y, 42);
    if (n > 0.9) return { c: [255, 140, 40], g: [230, 110, 20] };
    if (n > 0.8) return { c: [170, 50, 20], g: [90, 20, 6] };
    return { c: base };
  });
  paint(TILE.SPF, (x,y) => {
    const s = P.sp;
    if (region === 3){ // carpet
      const b = x <= 2 || x >= 29;
      if (b) return { c: x === 1 || x === 30 ? P.accent : sh(s[1], 0.8) };
      const d = ((x + y) % 8 === 0 || (x - y + 64) % 8 === 0) ? 1.25 : 1;
      return { c: sh(s[0], d * (0.92 + N(x,y,1)*0.1)) };
    }
    const chk = ((x >> 3) + (y >> 3)) % 2;
    const lx = x & 7, ly = y & 7;
    let c = s[chk]; let f = 1; if (lx === 0 || ly === 0) f = 0.7; else if (lx === 1 || ly === 1) f = 1.15;
    return { c: sh(c, f * (0.95 + N(x,y,3)*0.08)) };
  });
  // wood / doors
  const plank = (x, y, base, s) => { const pw = 8; const p = Math.floor(x / pw); const lx = x % pw; let f = 0.9 + N(p, y>>3, s)*0.15 + N(x, y, s+1)*0.06; if (lx === 0) f = 0.55; if ((y + p*7) % 13 === 0 && lx > 2 && lx < 6) f *= 0.8; return sh(base, f); };
  paint(TILE.DOOR, (x,y) => { if (y === 4 || y === 5 || y === 26 || y === 27) return { c: sh(P.metal, x % 6 === 2 ? 1.3 : 0.85) }; if (x >= 24 && x <= 26 && y >= 14 && y <= 17) return { c: sh(P.metal, 1.1) }; return { c: plank(x, y, P.wood, 3) }; });
  paint(TILE.LDOOR, (x,y) => { if (y === 4 || y === 5 || y === 26 || y === 27 || y === 15 || y === 16) return { c: sh(P.metal, x % 5 === 2 ? 1.4 : 0.9) }; if (x >= 21 && x <= 25 && y >= 10 && y <= 21){ const k = (x === 23 && y >= 13 && y <= 18); return { c: k ? [20,16,10] : [214,170,60] }; } return { c: plank(x, y, sh(P.wood, 0.85), 5) }; });
  paint(TILE.WOOD, (x,y) => ({ c: sh(P.wood, 0.75 + N(x, y>>2, 7)*0.2 + (y % 8 === 0 ? -0.2 : 0)) }));
  paint(TILE.STEP, (x,y) => { const e = y < 3; return { c: sh(P.floor[0], (e ? 1.2 : 0.9) + N(x>>1, y>>1, 61)*0.12) }; });
  paint(TILE.STEPSIDE, (x,y) => ({ c: sh(P.floor[2], 0.6 + N(x>>1,y>>1,62)*0.15) }));
  paint(TILE.PED, (x,y) => { const r = Math.max(Math.abs(x-15.5), Math.abs(y-15.5)); let f = r > 13 ? 1.2 : (r > 11 ? 0.8 : 1); if (r < 5) f = 1.12; return { c: sh(P.wall[1], f * (0.95 + N(x,y,71)*0.08)) }; });
  paint(TILE.PEDSIDE, (x,y) => { let f = (y < 3) ? 1.2 : (y > 28 ? 0.75 : 0.95); if (x % 8 === 0) f *= 0.8; return { c: sh(P.wall[1], f) }; });
  paint(TILE.STONE, (x,y) => ({ c: sh([150, 148, 140], 0.75 + N(x>>1, y>>1, 81)*0.3) }));
  paint(TILE.SHELF, (x,y) => {
    const shelf = y % 10 === 0 || y % 10 === 1; const side = x < 2 || x > 29;
    if (shelf || side) return { c: sh(P.wood, shelf ? 0.7 : 0.6) };
    const book = (x + Math.floor(y/10)*3) >> 1;
    const cols = [[140,40,40],[40,70,130],[60,110,50],[150,120,50],[90,50,110],[120,80,50]];
    const c = cols[(N(book, Math.floor(y/10), 3)*cols.length)|0];
    if (N(book, Math.floor(y/10), 4) > 0.85) return { c: [20,16,12] };
    return { c: sh(c, (x % 2 === 0 ? 1.1 : 0.85) * ((y%10) === 2 ? 0.8 : 1)) };
  });
  paint(TILE.VOID, (x,y) => ({ c: [8, 8, 10] }));
  paint(TILE.PIT, (x,y) => ({ c: sh(P.wall[2], 0.35 + (32-y)/32*0.3) }));
  paint(TILE.THRONE, (x,y) => { const e = x < 3 || x > 28 || y < 3; return { c: e ? P.accent : sh([110, 40, 120], 0.85 + N(x,y,1)*0.15) }; });
  paint(TILE.TRAP, (x,y) => {
    const dx = x - 15.5, dy = y - 15.5, r = Math.sqrt(dx*dx + dy*dy);
    const edge = x < 2 || y < 2 || x > 29 || y > 29;
    if (edge) return { c: [60, 60, 60] };
    if (Math.abs(r - 10) < 1.2 || (r < 5 && (Math.abs(dx) < 1 || Math.abs(dy) < 1))) return { c: [255,255,255], g: [140,140,140] };
    return { c: [90, 90, 90] };
  });
  paint(TILE.METAL, (x,y) => ({ c: sh(P.metal, 0.8 + N(x>>1,y>>1,5)*0.3 + (y < 2 ? 0.2 : 0)) }));
  paint(TILE.CLOTH, (x,y) => ({ c: sh([200, 200, 200], 0.85 + N(x>>1,y,5)*0.2) }));
  ctx.putImageData(img, 0, 0); ectx.putImageData(eimg, 0, 0);
  return { canvas: cv, emissive: ecv };
}
function tileUV(tile){
  const col = tile % AN, row = Math.floor(tile / AN);
  const e = 0.5 / AS;
  const u0 = col*TS/AS + e, u1 = (col+1)*TS/AS - e;
  const v1 = 1 - row*TS/AS - e, v0 = 1 - (row+1)*TS/AS + e;
  return [u0, v0, u1, v1];
}

// grass tuft texture with alpha
function makeGrassTex(region){
  const cv = document.createElement('canvas'); cv.width = 32; cv.height = 32;
  const ctx = cv.getContext('2d');
  const P = PALS[region];
  for (let i = 0; i < 18; i++){
    const x = 2 + Math.floor(hash2(i, 1, region)*28), h = 12 + Math.floor(hash2(i, 2, region)*18), lean = (hash2(i,3,region) - 0.5)*6;
    const f = 0.7 + hash2(i,4,region)*0.5;
    for (let y = 0; y < h; y++){
      const xx = Math.round(x + lean * (y/h)*(y/h));
      const c = P.grass.map(v => clamp(Math.round(v * f * (0.7 + 0.5*y/h)), 0, 255));
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      ctx.fillRect(xx, 31 - y, y < h*0.6 ? 2 : 1, 1);
    }
  }
  return cv;
}
function makeSoftTex(){
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const ctx = cv.getContext('2d'); const g = ctx.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0,0,64,64); return cv;
}
function makeWebTex(){
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const ctx = cv.getContext('2d');
  ctx.strokeStyle = 'rgba(235,235,235,0.85)'; ctx.lineWidth = 1;
  for (let a = 0; a < 8; a++){ ctx.beginPath(); ctx.moveTo(32,32); ctx.lineTo(32 + Math.cos(a*Math.PI/4)*31, 32 + Math.sin(a*Math.PI/4)*31); ctx.stroke(); }
  for (let r = 6; r < 32; r += 6){ ctx.beginPath(); for (let a = 0; a <= 8; a++){ const x = 32 + Math.cos(a*Math.PI/4)*r, y = 32 + Math.sin(a*Math.PI/4)*r; a ? ctx.lineTo(x,y) : ctx.moveTo(x,y); } ctx.stroke(); }
  return cv;
}
function makeGrainTex(){
  const cv = document.createElement('canvas'); cv.width = cv.height = 16; const ctx = cv.getContext('2d'); const im = ctx.createImageData(16,16);
  for (let i = 0; i < 256; i++){ const v = 200 + Math.floor(hash2(i, 7, 3)*55); im.data[i*4] = im.data[i*4+1] = im.data[i*4+2] = v; im.data[i*4+3] = 255; }
  ctx.putImageData(im, 0, 0); return cv;
}

// ---------- 16x16 pixel icons ----------
const ICON_CACHE = new Map();
function hexRGB(h){ if (typeof h === 'number') return [(h>>16)&255, (h>>8)&255, h&255]; const v = parseInt(h.slice(1), 16); return [(v>>16)&255, (v>>8)&255, v&255]; }
function rgbS(c, f){ f = f || 1; return [clamp(Math.round(c[0]*f),0,255), clamp(Math.round(c[1]*f),0,255), clamp(Math.round(c[2]*f),0,255)]; }
function PixelCanvas(){
  const px = new Array(256).fill(null);
  const api = {
    px,
    set(x, y, c){ x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x > 15 || y > 15) return; px[y*16+x] = c; },
    line(x0, y0, x1, y1, c){ for (const [x,y] of linePts(x0,y0,x1,y1)) api.set(x,y,c); },
    rect(x0, y0, x1, y1, c){ for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) api.set(x,y,c); },
    disc(cx, cy, r, fn){ for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++){ const d = Math.hypot(x-cx, y-cy); if (d <= r) api.set(x, y, typeof fn === 'function' ? fn(x,y,d) : fn); } },
    outline(c){ const o = c || [26, 20, 16]; const add = []; for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++){ if (px[y*16+x]) continue; for (const [dx,dy] of DIRS4){ const nx = x+dx, ny = y+dy; if (nx>=0&&ny>=0&&nx<16&&ny<16&&px[ny*16+nx]&&!px[ny*16+nx].o){ add.push([x,y]); break; } } } for (const [x,y] of add) px[y*16+x] = Object.assign(o.slice(), { o: 1 }); },
    toCanvas(){ const cv = document.createElement('canvas'); cv.width = cv.height = 16; const ctx = cv.getContext('2d'); const im = ctx.createImageData(16,16); for (let i = 0; i < 256; i++){ const c = px[i]; if (!c) continue; im.data[i*4] = c[0]; im.data[i*4+1] = c[1]; im.data[i*4+2] = c[2]; im.data[i*4+3] = 255; } ctx.putImageData(im,0,0); return cv; }
  };
  return api;
}
const STEEL = [196, 204, 214], STEEL_D = [126, 134, 148], WOODC = [128, 86, 48], WOOD_D = [86, 56, 32], GOLDC = [232, 192, 72], GOLD_D = [168, 124, 40];
function drawWeaponIcon(p, shape, tier){
  const bl = STEEL, bd = STEEL_D;
  const len = { 1: 6, 2: 7, 3: 8, 4: 9, 5: 10 }[tier] || 8;
  switch (shape){
    case 'sword': case 'dagger': case 'scimitar': {
      const L2 = shape === 'dagger' ? 5 : len;
      for (let t = 0; t <= L2; t++){
        const curve = shape === 'scimitar' ? Math.round(Math.sin(t/L2*Math.PI)*1.2) : 0;
        p.set(5+t, 10-t - curve, bl); p.set(6+t, 10-t - curve, bd); p.set(5+t, 9-t - curve, [236,240,246]);
      }
      p.line(3, 9, 7, 13, shape === 'dagger' ? STEEL_D : GOLDC);
      p.line(3, 12, 2, 13, WOODC); p.set(4, 11, WOODC); p.set(1, 14, GOLD_D);
      break;
    }
    case 'axe': {
      p.line(2, 14, 11, 5, WOODC); p.line(3, 14, 12, 5, WOOD_D);
      p.disc(11, 5, tier >= 4 ? 4 : 3, (x,y) => (x + y < 16 + (tier>=4?1:0) && x - y > 2) ? (x+y < 14 ? [236,240,246] : bl) : null);
      p.rect(9, 2, 10, 4, bd); p.rect(12, 6, 14, 7, bl); p.set(13, 3, bl); p.set(14, 4, bl); p.set(13, 4, bl); p.set(12, 3, bl); p.set(14, 5, bl);
      break;
    }
    case 'mace': {
      p.line(2, 14, 9, 7, WOODC); p.line(3, 14, 10, 7, WOOD_D);
      p.disc(11, 5, 3, (x,y,d) => d < 1.5 ? [236,240,246] : bl);
      p.set(11, 1, bd); p.set(15, 5, bd); p.set(14, 2, bd); p.set(8, 2, bd); p.set(14, 8, bd);
      break;
    }
    case 'hammer': {
      p.line(2, 14, 10, 6, WOODC); p.line(3, 14, 11, 6, WOOD_D);
      for (let t = -3; t <= 3; t++){ p.set(10 + t, 5 - t, bl); p.set(11 + t, 5 - t, bl); p.set(12 + t, 6 - t, bd); }
      break;
    }
    case 'spear': {
      p.line(1, 15, 11, 5, WOODC);
      p.line(11, 5, 14, 2, bl); p.set(12, 3, bl); p.set(13, 4, bd); p.set(11, 3, [236,240,246]); p.set(14, 1, [236,240,246]);
      if (tier >= 5){ p.set(10, 3, bl); p.set(13, 6, bl); p.set(12, 2, bl); }
      break;
    }
    case 'staff': case 'staff2': {
      p.line(2, 15, 12, 5, WOODC); p.line(3, 15, 13, 5, WOOD_D);
      if (shape === 'staff'){ p.disc(12.5, 3.5, 2.2, (x,y,d) => d < 1 ? [240,220,255] : [170, 110, 240]); }
      else { p.rect(1, 14, 2, 15, STEEL_D); p.rect(12, 4, 13, 5, STEEL_D); }
      break;
    }
    case 'gloves': {
      const c = [140, 96, 56], cd = [100, 66, 36];
      p.rect(4, 5, 11, 12, c); p.rect(4, 3, 5, 5, c); p.rect(6, 2, 7, 5, c); p.rect(8, 2, 9, 5, c); p.rect(10, 3, 11, 5, c);
      p.rect(12, 7, 13, 10, c); p.rect(4, 12, 11, 13, cd);
      for (const [x,y] of [[5,6],[8,6],[11,6],[6,9],[9,9]]) p.set(x, y, STEEL);
      break;
    }
  }
}
function drawArmorIcon(p, t){
  const cols = { cloth:[176,156,120], leather:[136,92,56], mail:[150,156,166], scale:[110,130,150], plate:[200,208,220] };
  const c = cols[t], cd = rgbS(c, 0.72), cl = rgbS(c, 1.18);
  p.rect(3, 3, 12, 13, c);
  p.rect(1, 3, 3, 6, c); p.rect(12, 3, 14, 6, c);
  p.rect(6, 2, 9, 3, null); p.set(6,3,null); p.set(9,3,null); p.rect(7, 2, 8, 4, null);
  p.rect(3, 4, 12, 4, cl); p.rect(1, 3, 3, 3, cl); p.rect(12, 3, 14, 3, cl);
  p.rect(7, 5, 8, 13, cd);
  if (t === 'mail'){ for (let y = 6; y < 13; y += 2) for (let x = 4 + (y%4 === 0 ? 1 : 0); x < 12; x += 2) p.set(x, y, cd); }
  if (t === 'scale'){ for (let y = 6; y < 13; y += 2) for (let x = 4; x < 12; x += 2) { p.set(x, y, cl); p.set(x+1, y+1, cd); } }
  if (t === 'plate'){ p.rect(4, 7, 6, 8, cl); p.rect(9, 7, 11, 8, cl); p.set(5, 11, GOLDC); p.set(10, 11, GOLDC); }
  if (t === 'leather'){ p.rect(3, 10, 12, 10, [80, 50, 30]); p.set(7, 10, GOLDC); p.set(8,10,GOLDC); }
  if (t === 'cloth'){ p.rect(3, 13, 12, 13, cd); }
}
function itemIconKey(it){
  switch (it.k){
    case 'potion': return 'potion:' + G.looks.potion[it.t];
    case 'scroll': return 'scroll:' + G.looks.scroll[it.t];
    case 'ring': return 'ring:' + G.looks.ring[it.t];
    case 'weapon': return 'weapon:' + it.t;
    case 'armor': return 'armor:' + it.t;
    case 'wand': return 'wand:' + it.t + ':' + (G.looks.wand[it.t] || 0);
    default: return it.k + ':' + it.t;
  }
}
function iconCanvas(key){
  let cv = ICON_CACHE.get(key);
  if (cv) return cv;
  const p = PixelCanvas();
  const [k, t, extra] = key.split(':');
  switch (k){
    case 'weapon': drawWeaponIcon(p, WEAPONS[t].shape, WEAPONS[t].tier); break;
    case 'armor': drawArmorIcon(p, t); break;
    case 'potion': {
      const c = hexRGB(POTION_COLORS[t]);
      p.rect(7, 3, 8, 5, [200, 220, 230]); p.rect(6, 1, 9, 2, [150, 100, 60]);
      p.disc(7.5, 10, 4.6, (x,y,d) => y < 8 ? [190, 214, 226] : (d > 3.8 ? rgbS(c, 0.7) : c));
      p.set(5, 9, [255,255,255]); p.set(5, 10, [240, 250, 255]); p.set(6, 8, [230, 240, 250]);
      break;
    }
    case 'scroll': {
      const par = [226, 208, 166], pd = [176, 150, 106];
      p.rect(3, 4, 12, 12, par); p.rect(2, 3, 3, 13, pd); p.rect(12, 3, 13, 13, pd); p.rect(1, 4, 1, 12, [140, 110, 70]); p.rect(14, 4, 14, 12, [140, 110, 70]);
      const idx = SCROLL_RUNES.indexOf(t);
      const rc = [[160,40,40],[40,90,160],[60,130,60],[150,90,30],[110,50,140],[40,120,120]][idx % 6];
      const pat = idx;
      for (let i = 0; i < 9; i++){ if ((pat >> (i % 6)) & 1 || i === 4) p.set(5 + (i % 3)*2, 6 + Math.floor(i/3)*2, rc); }
      p.line(5, 6, 9, 10, rc);
      break;
    }
    case 'ring': {
      const g = hexRGB(RING_GEMS[t]);
      p.disc(7.5, 9.5, 4.5, (x,y,d) => d > 2.8 ? (y < 9 ? GOLDC : GOLD_D) : null);
      p.disc(7.5, 4.5, 2.2, (x,y,d) => d < 1 ? [255,255,255] : g);
      break;
    }
    case 'wand': {
      const tip = hexRGB(WANDS[t].color); const wood = hexRGB(WAND_WOOD[Number(extra) % WAND_WOOD.length]);
      p.line(2, 14, 11, 5, wood); p.line(3, 14, 12, 5, rgbS(wood, 0.7));
      p.disc(12.5, 3.5, 1.8, (x,y,d) => d < 0.9 ? [255,255,255] : tip);
      p.set(14, 1, tip); p.set(10, 2, tip);
      break;
    }
    case 'missile': {
      if (t === 'stone'){ p.disc(7.5, 9, 4, (x,y,d) => d < 2 && x < 8 ? [190,186,176] : [140,136,128]); }
      else if (t === 'knife'){ p.line(4, 12, 11, 5, STEEL); p.line(5, 12, 12, 5, STEEL_D); p.line(2, 14, 4, 12, [60,60,70]); p.set(13, 4, STEEL); }
      else if (t === 'dart'){ p.line(3, 12, 12, 3, [150,150,160]); p.set(13, 2, STEEL); p.rect(2, 12, 3, 14, [200, 60, 60]); p.set(4,13,[200,60,60]); }
      else if (t === 'shuriken'){ p.disc(7.5, 7.5, 1.8, STEEL_D); for (const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]) for (let k = 2; k <= 6; k++) p.set(7.5 + dx*k + (k<4?dy:0), 7.5 + dy*k - (k<4?dx:0), k > 4 ? [236,240,246] : STEEL); }
      else if (t === 'tomahawk'){ p.line(3, 13, 10, 6, WOODC); p.disc(11, 5, 2.6, (x,y) => x + y < 17 && x > y + 2 ? STEEL : null); p.rect(10, 3, 11, 4, STEEL); p.rect(12, 6, 13, 7, STEEL); }
      else if (t === 'javelin'){ p.line(1, 14, 12, 3, WOODC); p.line(12, 3, 14, 1, STEEL); p.set(13, 3, STEEL); p.set(12, 2, STEEL); }
      break;
    }
    case 'food': {
      if (t === 'ration' || t === 'small'){ const s = t === 'small'; p.rect(s?4:2, s?6:5, s?11:13, s?11:12, [180, 140, 90]); p.rect(s?4:2, s?6:5, s?11:13, s?6:5, [210, 175, 120]); p.line(s?7:7, s?6:5, s?7:7, s?11:12, [120, 80, 50]); p.line(s?4:2, 8, s?11:13, 8, [120, 80, 50]); }
      else if (t === 'pasty'){ p.disc(7.5, 10, 6, (x,y,d) => y >= 8 ? (d > 5 ? [200, 140, 60] : [232, 180, 90]) : null); for (let x = 3; x < 13; x += 2) p.set(x, 9, [250, 210, 130]); }
      else { p.disc(8, 8, 4.2, (x,y,d) => d < 2 ? [220, 90, 90] : [170, 50, 50]); p.rect(11, 11, 14, 12, [230, 222, 200]); p.set(14, 10, [230,222,200]); p.set(14,13,[230,222,200]); }
      break;
    }
    case 'gold': { for (const [x,y] of [[4,11],[8,11],[11,11],[6,9],[10,9],[8,7]]) p.disc(x, y, 1.8, (xx,yy,d) => d < 0.9 ? [255, 236, 140] : GOLDC); break; }
    case 'key': { p.disc(4.5, 5.5, 3, (x,y,d) => d > 1.5 ? [150,150,160] : null); p.line(6, 7, 13, 14, [150,150,160]); p.set(11,13,[150,150,160]); p.set(12,12,[150,150,160]); p.set(10,14,[150,150,160]); break; }
    case 'amulet': { p.disc(7.5, 6, 6, (x,y,d) => d > 5 && y < 9 ? GOLD_D : null); p.disc(7.5, 10.5, 3.6, (x,y,d) => d < 1.6 ? [255, 120, 120] : (d < 2.6 ? [200, 30, 40] : GOLDC)); break; }
    case 'bow': { for (let y = 1; y <= 14; y++){ const x = 4 + Math.round(Math.sin((y-1)/13*Math.PI)*-3) + 3; p.set(x, y, WOODC); p.set(x+1, y, WOOD_D); } p.line(5, 1, 5, 14, [230, 230, 220]); p.rect(4, 7, 6, 8, [80, 160, 100]); break; }
    case 'cloak': { const c = [60, 66, 86], cd = [38, 42, 58]; p.rect(5, 2, 10, 4, c); p.rect(4, 4, 11, 14, c); p.rect(3, 9, 12, 14, cd); p.rect(7, 5, 8, 14, cd); p.set(7, 3, GOLDC); p.set(8,3,GOLDC); break; }
    case 'dew': { p.disc(7.5, 9.5, 3.5, [120, 200, 255]); p.set(7, 4, [120,200,255]); p.set(8,4,[120,200,255]); p.rect(7, 5, 8, 6, [120,200,255]); p.set(6, 8, [255,255,255]); break; }
    case 'arrow': { p.line(2, 13, 13, 2, [230, 240, 255]); p.set(14, 1, [180, 255, 220]); p.rect(1, 13, 2, 14, [140, 230, 200]); break; }
    case 'bomb': { p.disc(7.5, 9, 4.5, (x,y,d) => d < 1.5 && x < 8 && y < 9 ? [100,100,110] : [40, 40, 48]); p.line(9, 4, 11, 2, [200, 160, 100]); p.set(12, 1, [255, 200, 60]); break; }
    case 'shuriken': return iconCanvas('missile:shuriken');
    case 'ui': {
      if (t === 'search'){ p.disc(6.5, 6.5, 4, (x,y,d) => d > 2.8 ? [200, 190, 160] : (d < 1.2 && x < 7 ? [220, 240, 255] : [120, 160, 200])); p.line(9, 9, 13, 13, [140, 100, 60]); p.line(10, 9, 14, 13, [100, 70, 40]); }
      else if (t === 'rest'){ p.line(3, 3, 11, 3, [220, 210, 180]); p.line(11, 3, 3, 11, [220, 210, 180]); p.line(3, 11, 11, 11, [220, 210, 180]); p.line(9, 8, 13, 8, [160, 160, 200]); p.line(13, 8, 9, 12, [160, 160, 200]); p.line(9, 12, 13, 12, [160,160,200]); }
      else if (t === 'bag'){ p.rect(3, 5, 12, 14, [150, 104, 60]); p.rect(4, 3, 11, 5, [120, 80, 44]); p.rect(6, 1, 9, 3, [100, 66, 36]); p.rect(5, 8, 10, 11, [120, 80, 44]); p.set(7, 9, GOLDC); p.set(8, 9, GOLDC); p.rect(3, 5, 12, 5, [180, 130, 80]); }
      break;
    }
    case 'hero': drawPortrait(p, t); break;
  }
  p.outline();
  cv = p.toCanvas();
  ICON_CACHE.set(key, cv);
  return cv;
}
function drawPortrait(p, cls){
  const skin = [230, 186, 150], skinD = [190, 140, 110];
  p.rect(4, 4, 11, 12, skin); p.rect(4, 11, 11, 12, skinD);
  p.set(6, 8, [30, 24, 20]); p.set(9, 8, [30, 24, 20]); p.set(6, 7, [255,255,255]); p.set(9,7,[255,255,255]);
  p.rect(7, 11, 8, 11, [150, 80, 70]);
  if (cls === 'warrior'){ p.rect(3, 1, 12, 5, [150, 156, 168]); p.rect(3, 5, 4, 9, [150,156,168]); p.rect(11, 5, 12, 9, [150,156,168]); p.rect(7, 1, 8, 6, [190, 60, 50]); p.rect(3, 13, 12, 15, [180, 56, 46]); }
  else if (cls === 'mage'){ p.rect(3, 3, 12, 4, [96, 70, 190]); p.rect(5, 1, 10, 2, [96,70,190]); p.rect(7, 0, 8, 0, [96,70,190]); p.rect(3, 13, 12, 15, [96, 70, 190]); p.rect(5, 12, 10, 14, [220, 220, 230]); p.set(7, 2, GOLDC); }
  else if (cls === 'rogue'){ p.rect(3, 2, 12, 5, [56, 62, 80]); p.rect(3, 5, 3, 12, [56,62,80]); p.rect(12, 5, 12, 12, [56,62,80]); p.rect(4, 9, 11, 12, [40, 44, 58]); p.rect(3, 13, 12, 15, [56, 62, 80]); }
  else { p.rect(3, 2, 12, 5, [70, 140, 80]); p.rect(3, 5, 3, 10, [70,140,80]); p.rect(12, 5, 12, 10, [70,140,80]); p.rect(2, 1, 3, 3, [70, 140, 80]); p.rect(12, 1, 13, 3, [70,140,80]); p.rect(3, 13, 12, 15, [90, 120, 60]); p.rect(4, 5, 11, 6, [210, 150, 70]); }
}
function iconURL(key){ const cv = iconCanvas(key); if (!cv._url) cv._url = cv.toDataURL(); return cv._url; }
function drawIconTo(canvas, key){ const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.clearRect(0,0,canvas.width,canvas.height); if (key) ctx.drawImage(iconCanvas(key), 0, 0, canvas.width, canvas.height); }
// ============================================================
// 3D MODELS (characters, voxel items)
// ============================================================
const MDL = (() => {
  const geoCache = new Map(), matCache = new Map();
  let grainTex = null;
  function box(w, h, d){ const k = w+'|'+h+'|'+d; let g = geoCache.get(k); if (!g){ g = new THREE.BoxGeometry(w, h, d); geoCache.set(k, g); } return g; }
  function mat(color, opts){
    opts = opts || {};
    const k = color + '|' + (opts.em || 0) + '|' + (opts.rough || 0.8) + '|' + (opts.metal || 0) + '|' + (opts.op || 1);
    let m = matCache.get(k);
    if (!m){
      if (!grainTex){ grainTex = new THREE.CanvasTexture(makeGrainTex()); grainTex.magFilter = THREE.NearestFilter; grainTex.minFilter = THREE.NearestFilter; grainTex.encoding = THREE.sRGBEncoding; }
      const lc = new THREE.Color(color).convertSRGBToLinear();
      m = (opts.metal && opts.metal > 0.3) ? new THREE.MeshStandardMaterial({ color: lc, roughness: Math.max(0.55, opts.rough || 0.6), metalness: Math.min(0.5, opts.metal), map: grainTex, flatShading: true })
        : new THREE.MeshLambertMaterial({ color: lc, map: opts.em ? null : grainTex });
      if (opts.em){ m.emissive = new THREE.Color(opts.em).convertSRGBToLinear(); m.emissiveIntensity = opts.ei || 1.2; }
      if (opts.op && opts.op < 1){ m.transparent = true; m.opacity = opts.op; m.depthWrite = false; }
      matCache.set(k, m);
    }
    return m;
  }
  function mesh(g, m, x, y, z){ const o = new THREE.Mesh(g, m); o.position.set(x||0, y||0, z||0); return o; }
  function pivot(x, y, z){ const g = new THREE.Group(); g.position.set(x, y, z); return g; }
  function eyes(parent, y, z, sep, color, size){ const s = size || 0.045; const m = mat(0x000000, { em: color, ei: 1.6 }); parent.add(mesh(box(s, s, 0.02), m, -sep, y, z)); parent.add(mesh(box(s, s, 0.02), m, sep, y, z)); }
  const darker = (c, f) => { const col = new THREE.Color(c); col.multiplyScalar(f); return col.getHex(); };

  // ---------- voxel geometry from 16x16 icon ----------
  const voxCache = new Map();
  function voxelGeometry(key){
    let g = voxCache.get(key); if (g) return g;
    const cv = iconCanvas(key);
    const data = cv.getContext('2d').getImageData(0, 0, 16, 16).data;
    const solid = (x, y) => x >= 0 && y >= 0 && x < 16 && y < 16 && data[(y*16+x)*4+3] > 0;
    const pos = [], nrm = [], col = [];
    const face = (verts, n, c, f) => { const [a,b,cc,d] = verts; for (const v of [a,b,cc,a,cc,d]){ pos.push(v[0], v[1], v[2]); nrm.push(n[0], n[1], n[2]); col.push(c[0]*f, c[1]*f, c[2]*f); } };
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++){
      if (!solid(x, y)) continue;
      const i = (y*16+x)*4;
      const c = [Math.pow(data[i]/255, 2.2), Math.pow(data[i+1]/255, 2.2), Math.pow(data[i+2]/255, 2.2)];
      const x0 = x - 8, x1 = x - 7, y0 = 8 - (y+1), y1 = 8 - y, z0 = -0.5, z1 = 0.5;
      face([[x0,y1,z1],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1]], [0,0,1], c, 1);
      face([[x1,y1,z0],[x1,y0,z0],[x0,y0,z0],[x0,y1,z0]], [0,0,-1], c, 0.75);
      if (!solid(x, y-1)) face([[x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[x1,y1,z0]], [0,1,0], c, 1.1);
      if (!solid(x, y+1)) face([[x0,y0,z1],[x0,y0,z0],[x1,y0,z0],[x1,y0,z1]], [0,-1,0], c, 0.6);
      if (!solid(x-1, y)) face([[x0,y1,z0],[x0,y0,z0],[x0,y0,z1],[x0,y1,z1]], [-1,0,0], c, 0.8);
      if (!solid(x+1, y)) face([[x1,y1,z1],[x1,y0,z1],[x1,y0,z0],[x1,y1,z0]], [1,0,0], c, 0.85);
    }
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    voxCache.set(key, g);
    return g;
  }
  let voxMat = null;
  function voxelMat(){ if (!voxMat) voxMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05 }); return voxMat; }
  function heldItem(key, scale){ const m = new THREE.Mesh(voxelGeometry(key), voxelMat()); m.scale.setScalar(scale || 0.03); return m; }

  // ---------- humanoid ----------
  function humanoid(s){
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const parts = { body };
    const cMain = s.c, cLeg = s.c2 != null ? s.c2 : darker(s.c, 0.7), cHead = s.head != null ? s.head : 0xd8b08c;
    const legM = mat(cLeg), torM = mat(cMain), headM = mat(cHead), armM = mat(s.arm != null ? s.arm : cMain);
    const robe = !!s.robe;
    if (robe){
      body.add(mesh(box(0.3, 0.27, 0.22), legM, 0, 0.135, 0));
      parts.legL = pivot(-0.07, 0.26, 0); parts.legR = pivot(0.07, 0.26, 0);
    } else {
      parts.legL = pivot(-0.075, 0.26, 0); parts.legR = pivot(0.075, 0.26, 0);
      parts.legL.add(mesh(box(s.bony ? 0.06 : 0.1, 0.26, s.bony ? 0.06 : 0.11), legM, 0, -0.13, 0));
      parts.legR.add(mesh(box(s.bony ? 0.06 : 0.1, 0.26, s.bony ? 0.06 : 0.11), legM, 0, -0.13, 0));
      body.add(parts.legL, parts.legR);
    }
    const torso = pivot(0, 0.26, 0); body.add(torso); parts.torso = torso;
    if (s.hunched) torso.rotation.x = 0.35;
    torso.add(mesh(box(s.bony ? 0.2 : 0.28, 0.27, s.bony ? 0.12 : 0.17), torM, 0, 0.135, 0));
    if (s.bony){ for (let i = 0; i < 3; i++) torso.add(mesh(box(0.26, 0.025, 0.14), mat(0xf0ead8), 0, 0.06 + i*0.07, 0)); }
    if (s.belt) torso.add(mesh(box(0.29, 0.04, 0.18), mat(s.belt), 0, 0.03, 0));
    if (s.cape){ const cape = mesh(box(0.3, 0.42, 0.03), mat(s.cape), 0, 0.06, -0.11); torso.add(cape); parts.cape = cape; }
    if (s.wings){ const wm = mat(s.wings); const wl = pivot(-0.08, 0.2, -0.1), wr = pivot(0.08, 0.2, -0.1); wl.add(mesh(box(0.34, 0.26, 0.02), wm, -0.17, 0.05, 0)); wr.add(mesh(box(0.34, 0.26, 0.02), wm, 0.17, 0.05, 0)); wl.rotation.y = 0.5; wr.rotation.y = -0.5; torso.add(wl, wr); parts.wingL = wl; parts.wingR = wr; }
    // arms
    parts.armL = pivot(-0.185, 0.245, 0); parts.armR = pivot(0.185, 0.245, 0);
    parts.armL.add(mesh(box(0.08, 0.24, 0.09), armM, 0, -0.11, 0));
    parts.armR.add(mesh(box(0.08, 0.24, 0.09), armM, 0, -0.11, 0));
    const handM = s.gloves != null ? mat(s.gloves) : headM;
    parts.armL.add(mesh(box(s.gloves != null ? 0.09 : 0.07, 0.07, s.gloves != null ? 0.1 : 0.08), handM, 0, -0.24, 0));
    parts.armR.add(mesh(box(s.gloves != null ? 0.09 : 0.07, 0.07, s.gloves != null ? 0.1 : 0.08), handM, 0, -0.24, 0));
    torso.add(parts.armL, parts.armR);
    parts.handR = pivot(0, -0.25, 0.03); parts.armR.add(parts.handR);
    parts.handL = pivot(0, -0.25, 0.03); parts.armL.add(parts.handL);
    // head
    const head = pivot(0, 0.27, 0); torso.add(head); parts.head = head;
    const hs = s.bony ? 0.2 : 0.23;
    head.add(mesh(box(hs, 0.21, hs), headM, 0, 0.105, 0));
    const eyeC = s.eye != null ? s.eye : (s.bony ? 0xff3a2a : 0x1a1410);
    if (s.eye != null || s.bony) eyes(head, 0.11, hs/2 + 0.005, 0.05, eyeC, 0.05);
    else { const em = mat(0x14100c, { rough: 0.4 }); head.add(mesh(box(0.04, 0.05, 0.02), em, -0.05, 0.11, hs/2+0.005)); head.add(mesh(box(0.04, 0.05, 0.02), em, 0.05, 0.11, hs/2+0.005)); }
    if (s.snout) head.add(mesh(box(0.1, 0.08, 0.1), mat(darker(cHead, 0.85)), 0, 0.06, hs/2 + 0.05));
    if (s.ears){ head.add(mesh(box(0.05, 0.09, 0.03), mat(darker(cHead, 0.8)), -0.08, 0.25, 0)); head.add(mesh(box(0.05, 0.09, 0.03), mat(darker(cHead,0.8)), 0.08, 0.25, 0)); }
    if (s.hood != null){ const hm = mat(s.hood); head.add(mesh(box(hs+0.05, 0.08, hs+0.05), hm, 0, 0.235, -0.01)); head.add(mesh(box(0.035, 0.2, hs+0.04), hm, -hs/2-0.02, 0.1, -0.01)); head.add(mesh(box(0.035, 0.2, hs+0.04), hm, hs/2+0.02, 0.1, -0.01)); head.add(mesh(box(hs+0.05, 0.22, 0.04), hm, 0, 0.1, -hs/2-0.02)); }
    if (s.helm != null){ const hm = mat(s.helm, { metal: 0.6, rough: 0.4 }); head.add(mesh(box(hs+0.04, 0.1, hs+0.04), hm, 0, 0.2, 0)); head.add(mesh(box(0.03, 0.16, hs+0.04), hm, -hs/2-0.015, 0.12, 0)); head.add(mesh(box(0.03, 0.16, hs+0.04), hm, hs/2+0.015, 0.12, 0)); head.add(mesh(box(hs+0.04, 0.17, 0.03), hm, 0, 0.12, -hs/2-0.015)); if (s.plume) head.add(mesh(box(0.04, 0.08, 0.16), mat(s.plume), 0, 0.29, -0.02)); }
    if (s.hair != null){ const hm2 = mat(s.hair); head.add(mesh(box(hs+0.02, 0.16, 0.04), hm2, 0, 0.12, -hs/2-0.01)); head.add(mesh(box(hs+0.02, 0.05, hs+0.02), hm2, 0, 0.2, 0)); }
    if (s.beard != null) head.add(mesh(box(0.2, 0.1, 0.05), mat(s.beard), 0, 0.02, hs/2 + 0.02));
    if (s.hat != null){ const cone = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.3, 4), mat(s.hat)); cone.rotation.y = Math.PI/4; cone.position.y = 0.36; head.add(cone); head.add(mesh(box(0.32, 0.03, 0.32), mat(s.hat), 0, 0.22, 0)); }
    if (s.crown){ const gm = mat(0xe0b040, { metal: 0.8, rough: 0.3, em: 0x402a00, ei: 0.4 }); head.add(mesh(box(0.25, 0.05, 0.25), gm, 0, 0.23, 0)); for (const [x,z] of [[-0.1,-0.1],[0.1,-0.1],[-0.1,0.1],[0.1,0.1],[0,0.12]]) head.add(mesh(box(0.04, 0.07, 0.04), gm, x, 0.28, z)); }
    if (s.horns != null){ const hm = mat(s.horns); const h1 = mesh(box(0.04, 0.14, 0.04), hm, -0.08, 0.27, 0); h1.rotation.z = 0.4; const h2 = mesh(box(0.04, 0.14, 0.04), hm, 0.08, 0.27, 0); h2.rotation.z = -0.4; head.add(h1, h2); }
    if (s.visor != null) head.add(mesh(box(hs*0.75, 0.035, 0.02), mat(0x000000, { em: s.visor, ei: 2.2 }), 0, 0.12, hs/2 + 0.008));
    if (s.collar != null) torso.add(mesh(box(0.32, 0.06, 0.21), mat(s.collar, { metal: 0.6, rough: 0.4 }), 0, 0.27, 0));
    if (s.halo != null){ const hm = mat(0x000000, { em: s.halo, ei: 1.6 }); for (let i = 0; i < 6; i++){ const a = i / 6 * Math.PI * 2; const sp = mesh(box(0.025, 0.12, 0.025), hm, Math.cos(a) * 0.17, 0.36, Math.sin(a) * 0.17); sp.rotation.z = Math.cos(a) * 0.25; sp.rotation.x = -Math.sin(a) * 0.25; head.add(sp); } parts.halo = head; }
    if (s.core != null) torso.add(mesh(box(0.08, 0.08, 0.02), mat(0x000000, { em: s.core, ei: 2.2 }), 0, 0.17, 0.09));
    if (s.mask){ head.add(mesh(box(hs+0.01, 0.15, 0.02), mat(0xd04040), 0, 0.11, hs/2+0.006)); eyes(head, 0.13, hs/2 + 0.02, 0.05, 0xffffff, 0.04); head.add(mesh(box(0.05, 0.05, 0.08), mat(0xd04040), 0, 0.08, hs/2+0.04)); }
    if (s.shield){ const sh = mesh(box(0.04, 0.22, 0.2), mat(s.shield, { metal: 0.5, rough: 0.5 }), -0.03, -0.14, 0.04); parts.armL.add(sh); sh.add(mesh(box(0.01, 0.06, 0.06), mat(0xe0b040, { metal:0.8, rough:0.3 }), -0.025, 0, 0)); }
    if (s.weapon){
      const key = s.weaponKey || ('weapon:' + ({ spear:'spear', sword:'sword', dagger:'dagger', mace:'mace', axe:'battleaxe', staff:'staff' }[s.weapon] || 'sword'));
      const sc = 0.032; const w = heldItem(key, sc); w.position.set(5.5*sc, 5.5*sc, 0);
      const grip = new THREE.Group(); grip.add(w); grip.rotation.order = 'YXZ'; grip.rotation.set(-Math.PI/2, -Math.PI/2, -Math.PI/4);
      const tilt = new THREE.Group(); tilt.add(grip); tilt.rotation.x = -0.5; tilt.position.set(0, 0, 0.02);
      parts.handR.add(tilt); parts.weapon = tilt;
      if (s.dual){ const t2 = tilt.clone(); t2.scale.x = -1; parts.handL.add(t2); }
    }
    if (s.bowBack){ const b = heldItem('bow:bow', 0.03); b.position.set(0, 0.14, -0.12); b.rotation.z = 0.3; torso.add(b); }
    if (s.glow){ const orb = mesh(new THREE.SphereGeometry(0.045, 8, 6), mat(0x000000, { em: s.glow, ei: 2 }), 0, 0.02, 0.18); parts.handR.add(orb); }
    root.scale.setScalar(s.scale || 1);
    return { root, parts, h: 0.75 * (s.scale || 1), kind: 'humanoid' };
  }
  function heroSpec(cls, armorT){
    const armorCol = { cloth: null, leather: 0x8a5a34, mail: 0x8a909c, scale: 0x6a8296, plate: 0xc8d0dc }[armorT || 'cloth'];
    const s = { head: 0xe6b896, scale: 1 };
    if (cls === 'warrior'){ Object.assign(s, { c: 0xb03a2e, c2: 0x5a3a2a, helm: 0x9aa2b0, plume: 0xc04030, shield: 0x8a6a40, belt: 0x4a3020 }); }
    else if (cls === 'mage'){ Object.assign(s, { c: 0x5a44b8, c2: 0x4a3698, hat: 0x4a3698, robe: true, belt: 0xd0b050, arm: 0x5a44b8, hair: 0x6a4a30 }); }
    else if (cls === 'rogue'){ Object.assign(s, { c: 0x3a4050, c2: 0x2a2e3a, hood: 0x2e3442, cape: 0x262a36, belt: 0x5a4030 }); }
    else { Object.assign(s, { c: 0x4a8a48, c2: 0x5a4a30, hood: 0x3e7a42, cape: 0x3a6a3a, belt: 0x6a4a2a, bowBack: true }); }
    if (armorCol){ s.c = armorCol; if (cls === 'mage') s.arm = 0x5a44b8; }
    return s;
  }
  function hero(cls, armorT, weaponKey){
    const s = heroSpec(cls, armorT);
    if (weaponKey && weaponKey !== 'weapon:gloves'){ s.weapon = 'custom'; s.weaponKey = weaponKey; }
    if (weaponKey === 'weapon:gloves') s.gloves = 0x8c6038;
    const m = humanoid(s);
    m.kind = 'hero';
    return m;
  }
  // ---------- creatures ----------
  function rat(s){
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const m = mat(s.c), m2 = mat(s.c2), dk = mat(darker(s.c, 0.7));
    body.add(mesh(box(0.22, 0.17, 0.34), m, 0, 0.17, 0));
    const head = pivot(0, 0.19, 0.18); body.add(head);
    head.add(mesh(box(0.16, 0.14, 0.14), m, 0, 0, 0.04)); head.add(mesh(box(0.07, 0.06, 0.08), m2, 0, -0.02, 0.14));
    head.add(mesh(box(0.06, 0.07, 0.02), m2, -0.07, 0.09, 0)); head.add(mesh(box(0.06, 0.07, 0.02), m2, 0.07, 0.09, 0));
    eyes(head, 0.03, 0.115, 0.045, 0xff3030, 0.03);
    const tail = pivot(0, 0.15, -0.17); body.add(tail); tail.add(mesh(box(0.035, 0.035, 0.3), m2, 0, 0, -0.15)); tail.rotation.x = -0.3;
    const legs = [];
    for (const [x,z] of [[-0.09,0.1],[0.09,0.1],[-0.09,-0.1],[0.09,-0.1]]){ const p = pivot(x, 0.1, z); p.add(mesh(box(0.05, 0.1, 0.05), dk, 0, -0.05, 0)); body.add(p); legs.push(p); }
    root.scale.setScalar(s.scale || 1);
    return { root, parts: { body, head, tail, legs }, h: 0.35, kind: 'quad' };
  }
  function quad(s){ // ripper demon
    const r = rat({ c: s.c, c2: s.c2, scale: (s.scale||1)*1.3 });
    const hm = mat(0x1a0808);
    const h1 = mesh(box(0.03, 0.12, 0.03), hm, -0.06, 0.12, 0); h1.rotation.z = 0.4; const h2 = mesh(box(0.03, 0.12, 0.03), hm, 0.06, 0.12, 0); h2.rotation.z = -0.4;
    r.parts.head.add(h1, h2);
    for (let i = 0; i < 4; i++) r.parts.body.add(mesh(box(0.04, 0.08, 0.04), mat(s.c2, { em: s.c2, ei: 0.6 }), 0, 0.28, 0.1 - i*0.08));
    return r;
  }
  function snake(s){
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const m = mat(s.c), m2 = mat(s.c2);
    const segs = [];
    for (let i = 0; i < 6; i++){ const sz = 0.12 - i*0.012; const seg = mesh(box(sz, sz*0.8, 0.12), i % 2 ? m2 : m, 0, sz*0.4, 0.2 - i*0.1); body.add(seg); segs.push(seg); }
    const head = pivot(0, 0.12, 0.28); body.add(head);
    head.add(mesh(box(0.14, 0.09, 0.15), m, 0, 0, 0)); eyes(head, 0.02, 0.076, 0.045, 0xffe040, 0.03);
    head.add(mesh(box(0.02, 0.01, 0.06), mat(0xd03030), 0, -0.03, 0.1));
    return { root, parts: { body, head, segs }, h: 0.3, kind: 'snake' };
  }
  function crab(s){
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const m = mat(s.c), m2 = mat(s.c2);
    body.add(mesh(box(0.38, 0.14, 0.28), m, 0, 0.16, 0)); body.add(mesh(box(0.3, 0.06, 0.22), m2, 0, 0.25, 0));
    eyes(body, 0.3, 0.12, 0.07, 0x101010, 0.04); body.add(mesh(box(0.02, 0.08, 0.02), m, -0.07, 0.26, 0.12)); body.add(mesh(box(0.02, 0.08, 0.02), m, 0.07, 0.26, 0.12));
    const clawL = pivot(-0.2, 0.18, 0.12), clawR = pivot(0.2, 0.18, 0.12);
    clawL.add(mesh(box(0.1, 0.1, 0.16), m2, -0.04, 0, 0.08)); clawR.add(mesh(box(0.1, 0.1, 0.16), m2, 0.04, 0, 0.08));
    body.add(clawL, clawR);
    const legs = [];
    for (let i = 0; i < 3; i++) for (const sd of [-1, 1]){ const p = pivot(sd*0.19, 0.14, 0.06 - i*0.09); const l = mesh(box(0.14, 0.03, 0.03), m, sd*0.07, -0.05, 0); l.rotation.z = sd*-0.6; p.add(l); body.add(p); legs.push(p); }
    root.scale.setScalar(s.scale || 1);
    return { root, parts: { body, armL: clawL, armR: clawR, legs }, h: 0.3, kind: 'crab' };
  }
  function swarm(s){
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const m = mat(s.c), em = mat(0x000000, { em: s.c2, ei: 1 });
    const flies = [];
    for (let i = 0; i < 14; i++){ const f = mesh(box(0.045, 0.035, 0.05), i % 4 === 0 ? em : m, 0, 0, 0); f.userData.ph = Math.random()*6.28; f.userData.r = 0.08 + Math.random()*0.18; f.userData.y = 0.25 + Math.random()*0.3; f.userData.sp = 2 + Math.random()*3; body.add(f); flies.push(f); }
    return { root, parts: { body, flies }, h: 0.6, kind: 'swarm', flying: true };
  }
  function blob(s){
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    if (s.mound){ // boss: a low, glossy sludge mound with ember pustules and a glowing maw
      const m = mat(s.c, { em: 0x16260c, ei: 1 }), glow = mat(0x000000, { em: s.c2, ei: 2.2 });
      const b = mesh(new THREE.IcosahedronGeometry(0.34, 2), m, 0, 0.1, 0); b.scale.set(1.25, 0.8, 1.1); body.add(b);
      for (let i = 0; i < 7; i++){ const a = i / 7 * Math.PI * 2 + 0.3, r = 0.3 + (i % 2) * 0.05;
        const l = mesh(new THREE.IcosahedronGeometry(0.07 + (i % 3) * 0.02, 1), m, Math.cos(a) * r * 1.2, 0.04, Math.sin(a) * r); l.scale.y = 0.6; body.add(l); }
      for (const [x, z, r] of [[-0.12, -0.04, 0.06], [0.14, -0.08, 0.05], [0.02, -0.18, 0.045], [-0.2, 0.08, 0.045], [0.18, 0.1, 0.05], [0.0, 0.12, 0.055]]) body.add(mesh(new THREE.IcosahedronGeometry(r, 1), glow, x, 0.1 + 0.272*Math.sqrt(Math.max(0, 1 - (x/0.425)**2 - (z/0.374)**2)) + r*0.3, z)); // sit on the dome surface
      body.add(mesh(box(0.26, 0.035, 0.02), glow, 0, 0.16, 0.36));
      root.scale.setScalar(s.scale || 1);
      return { root, parts: { body, blob: b }, h: 0.35 * (s.scale||1), kind: 'blob' };
    }
    const g = new THREE.IcosahedronGeometry(0.24, 1);
    const m = mat(s.c, { rough: 0.3, op: s.glowEye ? 1 : 0.88 });
    const b = mesh(g, m, 0, 0.2, 0); b.scale.set(1, 0.8, 1); body.add(b);
    body.add(mesh(new THREE.IcosahedronGeometry(0.12, 0), mat(s.c2, { em: s.c2, ei: s.glowEye ? 0.8 : 0.3 }), 0, 0.18, 0));
    eyes(body, 0.28, 0.21, 0.07, s.glowEye ? 0xff3020 : 0x101010, 0.06);
    root.scale.setScalar(s.scale || 1);
    return { root, parts: { body, blob: b }, h: 0.45 * (s.scale||1), kind: 'blob' };
  }
  function robot(s){
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const m = mat(s.c, { metal: 0.6, rough: 0.45 }), dk = mat(darker(s.c, 0.6), { metal: 0.5, rough: 0.5 });
    body.add(mesh(box(0.34, 0.08, 0.3), dk, 0, 0.04, 0));
    body.add(mesh(box(0.08, 0.1, 0.32), dk, -0.15, 0.08, 0)); body.add(mesh(box(0.08, 0.1, 0.32), dk, 0.15, 0.08, 0));
    const torso = pivot(0, 0.12, 0); body.add(torso);
    torso.add(mesh(box(0.32, 0.3, 0.26), m, 0, 0.15, 0));
    torso.add(mesh(box(0.2, 0.06, 0.02), mat(0x000000, { em: s.c2, ei: 1.5 }), 0, 0.22, 0.135));
    torso.add(mesh(box(0.06, 0.06, 0.06), dk, 0, 0.34, 0)); torso.add(mesh(box(0.02, 0.12, 0.02), dk, 0.08, 0.38, -0.05));
    const armL = pivot(-0.2, 0.24, 0), armR = pivot(0.2, 0.24, 0);
    armL.add(mesh(box(0.08, 0.22, 0.08), dk, 0, -0.1, 0.02)); armR.add(mesh(box(0.08, 0.22, 0.08), dk, 0, -0.1, 0.02));
    armL.add(mesh(box(0.1, 0.06, 0.12), m, 0, -0.22, 0.05)); armR.add(mesh(box(0.1, 0.06, 0.12), m, 0, -0.22, 0.05));
    torso.add(armL, armR);
    if (s.excavator){ // boss: tracked excavator with a drill arm, furnace grille and twin exhaust stacks
      const tr = mat(0x2a2622, { metal: 0.4, rough: 0.7 }), glow = mat(0x000000, { em: s.c2, ei: 1.8 });
      for (const x of [-0.2, 0.2]){ body.add(mesh(box(0.1, 0.1, 0.42), tr, x, 0.05, 0)); for (let k = -2; k <= 2; k++) body.add(mesh(box(0.11, 0.02, 0.03), dk, x, 0.1, k*0.08)); }
      for (let k = 0; k < 3; k++) torso.add(mesh(box(0.05, 0.12, 0.02), glow, -0.08 + k*0.08, 0.1, 0.135));
      for (const x of [-0.1, 0.1]){ torso.add(mesh(box(0.05, 0.16, 0.05), dk, x, 0.38, -0.09)); torso.add(mesh(box(0.06, 0.02, 0.06), glow, x, 0.465, -0.09)); }
      const drill = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 6), mat(0x9a9aa0, { metal: 0.6, rough: 0.4 })); drill.rotation.x = Math.PI/2; drill.position.set(0, -0.24, 0.16); armR.add(drill);
      armL.add(mesh(box(0.14, 0.05, 0.14), m, 0, -0.26, 0.08));
    }
    root.scale.setScalar(s.scale || 1);
    return { root, parts: { body, torso, armL, armR }, h: 0.5 * (s.scale||1), kind: 'robot' };
  }
  function bat(s){
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const m = mat(s.c), wm = mat(darker(s.c, 0.8));
    body.add(mesh(box(0.14, 0.16, 0.12), m, 0, 0, 0));
    const head = pivot(0, 0.1, 0.02); body.add(head); head.add(mesh(box(0.12, 0.1, 0.1), m, 0, 0.03, 0)); eyes(head, 0.04, 0.052, 0.03, s.c2, 0.03);
    head.add(mesh(box(0.03, 0.06, 0.02), m, -0.04, 0.1, 0)); head.add(mesh(box(0.03, 0.06, 0.02), m, 0.04, 0.1, 0));
    const wingL = pivot(-0.07, 0.03, 0), wingR = pivot(0.07, 0.03, 0);
    wingL.add(mesh(box(0.3, 0.02, 0.18), wm, -0.15, 0, 0)); wingR.add(mesh(box(0.3, 0.02, 0.18), wm, 0.15, 0, 0));
    body.add(wingL, wingR); body.position.y = 0.45;
    return { root, parts: { body, head, wingL, wingR }, h: 0.6, kind: 'bat', flying: true };
  }
  function spider(s){
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const m = mat(s.c), m2 = mat(darker(s.c, 0.7));
    body.add(mesh(box(0.2, 0.14, 0.18), m, 0, 0.18, 0.08));
    body.add(mesh(box(0.3, 0.24, 0.3), m2, 0, 0.22, -0.16));
    body.add(mesh(box(0.1, 0.02, 0.12), mat(0x000000, { em: s.c2, ei: 0.8 }), 0, 0.345, -0.16));
    eyes(body, 0.21, 0.172, 0.04, 0xff3030, 0.03); eyes(body, 0.18, 0.172, 0.07, 0xff3030, 0.025);
    const legs = [];
    for (let i = 0; i < 4; i++) for (const sd of [-1, 1]){ const p = pivot(sd*0.09, 0.2, 0.12 - i*0.07); const l = mesh(box(0.26, 0.03, 0.03), m, sd*0.12, 0.04, 0); l.rotation.z = sd*0.5; const l2 = mesh(box(0.03, 0.2, 0.03), m, sd*0.24, -0.08, 0); p.add(l, l2); p.rotation.y = sd*(i-1.5)*0.25; body.add(p); legs.push(p); }
    return { root, parts: { body, legs }, h: 0.4, kind: 'spider' };
  }
  function elemental(s){
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const core = mesh(new THREE.IcosahedronGeometry(0.17, 0), mat(0x000000, { em: s.c, ei: 2.2 }), 0, 0, 0); body.add(core);
    const inner = mesh(new THREE.IcosahedronGeometry(0.09, 0), mat(0x000000, { em: s.c2, ei: 3 }), 0, 0, 0); body.add(inner);
    const frags = [];
    for (let i = 0; i < 6; i++){ const f = mesh(box(0.07, 0.07, 0.07), mat(0x000000, { em: i%2 ? s.c : s.c2, ei: 1.8 }), 0, 0, 0); f.userData.ph = i/6*Math.PI*2; body.add(f); frags.push(f); }
    body.position.y = 0.45;
    return { root, parts: { body, core, frags }, h: 0.7, kind: 'elemental', flying: true, light: s.c };
  }
  function golem(s){
    const g = humanoid({ c: s.c, c2: darker(s.c, 0.8), head: darker(s.c, 1.1), eye: s.c2, scale: s.scale || 1.3 });
    g.parts.torso.children[0].scale.set(1.3, 1.1, 1.3);
    g.parts.armL.scale.set(1.5, 1.2, 1.5); g.parts.armR.scale.set(1.5, 1.2, 1.5);
    g.parts.torso.add(mesh(box(0.06, 0.06, 0.02), mat(0x000000, { em: s.c2, ei: 1.5 }), 0, 0.15, 0.115));
    g.kind = 'golem';
    return g;
  }
  function eyeM(s){
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const ball = mesh(new THREE.SphereGeometry(0.22, 12, 10), mat(s.c, { rough: 0.5 }), 0, 0, 0); body.add(ball);
    const iris = mesh(new THREE.SphereGeometry(0.1, 10, 8), mat(0x000000, { em: s.c2, ei: 2 }), 0, 0, 0.15); body.add(iris);
    body.add(mesh(box(0.04, 0.09, 0.02), mat(0x000000), 0, 0, 0.245));
    const tents = [];
    for (let i = 0; i < 5; i++){ const p = pivot(Math.cos(i/5*6.28)*0.12, -0.15, Math.sin(i/5*6.28)*0.12); p.add(mesh(box(0.04, 0.22, 0.04), mat(darker(s.c, 0.7)), 0, -0.11, 0)); body.add(p); tents.push(p); }
    body.position.y = 0.55;
    return { root, parts: { body, iris, tents }, h: 0.8, kind: 'eye', flying: true };
  }
  function scorpion(s){
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const m = mat(s.c), m2 = mat(darker(s.c, 0.75));
    body.add(mesh(box(0.3, 0.14, 0.4), m, 0, 0.16, 0));
    const head = pivot(0, 0.17, 0.22); body.add(head); head.add(mesh(box(0.2, 0.1, 0.1), m2, 0, 0, 0)); eyes(head, 0.03, 0.052, 0.05, 0xffa020, 0.035);
    const tail = pivot(0, 0.22, -0.18); body.add(tail);
    let p = tail; const segs = [];
    for (let i = 0; i < 4; i++){ const sp = pivot(0, 0.1, 0); sp.add(mesh(box(0.1 - i*0.01, 0.12, 0.1 - i*0.01), i % 2 ? m : m2, 0, 0.05, 0)); sp.rotation.x = -0.45; p.add(sp); p = sp; segs.push(sp); }
    p.add(mesh(box(0.06, 0.12, 0.06), mat(0x000000, { em: s.c2, ei: 1.4 }), 0, 0.14, 0.04));
    const clawL = pivot(-0.18, 0.16, 0.2), clawR = pivot(0.18, 0.16, 0.2);
    clawL.add(mesh(box(0.08, 0.08, 0.2), m2, 0, 0, 0.1)); clawR.add(mesh(box(0.08, 0.08, 0.2), m2, 0, 0, 0.1)); body.add(clawL, clawR);
    const legs = [];
    for (let i = 0; i < 3; i++) for (const sd of [-1,1]){ const lp = pivot(sd*0.15, 0.12, 0.08 - i*0.12); const l = mesh(box(0.16, 0.03, 0.03), m2, sd*0.08, -0.04, 0); l.rotation.z = sd*-0.6; lp.add(l); body.add(lp); legs.push(lp); }
    root.scale.setScalar(1.15);
    return { root, parts: { body, head, tail, segs, armL: clawL, armR: clawR, legs }, h: 0.5, kind: 'scorpion' };
  }
  function fist(s){ // final boss's guardians: a floating claw of three curved talons around a glowing core, with a plated collar
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const m = mat(s.c, { metal: 0.4, rough: 0.6 }), dk = mat(darker(s.c, 0.7)), glow = mat(0x000000, { em: s.c2, ei: 1.9 });
    const core = mesh(new THREE.IcosahedronGeometry(0.13, 1), glow, 0, 0, 0); body.add(core);
    for (let i = 0; i < 6; i++){ const a = i / 6 * Math.PI * 2; const pl = mesh(box(0.12, 0.05, 0.06), dk, Math.cos(a) * 0.17, 0.12, Math.sin(a) * 0.17); pl.rotation.y = -a; body.add(pl); }
    for (let i = 0; i < 3; i++){ const a = i / 3 * Math.PI * 2 + 0.5; const t = pivot(Math.cos(a) * 0.16, 0.02, Math.sin(a) * 0.16);
      const s1 = mesh(box(0.07, 0.24, 0.07), m, 0, -0.12, 0), s2 = mesh(box(0.05, 0.16, 0.05), m, 0, -0.3, 0.04); s2.rotation.x = 0.5;
      t.add(s1, s2); t.rotation.y = -a; t.rotation.x = 0.35; body.add(t); }
    body.position.y = 0.55;
    return { root, parts: { body, core }, h: 0.8, kind: 'fist', flying: true, light: s.c2 };
  }
  function yog(s){ // final boss: a cracked obsidian monolith sealed in a ring of standing stones, with a floating core and orbiting rune shards
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const m = mat(s.c, { metal: 0.4, rough: 0.6 }), glow = mat(0x000000, { em: s.c2, ei: 2 }), stone = mat(darker(s.c, 1.6));
    for (let i = 0; i < 7; i++){ const a = i / 7 * Math.PI * 2; const st = mesh(box(0.16, 0.34 + (i % 3) * 0.1, 0.12), stone, Math.cos(a) * 0.82, 0.17, Math.sin(a) * 0.82); st.rotation.y = -a; st.rotation.z = (i % 2 ? 0.12 : -0.1); body.add(st); }
    const mass = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), m); mass.scale.set(1, 1.7, 0.8); mass.position.y = 0.95; body.add(mass);
    for (const [y, r, w] of [[0.7, 0.4, 0.5], [0.95, -0.3, 0.42], [1.2, 0.5, 0.3], [0.85, 1.2, 0.34]]){ const f = mesh(box(w, 0.035, 0.02), glow, 0, y, 0.36 - Math.abs(y - 0.95) * 0.3); f.rotation.z = r; body.add(f); }
    const core = mesh(new THREE.IcosahedronGeometry(0.16, 1), glow, 0, 2.0, 0); body.add(core);
    const ring = new THREE.Group(); ring.position.y = 1.15; ring.scale.setScalar(3.4); body.add(ring);
    const frags = []; for (let i = 0; i < 6; i++){ const f = mesh(box(0.025, 0.05, 0.012), glow, 0, 0, 0); f.userData.ph = i / 6 * Math.PI * 2; ring.add(f); frags.push(f); }
    return { root, parts: { body, mass, core, frags }, h: 2.1, kind: 'yog', light: s.c2 };
  }
  function build(type){
    const d = MOBS[type]; const s = d.model;
    switch (s.k){
      case 'humanoid': return humanoid(s);
      case 'rat': return rat(s);
      case 'quad': return quad(s);
      case 'snake': return snake(s);
      case 'crab': return crab(s);
      case 'swarm': return swarm(s);
      case 'blob': return blob(s);
      case 'robot': return robot(s);
      case 'bat': return bat(s);
      case 'spider': return spider(s);
      case 'elemental': return elemental(s);
      case 'golem': return golem(s);
      case 'eye': return eyeM(s);
      case 'scorpion': return scorpion(s);
      case 'fist': return fist(s);
      case 'yog': return yog(s);
      case 'hero': { const h = G.hero; const m = hero(h.cls, h.eq.armor && h.eq.armor.t, h.eq.weapon ? itemIconKey(h.eq.weapon) : null); m.root.traverse(o => { if (o.isMesh){ o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.55; o.material.emissive = new THREE.Color(0x4060a0); o.material.emissiveIntensity = 0.5; } }); return m; }
    }
    return humanoid({ c: 0xff00ff });
  }
  // decor: torch sconce, statue figure
  function statueGeo(){ return null; }
  return { build, hero, voxelGeometry, voxelMat, heldItem, mat, box, mesh };
})();
// ============================================================
// RENDERER
// ============================================================
const WH = 1.0; // wall height
const Render = (() => {
  let renderer, scene, camera, canvas;
  let levelG, charG, itemG, fxG;
  let hemi, dirLight, heroLight; const torchLights = [];
  const atlases = {};
  const U = { uFog:{ value:null }, uMapSize:{ value:new THREE.Vector2(1,1) }, uHero:{ value:new THREE.Vector3() }, uCamDir:{ value:new THREE.Vector2(0,1) }, uTime:{ value:0 } };
  let fogTex = null, fogData = null, fogCur = null, fogW = 0, fogH = 0;
  let floorMesh = null, wallMesh = null, waterMesh = null, grassMesh = null, trapMesh = null, warnMesh = null, webMesh = null, cursorMesh = null;
  let doorObjs = [], torchObjs = [], barrier = null;
  let mats = null; let curRegion = -1;
  const models = new Map();
  const heapObjs = new Map();
  let softTex = null, webTex = null, trapTex = null;
  const cam = { yaw: 0, yawT: 0, dist: 9.5, distT: 9.5, pitch: 0.92, tx: 0, ty: 0, tz: 0, shake: 0 };
  let blobPts = null, partPts = null;
  const parts = []; const MAXP = 1400;
  const projs = []; const beams = []; const texts = [];
  let overlay = null; const barPool = []; const tagPool = [];
  let lastTorchAssign = 0;
  const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
  let raycaster = null; const ndc = new THREE.Vector2();
  let pixelRatio = 1, perfAcc = 0, perfFrames = 0, perfChecked = 0;
  let hoverCell = -1;

  function init(cv){
    canvas = cv;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
    renderer.setPixelRatio(pixelRatio);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
    levelG = new THREE.Group(); charG = new THREE.Group(); itemG = new THREE.Group(); fxG = new THREE.Group();
    scene.add(levelG, itemG, charG, fxG);
    hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 0.6); scene.add(hemi);
    dirLight = new THREE.DirectionalLight(0xc8d4ff, 0.2); dirLight.position.set(-3, 10, 4); scene.add(dirLight);
    heroLight = new THREE.PointLight(0xffd0a0, 1.5, 11, 1.1); scene.add(heroLight);
    for (let i = 0; i < 5; i++){ const l = new THREE.PointLight(0xff9a40, 0, 6, 1.4); scene.add(l); torchLights.push(l); }
    softTex = new THREE.CanvasTexture(makeSoftTex());
    webTex = new THREE.CanvasTexture(makeWebTex());
    raycaster = new THREE.Raycaster();
    overlay = document.getElementById('overlay');
    // points systems
    blobPts = makePoints(4096, true); scene.add(blobPts.obj);
    partPts = makePoints(MAXP, false); scene.add(partPts.obj);
    // cursor
    const cg = new THREE.RingGeometry(0.36, 0.46, 4, 1); cg.rotateX(-Math.PI/2); cg.rotateY(Math.PI/4);
    cursorMesh = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }));
    cursorMesh.visible = false; scene.add(cursorMesh);
    // warnings & webs (instanced, rebuilt per level size)
    const wg = new THREE.PlaneGeometry(0.94, 0.94); wg.rotateX(-Math.PI/2);
    warnMesh = new THREE.InstancedMesh(wg, new THREE.MeshBasicMaterial({ color: 0xff2a14, transparent: true, opacity: 0.5, depthWrite: false }), 256);
    warnMesh.count = 0; warnMesh.frustumCulled = false; scene.add(warnMesh);
    const webg = new THREE.PlaneGeometry(0.98, 0.98); webg.rotateX(-Math.PI/2);
    webMesh = new THREE.InstancedMesh(webg, new THREE.MeshBasicMaterial({ map: webTex, transparent: true, depthWrite: false, opacity: 0.85 }), 128);
    webMesh.count = 0; webMesh.frustumCulled = false; scene.add(webMesh);
    resize();
    window.addEventListener('resize', resize);
  }
  function resize(){
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    const sc = h * renderer.getPixelRatio() / (2 * Math.tan(camera.fov * Math.PI / 360));
    if (blobPts) blobPts.mat.uniforms.uScale.value = sc;
    if (partPts) partPts.mat.uniforms.uScale.value = sc;
    cam.distT = clamp(cam.distT * (w < 600 ? 1 : 1), 5, 16);
  }
  function makePoints(n, anim){
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(n*3), col = new Float32Array(n*4), size = new Float32Array(n), ph = new Float32Array(n), kind = new Float32Array(n);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aKind', new THREE.BufferAttribute(kind, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime, uScale: { value: 600 } },
      vertexShader: `uniform float uTime; uniform float uScale; attribute vec4 aColor; attribute float aSize; attribute float aPhase; attribute float aKind; varying vec4 vColor;
        void main(){ vec3 p = position; vColor = aColor; float t = uTime + aPhase*17.0;
          if (aKind > 0.5 && aKind < 1.5){ float k = fract(t*1.1 + aPhase); p.y += k*0.55; p.x += sin(t*6.0)*0.04; vColor.a *= (1.0 - k) * (0.7 + 0.3*sin(t*13.0)); }
          else if (aKind < 0.5 && ${anim ? 'true' : 'false'}){ p.x += sin(t*0.7)*0.18; p.z += cos(t*0.55)*0.18; p.y += sin(t*0.9)*0.06; }
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec4 vColor; void main(){ float d = length(gl_PointCoord - vec2(0.5)); float a = smoothstep(0.5, 0.05, d); gl_FragColor = vec4(vColor.rgb * vColor.a * a, 1.0); }`,
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true
    });
    const obj = new THREE.Points(g, mat); obj.frustumCulled = false;
    return { obj, g, mat, pos, col, size, ph, kind, n };
  }
  // ---------- material patch: fog of war, wall cutaway, grass sway, water ----------
  function patch(mat, opts){
    opts = opts || {};
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      let vs = 'uniform float uTime;\nvarying vec3 vWPos;\nvarying vec3 vWNrm;\n' + sh.vertexShader;
      if (opts.sway) vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        float _sw = sin(uTime*1.8 + instanceMatrix[3].x*1.7 + instanceMatrix[3].z*1.3);
        transformed.x += _sw * 0.07 * max(position.y, 0.0); transformed.z += cos(uTime*1.3 + instanceMatrix[3].x) * 0.04 * max(position.y, 0.0);
        #endif`);
      vs = vs.replace('#include <project_vertex>', `#include <project_vertex>
        vec4 _wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
        _wp = instanceMatrix * _wp;
        #endif
        _wp = modelMatrix * _wp; vWPos = _wp.xyz; vWNrm = normalize(mat3(modelMatrix) * objectNormal);`);
      sh.vertexShader = vs;
      let fs = 'uniform sampler2D uFog;\nuniform vec2 uMapSize;\nuniform vec3 uHero;\nuniform vec2 uCamDir;\nuniform float uTime;\nvarying vec3 vWPos;\nvarying vec3 vWNrm;\n' +
        'float bay2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y*0.75))); }\nfloat bay4(vec2 a){ return bay2(0.5*a)*0.25 + bay2(a); }\n' + sh.fragmentShader;
      if (opts.cut) fs = fs.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        { vec2 _d = vWPos.xz - uHero.xz; float _al = dot(_d, uCamDir); vec2 _lat = _d - _al*uCamDir;
          float _thr = (1.0 - smoothstep(2.0, 3.0, _al)) * (1.0 - smoothstep(1.0, 1.6, length(_lat))) * step(0.3, _al) * smoothstep(0.02, 0.25, vWPos.y);
          if (bay4(gl_FragCoord.xy) < _thr * 0.82) discard; }`);
      if (opts.water) fs = fs.replace('#include <color_fragment>', `#include <color_fragment>
          float _w = sin(vWPos.x*5.3 + uTime*1.6 + sin(vWPos.z*3.1 + uTime)) * sin(vWPos.z*4.7 - uTime*1.2);
          diffuseColor.rgb *= 0.8 + 0.3*_w;`).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += vec3(0.5, 0.6, 0.7) * smoothstep(0.82, 1.0, _w) * 0.6;`);
      fs = fs.replace('#include <fog_fragment>', `#include <fog_fragment>
        { vec2 _fp = vWPos.xz + vWNrm.xz * 0.45;
          vec4 _fw = texture2D(uFog, (_fp + 0.5) / uMapSize);
          float _lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
          vec3 _mem = vec3(sqrt(_lum)) * vec3(0.42, 0.48, 0.62) * 0.85;
          gl_FragColor.rgb = mix(_mem, gl_FragColor.rgb, _fw.r) * _fw.g; }`);
      sh.fragmentShader = fs;
    };
    mat.customProgramCacheKey = () => 'pd' + (opts.cut ? 'c' : '') + (opts.sway ? 's' : '') + (opts.water ? 'w' : '');
    return mat;
  }
  function regionMats(region){
    if (atlases[region]) return atlases[region];
    const a = makeAtlas(region);
    const tex = new THREE.CanvasTexture(a.canvas); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestMipmapLinearFilter; tex.encoding = THREE.sRGBEncoding; tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const em = new THREE.CanvasTexture(a.emissive); em.magFilter = THREE.NearestFilter; em.minFilter = THREE.NearestMipmapLinearFilter; em.encoding = THREE.sRGBEncoding;
    const base = { map: tex, emissiveMap: em, emissive: new THREE.Color(0xffffff), emissiveIntensity: 1.0, vertexColors: true, roughness: 0.92, metalness: 0.0 };
    const floor = patch(new THREE.MeshStandardMaterial(base));
    const wall = patch(new THREE.MeshStandardMaterial(base), { cut: true });
    const reg = REGIONS[region];
    const water = patch(new THREE.MeshStandardMaterial({ color: new THREE.Color(reg.water[0]*1.3, reg.water[1]*1.3, reg.water[2]*1.3), transparent: true, opacity: 0.84, roughness: 0.1, metalness: 0.3, emissive: new THREE.Color(region === 4 ? 0x601808 : 0x000000) }), { water: true });
    const gcv = makeGrassTex(region); const gtex = new THREE.CanvasTexture(gcv); gtex.magFilter = THREE.NearestFilter; gtex.minFilter = THREE.NearestFilter; gtex.encoding = THREE.sRGBEncoding;
    const grass = patch(new THREE.MeshStandardMaterial({ map: gtex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 }), { sway: true });
    const tcv = document.createElement('canvas'); tcv.width = tcv.height = 32; tcv.getContext('2d').drawImage(a.canvas, (TILE.TRAP % AN)*TS, Math.floor(TILE.TRAP/AN)*TS, TS, TS, 0, 0, 32, 32);
    const ttex = new THREE.CanvasTexture(tcv); ttex.magFilter = THREE.NearestFilter; ttex.encoding = THREE.sRGBEncoding;
    const trap = patch(new THREE.MeshStandardMaterial({ map: ttex, roughness: 0.7, emissive: new THREE.Color(0x222222) }));
    const items = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 }));
    atlases[region] = { tex, em, floor, wall, water, grass, trap, items, atlasCanvas: a.canvas };
    return atlases[region];
  }

  // ---------- geometry builder ----------
  function Buf(){ return { p: [], n: [], u: [], c: [] }; }
  function quad(B, a, b, c, d, n, tile, cols){
    const [u0, v0, u1, v1] = tileUV(tile);
    const uvs = [[u0,v1],[u0,v0],[u1,v0],[u1,v1]];
    const vs = [a,b,c,d];
    for (const i of [0,1,2,0,2,3]){ const v = vs[i]; B.p.push(v[0], v[1], v[2]); B.n.push(n[0], n[1], n[2]); B.u.push(uvs[i][0], uvs[i][1]); const cc = cols ? cols[i] : 1; B.c.push(cc, cc, cc); }
  }
  function hquad(B, x0, z0, x1, z1, y, tile, cols){ quad(B, [x0,y,z0],[x0,y,z1],[x1,y,z1],[x1,y,z0], [0,1,0], tile, cols); }
  function vface(B, dir, x0, x1, y0, y1, at, tile, shadeTop, shadeBot){ // dir: 'S','N','E','W'; at: plane coordinate; x0..x1 along face
    const st = shadeTop == null ? 1 : shadeTop, sb = shadeBot == null ? 0.72 : shadeBot;
    const cols = [st, sb, sb, st];
    if (dir === 'S') quad(B, [x0,y1,at],[x0,y0,at],[x1,y0,at],[x1,y1,at], [0,0,1], tile, cols);
    else if (dir === 'N') quad(B, [x1,y1,at],[x1,y0,at],[x0,y0,at],[x0,y1,at], [0,0,-1], tile, cols);
    else if (dir === 'E') quad(B, [at,y1,x1],[at,y0,x1],[at,y0,x0],[at,y1,x0], [1,0,0], tile, cols);
    else quad(B, [at,y1,x0],[at,y0,x0],[at,y0,x1],[at,y1,x1], [-1,0,0], tile, cols);
  }
  function boxB(B, x0, y0, z0, x1, y1, z1, side, top){
    hquad(B, x0, z0, x1, z1, y1, top);
    vface(B, 'S', x0, x1, y0, y1, z1, side, 1, 0.75); vface(B, 'N', x0, x1, y0, y1, z0, side, 1, 0.75);
    vface(B, 'E', z0, z1, y0, y1, x1, side, 1, 0.75); vface(B, 'W', z0, z1, y0, y1, x0, side, 1, 0.75);
  }
  function toGeo(B){
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(B.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(B.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(B.c, 3));
    g.computeBoundingSphere();
    return g;
  }
  const wallLike = t => TP.wall[t] === 1;
  function cellHeight(Lv, x, y){
    if (!inb(Lv, x, y)) return 0;
    const t = Lv.tiles[y*Lv.w + x];
    if (t === T.EXIT || t === T.SEALED) return -0.28;
    if (t === T.ENTRANCE) return 0.25;
    if (t === T.PEDESTAL) return 0.3;
    if (t === T.WATER) return -0.12;
    return 0;
  }
  function disposeObj(o){ if (!o) return; if (o.parent) o.parent.remove(o); if (o.geometry && !o.geometry._shared) o.geometry.dispose(); }

  function buildLevel(Lv){
    const M = regionMats(Lv.region);
    mats = M; curRegion = Lv.region;
    const reg = REGIONS[Lv.region];
    scene.fog = new THREE.FogExp2(reg.fog, 0.035);
    scene.background = new THREE.Color(0x000000);
    hemi.color.set(reg.amb); hemi.groundColor.set(reg.ground); hemi.intensity = 0.6;
    heroLight.color.set(reg.light);
    for (const l of torchLights) l.color.set(reg.torch);
    // fog texture
    if (!fogTex || fogW !== Lv.w || fogH !== Lv.h){
      fogW = Lv.w; fogH = Lv.h;
      fogData = new Uint8Array(fogW*fogH*4); fogCur = new Float32Array(fogW*fogH*2);
      if (fogTex) fogTex.dispose();
      fogTex = new THREE.DataTexture(fogData, fogW, fogH, THREE.RGBAFormat);
      fogTex.magFilter = THREE.LinearFilter; fogTex.minFilter = THREE.LinearFilter; fogTex.flipY = false; fogTex.generateMipmaps = false;
      U.uFog.value = fogTex; U.uMapSize.value.set(fogW, fogH);
    }
    fogCur.fill(0);
    for (let i = 0; i < Lv.w*Lv.h; i++){ fogCur[i*2+1] = Lv.visited[i] ? 1 : 0; }
    writeFog(true);
    rebuildStatic(Lv);
    rebuildTraps(Lv);
    // clear dynamic
    for (const [, a] of models) disposeModel(a);
    models.clear();
    for (const [, o] of heapObjs) itemG.remove(o);
    heapObjs.clear();
    parts.length = 0; projs.forEach(p => fxG.remove(p.obj)); projs.length = 0; beams.forEach(b => fxG.remove(b.obj)); beams.length = 0;
    for (const t of texts) t.el.remove(); texts.length = 0;
    const h = G.hero; cam.tx = h.x; cam.tz = h.y; cam.ty = 0;
  }
  function rebuildStatic(Lv){
    for (const o of [floorMesh, wallMesh, waterMesh]) disposeObj(o);
    for (const d of doorObjs) levelG.remove(d.pivot); doorObjs = [];
    for (const t of torchObjs) levelG.remove(t.g); torchObjs = [];
    if (barrier){ levelG.remove(barrier); barrier = null; }
    const F = Buf(), Wb = Buf(), Wa = Buf();
    const W = Lv.w, H = Lv.h, t = Lv.tiles;
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? T.EMPTY : t[y*W + x];
    const solidAO = (x, y) => { const v = at(x, y); return (wallLike(v) || v === T.EMPTY || v === T.STATUE) ? 1 : 0; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
      const v = t[y*W + x];
      if (v === T.EMPTY) continue;
      const x0 = x - 0.5, x1 = x + 0.5, z0 = y - 0.5, z1 = y + 0.5;
      if (wallLike(v)){
        let exposed = false;
        for (const [dx, dy, dir, a0, a1, plane] of [[0,1,'S',x0,x1,z1],[0,-1,'N',x0,x1,z0],[1,0,'E',z0,z1,x1],[-1,0,'W',z0,z1,x0]]){
          const n = at(x+dx, y+dy);
          if (wallLike(n) || n === T.EMPTY) continue;
          exposed = true;
          const hsh = hash2(x*4 + dx + 2, y*4 + dy + 2, 17);
          const tile = v === T.BOOKSHELF ? TILE.SHELF : (v === T.WALL_DECO ? TILE.W0 : (hsh < 0.62 ? TILE.W0 : (hsh < 0.9 ? TILE.W1 : TILE.W2)));
          vface(Wb, dir, a0, a1, 0, WH, plane, tile, 1.0, 0.62);
        }
        let near = exposed;
        if (!near) for (const [dx,dy] of DIRS8){ const n = at(x+dx,y+dy); if (!wallLike(n) && n !== T.EMPTY){ near = true; break; } }
        if (near) hquad(Wb, x0, z0, x1, z1, WH, TILE.WTOP);
        continue;
      }
      // floor AO
      const ao = (cx, cy) => { const s = solidAO(x+cx, y) + solidAO(x, y+cy) + solidAO(x+cx, y+cy); return 1 - 0.17*s; };
      const cols = [ao(-1,-1), ao(-1,1), ao(1,1), ao(1,-1)];
      const fh = hash2(x, y, 3);
      let ftile = fh < 0.5 ? TILE.F0 : (fh < 0.78 ? TILE.F1 : (fh < 0.92 ? TILE.F2 : TILE.F3));
      switch (v){
        case T.GRASS: case T.HGRASS: ftile = TILE.GRASSF; break;
        case T.EMBERS: ftile = TILE.EMBER; break;
        case T.SPFLOOR: case T.THRONE: ftile = TILE.SPF; break;
        case T.DOOR: case T.LOCKED: ftile = TILE.F0; break;
      }
      if (v === T.WATER){
        hquad(F, x0, z0, x1, z1, -0.25, TILE.WATERBED, cols.map(c => c*0.8));
        for (const [dx, dy, dir, a0, a1, plane] of [[0,1,'N',x0,x1,z1],[0,-1,'S',x0,x1,z0],[1,0,'W',z0,z1,x1],[-1,0,'E',z0,z1,x0]]){
          if (at(x+dx, y+dy) === T.WATER) continue;
          vface(F, dir, a0, a1, -0.25, 0, plane, TILE.STEPSIDE, 0.8, 0.5);
        }
        hquad(Wa, x0, z0, x1, z1, -0.08, TILE.F0);
        continue;
      }
      if (v === T.EXIT || v === T.SEALED){
        const ix0 = x - 0.4, ix1 = x + 0.4;
        hquad(F, x0, z0, ix0, z1, 0, TILE.F0, [cols[0], cols[1], 1, 1]); hquad(F, ix1, z0, x1, z1, 0, TILE.F0, [1, 1, cols[2], cols[3]]);
        for (let i = 0; i < 4; i++){
          const za = z1 - 0.25*(i+1), zb = z1 - 0.25*i, top = -0.15*(i+1);
          hquad(F, ix0, za, ix1, zb, top, TILE.STEP, [0.9 - i*0.15, 0.9 - i*0.15, 0.9 - i*0.15, 0.9 - i*0.15]);
          vface(F, 'S', ix0, ix1, top, top + 0.15, zb, TILE.STEPSIDE, 0.7 - i*0.12, 0.5 - i*0.1);
        }
        vface(F, 'E', z0, z1, -0.9, 0, ix0, TILE.PIT, 0.6, 0.05); vface(F, 'W', z0, z1, -0.9, 0, ix1, TILE.PIT, 0.6, 0.05);
        vface(F, 'S', ix0, ix1, -0.9, 0, z0, TILE.PIT, 0.5, 0.0);
        hquad(F, ix0, z0, ix1, z0 + 0.02, -0.88, TILE.VOID);
        if (v === T.SEALED){
          barrier = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.9), new THREE.MeshBasicMaterial({ color: 0xb070ff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }));
          barrier.position.set(x, 0.55, y); levelG.add(barrier);
        }
        continue;
      }
      hquad(F, x0, z0, x1, z1, 0, ftile, cols);
      if (v === T.ENTRANCE){
        for (let i = 0; i < 4; i++){ const za = z1 - 0.25*(i+1), zb = z1 - 0.25*i; boxB(F, x - 0.42, 0, za, x + 0.42, 0.12*(i+1), zb, TILE.STEPSIDE, TILE.STEP); }
      }
      if (v === T.PEDESTAL) boxB(F, x - 0.32, 0, y - 0.32, x + 0.32, 0.3, y + 0.32, TILE.PEDSIDE, TILE.PED);
      if (v === T.STATUE){
        boxB(Wb, x - 0.4, 0, y - 0.4, x + 0.4, 0.15, y + 0.4, TILE.PEDSIDE, TILE.PED);
        boxB(Wb, x - 0.18, 0.15, y - 0.12, x + 0.18, 0.55, y + 0.12, TILE.STONE, TILE.STONE);
        boxB(Wb, x - 0.22, 0.55, y - 0.14, x + 0.22, 0.95, y + 0.14, TILE.STONE, TILE.STONE);
        boxB(Wb, x - 0.32, 0.6, y - 0.08, x - 0.22, 0.92, y + 0.08, TILE.STONE, TILE.STONE);
        boxB(Wb, x + 0.22, 0.6, y - 0.08, x + 0.32, 0.92, y + 0.08, TILE.STONE, TILE.STONE);
        boxB(Wb, x - 0.13, 0.95, y - 0.13, x + 0.13, 1.2, y + 0.13, TILE.STONE, TILE.STONE);
      }
      if (v === T.THRONE){
        boxB(Wb, x - 0.4, 0, y - 0.35, x + 0.4, 0.35, y + 0.35, TILE.THRONE, TILE.THRONE);
        boxB(Wb, x - 0.4, 0.35, y - 0.42, x + 0.4, 1.35, y - 0.25, TILE.THRONE, TILE.THRONE);
      }
      if (v === T.DOOR || v === T.LOCKED){
        const horiz = wallLike(at(x-1, y)) || wallLike(at(x+1, y));
        const pv = new THREE.Group();
        let leaf;
        const dm = v === T.LOCKED ? 'locked' : 'door';
        if (horiz){
          boxB(Wb, x0, 0, y - 0.14, x0 + 0.1, WH, y + 0.14, TILE.WOOD, TILE.WTOP);
          boxB(Wb, x1 - 0.1, 0, y - 0.14, x1, WH, y + 0.14, TILE.WOOD, TILE.WTOP);
          boxB(Wb, x0, 0.84, y - 0.16, x1, WH, y + 0.16, TILE.WOOD, TILE.WTOP);
          pv.position.set(x0 + 0.1, 0, y);
          leaf = new THREE.Mesh(doorGeo(0.8, 0.84, 0.07, v), mats.wall); leaf.position.set(0.4, 0.42, 0);
        } else {
          boxB(Wb, x - 0.14, 0, z0, x + 0.14, WH, z0 + 0.1, TILE.WOOD, TILE.WTOP);
          boxB(Wb, x - 0.14, 0, z1 - 0.1, x + 0.14, WH, z1, TILE.WOOD, TILE.WTOP);
          boxB(Wb, x - 0.16, 0.84, z0, x + 0.16, WH, z1, TILE.WOOD, TILE.WTOP);
          pv.position.set(x, 0, z0 + 0.1);
          leaf = new THREE.Mesh(doorGeo(0.07, 0.84, 0.8, v), mats.wall); leaf.position.set(0, 0.42, 0.4);
        }
        pv.add(leaf); levelG.add(pv);
        doorObjs.push({ c: y*W + x, pivot: pv, ang: 0, horiz, kind: dm });
      }
    }
    floorMesh = new THREE.Mesh(toGeo(F), mats.floor); levelG.add(floorMesh);
    wallMesh = new THREE.Mesh(toGeo(Wb), mats.wall); levelG.add(wallMesh);
    if (Wa.p.length){ waterMesh = new THREE.Mesh(toGeo(Wa), mats.water); waterMesh.renderOrder = 2; levelG.add(waterMesh); }
    // torches
    for (const tc of Lv.torches){
      const x = tc.c % W, y = (tc.c / W) | 0;
      const g = new THREE.Group();
      g.position.set(x + tc.fx*0.5, 0.62, y + tc.fy*0.5);
      const sconce = new THREE.Mesh(MDL.box(0.08, 0.16, 0.08), MDL.mat(0x3a3028, { metal: 0.6, rough: 0.4 })); sconce.position.set(tc.fx*0.05, 0, tc.fy*0.05); g.add(sconce);
      const flameM = new THREE.SpriteMaterial({ map: softTex, color: new THREE.Color(REGIONS[Lv.region].torch).multiplyScalar(1.4), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
      const fl = new THREE.Sprite(flameM); fl.scale.set(0.32, 0.42, 1); fl.position.set(tc.fx*0.1, 0.17, tc.fy*0.1); g.add(fl);
      const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: 0xfff2c0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); core.scale.set(0.12, 0.18, 1); core.position.copy(fl.position); g.add(core);
      levelG.add(g);
      torchObjs.push({ c: tc.c, g, fl, core, x: x + tc.fx*0.35, z: y + tc.fy*0.35, ph: hash2(x, y, 5)*10 });
    }
    rebuildGrass(Lv);
    V.tilesDirty = false;
  }
  const doorGeoCache = {};
  function doorGeo(w, h, d, v){
    const k = w + '|' + d + '|' + v; if (doorGeoCache[k]) return doorGeoCache[k];
    const B = Buf(); const tile = v === T.LOCKED ? TILE.LDOOR : TILE.DOOR;
    boxB(B, -w/2, -h/2, -d/2, w/2, h/2, d/2, tile, TILE.WOOD);
    const g = toGeo(B); g._shared = true; doorGeoCache[k] = g; return g;
  }
  function rebuildGrass(Lv){
    if (grassMesh){ levelG.remove(grassMesh); grassMesh.dispose && grassMesh.dispose(); grassMesh = null; }
    const cells = [];
    for (let c = 0; c < Lv.w*Lv.h; c++) if (Lv.tiles[c] === T.HGRASS) cells.push(c);
    if (!cells.length){ V.grassDirty = false; return; }
    const g = new THREE.BufferGeometry();
    const B = Buf();
    const s = 0.28, h = 0.55;
    quad(B, [-s,h,0],[-s,0,0],[s,0,0],[s,h,0], [0,0,1], 0); quad(B, [0,h,-s],[0,0,-s],[0,0,s],[0,h,s], [1,0,0], 0);
    const uv = []; for (let i = 0; i < 2; i++) uv.push(0,1, 0,0, 1,0, 0,1, 1,0, 1,1);
    g.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute([0,1,0, 0,1,0, 0,1,0, 0,1,0, 0,1,0, 0,1,0, 0,1,0, 0,1,0, 0,1,0, 0,1,0, 0,1,0, 0,1,0], 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const per = 4;
    grassMesh = new THREE.InstancedMesh(g, mats.grass, cells.length * per);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    let i = 0;
    for (const c of cells){
      const x = c % Lv.w, y = (c / Lv.w) | 0;
      for (let k = 0; k < per; k++){
        p.set(x + (hash2(x, y, k*3+1) - 0.5)*0.75, 0, y + (hash2(x, y, k*3+2) - 0.5)*0.75);
        e.set(0, hash2(x, y, k*3+3)*Math.PI, 0); q.setFromEuler(e);
        const s2 = 0.8 + hash2(y, x, k)*0.6; sc.set(s2, s2*(0.9 + hash2(x,k,y)*0.5), s2);
        m4.compose(p, q, sc); grassMesh.setMatrixAt(i++, m4);
      }
    }
    grassMesh.instanceMatrix.needsUpdate = true;
    levelG.add(grassMesh);
    V.grassDirty = false;
  }
  function rebuildTraps(Lv){
    if (trapMesh){ levelG.remove(trapMesh); trapMesh = null; }
    const list = [];
    for (const k in Lv.traps){ const tr = Lv.traps[k]; if (!tr.hidden) list.push([Number(k), tr]); }
    V.trapDirty = false;
    if (!list.length) return;
    const g = new THREE.PlaneGeometry(0.62, 0.62); g.rotateX(-Math.PI/2);
    trapMesh = new THREE.InstancedMesh(g, mats.trap, list.length);
    const m4 = new THREE.Matrix4(); const col = new THREE.Color();
    list.forEach(([c, tr], i) => {
      m4.makeTranslation(c % Lv.w, 0.012, (c / Lv.w) | 0); trapMesh.setMatrixAt(i, m4);
      col.set(tr.active ? TRAPS[tr.t].color : '#555555').convertSRGBToLinear(); trapMesh.setColorAt(i, col);
    });
    trapMesh.instanceMatrix.needsUpdate = true; if (trapMesh.instanceColor) trapMesh.instanceColor.needsUpdate = true;
    levelG.add(trapMesh);
  }
  function writeFog(full){
    const n = fogW*fogH; let changed = full;
    const fov = V.fov, vis = L.visited;
    const dt = Math.min(0.05, Render._dt || 0.016);
    const k = full ? 1 : Math.min(1, dt * 9);
    for (let i = 0; i < n; i++){
      const tv = fov && fov[i] ? 1 : 0, te = vis[i] ? 1 : 0;
      let cv = fogCur[i*2], ce = fogCur[i*2+1];
      if (cv !== tv){ cv += (tv - cv) * k; if (Math.abs(cv - tv) < 0.01) cv = tv; fogCur[i*2] = cv; changed = true; }
      if (ce !== te){ ce += (te - ce) * k; if (Math.abs(ce - te) < 0.01) ce = te; fogCur[i*2+1] = ce; changed = true; }
      if (changed){ fogData[i*4] = cv*255; fogData[i*4+1] = ce*255; }
    }
    if (changed){ for (let i = 0; i < n; i++){ fogData[i*4] = fogCur[i*2]*255; fogData[i*4+1] = fogCur[i*2+1]*255; } fogTex.needsUpdate = true; }
  }

  // ---------- characters ----------
  function heroLook(){ const h = G.hero; return h.cls + '|' + (h.eq.armor ? h.eq.armor.t : '') + '|' + (h.eq.weapon ? itemIconKey(h.eq.weapon) : ''); }
  const shadowGeo = new THREE.CircleGeometry(0.26, 16);
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false });
  function makeModel(ch){
    let m;
    if (isHero(ch)) m = MDL.hero(ch.cls, ch.eq.armor && ch.eq.armor.t, ch.eq.weapon ? itemIconKey(ch.eq.weapon) : null);
    else m = MDL.build(ch.type);
    const a = { ch, root: m.root, parts: m.parts, kind: m.kind, h: m.h, flying: !!m.flying,
      x: ch.x, z: ch.y, y: cellHeight(L, ch.x, ch.y), fx: ch.x, fz: ch.y, fy: 0, tx: ch.x, tz: ch.y, ty: 0, moveT: 1, moveDur: 0.14, hopH: 0.1,
      face: 0, faceT: 0, atkT: 1, atkDx: 0, atkDz: 0, hurtT: 1, dead: false, deadT: 0, spawnT: 1, ph: Math.random()*10, look: isHero(ch) ? heroLook() : null, light: null };
    a.y = a.ty = a.fy = cellHeight(L, ch.x, ch.y);
    if (!m.flying && m.kind !== 'yog'){ const sh = new THREE.Mesh(shadowGeo, shadowMat); sh.rotation.x = -Math.PI/2; sh.position.y = 0.012; sh.scale.setScalar(Math.max(0.6, m.h * 0.9)); a.root.add(sh); }
    else { const sh = new THREE.Mesh(shadowGeo, shadowMat); sh.rotation.x = -Math.PI/2; sh.position.y = 0.012; sh.scale.setScalar(m.kind === 'yog' ? 2.2 : 0.8); a.root.add(sh); }
    a.root.position.set(a.x, a.y, a.z);
    charG.add(a.root);
    models.set(ch.id, a);
    return a;
  }
  function disposeModel(a){ charG.remove(a.root); if (a.bar){ a.bar.el.hidden = true; a.bar.used = false; } if (a.tag){ a.tag.el.hidden = true; a.tag.used = false; } }
  function modelOf(ch){ return ch ? models.get(ch.id) : null; }
  function sync(force){
    if (!G || !L) return;
    const h = G.hero;
    // hero
    let ha = models.get(h.id);
    if (ha && ha.look !== heroLook() && !ha.dead){ const keep = { x: ha.x, z: ha.z, face: ha.face }; disposeModel(ha); models.delete(h.id); ha = makeModel(h); ha.x = keep.x; ha.z = keep.z; ha.face = ha.faceT = keep.face; }
    if (!ha && !h.dead) ha = makeModel(h);
    const alive = new Set([h.id]);
    for (const m of L.mobs){ alive.add(m.id); if (!models.has(m.id)) makeModel(m); }
    for (const [id, a] of models){ if (!alive.has(id) && !a.dead){ disposeModel(a); models.delete(id); } }
    if (force){ for (const [, a] of models){ a.x = a.tx = a.fx = a.ch.x; a.z = a.tz = a.fz = a.ch.y; a.moveT = 1; a.y = a.ty = a.fy = cellHeight(L, a.ch.x, a.ch.y); } }
    else for (const [, a] of models){ if (!a.dead && (a.tx !== a.ch.x || a.tz !== a.ch.y)) startMove(a, a.ch.x, a.ch.y, 0.14); }
    if (V.tilesDirty) rebuildStatic(L);
    else if (V.grassDirty) rebuildGrass(L);
    if (V.trapDirty) rebuildTraps(L);
    syncItems(force || V.itemsDirty);
    if (V.blobDirty || force) syncBlobs();
    if (V.warnDirty || force) syncWarnings();
    if (barrier && L.tiles[L.exit] !== T.SEALED){ levelG.remove(barrier); barrier = null; }
  }
  function startMove(a, nx, ny, dur){
    a.fx = a.x; a.fz = a.z; a.fy = a.y; a.tx = nx; a.tz = ny; a.ty = cellHeight(L, nx, ny);
    a.moveT = 0; a.moveDur = dur;
    const dx = nx - a.fx, dz = ny - a.fz; if (Math.abs(dx) + Math.abs(dz) > 0.01) a.faceT = Math.atan2(dx, dz);
  }
  // ---------- items ----------
  function syncItems(force){
    if (!force) return;
    V.itemsDirty = false;
    const seen = new Set();
    for (const k in L.heaps){
      const c = Number(k); const heap = L.heaps[k]; if (!heap || !heap.length) continue;
      const top = heap[heap.length - 1];
      const key = itemIconKey(top) + (top.price ? '$' : '') + (heap.length > 1 ? '+' : '');
      seen.add(c);
      let o = heapObjs.get(c);
      if (o && o.userData.key === key) continue;
      if (o) itemG.remove(o);
      o = new THREE.Group(); o.userData.key = key;
      const vm = new THREE.Mesh(MDL.voxelGeometry(itemIconKey(top)), mats.items); vm.scale.setScalar(top.k === 'gold' ? 0.024 : 0.028);
      o.add(vm); o.userData.spin = vm;
      const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.2, 12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
      shadow.rotation.x = -Math.PI/2; shadow.position.y = 0.01; o.add(shadow);
      if (top.price){ const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.36, 24), new THREE.MeshBasicMaterial({ color: 0xf3d062, transparent: true, opacity: 0.6, depthWrite: false })); ring.rotation.x = -Math.PI/2; ring.position.y = 0.015; o.add(ring); }
      if (heap.length > 1){ const sm = new THREE.Mesh(MDL.box(0.16, 0.08, 0.16), MDL.mat(0x6a5a40)); sm.position.set(0.18, 0.04, 0.12); o.add(sm); }
      const x = c % L.w, y = (c / L.w) | 0;
      o.position.set(x, cellHeight(L, x, y), y);
      o.userData.ph = hash2(x, y, 9) * 6;
      itemG.add(o); heapObjs.set(c, o);
    }
    for (const [c, o] of heapObjs) if (!seen.has(c)){ itemG.remove(o); heapObjs.delete(c); }
  }
  // ---------- blobs & warnings ----------
  function syncBlobs(){
    V.blobDirty = false;
    const P = blobPts; let n = 0;
    const W = L.w;
    const push = (x, y, z, r, g, b, a, s, ph, kind) => { if (n >= P.n) return; P.pos[n*3] = x; P.pos[n*3+1] = y; P.pos[n*3+2] = z; P.col[n*4] = r; P.col[n*4+1] = g; P.col[n*4+2] = b; P.col[n*4+3] = a; P.size[n] = s; P.ph[n] = ph; P.kind[n] = kind; n++; };
    let webs = 0; const m4 = new THREE.Matrix4();
    for (let c = 0; c < W*L.h; c++){
      const x = c % W, y = (c / W) | 0;
      if (!L.visited[c]) continue;
      const tx = L.toxic[c], pa = L.para[c], fr = L.frost[c], fi = L.fire[c];
      if (tx > 0){ const a = Math.min(0.55, 0.12 + tx/150); push(x + hash2(x,y,1)*0.4-0.2, 0.35, y + hash2(x,y,2)*0.4-0.2, 0.35, 0.8, 0.2, a, 1.5, hash2(x,y,3), 0); push(x, 0.6, y, 0.25, 0.6, 0.15, a*0.7, 1.2, hash2(x,y,4), 0); }
      if (pa > 0){ const a = Math.min(0.55, 0.12 + pa/150); push(x + hash2(x,y,5)*0.4-0.2, 0.35, y, 0.9, 0.8, 0.2, a, 1.5, hash2(x,y,6), 0); }
      if (fr > 0){ const a = Math.min(0.6, 0.2 + fr/40); push(x, 0.3, y, 0.6, 0.85, 1.0, a, 1.4, hash2(x,y,7), 0); }
      if (fi > 0){ for (let k = 0; k < 4; k++) push(x + (hash2(x,y,k)-0.5)*0.6, 0.05, y + (hash2(y,x,k)-0.5)*0.6, 1.0, 0.45 + hash2(k,x,y)*0.3, 0.1, 0.9, 0.55 + hash2(x,k,y)*0.3, hash2(x,y,k+10), 1); push(x, 0.2, y, 1.0, 0.35, 0.05, 0.35, 1.3, hash2(x,y,30), 0); }
      if (L.web[c] && webs < 128){ m4.makeTranslation(x, 0.025, y); webMesh.setMatrixAt(webs++, m4); }
    }
    webMesh.count = webs; webMesh.instanceMatrix.needsUpdate = true;
    P.g.setDrawRange(0, n);
    for (const k of ['position','aColor','aSize','aPhase','aKind']) P.g.attributes[k].needsUpdate = true;
  }
  function syncWarnings(){
    V.warnDirty = false;
    const m4 = new THREE.Matrix4(); let i = 0;
    for (const w of L.warnings) for (const c of w.cells){ if (i >= 256) break; m4.makeTranslation(c % L.w, cellHeight(L, c % L.w, (c/L.w)|0) + 0.03, (c / L.w) | 0); warnMesh.setMatrixAt(i++, m4); }
    warnMesh.count = i; warnMesh.instanceMatrix.needsUpdate = true;
  }
  // ---------- particles ----------
  function emit(x, y, z, vx, vy, vz, life, r, g, b, size, grav, kind){
    if (parts.length >= MAXP) parts.shift();
    parts.push({ x, y, z, vx, vy, vz, life, max: life, r, g, b, size, grav: grav == null ? -2.5 : grav, kind: kind || 2 });
  }
  function burst(x, z, color, n, size, y){
    const c = new THREE.Color(color);
    const by = (y == null ? cellHeight(L, Math.round(x), Math.round(z)) + 0.35 : y);
    for (let i = 0; i < n; i++){
      const a = Math.random()*Math.PI*2, s = 0.6 + Math.random()*1.6*(size || 1);
      emit(x, by, z, Math.cos(a)*s, 0.6 + Math.random()*2*(size||1), Math.sin(a)*s, 0.35 + Math.random()*0.45, c.r, c.g, c.b, (0.12 + Math.random()*0.12)*(size||1), -5);
    }
  }
  function updateParticles(dt){
    const P = partPts; let n = 0;
    for (let i = parts.length - 1; i >= 0; i--){
      const p = parts[i]; p.life -= dt;
      if (p.life <= 0){ parts.splice(i, 1); continue; }
      p.vy += p.grav * dt; p.x += p.vx*dt; p.y += p.vy*dt; p.z += p.vz*dt; p.vx *= 0.96; p.vz *= 0.96;
      if (p.y < 0.02 && p.grav < 0){ p.y = 0.02; p.vy *= -0.3; }
    }
    for (const p of parts){
      if (n >= P.n) break;
      const a = Math.min(1, p.life / p.max * 1.5);
      P.pos[n*3] = p.x; P.pos[n*3+1] = p.y; P.pos[n*3+2] = p.z;
      P.col[n*4] = p.r; P.col[n*4+1] = p.g; P.col[n*4+2] = p.b; P.col[n*4+3] = a;
      P.size[n] = p.size; P.ph[n] = 0; P.kind[n] = 2; n++;
    }
    P.g.setDrawRange(0, n);
    for (const k of ['position','aColor','aSize']) P.g.attributes[k].needsUpdate = true;
  }
  // ---------- projectiles & beams ----------
  const boltGeo = new THREE.SphereGeometry(0.09, 8, 6);
  function addProj(x0, y0, x1, y1, obj, dur, arc, trail, delay){
    const h0 = cellHeight(L, x0, y0) + 0.45, h1 = cellHeight(L, x1, y1) + 0.4;
    obj.position.set(x0, h0, y0); obj.visible = !delay; fxG.add(obj);
    projs.push({ obj, x0, y0, x1, y1, h0, h1, t: -(delay||0), dur: Math.max(0.05, dur), arc: arc || 0, trail, spin: !!arc });
  }
  function stretch(a, b, thick, color, life){
    const len = a.distanceTo(b); if (len < 0.01) return;
    const m = new THREE.Mesh(new THREE.BoxGeometry(thick, thick, len), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.copy(a).add(b).multiplyScalar(0.5); m.lookAt(b);
    fxG.add(m); beams.push({ obj: m, life, max: life });
  }
  function wpos(x, y, dh){ return new THREE.Vector3(x, cellHeight(L, x, y) + (dh == null ? 0.45 : dh), y); }
  function charPos(ch, dh){ const a = modelOf(ch); if (a) return new THREE.Vector3(a.x, a.y + (dh == null ? a.h*0.6 : dh), a.z); return wpos(ch.x, ch.y, dh); }
  // ---------- floating text ----------
  function floatText(x, y, str, color, delay, big){
    const el = document.createElement('div'); el.className = 'ftext'; el.textContent = str; el.style.color = color || '#fff';
    if (big) el.style.fontSize = '22px';
    el.style.opacity = '0'; overlay.appendChild(el);
    const a = charAtXY(x, y);
    let stack = 0; for (const o of texts) if (o.x === x && o.z === y && o.t + (delay||0) < 0.45) stack++;
    texts.push({ el, x, z: y, y: (a ? a.y + a.h + 0.15 : cellHeight(L, x, y) + 0.9) + stack*0.22, t: -(delay || 0), dur: 1.0, jitter: (Math.random() - 0.5)*10 });
    if (texts.length > 40){ const o = texts.shift(); o.el.remove(); }
  }
  function charAtXY(x, y){ for (const [, a] of models) if (!a.dead && a.ch.x === x && a.ch.y === y) return a; return null; }
  function projectToScreen(v){
    tmpV.copy(v).project(camera);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    return [ (tmpV.x*0.5 + 0.5) * w, (-tmpV.y*0.5 + 0.5) * h, tmpV.z ];
  }
  function getBar(){ let b = barPool.find(b => !b.used); if (!b){ const el = document.createElement('div'); el.className = 'mbar'; el.innerHTML = '<i></i>'; overlay.appendChild(el); b = { el, fill: el.firstChild, used: false }; barPool.push(b); } b.used = true; b.el.hidden = false; return b; }
  function getTag(){ let b = tagPool.find(b => !b.used); if (!b){ const el = document.createElement('div'); el.className = 'mtag'; overlay.appendChild(el); b = { el, used: false }; tagPool.push(b); } b.used = true; b.el.hidden = false; return b; }

  // ---------- per-frame ----------
  function angLerp(a, b, t){ let d = b - a; while (d > Math.PI) d -= Math.PI*2; while (d < -Math.PI) d += Math.PI*2; return a + d*t; }
  function frame(dt, time){
    Render._dt = dt;
    U.uTime.value = time;
    if (!G || !L || !fogTex) { renderer.render(scene, camera); return; }
    writeFog(false);
    const h = G.hero;
    const ha = models.get(h.id);
    // models
    for (const [id, a] of models){
      const ch = a.ch;
      if (a.moveT < 1){
        a.moveT = Math.min(1, a.moveT + dt / a.moveDur);
        const k = a.moveT < 1 ? (1 - Math.pow(1 - a.moveT, 2)) : 1;
        a.x = lerp(a.fx, a.tx, k); a.z = lerp(a.fz, a.tz, k); a.y = lerp(a.fy, a.ty, k);
      }
      a.face = angLerp(a.face, a.faceT, Math.min(1, dt*14));
      let ox = 0, oz = 0, oy = 0;
      if (a.atkT < 1){ a.atkT = Math.min(1, a.atkT + dt / 0.24); const s = Math.sin(a.atkT * Math.PI); ox = a.atkDx * s * 0.3; oz = a.atkDz * s * 0.3; }
      if (a.hurtT < 1){ a.hurtT = Math.min(1, a.hurtT + dt / 0.25); const s = Math.sin(a.hurtT * Math.PI * 3) * (1 - a.hurtT); ox += s * 0.06; }
      const walking = a.moveT < 1;
      const hop = walking ? Math.sin(a.moveT * Math.PI) * a.hopH : 0;
      a.ph += dt;
      const P = a.parts;
      if (P.legL){ const sw = walking ? Math.sin(a.moveT * Math.PI * 2) * 0.7 : 0; P.legL.rotation.x = sw; P.legR.rotation.x = -sw; }
      if (P.armL && P.armL.isGroup !== false && a.kind !== 'crab' && a.kind !== 'scorpion'){
        const sw = walking ? Math.sin(a.moveT * Math.PI * 2) * 0.5 : Math.sin(a.ph*1.6)*0.04;
        P.armL.rotation.x = -sw;
        P.armR.rotation.x = sw + (a.atkT < 1 ? -Math.sin(a.atkT*Math.PI)*1.6 : 0);
      }
      if (P.legs){ for (let i = 0; i < P.legs.length; i++) P.legs[i].rotation.x = walking ? Math.sin(a.moveT*Math.PI*2 + i)*0.6 : 0; }
      if (P.tail && a.kind === 'quad') P.tail.rotation.y = Math.sin(a.ph*3)*0.4;
      if (P.segs && a.kind === 'snake') P.segs.forEach((s, i) => s.position.x = Math.sin(a.ph*4 - i*0.9) * 0.05 * i);
      if (P.wingL){ const f = Math.sin(a.ph * (a.kind === 'bat' ? 18 : 3)) * (a.kind === 'bat' ? 0.9 : 0.25); P.wingL.rotation.z = f; P.wingR.rotation.z = -f; if (a.kind !== 'bat'){ P.wingL.rotation.y = 0.5 + f; P.wingR.rotation.y = -0.5 - f; } }
      if (P.flies) for (const f of P.flies){ const u = f.userData; const t2 = a.ph*u.sp + u.ph; f.position.set(Math.cos(t2)*u.r, u.y + Math.sin(t2*1.7)*0.06, Math.sin(t2)*u.r); }
      if (P.frags) P.frags.forEach((f, i) => { const t2 = a.ph*2 + f.userData.ph; f.position.set(Math.cos(t2)*0.26, Math.sin(t2*1.3)*0.12, Math.sin(t2)*0.26); f.rotation.set(t2, t2*0.7, 0); });
      if (P.core) { const s = 1 + Math.sin(a.ph*6)*0.08; P.core.scale.setScalar(s); }
      if (P.tents) P.tents.forEach((t2, i) => t2.rotation.x = Math.sin(a.ph*2 + i)*0.3);
      if (P.blob){ const s = 1 + Math.sin(a.ph*3)*0.05 + (ch.pumping ? Math.sin(a.ph*20)*0.08 + 0.15 : 0); P.blob.scale.set(s, 0.8/s + (walking ? 0.1 : 0), s); }
      if (P.iris && ha) { /* eye looks at hero */ }
      if (a.kind === 'eye' || a.kind === 'bat' || a.kind === 'elemental' || a.kind === 'fist') P.body.position.y = (a.kind === 'bat' ? 0.45 : (a.kind === 'eye' ? 0.55 : (a.kind === 'fist' ? 0.55 : 0.45))) + Math.sin(a.ph*2.2)*0.06;
      if (P.body && a.kind === 'humanoid' || a.kind === 'hero') P.body.position.y = walking ? 0 : Math.sin(a.ph*2)*0.008;
      if (P.eyes) P.eyes.forEach((e, i) => e.rotation.y = Math.sin(a.ph + i)*0.4);
      // status pose
      let tiltX = 0;
      if (ch.state === 'sleeping' && !isHero(ch)) tiltX = 0;
      if (ch.buffs && (ch.buffs.para || ch.buffs.frozen)) tiltX = 0;
      // death
      if (a.dead){
        a.deadT += dt;
        const k = Math.min(1, a.deadT / 0.6);
        a.root.rotation.z = k * 1.4 * (a.deadSide || 1);
        oy -= k * 0.25;
        a.root.scale.setScalar(Math.max(0.01, (1 - k*0.6)) * (a.baseScale || 1));
        if (a.deadT > 0.9){ disposeModel(a); models.delete(id); continue; }
      } else if (a.spawnT < 1){ a.spawnT = Math.min(1, a.spawnT + dt/0.35); a.root.scale.setScalar(a.spawnT * (a.baseScale || 1)); }
      a.root.position.set(a.x + ox, a.y + hop + oy, a.z + oz);
      a.root.rotation.y = a.face;
      if (a.root.rotation.x !== tiltX) a.root.rotation.x = tiltX;
      // visibility
      const cell = ch.y*L.w + ch.x;
      const vis = isHero(ch) || (V.fov && V.fov[cell]) || V.mind || a.dead;
      a.root.visible = !!vis;
      // frozen tint via scale shiver
      // overlays
      if (!isHero(ch) && vis && !a.dead){
        const showBar = (ch.hp < ch.ht && !MOBS[ch.type].boss && ch.type !== 'keeper') || ch.ally;
        if (showBar){ if (!a.bar) a.bar = getBar(); }
        else if (a.bar){ a.bar.el.hidden = true; a.bar.used = false; a.bar = null; }
        const tagTxt = ch.state === 'sleeping' || (ch.buffs && ch.buffs.sleep) ? 'z' : (ch.buffs && (ch.buffs.para || ch.buffs.frozen) ? '*' : (ch.state === 'fleeing' ? '!' : ''));
        if (tagTxt){ if (!a.tag) a.tag = getTag(); if (a.tag.el.textContent !== tagTxt) a.tag.el.textContent = tagTxt; a.tag.el.className = 'mtag'; }
        else if (a.tag){ a.tag.el.hidden = true; a.tag.used = false; a.tag = null; }
        if (a.bar || a.tag){
          tmpV2.set(a.root.position.x, a.root.position.y + a.h + 0.18, a.root.position.z);
          const [sx, sy, sz] = projectToScreen(tmpV2);
          const off = sz > 1;
          if (a.bar){ a.bar.el.hidden = off; a.bar.el.style.transform = `translate(${(sx - 17)|0}px, ${(sy)|0}px)`; a.bar.fill.style.width = Math.max(0, ch.hp / ch.ht * 100) + '%'; a.bar.el.classList.toggle('ally', !!ch.ally); }
          if (a.tag){ a.tag.el.hidden = off; a.tag.el.style.transform = `translate(${(sx + 6 + Math.sin(a.ph*2)*2)|0}px, ${(sy - 18 + Math.sin(a.ph*1.5)*3)|0}px)`; }
        }
      } else {
        if (a.bar){ a.bar.el.hidden = true; a.bar.used = false; a.bar = null; }
        if (a.tag){ a.tag.el.hidden = true; a.tag.used = false; a.tag = null; }
      }
    }
    // doors
    for (const d of doorObjs){
      const open = (L.tiles[d.c] === T.DOOR) && cellOpen(d.c);
      const tgt = open ? -1.45 : 0;
      d.ang += (tgt - d.ang) * Math.min(1, dt * 12);
      d.pivot.rotation.y = d.ang;
      if (d.kind === 'locked' && L.tiles[d.c] === T.DOOR){ d.kind = 'door'; }
    }
    // torches flicker + lights
    for (const t of torchObjs){ const f = 1 + Math.sin(time*9 + t.ph)*0.08 + Math.sin(time*23 + t.ph*2)*0.05; t.fl.scale.set(0.32*f, 0.44*f, 1); }
    if (time - lastTorchAssign > 0.3){
      lastTorchAssign = time;
      const hx = ha ? ha.x : h.x, hz = ha ? ha.z : h.y;
      const cand = torchObjs.filter(t => L.visited[t.c]).sort((a, b) => dist2(a.x, a.z, hx, hz) - dist2(b.x, b.z, hx, hz));
      torchLights.forEach((l, i) => { const t = cand[i]; if (t && dist2(t.x, t.z, hx, hz) < 200){ l.position.set(t.x, 0.75, t.z); l.userData.on = true; l.userData.ph = t.ph; } else l.userData.on = false; });
    }
    for (const l of torchLights){ const target = l.userData.on ? 1.0 + Math.sin(time*8 + (l.userData.ph||0))*0.12 : 0; l.intensity += (target - l.intensity) * Math.min(1, dt*6); }
    // items spin
    for (const [, o] of heapObjs){ const ph = o.userData.ph; o.userData.spin.rotation.y = time*1.1 + ph; o.userData.spin.position.y = 0.32 + Math.sin(time*2 + ph)*0.04; }
    // projectiles
    for (let i = projs.length - 1; i >= 0; i--){
      const p = projs[i]; p.t += dt;
      if (p.t < 0) continue;
      p.obj.visible = true;
      const k = Math.min(1, p.t / p.dur);
      const x = lerp(p.x0, p.x1, k), z = lerp(p.y0, p.y1, k), y = lerp(p.h0, p.h1, k) + Math.sin(k*Math.PI)*p.arc;
      p.obj.position.set(x, y, z);
      if (p.spin) p.obj.rotation.z -= dt * 16;
      else p.obj.lookAt(p.x1, p.h1, p.y1);
      if (p.trail){ const c = p.trail; emit(x, y, z, (Math.random()-0.5)*0.3, (Math.random()-0.5)*0.3, (Math.random()-0.5)*0.3, 0.25, c.r, c.g, c.b, 0.16, 0); }
      if (k >= 1){ fxG.remove(p.obj); projs.splice(i, 1); if (p.trail) burst(p.x1, p.y1, p.trail.getHex(), 8, 0.7, p.h1); }
    }
    for (let i = beams.length - 1; i >= 0; i--){ const b = beams[i]; b.life -= dt; b.obj.material.opacity = Math.max(0, b.life / b.max); if (b.life <= 0){ fxG.remove(b.obj); b.obj.geometry.dispose(); b.obj.material.dispose(); beams.splice(i, 1); } }
    updateParticles(dt);
    warnMesh.material.opacity = 0.5 + Math.sin(time*10)*0.2;
    if (barrier){ barrier.material.opacity = 0.22 + Math.sin(time*3)*0.08; barrier.rotation.y = time*0.5; }
    // camera
    cam.yaw = angLerp(cam.yaw, cam.yawT, Math.min(1, dt*8));
    cam.dist += (cam.distT - cam.dist) * Math.min(1, dt*8);
    if (ha){ cam.tx += (ha.x - cam.tx) * Math.min(1, dt*7); cam.tz += (ha.z - cam.tz) * Math.min(1, dt*7); cam.ty += (ha.y - cam.ty) * Math.min(1, dt*5); }
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    let shx = 0, shy = 0;
    if (cam.shake > 0){ cam.shake = Math.max(0, cam.shake - dt); shx = (Math.random() - 0.5) * cam.shake * 0.8; shy = (Math.random() - 0.5) * cam.shake * 0.8; }
    camera.position.set(cam.tx + Math.sin(cam.yaw)*cam.dist*cp + shx, cam.ty + cam.dist*sp + shy, cam.tz + Math.cos(cam.yaw)*cam.dist*cp);
    camera.lookAt(cam.tx, cam.ty + 0.35, cam.tz);
    U.uCamDir.value.set(Math.sin(cam.yaw), Math.cos(cam.yaw));
    if (ha) U.uHero.value.set(ha.x, ha.y, ha.z);
    if (ha){ heroLight.position.set(ha.x + Math.sin(cam.yaw)*0.9, ha.y + 2.7, ha.z + Math.cos(cam.yaw)*0.9); heroLight.intensity = 1.45 + Math.sin(time*7)*0.04; heroLight.distance = 13; heroLight.decay = 1; }
    dirLight.position.set(camera.position.x - cam.tx, camera.position.y - cam.ty + 2, camera.position.z - cam.tz);
    // floating text
    for (let i = texts.length - 1; i >= 0; i--){
      const t = texts[i]; t.t += dt;
      if (t.t < 0) continue;
      const k = t.t / t.dur;
      if (k >= 1){ t.el.remove(); texts.splice(i, 1); continue; }
      tmpV2.set(t.x, t.y + k*0.6, t.z);
      const [sx, sy, sz] = projectToScreen(tmpV2);
      t.el.style.opacity = sz > 1 ? 0 : String(k < 0.7 ? 1 : (1 - (k-0.7)/0.3));
      t.el.style.transform = `translate(${(sx - t.el.offsetWidth/2 + t.jitter)|0}px, ${(sy - 10)|0}px) scale(${k < 0.12 ? 0.7 + k*2.5 : 1})`;
    }
    // cursor
    if (hoverCell >= 0 && inb(L, hoverCell % L.w, (hoverCell / L.w)|0) && L.visited[hoverCell]){
      cursorMesh.visible = true; const x = hoverCell % L.w, y = (hoverCell / L.w)|0;
      cursorMesh.position.set(x, cellHeight(L, x, y) + 0.02, y);
      const m = mobAt(L, x, y);
      cursorMesh.material.color.set(m && !m.ally && m.type !== 'keeper' && V.fov[hoverCell] ? 0xff6050 : (L.heaps[hoverCell] ? 0xf3d062 : 0xffffff));
      cursorMesh.material.opacity = 0.45 + Math.sin(time*5)*0.15;
    } else cursorMesh.visible = false;
    renderer.render(scene, camera);
    // adaptive resolution
    perfAcc += dt; perfFrames++;
    if (perfAcc > 3 && time - perfChecked > 3){
      const fps = perfFrames / perfAcc; perfAcc = 0; perfFrames = 0; perfChecked = time;
      if (fps < 32 && pixelRatio > 0.8){ pixelRatio = Math.max(0.75, pixelRatio - 0.25); renderer.setPixelRatio(pixelRatio); resize(); }
    }
  }
  // ---------- picking ----------
  function pick(clientX, clientY){
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    // characters first
    let best = null, bd = 1e9;
    for (const [, a] of models){
      if (!a.root.visible || a.dead || isHero(a.ch)) continue;
      const hits = raycaster.intersectObject(a.root, true);
      if (hits.length && hits[0].distance < bd){ bd = hits[0].distance; best = a.ch; }
    }
    if (best) return { x: best.x, y: best.y, ch: best };
    // ground plane at y=0 then refine for walls
    const o = raycaster.ray.origin, d = raycaster.ray.direction;
    if (Math.abs(d.y) < 1e-4) return null;
    for (const hgt of [WH, 0]){
      const t = (hgt - o.y) / d.y; if (t < 0) continue;
      const x = Math.round(o.x + d.x*t), y = Math.round(o.z + d.z*t);
      if (hgt === WH){ if (inb(L, x, y) && wallLike(L.tiles[y*L.w + x]) && L.visited[y*L.w+x]) return { x, y, wall: true }; continue; }
      return { x, y };
    }
    return null;
  }
  function setHover(c){ hoverCell = c; }
  // ---------- FX api ----------
  const FXapi = {
    move(ch, fast){ const a = modelOf(ch); if (!a) return; startMove(a, ch.x, ch.y, fast ? 0.09 : (isHero(ch) ? 0.13 : 0.15)); },
    attack(att, def){ const a = modelOf(att); if (!a) return; const dx = def.x - att.x, dz = def.y - att.y; const l = Math.hypot(dx, dz) || 1; a.atkDx = dx/l; a.atkDz = dz/l; a.atkT = 0; a.faceT = Math.atan2(dx, dz); },
    hurt(ch, dmg, delay, color){
      const a = modelOf(ch); if (a){ setTimeout(() => { a.hurtT = 0; }, (delay||0)*1000); }
      if (!V.fov || !(isHero(ch) || V.fov[ch.y*L.w + ch.x])) return;
      if (dmg > 0) floatText(ch.x, ch.y, String(dmg), color || (isHero(ch) ? '#ff6a5a' : '#ffe9b0'), delay || 0);
      const bc = isHero(ch) ? 0xc02020 : ({ skeleton:0xe8e0d0, slime:0x80c040, goo:0x303030, dm100:0xffd060, dm200:0xffd060, dm300:0xffd060, golem:0xa09888, elemental:0xff8a30, swarm:0x404040, eye:0x902040, fistb:0xff8a30, fistr:0x80c040, yog:0x902040, image:0x8090c0 }[ch.type] || 0xb01818);
      setTimeout(() => burst(ch.x, ch.y, bc, Math.min(14, 4 + Math.floor(dmg/3)), 0.6), (delay||0)*1000);
    },
    die(ch){ const a = modelOf(ch); if (a){ a.dead = true; a.deadT = 0; a.deadSide = Math.random() < 0.5 ? -1 : 1; a.baseScale = a.root.scale.x; } burst(ch.x, ch.y, 0x907070, 12, 0.8); },
    text(x, y, s, color, delay){ if (!V.fov || V.fov[y*L.w + x] || (G.hero.x === x && G.hero.y === y)) floatText(x, y, s, color, delay); },
    alert(m){ if (V.fov && V.fov[m.y*L.w + m.x]) floatText(m.x, m.y, '!', '#f2b24c', 0, true); },
    burst(x, y, color, n, size){ if (L && (!V.fov || V.fov[y*L.w + x] || L.visited[y*L.w+x])) burst(x, y, color, n || 10, size); },
    bolt(x0, y0, x1, y1, color, dur){ const c = new THREE.Color(color); const m = new THREE.Mesh(boltGeo, new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(1.5) })); addProj(x0, y0, x1, y1, m, dur || 0.2, 0, c); },
    projectile(x0, y0, x1, y1, item, dur){
      let obj;
      if (item.k === 'arrow'){ obj = new THREE.Mesh(MDL.box(0.03, 0.03, 0.4), new THREE.MeshBasicMaterial({ color: 0xc0fff0 })); addProj(x0, y0, x1, y1, obj, dur, 0, new THREE.Color(0x80ffd0)); return; }
      const key = item.k === 'bomb' ? 'bomb:bomb' : (item.k === 'shuriken' ? 'missile:shuriken' : itemIconKey(item));
      obj = new THREE.Group(); const vm = new THREE.Mesh(MDL.voxelGeometry(key), MDL.voxelMat()); vm.scale.setScalar(0.026); obj.add(vm);
      addProj(x0, y0, x1, y1, obj, dur, item.k === 'potion' || item.k === 'bomb' ? 0.6 : 0.15, null);
    },
    beam(x0, y0, x1, y1, color){ const a = wpos(x0, y0, 0.5), b = wpos(x1, y1, 0.5); stretch(a, b, 0.16, color, 0.4); stretch(a, b, 0.05, 0xffffff, 0.3); const c = new THREE.Color(color); for (let i = 0; i < 16; i++){ const k = Math.random(); emit(lerp(a.x,b.x,k), lerp(a.y,b.y,k), lerp(a.z,b.z,k), (Math.random()-0.5), Math.random(), (Math.random()-0.5), 0.4, c.r, c.g, c.b, 0.15, 0); } },
    lightning(c1, c2){ FXapi.lightningTo(c1.x, c1.y, c2.x, c2.y); },
    lightningTo(x0, y0, x1, y1){
      const a = wpos(x0, y0, 0.5), b = wpos(x1, y1, 0.5); let prev = a.clone();
      const segs = 7;
      for (let i = 1; i <= segs; i++){ const k = i/segs; const p = new THREE.Vector3(lerp(a.x,b.x,k), lerp(a.y,b.y,k), lerp(a.z,b.z,k)); if (i < segs){ p.x += (Math.random()-0.5)*0.35; p.y += (Math.random()-0.5)*0.3; p.z += (Math.random()-0.5)*0.35; } stretch(prev, p, 0.05, 0xb0e8ff, 0.3); prev = p; }
      burst(x1, y1, 0x9ae0ff, 10, 0.6);
    },
    cone(x, y, cells, color){ const c = new THREE.Color(color); for (const [cx, cy] of cells){ for (let k = 0; k < 3; k++) emit(cx + (Math.random()-0.5)*0.6, 0.3 + Math.random()*0.3, cy + (Math.random()-0.5)*0.6, (cx - x)*0.4, 1 + Math.random(), (cy - y)*0.4, 0.5 + Math.random()*0.3, c.r, c.g*0.8, c.b*0.5, 0.28, 0.5); } },
    chain(m, e){ stretch(wpos(m.x, m.y, 0.45), wpos(e.x, e.y, 0.45), 0.04, 0xb0b0b0, 0.4); },
    puff(x, y){ for (let i = 0; i < 14; i++){ const a = Math.random()*6.28; emit(x + Math.cos(a)*0.2, 0.3 + Math.random()*0.4, y + Math.sin(a)*0.2, Math.cos(a)*0.6, 0.4 + Math.random()*0.6, Math.sin(a)*0.6, 0.6, 0.55, 0.55, 0.6, 0.3, 0.2); } },
    teleport(ch){ const a = modelOf(ch); if (a){ a.x = a.tx = a.fx = ch.x; a.z = a.tz = a.fz = ch.y; a.y = a.ty = a.fy = cellHeight(L, ch.x, ch.y); a.moveT = 1; } burst(ch.x, ch.y, 0xa080ff, 14, 0.8); },
    spawn(m){ const a = modelOf(m) || makeModel(m); a.spawnT = 0; a.baseScale = a.root.scale.x; burst(m.x, m.y, 0xa0a0ff, 10, 0.7); },
    leap(ch){ const a = modelOf(ch); if (a){ startMove(a, ch.x, ch.y, 0.22); a.hopH = 0.6; setTimeout(() => { a.hopH = 0.1; }, 300); } },
    heal(ch){ for (let i = 0; i < 18; i++){ const a = Math.random()*6.28; emit(ch.x + Math.cos(a)*0.3, 0.1, ch.y + Math.sin(a)*0.3, 0, 1 + Math.random(), 0, 0.8, 0.4, 1, 0.5, 0.14, 0.3); } },
    levelUp(ch){ for (let i = 0; i < 30; i++){ const a = i/30*6.28; emit(ch.x + Math.cos(a)*0.4, 0.1, ch.y + Math.sin(a)*0.4, Math.cos(a)*0.3, 1.6 + Math.random(), Math.sin(a)*0.3, 1.0, 1, 0.85, 0.35, 0.14, 0.2); } },
    charge(m, color){ const c = new THREE.Color(color); for (let i = 0; i < 20; i++){ const a = Math.random()*6.28, r = 0.8; emit(m.x + Math.cos(a)*r, 0.5 + Math.random()*0.4, m.y + Math.sin(a)*r, -Math.cos(a)*r*2, 0, -Math.sin(a)*r*2, 0.45, c.r, c.g, c.b, 0.16, 0); } },
    shake(a){ cam.shake = Math.max(cam.shake, a); },
    flash(){ const f = document.getElementById('fade'); f.style.background = '#fff'; f.style.transition = 'none'; f.style.opacity = '0.6'; requestAnimationFrame(() => { f.style.transition = 'opacity .5s'; f.style.opacity = '0'; setTimeout(() => { f.style.background = '#000'; f.style.transition = ''; }, 520); }); }
  };
  function rotate(d){ cam.yawT += d; }
  function snapYaw(){ const s = Math.PI/4; cam.yawT = Math.round(cam.yawT / s) * s; }
  function zoom(f){ cam.distT = clamp(cam.distT * f, 4.5, 17); }
  function yawIndex(){ const s = Math.PI/4; return ((Math.round(cam.yawT / s) % 8) + 8) % 8; }
  function heroScreenPos(){ const h = G.hero; const a = models.get(h.id); if (!a) return null; tmpV2.set(a.x, a.y + 0.4, a.z); return projectToScreen(tmpV2); }
  function cellScreenPos(x, y){ tmpV2.set(x, cellHeight(L, x, y) + 0.4, y); return projectToScreen(tmpV2); }
  function resetAll(){ for (const [, a] of models) disposeModel(a); models.clear(); for (const [, o] of heapObjs) itemG.remove(o); heapObjs.clear(); }
  return { init, buildLevel, sync, frame, pick, setHover, FX: FXapi, rotate, snapYaw, zoom, yawIndex, cam, resize, heroScreenPos, cellScreenPos, resetAll, get renderer(){ return renderer; } };
})();
const FX = Render.FX;
// ============================================================
// UI: HUD, windows, input
// ============================================================
const UI = (() => {
  const $ = id => document.getElementById(id);
  let logDirty = true, modal = null, targeting = null, path = null, pathTimer = 0, resting = false, restCount = 0;
  let lastAct = 0, heldDir = null, selId = null, prevFoes = new Set(), prevHP = 0, chooseCB = null, chooseFilter = null, chooseTitle = '';
  const pointer = { down: false, x: 0, y: 0, sx: 0, sy: 0, moved: false, button: 0, touches: new Map(), pinch: 0, longT: null };

  // ---------- HUD ----------
  function update(){
    if (!G) return;
    const h = G.hero;
    const hp = $('hpbar');
    const tot = Math.max(h.ht, 1);
    hp.querySelector('i').style.width = (Math.max(0, h.hp) / tot * 100) + '%';
    hp.querySelector('u').style.width = (Math.max(0, h.hp) / tot * 100) + '%';
    hp.querySelector('b').style.width = Math.min(100, (h.shield || 0) / tot * 100) + '%';
    hp.querySelector('span').textContent = Math.max(0, h.hp) + '/' + h.ht + (h.shield ? ' +' + h.shield : '');
    document.getElementById('app').classList.toggle('lowhp', h.hp > 0 && h.hp <= h.ht * 0.3 && !G.over);
    $('xpbar').firstElementChild.style.width = (h.exp / maxExp(h.lvl) * 100) + '%';
    $('lvlbadge').textContent = h.lvl;
    $('depthn').textContent = G.depth;
    $('regionn').textContent = REGIONS[regionOf(G.depth)].name;
    const keys = h.keys[G.depth] || 0;
    $('goldk').innerHTML = `<span title="Gold">${h.gold} g</span>` + (keys ? `<span title="Iron keys" style="color:#c8ccd4">${keys} key${keys>1?'s':''}</span>` : '');
    // buffs
    const bf = [];
    if (h.hunger >= 450) bf.push(['starving']); else if (h.hunger >= 300) bf.push(['hungry']);
    for (const k in h.buffs){ if (BUFF_INFO[k]){ const t = h.buffs[k].t; bf.push([k, t < 999 ? t : null]); } }
    $('buffs').innerHTML = bf.map(([k, t]) => `<span class="buff" style="color:${BUFF_INFO[k].c}">${BUFF_INFO[k].n}${t ? ' ' + t : ''}</span>`).join('');
    // quickslots
    document.querySelectorAll('.qs').forEach(b => {
      const i = Number(b.dataset.q); const it = quickItem(i);
      const cv = b.querySelector('canvas');
      drawIconTo(cv, it ? itemIconKey(it) : null);
      b.classList.toggle('empty', !it);
      b.classList.toggle('armed', !!(targeting && targeting.slot === i));
      let q = '';
      if (it){ if (it.qty > 1) q = it.qty; else if (it.ch !== undefined && (it.k === 'wand' || it.k === 'weapon')) q = it.ch + '/' + it.chMax; else if (it.k === 'cloak') q = Math.floor(it.ch) + '/' + it.chMax; }
      b.querySelector('.q').textContent = q;
      b.title = it ? itemName(it) + ' (' + (i+1) + ')' : 'Empty quickslot. Assign one from your backpack.';
    });
    // enemies
    const foes = visibleFoes();
    $('enemyind').innerHTML = foes.slice(0, 3).map(m => `<button class="foe" data-id="${m.id}" title="Attack ${esc(MOBS[m.type].name)}">${esc(MOBS[m.type].name)} <small>${Math.ceil(m.hp / m.ht * 100)}%</small></button>`).join('');
    // boss
    const boss = L.mobs.find(m => MOBS[m.type].boss && m.state !== 'sleeping' && !m.dead);
    const bb = $('bossbar');
    if (boss){ bb.hidden = false; bb.querySelector('.bn').textContent = MOBS[boss.type].name + (invulnerable(boss) ? ' · shielded' : ''); bb.querySelector('i').style.width = (boss.hp / boss.ht * 100) + '%'; bb.querySelector('span').textContent = boss.hp + '/' + boss.ht; }
    else bb.hidden = true;
    logDirty = true;
  }
  function visibleFoes(){
    const h = G.hero;
    return L.mobs.filter(m => !m.ally && m.state !== 'passive' && !m.dead && V.fov && V.fov[m.y*L.w + m.x]).sort((a, b) => cheb(a.x,a.y,h.x,h.y) - cheb(b.x,b.y,h.x,h.y));
  }
  function renderLog(){
    if (!logDirty) return; logDirty = false;
    const now = performance.now();
    const rows = V.log.slice(-5);
    $('log').innerHTML = rows.map(r => `<div class="${r.cls}" style="opacity:${Math.max(0.35, 1 - (now - r.t)/14000)}">${esc(r.msg)}</div>`).join('');
  }
  function logChanged(){ logDirty = true; }
  function toast(title, sub){ const t = $('toast'); t.innerHTML = esc(title) + (sub ? `<small>${esc(sub)}</small>` : ''); t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 2200); }
  function fade(on, text, cb){
    const f = $('fade');
    if (on){ f.textContent = text || ''; f.classList.add('on'); setTimeout(() => { cb && cb(); }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300); }
    else { setTimeout(() => f.classList.remove('on'), 60); }
  }

  // ---------- windows ----------
  function openWindow(html, bind, onClose, narrow){
    const m = $('modal'); m.hidden = false;
    m.innerHTML = `<div class="panel${narrow ? ' narrow' : ''}" role="dialog" aria-modal="true">${html}</div>`;
    modal = { onClose };
    stopAuto();
    if (bind) bind(m.firstElementChild);
    const f = m.querySelector('button.primary, button'); if (f) f.focus({ preventScroll: true });
  }
  function closeWindow(){
    const m = $('modal'); if (m.hidden) return;
    m.hidden = true; m.innerHTML = '';
    const oc = modal && modal.onClose; modal = null;
    if (oc) oc();
    $('view').focus({ preventScroll: true });
  }
  function slotHTML(it, label, extra){
    if (!it) return `<button class="slot" ${extra||''} disabled aria-label="${label || 'empty'}">${label ? `<span class="lb">${label}</span>` : ''}</button>`;
    const kl = levelKnown(it) && ['weapon','armor','ring','wand','bow','cloak'].includes(it.k) && it.lvl !== 0 ? `<span class="lv ${it.lvl < 0 ? 'bad' : ''}">${sgn(it.lvl)}</span>` : (['weapon','armor','ring','wand'].includes(it.k) && !it.known ? '<span class="lv" style="color:var(--dim)">?</span>' : '');
    const qt = it.qty > 1 ? `<span class="qt">${it.qty}</span>` : (it.ch !== undefined && it.chMax ? `<span class="qt">${Math.floor(it.ch)}/${it.chMax}</span>` : '');
    const cursed = it.cursed && (it.curseKnown || it.known);
    return `<button class="slot ${isEquipped(it) ? 'eq' : ''} ${cursed ? 'cursed' : ''} ${selId === it.id ? 'sel' : ''}" data-id="${it.id}" ${extra||''} title="${esc(itemName(it, true))}">${label ? `<span class="lb">${label}</span>` : ''}<img alt="" src="${iconURL(itemIconKey(it))}" style="width:70%;height:70%;image-rendering:pixelated">${kl}${qt}</button>`;
  }
  function openInventory(){
    const h = G.hero;
    const choosing = !!chooseCB;
    const eq = [['weapon','Weapon'],['armor','Armor'],['art','Artifact'],['ring1','Ring'],['ring2','Ring']];
    let html = `<h2>${choosing ? esc(chooseTitle) : 'Backpack'}</h2>`;
    if (choosing) html += `<p>Choose an item. Items that can't be chosen are dimmed.</p>`;
    html += `<h3>Equipped</h3><div class="grid">` + eq.map(([k, lab]) => slotHTML(h.eq[k], lab)).join('') + `</div>`;
    html += `<h3>Pack · ${h.inv.length}/20 · <span style="color:var(--gold)">${h.gold} gold</span>${h.keys[G.depth] ? ` · ${h.keys[G.depth]} iron key` : ''}</h3><div class="grid">`;
    for (let i = 0; i < 20; i++) html += slotHTML(h.inv[i] || null);
    html += `</div><div id="idetail"></div><div class="row" style="margin-top:12px;justify-content:flex-end"><button class="btn" id="invclose">${choosing ? 'Cancel' : 'Close'}</button></div>`;
    openWindow(html, (p) => {
      p.querySelectorAll('.slot[data-id]').forEach(b => {
        const it = findItem(Number(b.dataset.id));
        if (choosing && it && !chooseFilter(it)) b.style.opacity = '0.3';
        b.addEventListener('click', () => {
          if (!it) return;
          if (choosing){ if (!chooseFilter(it)) return; const cb = chooseCB; chooseCB = null; closeWindow(); cb(it); return; }
          selId = it.id; p.querySelectorAll('.slot').forEach(s => s.classList.toggle('sel', s === b)); showDetail(it, p.querySelector('#idetail'));
        });
      });
      p.querySelector('#invclose').addEventListener('click', () => { if (choosing){ const cb = chooseCB; chooseCB = null; closeWindow(); cb(null); } else closeWindow(); });
      const sel = selId && findItem(selId); if (sel && !choosing) showDetail(sel, p.querySelector('#idetail'));
    }, () => { if (chooseCB){ const cb = chooseCB; chooseCB = null; cb(null); } });
  }
  function itemActions(it){
    const a = [];
    const eqd = isEquipped(it);
    switch (it.k){
      case 'weapon': if (WEAPONS[it.t].staff) a.push(['Zap', 'zap']); a.push(eqd ? ['Unequip','uneq'] : ['Equip','equip']); break;
      case 'armor': case 'ring': a.push(eqd ? ['Remove','uneq'] : ['Equip','equip']); break;
      case 'cloak': a.push(['Activate','cloak']); a.push(eqd ? ['Remove','uneq'] : ['Equip','equip']); break;
      case 'potion': a.push(['Drink','drink'], ['Throw','throw']); break;
      case 'scroll': a.push(['Read','read']); break;
      case 'food': a.push(['Eat','eat']); break;
      case 'missile': a.push(['Throw','throw']); break;
      case 'wand': a.push(['Zap','zap']); break;
      case 'bow': a.push(['Shoot','shoot']); break;
    }
    if (it.k !== 'bow') a.push(['Drop','drop']);
    return a;
  }
  function showDetail(it, el){
    const info = itemInfo(it);
    const acts = itemActions(it);
    el.innerHTML = `<div class="idetail"><canvas width="16" height="16"></canvas><div class="tx"><div class="nm">${esc(info.name)}${it.qty > 1 ? ' ×' + it.qty : ''}</div>
      <div class="st">${info.tags.map(([t, c]) => `<span class="tag" style="color:${c}">${esc(t)}</span>`).join('')}${info.stats ? esc(info.stats) : ''}</div>
      <div class="ds">${esc(info.desc)}</div>
      <div class="row" style="margin-top:10px">${acts.map(([l, k]) => `<button class="btn ${k === acts[0][1] ? 'primary' : ''}" data-a="${k}">${l}</button>`).join('')}</div>
      <div class="row" style="margin-top:8px;gap:6px"><span style="font-size:12px;color:var(--dim)">Quickslot</span>${[0,1,2,3].map(i => `<button class="ibtn" data-q="${i}" title="Put in quickslot ${i+1}">${i+1}</button>`).join('')}</div></div></div>`;
    drawIconTo(el.querySelector('canvas'), itemIconKey(it));
    el.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => doItemAction(it, b.dataset.a)));
    el.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => { setQuick(it, Number(b.dataset.q)); b.blur(); toast('', ''); $('toast').classList.remove('on'); }));
  }
  function doItemAction(it, a){
    switch (a){
      case 'equip': closeWindow(); act(() => heroEquip(it)); break;
      case 'uneq': closeWindow(); act(() => heroUnequip(it)); break;
      case 'drink': closeWindow(); act(() => drinkPotion(it)); break;
      case 'read': closeWindow(); act(() => readScroll(it)); break;
      case 'eat': closeWindow(); act(() => heroEat(it)); break;
      case 'drop': closeWindow(); act(() => dropItem(it)); break;
      case 'cloak': closeWindow(); act(() => toggleCloak(it)); break;
      case 'throw': closeWindow(); startTargeting('throw', it, -1); break;
      case 'zap': closeWindow(); startTargeting('zap', it, -1); break;
      case 'shoot': closeWindow(); startTargeting('shoot', it, -1); break;
    }
  }
  function chooseItem(title, filter, cb){ chooseCB = cb; chooseFilter = filter; chooseTitle = title; openInventory(); }
  function openBuy(c){
    const heap = L.heaps[c]; if (!heap) return;
    const it = heap.find(i => i.price); if (!it) return;
    const info = itemInfo(it);
    const h = G.hero;
    openWindow(`<h2>Buy ${esc(info.name)}?</h2><div class="idetail"><canvas width="16" height="16"></canvas><div class="tx"><div class="st">${info.stats ? esc(info.stats) : ''}</div><div class="ds">${esc(info.desc)}</div></div></div>
      <p>Price: <b style="color:var(--gold)">${it.price} gold</b>. You have ${h.gold} gold.</p>
      <div class="row" style="justify-content:flex-end"><button class="btn" id="bno">Leave it</button><button class="btn primary" id="byes" ${h.gold < it.price ? 'disabled' : ''}>Buy</button></div>`, (p) => {
      drawIconTo(p.querySelector('canvas'), itemIconKey(it));
      p.querySelector('#bno').addEventListener('click', closeWindow);
      p.querySelector('#byes').addEventListener('click', () => {
        if (h.gold < it.price) return;
        if (h.inv.length >= 20 && !(STACKABLE[it.k] && h.inv.some(o => sameStack(o, it)))){ log('Your pack is full.', 'warn'); closeWindow(); return; }
        h.gold -= it.price; delete it.price;
        heap.splice(heap.indexOf(it), 1); if (!heap.length) delete L.heaps[c];
        collect(it); V.itemsDirty = true; Sound.play('gold'); closeWindow(); Render.sync(); update();
      });
    });
  }
  function openSell(){
    const h = G.hero;
    const list = h.inv.filter(i => itemValue(i) > 0);
    let html = `<h2>Sell to the shopkeeper</h2><p>Choose something to sell. You have <b style="color:var(--gold)">${h.gold} gold</b>.</p><div class="grid">`;
    for (const it of list) html += slotHTML(it);
    html += `</div><div id="sdetail"></div><div class="row" style="margin-top:12px;justify-content:flex-end"><button class="btn" id="sclose">Done</button></div>`;
    openWindow(html, (p) => {
      p.querySelector('#sclose').addEventListener('click', closeWindow);
      p.querySelectorAll('.slot[data-id]').forEach(b => b.addEventListener('click', () => {
        const it = findItem(Number(b.dataset.id)); if (!it) return;
        const val = Math.max(1, Math.floor(itemValue(it)));
        p.querySelector('#sdetail').innerHTML = `<div class="idetail"><div class="tx"><div class="nm">${esc(itemName(it, true))}</div><div class="ds">The shopkeeper offers ${val} gold.</div><div class="row" style="margin-top:8px"><button class="btn primary" id="sdo">Sell for ${val} gold</button></div></div></div>`;
        p.querySelector('#sdo').addEventListener('click', () => { removeItem(it); h.gold += val; log('You sell ' + itemName(it, true) + ' for ' + val + ' gold.', 'good'); Sound.play('gold'); openSell(); update(); });
      }));
    });
  }
  function openHelp(){
    openWindow(`<h2>How to play</h2>
      <p>Explore 25 floors, defeat the five guardians, and claim the Amulet of Yendor on floor 26. Every action takes a turn; monsters act when you do.</p>
      <h3>Controls</h3>
      <table class="keys"><tbody>
      <tr><td><kbd>W A S D</kbd> / arrows / numpad</td><td>Move or attack (relative to the camera). Diagonals: <kbd>Y U B N</kbd> or numpad <kbd>7 9 1 3</kbd>.</td></tr>
      <tr><td>Click / tap a tile</td><td>Walk there. Click a monster to attack it or walk over to it.</td></tr>
      <tr><td><kbd>Space</kbd> / <kbd>.</kbd></td><td>Wait one turn and search adjacent tiles for secrets.</td></tr>
      <tr><td><kbd>Z</kbd></td><td>Rest until healed or something appears.</td></tr>
      <tr><td><kbd>I</kbd></td><td>Open your backpack.</td></tr>
      <tr><td><kbd>1</kbd>–<kbd>4</kbd></td><td>Use a quickslot. Thrown and zapped items aim at the nearest enemy; press again or click to fire, <kbd>Tab</kbd> to cycle targets.</td></tr>
      <tr><td><kbd>F</kbd></td><td>Attack or approach the nearest visible enemy.</td></tr>
      <tr><td><kbd>Q</kbd> <kbd>E</kbd> / right-drag</td><td>Rotate the camera. Mouse wheel or pinch to zoom.</td></tr>
      <tr><td>Right-click / long-press</td><td>Examine a tile.</td></tr>
      <tr><td><kbd>Esc</kbd></td><td>Cancel, close windows, or open the menu.</td></tr>
      </tbody></table>
      <h3>Tips</h3>
      <p>Unknown potions and scrolls reveal themselves when used. Throw suspicious potions at enemies. Scrolls of Upgrade and Potions of Strength are guaranteed on every set of floors, so spend them on the gear you plan to keep. Watch for red tiles: they mark an attack that lands next turn. Search dead ends for hidden doors. Eat when you are Hungry, not before.</p>
      <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn primary" id="hclose">Got it</button></div>`, p => p.querySelector('#hclose').addEventListener('click', closeWindow));
  }
  function openHeroInfo(){
    const h = G.hero; const w = h.eq.weapon, a = h.eq.armor;
    const kp = Object.keys(G.known.potion).filter(k => G.known.potion[k]).map(k => POTIONS[k].name);
    const ks = Object.keys(G.known.scroll).filter(k => G.known.scroll[k]).map(k => SCROLLS[k].name);
    openWindow(`<h2>${CLASSES[h.cls].name}, level ${h.lvl}</h2>
      <div class="stats">
      <span>Health</span><span>${h.hp}/${h.ht}</span>
      <span>Strength</span><span>${heroStr()}</span>
      <span>Experience</span><span>${h.exp}/${maxExp(h.lvl)}</span>
      <span>Accuracy</span><span>${Math.round(heroAttackSkill())}</span>
      <span>Evasion</span><span>${Math.round(heroDefenseSkill())}</span>
      <span>Weapon damage</span><span>${w ? weaponMin(w) + '–' + weaponMax(w) : '1–' + Math.max(1, heroStr()-8)}</span>
      <span>Armor</span><span>${a ? armorDRMin(a) + '–' + armorDRMax(a) : '0'}</span>
      <span>Satiety</span><span>${h.hunger >= 450 ? 'Starving' : h.hunger >= 300 ? 'Hungry' : 'Fed'}</span>
      <span>Turns</span><span>${G.stats.turns}</span>
      <span>Monsters slain</span><span>${G.stats.kills}</span>
      <span>Gold collected</span><span>${G.stats.gold}</span>
      <span>Deepest floor</span><span>${G.stats.deepest}</span>
      </div>
      <h3>Identified potions</h3><p>${kp.length ? kp.join(', ') : 'None yet.'}</p>
      <h3>Identified scrolls</h3><p>${ks.length ? ks.join(', ') : 'None yet.'}</p>
      <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn primary" id="cclose">Close</button></div>`, p => p.querySelector('#cclose').addEventListener('click', closeWindow));
  }
  function openMenu(){
    openWindow(`<h2>Paused</h2>
      <div class="row" style="flex-direction:column;align-items:stretch;gap:8px">
      <button class="btn primary" id="mres">Resume</button>
      <button class="btn" id="mhelp">How to play</button>
      <button class="btn" id="minfo">Hero details</button>
      <button class="btn" id="msnd">Sound: ${Sound.muted ? 'off' : 'on'}</button>
      <button class="btn" id="mquit">Save and return to title</button>
      <button class="btn danger" id="mab">Abandon this run</button>
      </div>`, p => {
        p.querySelector('#mres').addEventListener('click', closeWindow);
        p.querySelector('#mhelp').addEventListener('click', openHelp);
        p.querySelector('#minfo').addEventListener('click', openHeroInfo);
        p.querySelector('#msnd').addEventListener('click', (e) => { Sound.toggle(); e.target.textContent = 'Sound: ' + (Sound.muted ? 'off' : 'on'); });
        p.querySelector('#mquit').addEventListener('click', () => { saveGame(); closeWindow(); showTitle(); });
        p.querySelector('#mab').addEventListener('click', (e) => {
          if (e.target.dataset.confirm){ closeWindow(); G.deathCause = 'giving up'; G.over = true; endRun(false, true); }
          else { e.target.dataset.confirm = '1'; e.target.textContent = 'Tap again to abandon (no save)'; }
        });
      }, null, true);
  }
  function endScreen(won){
    const h = G.hero;
    const title = won ? 'You hold the Amulet of Yendor' : 'You died on floor ' + G.depth;
    const sub = won ? 'The dungeon is yours. Few adventurers ever reach this far.' : 'Killed by ' + (G.deathCause || 'something') + '.';
    openWindow(`<h2>${esc(title)}</h2><p>${esc(sub)}</p>
      <div class="stats" style="margin-top:10px">
      <span>Class</span><span>${CLASSES[h.cls].name}</span>
      <span>Level</span><span>${h.lvl}</span>
      <span>Deepest floor</span><span>${G.stats.deepest}</span>
      <span>Monsters slain</span><span>${G.stats.kills}</span>
      <span>Gold collected</span><span>${G.stats.gold}</span>
      <span>Turns</span><span>${G.stats.turns}</span>
      <span>Score</span><span>${scoreOf()}</span>
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn primary" id="eagain">New run</button></div>`, p => {
        p.querySelector('#eagain').addEventListener('click', () => { closeWindow(); });
      }, () => { if (G && G.over) showTitle(); });
  }
  function examine(x, y){
    if (!inb(L, x, y) || !L.visited[y*L.w + x]){ log('You don\'t know what lies there.', 'info'); return; }
    const c = y*L.w + x, t = L.tiles[c];
    const m = V.fov[c] || V.mind ? charAt(x, y) : null;
    let html = '';
    if (m && !isHero(m)){
      const d = MOBS[m.type];
      const st = m.state === 'sleeping' ? 'It is asleep.' : m.state === 'wandering' ? 'It is wandering and hasn\'t noticed you.' : m.state === 'fleeing' ? 'It is fleeing.' : m.ally ? 'It fights at your side.' : m.state === 'passive' ? '' : 'It is hunting you.';
      html += `<h2>${esc(d.name)}</h2><p>${esc(d.desc)}</p><p style="color:var(--dim)">${m.ht < 9000 ? `Health ${m.hp}/${m.ht}. ` : ''}${st}</p>`;
    }
    const heap = L.heaps[c];
    if (heap && heap.length){ html += `<h3>Items here</h3><p>${heap.map(i => esc(itemName(i, true)) + (i.price ? ` (${i.price} gold)` : '')).join(', ')}</p>`; }
    const tr = L.traps[c];
    html += `<h3>${esc(TILE_NAMES[t] || 'Floor')}</h3>`;
    if (tr && !tr.hidden) html += `<p>${esc(TRAPS[tr.t].name)}${tr.active ? '' : ' (disarmed)'}: ${esc(TRAPS[tr.t].desc)}</p>`;
    if (TILE_DESC[t]) html += `<p>${esc(TILE_DESC[t])}</p>`;
    if (L.fire[c] > 0) html += `<p>It is on fire.</p>`; if (L.toxic[c] > 0) html += `<p>Toxic gas hangs here.</p>`; if (L.para[c] > 0) html += `<p>A paralytic haze lingers here.</p>`; if (L.web[c]) html += `<p>A sticky web covers the ground.</p>`;
    openWindow(html + `<div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn primary" id="xclose">Close</button></div>`, p => p.querySelector('#xclose').addEventListener('click', closeWindow), null, true);
  }

  // ---------- targeting ----------
  function startTargeting(kind, it, slot){
    if (heroBusy()) return;
    if ((kind === 'zap') && it.ch < 1){ log('It has no charges left.', 'warn'); return; }
    const foes = visibleFoes().filter(m => { const b = bolt(G.hero.x, G.hero.y, m.x, m.y); return b.ch === m; });
    targeting = { kind, it, slot, foes, idx: 0 };
    if (V.lastTarget){ const i = foes.findIndex(f => f.id === V.lastTarget); if (i >= 0) targeting.idx = i; }
    const verb = { throw: 'Throw', zap: 'Zap', shoot: 'Shoot' }[kind];
    $('targetbar').hidden = false;
    $('targetbar').textContent = `${verb} ${itemName(it)}: ${foes.length ? 'press ' + (slot >= 0 ? (slot+1) : 'Enter') + ' to fire, Tab to switch, or click a tile' : 'click a tile'} · Esc to cancel`;
    highlightTarget(); update();
  }
  function highlightTarget(){ if (!targeting) return; const f = targeting.foes[targeting.idx]; Render.setHover(f ? f.y*L.w + f.x : -1); }
  function cancelTargeting(){ targeting = null; $('targetbar').hidden = true; Render.setHover(-1); update(); }
  function fireAt(x, y){
    const t = targeting; if (!t) return;
    cancelTargeting();
    const h = G.hero;
    if (x === h.x && y === h.y){ if (t.kind === 'throw'){ log('You can\'t throw at yourself.', 'warn'); } return; }
    const m = mobAt(L, x, y); if (m) V.lastTarget = m.id;
    const it = t.it;
    if (!findItem(it.id) && !(STACKABLE[it.k])) return;
    if (t.kind === 'throw') act(() => throwItem(it, x, y));
    else if (t.kind === 'zap') act(() => zapWand(it, x, y));
    else act(() => shootBow(it, x, y));
  }
  function useQuick(i){
    if (!G || G.over) return;
    const it = quickItem(i);
    if (!it){ openInventory(); return; }
    if (targeting && targeting.slot === i){ const f = targeting.foes[targeting.idx]; if (f) fireAt(f.x, f.y); else cancelTargeting(); return; }
    if (targeting) cancelTargeting();
    switch (it.k){
      case 'missile': case 'potion': if (it.k === 'potion' && (POTIONS[it.t].good || !isTypeKnown(it)) ) { act(() => drinkPotion(it)); return; } startTargeting('throw', it, i); return;
      case 'wand': startTargeting('zap', it, i); return;
      case 'weapon': if (WEAPONS[it.t].staff){ startTargeting('zap', it, i); return; } break;
      case 'bow': startTargeting('shoot', it, i); return;
      case 'cloak': act(() => toggleCloak(it)); return;
      case 'scroll': act(() => readScroll(it)); return;
      case 'food': act(() => heroEat(it)); return;
    }
    selId = it.id; openInventory();
  }

  // ---------- movement / auto-walk ----------
  function findPath(tx, ty, toAdjacent, allowTraps){
    const h = G.hero, W = L.w;
    const goal = ty*W + tx;
    const n = W*L.h;
    const from = new Int32Array(n).fill(-1); const q = new Int32Array(n); let qh = 0, qt = 0;
    const s = h.y*W + h.x; from[s] = s; q[qt++] = s;
    const passable = (c) => {
      const t = L.tiles[c];
      if (!L.visited[c]) return false;
      if (t === T.LOCKED) return (h.keys[G.depth] || 0) > 0;
      if (!TP.pass[t]) return false;
      if ((t === T.EXIT || t === T.ENTRANCE) && c !== goal) return false;
      const tr = L.traps[c]; if (!allowTraps && tr && tr.active && !tr.hidden && c !== goal && !h.buffs.levit) return false;
      const x = c % W, y = (c / W) | 0; const m = mobAt(L, x, y); if (m && V.fov[c] && !m.ally && c !== goal) return false;
      return true;
    };
    let found = -1;
    while (qh < qt){
      const c = q[qh++];
      if (c === goal || (toAdjacent && c !== s && cheb(c % W, (c/W)|0, tx, ty) <= 1 && diagOK(L, c % W, (c/W)|0, tx, ty))){ found = c; break; }
      const x = c % W, y = (c / W) | 0;
      for (const [dx, dy] of DIRS8){
        const nx = x+dx, ny = y+dy; if (nx < 0 || ny < 0 || nx >= W || ny >= L.h) continue;
        const m = ny*W + nx; if (from[m] >= 0) continue;
        if (!passable(m) && !(m === goal && !toAdjacent && L.visited[m] && (TP.pass[L.tiles[m]] || L.tiles[m] === T.LOCKED))) continue;
        if (dx && dy && !diagOK(L, x, y, nx, ny)) continue;
        from[m] = c; q[qt++] = m;
      }
    }
    if (found < 0) return null;
    const p = []; for (let c = found; c !== s; c = from[c]) p.push(c);
    return p.reverse();
  }
  function walkTo(x, y, chase){
    const toAdj = !!chase;
    const p = findPath(x, y, toAdj) || findPath(x, y, toAdj, true);
    if (!p){ if (!toAdj) log('You can\'t find a way there.', 'info'); return false; }
    if (!p.length && chase){ tryAttack(chase); return true; }
    path = { cells: p, chase: chase ? chase.id : null };
    prevFoes = new Set(visibleFoes().map(m => m.id)); prevHP = G.hero.hp;
    pathTimer = 0;
    stepPath();
    return true;
  }
  function stopAuto(){ path = null; resting = false; }
  function tryAttack(m){
    const h = G.hero;
    if (canReach(h, m)) { act(() => heroAttack(m)); return true; }
    return false;
  }
  function stepPath(){
    if (!path || heroBusy()) return;
    const h = G.hero;
    if (path.chase){
      const m = L.mobs.find(o => o.id === path.chase);
      if (!m || !V.fov[m.y*L.w + m.x]){ path = null; return; }
      if (canReach(h, m)){ path = null; tryAttack(m); return; }
      const np = findPath(m.x, m.y, true) || findPath(m.x, m.y, true, true); if (!np || !np.length){ path = null; return; } path.cells = np;
    }
    if (!path.cells.length){ path = null; return; }
    const c = path.cells[0];
    const tr = L.traps[c];
    if (tr && tr.active && !tr.hidden && !h.buffs.levit && (path.cells.length > 1 || path.chase)){ path = null; log('A trap blocks the way. Step onto it yourself if you are sure.', 'warn'); return; }
    path.cells.shift();
    const nx = c % L.w, ny = (c / L.w) | 0;
    const dx = nx - h.x, dy = ny - h.y;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1){ path = null; return; }
    const ok = act(() => heroMove(dx, dy));
    if (!ok){ path = null; return; }
    if (L.tiles[c] === T.DOOR && false) {}
    // interrupts
    const foes = visibleFoes();
    const newFoe = foes.some(m => !prevFoes.has(m.id) && m.state !== 'sleeping');
    for (const m of foes) prevFoes.add(m.id);
    if (G.hero.hp < prevHP || newFoe || G.over || V.busy || !$('modal').hidden){ if (path && !path.chase) path = null; }
    if (path && path.chase && G.hero.hp < prevHP - 0){ /* keep chasing */ }
    prevHP = G.hero.hp;
    if (path && !path.cells.length && !path.chase) path = null;
  }
  function moveDir(i){
    if (!G || G.over || !$('modal').hidden) return;
    if (targeting) cancelTargeting();
    stopAuto();
    const now = performance.now();
    if (now - lastAct < 95) return;
    lastAct = now;
    const k = (i - Render.yawIndex() + 8) % 8;
    const [dx, dy] = DIRS8[k];
    act(() => heroMove(dx, dy));
  }
  function cellClick(x, y){
    if (!G || G.over || heroBusy()) return;
    if (targeting){ fireAt(x, y); return; }
    stopAuto();
    const h = G.hero;
    if (!inb(L, x, y)) return;
    const c = y*L.w + x;
    if (x === h.x && y === h.y){
      if (L.heaps[c] && L.heaps[c].length){ const heap = L.heaps[c]; if (heap.some(i => i.price)) openBuy(c); else act(() => { pickupAt(c); return 1; }); return; }
      if (L.tiles[c] === T.EXIT){ V.pendingStairs = 'down'; act(() => 0.0001); return; }
      if (L.tiles[c] === T.ENTRANCE && G.depth > 1){ V.pendingStairs = 'up'; act(() => 0.0001); return; }
      act(heroWait); return;
    }
    const m = mobAt(L, x, y);
    if (m && (V.fov[c])){
      if (m.type === 'keeper'){ if (cheb(x, y, h.x, h.y) <= 1) openSell(); else walkTo(x, y, m); return; }
      if (!m.ally){ if (!tryAttack(m)) walkTo(x, y, m); return; }
    }
    if (cheb(x, y, h.x, h.y) === 1 && !(m && !m.ally) && (act(() => heroMove(x - h.x, y - h.y)) || x === h.x || y === h.y)) return; // a blocked diagonal step (e.g. into a doorway) falls through to pathing
    walkTo(x, y);
  }
  function attackNearest(){
    const f = visibleFoes()[0];
    if (!f){ log('No enemies in sight.', 'info'); return; }
    if (!tryAttack(f)) walkTo(f.x, f.y, f);
  }
  function rest(){
    if (!G || G.over || heroBusy()) return;
    if (visibleFoes().some(m => m.state === 'hunting')){ log('You can\'t rest with enemies nearby.', 'warn'); return; }
    resting = true; restCount = 0; prevHP = G.hero.hp;
    log('You rest for a while...', 'info');
  }
  function tick(dt){
    renderLog();
    if (!G || G.over) return;
    if (!$('modal').hidden || V.busy) return;
    if (path){ pathTimer -= dt; if (pathTimer <= 0){ pathTimer = 0.115; stepPath(); } }
    else if (resting){
      for (let i = 0; i < 3 && resting; i++){
        if (heroBusy()) break;
        const h = G.hero;
        if (h.hp >= h.ht && !h.buffs.poison){ resting = false; log('You feel rested.', 'good'); break; }
        if (h.hunger >= 450 || visibleFoes().some(m => m.state !== 'sleeping') || restCount > 400 || h.hp < prevHP){ resting = false; if (visibleFoes().length) log('Something is coming. You stop resting.', 'warn'); break; }
        prevHP = h.hp;
        act(heroWait); restCount++;
      }
    }
    else if (heldDir !== null && performance.now() - lastAct > 140) moveDir(heldDir);
  }

  // ---------- input binding ----------
  const KEYDIR = { ArrowUp:0, KeyW:0, Numpad8:0, KeyK:0, ArrowRight:2, KeyD:2, Numpad6:2, KeyL:2, ArrowDown:4, KeyS:4, Numpad2:4, KeyJ:4, ArrowLeft:6, KeyA:6, Numpad4:6, KeyH:6,
    Numpad9:1, KeyU:1, Numpad3:3, KeyN:3, Numpad1:5, KeyB:5, Numpad7:7, KeyY:7 };
  function bind(){
    const view = $('view');
    window.addEventListener('keydown', (e) => {
      Sound.unlock();
      const modalOpen = !$('modal').hidden;
      if (!$('title').hidden){ if (modalOpen && e.code === 'Escape') closeWindow(); return; }
      if (e.code === 'Escape'){ e.preventDefault(); if (modalOpen) closeWindow(); else if (targeting) cancelTargeting(); else if (path || resting) stopAuto(); else if (G && !G.over) openMenu(); return; }
      if (modalOpen){ if (e.code === 'KeyI' && !chooseCB) closeWindow(); return; }
      if (!G || G.over) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (KEYDIR[e.code] !== undefined){ e.preventDefault(); if (!e.repeat){ heldDir = KEYDIR[e.code]; lastAct = 0; moveDir(KEYDIR[e.code]); } return; }
      switch (e.code){
        case 'Space': case 'Period': case 'Numpad5': e.preventDefault(); stopAuto(); if (targeting) cancelTargeting(); act(heroWait); break;
        case 'KeyZ': rest(); break;
        case 'KeyI': openInventory(); break;
        case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': useQuick(Number(e.code.slice(5)) - 1); break;
        case 'Tab': e.preventDefault(); if (targeting && targeting.foes.length){ targeting.idx = (targeting.idx + 1) % targeting.foes.length; highlightTarget(); } break;
        case 'Enter': case 'NumpadEnter': if (targeting){ const f = targeting.foes[targeting.idx]; if (f) fireAt(f.x, f.y); } break;
        case 'KeyQ': Render.rotate(Math.PI/2); break;
        case 'KeyE': Render.rotate(-Math.PI/2); break;
        case 'Equal': case 'NumpadAdd': Render.zoom(0.85); break;
        case 'Minus': case 'NumpadSubtract': Render.zoom(1.18); break;
        case 'KeyF': attackNearest(); break;
        case 'KeyC': openHeroInfo(); break;
        case 'KeyG': case 'Comma': { const c = G.hero.y*L.w + G.hero.x; if (L.heaps[c]) cellClick(G.hero.x, G.hero.y); break; }
        case 'Slash': case 'F1': e.preventDefault(); openHelp(); break;
      }
      if (e.key === '>' || e.key === '<'){ const c = G.hero.y*L.w + G.hero.x; if (L.tiles[c] === T.EXIT || L.tiles[c] === T.ENTRANCE) cellClick(G.hero.x, G.hero.y); }
    });
    window.addEventListener('keyup', (e) => { if (KEYDIR[e.code] === heldDir) heldDir = null; });
    window.addEventListener('blur', () => { heldDir = null; });
    view.addEventListener('contextmenu', e => e.preventDefault());
    view.addEventListener('pointerdown', (e) => {
      Sound.unlock();
      view.setPointerCapture(e.pointerId);
      pointer.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointer.touches.size === 2){ const [a, b] = [...pointer.touches.values()]; pointer.pinch = Math.hypot(a.x - b.x, a.y - b.y); pointer.moved = true; clearTimeout(pointer.longT); return; }
      pointer.down = true; pointer.button = e.button; pointer.sx = pointer.x = e.clientX; pointer.sy = pointer.y = e.clientY; pointer.moved = false;
      clearTimeout(pointer.longT);
      if (e.pointerType !== 'mouse') pointer.longT = setTimeout(() => { if (!pointer.moved && pointer.down){ pointer.down = false; const p = Render.pick(pointer.sx, pointer.sy); if (p) examine(p.x, p.y); } }, 520);
    });
    view.addEventListener('pointermove', (e) => {
      if (pointer.touches.has(e.pointerId)) pointer.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointer.touches.size === 2){
        const [a, b] = [...pointer.touches.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pointer.pinch) Render.zoom(pointer.pinch / d); pointer.pinch = d; return;
      }
      if (pointer.down){
        const dx = e.clientX - pointer.x;
        if (Math.hypot(e.clientX - pointer.sx, e.clientY - pointer.sy) > 10) { pointer.moved = true; clearTimeout(pointer.longT); }
        if (pointer.moved) Render.rotate(-dx * 0.008);
        pointer.x = e.clientX; pointer.y = e.clientY;
      } else if (e.pointerType === 'mouse' && G && L && !targeting){
        const p = Render.pick(e.clientX, e.clientY);
        Render.setHover(p ? p.y*L.w + p.x : -1);
      } else if (targeting && e.pointerType === 'mouse'){ const p = Render.pick(e.clientX, e.clientY); if (p) Render.setHover(p.y*L.w + p.x); }
    });
    const up = (e) => {
      pointer.touches.delete(e.pointerId);
      clearTimeout(pointer.longT);
      if (pointer.touches.size < 2) pointer.pinch = 0;
      if (!pointer.down) return;
      pointer.down = false;
      if (pointer.moved){ Render.snapYaw(); return; }
      const p = Render.pick(e.clientX, e.clientY);
      if (!p) return;
      if (pointer.button === 2){ examine(p.x, p.y); return; }
      cellClick(p.x, p.y);
    };
    view.addEventListener('pointerup', up);
    view.addEventListener('pointercancel', (e) => { pointer.touches.delete(e.pointerId); pointer.down = false; clearTimeout(pointer.longT); });
    view.addEventListener('wheel', (e) => { e.preventDefault(); Render.zoom(e.deltaY > 0 ? 1.1 : 0.9); }, { passive: false });
    $('b-wait').addEventListener('click', () => { stopAuto(); if (targeting) cancelTargeting(); act(heroWait); });
    $('b-rest').addEventListener('click', rest);
    $('b-inv').addEventListener('click', openInventory);
    document.querySelectorAll('.qs').forEach(b => b.addEventListener('click', () => useQuick(Number(b.dataset.q))));
    $('menubtn').addEventListener('click', openMenu);
    $('portrait').addEventListener('click', openHeroInfo);
    $('rotl').addEventListener('click', () => Render.rotate(Math.PI/2));
    $('rotr').addEventListener('click', () => Render.rotate(-Math.PI/2));
    $('zin').addEventListener('click', () => Render.zoom(0.85));
    $('zout').addEventListener('click', () => Render.zoom(1.18));
    $('enemyind').addEventListener('click', (e) => { const b = e.target.closest('.foe'); if (!b) return; const m = L.mobs.find(o => o.id === Number(b.dataset.id)); if (m){ if (!tryAttack(m)) walkTo(m.x, m.y, m); } });
    $('modal').addEventListener('pointerdown', (e) => { if (e.target.id === 'modal') closeWindow(); });
    $('hud').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) b.blur(); });
    drawIconTo($('b-wait').querySelector('canvas'), 'ui:search');
    drawIconTo($('b-rest').querySelector('canvas'), 'ui:rest');
    drawIconTo($('b-inv').querySelector('canvas'), 'ui:bag');
  }
  function portrait(){ if (G) drawIconTo($('portraitc'), 'hero:' + G.hero.cls); }
  return { update, logChanged, toast, fade, openWindow, closeWindow, openInventory, chooseItem, openBuy, openSell, openHelp, openMenu, endScreen, examine, tick, bind, cellClick, useQuick, portrait, stopAuto, get targeting(){ return targeting; }, walkTo };
})();
// ============================================================
// SOUND (tiny procedural synth)
// ============================================================
const Sound = (() => {
  let ctx = null, master = null, muted = false;
  try { muted = localStorage.getItem('pd3d_mute') === '1'; } catch (e) {}
  const last = {};
  function unlock(){
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = 0.22; master.connect(ctx.destination); } catch (e) { ctx = null; }
  }
  function tone(f0, f1, dur, type, vol, delay){
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, hp, delay){
    const t = ctx.currentTime + (delay || 0);
    const n = Math.floor(ctx.sampleRate * dur); const buf = ctx.createBuffer(1, n, ctx.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random()*2 - 1) * (1 - i/n);
    const s = ctx.createBufferSource(); s.buffer = buf; const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 800;
    const g = ctx.createGain(); g.gain.value = vol || 0.3; s.connect(f); f.connect(g); g.connect(master); s.start(t);
  }
  const S = {
    swing: () => noise(0.08, 0.25, 2500), swing2: () => noise(0.09, 0.2, 1500), miss: () => noise(0.06, 0.12, 4000),
    hurt: () => { tone(220, 90, 0.18, 'sawtooth', 0.22); noise(0.1, 0.2, 600); }, kill: () => tone(330, 80, 0.2, 'square', 0.15),
    death: () => { tone(300, 40, 1.0, 'sawtooth', 0.3); tone(200, 30, 1.2, 'square', 0.2, 0.1); },
    pickup: () => { tone(660, 990, 0.08, 'square', 0.15); }, gold: () => { tone(1320, 1320, 0.06, 'square', 0.12); tone(1760, 1760, 0.1, 'square', 0.12, 0.06); },
    level: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, f, 0.14, 'square', 0.16, i*0.09)); },
    drink: () => { for (let i = 0; i < 3; i++) tone(400 + i*80, 300, 0.07, 'sine', 0.2, i*0.08); }, read: () => noise(0.25, 0.15, 3000),
    eat: () => { for (let i = 0; i < 3; i++) noise(0.05, 0.25, 1200, i*0.1); }, equip: () => tone(500, 700, 0.08, 'triangle', 0.2),
    zap: () => tone(1200, 200, 0.22, 'sawtooth', 0.15), throw: () => noise(0.12, 0.12, 2000), bow: () => tone(900, 300, 0.1, 'triangle', 0.18),
    shatter: () => { noise(0.2, 0.3, 3000); tone(2000, 3000, 0.05, 'sine', 0.1); }, trap: () => { tone(880, 440, 0.15, 'square', 0.2); tone(660, 330, 0.2, 'square', 0.15, 0.1); },
    secret: () => { tone(784, 784, 0.1, 'triangle', 0.16); tone(1046, 1046, 0.14, 'triangle', 0.16, 0.1); }, unlock: () => { tone(300, 600, 0.06, 'square', 0.2); noise(0.08, 0.2, 2000, 0.05); },
    boss: () => { tone(110, 55, 1.0, 'sawtooth', 0.3); tone(165, 82, 1.0, 'sawtooth', 0.2); }, boom: () => { noise(0.5, 0.5, 100); tone(120, 40, 0.5, 'sine', 0.4); },
    descend: () => { tone(400, 100, 0.4, 'triangle', 0.2); }
  };
  return {
    get muted(){ return muted; },
    unlock,
    toggle(){ muted = !muted; try { localStorage.setItem('pd3d_mute', muted ? '1' : '0'); } catch (e) {} },
    play(name){
      if (muted || !ctx || ctx.state !== 'running' || !S[name]) return;
      const now = performance.now(); if (last[name] && now - last[name] < 45) return; last[name] = now;
      try { S[name](); } catch (e) {}
    }
  };
})();

// ============================================================
// SAVE / LOAD / RUNS
// ============================================================
const DEMO_MAX_DEPTH = 26; // 26 is the Amulet floor (no stairs down), so the full game is open // demo ships region 1 only; raise as each 5-floor region passes testing
const saveKey = () => 'pd3d_save_v1:' + Auth.user(), rankKey = () => 'pd3d_ranks_v1:' + Auth.user();
const ARR_KEYS = ['tiles','visited','fire','toxic','para','frost','web'];
function packLevel(Lv){
  const o = Object.assign({}, Lv);
  o.tiles = Array.from(Lv.tiles, v => String.fromCharCode(48 + v)).join('');
  o.visited = Array.from(Lv.visited).join('');
  for (const k of ['fire','toxic','para','frost']){ const sp = {}; Lv[k].forEach((v, i) => { if (v > 0) sp[i] = Math.round(v*10)/10; }); o[k] = sp; }
  const wb = []; Lv.web.forEach((v, i) => { if (v) wb.push(i); }); o.web = wb;
  return o;
}
function unpackLevel(o){
  const n = o.w*o.h; const Lv = Object.assign({}, o);
  Lv.tiles = new Uint8Array(n); for (let i = 0; i < n; i++) Lv.tiles[i] = o.tiles.charCodeAt(i) - 48;
  Lv.visited = new Uint8Array(n); for (let i = 0; i < n; i++) Lv.visited[i] = o.visited.charCodeAt(i) - 48;
  for (const k of ['fire','toxic','para','frost']){ Lv[k] = new Float32Array(n); for (const i in o[k]) Lv[k][i] = o[k][i]; }
  Lv.web = new Uint8Array(n); for (const i of o.web) Lv.web[i] = 1;
  return Lv;
}
function serialize(){
  const levels = {}; for (const d in G.levels) levels[d] = packLevel(G.levels[d]);
  return JSON.stringify(Object.assign({}, G, { levels }));
}
function saveGame(){
  if (!G || G.over) return;
  try { localStorage.setItem(saveKey(), serialize()); } catch (e) {}
}
function loadSave(str){
  const o = JSON.parse(str);
  for (const d in o.levels) o.levels[d] = unpackLevel(o.levels[d]);
  return o;
}
function hasSave(){ try { return !!localStorage.getItem(saveKey()); } catch (e) { return false; } }
function deleteSave(){ try { localStorage.removeItem(saveKey()); } catch (e) {} }
function scoreOf(){ const h = G.hero; return Math.round(G.stats.gold + h.lvl * G.stats.deepest * 100 + G.stats.kills * 10 + (V.won ? 25000 : 0)); }
function endRun(won, quiet){
  deleteSave();
  try {
    const r = JSON.parse(localStorage.getItem(rankKey()) || '[]');
    r.push({ cls: G.hero.cls, lvl: G.hero.lvl, depth: G.stats.deepest, won: !!won, cause: G.deathCause || '', score: scoreOf(), date: Date.now() });
    r.sort((a, b) => b.score - a.score); localStorage.setItem(rankKey(), JSON.stringify(r.slice(0, 10)));
  } catch (e) {}
  if (won) UI.toast('Victory!', 'The Amulet of Yendor is yours');
  setTimeout(() => { if (quiet) showTitle(); else UI.endScreen(!!won); }, quiet ? 50 : (won ? 1800 : 1500));
}
function startGameFrom(state){
  G = state;
  L = G.levels[G.depth];
  V.log = []; V.fov = null; V.pendingStairs = null; V.pendingBuy = null; V.busy = false; V.needProcess = false; V.won = false; V.dmapCache.clear(); V.lastSave = G.stats.turns;
  Render.resetAll();
  updateFOV();
  Render.buildLevel(L);
  Render.sync(true);
  UI.portrait();
  document.getElementById('hud').hidden = false;
  document.getElementById('title').hidden = true;
  UI.update();
}
function newGame(cls){
  G = { v: 1, seed: (Math.random()*2147483647)>>>0, nid: 0, depth: 1, cls, envTime: 0, limited: { sou: 0, pos: 0 },
    known: { potion:{}, scroll:{}, ring:{} }, looks: { potion:{}, scroll:{}, ring:{}, wand:{} }, levels: {},
    stats: { kills: 0, gold: 0, deepest: 1, turns: 0, start: Date.now() }, quick: [null, null, null, null], over: false };
  const pc = R.shuffle(Object.keys(POTION_COLORS)); Object.keys(POTIONS).forEach((k, i) => G.looks.potion[k] = pc[i]);
  const sr = R.shuffle(SCROLL_RUNES.slice()); Object.keys(SCROLLS).forEach((k, i) => G.looks.scroll[k] = sr[i]);
  const rg = R.shuffle(Object.keys(RING_GEMS)); Object.keys(RINGS).forEach((k, i) => G.looks.ring[k] = rg[i]);
  Object.keys(WANDS).forEach(k => G.looks.wand[k] = R.int(WAND_WOOD.length));
  const h = createHero(cls);
  G.levels[1] = generateLevel(1);
  L = G.levels[1]; L.entered = true;
  h.x = L.entrance % L.w; h.y = (L.entrance / L.w) | 0;
  startGameFrom(G);
  log('You descend into the Sewers beneath the city. Find the Amulet of Yendor, far below.', 'mag');
  log('Press ? for controls. Tap or click to move.', 'info');
  UI.toast('Sewers', 'Floor 1');
  saveGame();
}
function showTitle(){
  const t = document.getElementById('title');
  document.getElementById('hud').hidden = true;
  UI.closeWindow();
  if (!Auth.user()){ showLogin(t); if (!G || G.over) demoBackground(); return; }
  let ranks = [];
  try { ranks = JSON.parse(localStorage.getItem(rankKey()) || '[]'); } catch (e) {}
  const save = hasSave();
  let chosen = 'warrior';
  t.innerHTML = `<div class="logo"><div class="l1">Pixel Dungeon<br><em>3D</em></div><div class="l2">A roguelike descent</div></div>
    <div class="card panel">
      ${save ? `<div class="row" style="justify-content:center;margin-bottom:12px"><button class="btn primary" id="tcont">Continue your run</button></div><h3 style="text-align:center">Or start over</h3>` : `<h3>Choose your hero</h3>`}
      <div class="classes">${Object.keys(CLASSES).map(k => `<button class="cls ${k === chosen ? 'sel' : ''}" data-c="${k}"><canvas width="16" height="16"></canvas><b>${CLASSES[k].name}</b><span>${esc(CLASSES[k].desc)}</span></button>`).join('')}</div>
      <div class="row" style="justify-content:space-between;margin-top:14px"><span class="row"><button class="btn" id="thelp">How to play</button><button class="btn" id="tout" title="Signed in as ${esc(Auth.displayName())}">Sign out</button></span><button class="btn ${save ? '' : 'primary'}" id="tstart">${save ? 'New run (replaces save)' : 'Enter the dungeon'}</button></div>
      ${ranks.length ? `<h3>Best runs</h3><div class="stats" style="max-width:none;grid-template-columns:1fr auto auto">${ranks.slice(0, 5).map(r => `<span>${CLASSES[r.cls].name} lv ${r.lvl}, ${r.won ? 'claimed the Amulet' : 'floor ' + r.depth + (r.cause ? ', ' + esc(r.cause) : '')}</span><span></span><span>${r.score}</span>`).join('')}</div>` : ''}
    </div>
    <p class="credit">A 3D fork of <a href="https://github.com/00-evan/shattered-pixel-dungeon" target="_blank" rel="noopener">Shattered Pixel Dungeon</a> by Evan Debenham, itself based on <a href="https://github.com/watabou/pixel-dungeon" target="_blank" rel="noopener">Pixel Dungeon</a> by Watabou. Free software under the GPLv3. Game rules follow the original source; all art here is generated procedurally. Not affiliated with Shattered Pixel.</p>`;
  t.hidden = false;
  t.querySelectorAll('.cls').forEach(b => {
    drawIconTo(b.querySelector('canvas'), 'hero:' + b.dataset.c);
    b.addEventListener('click', () => { chosen = b.dataset.c; t.querySelectorAll('.cls').forEach(x => x.classList.toggle('sel', x === b)); });
    b.addEventListener('dblclick', () => { Sound.unlock(); newGame(b.dataset.c); });
  });
  t.querySelector('#tstart').addEventListener('click', () => { Sound.unlock(); newGame(chosen); });
  t.querySelector('#thelp').addEventListener('click', () => UI.openHelp());
  t.querySelector('#tout').addEventListener('click', () => { Auth.signOut(); showTitle(); });
  const tc = t.querySelector('#tcont');
  if (tc){ tc.addEventListener('click', () => { Sound.unlock(); try { startGameFrom(loadSave(localStorage.getItem(saveKey()))); log('Welcome back. You are on floor ' + G.depth + '.', 'info'); } catch (e) { console.error(e); deleteSave(); showTitle(); } }); tc.focus(); }
  // background scene: preview level behind the title
  if (!G || G.over){ demoBackground(); }
}
function showLogin(t){
  t.innerHTML = `<div class="logo"><div class="l1">Pixel Dungeon<br><em>3D</em></div><div class="l2">A roguelike descent</div></div>
    <form class="panel narrow" id="authf" autocomplete="on">
      <h3>Sign in to save your runs</h3>
      <label class="fld">Username<input name="u" autocomplete="username" required minlength="3" maxlength="20" pattern="[A-Za-z0-9_]+"></label>
      <label class="fld">Password<input name="p" type="password" autocomplete="current-password" required minlength="6"></label>
      <p class="err" id="autherr" role="alert"></p>
      <div class="row" style="justify-content:space-between;margin-top:10px"><button class="btn" type="submit" value="up">Create account</button><button class="btn primary" type="submit" value="in">Sign in</button></div>
      <p class="note">Demo accounts live in this browser only. Online saves come with the full release.</p>
    </form>`;
  t.hidden = false;
  const f = t.querySelector('#authf');
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const err = f.querySelector('#autherr'), btns = f.querySelectorAll('button');
    btns.forEach(b => b.disabled = true); err.textContent = '';
    try { await (e.submitter && e.submitter.value === 'up' ? Auth.signUp : Auth.signIn)(f.u.value, f.p.value); showTitle(); }
    catch (x) { err.textContent = x.message; btns.forEach(b => b.disabled = false); }
  });
  f.u.focus();
}
function demoBackground(){
  const prevG = G;
  G = { v: 1, seed: 1234, nid: 0, depth: 1, cls: 'warrior', envTime: 0, limited: { sou: 99, pos: 99 }, known: { potion:{}, scroll:{}, ring:{} }, looks: { potion:{}, scroll:{}, ring:{}, wand:{} }, levels: {}, stats: { kills:0, gold:0, deepest:1, turns:0 }, quick: [null,null,null,null], over: true, demo: true };
  const pc = Object.keys(POTION_COLORS); Object.keys(POTIONS).forEach((k, i) => G.looks.potion[k] = pc[i]);
  Object.keys(SCROLLS).forEach((k, i) => G.looks.scroll[k] = SCROLL_RUNES[i]);
  const rg = Object.keys(RING_GEMS); Object.keys(RINGS).forEach((k, i) => G.looks.ring[k] = rg[i]);
  const depth = [1, 7, 12, 17, 22][Math.floor(Math.random()*5)];
  createHero('warrior');
  G.depth = depth;
  L = generateLevel(depth); G.levels[depth] = L;
  G.hero.x = L.entrance % L.w; G.hero.y = (L.entrance / L.w) | 0;
  for (let i = 0; i < L.visited.length; i++) L.visited[i] = 1;
  V.fov = new Uint8Array(L.w*L.h); computeFOV(L, G.hero.x, G.hero.y, 8, V.fov);
  Render.resetAll(); Render.buildLevel(L); Render.sync(true);
  V.demoSpin = true;
}

// ============================================================
// BOOT & LOOP
// ============================================================
let lastT = 0;
function loop(now){
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - lastT) / 1000 || 0.016); lastT = now;
  try {
    if (G && !G.over && V.needProcess && !V.busy){ processTurns(); updateFOV(); Render.sync(); UI.update(); }
    if (G && G.demo){ Render.cam.yawT += dt * 0.08; }
    UI.tick(dt);
    Render.frame(dt, now / 1000);
  } catch (e) { console.error(e); }
}
function boot(data){
  const cv = document.getElementById('view');
  if (typeof THREE === 'undefined'){ document.getElementById('loading').textContent = 'Could not load the 3D engine. Check your connection and reload.'; return; }
  Render.init(cv);
  UI.bind();
  document.getElementById('loading').hidden = true;
  if (data && data.save){ try { startGameFrom(loadSave(data.save)); } catch (e) { showTitle(); } }
  else showTitle();
  requestAnimationFrame(loop);
  document.addEventListener('visibilitychange', () => { if (document.hidden && G && !G.over && !G.demo) saveGame(); });
  window.addEventListener('pagehide', () => { if (G && !G.over && !G.demo) saveGame(); });
}
window.__pd = { get G(){ return G; }, get L(){ return L; }, V, act, heroMove, heroWait, newGame, UI, Render, processTurns, findItem, zapWand, throwItem, readScroll, drinkPotion, changeLevel, serialize, loadSave, startGameFrom };
boot({});
