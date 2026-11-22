import json, sys, collections
d = json.load(open(sys.argv[1]))
out = []
W = out.append
def esc(s): return (s or '').replace('|', '\\|').replace('$', '.')
chars, items = d['chars'], d['items']

# ---------------- characters: grouping and notes ----------------
def char_group(c):
    f, n = c['file'], c['full']
    if n == 'Hero': return 'hero'
    if 'BOSS' in c['props'] or 'MINIBOSS' in c['props'] or n.split('$')[0] in ('DwarfKing', 'YogDzewa', 'YogFist', 'Tengu', 'Goo', 'DM300', 'Pylon') or n.startswith(('YogDzewa$', 'YogFist$', 'DwarfKing$')):
        return 'boss'
    if '/mobs/npcs/' in f or n in ('Shopkeeper', 'ImpShopkeeper'): return 'npc'
    if n.startswith('Vault') or '/vault/' in f: return 'vault'
    if not f.startswith('actors/mobs/'): return 'ally'
    return 'mob'
def clips(c):
    base = ['idle', 'walk', 'attack', 'die']
    if c['zap']: base.append('cast')
    if c['full'] == 'Hero': base = ['idle', 'walk', 'attack', 'cast', 'operate', 'die', 'read']
    return ', '.join(base)
def flags(c):
    f = []
    if 'BOSS' in c['props']: f.append('Boss')
    if 'MINIBOSS' in c['props']: f.append('Mini-boss')
    if 'LARGE' in c['props']: f.append('Large')
    if c['flying']: f.append('Flying')
    if 'IMMOVABLE' in c['props'] or 'STATIC' in c['props']: f.append('Stationary')
    for p in ('UNDEAD', 'DEMONIC', 'INORGANIC', 'FIERY', 'ICY', 'ACIDIC', 'ELECTRIC'):
        if p in c['props']: f.append(p.capitalize())
    return ', '.join(f)

