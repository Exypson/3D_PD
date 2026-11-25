# 3D PD: architecture and specification

State as of 2026-11-25, commit `107d7e0` on `claude/inspiring-ramanujan-drt7nq` (same commit on `dev`).
Companion file: `CONTEXT_TRANSFER.md` (history, decisions, the user, open work, next steps). Read that one first.

---

## 1. What this repository is

A GPLv3 fork of **Shattered Pixel Dungeon** (SPD, v4.0.2, Java, libGDX 1.14.0) by Evan Debenham, itself based on
Watabou's Pixel Dungeon. Goal: a **3D version of SPD** with the user's own 3D art, keeping SPD's gameplay intact in
phase 1, then adding the user's own content in later phases. Eventually monetized (see CONTEXT_TRANSFER for the
license implications).

Two things live in this repo:

1. **The current product:** SPD's own Java code compiled to JavaScript with **TeaVM** (via gdx-teavm), running in the
   browser, with SPD's 2D world view replaced by a **3D renderer** (`core/.../render3d/`) that draws the artist's
   `.glb` models. SPD's 2D interface (toolbar, windows, log, menus) stays on top unchanged. Served at `/spd/`.
2. **A legacy, superseded prototype:** `web/index.html` + `web/game.js` + `web/auth.js` + three.js r128: a separate
   hand-written JavaScript "Pixel Dungeon 3D" (floors 1-26, accounts, challenges, subclasses, alchemy, quests, a
   playtest bot in `web/test/playtest.js`). It is what the `live` branch still serves at the site root. It is not the
   real SPD and is no longer developed. Don't extend it.

**Strategic status:** the user has paused development to consider moving to **Godot (Android only)**, keeping SPD's
Java logic. See section 12 and CONTEXT_TRANSFER.

---

## 2. Modules (Gradle, `settings.gradle`)

