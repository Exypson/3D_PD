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

Signs up two users, checks their saves stay separate and a wrong password is refused, and checks generated floors (exit always reachable, no traps in corridors). A systems section then drives the real game code through every class and its ability, every potion, scroll, wand, ring, weapon, armor, food and missile, every trap, every monster of each open region, every boss (the final boss after its guardians), the shop, save/load, hunger, level-up, secret doors, death, and winning by taking the Amulet. Then a bot plays from the start floor (default 1) to `DEMO_MAX_DEPTH`, beats each boss, and either confirms the demo gate holds or, on floor 26, takes the Amulet and wins. With `walk`, monsters are cleared and bosses are defeated directly, so the bot only explores and takes the stairs. Fails on any console error or if the bot ever needs its teleport fallback.

## Status

- The full game is playable: floors 1 to 25 (five regions) and the Amulet on floor 26. `DEMO_MAX_DEPTH` in `game.js` is 26; lower it to cut the game short.
- All five bosses, and the final boss's two guardians, have new original 3D models.
- Accounts and saves live in the browser (`auth.js`). Swap in Supabase Auth plus a saves table before launch.

## Licence

GPLv3, same as the rest of this repo. Credits to Evan Debenham (Shattered Pixel Dungeon) and Watabou (Pixel Dungeon) must stay.