# ---------------- header and spec ----------------
counts = collections.Counter(char_group(c) for c in chars)
W('# 3D asset list and specification')
W('')
W('Everything the 3D view of this game needs, generated from the game code (`core/src/main/java/...`). Nothing here is invented: every row is a class, constant or enum value that exists in the code, so if an asset is missing from this list, the game never shows it.')
W('')
W('Regenerate after code changes: `python3 docs/tools/scan_assets.py` then `python3 docs/tools/write_asset_doc.py` (see the end of this file).')
W('')
W('## Totals')
W('')
W('| Group | Count | Notes |')
W('|---|---|---|')
W(f"| Heroes | 6 classes × 7 armour looks | one rigged body per class plus 7 armour sets; see Heroes |")
W(f"| Monsters | {counts['mob']} | regular enemies |")
W(f"| Bosses, mini-bosses and their minions | {counts['boss']} | |")
W(f"| NPCs | {counts['npc']} | shopkeepers, quest givers |")
W(f"| Vault quest characters | {counts['vault']} | |")
W(f"| Allies and summons | {counts['ally']} | from hero abilities, wands, artifacts, traps |")
W(f"| Items | {len(items)} classes | fewer models: potions, scrolls and rings share look sets; see Items |")
W(f"| Terrain pieces | {len(d['terrain'])} terrain types × 5 regions + 2 special areas | modular tile kit; see Terrain |")
W(f"| Special level set pieces | {len(d['tilemaps'])} | boss arenas, quest rooms |")
W(f"| Traps | {len(d['traps'])} | each with an active and a used (inactive) look |")
W(f"| Plants | {len(d['plants'])} | |")
W(f"| Item heaps and containers | {len(d['heaps'])} heap types | chests, tombs, bones, shop stands |")
W(f"| Gases and fields (VFX) | {len(d['blobs'])} | particle/texture work, not meshes |")
W(f"| Spell projectiles, effects, particles (VFX) | {len(d['missiles'])} + {len(d['effects'])} + {len(d['particles'])} + {len(d['specks'])} | particle/texture work, not meshes |")
W('')
W('## 1. Technical specification')
W('')
W('### File format')
W('- **glTF 2.0 binary (`.glb`)**, one file per asset, textures embedded. It is the open standard for real-time 3D; libGDX (via gdx-gltf), three.js, Godot and Unity all import it, so the assets survive a change of engine.')
W('- Export from Blender with the built-in glTF exporter (Format: glTF Binary, +Y Up, Apply Modifiers on, Animation on).')
W('- Not accepted: `.fbx`, `.obj`, `.blend`, `.max` as deliverables (fine as your working files; keep them, they are the editable source).')
W('')
W('### Scale, orientation, pivot')
W('- **1 unit = 1 tile.** A tile is a 1 × 1 square on the floor.')
W('- **+Y is up. The model faces +Z** (glTF convention). +X is the model\'s left.')
W('- **Pivot (origin) at the centre of the footprint, on the floor** (y = 0) for everything: characters stand on it, items lie on it, tile pieces sit on it. Flying creatures keep the origin on the floor and are modelled hovering above it.')
W('- **Characters:** a normal human-sized character is about **0.9 units tall** and fits inside one tile (about 0.6 wide). Small creatures (rats, snakes, bees) 0.25–0.5. Characters flagged *Large* may be up to 1.4 tall and 1.3 wide. Bosses may be up to 2.5 tall and 2 wide; the code still treats most of them as occupying one tile, so keep their base no wider than 2 tiles.')
W('- **Items on the floor:** fit in a 0.5 × 0.5 square, at most 0.4 tall. The same item models are reused as hand-held props (weapons, wands) and thrown projectiles.')
W('- **Tile pieces:** footprint exactly −0.5..0.5 in X and Z. Walls are full blocks **1.0 tall** (keep this constant across all regions). Floors sit on y = 0. Water surface at y = −0.1, chasm drops to at least y = −2.')
W('')
W('### Budgets (web and mid-range phones)')
W('| Asset | Triangles | Texture |')
W('|---|---|---|')
W('| Hero body (per class) | 1,500–3,000 | 512² |')
W('| Armour set (per tier) | 300–1,000 | shares the hero texture layout or its own 256–512² |')
W('| Monster / NPC | 300–2,000 | 256–512² |')
W('| Boss | 2,000–6,000 | 1024² |')
W('| Item | 50–300 | 128–256² (or one shared item atlas) |')
W('| Tile piece | 12–400 | one 512² or 1024² atlas per region kit |')
W('| Whole visible scene | ≤ 150,000 | |')
W('')
W('### Textures and materials')
W('- PNG, power-of-two sizes, embedded in the `.glb`.')
W('- **Base colour only** is enough. Optional: emissive map for glowing parts (eyes, crystals, fire). No normal or roughness maps needed; skip them unless the style requires it.')
W('- glTF metallic-roughness material with metallic 0, roughness 1 unless something is meant to be shiny.')
W('- **Opaque or alpha-mask (cutout) only** for characters, items and tiles. Alpha *blending* (semi-transparent) only for ghosts, water and effects, and say so in the file name (`_alpha`).')
W('- One material per asset where possible (draw-call budget). Region tile kits should share one texture atlas.')
W('- Pick one visual style for everything before production (for example hand-painted low-poly, or voxel, or toon) and keep it consistent across all assets.')
W('')
W('### Rigging')
W('- Skeletal animation (skinning) is supported. **At most 32 bones, at most 4 bone influences per vertex.**')
W('- **All humanoids share one skeleton** (heroes, and humanoid monsters/NPCs where practical) so armour, weapons and animations can be reused. Required named bones: `root`, `hips`, `spine`, `chest`, `head`, `upperarm_L/R`, `forearm_L/R`, `hand_L`, `hand_R`, `thigh_L/R`, `shin_L/R`, `foot_L/R`.')
W('- **Attachment points** as empty nodes: `grip_R` (main weapon, child of `hand_R`), `grip_L` (off-hand/shield), `back` (bow, cloak), `head_top` (hats, helmets).')
W('- Held props (weapons, wands, staffs) get an empty node named `grip` at the point where the hand closes; the engine snaps `grip` to `grip_R`.')
W('')
W('### Animation clips (in the same `.glb`, exact names)')
W('| Clip | Loop | Length | Notes |')
W('|---|---|---|---|')
W('| `idle` | yes | 1–3 s | subtle; must loop seamlessly |')
W('| `walk` | yes | one full step cycle, ~0.4 s | **in place, no root motion**; the game moves the model one tile per step in ~0.15 s |')
W('| `attack` | no | 0.3–0.5 s | the hit lands at **50 %** of the clip (the game applies damage then) |')
W('| `cast` | no | 0.3–0.6 s | ranged/magic attack; projectile leaves at 50 %; only where the table says so |')
W('| `die` | no | 0.5–1 s | ends in its final pose (lying down, collapsed, faded) |')
W('| `operate` | no | ~0.4 s | heroes only: using doors, items, digging |')
W('| `read` | no | ~0.6 s | heroes only: reading a scroll |')
W('| extra clips | | | where noted per character (e.g. a boss charging or summoning) |')
W('- 30 fps keyframes. No physics, no shape keys required.')
W('')
W('### Naming and delivery')
W('- File names use the code class name, so they map 1:1 to the game: `char_Rat.glb`, `char_DwarfKing.DKGhoul.glb` (nested classes use a dot), `hero_Warrior.glb`, `armor_t3.glb`, `item_Sword.glb`, `tile_sewers_WALL.glb`, `trap_AlarmTrap.glb`, `plant_Sungrass.glb`.')
W('- Folder layout: `assets3d/heroes/`, `assets3d/characters/`, `assets3d/items/`, `assets3d/tiles/<region>/`, `assets3d/setpieces/`, `assets3d/traps/`, `assets3d/plants/`, `assets3d/vfx/`.')
W('- Before handing over, open each file in a glTF viewer (for example the gltf-viewer by Don McCurdy, or Blender re-import) and check: scale (stands on y = 0, about the right height next to a 1 × 1 cube), faces +Z, clip names exact, no missing textures.')
W('')
W('### Suggested production order')
W('1. **Playable first region:** Warrior hero + armour tiers 0–2, the sewer tile kit, sewer monsters and Goo, sewer traps, all plants, the most common items (gold, food, potion and scroll looks, keys, starting weapons).')
W('2. Remaining heroes and armour tiers.')
W('3. One region at a time: prison, caves, city, halls, each with its kit, monsters, boss and set pieces.')
W('4. Vault and mining quest areas, remaining items, VFX.')
W('')

