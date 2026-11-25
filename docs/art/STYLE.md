# Art style: chunky voxel (v3)

Chosen 2026-11-24 from the Mage and Wizard mock-ups (`art/heroes/mock_mage_sheet.png`, `mock_wizard_sheet.png`),
after a Gemini 3D take on a r/PixelDungeon fan-art sheet of subclass designs. Everything built so far is being redone
in this style, **one asset at a time** (see `PROGRESS.md`). Technical rules (scale, pivots, rig, clip names, file
names) stay in `../3D_ASSETS.md`.

## The look

- **Voxels at about the sprite's own resolution: 1/22 tile.** A hero is ~25 voxels tall (1.14 tiles with hair), the
  head about half of it (10 wide, 9 deep), like SPD's 12x15 sprites.
- **Designed anatomy, sprite proportions.** Head, torso, two arms, two legs are separate blocks, each riding one bone
  of the 17-bone skeleton. Rest pose is a T-pose; arms hang **just clear** of the body (shoulder joint outside the
  torso). Never extrude the sprite's pose.
- **A real waist and hips:** chest (8 wide) over a narrower waist and belt (6 wide), then a pelvis the legs come out
  of (thigh tops tucked into it), a gap between the legs. Legs never hang straight off the shirt.
- **Armour is worn on the upper body.** Tiers change the torso, sleeves, pads and gloves; legs, pelvis and belt keep
  the cloth outfit's colours in every tier. Only a robe or long coat (a class armour) may cover the legs; the legs inside it go dark (the robe's shadow tone) so a stride reads as its folds.
- **Signature features belong to the hero, not the armour** (the Rogue's bandana mask): on in every tier; the
  class armour may recolour them (his mask turns black).
- **Armour has thickness** (it sits on the body, it isn't painted on): cloth 0.5 voxel; leather and everything heavier
  (mail, scale, plate, class armour) 1 voxel on the chest front and back. Arms and shoulder pads take half (at least
  0.5), the chest sides at most 0.5, so arms can still hang and swing. `ARMOUR_T` in `heroes/chunky_hero.py`; the mesh
  is built on a half-voxel grid for this. (Tried 3 voxels for heavy armour: it looked awful.)
- **Hoods and helmets don't grow the head:** the head inside shrinks (8 x 7 x 7, `chunky_head(xs=, ys=, top=)`) so the
  covered head is the same size as a bare one.
- **Colours straight from the SPD sprite** (and its armour rows): 1–3 tones per region placed by design (a shade on the
  sides, a darker hem). No painted lighting.
- **Faces drawn in voxels:** eyes 1x2, brows, beards and hair as their own blocks with real depth.
- **Lit by real lights:** materials are normal (lit) glTF materials, roughness 1. The look relies on one warm key light
  from the upper left in front plus a dim cool ambient; soft shadows help (see the mock-up renders).
- Robes and skirts are hollow shells so the legs move inside them.

## Budgets
Measured on the mock-ups: ~800–1,100 triangles per hero. Targets: heroes ≤ 2,000, monsters ≤ 1,500, bosses ≤ 4,000,
items ≤ 300 (round items such as bottles, built on the half-voxel grid, ≤ 1,000).

## Tools
- `heroes/chunky_hero.py`: the hero body plan, per-tier colouring, rig, clips, export.
- `tools/stage_preview.py` + `tools/grid_sheet.py`: lit renders on the sewer floor, laid out as sheets.
  Judge items (and anything on the floor) from the "game" view: the engine's camera looks down ~67 deg
  (deepcairn/src/render/view.ts), much steeper than the "q" view, so top faces are what players see.

## Still to decide when we get there
- Items (in progress): designed in 3D at 1/22 from the sprite (parts with real width and depth, not an extruded
  sprite), lying flat along the diagonal, `grip` node for held ones (`items/chunky_items.py`).
  Round things (bottles) use the half-voxel grid (`build_item(fine=True)`): at 1/22 a bottle is 6 voxels across and
  reads as a box (user: "too blocky, barely round").
  Bottles are spun from their own sprites (`lathe()`): the game's shapes per family (cone potion, round exotic,
  diamond brew, wide elixir), never invented ones.
  Take the sprite's colours, not its 2D shading: no painted highlights, glints or shimmer on items (the lights do
  that; user: "in pixelated 3D it's not required and makes it look bad").
- **Every design uses two references: the sprite AND the game's own description** (`messages/items/items.properties`,
  `...actors.properties`). The sprite gives colours and identity; the description says what the thing really is
  (the Cape of Thorns is DM-300 metal plates, not cloth). A direct 2D-to-3D trace is never enough.
- Tiles, traps, plants: same voxel size and lit look, per group.

## History
- v1 (hybrid): SPD pixel tiles on simple shapes + voxel characters at 1/32. Tiles, traps, plants, heaps, set pieces and
  items are still v1 until their turn.
- v2 (HD pixel art, 1/60 voxels, painted shading, unlit, pixel-art render pass): built for the Warrior and Mage on
  2026-11-24, then replaced by v3 the same day (`heroes/hd_*.py`, `tools/hd.py`, `tools/pixel_*.py` kept for reference).

- **Build the real object, not the sprite's picture** (2026-11-25): a pile of coins is coins in a heap, a dewdrop is a water drop, a petal is a petal. The sprite gives colours and identity; the shape comes from what the thing is in 3D.
- **Review happens in Blender**: place each built group as a row in `chunky_items.blend` and frame it; no preview screenshots unless asked.