| Module | What |
|---|---|
| `SPD-classes` | SPD's engine layer ("noosa", watabou utils, input, audio, GL wrappers). ~11.5k lines |
| `core` | The game: actors, items, levels, plants, mechanics, journal (~150k lines of logic) + scenes, windows, ui, sprites, effects, tiles (~63k lines of 2D presentation) + **`render3d/` (ours, ~1.4k lines)** |
| `android`, `ios`, `desktop` | SPD's stock platform launchers (untouched; the Android one is the obvious base for an APK) |
| `teavm` | **Ours.** Browser build: `WebLauncher`, `GameThreadListener`, `WebPlatformSupport`, `TestHooks`, generated reflection factory |
| `services` | SPD's update/news services (debug variants used by the web build) |
| `web/` | Cloudflare Pages output dir: legacy JS game at root, **`web/spd/` = committed TeaVM build output** |
| `docs/` | `3D_ASSETS.md` (asset spec, generated from code by `docs/tools/*.py`), `art/STYLE.md` + `art/PROGRESS.md` (the artist's style rules and progress log, copied from the asset pack), `handover/` (these files) |
| `tools/playtest-3d/` | Headless Playwright tests of the 3D web build (section 10) |

Key versions: Java 17 for `teavm` (game modules stay on 11), libGDX 1.14.0, gdx-teavm 1.6.2,
gdx-gltf 2.3.0 (`com.github.mgsx-dev.gdx-gltf:gltf`, from JitPack, declared in root `build.gradle`).

---

## 3. Branches, hosting, deploy

| Branch | Content | Hosted |
|---|---|---|
| `live` | `0588eca`, the legacy JS game (section 1 item 2) | Cloudflare Pages production (`3d-pd.pages.dev`) |
| `dev` | `107d7e0`, current TeaVM 3D build | Preview: **https://dev.3d-pd.pages.dev**, the game at **/spd/** |
| `claude/inspiring-ramanujan-drt7nq` | working branch (same commit as dev) | not deployed |

- Cloudflare Pages: build command empty, output dir `web`. No Java build on Cloudflare: **the TeaVM output is
  committed** into `web/spd/`. Max file size 25 MiB (minified `app.js` is ~20 MB, gzip ~2.2 MB).
- URL flags: `/spd/?2d` = SPD's original 2D view (no 3D, no model downloads). `/spd/?test` = installs test hooks
  (`window.__spd*`, section 10).
- **Rule from the user: never push to `live` or `dev` unless they explicitly say so in the current request.** Push to
  the working branch freely. Pushing dev = `git push origin HEAD:dev` (fast-forward; check
  `git merge-base --is-ancestor origin/dev HEAD` first).

---

## 4. Build and publish (web)

```bash
./gradlew :teavm:gdx_teavm_web_js_build                 # minified (~20 MB app.js), what gets published
./gradlew :teavm:gdx_teavm_web_js_build -PreadableJs    # readable names for stack traces (~70 MB, too big for Cloudflare)
```
Output: `teavm/build/dist/js/webapp/`. Publish (no rsync in the container):
```bash
rm -rf web/spd && mkdir web/spd && cp -r teavm/build/dist/js/webapp/. web/spd/ && rm -rf web/spd/WEB-INF
```
Local serving for tests: `cd teavm/build/dist/js/webapp && python3 -m http.server 8790` (restart after every rebuild,
the server dies when the dir is replaced). `web/` itself on 8795 serves the published copy.

### TeaVM-specific engineering (all needed; don't undo)

- **Lifecycle on a TeaVM thread** (`GameThreadListener`): SPD's render side waits/locks on its actor thread; TeaVM can
  only suspend code on its own threads, so every libGDX callback is queued onto one TeaVM thread. `render()` skips a
  tick if the previous frame is still running.
- **No thread interrupts** (`Actor.useThreadInterrupt = false`): TeaVM breaks locks on interrupted waits; Actor uses a
  flag + notify instead.
- **`RenderedText.actorThreadCheck = false`**: SPD's thread assertion is a false alarm under TeaVM's green threads.
- **Reflection**: TeaVM can't construct classes by name; saves (Bundle) restore objects by class name. The `teavm`
  Gradle task `generateFactory` writes `GeneratedFactory` (class name -> `new X()`) for every public class with a
  public no-arg constructor; `Reflection.factory` uses it. (A catch-all reflection pattern ran TeaVM out of 8 GB+.)
  The comment in `teavm/build.gradle` saying saves are untested is **stale**: saving/loading/continuing works.
- **Saves uncompressed** (`Bundle.compressByDefault = false`): TeaVM's Deflater fails on flush; `read()` accepts both,
  so saves stay compatible with normal SPD saves in the readable direction.
- **WebGL has no client-side arrays**: `glwrap/Attribute` streams vertex data through one shared VBO,
  `NoosaScript` streams indices through one shared IBO (shortcut: not recreated after GL context loss).
- **`DeviceCompat`** uses `Gdx.app.getType()` instead of the OS sniffing that breaks in a browser.
- **Lazy assets** (`SPD-classes/.../utils/LazyAssets.java`): a hook `state(path) -> READY | PENDING | MISSING`. The web
  launcher implements it with gdx-teavm's `AssetInstance.getLoaderInstance()` (isAssetLoaded / isAssetFailed /
  isAssetInQueueOrDownloading / loadAsset). Gradle `syncPreloadAssets` keeps `models3d/`, `music/` and non-English
  `messages/` out of the startup download (~12 MB instead of ~53 MB); `copyLazyModels` publishes them next to the game
  (`*.glb`, `*.json`, music, messages). The preload listener also fetches `freetype.js` and, if the saved language
  isn't English, that language's 9 message files. `Music` keeps a `pendingTrack` and only creates players for READY tracks.
- **gdx-teavm's asset loader downloads at most 5 files at once, first come first served** (private
  `maxMultiDownloadCount = 5`, no setter). Ask for what's on screen first (see TileKit.prefetch).
- Test hooks: `TestHooks.install()` when the URL contains `?test` (section 10).

---

## 5. The 3D renderer (`core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/render3d/`)