# ---------------- heroes ----------------
W('## 2. Heroes')
W('')
W('The hero model changes with the class and with the armour worn (`Hero.tier()`): 0 none, 1 cloth, 2 leather, 3 mail, 4 scale, 5 plate, 6 class armour.')
W('')
W('**Recommended:** one rigged body per class (`hero_<Class>.glb`), plus 7 armour sets rigged to the shared skeleton (`armor_t0`..`armor_t6`, where t0 is the class\'s plain clothes) that the engine swaps on the body. If you prefer full per-tier variants, that is 6 × 7 = 42 hero models.')
W('')
W('| Class | File | Clips |')
W('|---|---|---|')
for cl in ['Warrior', 'Mage', 'Rogue', 'Huntress', 'Duelist', 'Cleric']:
    W(f"| {cl} | `hero_{cl}.glb` | idle, walk, attack, cast, operate, read, die |")
W('')
W('| Armour tier | File | Covers |')
W('|---|---|---|')
for i, nm in enumerate(['none (class clothes)', 'cloth', 'leather', 'mail', 'scale', 'plate', 'class armour (end-game)']):
    W(f"| {i} | `armor_t{i}.glb` | {nm} |")
W('')
W('The hero also holds the equipped weapon (the item model, by its `grip` node) and can be disguised as another class (uses that class\'s body).')
W('')

# ---------------- characters ----------------
titles = [('mob', '3. Monsters'), ('boss', '4. Bosses, mini-bosses and minions'), ('npc', '5. NPCs'), ('vault', '6. Vault quest characters'), ('ally', '7. Allies and summons')]
for g, title in titles:
    rows = [c for c in chars if char_group(c) == g]
    W(f'## {title}')
    W('')
    W('| Class (code) | File | Flags | Clips | Code file |')
    W('|---|---|---|---|---|')
    for c in rows:
        nm = c['full'].replace('$', '.')
        W(f"| {nm} | `char_{nm}.glb` | {flags(c)} | {clips(c)} | `{c['file']}` |")
    W('')
