package com.shatteredpixel.shatteredpixeldungeon.teavm;

import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Rat;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.watabou.utils.PathFinder;
import org.teavm.jso.JSBody;
import org.teavm.jso.JSFunctor;
import org.teavm.jso.JSObject;

// Only installed when the page URL contains ?test: lets the headless playtest trigger combat on demand.
final class TestHooks {

	@JSFunctor
	interface Action extends JSObject { void run(); }

	@JSBody(params = "f", script = "window.__spdSpawnRat = f;")
	private static native void exportSpawnRat(Action f);

	static void install() {
		exportSpawnRat(() -> GameThreadListener.instance.post(TestHooks::spawnRat));
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