### 5.1 How it plugs into SPD: `GameScene.WorldView`

```java
public interface WorldView {
    void render();                          // draw the 3D world
    int cellAt(float screenX, float screenY); // tap -> map cell (-1 off-map); CellSelector uses it when set
    void worldMatrix(float[] out);          // 2D world pixels -> 3D floor plane (SPD's 2D effects drawn through it)
    Group overlay();                        // a 2D layer for name tags
    default void overheadMatrix(float[] out) // same at head height (health bars, emotes, floating text, tags)
}
public static WorldView worldView;          // set by WebLauncher unless ?2d
```
`GameScene.draw()` when `worldView != null`:
1. `worldView.render()` inside try/catch: on any Throwable -> `Game.reportException`, `GLog.w("3D view unavailable (...),
   showing 2D")`, `worldView = null`, fall back to SPD's 2D draw. (Added for the user's black screen on Firefox/PC.)
2. Two passes over the world-camera groups with the main camera's matrix swapped: pass 0 `worldMatrix` (floor:
   particles, gases, spells, targeting, emitters), pass 1 `overheadMatrix` (`healthIndicators`, `emoicons`, `statuses`,
   `TargetHealthIndicator`, the overlay). Skipped entirely (replaced by 3D): `terrain, heaps, mobs, raisedTerrain,
   walls, customWalls, wallBlocking, fog, levelVisuals, levelWallVisuals` (the last two = drain drips etc., which landed
   on wall tops when projected).
3. UI-camera groups drawn normally on top.

`CellSelector.onClick` uses `worldView.cellAt` (ray from the 3D camera to the y=0 plane). `PixelScene.maxZoom` is
`defaultZoom * 4` in 3D (2 in 2D).

### 5.2 Coordinates

- Cell `c` -> world `x = c % width`, `z = c / width` (cell centres at integers), floor at y = 0, +z = south (towards the
  camera), walls 1 tile tall. 2D pixel `(px, py)` -> `(px/16 - 0.5, lift, py/16 - 0.5 + south)`.
- **Characters: `World3D.charPos(ch)` = cell centre + (sprite.xy - sprite.worldToCamera(ch.pos)) / 16.** Never use the
  2D sprite position directly: SPD draws sprites raised by `perspectiveRaise` (6/16 tile) for its fake perspective;
  using it put every model 3/8 tile north (into walls, over chasm edges, into stairs). The offset form keeps step and
  jump motion and is exactly the cell centre at rest.

### 5.3 `World3D` (implements WorldView)

- Owns `GltfModels models`, `TileKit kit`, `Props props`, `SetPieces pieces` (created on first render) and a simple
  custom shader (position/normal/colour, directional + "torch" falloff) for the **plain fallback geometry**: procedural
  terrain for cells the kit doesn't cover (other regions, caves-only terrain) and placeholder tokens (base, body, head,
  per-class colour) for characters without a model.
- Frame: `kit.update(lv)` -> terrain mesh rebuilt when `stateHash(lv) * 31 + kit.version` changes (map, visited,
  mapped, heroFOV) -> `buildTokens` (characters, traps, plants, heaps; placeholders only when there is **no** model)
  -> `kit.prefetch()` -> `updateLabels` -> `updateCamera` -> `kit.draw`, `pieces.draw` -> GL state -> fallback meshes
  -> `models.render()` (all PBR models) -> restore SPD's GL state (`Blending.useDefault`, `Quad.bindIndices`,
  `Script.unuse`, `NoosaScript.get().resetCamera()`).
- **Placeholder policy:** a placeholder is drawn only for things with no art at all (file MISSING). While a model
  downloads (PENDING), nothing is drawn (no pop-in). `modelled` set: things drawn (or pending) as models get no name tag.
