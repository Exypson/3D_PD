/*
 * Pixel Dungeon 3D
 * Copyright (C) 2026 the Pixel Dungeon 3D contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>
 */

package com.shatteredpixel.shatteredpixeldungeon.render3d;

import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.math.Vector3;
import com.shatteredpixel.shatteredpixeldungeon.levels.traps.Trap;
import com.shatteredpixel.shatteredpixeldungeon.plants.Plant;
import com.watabou.noosa.Game;
import net.mgsx.gltf.scene3d.scene.SceneAsset;

import java.util.HashMap;
import java.util.HashSet;

// Static artist models on the floor (traps, plants, heaps), one instance per game object.
final class Props {

	private static final String[] SHAPES = {"DOTS", "WAVES", "GRILL", "STARS", "DIAMOND", "CROSSHAIR", "LARGE_DOT"}; // Trap.DOTS..
	private static final String[] COLOURS = {"RED", "ORANGE", "YELLOW", "GREEN", "TEAL", "VIOLET", "WHITE", "GREY", "BLACK"}; // Trap.RED..

	private final GltfModels models;
	private final HashMap<Object, ModelInstance> live = new HashMap<>();
	private final HashMap<Object, String> liveFile = new HashMap<>();
	private final HashMap<Object, Float> liveFog = new HashMap<>();
	private final HashMap<Object, Float> liveSquash = new HashMap<>();
	private final HashSet<Object> seen = new HashSet<>();

	Props(GltfModels models) {
		this.models = models;
	}

	/** Draws key's model this frame. False when there is no model for it (the caller draws a placeholder); true while it
	 *  downloads too, when nothing is drawn, so placeholders don't pop up and vanish again. */
	boolean put(Object key, String file, float x, float y, float z, float yaw, float fog) {
		return put(key, file, x, y, z, yaw, fog, 0f, false);
	}

	/** As above, scaled up so its footprint is about size tiles across (0: as modelled), and shrunk to about half while
	 *  squashed (someone stands on its tile), easing between the two. */
	boolean put(Object key, String file, float x, float y, float z, float yaw, float fog, float size, boolean squashed) {
		SceneAsset a = file == null ? null : models.asset(file);
		if (a == null) return file != null && !models.missing(file);
		ModelInstance mi = live.get(key);
		if (mi == null || !file.equals(liveFile.get(key))) {
			mi = new ModelInstance(a.scene.model);
			live.put(key, mi);
			liveFile.put(key, file);
			liveFog.remove(key);
		}
		Float f = liveFog.get(key);
		if (f == null || f != fog) {
			TileKit.dim(mi, fog);
			liveFog.put(key, fog);
		}
		float scale = 1f;
		if (size > 0f) {
			float across = models.footprint(file);
			if (across > 0f) scale = Math.max(1f, Math.min(3f, size / across)); // small art grows, big art stays
			Float sq = liveSquash.get(key);
			float now = sq == null ? 1f : sq, target = squashed ? 0.5f : 1f;
			now += (target - now) * Math.min(1f, Game.elapsed * 8f);
			liveSquash.put(key, now);
			scale *= now;
		}
		mi.transform.setToTranslation(x, y, z).rotate(Vector3.Y, yaw).scale(scale, scale, scale);
		models.draw(mi);
		seen.add(key);
		return true;
	}

	/** Forgets the objects that weren't drawn this frame. */
	void endFrame() {
		live.keySet().retainAll(seen);
		liveFile.keySet().retainAll(seen);
		liveFog.keySet().retainAll(seen);
		liveSquash.keySet().retainAll(seen);
		seen.clear();
	}

	// used traps keep their shape and turn black, as in the 2D tile sheet
	static String trapFile(Trap t) {
		int colour = t.active ? t.color : Trap.BLACK;
		if (t.shape < 0 || t.shape >= SHAPES.length || colour < 0 || colour >= COLOURS.length) return null;
		return "traps/trap_" + SHAPES[t.shape] + "_" + COLOURS[colour] + ".glb";
	}

	// by class name; nested classes use a dot (plant_WandOfRegrowth.Dewcatcher.glb)
	static String plantFile(Plant p) {
		String n = p.getClass().getName();
		return "plants/plant_" + n.substring(n.lastIndexOf('.') + 1).replace('$', '.') + ".glb";
	}
}
