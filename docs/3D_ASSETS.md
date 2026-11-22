# 3D asset list and specification

Everything the 3D view of this game needs, generated from the game code (`core/src/main/java/...`). Nothing here is invented: every row is a class, constant or enum value that exists in the code, so if an asset is missing from this list, the game never shows it.

Regenerate after code changes: `python3 docs/tools/scan_assets.py` then `python3 docs/tools/write_asset_doc.py` (see the end of this file).

## Totals

| Group | Count | Notes |
|---|---|---|
| Heroes | 6 classes × 7 armour looks | one rigged body per class plus 7 armour sets; see Heroes |
| Monsters | 56 | regular enemies |
| Bosses, mini-bosses and their minions | 34 | |
| NPCs | 15 | shopkeepers, quest givers |
| Vault quest characters | 10 | |
| Allies and summons | 14 | from hero abilities, wands, artifacts, traps |
| Items | 335 classes | fewer models: potions, scrolls and rings share look sets; see Items |
| Terrain pieces | 40 terrain types × 5 regions + 2 special areas | modular tile kit; see Terrain |
| Special level set pieces | 44 | boss arenas, quest rooms |
| Traps | 35 | each with an active and a used (inactive) look |
| Plants | 15 | |
| Item heaps and containers | 8 heap types | chests, tombs, bones, shop stands |
| Gases and fields (VFX) | 30 | particle/texture work, not meshes |
| Spell projectiles, effects, particles (VFX) | 33 + 34 + 24 + 37 | particle/texture work, not meshes |

## 1. Technical specification

### File format
- **glTF 2.0 binary (`.glb`)**, one file per asset, textures embedded. It is the open standard for real-time 3D; libGDX (via gdx-gltf), three.js, Godot and Unity all import it, so the assets survive a change of engine.
- Export from Blender with the built-in glTF exporter (Format: glTF Binary, +Y Up, Apply Modifiers on, Animation on).
- Not accepted: `.fbx`, `.obj`, `.blend`, `.max` as deliverables (fine as your working files; keep them, they are the editable source).

### Scale, orientation, pivot
- **1 unit = 1 tile.** A tile is a 1 × 1 square on the floor.
- **+Y is up. The model faces +Z** (glTF convention). +X is the model's left.
- **Pivot (origin) at the centre of the footprint, on the floor** (y = 0) for everything: characters stand on it, items lie on it, tile pieces sit on it. Flying creatures keep the origin on the floor and are modelled hovering above it.
- **Characters:** a normal human-sized character is about **0.9 units tall** and fits inside one tile (about 0.6 wide). Small creatures (rats, snakes, bees) 0.25–0.5. Characters flagged *Large* may be up to 1.4 tall and 1.3 wide. Bosses may be up to 2.5 tall and 2 wide; the code still treats most of them as occupying one tile, so keep their base no wider than 2 tiles.
- **Items on the floor:** fit in a 0.5 × 0.5 square, at most 0.4 tall. The same item models are reused as hand-held props (weapons, wands) and thrown projectiles.
- **Tile pieces:** footprint exactly −0.5..0.5 in X and Z. Walls are full blocks **1.0 tall** (keep this constant across all regions). Floors sit on y = 0. Water surface at y = −0.1, chasm drops to at least y = −2.

### Budgets (web and mid-range phones)
| Asset | Triangles | Texture |
|---|---|---|
| Hero body (per class) | 1,500–3,000 | 512² |
| Armour set (per tier) | 300–1,000 | shares the hero texture layout or its own 256–512² |
| Monster / NPC | 300–2,000 | 256–512² |
| Boss | 2,000–6,000 | 1024² |
| Item | 50–300 | 128–256² (or one shared item atlas) |
| Tile piece | 12–400 | one 512² or 1024² atlas per region kit |
| Whole visible scene | ≤ 150,000 | |

### Textures and materials
- PNG, power-of-two sizes, embedded in the `.glb`.
- **Base colour only** is enough. Optional: emissive map for glowing parts (eyes, crystals, fire). No normal or roughness maps needed; skip them unless the style requires it.
- glTF metallic-roughness material with metallic 0, roughness 1 unless something is meant to be shiny.
- **Opaque or alpha-mask (cutout) only** for characters, items and tiles. Alpha *blending* (semi-transparent) only for ghosts, water and effects, and say so in the file name (`_alpha`).
- One material per asset where possible (draw-call budget). Region tile kits should share one texture atlas.
- Pick one visual style for everything before production (for example hand-painted low-poly, or voxel, or toon) and keep it consistent across all assets.

### Rigging
- Skeletal animation (skinning) is supported. **At most 32 bones, at most 4 bone influences per vertex.**
- **All humanoids share one skeleton** (heroes, and humanoid monsters/NPCs where practical) so armour, weapons and animations can be reused. Required named bones: `root`, `hips`, `spine`, `chest`, `head`, `upperarm_L/R`, `forearm_L/R`, `hand_L`, `hand_R`, `thigh_L/R`, `shin_L/R`, `foot_L/R`.
- **Attachment points** as empty nodes: `grip_R` (main weapon, child of `hand_R`), `grip_L` (off-hand/shield), `back` (bow, cloak), `head_top` (hats, helmets).
- Held props (weapons, wands, staffs) get an empty node named `grip` at the point where the hand closes; the engine snaps `grip` to `grip_R`.

### Animation clips (in the same `.glb`, exact names)
| Clip | Loop | Length | Notes |
|---|---|---|---|
| `idle` | yes | 1–3 s | subtle; must loop seamlessly |
| `walk` | yes | one full step cycle, ~0.4 s | **in place, no root motion**; the game moves the model one tile per step in ~0.15 s |
| `attack` | no | 0.3–0.5 s | the hit lands at **50 %** of the clip (the game applies damage then) |
| `cast` | no | 0.3–0.6 s | ranged/magic attack; projectile leaves at 50 %; only where the table says so |
| `die` | no | 0.5–1 s | ends in its final pose (lying down, collapsed, faded) |
| `operate` | no | ~0.4 s | heroes only: using doors, items, digging |
| `read` | no | ~0.6 s | heroes only: reading a scroll |
| extra clips | | | where noted per character (e.g. a boss charging or summoning) |
- 30 fps keyframes. No physics, no shape keys required.

### Naming and delivery
- File names use the code class name, so they map 1:1 to the game: `char_Rat.glb`, `char_DwarfKing.DKGhoul.glb` (nested classes use a dot), `hero_Warrior.glb`, `armor_t3.glb`, `item_Sword.glb`, `tile_sewers_WALL.glb`, `trap_AlarmTrap.glb`, `plant_Sungrass.glb`.
- Folder layout: `assets3d/heroes/`, `assets3d/characters/`, `assets3d/items/`, `assets3d/tiles/<region>/`, `assets3d/setpieces/`, `assets3d/traps/`, `assets3d/plants/`, `assets3d/vfx/`.
- Before handing over, open each file in a glTF viewer (for example the gltf-viewer by Don McCurdy, or Blender re-import) and check: scale (stands on y = 0, about the right height next to a 1 × 1 cube), faces +Z, clip names exact, no missing textures.

### Suggested production order
1. **Playable first region:** Warrior hero + armour tiers 0–2, the sewer tile kit, sewer monsters and Goo, sewer traps, all plants, the most common items (gold, food, potion and scroll looks, keys, starting weapons).
2. Remaining heroes and armour tiers.
3. One region at a time: prison, caves, city, halls, each with its kit, monsters, boss and set pieces.
4. Vault and mining quest areas, remaining items, VFX.

## 2. Heroes

The hero model changes with the class and with the armour worn (`Hero.tier()`): 0 none, 1 cloth, 2 leather, 3 mail, 4 scale, 5 plate, 6 class armour.