W('Variants of one class (for example `Elemental.FireElemental` vs `Elemental.FrostElemental`, or the six `YogFist` kinds) need distinct looks, but can share a mesh with different textures where that reads clearly.')
W('')

# ---------------- terrain ----------------
NOTES = {
 'CHASM': 'hole in the floor; edge pieces going down into darkness', 'EMPTY': 'plain floor', 'GRASS': 'floor with short grass (decal or tufts)',
 'EMPTY_WELL': 'dry well', 'WALL': 'full wall block', 'DOOR': 'closed door in a doorway (blocks sight; opens when walked through)',
 'OPEN_DOOR': 'open door', 'ENTRANCE': 'stairs up (where you arrive)', 'ENTRANCE_SP': 'stairs up, special/alternate look', 'EXIT': 'stairs down',
 'EMBERS': 'scorched floor', 'LOCKED_DOOR': 'locked door (needs a key)', 'HERO_LKD_DR': 'door locked behind the hero (skeleton key)',
 'CRYSTAL_DOOR': 'crystal door (needs a crystal key)', 'PEDESTAL': 'pedestal (item display)', 'WALL_DECO': 'wall block with decoration',
 'BARRICADE': 'wooden barricade (burnable)', 'EMPTY_SP': 'special floor (room accent)', 'HIGH_GRASS': 'tall grass (blocks sight, trampled when walked)',
 'FURROWED_GRASS': 'trampled tall grass', 'SECRET_DOOR': 'looks exactly like WALL until found', 'SECRET_TRAP': 'looks exactly like EMPTY until found',
 'TRAP': 'floor under a visible trap (the trap itself: section 10)', 'INACTIVE_TRAP': 'floor under a used trap', 'EMPTY_DECO': 'decorated floor',
 'LOCKED_EXIT': 'stairs down, sealed (boss not beaten)', 'UNLOCKED_EXIT': 'stairs down, unsealed', 'WELL': 'magic well (water of health/awareness)',
 'BOOKSHELF': 'bookshelf (wall-like, burnable)', 'ALCHEMY': 'alchemy pot', 'CUSTOM_DECO_EMPTY': 'floor used by set pieces', 'CUSTOM_DECO': 'set-piece decoration (solid)',
 'CUSTOM_DECO_WTR': 'set-piece decoration over water', 'STATUE': 'statue (solid, doesn\'t block sight)', 'STATUE_SP': 'statue, special look',
 'REGION_DECO': 'region-specific decoration (solid)', 'REGION_DECO_ALT': 'region-specific decoration, alternate', 'MINE_CRYSTAL': 'mining quest crystal (minable)',
 'MINE_BOULDER': 'mining quest boulder (minable)', 'WATER': 'shallow water (animated surface)'}
W('## 8. Terrain (modular tile kit)')
W('')
W('The map is a grid; every cell has one terrain type (`levels/Terrain.java`). Each region needs its own kit of the pieces below in its own style, sharing one texture atlas: **sewers** (floors 1–5), **prison** (6–10), **caves** (11–15), **city** (16–20), **halls** (21–26). The **mining** quest area (`MiningLevel`) and the **vault** quest area (`VaultLevel`) reuse the caves and their own looks.')
W('')
W('Walls are placed per cell and must join seamlessly with neighbouring wall blocks on all four sides. If you want shaped wall pieces instead of plain blocks, add: straight, outer corner, inner corner, end, T-junction, cross, and pillar (the engine picks by neighbours).')
W('')
W('| Terrain (code) | Id | Piece | File (per region) |')
W('|---|---|---|---|')
for n, v in sorted(d['terrain'], key=lambda x: x[1]):
    W(f"| {n} | {v} | {NOTES.get(n, '')} | `tile_<region>_{n}.glb` |")
W('')
W('Plus per region: 2–3 floor variants to break repetition, and a water shoreline edge if the style needs one.')
W('')
W('Levels in the code (each uses its region kit plus the set pieces in section 9):')
W('')
for l in d['levels']:
    W(f"- `{l['full']}` (`{l['file']}`)")
