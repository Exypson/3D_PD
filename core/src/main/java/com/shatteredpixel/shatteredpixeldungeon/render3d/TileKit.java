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

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.graphics.Camera;
import com.badlogic.gdx.graphics.g3d.Material;
import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.graphics.g3d.attributes.ColorAttribute;
import com.badlogic.gdx.math.Vector3;
import com.badlogic.gdx.utils.JsonReader;
import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.levels.Level;
import com.shatteredpixel.shatteredpixeldungeon.levels.Terrain;
import com.shatteredpixel.shatteredpixeldungeon.tiles.DungeonTileSheet;
import com.watabou.utils.LazyAssets;
import net.mgsx.gltf.scene3d.attributes.PBRColorAttribute;
import net.mgsx.gltf.scene3d.scene.SceneAsset;

import java.util.ArrayList;
import java.util.Arrays;

// The region's artist tile kit (models3d/tiles/<region>/kit.json): one model per terrain cell, plus edge pieces.
// Cells whose pieces aren't downloaded yet (or that the kit doesn't cover) keep World3D's plain geometry.
final class TileKit {

	private static final String[] REGIONS = {"sewers", "prison", "caves", "city", "halls"};
	private static final String[] NAMES = {"CHASM", "EMPTY", "GRASS", "EMPTY_WELL", "WALL", "DOOR", "OPEN_DOOR", "ENTRANCE",
			"EXIT", "EMBERS", "LOCKED_DOOR", "PEDESTAL", "WALL_DECO", "BARRICADE", "EMPTY_SP", "HIGH_GRASS", "SECRET_DOOR",
			"SECRET_TRAP", "TRAP", "INACTIVE_TRAP", "EMPTY_DECO", "LOCKED_EXIT", "UNLOCKED_EXIT", "CUSTOM_DECO", "WELL", "STATUE",
			"STATUE_SP", "BOOKSHELF", "ALCHEMY", "WATER", "FURROWED_GRASS", "CRYSTAL_DOOR", "CUSTOM_DECO_EMPTY", "REGION_DECO",
			"REGION_DECO_ALT", "MINE_CRYSTAL", "MINE_BOULDER", "ENTRANCE_SP", "HERO_LKD_DR", "CUSTOM_DECO_WTR"}; // Terrain ids 0..39
	// neighbour order north, east, south, west, and the yaw that turns an edge piece (modelled on the -Z side) onto it
	private static final int[][] DIRS = {{0, -1}, {1, 0}, {0, 1}, {-1, 0}};
	private static final float[] EDGE_YAW = {0f, -90f, 180f, 90f};

	private final GltfModels models;
	private final SetPieces pieces;
	private String dir;          // models3d/tiles/<region>/
	private JsonValue kit;       // null while loading or when the region has no kit
	private boolean noKit;
	private Level level;
	private ModelInstance[][] cells;
	private long[] keys;
	private float[] fogs;
	/** Changes whenever the set of cells the kit draws changes, so World3D rebuilds its plain geometry. */
	int version;

	TileKit(GltfModels models, SetPieces pieces) {
		this.models = models;
		this.pieces = pieces;
	}

	static TileKit active; // test hook only (World3D.kitCoverage)

	/** Syncs the per-cell pieces with the level; call once per frame before has(). */
	void update(Level lv) {
		active = this;
		if (lv != level) {
			level = lv;
			String region = REGIONS[Math.max(0, Math.min(4, (Dungeon.depth - 1) / 5))];
			if (!("models3d/tiles/" + region + "/").equals(dir)) { dir = "models3d/tiles/" + region + "/"; kit = null; noKit = false; }
			cells = new ModelInstance[lv.length()][];
			keys = new long[lv.length()];
			fogs = new float[lv.length()];
			version++;
		}
		if (kit == null && !noKit) {
			int state = LazyAssets.state.apply(dir + "kit.json");
			if (state == LazyAssets.MISSING) noKit = true;
			if (state != LazyAssets.READY) return;
			kit = new JsonReader().parse(Gdx.files.internal(dir + "kit.json")).get("terrain");
		}
		if (kit == null) return;
		if (pieces.update(lv)) Arrays.fill(keys, Long.MIN_VALUE); // set pieces just appeared: re-sync the cells they cover
		for (int c = 0; c < lv.length(); c++) {
			if (!lv.visited[c] && !lv.mapped[c]) continue;
			long key = key(lv, c);
			if (cells[c] != null && keys[c] == key) continue;
			ModelInstance[] built = build(lv, c);
			if (built == null && cells[c] == null) continue;
			cells[c] = built;
			keys[c] = key;
			fogs[c] = -1f;
			version++;
		}
	}

	/** True when the kit draws this cell. */
	boolean has(int c) {
		return cells != null && c < cells.length && cells[c] != null;
	}

	/** Queues the cells in view for drawing, dimmed like the 2D fog of war. */
	void draw(Level lv, Camera cam) {
		if (cells == null || lv != level) return;
		int w = lv.width();
		for (int c = 0; c < cells.length; c++) {
			ModelInstance[] parts = cells[c];
			if (parts == null) continue;
			if (!cam.frustum.boundsInFrustum(c % w, -0.5f, c / w, 0.75f, 1.6f, 0.75f)) continue;
			float fog = lv.heroFOV[c] ? 1f : (lv.visited[c] ? 0.42f : 0.28f);
			if (fog != fogs[c]) {
				for (ModelInstance mi : parts) dim(mi, fog);
				fogs[c] = fog;
			}
			for (ModelInstance mi : parts) models.draw(mi);
		}
	}

