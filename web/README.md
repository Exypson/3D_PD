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
node test/playtest.js
```

Signs up two users, checks their saves stay separate, checks a wrong password is refused, then a bot plays floors 1 to 5, kills the boss and confirms the demo gate holds. Fails on any console error.

## Status

- Floors 1 to 5 (Sewers) are playable. `DEMO_MAX_DEPTH` in `game.js` stops the descent after floor 5 until the next region passes testing.
- Accounts and saves live in the browser (`auth.js`). Swap in Supabase Auth plus a saves table before launch.

## Licence

GPLv3, same as the rest of this repo. Credits to Evan Debenham (Shattered Pixel Dungeon) and Watabou (Pixel Dungeon) must stay.