W('')

# ---------------- set pieces ----------------
W('## 9. Special set pieces (boss arenas, quest rooms)')
W('')
W('These are hand-placed visuals in the code (`CustomTilemap` subclasses): boss arena floors and walls, quest room decorations. Each is one set piece, usually spanning several tiles; the code file shows its size and placement.')
W('')
W('| Set piece (code) | File | Code file |')
W('|---|---|---|')
for t in d['tilemaps']:
    nm = t['full'].replace('$', '.')
    W(f"| {nm} | `setpiece_{nm}.glb` | `{t['file']}` |")
W('')

# ---------------- traps ----------------
W('## 10. Traps')
W('')
W('Each trap is a plate in the floor, about 0.7 × 0.7, flush with the floor. Needs two looks: **active** and **used** (inactive, after triggering). The code gives each trap a colour and a symbol shape (`Trap.color`, `Trap.shape`) so players can tell them apart; keep that distinction readable in 3D.')
W('')
W('| Trap (code) | Colour (code) | Symbol (code) | File |')
W('|---|---|---|---|')
for t in d['traps']:
    nm = t['full'].replace('$', '.')
    W(f"| {nm} | {t['color'] or 'inherited'} | {t['shape'] or 'inherited'} | `trap_{nm}.glb` (+ `_used`) |")
W('')

# ---------------- plants ----------------
W('## 11. Plants')
W('')
W('Small plant on one tile, at most 0.5 tall; trampling triggers its effect and removes it. Their seeds are items (section 13).')
W('')
W('| Plant (code) | File |')
W('|---|---|')
for p in d['plants']:
    nm = p['full'].replace('$', '.')
    W(f"| {nm} | `plant_{nm}.glb` |")
W('')

# ---------------- heaps ----------------
W('## 12. Item heaps and containers')
W('')
W('How items lie on a tile (`Heap.Type`). A plain heap shows its top item (section 13); the others are containers.')
W('')
HN = {'HEAP': 'loose items on the floor: no model, shows the item', 'FOR_SALE': 'shop display: small stand or mat under the item',
      'CHEST': 'wooden chest', 'LOCKED_CHEST': 'locked chest (needs a golden key)', 'CRYSTAL_CHEST': 'crystal chest (contents visible)',
      'TOMB': 'stone tomb', 'SKELETON': 'skeleton remains', 'REMAINS': 'remains of a past hero (bones and a bag)'}
W('| Heap type | Model | File |')
W('|---|---|---|')
for h in d['heaps']:
    h = h.strip()
    if h: W(f"| {h} | {HN.get(h, '')} | `heap_{h}.glb` |")
W('')

# ---------------- items ----------------
W('## 13. Items')
W('')
W('Every concrete item class in the code, grouped by package. **Image** is the 2D sprite id the item uses (`sprites/ItemSpriteSheet.java`); items sharing an image can share a model.')
W('')
W('**Look sets instead of per-type models:** unidentified potions, scrolls and rings look random each game, so they need one model per *look*, not per type:')
sheet = d['sheet']
pot = [s for s in sheet if s.startswith('POTION_') and s not in ('POTION_HOLDER',) and s.split('_')[1] in ('CRIMSON','AMBER','GOLDEN','JADE','TURQUOISE','AZURE','INDIGO','MAGENTA','BISTRE','CHARCOAL','SILVER','IVORY')]
exo = [s for s in sheet if s.startswith('EXOTIC_') and s[7:] in ('CRIMSON','AMBER','GOLDEN','JADE','TURQUOISE','AZURE','INDIGO','MAGENTA','BISTRE','CHARCOAL','SILVER','IVORY')]
runes = [s for s in sheet if s.startswith('SCROLL_') and s[7:] in ('KAUNAN','SOWILO','LAGUZ','YNGVI','GYFU','RAIDO','ISAZ','MANNAZ','NAUDIZ','BERKANAN','ODAL','TIWAZ')]
xrunes = [s for s in sheet if s.startswith('EXOTIC_') and s[7:] in ('KAUNAN','SOWILO','LAGUZ','YNGVI','GYFU','RAIDO','ISAZ','MANNAZ','NAUDIZ','BERKANAN','ODAL','TIWAZ')]
gems = [s for s in sheet if s.startswith('RING_') and s[5:] in ('GARNET','RUBY','TOPAZ','EMERALD','ONYX','OPAL','TOURMALINE','SAPPHIRE','AMETHYST','QUARTZ','AGATE','DIAMOND')]
W(f"- Potions: {len(pot)} flask looks ({', '.join(p[7:].lower() for p in pot)}) → `item_potion_<colour>.glb`")
W(f"- Exotic potions: {len(exo)} flask looks in the same colours, a different flask shape → `item_exotic_potion_<colour>.glb`")
W(f"- Scrolls: {len(runes)} rune looks ({', '.join(r[7:].lower() for r in runes)}) → `item_scroll_<rune>.glb`")
W(f"- Exotic scrolls: {len(xrunes)} rune looks, a different scroll style → `item_exotic_scroll_<rune>.glb`")
W(f"- Rings: {len(gems)} gem looks ({', '.join(g[5:].lower() for g in gems)}) → `item_ring_<gem>.glb`")
W('- Once identified, the game shows the item\'s name and an icon in the 2D interface, so no per-type 3D model is needed for these three families.')
W('')
groups = collections.OrderedDict()
for it in items:
    parts = it['file'].split('/')
    g = '/'.join(parts[1:-1]) or 'items (misc)'
    groups.setdefault(g, []).append(it)
