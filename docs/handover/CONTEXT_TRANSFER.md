# Context transfer: 3D PD (for a new Claude session)

You are continuing a long collaboration (started 2026-11-17, this file written 2026-11-25) that ran in a Claude Code
cloud session (`session_01SokCjQaXeK2wYsosoDz7Sp`). The user is moving to a **local** session on their Windows PC so
you can drive Godot and their Android phone directly. Read this whole file, then `ARCHITECTURE.md` (same folder),
before doing anything. Then confirm in a few lines what you understood and wait for the user's go-ahead.

---

## 1. The user and how to work with them

**Their standing preferences (verbatim from their settings):**
> Always be skeptical, cynical and question everything. Always have dry humor and sarcasm. Always keep the
> conversational tone direct and straightforward. You are authorized to pause execution if a prompt lacks sufficient
> data or clear objectives, rather than providing a generalized or "safe" response. You should ask cross questions
> before execution or an answer to clear up doubts assumptions and reduce ambiguity in your thought process.
> Prioritize truth, signal, and verifiable data over social friction or user comfort. Eliminate all filler, praise,
> sycophancy, and unnecessary agreement. Provide no introductory framing or concluding summaries unless asked.
> Have a sniper mindset, quality over quantity approach, no blind fire, be extremely accurate, precise and eagle eyed
> with seeing far and beyond.

**What that means in practice (learned the hard way):**
- They test on real devices and report precisely, with cropped screenshots. **Believe their reports** even when your
  headless tests pass. Twice my tests were green while the real thing was janky (network latency, real GPUs, real
  feel). Reproduce under realistic conditions (latency, real browsers) before declaring victory.
- They dislike over-engineering: they asked for free 360 camera rotation, then called it "a terrible idea" and had it
  removed. Build the smallest thing, show it, iterate.
- They call me out bluntly ("Bruv", "Dude"). They're usually right; correct course without grovelling. When I was
  wrong (Remote Control vs teleport), admit it in one line and move on.
- Be honest about what you didn't verify. Say "not checked" explicitly.
- Speak plainly; short answers; tables for status lists.

