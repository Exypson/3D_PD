package com.shatteredpixel.shatteredpixeldungeon.teavm;

import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.HeroClass;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.abilities.ArmorAbility;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob;
import com.shatteredpixel.shatteredpixeldungeon.items.Heap;
import com.shatteredpixel.shatteredpixeldungeon.items.Item;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Rat;
import com.shatteredpixel.shatteredpixeldungeon.levels.Level;
import com.shatteredpixel.shatteredpixeldungeon.levels.Terrain;
import com.shatteredpixel.shatteredpixeldungeon.levels.features.LevelTransition;
import com.shatteredpixel.shatteredpixeldungeon.levels.traps.Trap;
import com.shatteredpixel.shatteredpixeldungeon.plants.Plant;
import com.shatteredpixel.shatteredpixeldungeon.render3d.World3D;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.shatteredpixel.shatteredpixeldungeon.tiles.CustomTilemap;
import com.shatteredpixel.shatteredpixeldungeon.scenes.InterlevelScene;
import com.watabou.noosa.Camera;
import com.watabou.noosa.Game;
import com.shatteredpixel.shatteredpixeldungeon.tiles.DungeonTilemap;
import com.watabou.utils.PathFinder;
import com.watabou.utils.Reflection;
import org.teavm.jso.JSBody;
import org.teavm.jso.JSFunctor;
import org.teavm.jso.JSObject;

// Only installed when the page URL contains ?test: lets the headless playtest trigger combat on demand.
final class TestHooks {

	@JSFunctor
	interface Action extends JSObject { void run(); }

	@JSFunctor
	interface NamedAction extends JSObject { void run(String name); }

	@JSBody(params = "f", script = "window.__spdSpawnRat = f;")
	private static native void exportSpawnRat(Action f);

	@JSBody(params = "f", script = "window.__spdSpawn = f;")
	private static native void exportSpawn(NamedAction f);

	@JSBody(params = "f", script = "window.__spdDrop = f;")
	private static native void exportDrop(NamedAction f);

	@JSBody(params = "f", script = "window.__spdHeroClass = f;")
	private static native void exportHeroClass(NamedAction f);

	@JSBody(params = "f", script = "window.__spdReveal = f;")
	private static native void exportReveal(Action f);

	@JSBody(params = "f", script = "window.__spdDescend = f;")
	private static native void exportDescend(Action f);

	@JSFunctor
	interface Query extends JSObject { String get(); }

	@JSBody(params = "f", script = "window.__spdKitStats = f;")
	private static native void exportKitStats(Query f);

	@JSFunctor
	interface Lookup extends JSObject { String get(String arg); }

	@JSBody(params = "f", script = "window.__spdCells = f;")
	private static native void exportCells(Lookup f);

	@JSBody(params = "f", script = "window.__spdLook = f;")
	private static native void exportLook(NamedAction f);

	@JSBody(params = "f", script = "window.__spdPieces = f;")
	private static native void exportPieces(Query f);

	@JSBody(params = "f", script = "window.__spdTerrain = f;")
	private static native void exportTerrain(NamedAction f);

	@JSBody(params = "f", script = "window.__spdArmorAbility = f;")
	private static native void exportArmorAbility(NamedAction f);

	@JSBody(params = "f", script = "window.__spdTrap = f;")
	private static native void exportTrap(NamedAction f);

	@JSBody(params = "f", script = "window.__spdPlant = f;")
	private static native void exportPlant(NamedAction f);