	// "drawn/visited" plus the terrain names of visited cells the kit doesn't draw
	String coverage(Level lv) {
		if (lv != level) return "not synced";
		int visited = 0, drawn = 0;
		java.util.TreeMap<String, Integer> missing = new java.util.TreeMap<>();
		for (int c = 0; c < lv.length(); c++) {
			if (!lv.visited[c] && !lv.mapped[c]) continue;
			visited++;
			if (has(c)) drawn++;
			else missing.merge(NAMES[lv.map[c]], 1, Integer::sum);
		}
		return (kit == null ? (noKit ? "no kit " : "kit loading ") : "") + drawn + "/" + visited + " " + missing;
	}

	static void dim(ModelInstance mi, float f) {
		for (Material m : mi.materials) {
			m.set(PBRColorAttribute.createBaseColorFactor(new com.badlogic.gdx.graphics.Color(f, f, f, 1f)));
			ColorAttribute e = (ColorAttribute) m.get(ColorAttribute.Emissive);
			if (e != null) e.color.set(f, f, f, 1f);
		}
	}

	// terrain of the cell and its four neighbours: everything a cell's pieces depend on
	private static long key(Level lv, int c) {
		long k = lv.map[c];
		for (int[] d : DIRS) k = k * 64 + neighbour(lv, c, d);
		return k;
	}

	private static int neighbour(Level lv, int c, int[] d) {
		int w = lv.width(), x = c % w + d[0], y = c / w + d[1];
		return x < 0 || y < 0 || x >= w || y >= lv.height() ? Terrain.WALL : lv.map[y * w + x];
	}

	private JsonValue entry(int t) {
		if (t < 0 || t >= NAMES.length) return null;
		JsonValue e = kit.get(NAMES[t]);
		for (int i = 0; e != null && e.has("same_as") && i < 4; i++) e = kit.get(e.getString("same_as"));
		// set-piece cells: the set piece stands on the region's floor (or water)
		if ((e == null || !e.has("file")) && (t == Terrain.CUSTOM_DECO || t == Terrain.CUSTOM_DECO_EMPTY)) e = kit.get("EMPTY");
		if ((e == null || !e.has("file")) && t == Terrain.CUSTOM_DECO_WTR) e = kit.get("WATER");
		return e;
	}

	// null until every piece the cell needs has downloaded (or when the kit has nothing for this terrain)
	private ModelInstance[] build(Level lv, int c) {
		if (pieces.replaces(c)) return new ModelInstance[0];
		int t = lv.map[c];
		JsonValue e = entry(t);
		if (e == null || !e.has("file")) return null;
		int w = lv.width();
		float x = c % w, z = c / w;
		ArrayList<ModelInstance> parts = new ArrayList<>();

		// SPD's rule (DungeonTileSheet.getRaisedDoorTile): a wall below means the passage runs east-west
		boolean sideways = e.has("rotate") && DungeonTileSheet.wallStitcheable(neighbour(lv, c, DIRS[2]));
		if (!add(parts, variant(e, c), x, z, sideways ? 90f : 0f)) return null;

		if (e.has("edge")) for (int i = 0; i < 4; i++) {
			int n = neighbour(lv, c, DIRS[i]);
			if (entry(n) == e) continue; // same look (e.g. water next to water under a set piece): no edge
			String file = e.has("edge_next_to_wall") && DungeonTileSheet.wallStitcheable(n) ? e.getString("edge_next_to_wall") : e.getString("edge");
			if (!add(parts, file, x, z, EDGE_YAW[i])) return null;
		}
		return parts.toArray(new ModelInstance[0]);
	}

	// the same alternates the 2D tile sheet picks (DungeonTileSheet.getVisualWithAlts): floors 47.5% alt1 / 5% alt2, others 50%
	private static String variant(JsonValue e, int c) {
		JsonValue alts = e.get("variants");
		if (alts == null || DungeonTileSheet.tileVariance == null || c >= DungeonTileSheet.tileVariance.length) return e.getString("file");
		int v = DungeonTileSheet.tileVariance[c];
		if (alts.size >= 2 && v < 5) return alts.getString(1);
		if (v < (alts.size >= 2 ? 52.5f : 50f)) return alts.getString(0);
		return e.getString("file");
	}

	private boolean add(ArrayList<ModelInstance> parts, String file, float x, float z, float yaw) {
		SceneAsset a = models.asset(dir.substring("models3d/".length()) + file);
		if (a == null) return false;
		ModelInstance mi = new ModelInstance(a.scene.model);
		mi.transform.setToTranslation(x, 0f, z).rotate(Vector3.Y, yaw);
		parts.add(mi);
		return true;
	}

	static { if (NAMES.length != 40 || !NAMES[Terrain.HERO_LKD_DR].equals("HERO_LKD_DR") || !NAMES[Terrain.WATER].equals("WATER")) throw new AssertionError("TileKit.NAMES out of step with Terrain"); }
}