**Recommended:** one rigged body per class (`hero_<Class>.glb`), plus 7 armour sets rigged to the shared skeleton (`armor_t0`..`armor_t6`, where t0 is the class's plain clothes) that the engine swaps on the body. If you prefer full per-tier variants, that is 6 × 7 = 42 hero models.

| Class | File | Clips |
|---|---|---|
| Warrior | `hero_Warrior.glb` | idle, walk, attack, cast, operate, read, die |
| Mage | `hero_Mage.glb` | idle, walk, attack, cast, operate, read, die |
| Rogue | `hero_Rogue.glb` | idle, walk, attack, cast, operate, read, die |
| Huntress | `hero_Huntress.glb` | idle, walk, attack, cast, operate, read, die |
| Duelist | `hero_Duelist.glb` | idle, walk, attack, cast, operate, read, die |
| Cleric | `hero_Cleric.glb` | idle, walk, attack, cast, operate, read, die |

| Armour tier | File | Covers |
|---|---|---|
| 0 | `armor_t0.glb` | none (class clothes) |
| 1 | `armor_t1.glb` | cloth |
| 2 | `armor_t2.glb` | leather |
| 3 | `armor_t3.glb` | mail |
| 4 | `armor_t4.glb` | scale |
| 5 | `armor_t5.glb` | plate |
| 6 | `armor_t6.glb` | class armour (end-game) |

The hero also holds the equipped weapon (the item model, by its `grip` node) and can be disguised as another class (uses that class's body).

## 3. Monsters

| Class (code) | File | Flags | Clips | Code file |
|---|---|---|---|---|
| Acidic | `char_Acidic.glb` | Acidic | idle, walk, attack, die, cast | `actors/mobs/Acidic.java` |
| Albino | `char_Albino.glb` |  | idle, walk, attack, die | `actors/mobs/Albino.java` |
| ArmoredBrute | `char_ArmoredBrute.glb` |  | idle, walk, attack, die | `actors/mobs/ArmoredBrute.java` |
| ArmoredStatue | `char_ArmoredStatue.glb` |  | idle, walk, attack, die | `actors/mobs/ArmoredStatue.java` |
| Bandit | `char_Bandit.glb` |  | idle, walk, attack, die | `actors/mobs/Bandit.java` |
| Bat | `char_Bat.glb` | Flying | idle, walk, attack, die | `actors/mobs/Bat.java` |
| Bee | `char_Bee.glb` | Flying | idle, walk, attack, die | `actors/mobs/Bee.java` |
| Brute | `char_Brute.glb` |  | idle, walk, attack, die | `actors/mobs/Brute.java` |
| CausticSlime | `char_CausticSlime.glb` | Acidic | idle, walk, attack, die | `actors/mobs/CausticSlime.java` |
| Crab | `char_Crab.glb` |  | idle, walk, attack, die | `actors/mobs/Crab.java` |
| CrystalMimic | `char_CrystalMimic.glb` |  | idle, walk, attack, die | `actors/mobs/CrystalMimic.java` |
| CrystalWisp | `char_CrystalWisp.glb` | Flying, Inorganic | idle, walk, attack, die, cast | `actors/mobs/CrystalWisp.java` |
| DM100 | `char_DM100.glb` | Inorganic, Electric | idle, walk, attack, die, cast | `actors/mobs/DM100.java` |
| DM200 | `char_DM200.glb` | Large, Inorganic | idle, walk, attack, die, cast | `actors/mobs/DM200.java` |
| DM201 | `char_DM201.glb` | Stationary | idle, walk, attack, die, cast | `actors/mobs/DM201.java` |
| EbonyMimic | `char_EbonyMimic.glb` |  | idle, walk, attack, die | `actors/mobs/EbonyMimic.java` |
| Elemental.AllyNewBornElemental | `char_Elemental.AllyNewBornElemental.glb` |  | idle, walk, attack, die | `actors/mobs/Elemental.java` |
| Elemental.ChaosElemental | `char_Elemental.ChaosElemental.glb` |  | idle, walk, attack, die | `actors/mobs/Elemental.java` |
| Elemental.FireElemental | `char_Elemental.FireElemental.glb` | Fiery | idle, walk, attack, die | `actors/mobs/Elemental.java` |
| Elemental.FrostElemental | `char_Elemental.FrostElemental.glb` | Icy | idle, walk, attack, die | `actors/mobs/Elemental.java` |
| Elemental.ShockElemental | `char_Elemental.ShockElemental.glb` | Electric | idle, walk, attack, die | `actors/mobs/Elemental.java` |
| Eye | `char_Eye.glb` | Flying, Demonic | idle, walk, attack, die, cast | `actors/mobs/Eye.java` |
| FungalSpinner | `char_FungalSpinner.glb` |  | idle, walk, attack, die, cast | `actors/mobs/FungalSpinner.java` |
| Ghoul | `char_Ghoul.glb` | Undead | idle, walk, attack, die | `actors/mobs/Ghoul.java` |
| Gnoll | `char_Gnoll.glb` |  | idle, walk, attack, die | `actors/mobs/Gnoll.java` |
| GnollExile | `char_GnollExile.glb` |  | idle, walk, attack, die | `actors/mobs/GnollExile.java` |
| GnollGuard | `char_GnollGuard.glb` |  | idle, walk, attack, die | `actors/mobs/GnollGuard.java` |
| GoldenMimic | `char_GoldenMimic.glb` |  | idle, walk, attack, die | `actors/mobs/GoldenMimic.java` |
| Golem | `char_Golem.glb` | Large, Inorganic | idle, walk, attack, die, cast | `actors/mobs/Golem.java` |
| Guard | `char_Guard.glb` | Undead | idle, walk, attack, die | `actors/mobs/Guard.java` |
| HermitCrab | `char_HermitCrab.glb` |  | idle, walk, attack, die | `actors/mobs/HermitCrab.java` |
| Mimic | `char_Mimic.glb` | Demonic | idle, walk, attack, die | `actors/mobs/Mimic.java` |
| Monk | `char_Monk.glb` | Undead | idle, walk, attack, die | `actors/mobs/Monk.java` |
| Necromancer | `char_Necromancer.glb` | Undead | idle, walk, attack, die, cast | `actors/mobs/Necromancer.java` |
| Necromancer.NecroSkeleton | `char_Necromancer.NecroSkeleton.glb` |  | idle, walk, attack, die | `actors/mobs/Necromancer.java` |
| PhantomPiranha | `char_PhantomPiranha.glb` |  | idle, walk, attack, die | `actors/mobs/PhantomPiranha.java` |
| Piranha | `char_Piranha.glb` |  | idle, walk, attack, die | `actors/mobs/Piranha.java` |
| Rat | `char_Rat.glb` |  | idle, walk, attack, die | `actors/mobs/Rat.java` |
| RipperDemon | `char_RipperDemon.glb` | Undead, Demonic | idle, walk, attack, die | `actors/mobs/RipperDemon.java` |
| Scorpio | `char_Scorpio.glb` | Demonic | idle, walk, attack, die, cast | `actors/mobs/Scorpio.java` |
| Senior | `char_Senior.glb` |  | idle, walk, attack, die | `actors/mobs/Senior.java` |
| Shaman.BlueShaman | `char_Shaman.BlueShaman.glb` |  | idle, walk, attack, die | `actors/mobs/Shaman.java` |
| Shaman.PurpleShaman | `char_Shaman.PurpleShaman.glb` |  | idle, walk, attack, die | `actors/mobs/Shaman.java` |
| Shaman.RedShaman | `char_Shaman.RedShaman.glb` |  | idle, walk, attack, die | `actors/mobs/Shaman.java` |
| Skeleton | `char_Skeleton.glb` | Undead, Inorganic | idle, walk, attack, die | `actors/mobs/Skeleton.java` |
| Slime | `char_Slime.glb` |  | idle, walk, attack, die | `actors/mobs/Slime.java` |
| Snake | `char_Snake.glb` |  | idle, walk, attack, die | `actors/mobs/Snake.java` |
| SpectralNecromancer | `char_SpectralNecromancer.glb` |  | idle, walk, attack, die, cast | `actors/mobs/SpectralNecromancer.java` |
| Spinner | `char_Spinner.glb` |  | idle, walk, attack, die, cast | `actors/mobs/Spinner.java` |
| Statue | `char_Statue.glb` | Inorganic | idle, walk, attack, die | `actors/mobs/Statue.java` |
| Succubus | `char_Succubus.glb` | Demonic | idle, walk, attack, die | `actors/mobs/Succubus.java` |
| Swarm | `char_Swarm.glb` | Flying | idle, walk, attack, die | `actors/mobs/Swarm.java` |
| Thief | `char_Thief.glb` | Undead | idle, walk, attack, die | `actors/mobs/Thief.java` |
| TormentedSpirit | `char_TormentedSpirit.glb` |  | idle, walk, attack, die | `actors/mobs/TormentedSpirit.java` |
| Warlock | `char_Warlock.glb` | Undead | idle, walk, attack, die, cast | `actors/mobs/Warlock.java` |
| Wraith | `char_Wraith.glb` | Flying, Undead, Inorganic | idle, walk, attack, die | `actors/mobs/Wraith.java` |

## 4. Bosses, mini-bosses and minions

| Class (code) | File | Flags | Clips | Code file |
|---|---|---|---|---|
| CrystalGuardian | `char_CrystalGuardian.glb` | Mini-boss, Inorganic | idle, walk, attack, die | `actors/mobs/CrystalGuardian.java` |
| CrystalSpire | `char_CrystalSpire.glb` | Boss, Stationary, Inorganic | idle, walk, attack, die, cast | `actors/mobs/CrystalSpire.java` |
| DM300 | `char_DM300.glb` | Boss, Large, Inorganic | idle, walk, attack, die, cast | `actors/mobs/DM300.java` |
| DemonSpawner | `char_DemonSpawner.glb` | Mini-boss, Stationary, Demonic | idle, walk, attack, die | `actors/mobs/DemonSpawner.java` |
| DwarfKing | `char_DwarfKing.glb` | Boss, Stationary, Undead | idle, walk, attack, die | `actors/mobs/DwarfKing.java` |
| DwarfKing.DKGhoul | `char_DwarfKing.DKGhoul.glb` |  | idle, walk, attack, die | `actors/mobs/DwarfKing.java` |
| DwarfKing.DKGolem | `char_DwarfKing.DKGolem.glb` |  | idle, walk, attack, die | `actors/mobs/DwarfKing.java` |
| DwarfKing.DKMonk | `char_DwarfKing.DKMonk.glb` |  | idle, walk, attack, die | `actors/mobs/DwarfKing.java` |
| DwarfKing.DKWarlock | `char_DwarfKing.DKWarlock.glb` |  | idle, walk, attack, die | `actors/mobs/DwarfKing.java` |
| Elemental.NewbornFireElemental | `char_Elemental.NewbornFireElemental.glb` | Mini-boss | idle, walk, attack, die | `actors/mobs/Elemental.java` |
| FetidRat | `char_FetidRat.glb` | Mini-boss, Demonic | idle, walk, attack, die | `actors/mobs/FetidRat.java` |
| FungalCore | `char_FungalCore.glb` | Boss, Stationary | idle, walk, attack, die, cast | `actors/mobs/FungalCore.java` |
| FungalSentry | `char_FungalSentry.glb` | Mini-boss, Stationary | idle, walk, attack, die, cast | `actors/mobs/FungalSentry.java` |
| GnollGeomancer | `char_GnollGeomancer.glb` | Boss, Stationary | idle, walk, attack, die, cast | `actors/mobs/GnollGeomancer.java` |
| GnollSapper | `char_GnollSapper.glb` | Mini-boss | idle, walk, attack, die, cast | `actors/mobs/GnollSapper.java` |
| GnollTrickster | `char_GnollTrickster.glb` | Mini-boss | idle, walk, attack, die | `actors/mobs/GnollTrickster.java` |
| Goo | `char_Goo.glb` | Boss, Demonic, Acidic | idle, walk, attack, die | `actors/mobs/Goo.java` |
| GreatCrab | `char_GreatCrab.glb` | Mini-boss | idle, walk, attack, die | `actors/mobs/GreatCrab.java` |
| Pylon | `char_Pylon.glb` | Mini-boss, Stationary, Inorganic, Electric | idle, walk, attack, die | `actors/mobs/Pylon.java` |
| RotHeart | `char_RotHeart.glb` | Mini-boss, Stationary | idle, walk, attack, die | `actors/mobs/RotHeart.java` |
| RotLasher | `char_RotLasher.glb` | Mini-boss, Stationary | idle, walk, attack, die | `actors/mobs/RotLasher.java` |
| Tengu | `char_Tengu.glb` | Boss | idle, walk, attack, die, cast | `actors/mobs/Tengu.java` |
| YogDzewa | `char_YogDzewa.glb` | Boss, Stationary, Demonic | idle, walk, attack, die | `actors/mobs/YogDzewa.java` |
| YogDzewa.Larva | `char_YogDzewa.Larva.glb` | Demonic | idle, walk, attack, die | `actors/mobs/YogDzewa.java` |
| YogDzewa.YogEye | `char_YogDzewa.YogEye.glb` |  | idle, walk, attack, die | `actors/mobs/YogDzewa.java` |
| YogDzewa.YogRipper | `char_YogDzewa.YogRipper.glb` |  | idle, walk, attack, die | `actors/mobs/YogDzewa.java` |
| YogDzewa.YogScorpio | `char_YogDzewa.YogScorpio.glb` |  | idle, walk, attack, die | `actors/mobs/YogDzewa.java` |
| YogFist.BrightFist | `char_YogFist.BrightFist.glb` | Electric | idle, walk, attack, die | `actors/mobs/YogFist.java` |
| YogFist.BurningFist | `char_YogFist.BurningFist.glb` | Fiery | idle, walk, attack, die | `actors/mobs/YogFist.java` |
| YogFist.DarkFist | `char_YogFist.DarkFist.glb` |  | idle, walk, attack, die | `actors/mobs/YogFist.java` |
| YogFist.RottingFist | `char_YogFist.RottingFist.glb` | Acidic | idle, walk, attack, die | `actors/mobs/YogFist.java` |
| YogFist.RustedFist | `char_YogFist.RustedFist.glb` | Large, Inorganic | idle, walk, attack, die | `actors/mobs/YogFist.java` |
| YogFist.SoiledFist | `char_YogFist.SoiledFist.glb` |  | idle, walk, attack, die | `actors/mobs/YogFist.java` |
| VaultBossElemental | `char_VaultBossElemental.glb` | Boss | idle, walk, attack, die, cast | `actors/mobs/quest/vault/VaultBossElemental.java` |

## 5. NPCs

| Class (code) | File | Flags | Clips | Code file |
|---|---|---|---|---|
| Blacksmith | `char_Blacksmith.glb` | Stationary | idle, walk, attack, die | `actors/mobs/npcs/Blacksmith.java` |
| DirectableAlly | `char_DirectableAlly.glb` |  | idle, walk, attack, die | `actors/mobs/npcs/DirectableAlly.java` |
| Ghost | `char_Ghost.glb` | Large, Flying | idle, walk, attack, die | `actors/mobs/npcs/Ghost.java` |
| Imp | `char_Imp.glb` | Stationary | idle, walk, attack, die | `actors/mobs/npcs/Imp.java` |
| ImpShopkeeper | `char_ImpShopkeeper.glb` |  | idle, walk, attack, die | `actors/mobs/npcs/ImpShopkeeper.java` |
| MirrorImage | `char_MirrorImage.glb` |  | idle, walk, attack, die | `actors/mobs/npcs/MirrorImage.java` |
| PrismaticImage | `char_PrismaticImage.glb` |  | idle, walk, attack, die | `actors/mobs/npcs/PrismaticImage.java` |
| RatKing | `char_RatKing.glb` |  | idle, walk, attack, die | `actors/mobs/npcs/RatKing.java` |
| Sheep | `char_Sheep.glb` |  | idle, walk, attack, die | `actors/mobs/npcs/Sheep.java` |
| Shopkeeper | `char_Shopkeeper.glb` | Stationary | idle, walk, attack, die | `actors/mobs/npcs/Shopkeeper.java` |
| VaultLaser | `char_VaultLaser.glb` |  | idle, walk, attack, die | `actors/mobs/npcs/VaultLaser.java` |
| VaultMirror | `char_VaultMirror.glb` | Stationary | idle, walk, attack, die | `actors/mobs/npcs/VaultMirror.java` |
| VaultSentry | `char_VaultSentry.glb` | Stationary | idle, walk, attack, die | `actors/mobs/npcs/VaultSentry.java` |
| VaultTokenDoor | `char_VaultTokenDoor.glb` | Stationary | idle, walk, attack, die | `actors/mobs/npcs/VaultTokenDoor.java` |
| Wandmaker | `char_Wandmaker.glb` | Stationary | idle, walk, attack, die | `actors/mobs/npcs/Wandmaker.java` |

## 6. Vault quest characters

| Class (code) | File | Flags | Clips | Code file |
|---|---|---|---|---|
| VaultDM100 | `char_VaultDM100.glb` |  | idle, walk, attack, die | `actors/mobs/quest/vault/VaultDM100.java` |
| VaultDM200 | `char_VaultDM200.glb` |  | idle, walk, attack, die | `actors/mobs/quest/vault/VaultDM200.java` |
| VaultElemental.Fire | `char_VaultElemental.Fire.glb` |  | idle, walk, attack, die | `actors/mobs/quest/vault/VaultElemental.java` |
| VaultElemental.Frost | `char_VaultElemental.Frost.glb` |  | idle, walk, attack, die | `actors/mobs/quest/vault/VaultElemental.java` |
| VaultElemental.Shock | `char_VaultElemental.Shock.glb` |  | idle, walk, attack, die | `actors/mobs/quest/vault/VaultElemental.java` |
| VaultGhoul | `char_VaultGhoul.glb` |  | idle, walk, attack, die | `actors/mobs/quest/vault/VaultGhoul.java` |
| VaultGolem | `char_VaultGolem.glb` |  | idle, walk, attack, die | `actors/mobs/quest/vault/VaultGolem.java` |
| VaultRat | `char_VaultRat.glb` |  | idle, walk, attack, die | `actors/mobs/quest/vault/VaultRat.java` |
| VaultShaman | `char_VaultShaman.glb` |  | idle, walk, attack, die | `actors/mobs/quest/vault/VaultShaman.java` |
| VaultSkeleton | `char_VaultSkeleton.glb` |  | idle, walk, attack, die | `actors/mobs/quest/vault/VaultSkeleton.java` |

## 7. Allies and summons

| Class (code) | File | Flags | Clips | Code file |
|---|---|---|---|---|
| Ratmogrify.TransmogRat | `char_Ratmogrify.TransmogRat.glb` |  | idle, walk, attack, die | `actors/hero/abilities/Ratmogrify.java` |
| PowerOfMany.LightAlly | `char_PowerOfMany.LightAlly.glb` | Inorganic | idle, walk, attack, die | `actors/hero/abilities/cleric/PowerOfMany.java` |
| Feint.AfterImage | `char_Feint.AfterImage.glb` | Stationary | idle, walk, attack, die | `actors/hero/abilities/duelist/Feint.java` |
| SpiritHawk.HawkAlly | `char_SpiritHawk.HawkAlly.glb` | Flying | idle, walk, attack, die | `actors/hero/abilities/huntress/SpiritHawk.java` |
| ShadowClone.ShadowAlly | `char_ShadowClone.ShadowAlly.glb` | Inorganic | idle, walk, attack, die | `actors/hero/abilities/rogue/ShadowClone.java` |
| SmokeBomb.NinjaLog | `char_SmokeBomb.NinjaLog.glb` | Inorganic | idle, walk, attack, die | `actors/hero/abilities/rogue/SmokeBomb.java` |
| DriedRose.GhostHero | `char_DriedRose.GhostHero.glb` | Flying, Undead, Inorganic | idle, walk, attack, die | `items/artifacts/DriedRose.java` |
| CorpseDust.DustWraith | `char_CorpseDust.DustWraith.glb` |  | idle, walk, attack, die | `items/quest/CorpseDust.java` |
| WandOfLivingEarth.EarthGuardian | `char_WandOfLivingEarth.EarthGuardian.glb` | Inorganic | idle, walk, attack, die | `items/wands/WandOfLivingEarth.java` |
| WandOfRegrowth.Lotus | `char_WandOfRegrowth.Lotus.glb` | Stationary | idle, walk, attack, die | `items/wands/WandOfRegrowth.java` |
| WandOfWarding.Ward | `char_WandOfWarding.Ward.glb` | Stationary, Inorganic | idle, walk, attack, die | `items/wands/WandOfWarding.java` |
| WandOfWarding.WardSentry | `char_WandOfWarding.WardSentry.glb` |  | idle, walk, attack, die | `items/wands/WandOfWarding.java` |
| SentryRoom.Sentry | `char_SentryRoom.Sentry.glb` | Stationary | idle, walk, attack, die | `levels/rooms/special/SentryRoom.java` |
| GuardianTrap.Guardian | `char_GuardianTrap.Guardian.glb` |  | idle, walk, attack, die | `levels/traps/GuardianTrap.java` |

Variants of one class (for example `Elemental.FireElemental` vs `Elemental.FrostElemental`, or the six `YogFist` kinds) need distinct looks, but can share a mesh with different textures where that reads clearly.

## 8. Terrain (modular tile kit)

The map is a grid; every cell has one terrain type (`levels/Terrain.java`). Each region needs its own kit of the pieces below in its own style, sharing one texture atlas: **sewers** (floors 1–5), **prison** (6–10), **caves** (11–15), **city** (16–20), **halls** (21–26). The **mining** quest area (`MiningLevel`) and the **vault** quest area (`VaultLevel`) reuse the caves and their own looks.

Walls are placed per cell and must join seamlessly with neighbouring wall blocks on all four sides. If you want shaped wall pieces instead of plain blocks, add: straight, outer corner, inner corner, end, T-junction, cross, and pillar (the engine picks by neighbours).

| Terrain (code) | Id | Piece | File (per region) |
|---|---|---|---|
| CHASM | 0 | hole in the floor; edge pieces going down into darkness | `tile_<region>_CHASM.glb` |
| EMPTY | 1 | plain floor | `tile_<region>_EMPTY.glb` |
| GRASS | 2 | floor with short grass (decal or tufts) | `tile_<region>_GRASS.glb` |
| EMPTY_WELL | 3 | dry well | `tile_<region>_EMPTY_WELL.glb` |
| WALL | 4 | full wall block | `tile_<region>_WALL.glb` |
| DOOR | 5 | closed door in a doorway (blocks sight; opens when walked through) | `tile_<region>_DOOR.glb` |
| OPEN_DOOR | 6 | open door | `tile_<region>_OPEN_DOOR.glb` |
| ENTRANCE | 7 | stairs up (where you arrive) | `tile_<region>_ENTRANCE.glb` |
| EXIT | 8 | stairs down | `tile_<region>_EXIT.glb` |
| EMBERS | 9 | scorched floor | `tile_<region>_EMBERS.glb` |
| LOCKED_DOOR | 10 | locked door (needs a key) | `tile_<region>_LOCKED_DOOR.glb` |
| PEDESTAL | 11 | pedestal (item display) | `tile_<region>_PEDESTAL.glb` |
| WALL_DECO | 12 | wall block with decoration | `tile_<region>_WALL_DECO.glb` |
| BARRICADE | 13 | wooden barricade (burnable) | `tile_<region>_BARRICADE.glb` |
| EMPTY_SP | 14 | special floor (room accent) | `tile_<region>_EMPTY_SP.glb` |
| HIGH_GRASS | 15 | tall grass (blocks sight, trampled when walked) | `tile_<region>_HIGH_GRASS.glb` |
| SECRET_DOOR | 16 | looks exactly like WALL until found | `tile_<region>_SECRET_DOOR.glb` |
| SECRET_TRAP | 17 | looks exactly like EMPTY until found | `tile_<region>_SECRET_TRAP.glb` |
| TRAP | 18 | floor under a visible trap (the trap itself: section 10) | `tile_<region>_TRAP.glb` |
| INACTIVE_TRAP | 19 | floor under a used trap | `tile_<region>_INACTIVE_TRAP.glb` |
| EMPTY_DECO | 20 | decorated floor | `tile_<region>_EMPTY_DECO.glb` |
| LOCKED_EXIT | 21 | stairs down, sealed (boss not beaten) | `tile_<region>_LOCKED_EXIT.glb` |
| UNLOCKED_EXIT | 22 | stairs down, unsealed | `tile_<region>_UNLOCKED_EXIT.glb` |
| CUSTOM_DECO | 23 | set-piece decoration (solid) | `tile_<region>_CUSTOM_DECO.glb` |
| WELL | 24 | magic well (water of health/awareness) | `tile_<region>_WELL.glb` |
| STATUE | 25 | statue (solid, doesn't block sight) | `tile_<region>_STATUE.glb` |
| STATUE_SP | 26 | statue, special look | `tile_<region>_STATUE_SP.glb` |
| BOOKSHELF | 27 | bookshelf (wall-like, burnable) | `tile_<region>_BOOKSHELF.glb` |
| ALCHEMY | 28 | alchemy pot | `tile_<region>_ALCHEMY.glb` |
| WATER | 29 | shallow water (animated surface) | `tile_<region>_WATER.glb` |
| FURROWED_GRASS | 30 | trampled tall grass | `tile_<region>_FURROWED_GRASS.glb` |
| CRYSTAL_DOOR | 31 | crystal door (needs a crystal key) | `tile_<region>_CRYSTAL_DOOR.glb` |
| CUSTOM_DECO_EMPTY | 32 | floor used by set pieces | `tile_<region>_CUSTOM_DECO_EMPTY.glb` |
| REGION_DECO | 33 | region-specific decoration (solid) | `tile_<region>_REGION_DECO.glb` |
| REGION_DECO_ALT | 34 | region-specific decoration, alternate | `tile_<region>_REGION_DECO_ALT.glb` |
| MINE_CRYSTAL | 35 | mining quest crystal (minable) | `tile_<region>_MINE_CRYSTAL.glb` |
| MINE_BOULDER | 36 | mining quest boulder (minable) | `tile_<region>_MINE_BOULDER.glb` |
| ENTRANCE_SP | 37 | stairs up, special/alternate look | `tile_<region>_ENTRANCE_SP.glb` |
| HERO_LKD_DR | 38 | door locked behind the hero (skeleton key) | `tile_<region>_HERO_LKD_DR.glb` |
| CUSTOM_DECO_WTR | 39 | set-piece decoration over water | `tile_<region>_CUSTOM_DECO_WTR.glb` |

Plus per region: 2–3 floor variants to break repetition, and a water shoreline edge if the style needs one.

Levels in the code (each uses its region kit plus the set pieces in section 9):

- `CavesBossLevel` (`levels/CavesBossLevel.java`)
- `CavesLevel` (`levels/CavesLevel.java`)
- `CityBossLevel` (`levels/CityBossLevel.java`)
- `CityLevel` (`levels/CityLevel.java`)
- `DeadEndLevel` (`levels/DeadEndLevel.java`)
- `HallsBossLevel` (`levels/HallsBossLevel.java`)
- `HallsLevel` (`levels/HallsLevel.java`)
- `LastLevel` (`levels/LastLevel.java`)
- `LastShopLevel` (`levels/LastShopLevel.java`)
- `MiningLevel` (`levels/MiningLevel.java`)
- `PrisonBossLevel` (`levels/PrisonBossLevel.java`)
- `PrisonLevel` (`levels/PrisonLevel.java`)
- `SewerBossLevel` (`levels/SewerBossLevel.java`)
- `SewerLevel` (`levels/SewerLevel.java`)
- `VaultLevel` (`levels/VaultLevel.java`)

## 9. Special set pieces (boss arenas, quest rooms)

These are hand-placed visuals in the code (`CustomTilemap` subclasses): boss arena floors and walls, quest room decorations. Each is one set piece, usually spanning several tiles; the code file shows its size and placement.

| Set piece (code) | File | Code file |
|---|---|---|
| CavesBossLevel.ArenaVisuals | `setpiece_CavesBossLevel.ArenaVisuals.glb` | `levels/CavesBossLevel.java` |
| CavesBossLevel.CityEntrance | `setpiece_CavesBossLevel.CityEntrance.glb` | `levels/CavesBossLevel.java` |
| CavesBossLevel.EntranceOverhang | `setpiece_CavesBossLevel.EntranceOverhang.glb` | `levels/CavesBossLevel.java` |
| CavesBossLevel.EntranceTerrain | `setpiece_CavesBossLevel.EntranceTerrain.glb` | `levels/CavesBossLevel.java` |
| CityBossLevel.CustomGroundVisuals | `setpiece_CityBossLevel.CustomGroundVisuals.glb` | `levels/CityBossLevel.java` |
| CityBossLevel.CustomTerrainVisuals | `setpiece_CityBossLevel.CustomTerrainVisuals.glb` | `levels/CityBossLevel.java` |
| CityBossLevel.CustomWallVisuals | `setpiece_CityBossLevel.CustomWallVisuals.glb` | `levels/CityBossLevel.java` |
| HallsBossLevel.CenterPieceVisuals | `setpiece_HallsBossLevel.CenterPieceVisuals.glb` | `levels/HallsBossLevel.java` |
| HallsBossLevel.CenterPieceWalls | `setpiece_HallsBossLevel.CenterPieceWalls.glb` | `levels/HallsBossLevel.java` |
| LastLevel.CenterPieceVisuals | `setpiece_LastLevel.CenterPieceVisuals.glb` | `levels/LastLevel.java` |
| LastLevel.CenterPieceWalls | `setpiece_LastLevel.CenterPieceWalls.glb` | `levels/LastLevel.java` |
| LastLevel.CustomFloor | `setpiece_LastLevel.CustomFloor.glb` | `levels/LastLevel.java` |
| MiningLevel.BorderTopDarken | `setpiece_MiningLevel.BorderTopDarken.glb` | `levels/MiningLevel.java` |
| MiningLevel.BorderWallsDarken | `setpiece_MiningLevel.BorderWallsDarken.glb` | `levels/MiningLevel.java` |
| PrisonBossLevel.ExitVisual | `setpiece_PrisonBossLevel.ExitVisual.glb` | `levels/PrisonBossLevel.java` |
| PrisonBossLevel.ExitVisualWalls | `setpiece_PrisonBossLevel.ExitVisualWalls.glb` | `levels/PrisonBossLevel.java` |
| PrisonBossLevel.FadingTraps | `setpiece_PrisonBossLevel.FadingTraps.glb` | `levels/PrisonBossLevel.java` |
| AmbitiousImpRoom.EntranceBarrier | `setpiece_AmbitiousImpRoom.EntranceBarrier.glb` | `levels/rooms/quest/AmbitiousImpRoom.java` |
| AmbitiousImpRoom.QuestEntrance | `setpiece_AmbitiousImpRoom.QuestEntrance.glb` | `levels/rooms/quest/AmbitiousImpRoom.java` |
| AmbitiousImpRoom.WallBanners | `setpiece_AmbitiousImpRoom.WallBanners.glb` | `levels/rooms/quest/AmbitiousImpRoom.java` |
| BlacksmithRoom.FurnaceOverhang | `setpiece_BlacksmithRoom.FurnaceOverhang.glb` | `levels/rooms/quest/BlacksmithRoom.java` |
| BlacksmithRoom.QuestEntrance | `setpiece_BlacksmithRoom.QuestEntrance.glb` | `levels/rooms/quest/BlacksmithRoom.java` |
| BlacksmithRoom.SmithyVisuals | `setpiece_BlacksmithRoom.SmithyVisuals.glb` | `levels/rooms/quest/BlacksmithRoom.java` |
| MassGraveRoom.Bones | `setpiece_MassGraveRoom.Bones.glb` | `levels/rooms/quest/MassGraveRoom.java` |
| MassGraveRoom.MassGraveDeco | `setpiece_MassGraveRoom.MassGraveDeco.glb` | `levels/rooms/quest/MassGraveRoom.java` |
| MassGraveRoom.StatueRaised | `setpiece_MassGraveRoom.StatueRaised.glb` | `levels/rooms/quest/MassGraveRoom.java` |
| MineEntrance.QuestExit | `setpiece_MineEntrance.QuestExit.glb` | `levels/rooms/quest/MineEntrance.java` |
| RitualSiteRoom.RitualMarker | `setpiece_RitualSiteRoom.RitualMarker.glb` | `levels/rooms/quest/RitualSiteRoom.java` |
| RitualSiteRoom.Table | `setpiece_RitualSiteRoom.Table.glb` | `levels/rooms/quest/RitualSiteRoom.java` |
| VaultEntranceRoom.QuestEntranceInternal | `setpiece_VaultEntranceRoom.QuestEntranceInternal.glb` | `levels/rooms/quest/vault/VaultEntranceRoom.java` |
| VaultFinalRoom.FinalRoomDoor | `setpiece_VaultFinalRoom.FinalRoomDoor.glb` | `levels/rooms/quest/vault/VaultFinalRoom.java` |
| VaultFinalRoom.FinalRoomDoorOverhang | `setpiece_VaultFinalRoom.FinalRoomDoorOverhang.glb` | `levels/rooms/quest/vault/VaultFinalRoom.java` |
| VaultFinalRoom.MarkerTiles | `setpiece_VaultFinalRoom.MarkerTiles.glb` | `levels/rooms/quest/vault/VaultFinalRoom.java` |
| VaultFinalRoom.VaultTreasure | `setpiece_VaultFinalRoom.VaultTreasure.glb` | `levels/rooms/quest/vault/VaultFinalRoom.java` |
| VaultTokensRoom.TokenDoorFloor | `setpiece_VaultTokensRoom.TokenDoorFloor.glb` | `levels/rooms/quest/vault/VaultTokensRoom.java` |
| RatKingRoom.RatKingRoomDeco | `setpiece_RatKingRoom.RatKingRoomDeco.glb` | `levels/rooms/secret/RatKingRoom.java` |
| RatKingRoom.RatKingStatues | `setpiece_RatKingRoom.RatKingStatues.glb` | `levels/rooms/secret/RatKingRoom.java` |
| RatKingRoom.StatueOverhang | `setpiece_RatKingRoom.StatueOverhang.glb` | `levels/rooms/secret/RatKingRoom.java` |
| GooBossRoom.GooNest | `setpiece_GooBossRoom.GooNest.glb` | `levels/rooms/sewerboss/GooBossRoom.java` |
| SewerBossExitRoom.SewerExit | `setpiece_SewerBossExitRoom.SewerExit.glb` | `levels/rooms/sewerboss/SewerBossExitRoom.java` |
| SewerBossExitRoom.SewerExitOverhang | `setpiece_SewerBossExitRoom.SewerExitOverhang.glb` | `levels/rooms/sewerboss/SewerBossExitRoom.java` |
| DemonSpawnerRoom.CustomFloor | `setpiece_DemonSpawnerRoom.CustomFloor.glb` | `levels/rooms/special/DemonSpawnerRoom.java` |
| WeakFloorRoom.HiddenWell | `setpiece_WeakFloorRoom.HiddenWell.glb` | `levels/rooms/special/WeakFloorRoom.java` |
| Carpet | `setpiece_Carpet.glb` | `tiles/custom/Carpet.java` |

## 10. Traps

Each trap is a plate in the floor, about 0.7 × 0.7, flush with the floor. Needs two looks: **active** and **used** (inactive, after triggering). The code gives each trap a colour and a symbol shape (`Trap.color`, `Trap.shape`) so players can tell them apart; keep that distinction readable in 3D.

| Trap (code) | Colour (code) | Symbol (code) | File |
|---|---|---|---|
| VaultLevel.VaultFlameTrap | BLACK | DOTS | `trap_VaultLevel.VaultFlameTrap.glb` (+ `_used`) |
| ToxicGasRoom.ToxicVent | BLACK | GRILL | `trap_ToxicGasRoom.ToxicVent.glb` (+ `_used`) |
| AlarmTrap | RED | DOTS | `trap_AlarmTrap.glb` (+ `_used`) |
| BlazingTrap | ORANGE | STARS | `trap_BlazingTrap.glb` (+ `_used`) |
| BurningTrap | ORANGE | DOTS | `trap_BurningTrap.glb` (+ `_used`) |
| ChillingTrap | WHITE | DOTS | `trap_ChillingTrap.glb` (+ `_used`) |
| ConfusionTrap | TEAL | GRILL | `trap_ConfusionTrap.glb` (+ `_used`) |
| CorrosionTrap | GREY | GRILL | `trap_CorrosionTrap.glb` (+ `_used`) |
| CursingTrap | VIOLET | WAVES | `trap_CursingTrap.glb` (+ `_used`) |
| DisarmingTrap | RED | LARGE_DOT | `trap_DisarmingTrap.glb` (+ `_used`) |
| DisintegrationTrap | VIOLET | CROSSHAIR | `trap_DisintegrationTrap.glb` (+ `_used`) |
| DistortionTrap | TEAL | LARGE_DOT | `trap_DistortionTrap.glb` (+ `_used`) |
| ExplosiveTrap | ORANGE | DIAMOND | `trap_ExplosiveTrap.glb` (+ `_used`) |
| FlashingTrap | GREY | STARS | `trap_FlashingTrap.glb` (+ `_used`) |
| FlockTrap | WHITE | WAVES | `trap_FlockTrap.glb` (+ `_used`) |
| FrostTrap | WHITE | STARS | `trap_FrostTrap.glb` (+ `_used`) |
| GatewayTrap | TEAL | CROSSHAIR | `trap_GatewayTrap.glb` (+ `_used`) |
| GeyserTrap | TEAL | DIAMOND | `trap_GeyserTrap.glb` (+ `_used`) |
| GnollRockfallTrap | inherited | inherited | `trap_GnollRockfallTrap.glb` (+ `_used`) |
| GrimTrap | GREY | LARGE_DOT | `trap_GrimTrap.glb` (+ `_used`) |
| GrippingTrap | GREY | DOTS | `trap_GrippingTrap.glb` (+ `_used`) |
| GuardianTrap | RED | STARS | `trap_GuardianTrap.glb` (+ `_used`) |
| OozeTrap | GREEN | DOTS | `trap_OozeTrap.glb` (+ `_used`) |
| PitfallTrap | RED | DIAMOND | `trap_PitfallTrap.glb` (+ `_used`) |
| PoisonDartTrap | GREEN | CROSSHAIR | `trap_PoisonDartTrap.glb` (+ `_used`) |
| RockfallTrap | GREY | DIAMOND | `trap_RockfallTrap.glb` (+ `_used`) |
| ShockingTrap | YELLOW | DOTS | `trap_ShockingTrap.glb` (+ `_used`) |
| StormTrap | YELLOW | STARS | `trap_StormTrap.glb` (+ `_used`) |
| SummoningTrap | TEAL | WAVES | `trap_SummoningTrap.glb` (+ `_used`) |
| TeleportationTrap | TEAL | DOTS | `trap_TeleportationTrap.glb` (+ `_used`) |
| TenguDartTrap | inherited | inherited | `trap_TenguDartTrap.glb` (+ `_used`) |
| ToxicTrap | GREEN | GRILL | `trap_ToxicTrap.glb` (+ `_used`) |
| WarpingTrap | TEAL | STARS | `trap_WarpingTrap.glb` (+ `_used`) |
| WeakeningTrap | GREEN | WAVES | `trap_WeakeningTrap.glb` (+ `_used`) |
| WornDartTrap | GREY | CROSSHAIR | `trap_WornDartTrap.glb` (+ `_used`) |

## 11. Plants

Small plant on one tile, at most 0.5 tall; trampling triggers its effect and removes it. Their seeds are items (section 13).

| Plant (code) | File |
|---|---|
| WandOfRegrowth.Dewcatcher | `plant_WandOfRegrowth.Dewcatcher.glb` |
| WandOfRegrowth.Seedpod | `plant_WandOfRegrowth.Seedpod.glb` |
| BlandfruitBush | `plant_BlandfruitBush.glb` |
| Blindweed | `plant_Blindweed.glb` |
| Earthroot | `plant_Earthroot.glb` |
| Fadeleaf | `plant_Fadeleaf.glb` |
| Firebloom | `plant_Firebloom.glb` |
| Icecap | `plant_Icecap.glb` |
| Mageroyal | `plant_Mageroyal.glb` |
| Rotberry | `plant_Rotberry.glb` |
| Sorrowmoss | `plant_Sorrowmoss.glb` |
| Starflower | `plant_Starflower.glb` |
| Stormvine | `plant_Stormvine.glb` |
| Sungrass | `plant_Sungrass.glb` |
| Swiftthistle | `plant_Swiftthistle.glb` |

## 12. Item heaps and containers

How items lie on a tile (`Heap.Type`). A plain heap shows its top item (section 13); the others are containers.

| Heap type | Model | File |
|---|---|---|
| HEAP | loose items on the floor: no model, shows the item | `heap_HEAP.glb` |
| FOR_SALE | shop display: small stand or mat under the item | `heap_FOR_SALE.glb` |
| CHEST | wooden chest | `heap_CHEST.glb` |
| LOCKED_CHEST | locked chest (needs a golden key) | `heap_LOCKED_CHEST.glb` |
| CRYSTAL_CHEST | crystal chest (contents visible) | `heap_CRYSTAL_CHEST.glb` |
| TOMB | stone tomb | `heap_TOMB.glb` |
| SKELETON | skeleton remains | `heap_SKELETON.glb` |
| REMAINS | remains of a past hero (bones and a bag) | `heap_REMAINS.glb` |

## 13. Items

Every concrete item class in the code, grouped by package. **Image** is the 2D sprite id the item uses (`sprites/ItemSpriteSheet.java`); items sharing an image can share a model.

**Look sets instead of per-type models:** unidentified potions, scrolls and rings look random each game, so they need one model per *look*, not per type:
- Potions: 12 flask looks (crimson, amber, golden, jade, turquoise, azure, indigo, magenta, bistre, charcoal, silver, ivory) → `item_potion_<colour>.glb`
- Exotic potions: 12 flask looks in the same colours, a different flask shape → `item_exotic_potion_<colour>.glb`
- Scrolls: 12 rune looks (kaunan, sowilo, laguz, yngvi, gyfu, raido, isaz, mannaz, naudiz, berkanan, odal, tiwaz) → `item_scroll_<rune>.glb`
- Exotic scrolls: 12 rune looks, a different scroll style → `item_exotic_scroll_<rune>.glb`
- Rings: 12 gem looks (garnet, ruby, topaz, emerald, onyx, opal, tourmaline, sapphire, amethyst, quartz, agate, diamond) → `item_ring_<gem>.glb`
- Once identified, the game shows the item's name and an icon in the 2D interface, so no per-type 3D model is needed for these three families.

### `armor` (12)

| Item (code) | Image (code) | File |
|---|---|---|
| Armor | inherited or set at runtime | `item_Armor.glb` |
| ClericArmor | ARMOR_CLERIC | `item_ClericArmor.glb` |
| ClothArmor | ARMOR_CLOTH | `item_ClothArmor.glb` |
| DuelistArmor | ARMOR_DUELIST | `item_DuelistArmor.glb` |
| HuntressArmor | ARMOR_HUNTRESS | `item_HuntressArmor.glb` |
| LeatherArmor | ARMOR_LEATHER | `item_LeatherArmor.glb` |
| MageArmor | ARMOR_MAGE | `item_MageArmor.glb` |
| MailArmor | ARMOR_MAIL | `item_MailArmor.glb` |
| PlateArmor | ARMOR_PLATE | `item_PlateArmor.glb` |
| RogueArmor | ARMOR_ROGUE | `item_RogueArmor.glb` |
| ScaleArmor | ARMOR_SCALE | `item_ScaleArmor.glb` |
| WarriorArmor | ARMOR_WARRIOR | `item_WarriorArmor.glb` |

### `artifacts` (18)

| Item (code) | Image (code) | File |
|---|---|---|
| AlchemistsToolkit | ARTIFACT_TOOLKIT | `item_AlchemistsToolkit.glb` |
| Artifact | inherited or set at runtime | `item_Artifact.glb` |
| CapeOfThorns | ARTIFACT_CAPE | `item_CapeOfThorns.glb` |
| ChaliceOfBlood | ARTIFACT_CHALICE1 | `item_ChaliceOfBlood.glb` |
| CloakOfShadows | ARTIFACT_CLOAK | `item_CloakOfShadows.glb` |
| DriedRose | ARTIFACT_ROSE1 | `item_DriedRose.glb` |
| DriedRose.Petal | PETAL | `item_DriedRose.Petal.glb` |
| EtherealChains | ARTIFACT_CHAINS | `item_EtherealChains.glb` |
| HolyTome | ARTIFACT_TOME | `item_HolyTome.glb` |
| HornOfPlenty | ARTIFACT_HORN1 | `item_HornOfPlenty.glb` |
| LloydsBeacon | ARTIFACT_BEACON | `item_LloydsBeacon.glb` |
| MasterThievesArmband | ARTIFACT_ARMBAND | `item_MasterThievesArmband.glb` |
| SandalsOfNature | ARTIFACT_SANDALS | `item_SandalsOfNature.glb` |
| SkeletonKey | ARTIFACT_KEY | `item_SkeletonKey.glb` |
| TalismanOfForesight | ARTIFACT_TALISMAN | `item_TalismanOfForesight.glb` |
| TimekeepersHourglass | ARTIFACT_HOURGLASS | `item_TimekeepersHourglass.glb` |
| TimekeepersHourglass.sandBag | SANDBAG | `item_TimekeepersHourglass.sandBag.glb` |
| UnstableSpellbook | ARTIFACT_SPELLBOOK | `item_UnstableSpellbook.glb` |

### `bags` (5)

| Item (code) | Image (code) | File |
|---|---|---|
| Bag | inherited or set at runtime | `item_Bag.glb` |
| MagicalHolster | HOLSTER | `item_MagicalHolster.glb` |
| PotionBandolier | BANDOLIER | `item_PotionBandolier.glb` |
| ScrollHolder | HOLDER | `item_ScrollHolder.glb` |
| VelvetPouch | POUCH | `item_VelvetPouch.glb` |

### `bombs` (13)

| Item (code) | Image (code) | File |
|---|---|---|
| ArcaneBomb | ARCANE_BOMB | `item_ArcaneBomb.glb` |
| Bomb | BOMB | `item_Bomb.glb` |
| Bomb.ConjuredBomb | inherited or set at runtime | `item_Bomb.ConjuredBomb.glb` |
| Bomb.DoubleBomb | DBL_BOMB | `item_Bomb.DoubleBomb.glb` |
| Firebomb | FIRE_BOMB | `item_Firebomb.glb` |
| FlashBangBomb | FLASHBANG | `item_FlashBangBomb.glb` |
| FrostBomb | FROST_BOMB | `item_FrostBomb.glb` |
| HolyBomb | HOLY_BOMB | `item_HolyBomb.glb` |
| Noisemaker | NOISEMAKER | `item_Noisemaker.glb` |
| RegrowthBomb | REGROWTH_BOMB | `item_RegrowthBomb.glb` |
| ShrapnelBomb | SHRAPNEL_BOMB | `item_ShrapnelBomb.glb` |
| SmokeBomb | SMOKE_BOMB | `item_SmokeBomb.glb` |
| WoollyBomb | WOOLY_BOMB | `item_WoollyBomb.glb` |

### `food` (15)

| Item (code) | Image (code) | File |
|---|---|---|
| Berry | BERRY | `item_Berry.glb` |
| Blandfruit | BLANDFRUIT | `item_Blandfruit.glb` |
| Blandfruit.Chunks | BLAND_CHUNKS | `item_Blandfruit.Chunks.glb` |
| ChargrilledMeat | STEAK | `item_ChargrilledMeat.glb` |
| Food | RATION | `item_Food.glb` |
| FrozenCarpaccio | CARPACCIO | `item_FrozenCarpaccio.glb` |
| MeatPie | MEAT_PIE | `item_MeatPie.glb` |
| MysteryMeat | MEAT | `item_MysteryMeat.glb` |
| MysteryMeat.PlaceHolder | FOOD_HOLDER | `item_MysteryMeat.PlaceHolder.glb` |
| Pasty | PASTY | `item_Pasty.glb` |
| Pasty.FishLeftover | FISH_LEFTOVER | `item_Pasty.FishLeftover.glb` |
| PhantomMeat | PHANTOM_MEAT | `item_PhantomMeat.glb` |
| SmallRation | OVERPRICED | `item_SmallRation.glb` |
| StewedMeat | STEWED | `item_StewedMeat.glb` |
| SupplyRation | SUPPLY_RATION | `item_SupplyRation.glb` |

### `hero` (1)

| Item (code) | Image (code) | File |
|---|---|---|
| Belongings.Backpack | BACKPACK | `item_Belongings.Backpack.glb` |

### `hero/spells` (1)

| Item (code) | Image (code) | File |
|---|---|---|
| HolyLance.HolyLanceVFX | THROWING_SPIKE | `item_HolyLance.HolyLanceVFX.glb` |

### `items (misc)` (34)

| Item (code) | Image (code) | File |
|---|---|---|
| Amulet | AMULET | `item_Amulet.glb` |
| Ankh | ANKH | `item_Ankh.glb` |
| ArcaneResin | ARCANE_RESIN | `item_ArcaneResin.glb` |
| BrokenSeal | SEAL | `item_BrokenSeal.glb` |
| Dewdrop | DEWDROP | `item_Dewdrop.glb` |
| EnergyCrystal | ENERGY | `item_EnergyCrystal.glb` |
| Gold | GOLD | `item_Gold.glb` |
| Honeypot | HONEYPOT | `item_Honeypot.glb` |
| Honeypot.ShatteredPot | SHATTPOT | `item_Honeypot.ShatteredPot.glb` |
| KingsCrown | CROWN | `item_KingsCrown.glb` |
| LiquidMetal | LIQUID_METAL | `item_LiquidMetal.glb` |
| LostBackpack | BACKPACK | `item_LostBackpack.glb` |
| Stylus | STYLUS | `item_Stylus.glb` |
| TengusMask | MASK | `item_TengusMask.glb` |
| Torch | TORCH | `item_Torch.glb` |
| Waterskin | WATERSKIN | `item_Waterskin.glb` |
| BlandfruitBush.Seed | inherited or set at runtime | `item_BlandfruitBush.Seed.glb` |
| Blindweed.Seed | SEED_BLINDWEED | `item_Blindweed.Seed.glb` |
| Earthroot.Seed | SEED_EARTHROOT | `item_Earthroot.Seed.glb` |
| Fadeleaf.Seed | SEED_FADELEAF | `item_Fadeleaf.Seed.glb` |
| Firebloom.Seed | SEED_FIREBLOOM | `item_Firebloom.Seed.glb` |
| Icecap.Seed | SEED_ICECAP | `item_Icecap.Seed.glb` |
| Mageroyal.Seed | SEED_MAGEROYAL | `item_Mageroyal.Seed.glb` |
| Plant.PlaceHolder | SEED_HOLDER | `item_Plant.PlaceHolder.glb` |
| Plant.Seed | SEED_HOLDER | `item_Plant.Seed.glb` |
| Rotberry.Seed | SEED_ROTBERRY | `item_Rotberry.Seed.glb` |
| Sorrowmoss.Seed | SEED_SORROWMOSS | `item_Sorrowmoss.Seed.glb` |
| Starflower.Seed | SEED_STARFLOWER | `item_Starflower.Seed.glb` |
| Stormvine.Seed | SEED_STORMVINE | `item_Stormvine.Seed.glb` |
| Sungrass.Seed | SEED_SUNGRASS | `item_Sungrass.Seed.glb` |
| Swiftthistle.Seed | SEED_SWIFTTHISTLE | `item_Swiftthistle.Seed.glb` |
| ScorpioSprite.ScorpioShot | FISHING_SPEAR | `item_ScorpioSprite.ScorpioShot.glb` |
| TenguSprite.TenguShuriken | SHURIKEN | `item_TenguSprite.TenguShuriken.glb` |
| WndBag.Placeholder | inherited or set at runtime | `item_WndBag.Placeholder.glb` |

### `journal` (8)

| Item (code) | Image (code) | File |
|---|---|---|
| AlchemyPage | ALCH_PAGE | `item_AlchemyPage.glb` |
| GuidePage | GUIDE_PAGE | `item_GuidePage.glb` |
| Guidebook | MASTERY | `item_Guidebook.glb` |
| RegionLorePage.Caves | CAVES_PAGE | `item_RegionLorePage.Caves.glb` |
| RegionLorePage.City | CITY_PAGE | `item_RegionLorePage.City.glb` |
| RegionLorePage.Halls | HALLS_PAGE | `item_RegionLorePage.Halls.glb` |
| RegionLorePage.Prison | PRISON_PAGE | `item_RegionLorePage.Prison.glb` |
| RegionLorePage.Sewers | SEWER_PAGE | `item_RegionLorePage.Sewers.glb` |

### `keys` (4)

| Item (code) | Image (code) | File |
|---|---|---|
| CrystalKey | CRYSTAL_KEY | `item_CrystalKey.glb` |
| GoldenKey | GOLDEN_KEY | `item_GoldenKey.glb` |
| IronKey | IRON_KEY | `item_IronKey.glb` |
| WornKey | WORN_KEY | `item_WornKey.glb` |

### `mobs` (3)

| Item (code) | Image (code) | File |
|---|---|---|
| GnollGeomancer.Boulder | GEO_BOULDER | `item_GnollGeomancer.Boulder.glb` |
| Tengu.BombItem | TENGU_BOMB | `item_Tengu.BombItem.glb` |
| Tengu.ShockerItem | TENGU_SHOCKER | `item_Tengu.ShockerItem.glb` |

### `mobs/npcs` (1)

| Item (code) | Image (code) | File |
|---|---|---|
| VaultMirror.MirrorSword | inherited or set at runtime | `item_VaultMirror.MirrorSword.glb` |

### `potions` (14)

| Item (code) | Image (code) | File |
|---|---|---|
| Potion | POTION_HOLDER (uses the look set above) | `item_Potion.glb` |
| Potion.PlaceHolder | POTION_HOLDER (uses the look set above) | `item_Potion.PlaceHolder.glb` |
| PotionOfExperience | inherited or set at runtime (uses the look set above) | `item_PotionOfExperience.glb` |
| PotionOfFrost | inherited or set at runtime (uses the look set above) | `item_PotionOfFrost.glb` |
| PotionOfHaste | inherited or set at runtime (uses the look set above) | `item_PotionOfHaste.glb` |
| PotionOfHealing | inherited or set at runtime (uses the look set above) | `item_PotionOfHealing.glb` |
| PotionOfInvisibility | inherited or set at runtime (uses the look set above) | `item_PotionOfInvisibility.glb` |
| PotionOfLevitation | inherited or set at runtime (uses the look set above) | `item_PotionOfLevitation.glb` |
| PotionOfLiquidFlame | inherited or set at runtime (uses the look set above) | `item_PotionOfLiquidFlame.glb` |
| PotionOfMindVision | inherited or set at runtime (uses the look set above) | `item_PotionOfMindVision.glb` |
| PotionOfParalyticGas | inherited or set at runtime (uses the look set above) | `item_PotionOfParalyticGas.glb` |
| PotionOfPurity | inherited or set at runtime (uses the look set above) | `item_PotionOfPurity.glb` |
| PotionOfStrength | inherited or set at runtime (uses the look set above) | `item_PotionOfStrength.glb` |
| PotionOfToxicGas | inherited or set at runtime (uses the look set above) | `item_PotionOfToxicGas.glb` |

### `potions/brews` (6)

| Item (code) | Image (code) | File |
|---|---|---|
| AquaBrew | BREW_AQUA | `item_AquaBrew.glb` |
| BlizzardBrew | BREW_BLIZZARD | `item_BlizzardBrew.glb` |
| CausticBrew | BREW_CAUSTIC | `item_CausticBrew.glb` |
| InfernalBrew | BREW_INFERNAL | `item_InfernalBrew.glb` |
| ShockingBrew | BREW_SHOCKING | `item_ShockingBrew.glb` |
| UnstableBrew | BREW_UNSTABLE | `item_UnstableBrew.glb` |

### `potions/elixirs` (8)

| Item (code) | Image (code) | File |
|---|---|---|
| ElixirOfAquaticRejuvenation | ELIXIR_AQUA | `item_ElixirOfAquaticRejuvenation.glb` |
| ElixirOfArcaneArmor | ELIXIR_ARCANE | `item_ElixirOfArcaneArmor.glb` |
| ElixirOfDragonsBlood | ELIXIR_DRAGON | `item_ElixirOfDragonsBlood.glb` |
| ElixirOfFeatherFall | ELIXIR_FEATHER | `item_ElixirOfFeatherFall.glb` |
| ElixirOfHoneyedHealing | ELIXIR_HONEY | `item_ElixirOfHoneyedHealing.glb` |
| ElixirOfIcyTouch | ELIXIR_ICY | `item_ElixirOfIcyTouch.glb` |
| ElixirOfMight | ELIXIR_MIGHT | `item_ElixirOfMight.glb` |
| ElixirOfToxicEssence | ELIXIR_TOXIC | `item_ElixirOfToxicEssence.glb` |

### `potions/exotic` (13)

| Item (code) | Image (code) | File |
|---|---|---|
| ExoticPotion | inherited or set at runtime (uses the look set above) | `item_ExoticPotion.glb` |
| PotionOfCleansing | inherited or set at runtime (uses the look set above) | `item_PotionOfCleansing.glb` |
| PotionOfCorrosiveGas | inherited or set at runtime (uses the look set above) | `item_PotionOfCorrosiveGas.glb` |
| PotionOfDivineInspiration | inherited or set at runtime (uses the look set above) | `item_PotionOfDivineInspiration.glb` |
| PotionOfDragonsBreath | inherited or set at runtime (uses the look set above) | `item_PotionOfDragonsBreath.glb` |
| PotionOfEarthenArmor | inherited or set at runtime (uses the look set above) | `item_PotionOfEarthenArmor.glb` |
| PotionOfMagicalSight | inherited or set at runtime (uses the look set above) | `item_PotionOfMagicalSight.glb` |
| PotionOfMastery | inherited or set at runtime (uses the look set above) | `item_PotionOfMastery.glb` |
| PotionOfShielding | inherited or set at runtime (uses the look set above) | `item_PotionOfShielding.glb` |
| PotionOfShroudingFog | inherited or set at runtime (uses the look set above) | `item_PotionOfShroudingFog.glb` |
| PotionOfSnapFreeze | inherited or set at runtime (uses the look set above) | `item_PotionOfSnapFreeze.glb` |
| PotionOfStamina | inherited or set at runtime (uses the look set above) | `item_PotionOfStamina.glb` |
| PotionOfStormClouds | inherited or set at runtime (uses the look set above) | `item_PotionOfStormClouds.glb` |

### `quest` (11)

| Item (code) | Image (code) | File |
|---|---|---|
| CeremonialCandle | CANDLE | `item_CeremonialCandle.glb` |
| CorpseDust | DUST | `item_CorpseDust.glb` |
| DarkGold | ORE | `item_DarkGold.glb` |
| DwarfToken | TOKEN | `item_DwarfToken.glb` |
| Embers | EMBER | `item_Embers.glb` |
| EscapeCrystal | ESCAPE | `item_EscapeCrystal.glb` |
| GooBlob | BLOB | `item_GooBlob.glb` |
| ImpStatue | STATUE | `item_ImpStatue.glb` |
| MetalShard | SHARD | `item_MetalShard.glb` |
| Pickaxe | PICKAXE | `item_Pickaxe.glb` |
| VaultBeacon | RETURN_BEACON | `item_VaultBeacon.glb` |

### `remains` (6)

| Item (code) | Image (code) | File |
|---|---|---|
| BowFragment | BOW_FRAGMENT | `item_BowFragment.glb` |
| BrokenHilt | BROKEN_HILT | `item_BrokenHilt.glb` |
| BrokenStaff | BROKEN_STAFF | `item_BrokenStaff.glb` |
| CloakScrap | CLOAK_SCRAP | `item_CloakScrap.glb` |
| SealShard | SEAL_SHARD | `item_SealShard.glb` |
| TornPage | TORN_PAGE | `item_TornPage.glb` |

### `rings` (13)

| Item (code) | Image (code) | File |
|---|---|---|
| Ring | RING_HOLDER | `item_Ring.glb` |
| RingOfAccuracy | inherited or set at runtime (uses the look set above) | `item_RingOfAccuracy.glb` |
| RingOfArcana | inherited or set at runtime (uses the look set above) | `item_RingOfArcana.glb` |
| RingOfElements | inherited or set at runtime (uses the look set above) | `item_RingOfElements.glb` |
| RingOfEnergy | inherited or set at runtime (uses the look set above) | `item_RingOfEnergy.glb` |
| RingOfEvasion | inherited or set at runtime (uses the look set above) | `item_RingOfEvasion.glb` |
| RingOfForce | inherited or set at runtime (uses the look set above) | `item_RingOfForce.glb` |
| RingOfFuror | inherited or set at runtime (uses the look set above) | `item_RingOfFuror.glb` |
| RingOfHaste | inherited or set at runtime (uses the look set above) | `item_RingOfHaste.glb` |
| RingOfMight | inherited or set at runtime (uses the look set above) | `item_RingOfMight.glb` |
| RingOfSharpshooting | inherited or set at runtime (uses the look set above) | `item_RingOfSharpshooting.glb` |
| RingOfTenacity | inherited or set at runtime (uses the look set above) | `item_RingOfTenacity.glb` |
| RingOfWealth | inherited or set at runtime (uses the look set above) | `item_RingOfWealth.glb` |

### `scrolls` (13)

| Item (code) | Image (code) | File |
|---|---|---|
| Scroll.PlaceHolder | SCROLL_HOLDER (uses the look set above) | `item_Scroll.PlaceHolder.glb` |
| ScrollOfIdentify | inherited or set at runtime (uses the look set above) | `item_ScrollOfIdentify.glb` |
| ScrollOfLullaby | inherited or set at runtime (uses the look set above) | `item_ScrollOfLullaby.glb` |
| ScrollOfMagicMapping | inherited or set at runtime (uses the look set above) | `item_ScrollOfMagicMapping.glb` |
| ScrollOfMirrorImage | inherited or set at runtime (uses the look set above) | `item_ScrollOfMirrorImage.glb` |
| ScrollOfRage | inherited or set at runtime (uses the look set above) | `item_ScrollOfRage.glb` |
| ScrollOfRecharging | inherited or set at runtime (uses the look set above) | `item_ScrollOfRecharging.glb` |
| ScrollOfRemoveCurse | inherited or set at runtime (uses the look set above) | `item_ScrollOfRemoveCurse.glb` |
| ScrollOfRetribution | inherited or set at runtime (uses the look set above) | `item_ScrollOfRetribution.glb` |
| ScrollOfTeleportation | inherited or set at runtime (uses the look set above) | `item_ScrollOfTeleportation.glb` |
| ScrollOfTerror | inherited or set at runtime (uses the look set above) | `item_ScrollOfTerror.glb` |
| ScrollOfTransmutation | inherited or set at runtime (uses the look set above) | `item_ScrollOfTransmutation.glb` |
| ScrollOfUpgrade | inherited or set at runtime (uses the look set above) | `item_ScrollOfUpgrade.glb` |

### `scrolls/exotic` (12)

| Item (code) | Image (code) | File |
|---|---|---|
| ScrollOfAntiMagic | inherited or set at runtime (uses the look set above) | `item_ScrollOfAntiMagic.glb` |
| ScrollOfChallenge | inherited or set at runtime (uses the look set above) | `item_ScrollOfChallenge.glb` |
| ScrollOfDivination | inherited or set at runtime (uses the look set above) | `item_ScrollOfDivination.glb` |
| ScrollOfDread | inherited or set at runtime (uses the look set above) | `item_ScrollOfDread.glb` |
| ScrollOfEnchantment | inherited or set at runtime (uses the look set above) | `item_ScrollOfEnchantment.glb` |
| ScrollOfForesight | inherited or set at runtime (uses the look set above) | `item_ScrollOfForesight.glb` |
| ScrollOfMetamorphosis | inherited or set at runtime (uses the look set above) | `item_ScrollOfMetamorphosis.glb` |
| ScrollOfMysticalEnergy | inherited or set at runtime (uses the look set above) | `item_ScrollOfMysticalEnergy.glb` |
| ScrollOfPassage | inherited or set at runtime (uses the look set above) | `item_ScrollOfPassage.glb` |
| ScrollOfPrismaticImage | inherited or set at runtime (uses the look set above) | `item_ScrollOfPrismaticImage.glb` |
| ScrollOfPsionicBlast | inherited or set at runtime (uses the look set above) | `item_ScrollOfPsionicBlast.glb` |
| ScrollOfSirensSong | inherited or set at runtime (uses the look set above) | `item_ScrollOfSirensSong.glb` |

### `spells` (11)

| Item (code) | Image (code) | File |
|---|---|---|
| Alchemize | ALCHEMIZE | `item_Alchemize.glb` |
| BeaconOfReturning | RETURN_BEACON | `item_BeaconOfReturning.glb` |
| CurseInfusion | CURSE_INFUSE | `item_CurseInfusion.glb` |
| MagicalInfusion | MAGIC_INFUSE | `item_MagicalInfusion.glb` |
| PhaseShift | PHASE_SHIFT | `item_PhaseShift.glb` |
| ReclaimTrap | RECLAIM_TRAP | `item_ReclaimTrap.glb` |
| Recycle | RECYCLE | `item_Recycle.glb` |
| SummonElemental | SUMMON_ELE | `item_SummonElemental.glb` |
| TelekineticGrab | TELE_GRAB | `item_TelekineticGrab.glb` |
| UnstableSpell | UNSTABLE_SPELL | `item_UnstableSpell.glb` |
| WildEnergy | WILD_ENERGY | `item_WildEnergy.glb` |

### `stones` (13)

| Item (code) | Image (code) | File |
|---|---|---|
| Runestone.PlaceHolder | STONE_HOLDER | `item_Runestone.PlaceHolder.glb` |
| StoneOfAggression | STONE_AGGRESSION | `item_StoneOfAggression.glb` |
| StoneOfAugmentation | STONE_AUGMENTATION | `item_StoneOfAugmentation.glb` |
| StoneOfBlast | STONE_BLAST | `item_StoneOfBlast.glb` |
| StoneOfBlink | STONE_BLINK | `item_StoneOfBlink.glb` |
| StoneOfClairvoyance | STONE_CLAIRVOYANCE | `item_StoneOfClairvoyance.glb` |
| StoneOfDeepSleep | STONE_SLEEP | `item_StoneOfDeepSleep.glb` |
| StoneOfDetectMagic | STONE_DETECT | `item_StoneOfDetectMagic.glb` |
| StoneOfEnchantment | STONE_ENCHANT | `item_StoneOfEnchantment.glb` |
| StoneOfFear | STONE_FEAR | `item_StoneOfFear.glb` |
| StoneOfFlock | STONE_FLOCK | `item_StoneOfFlock.glb` |
| StoneOfIntuition | STONE_INTUITION | `item_StoneOfIntuition.glb` |
| StoneOfShock | STONE_SHOCK | `item_StoneOfShock.glb` |

### `trinkets` (20)

| Item (code) | Image (code) | File |
|---|---|---|
| ChaoticCenser | CHAOTIC_CENSER | `item_ChaoticCenser.glb` |
| CrackedSpyglass | SPYGLASS | `item_CrackedSpyglass.glb` |
| DimensionalSundial | SUNDIAL | `item_DimensionalSundial.glb` |
| ExoticCrystals | EXOTIC_CRYSTALS | `item_ExoticCrystals.glb` |
| EyeOfNewt | EYE_OF_NEWT | `item_EyeOfNewt.glb` |
| FerretTuft | FERRET_TUFT | `item_FerretTuft.glb` |
| MimicTooth | MIMIC_TOOTH | `item_MimicTooth.glb` |
| MossyClump | MOSSY_CLUMP | `item_MossyClump.glb` |
| ParchmentScrap | PARCHMENT_SCRAP | `item_ParchmentScrap.glb` |
| PetrifiedSeed | PETRIFIED_SEED | `item_PetrifiedSeed.glb` |
| RatSkull | RAT_SKULL | `item_RatSkull.glb` |
| SaltCube | SALT_CUBE | `item_SaltCube.glb` |
| ShardOfOblivion | OBLIVION_SHARD | `item_ShardOfOblivion.glb` |
| ThirteenLeafClover | CLOVER | `item_ThirteenLeafClover.glb` |
| TrapMechanism | TRAP_MECHANISM | `item_TrapMechanism.glb` |
| Trinket.PlaceHolder | TRINKET_HOLDER | `item_Trinket.PlaceHolder.glb` |
| TrinketCatalyst | TRINKET_CATA | `item_TrinketCatalyst.glb` |
| TrinketCatalyst.RandomTrinket | SOMETHING | `item_TrinketCatalyst.RandomTrinket.glb` |
| VialOfBlood | BLOOD_VIAL | `item_VialOfBlood.glb` |
| WondrousResin | WONDROUS_RESIN | `item_WondrousResin.glb` |

### `wands` (15)

| Item (code) | Image (code) | File |
|---|---|---|
| Wand.PlaceHolder | WAND_HOLDER | `item_Wand.PlaceHolder.glb` |
| WandOfBlastWave | WAND_BLAST_WAVE | `item_WandOfBlastWave.glb` |
| WandOfCorrosion | WAND_CORROSION | `item_WandOfCorrosion.glb` |
| WandOfCorruption | WAND_CORRUPTION | `item_WandOfCorruption.glb` |
| WandOfDisintegration | WAND_DISINTEGRATION | `item_WandOfDisintegration.glb` |
| WandOfFireblast | WAND_FIREBOLT | `item_WandOfFireblast.glb` |
| WandOfFrost | WAND_FROST | `item_WandOfFrost.glb` |
| WandOfLightning | WAND_LIGHTNING | `item_WandOfLightning.glb` |
| WandOfLivingEarth | WAND_LIVING_EARTH | `item_WandOfLivingEarth.glb` |
| WandOfMagicMissile | WAND_MAGIC_MISSILE | `item_WandOfMagicMissile.glb` |
| WandOfPrismaticLight | WAND_PRISMATIC_LIGHT | `item_WandOfPrismaticLight.glb` |
| WandOfRegrowth | WAND_REGROWTH | `item_WandOfRegrowth.glb` |
| WandOfRegrowth.Seed | inherited or set at runtime | `item_WandOfRegrowth.Seed.glb` |
| WandOfTransfusion | WAND_TRANSFUSION | `item_WandOfTransfusion.glb` |
| WandOfWarding | WAND_WARDING | `item_WandOfWarding.glb` |

### `weapon` (2)

| Item (code) | Image (code) | File |
|---|---|---|
| SpiritBow | SPIRIT_BOW | `item_SpiritBow.glb` |
| SpiritBow.SpiritArrow | SPIRIT_ARROW | `item_SpiritBow.SpiritArrow.glb` |

### `weapon/curses` (1)

| Item (code) | Image (code) | File |
|---|---|---|
| Explosive.ExplosiveCurseBomb | inherited or set at runtime | `item_Explosive.ExplosiveCurseBomb.glb` |

### `weapon/melee` (33)

| Item (code) | Image (code) | File |
|---|---|---|
| AssassinsBlade | ASSASSINS_BLADE | `item_AssassinsBlade.glb` |
| BattleAxe | BATTLE_AXE | `item_BattleAxe.glb` |
| Crossbow | CROSSBOW | `item_Crossbow.glb` |
| Cudgel | CUDGEL | `item_Cudgel.glb` |
| Dagger | DAGGER | `item_Dagger.glb` |
| Dirk | DIRK | `item_Dirk.glb` |
| Flail | FLAIL | `item_Flail.glb` |
| Gauntlet | GAUNTLETS | `item_Gauntlet.glb` |
| Glaive | GLAIVE | `item_Glaive.glb` |
| Gloves | GLOVES | `item_Gloves.glb` |
| Greataxe | GREATAXE | `item_Greataxe.glb` |
| Greatshield | GREATSHIELD | `item_Greatshield.glb` |
| Greatsword | GREATSWORD | `item_Greatsword.glb` |
| HandAxe | HAND_AXE | `item_HandAxe.glb` |
| Katana | KATANA | `item_Katana.glb` |
| Longsword | LONGSWORD | `item_Longsword.glb` |
| Mace | MACE | `item_Mace.glb` |
| MagesStaff | MAGES_STAFF | `item_MagesStaff.glb` |
| MeleeWeapon | inherited or set at runtime | `item_MeleeWeapon.glb` |
| Quarterstaff | QUARTERSTAFF | `item_Quarterstaff.glb` |
| Rapier | RAPIER | `item_Rapier.glb` |
| RoundShield | ROUND_SHIELD | `item_RoundShield.glb` |
| RunicBlade | RUNIC_BLADE | `item_RunicBlade.glb` |
| Sai | SAI | `item_Sai.glb` |
| Scimitar | SCIMITAR | `item_Scimitar.glb` |
| Shortsword | SHORTSWORD | `item_Shortsword.glb` |
| Sickle | SICKLE | `item_Sickle.glb` |
| Spear | SPEAR | `item_Spear.glb` |
| Sword | SWORD | `item_Sword.glb` |
| WarHammer | WAR_HAMMER | `item_WarHammer.glb` |
| WarScythe | WAR_SCYTHE | `item_WarScythe.glb` |
| Whip | WHIP | `item_Whip.glb` |
| WornShortsword | WORN_SHORTSWORD | `item_WornShortsword.glb` |

### `weapon/missiles` (16)

| Item (code) | Image (code) | File |
|---|---|---|
| Bolas | BOLAS | `item_Bolas.glb` |
| FishingSpear | FISHING_SPEAR | `item_FishingSpear.glb` |
| ForceCube | FORCE_CUBE | `item_ForceCube.glb` |
| HeavyBoomerang | BOOMERANG | `item_HeavyBoomerang.glb` |
| Javelin | JAVELIN | `item_Javelin.glb` |
| Kunai | KUNAI | `item_Kunai.glb` |
| MissileWeapon.PlaceHolder | MISSILE_HOLDER | `item_MissileWeapon.PlaceHolder.glb` |
| Shuriken | SHURIKEN | `item_Shuriken.glb` |
| ThrowingClub | THROWING_CLUB | `item_ThrowingClub.glb` |
| ThrowingHammer | THROWING_HAMMER | `item_ThrowingHammer.glb` |
| ThrowingKnife | THROWING_KNIFE | `item_ThrowingKnife.glb` |
| ThrowingSpear | THROWING_SPEAR | `item_ThrowingSpear.glb` |
| ThrowingSpike | THROWING_SPIKE | `item_ThrowingSpike.glb` |
| ThrowingStone | THROWING_STONE | `item_ThrowingStone.glb` |
| Tomahawk | TOMAHAWK | `item_Tomahawk.glb` |
| Trident | TRIDENT | `item_Trident.glb` |

### `weapon/missiles/darts` (13)

| Item (code) | Image (code) | File |
|---|---|---|
| AdrenalineDart | ADRENALINE_DART | `item_AdrenalineDart.glb` |
| BlindingDart | BLINDING_DART | `item_BlindingDart.glb` |
| ChillingDart | CHILLING_DART | `item_ChillingDart.glb` |
| CleansingDart | CLEANSING_DART | `item_CleansingDart.glb` |
| Dart | DART | `item_Dart.glb` |
| DisplacingDart | DISPLACING_DART | `item_DisplacingDart.glb` |
| HealingDart | HEALING_DART | `item_HealingDart.glb` |
| HolyDart | HOLY_DART | `item_HolyDart.glb` |
| IncendiaryDart | INCENDIARY_DART | `item_IncendiaryDart.glb` |
| ParalyticDart | PARALYTIC_DART | `item_ParalyticDart.glb` |
| PoisonDart | POISON_DART | `item_PoisonDart.glb` |
| RotDart | ROT_DART | `item_RotDart.glb` |
| ShockingDart | SHOCKING_DART | `item_ShockingDart.glb` |

## 14. Visual effects (particles and textures, not meshes)

Effects are better built as particle systems and textured sprites than as meshes. For these, deliver **PNG textures** (power of two, 64–256 px, transparent background) and a short description of the motion; the engine builds the particles. Until replaced, the game draws its existing 2D effects projected into the 3D view.

**Gases and fields** (`actors/blobs`, 30): volumes covering tiles, e.g. toxic gas, fire, web, regrowth.

- Alchemy
- Blizzard
- ConfusionGas
- CorrosiveGas
- Electricity
- Fire
- Foliage
- Freezing
- GooWarn
- Inferno
- ParalyticGas
- Regrowth
- SacrificialFire
- SmokeScreen
- StenchGas
- StormCloud
- ToxicGas
- VaultFlameTraps
- WaterOfAwareness
- WaterOfHealth
- Web
- HallowedGround.HallowedTerrain
- WallOfLight.LightWall
- Tengu.FireBlob
- Tengu.ShockerBlob
- SkeletonKey.KeyWall
- CavesBossLevel.PylonEnergy
- MagicalFireRoom.EternalFire
- ToxicGasRoom.ToxicGasSeed
- WeakFloorRoom.WellID

**Spell projectiles** (`effects/MagicMissile.java`, 33 types; bolts and cones fired by wands, staffs and monsters):

MAGIC_MISSILE, FROST, FIRE, CORROSION, FOLIAGE, FORCE, BEACON, SHADOW, RAINBOW, EARTH, WARD, SHAMAN_RED, SHAMAN_BLUE, SHAMAN_PURPLE, SHAMAN_ELMO, ELMO, POISON, LIGHT_MISSILE, MAGIC_MISS_CONE, FROST_CONE, FIRE_CONE, CORROSION_CONE, FOLIAGE_CONE, FORCE_CONE, SHADOW_CONE, RAINBOW_CONE, EARTH_CONE, WARD_CONE, PURPLE_CONE, SPARK_CONE, BLOOD_CONE, POISON_CONE, SPECK

**Small effect symbols** (`effects/Speck.java`, 37 types; hearts, coins, notes, sparks and so on):

HEALING, STAR, LIGHT, QUESTION, UP, SCREAM, BONE, WOOL, ROCK, NOTE, CHANGE, HEART, BUBBLE, STEAM, COIN, DOWN, DISCOVER, EVOKE, MASK, CROWN, RATTLE, JET, TOXIC, CORROSION, PARALYSIS, DUST, STENCH, FORGE, CONFUSION, RED_LIGHT, CALM, SMOKE, STORM, INFERNO, BLIZZARD, YELLOW_LIGHT, BLUE_LIGHT

**Effect classes** (`effects/`, 34):

BadgeBanner, BannerSprites, Beam, BlobEmitter, CellEmitter, Chains, CheckedCell, CircleArc, DarkBlock, Degradation, Effects, EmoIcon, Enchanting, Fireball, Flare, FloatingText, GlowBlock, IceBlock, Identification, Lightning, MagicMissile, Pushing, Ripple, ShadowBox, ShieldHalo, Speck, SpellSprite, Splash, Surprise, Swap, TargetedCell, TorchHalo, Transmuting, Wound

**Particle types** (`effects/particles/`, 24):

BlastParticle, BloodParticle, ChallengeParticle, CorrosionParticle, EarthParticle, ElmoParticle, EnergyParticle, FlameParticle, FlowParticle, LeafParticle, PitfallParticle, PoisonParticle, PurpleParticle, RainbowParticle, SacrificialParticle, ShadowParticle, ShaftParticle, SmokeParticle, SnowParticle, SparkParticle, SpectralWallParticle, WebParticle, WindParticle, WoolParticle

## 15. Not needed

- The interface (toolbar, windows, health bar, inventory icons, buttons, fonts, damage numbers, status icons) stays 2D, drawn on top of the 3D view.
- Title screen, hero select splashes and other menus stay 2D.

## Regenerating this file

Both scripts read the code only. From the repository root:

```bash
python3 docs/tools/scan_assets.py core/src/main/java/com/shatteredpixel/shatteredpixeldungeon > /tmp/assets.json
```
```bash
python3 docs/tools/write_asset_doc.py /tmp/assets.json > docs/3D_ASSETS.md
```