- **Fog of war:** `fog(lv, c)` = 1 in view, 0.42 explored, 0.28 only mapped; applied as material dimming.
- **Camera:** pitch 45 degrees, fixed yaw (north up). Distance `max(1.5, Camera.main.height/16 * 0.95)` (zoom = SPD's
  camera zoom). When SPD's camera follows the hero sprite, the 3D camera glides after `charPos(hero) + centerOffset/16`
  (exp smoothing, 8/s, snaps on jumps > 6 tiles) instead of SPD's dead-zone follow; otherwise (user dragged) it uses
  SPD's scroll centre. **Free camera rotation was built and removed at the user's request; don't reintroduce it.**
- Labels (`overlay()`): name tags only for placeholder things, nearest first, overlap-avoiding.
- Test hooks: `kitCoverage()`, `placeholders()` ("plainCells=N standIns=[...] hero=CELL heroClips=N").

### 5.4 `GltfModels` (gdx-gltf PBR)

- `SceneManager` with `PBRShaderProvider` (`numBones = 24`, 1 directional light, no point/spot), warm key light
  (direction (0.5,-1,-0.6), colour (1,0.93,0.82), intensity 2.2), ambient 0.45. `KHR_materials_unlit` is stripped on load
  (14 hero files carry it). `CHAR_SCALE = 0.85` (characters are authored ~1.14 tiles tall).
- `asset(file)`: cache; asks `LazyAssets.state("models3d/" + file)`; MISSING -> remembered in `missing`; PENDING -> null.
  `missing(file)` tells the two null cases apart.
- File for a character (`fileFor`): hero -> `heroes/hero_<Class>_t<tier>.glb` (tier = `Hero.tier()`, 0-6); others ->
  `characters/char_<SimpleName with $ as .>.glb`, falling back to `_alpha.glb`; Rat King with Ratmogrify armour
  ability -> `char_RatKing_Ratmogrify.glb`.
- `place(ch)`: asks for the file even when the sprite is invisible (prefetch). Returns false only when there's no model
  (token drawn); true when drawn or pending. Per-character `pose` array: yaw, last x/z, last turn count, time since moved,
  target yaw. **Facing**: towards movement direction; otherwise towards `CharSprite.turnTarget` whenever
  `turnCount` changes (attack, zap, operate, noticing); smooth turn (14/s, shortest arc). **Clips** from
  `CharSprite.animState()` (idle/walk/attack/cast/operate/die, Goo "pump"); walking held across the <0.15 s pause
  between steps; `animationController.animate(clip, loops, speed, null, 0.15 blend)`; walk at `WALK_SPEED`;
  attack/cast/operate/die play once; a repeated attack (new turn) restarts the clip; dying models stay until the sprite is gone.
