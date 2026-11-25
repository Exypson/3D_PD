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

import com.badlogic.gdx.graphics.Camera;
import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.levels.Level;
import com.shatteredpixel.shatteredpixeldungeon.tiles.CustomTilemap;
import net.mgsx.gltf.scene3d.scene.SceneAsset;

import java.util.ArrayList;
import java.util.HashSet;

// The level's CustomTilemap visuals (carpets, Goo's nest, the rat king's room, the sewer exit) as artist set pieces
// (models3d/setpieces/setpiece_<Outer.Inner>.glb). Each 2D tile the visual shows becomes the matching node of the model.
final class SetPieces {

	private static final String[] REGIONS = {"sewers", "prison", "caves", "city", "halls"};

	private final GltfModels models;
	private Level level;
	private boolean done;
	private final ArrayList<ModelInstance> parts = new ArrayList<>();
	private final ArrayList<Integer> partCells = new ArrayList<>();
	private final ArrayList<Float> partFogs = new ArrayList<>();
	private final HashSet<Integer> replaced = new HashSet<>();

	SetPieces(GltfModels models) {
		this.models = models;
	}

	/** Builds the level's set pieces once all their models are in. True on the frame they appear (the tile kit must re-sync). */
	boolean update(Level lv) {
		if (lv != level) {
			level = lv;
			done = false;
		}
		if (done) return false;
		parts.clear();
		partCells.clear();
		partFogs.clear();
		replaced.clear();
		for (CustomTilemap ct : lv.customTiles) {
			if (!add(lv, ct)) return false; // a model is still downloading: try again next frame
		}
		done = true;
		return true;
	}

	/** True when a set piece draws this cell's terrain itself, so the tile kit leaves it empty. */
	boolean replaces(int c) {
		return done && replaced.contains(c);
	}

	void draw(Level lv, Camera cam) {
		if (!done || lv != level) return;
		int w = lv.width();
		for (int i = 0; i < parts.size(); i++) {
			int c = partCells.get(i);
			if (!lv.visited[c] && !lv.mapped[c]) continue;
			if (!cam.frustum.boundsInFrustum(c % w, 0f, c / w, 1.6f, 1.2f, 1.6f)) continue;
			float fog = World3D.fog(lv, c);
			if (fog != partFogs.get(i)) {
				TileKit.dim(parts.get(i), fog);
				partFogs.set(i, fog);
			}
			models.draw(parts.get(i));
		}
	}

	// false while the set piece's model is downloading; true when it was added, or has no model
	private boolean add(Level lv, CustomTilemap ct) {
		String name = ct.getClass().getName();
		name = name.substring(name.lastIndexOf('.') + 1).replace('$', '.');
		int region = Math.max(0, Math.min(4, (Dungeon.depth - 1) / 5));
		String file = "setpieces/setpiece_" + (name.equals("Carpet") ? "Carpet_" + REGIONS[region] : name);
		SceneAsset a = models.asset(file + ".glb");
		if (a == null && models.missing(file + ".glb")) a = models.asset(file + "_alpha.glb");
		if (a == null) return models.missing(file + ".glb") && models.missing(file + "_alpha.glb");

		int w = lv.width();
		if (name.equals("SewerBossExitRoom.SewerExit")) {
			// one model for the 3x3 visual, origin on the exit (top middle); it brings its own side walls and floor grate
			place(a, null, ct.tileX + 1, ct.tileY, w);
			for (int x = 0; x < 3; x++) replaced.add(ct.tileX + x + (ct.tileY + 1) * w);
			replaced.add(ct.tileX + ct.tileY * w);
			replaced.add(ct.tileX + 2 + ct.tileY * w);
			return true;
		}
		for (int y = 0; y < ct.tileH; y++) {
			for (int x = 0; x < ct.tileW; x++) {
				int v = ct.tileAt(x, y);
				if (v < 0 && !name.equals("GooBossRoom.GooNest")) continue; // the nest's empty 2D corners hold its rounded corner pieces
				String node;
				switch (name) {
					case "Carpet": node = v - 16 * region < 16 ? "Carpet_" + (v - 16 * region) : null; break; // 16 edge variants per region
					case "RatKingRoom.RatKingRoomDeco": node = v == 3 ? "RatKingRoom_Pillow" : v == 0 ? "RatKingRoom_Statue" : null; break;
					// the nest is modelled as a 3x3 nine-slice (0 top-left .. 4 middle .. 8 bottom-right), not by 2D tile number
					case "GooBossRoom.GooNest": node = "GooNest_" + (3 * (y == 0 ? 0 : y == ct.tileH - 1 ? 2 : 1) + (x == 0 ? 0 : x == ct.tileW - 1 ? 2 : 1)); break;
					default: node = name.substring(name.lastIndexOf('.') + 1) + "_" + v; // e.g. GooNest_4
				}
				if (node != null && a.scene.model.getNode(node, true) != null) place(a, node, ct.tileX + x, ct.tileY + y, w);
			}
		}
		return true;
	}

	private void place(SceneAsset a, String node, int x, int y, int w) {
		ModelInstance mi = node == null ? new ModelInstance(a.scene.model) : new ModelInstance(a.scene.model, node, true, true, false);
		mi.transform.setToTranslation(x, 0f, y);
		parts.add(mi);
		partCells.add(x + y * w);
		partFogs.add(-1f);
	}
}