for g in sorted(groups):
    rows = groups[g]
    W(f"### `{g}` ({len(rows)})")
    W('')
    W('| Item (code) | Image (code) | File |')
    W('|---|---|---|')
    for it in rows:
        nm = it['full'].replace('$', '.')
        img = it['image'] or 'inherited or set at runtime'
        fam = ''
        if g in ('potions', 'potions/exotic') or g == 'scrolls' or g == 'scrolls/exotic' or (g == 'rings' and nm != 'Ring'):
            fam = ' (uses the look set above)'
        W(f"| {nm} | {img}{fam} | `item_{nm}.glb` |")
    W('')

# ---------------- VFX ----------------
W('## 14. Visual effects (particles and textures, not meshes)')
W('')
W('Effects are better built as particle systems and textured sprites than as meshes. For these, deliver **PNG textures** (power of two, 64–256 px, transparent background) and a short description of the motion; the engine builds the particles. Until replaced, the game draws its existing 2D effects projected into the 3D view.')
W('')
W(f"**Gases and fields** (`actors/blobs`, {len(d['blobs'])}): volumes covering tiles, e.g. toxic gas, fire, web, regrowth.")
W('')
for b in d['blobs']:
    W(f"- {b['full'].replace('$', '.')}")
W('')
W(f"**Spell projectiles** (`effects/MagicMissile.java`, {len(d['missiles'])} types; bolts and cones fired by wands, staffs and monsters):")
W('')
W(', '.join(d['missiles']))
W('')
W(f"**Small effect symbols** (`effects/Speck.java`, {len(d['specks'])} types; hearts, coins, notes, sparks and so on):")
W('')
W(', '.join(s for s in d['specks'] if s != 'SPECK'))
W('')
W(f"**Effect classes** (`effects/`, {len(d['effects'])}):")
W('')
W(', '.join(d['effects']))
W('')
W(f"**Particle types** (`effects/particles/`, {len(d['particles'])}):")
W('')
W(', '.join(d['particles']))
W('')
W('## 15. Not needed')
W('')
W('- The interface (toolbar, windows, health bar, inventory icons, buttons, fonts, damage numbers, status icons) stays 2D, drawn on top of the 3D view.')
W('- Title screen, hero select splashes and other menus stay 2D.')
W('')
W('## Regenerating this file')
W('')
W('Both scripts read the code only. From the repository root:')
W('')
W('```bash')
W('python3 docs/tools/scan_assets.py core/src/main/java/com/shatteredpixel/shatteredpixeldungeon > /tmp/assets.json')
W('```')
W('```bash')
W('python3 docs/tools/write_asset_doc.py /tmp/assets.json > docs/3D_ASSETS.md')
W('```')
print('\n'.join(out))