- `WALK_SPEED = 0.64` (public): walk clip speed AND step pace (`CharSprite.setMoveInterval(0.1 / 0.64)` in WebLauncher).
- Hero weapon: `holdWeapon` = hero transform x `grip_R` node global transform x inverse(the item's own `grip` node).
- `heapFile(h)`: HEAP/FOR_SALE -> top item's model via `items/items.json` `by_sheet_index[Item.image()]`; other types ->
  `heaps/heap_<TYPE>.glb`. `itemIndexLoading()` while items.json downloads (heaps then wait, no placeholder).
- `footprint(file)`: widest horizontal bounding-box extent (for item scaling).
- `draw(RenderableProvider)`: per-frame list appended to the SceneManager's providers for one render, then truncated.

### 5.5 `TileKit` (terrain from `models3d/tiles/<region>/kit.json`)

- Region = `["sewers","prison","caves","city","halls"][(depth-1)/5]`; only `sewers` exists. No kit -> procedural.
- `NAMES[40]` maps `Terrain` ids to kit.json keys (static self-check). `entry(t)` follows `same_as`; set-piece cells
  (`CUSTOM_DECO`, `CUSTOM_DECO_EMPTY`) use `EMPTY`, `CUSTOM_DECO_WTR` uses `WATER`.
- Per cell: `ModelInstance[]` = base piece + edge pieces. Rebuilt when the cell's key (own terrain + 4 neighbours)
  changes. `WAIT` sentinel = pieces still downloading (drawn as nothing, retried each frame); null = no entry
  (procedural); a kit file that's MISSING -> procedural.
- **Variants** match SPD's 2D choice exactly: `DungeonTileSheet.tileVariance[c]` (0-99); floors with 2 alts: <5 alt2,
  <52.5 alt1; others <50 alt.
- **Doors** (`rotate` entries): 90 degrees when the cell below is wall-stitchable (SPD's `getRaisedDoorTile` rule).
- **Edges** (`edge`, `edge_next_to_wall`): modelled on the -Z side; yaw N 0, E -90, S 180, W 90; placed on each side whose
  neighbour has a different kit entry (`edge_next_to_wall` when that neighbour is wall-stitchable).
- `prefetch()`: once per level, after the frame's visible cells have queued their pieces, requests the region's whole
  kit (2.9 MB, 44 files). Pieces of one cell are requested together.
- `draw()`: frustum culling per cell, fog dimming via `PBRColorAttribute.BaseColorFactor` and `ColorAttribute.Emissive`.
- `has(c)` true while kit.json loads (draw nothing rather than procedural). `version` bumps make World3D rebuild the
  fallback mesh. `coverage()` for tests.

### 5.6 `Props` (traps, plants, heaps)

- One `ModelInstance` per game object (key), fog-dimmed, freed when not drawn in a frame.
- Traps: `traps/trap_<SHAPE>_<COLOUR>.glb` from `Trap.shape` / `Trap.color`; used traps -> `BLACK`.
- Plants: `plants/plant_<SimpleName with $ as .>.glb` (e.g. `plant_WandOfRegrowth.Dewcatcher.glb`), scaled to 0.5 tile.
- Heaps: shown once `heap.seen` (also in fog), with SPD's drop "toss" as a lift; FOR_SALE items sit on
  `heap_FOR_SALE.glb` (keyed by `h.sprite`); items scaled up to a 0.6-tile footprint (x1 to x3), 0.45 on a shop mat;
  **shrink to half (eased 8/s) while a character stands on the tile**.
- Trap/plant/heap files are requested even for unseen ones (prefetch).

### 5.7 `SetPieces` (SPD `CustomTilemap`s)

Reads the real 2D tile values via `CustomTilemap.tileAt(x, y)` (added) and maps them to nodes of
`setpieces/setpiece_<Outer.Inner>[_alpha].glb`:
- `Carpet` -> `setpiece_Carpet_<region>.glb`, node `Carpet_<value - 16*region>` (= border mask: top 1, right 2,
  bottom 4, left 8; verified for all 16).
- `GooBossRoom.GooNest` -> **nine-slice by position** in its rectangle: `GooNest_<3*row + col>` (0 top-left ... 4 middle
  ... 8 bottom-right), corner cells included (SPD leaves them empty). Not by tile value.
- `RatKingRoom.RatKingRoomDeco`: value 3 -> `RatKingRoom_Pillow`, 0 -> `RatKingRoom_Statue`. (`RatKingStatues`,
  `StatueOverhang` are 2D layering only.)
- `SewerBossExitRoom.SewerExit`: whole model, origin on the exit cell (`tileX+1, tileY`); it **replaces** the kit at the
  two cells beside the exit and the grate row below (TileKit leaves those empty). `SewerExitOverhang`: no model.
- Built once per level when all its models are in; `replaces(c)`; TileKit re-syncs when they appear.

---

## 6. SPD files modified outside render3d (all small; keep the list in sync)

| File | Change |
|---|---|
| `SPD-classes/.../glwrap/Attribute.java` | stream VBO for client-side vertex arrays (WebGL) |
| `SPD-classes/.../noosa/NoosaScript.java` | stream IBO for indices (WebGL) |
| `SPD-classes/.../noosa/RenderedText.java` | `actorThreadCheck` switch |
| `SPD-classes/.../noosa/Tilemap.java` | `tileAt(x, y)` |
| `SPD-classes/.../noosa/audio/Music.java` | lazy tracks (`pendingTrack`) |
| `SPD-classes/.../utils/Bundle.java` | `compressByDefault` public, switchable |
| `SPD-classes/.../utils/DeviceCompat.java` | platform checks via `Gdx.app.getType()` |
| `SPD-classes/.../utils/LazyAssets.java` | new: the lazy-asset hook |
| `SPD-classes/.../utils/Reflection.java` | pluggable `factory` |
| `core/.../actors/Actor.java` | `useThreadInterrupt` flag + flag/notify path |
| `core/.../levels/Level.java` | `MAX_HEAP_ITEMS = 4`: during play, a full HEAP sends a further drop to a random neighbour with room (16 tries, else stays); level generation untouched. **This is a gameplay rule change the user asked for; applies in 2D too.** |
| `core/.../scenes/CellSelector.java` | taps through `worldView.cellAt` |
| `core/.../scenes/GameScene.java` | WorldView interface, 3D draw passes, 2D fallback on error |
| `core/.../scenes/PixelScene.java` | `maxZoom` x4 in 3D |
| `core/.../sprites/CharSprite.java` | `animState()`; `turnFrom/turnTarget/turnCount` recorded in `turnTo` |
| `core/.../sprites/GooSprite.java` | `animState()` "pump" |
| `core/.../tiles/CustomTilemap.java` | `tileAt(x, y)` |

---

## 7. Assets (`core/src/main/assets/models3d/`, 529 `.glb`, ~26 MB)

Spec: `docs/3D_ASSETS.md`. Style and the artist's log: `docs/art/STYLE.md`, `docs/art/PROGRESS.md` (chunky voxel v3,
voxel = 1/22 tile, lit materials roughness 1, warm key light upper-left front + dim cool ambient). The artist builds
everything with Blender Python scripts (`heroes/chunky_*.py`, `characters/chunky_*.py`, `items/chunky_items.py`,
`sewers/chunky_sewers.py`, ...) that are **not in this repo** (they're in the user's asset project); only exports are here.
Source pack: `RegionOneAssets.zip` (Models/, Textures/, STYLE.md, PROGRESS.md).

| Folder | Files | Convention |
|---|---|---|
| `heroes/` | 42 + `heroes.json` | `hero_<Class>_t<0..6>.glb`; 17-bone skeleton shared per class; clips idle/walk/attack/cast/operate/read/die (30 fps, hits at 50%); empties `grip_R`, `grip_L`, `back`, `head_top`; rest pose T-pose |
| `characters/` | 19 | `char_<Class>[ _alpha].glb`, nested classes with a dot; region 1 complete: Rat, Albino, FetidRat, Snake, Gnoll, GnollExile, GnollTrickster, Swarm, Crab, HermitCrab, GreatCrab, Slime, CausticSlime, Thief, Bandit, Goo (+pump clip), Ghost (`_alpha`), RatKing, RatKing_Ratmogrify. Max 17 joints (Gnoll) |
| `items/` | 333 + `items.json` | `by_sheet_index` (Item.image() -> file); lie flat, `grip` node (tip direction = the node's local -Z, Blender +Y); all centred on origin; footprints 0.14-0.71 tile |
| `heaps/` | 9 | `heap_<Heap.Type>.glb` (+ GRAVE, EBONY_CHEST: no game use) |
| `traps/` | 63 + `README.json` | 7 shapes x 9 colours; 38 used by SPD's 32 trap classes (active + used/BLACK) |
| `plants/` | 15 | `plant_<Class>.glb` |
| `tiles/sewers/` | 44 + `kit.json` | one model per terrain (1x1 tile, floor top at y = 0, walls 0..1 with a near-black top cap = deliberate), variants, `_edge` pieces on the -Z side, `rotate` for doors |
| `setpieces/` | 4 | section 5.7 |

Textures are small palette strips (N x 1 px) per model. Every model was validated (buffers, PNGs, normals, triangles).
**Not in the region-1 pack:** Mimic, SentryRoom.Sentry (appear on floors 1-5, shown as tokens), plus all later regions.

---

## 8. What the 3D web build does today (verified)

- Floors 1-5 fully from the kit (100% of explored cells), every terrain type, doors, edges, traps (38/38 files),
  plants (15/15), heaps (7 types), all 226 item classes, set pieces (Goo nest, sewer exit, Rat King room, carpets).
- Characters centred on tiles, facing where they walk/act, walk clip once per walk, 64% step speed (median ~146 ms/tile
  measured in software rendering vs 156 target).
- Health bars/emotes above heads; items enlarged and shrinking under characters; 4-item piles.
- No placeholder pop-in for things with art; region kit prefetch; start room complete ~2 s after "Continue" at 150 ms
  per-file latency.
- Boots in Chromium and in Firefox (Linux, software GL). The user's Firefox on Windows showed a black screen on
  entering the dungeon before the fallback was added; root cause unknown.

## 9. Known issues and limits (web build)

- Jitter: TeaVM green threads mean the next step can start a frame late (stop-go between tiles); the camera fix helped,
  not eliminated. This is a reason for leaving the browser.
- SPD 2D effects (particles, damage numbers) are still flat projections, not real 3D effects.
- Performance: the voxel tiles are heavy (walls ~2.7k verts each); fully zoomed out over a revealed map is slow on
  software GL; fine for a GPU in normal play. JS is <1% of frame time.
- Missing models: Mimic, Sentry; all regions after the sewers (procedural terrain + tokens there).
- Every lookup of a model that doesn't exist costs one or two 404 requests (plain + `_alpha` probe).
- Piles show only their top item (as SPD). Plants don't shrink under characters.
- `web/spd` is committed build output (shortcut until CI builds exist).
- LICENSE.txt and README.md were deleted in the repo history (user said they'd restore the license; GPLv3 requires it).

---

## 10. Tests (`tools/playtest-3d/`)

Headless Playwright with the pre-installed Chromium (`--use-gl=swiftshader --enable-webgl --ignore-gpu-blocklist`),
against `http://localhost:8790/?test` (readable or minified build served from `teavm/build/dist/js/webapp`). Most scripts
start a run with the same clicks: `[480,408]` title, `[92,204]` hero, `[160,557]` start, wait ~9 s, `[480,403]` region
story "Continue". **Gotchas:** the region story screen needs "Continue" before the dungeon starts; walking back onto
the entrance opens "You can't leave yet" which swallows input; hook arguments must be **strings** (`'' + n`); random
levels (choose cells adaptively).

| Script | Checks |
|---|---|
| `combat.js` | a hunting rat attacks; kill it; console errors |
| `fuzz.js` | random taps/keys, error count |
| `gallery_r1.js`, `heroes.js` | every region-1 character / hero class+tier renders |
| `side_net.js` | hero holds his weapon; lists model downloads |
| `kit.js [url] [depths]` | depth 1..N: kit coverage, fps, screenshots |
| `kitsheet.js`, `kitzoom.js`, `kitgallery.js` | close-ups per terrain type; paints all 40 terrain ids |
| `props.js`, `heaps.js` (+ `itemclasses.txt`) | every trap (active+used) and plant; every heap type and item class |
| `pieces.js` | descends to 5, finds/close-ups every set piece |
| `verify.js` | spawn centring, health bar over a hit rat, 6 items on one cell, hero on the pile |
| `pace.js` | ms per tile and walk-clip starts per walk |
| `entry2.js` | level entry with simulated latency (`LAT=800`): kit status timeline + request order |
| `explore.js` | long exploration sampling placeholders (`LATENCY=400`, `reveal`) |
| `nolabels.js`, `fps.js`, `prof.js` (CPU profile), `walk.js`, `fight.js`, `twod.js` (`?2d`) | misc |
| `ffboot.js` | Firefox: `LIBGL_ALWAYS_SOFTWARE=1 xvfb-run -a -s "-screen 0 1280x800x24" node ffboot.js` (Firefox 155 installed to `/opt/pw-browsers/firefox-1543` in the old container) |
| `sheet.py`, `glbinfo.py`, `grip.py` | contact sheets; glb summaries; weapon grip maths |

Test hooks (`?test`): `__spdSpawnRat()`, `__spdSpawn('Gnoll')` (passive), `__spdDrop('Gold')` / `'Gold@CHEST'` /
`'Torch#123'` (onto cell), `__spdHeroClass('MAGE')`, `__spdReveal()`, `__spdDescend()`, `__spdKitStats()`,
`__spdCells('5')` / `'5v'` (explored only), `__spdLook('cell')`, `__spdTrap('BurningTrap' | 'BurningTrap!')`,
`__spdPlant('plants.Firebloom$Seed')`, `__spdTerrain('id')`, `__spdArmorAbility('Ratmogrify')`, `__spdPieces()`,
`__spdPlaceholders()`, `__spdTap('cell')`.

Legacy JS game test: `node web/test/playtest.js http://localhost:8765/ 1 walk`.

---

## 11. Coding conventions in this fork

- Minimal, surgical changes to SPD; comments explain *why* in one line; `shortcut: <limit>, <when to upgrade>` for
  known limits. Plain English, no jargon in user-facing text.
- Commit messages: short title + bullet body, ending with the attribution lines the harness specifies
  (`Co-Authored-By: Claude ... <noreply@anthropic.com>` + session link). No model names in commits or code.
- Never fake results; verify with the tests/screenshots before claiming something works.

---

## 12. Proposed next architecture: Godot, Android only (not started)

Decided direction pending a proof of concept (user: "With Godot I can ditch web and only focus on building on android").

- **License:** Godot is MIT -> combining with SPD's GPLv3 is fine; the whole game must be published under GPLv3 (source
  available, anyone can build it free); selling/ads allowed; own art can likely stay under its own license as separate
  files (get legal advice before monetizing); don't use SPD's name/branding. Unity was rejected for this reason
  (proprietary runtime + GPL code).
- **Java logic stays as-is:** on Android, Godot runs inside the Android runtime; a **Godot Android plugin (v2, Godot
  4.2+)** exposes Java methods to GDScript (`@UsedByGodot`, `Engine.get_singleton`) and can emit signals back. No
  interpreter or translation.
- **The real work:** SPD logic calls its 2D presentation directly from 434 logic files (~1,500+ call sites:
  `GameScene.add/show/updateMap/updateFog/flash/selectItem/selectCell`, `sprite.operate/showStatus/emitter/drop/zap/attack/...`).
  These must go through a bridge (events to Godot, "animation finished" callbacks back, like CharSprite's motion
  callbacks drive Actor timing today). SPD's ~33k lines of windows + UI (inventory, item info, shops, talents, ~100
  windows) must be rebuilt in Godot.
- **Desktop dev loop:** the Godot editor on a PC has no JVM: run SPD logic as a separate local process talking to the
  editor over a socket; in-process on Android.
- **Proof of concept (1-2 weeks):** Godot Android app + SPD logic in-process; one sewer level from the existing `.glb`
  art; hero walking tile by tile; a rat fight; one rebuilt window (inventory); measured on the user's phone (Android 15,
  24 GB RAM, octa-core; chipset unknown); desktop test loop working.
- **Godot MCP options** (for driving the editor; community projects, unverified): Coding-Solo/godot-mcp (run/debug
  loop, `claude mcp add godot -- npx @coding-solo/godot-mcp`), ee0pdt/Godot-MCP (live editor plugin), godot-mcp-server
  (npm, live editor over WebSocket 6505), Godot MCP Pilot (scenes/nodes/scripts/run), Godot MCP Enhanced (46 tools incl.
  UI, animation, export), Godot MCP Pro (paid). Suggested: Coding-Solo + one editor-plugin MCP.
- Everything in render3d (kit rules, set-piece mappings, facing, item sizing, placeholder policy, coordinates) is the
  specification to reimplement in Godot.
