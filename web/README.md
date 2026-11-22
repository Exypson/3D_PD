# Pixel Dungeon 3D (web)

A 3D browser version of this GPLv3 fork of Shattered Pixel Dungeon. Plain static files, no build step.

## Run locally

```bash
cd web
python3 -m http.server 8765
```

Open http://localhost:8765. Accounts need `localhost` or HTTPS (browser crypto refuses plain-HTTP LAN addresses).

## Deploy (Cloudflare Pages)

Connect the GitHub repo, set **Build command** to empty and **Build output directory** to `web`. Everything the game needs is in that folder (three.js r128 is bundled in `vendor/`, MIT licence alongside it); only the two web fonts come from Google Fonts, with system fallbacks.

## Test

```bash
cd web
```
```bash
python3 -m http.server 8765 &
```
```bash
node test/playtest.js http://localhost:8765/ 1 walk    # everything, then walk floors 1 to 26 and win
```
```bash
node test/playtest.js                                  # same checks, but the bot fights its way down (slow)
```

Signs up two users, checks their saves stay separate, that a wrong password is refused and that signing out never lets the next player's auto-save take your run, and checks generated floors (exit always reachable, no traps in corridors). A systems section then drives the real game code through every class and its ability, every potion, scroll, wand, ring, weapon, armor, food and missile, every trap, every monster of each open region and every boss (each must act and hurt the hero; the final boss only after its guardians die), every challenge, subclass path, power, alchemy recipe and quest, the controls (examine mode, search, rest vs sleep, key rebinding, one glyph per trap type), the shop, save/load, hunger, level-up, secret doors, death, and winning by taking the Amulet. Then a bot plays from the start floor (default 1) to `DEMO_MAX_DEPTH`, beats each boss, and either confirms the demo gate holds or, on floor 26, takes the Amulet and wins. With `walk`, monsters are cleared and bosses are defeated directly, so the bot only explores and takes the stairs. Fails on any console error or if the bot ever needs its teleport fallback.

## Status

- The full game is playable: floors 1 to 25 (five regions) and the Amulet on floor 26. `DEMO_MAX_DEPTH` in `game.js` is 26; lower it to cut the game short.
- All five bosses, and the final boss's two guardians, have new original 3D models.
- Challenges: six optional toggles on the hero select screen (Starving, Blind Faith, Glass Hero, Swarming, No Upgrades, Darkness), +25% score each.
- Subclasses: after the floor-10 boss each hero picks one of two paths (Juggernaut/Duelist, Runesmith/Conduit, Shade/Scavenger, Tracker/Thornweaver).
- Powers: after the floor-15 boss, pick Blink Step, Shockwave or Second Wind (key R); recharges over ~100 turns, faster with kills.
- Alchemy: a cauldron on the third floor of each region turns three items into one (three potions, three scrolls, or two potions and a food).
- Quests: an NPC on the second floor of each region (Drowned Lamplighter, Escaped Cartographer, Mine Foreman, Bound Scholar, The Bargainer).
- Controls: every key can be rebound (menu → Controls), stored per device. The Search button taps into examine mode, a second tap searches (radius 2, Rogue 3); right-click or long-press also examines. Tap Z to rest one turn, hold Z to sleep until healed.
- Traps: each of the nine types has its own glyph plate; examine one to read what it does.
- Accounts and saves live in the browser (`auth.js`). Swap in Supabase Auth plus a saves table before launch.

## Licence

GPLv3, same as the rest of this repo. Credits to Evan Debenham (Shattered Pixel Dungeon) and Watabou (Pixel Dungeon) must stay.
