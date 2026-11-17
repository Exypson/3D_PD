# Pixel Dungeon 3D (web)

A 3D browser version of this GPLv3 fork of Shattered Pixel Dungeon. Plain static files, no build step.

## Run locally

```bash
cd web
python3 -m http.server 8765
```

Open http://localhost:8765. Accounts need `localhost` or HTTPS (browser crypto refuses plain-HTTP LAN addresses).

## Deploy (Cloudflare Pages)

Connect the GitHub repo, set **Build command** to empty and **Build output directory** to `web`.

## Test

```bash
cd web && python3 -m http.server 8765 &
node test/playtest.js                              # full run, bot fights its way down
node test/playtest.js http://localhost:8765/ 11 walk   # start at floor 11, walk only
```

Signs up two users, checks their saves stay separate and a wrong password is refused, and checks generated floors (exit always reachable, no traps in corridors). A systems section then drives the real game code through every class and its ability, every potion, scroll, wand, ring, weapon, armor, food and missile, every trap, every monster of each open region, every boss, the shop, save/load, hunger, level-up, secret doors and death. Then a bot plays from the start floor (default 1) to `DEMO_MAX_DEPTH`, beats each boss and confirms the demo gate holds. With `walk`, monsters are cleared and bosses are defeated directly, so the bot only explores and takes the stairs. Fails on any console error or if the bot ever needs its teleport fallback.

## Status

- Floors 1 to 20 (four regions) are playable. `DEMO_MAX_DEPTH` in `game.js` stops the descent after floor 20 until the next region passes testing.
- The bosses on floors 5, 10, 15 and 20 have new original 3D models.
- Accounts and saves live in the browser (`auth.js`). Swap in Supabase Auth plus a saves table before launch.

## Licence

GPLv3, same as the rest of this repo. Credits to Evan Debenham (Shattered Pixel Dungeon) and Watabou (Pixel Dungeon) must stay.