**Hard rules:**
1. **Never push to `live` or `dev` unless the user says so in that request** ("From now on, do not push anything to
   live or dev unless I say so"). Earlier approvals don't carry over. Ask after each finished batch. The working
   branch `claude/inspiring-ramanujan-drt7nq` can be pushed freely.
2. Phase 1 = SPD gameplay intact; gameplay changes only when they explicitly ask (they did ask for the 4-item pile rule).
3. Don't create pull requests unless asked. Commit messages end with the harness's attribution lines; no model names in
   commits/code.
4. I declined to make 3D versions of SPD's own sprites or to billboard SPD's character sprites in 3D (copying the
   original art into a new medium); the user/their artist make original 3D art from scratch. Placeholders are
   original abstract tokens.
5. The user said they'd restore `LICENSE.txt` (GPLv3); it's still missing from the repo. Remind them before any release.
6. Their friend's saves should stay compatible (SPD save format; our web saves are uncompressed but readable both ways).

**Their setup:** Windows PC with the Claude desktop app (Code tab). Android 15 phone, 24 GB RAM, octa-core (chipset not
yet given; ask). Firefox on PC and on mobile. They have an artist (or are the artist) producing `.glb` files with
Blender Python scripts (chunky voxel style). They plan to **monetize** eventually.

---

## 2. Project history (what happened, in order)

1. **Legacy JS game (superseded):** a hand-written three.js "Pixel Dungeon 3D" in `web/` (floors 1-26, accounts,
   challenges, subclasses, alchemy, armor powers, quests, playtest bot, audits fixed). Feature batch requested on it:
   search/examine, search animation, trap designs, rest vs sleep, editable controls, save compatibility (commit
   `d5b9515`). `live` still serves this.
2. **Pivot to the real SPD code:** user wanted a 1:1 port with SPD's gameplay. Options weighed; chose **TeaVM** (compile
   SPD's Java to JS) with local saves. Got the unmodified game running in a browser, then saving/loading, then the render
   loop on a TeaVM thread (`fddf4a7`..`8e4f609`). Published at `/spd/`, deployed to dev.
3. **3D view on the real game:** `World3D` drawing the dungeon in 3D under SPD's 2D UI; SPD's own combat effects
   projected into 3D (`18d77a4`, `38b67b6`). I first made my own block models for everything (`84e76ea`); user judged
   the 3D designs bad, said **they'll make the models**; I replaced mine with plain tokens + name tags (`22bb01a`) and
   wrote the asset spec `docs/3D_ASSETS.md` generated from the code (`dacbce7`). Discussed APK (Android build via
   Gradle without Android Studio is possible), load time, alternatives.
4. **Artist's region-1 pack** (`RegionOneAssets.zip`, the 400 MB+ version was mostly reference art). Integrated with
   gdx-gltf: hero first (`481970a`), lighting fixed in code (strip unlit flag, key + ambient light), walls fine at 1.0,
   characters scaled 0.85. Then **on-demand loading** (startup 53 MB -> 12 MB, `846d174`). Then **sewer monsters**
   with SPD-driven animation clips and the hero holding his weapon (`e6876c6`).
5. **"Finish region one using all the assets, step by step, cross-verify"**: tile kit, traps, plants, heaps, items,
   set pieces, all verified file-by-file against the Java sources and in game (`54135bf`). Name tags removed for
   modelled things (`a916dca`). Pushed to dev.
6. **User playtest #1 complaints:** placeholders popping in/out next to models; character always facing one way;
   wanted ~45 degree camera + full 360 rotation; walk 20% slower and smoother. Fixed (`5176963`): placeholders only for
   things without art + prefetch; facing; 45 degree orbit camera with rotation; slower walk with clip hysteresis/blend.
   Pushed to dev.
7. **User playtest #2 (the latest; 14 points, screenshots):** see section 3. Fixed in `107d7e0`, pushed to dev and
   confirmed live. **The user has not reported back on this build yet.**
8. **Step back:** user asked "what if I build this in Unity". Analysis: Unity + GPL code = license conflict (proprietary
   runtime); full C# port of ~220k lines = months + behaviour drift. Then **Godot** came up: MIT license (fine),
   Android-only target, keep the Java logic via a Godot Android plugin. Section 4.
9. Moving the session to the PC: Remote Control was the wrong tool (it exposes local sessions to other devices).
   Cloud -> local is `claude --teleport <session-id>` (CLI; then `/desktop` to move it into the app). The user chose
   this **handover-files** approach instead.

---

## 3. The latest bug list (user playtest #2) and status in `107d7e0`

| # | User's report | What was wrong / done | Status |
|---|---|---|---|
| 1 | Firefox on PC: black screen when entering the dungeon (mobile Firefox fine) | Not reproducible here (boots in Firefox 155 on Linux with software GL). Added: 3D errors fall back to 2D with log line "3D view unavailable (...)"; PBR shader bones 32 -> 24 | **Unconfirmed**: ask for that log line |
| 2 | Laggy, janky, jittery | SPD camera dead-zone follow replaced by smooth follow of the hero model; clip once per walk. Remaining: TeaVM step timing | Improved, not solved (browser limit) |
| 3 | Free 360 camera was a terrible idea, revert | Rotation code fully removed (CellSelector/KeyBindings restored); fixed 45 degree view kept | Done |
| 4 | Character not centred on tiles; into walls/door hinges; at chasm edges | Root cause: used 2D sprite position, which is drawn raised 6/16 tile (`perspectiveRaise`). Now cell centre + motion offset (`World3D.charPos`) | Done (verified) |
| 5 | Spawns inside the staircase | Same root cause (entrance model is flat in the middle) | Done |
| 6 | Search not centred around the character | Same root cause | Done |
| 7 | HP bars and !/? icons on the floor beside mobs | Overhead matrix: those layers drawn at head height | Done (verified with a rat) |
| 8 | Zoom in closer | `PixelScene.maxZoom` x4 in 3D, camera min distance 1.5 | Done |
| 9 | Slow movement + animation another 20% | `WALK_SPEED` 0.64 (steps and walk clip) | Done (~146 ms/tile measured) |
| 10 | Items too small | Scaled up to a 0.6-tile footprint (x1-x3), plants 0.5 | Done |
| 11 | Items/mobs not centred | Items were centred already; mobs fixed by #4 | Done |
| 12 | Item shrinks while someone stands on it, grows back after | Props squash, eased | Done (not seen in a screenshot yet) |
| 13 | Max 4 items per tile, extras roll to random adjacent tiles | `Level.MAX_HEAP_ITEMS`, in play only (seeds unchanged) | Done; **gameplay change, also in 2D** |
| 14 | Drain water drawn above walls | 2D wall decorations (`levelVisuals`, `levelWallVisuals`) no longer drawn in 3D | Done |

Earlier playtest #1 fixes still stand (placeholder policy, facing, slow walk); the orbit camera from it was removed in #3.

---

## 4. The Godot decision (where we are)

User's position: "With Godot I can ditch web and only focus on building on android", "I do plan to eventually
monetize", wants Godot MCP so I can do the manual labour. My assessment (stands):
- Godot works legally (MIT + GPLv3); publish full source; selling/ads OK; own art separable (get advice); no SPD name.
- Keep SPD's Java logic unchanged, in-process on Android via a Godot Android plugin (v2). No interpreter.
- The work: bridge ~1,500 logic->presentation call sites (434 files) to Godot events; rebuild SPD's windows/UI in
  Godot (~33k lines of UI code: inventory, item info, shops, talents, ~100 windows); a desktop dev loop with SPD logic in
  a separate local process (Godot editor has no JVM).
- **Recommended first step: a 1-2 week proof of concept** (ARCHITECTURE section 12). Don't port everything blindly.

Godot MCP candidates (community, unverified): Coding-Solo/godot-mcp (run/debug), ee0pdt/Godot-MCP (editor plugin),
godot-mcp-server (npm, editor over WebSocket), Godot MCP Pilot, Godot MCP Enhanced, Godot MCP Pro (paid). My pick:
Coding-Solo + one editor-plugin MCP, after checking current Godot version support and recent activity.

**Open questions to ask the user before starting:**
1. Which Godot MCP(s) to install (or let me pick and verify)?
2. Phone chipset (GPU matters, not RAM).
3. Confirm: proof of concept first, not a full port.
4. Do they want to keep the web build alive at all (dev site), or freeze it?
5. Feedback on build `107d7e0` (especially the Firefox log line and the feel).

**Install checklist for the PC** (user asked; status unknown): Godot 4.x latest stable **standard** build (not .NET);
JDK 17 (e.g. Temurin) + Android command-line SDK (or Android Studio for convenience); USB debugging enabled on the
phone (`adb devices` must list it); Git; Node.js LTS (for MCP servers via npx).

---

## 5. How to resume locally

1. Clone and check out the working branch:
   `git clone https://github.com/Exypson/3D_PD.git` -> `cd 3D_PD` -> `git checkout claude/inspiring-ramanujan-drt7nq`.
2. Read `docs/handover/ARCHITECTURE.md`, `docs/3D_ASSETS.md`, `docs/art/STYLE.md`, `docs/art/PROGRESS.md`.
3. Ask the open questions (section 4). Don't start building until answered.
4. For Godot: a new project, ideally a new folder or repo next to this one (decide with the user; GPL applies to it).
   The `.glb` assets in `core/src/main/assets/models3d/` import into Godot directly; `kit.json`, `items.json` and the
   rules in ARCHITECTURE section 5 are the spec.
5. For the web build (if still wanted): JDK 17, `./gradlew :teavm:gdx_teavm_web_js_build`, publish to `web/spd`, tests
   in `tools/playtest-3d/` (Node + Playwright; on Windows install Playwright's Chromium/Firefox yourself).

---

## 6. Lessons and gotchas (save yourself the time)

- **SPD sprite positions are raised** (`perspectiveRaise`, 6/16 tile for characters, 5/16 items): never map 2D sprite
  coordinates straight into 3D; use the logical cell + motion offset.
- **SPD's camera has a follow dead zone**; in 3D it reads as lurching. Follow the model smoothly yourself.
- SPD's game logic waits for sprite animations (motion `onComplete` -> `Char.onMotionComplete` -> next actor turn).
  Any new renderer must report "animation finished" back, or the game stalls / races.
- `CharSprite.turnTo(from, to)` is the single place every facing change goes through (moves, attacks, zaps, operate,
  noticing). Hooking it gives full 3D facing.
- `CharSprite.setMoveInterval` exists in SPD and was unused: the clean knob for step speed.
- SPD's `InputHandler` only forwards **bound** keys to listeners.
- gdx-teavm's loader: max 5 parallel downloads, FIFO. Order requests by what's on screen.
- Headless tests lie about feel and network: add latency (`page.route` delay) and real-browser checks; look at frames.
- The artist's tile models have deliberate near-black wall tops; the Goo nest is a nine-slice; carpets use border
  masks; the sewer exit model replaces the walls beside it. Verify mappings against the art (footprints, colours),
  not assumptions; I got the Goo nest wrong first.
- Container/agent quirks (old cloud env): no rsync; `python3 -m http.server` dies when its dir is replaced; Firefox
  headless had no GL, worked under `xvfb-run` with `LIBGL_ALWAYS_SOFTWARE=1`.
- Region story screen needs "Continue"; stepping back onto the entrance opens a blocking dialog.

---

## 7. Useful identifiers

- Repo: `https://github.com/Exypson/3D_PD`; working branch `claude/inspiring-ramanujan-drt7nq` @ `107d7e0`;
  `dev` @ `107d7e0`; `live` @ `0588eca` (legacy JS game).
- Dev preview: `https://dev.3d-pd.pages.dev/spd/` (`?2d`, `?test`).
- Old cloud session: `session_01SokCjQaXeK2wYsosoDz7Sp` (can be teleported with
  `claude --teleport session_01SokCjQaXeK2wYsosoDz7Sp` if ever needed).
- SPD version 4.0.2 (versionCode 922), libGDX 1.14.0, gdx-teavm 1.6.2, gdx-gltf 2.3.0.
