package com.shatteredpixel.shatteredpixeldungeon.teavm;

import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.HeroClass;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob;
import com.shatteredpixel.shatteredpixeldungeon.items.Item;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Rat;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
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

	static void install() {
		exportSpawnRat(() -> GameThreadListener.instance.post(TestHooks::spawnRat));
		exportSpawn(name -> GameThreadListener.instance.post(() -> spawnPassive(name)));
		exportDrop(name -> GameThreadListener.instance.post(() -> drop(name)));
		// visual only: lets the test see every hero model without unlocking the classes
		exportHeroClass(name -> GameThreadListener.instance.post(() -> { if (Dungeon.hero != null) Dungeon.hero.heroClass = HeroClass.valueOf(name); }));
	}

	// an item of the given class (relative to the items package, e.g. "potions.PotionOfHealing") on the nearest free tile
	private static void drop(String name) {
		if (Dungeon.hero == null || Dungeon.level == null) return;
		try {
			Item item = (Item) Reflection.newInstanceUnhandled(Reflection.forNameUnhandled("com.shatteredpixel.shatteredpixeldungeon.items." + name));
			int best = nearestFree(true);
			if (best != -1) Dungeon.level.drop(item, best).sprite.drop(best);
		} catch (Exception e) {
			System.err.println("drop " + name + " failed: " + e);
		}
	}

	private static int nearestFree(boolean noHeap) {
		int best = -1;
		for (int c = 0; c < Dungeon.level.length(); c++) {
			if (!Dungeon.level.passable[c] || Actor.findChar(c) != null || !Dungeon.level.heroFOV[c] || (noHeap && Dungeon.level.heaps.get(c) != null)) continue;
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