	static void install() {
		exportSpawnRat(() -> GameThreadListener.instance.post(TestHooks::spawnRat));
		exportSpawn(name -> GameThreadListener.instance.post(() -> spawnPassive(name)));
		exportDrop(name -> GameThreadListener.instance.post(() -> drop(name)));
		// visual only: lets the test see every hero model without unlocking the classes
		exportHeroClass(name -> GameThreadListener.instance.post(() -> { if (Dungeon.hero != null) Dungeon.hero.heroClass = HeroClass.valueOf(name); }));
		// map the whole level, so a screenshot can show every tile the kit draws
		exportReveal(() -> GameThreadListener.instance.post(() -> {
			if (Dungeon.level == null) return;
			java.util.Arrays.fill(Dungeon.level.visited, true);
			GameScene.updateFog();
			GameScene.updateMap();
		}));
		// take the regular stairs down, as the hero does on the exit tile
		exportDescend(() -> GameThreadListener.instance.post(() -> {
			if (Dungeon.level == null) return;
			InterlevelScene.curTransition = Dungeon.level.getTransition(LevelTransition.Type.REGULAR_EXIT);
			InterlevelScene.mode = InterlevelScene.Mode.DESCEND;
			Game.switchScene(InterlevelScene.class);
		}));
		exportKitStats(World3D::kitCoverage);
		// terrain id painted on the nearest free tile, for checking every tile kit piece
		exportTerrain(id -> GameThreadListener.instance.post(() -> {
			int c = nearestFree(true);
			if (c == -1) return;
			Level.set(c, Integer.parseInt(id));
			GameScene.updateMap(c);
		}));
		// visual only: an armour ability (relative to actors.hero.abilities), e.g. for the Rat King's Ratmogrify look
		exportArmorAbility(name -> GameThreadListener.instance.post(() -> {
			try {
				Dungeon.hero.armorAbility = (ArmorAbility) Reflection.newInstanceUnhandled(Reflection.forNameUnhandled("com.shatteredpixel.shatteredpixeldungeon.actors.hero.abilities." + name));
			} catch (Exception e) {
				System.err.println("ability " + name + " failed: " + e);
			}
		}));
		// the level's set pieces as "Class@centreCell", comma separated
		exportPieces(() -> {
			StringBuilder sb = new StringBuilder();
			if (Dungeon.level != null) for (CustomTilemap ct : Dungeon.level.customTiles) {
				String n = ct.getClass().getName();
				int centre = ct.tileX + ct.tileW / 2 + (ct.tileY + ct.tileH / 2) * Dungeon.level.width();
				sb.append(sb.length() == 0 ? "" : ",").append(n.substring(n.lastIndexOf('.') + 1).replace('$', '.')).append('@').append(centre);
			}
			return sb.toString();
		});
		// a revealed trap (e.g. "BurningTrap", or "BurningTrap!" for a used one) on the nearest free tile
		exportTrap(name -> GameThreadListener.instance.post(() -> {
			try {
				boolean used = name.endsWith("!");
				Trap t = (Trap) Reflection.newInstanceUnhandled(Reflection.forNameUnhandled("com.shatteredpixel.shatteredpixeldungeon.levels.traps." + name.replace("!", "")));
				int c = nearestFree(true);
				if (c == -1) return;
				t.reveal();
				if (used) t.active = false;
				Dungeon.level.setTrap(t, c);
				Level.set(c, used ? Terrain.INACTIVE_TRAP : Terrain.TRAP);
				GameScene.updateMap(c);
			} catch (Exception e) {
				System.err.println("trap " + name + " failed: " + e);
			}
		}));
		// a plant from its seed class, relative to the game package (e.g. "plants.Firebloom$Seed")
		exportPlant(name -> GameThreadListener.instance.post(() -> {
			try {
				Plant.Seed seed = (Plant.Seed) Reflection.newInstanceUnhandled(Reflection.forNameUnhandled("com.shatteredpixel.shatteredpixeldungeon." + name));
				int c = nearestFree(true);
				if (c != -1) Dungeon.level.plant(seed, c);
			} catch (Exception e) {
				System.err.println("plant " + name + " failed: " + e);
			}
		}));
		// cells with the given terrain id, comma separated
		exportCells(id -> {
			StringBuilder sb = new StringBuilder();
			if (Dungeon.level != null) for (int c = 0; c < Dungeon.level.length(); c++) {
				if (Dungeon.level.map[c] == Integer.parseInt(id)) sb.append(sb.length() == 0 ? "" : ",").append(c);
			}
			return sb.toString();
		});
		// centre the camera on a cell
		exportLook(cell -> GameThreadListener.instance.post(() -> {
			Camera.main.snapTo(DungeonTilemap.tileCenterToWorld(Integer.parseInt(cell)));
		}));
	}

	// an item of the given class (relative to the items package, e.g. "potions.PotionOfHealing") on the nearest free tile
	private static void drop(String name) {
		if (Dungeon.hero == null || Dungeon.level == null) return;
		try {
			String[] parts = name.split("@"); // "Gold@CHEST": a heap of that type
			Item item = (Item) Reflection.newInstanceUnhandled(Reflection.forNameUnhandled("com.shatteredpixel.shatteredpixeldungeon.items." + parts[0]));
			int best = nearestFree(true);
			if (best == -1) return;
			Heap heap = Dungeon.level.drop(item, best);
			if (parts.length > 1) { heap.type = Heap.Type.valueOf(parts[1]); heap.sprite.view(heap); }
			heap.sprite.drop(best);
		} catch (Exception e) {
			System.err.println("drop " + name + " failed: " + e);
		}
	}

	private static int nearestFree(boolean noHeap) {
		int best = -1;
		for (int c = 0; c < Dungeon.level.length(); c++) {
			if (!Dungeon.level.passable[c] || Actor.findChar(c) != null || !Dungeon.level.heroFOV[c] || (noHeap && (Dungeon.level.heaps.get(c) != null || Dungeon.level.traps.get(c) != null || Dungeon.level.plants.get(c) != null))) continue;
			if (best == -1 || Dungeon.level.distance(c, Dungeon.hero.pos) < Dungeon.level.distance(best, Dungeon.hero.pos)) best = c;
		}
		return best;
	}

	// a passive monster of the given class (e.g. "Gnoll", "Elemental$FireElemental") on the nearest free tile, for model checks
	private static void spawnPassive(String name) {
		if (Dungeon.hero == null || Dungeon.level == null) return;
		try {
			Mob mob = (Mob) Reflection.newInstanceUnhandled(Reflection.forNameUnhandled("com.shatteredpixel.shatteredpixeldungeon.actors.mobs." + name));
			int best = nearestFree(false);
			if (best == -1) return;
			mob.pos = best;
			mob.state = mob.PASSIVE;
			GameScene.add(mob);
		} catch (Exception e) {
			System.err.println("spawn " + name + " failed: " + e);
		}
	}

	// an awake, hunting rat on a free tile next to the hero
	private static void spawnRat() {
		if (Dungeon.hero == null || Dungeon.level == null) return;
		for (int n : PathFinder.NEIGHBOURS8) {
			int c = Dungeon.hero.pos + n;
			if (Dungeon.level.passable[c] && Actor.findChar(c) == null) {
				Rat rat = new Rat();
				rat.pos = c;
				rat.state = rat.HUNTING;
				GameScene.add(rat);
				return;
			}
		}
	}
}
