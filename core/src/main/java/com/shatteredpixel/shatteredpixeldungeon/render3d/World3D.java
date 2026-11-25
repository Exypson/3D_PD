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
import com.badlogic.gdx.graphics.GL20;
import com.badlogic.gdx.graphics.Mesh;
import com.badlogic.gdx.graphics.PerspectiveCamera;
import com.badlogic.gdx.graphics.VertexAttribute;
import com.badlogic.gdx.graphics.glutils.ShaderProgram;
import com.badlogic.gdx.math.Matrix4;
import com.badlogic.gdx.math.collision.Ray;
import com.badlogic.gdx.utils.FloatArray;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob;
import com.shatteredpixel.shatteredpixeldungeon.items.Heap;
import com.shatteredpixel.shatteredpixeldungeon.levels.Level;
import com.shatteredpixel.shatteredpixeldungeon.levels.Terrain;
import com.shatteredpixel.shatteredpixeldungeon.levels.traps.Trap;
import com.shatteredpixel.shatteredpixeldungeon.plants.Plant;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.shatteredpixel.shatteredpixeldungeon.scenes.PixelScene;
import com.shatteredpixel.shatteredpixeldungeon.ui.RenderedTextBlock;
import com.shatteredpixel.shatteredpixeldungeon.sprites.CharSprite;
import com.watabou.glscripts.Script;
import com.watabou.glwrap.Blending;
import com.watabou.glwrap.Quad;
import com.watabou.noosa.Camera;
import com.watabou.noosa.Game;
import com.watabou.noosa.Group;
import com.watabou.noosa.NoosaScript;

import java.util.HashMap;
import java.util.HashSet;

// A 3D view of the dungeon drawn under SPD's own (unchanged) 2D interface.
// Geometry comes from the level map and fog from the hero's field of view; terrain shapes and colours are placeholders.
// Characters and items are plain placeholder tokens with name tags until real models arrive (docs/3D_ASSETS.md).
public class World3D implements GameScene.WorldView {

	private static final int STRIDE = 10; // position 3, normal 3, colour 4

	private static final String VERT =
			"attribute vec3 a_position;\nattribute vec3 a_normal;\nattribute vec4 a_color;\n" +
			"uniform mat4 u_proj;\nvarying vec4 v_color;\nvarying vec3 v_normal;\nvarying vec3 v_pos;\n" +
			"void main(){ v_color = a_color; v_normal = a_normal; v_pos = a_position; gl_Position = u_proj * vec4(a_position, 1.0); }\n";
	private static final String FRAG =
			"#ifdef GL_ES\nprecision mediump float;\n#endif\n" +
			"uniform vec3 u_hero;\nvarying vec4 v_color;\nvarying vec3 v_normal;\nvarying vec3 v_pos;\n" +
			"void main(){\n" +
			"  float diff = 0.55 + 0.45 * max(dot(normalize(v_normal), normalize(vec3(-0.4, 1.0, 0.6))), 0.0);\n" +
			"  float torch = clamp(1.3 - distance(v_pos.xz, u_hero.xz) / 7.0, 0.4, 1.15);\n" + // light falls off around the hero
			"  gl_FragColor = vec4(v_color.rgb * diff * torch, 1.0);\n" +
			"}\n";

	// floor, wall, water colours per region (sewers, prison, caves, city, halls)
	private static final float[][] REGION = {
			{0.36f, 0.42f, 0.34f,  0.30f, 0.36f, 0.30f,  0.20f, 0.42f, 0.40f},
			{0.40f, 0.40f, 0.44f,  0.33f, 0.34f, 0.40f,  0.22f, 0.34f, 0.48f},
			{0.46f, 0.38f, 0.28f,  0.40f, 0.31f, 0.22f,  0.20f, 0.36f, 0.46f},
			{0.50f, 0.44f, 0.36f,  0.44f, 0.38f, 0.30f,  0.22f, 0.38f, 0.50f},
			{0.36f, 0.24f, 0.26f,  0.30f, 0.18f, 0.22f,  0.60f, 0.20f, 0.08f},
	};

	private static final float[][] TRAP_COLORS = { // Trap.RED .. Trap.BLACK
			{0.85f, 0.2f, 0.2f}, {0.9f, 0.55f, 0.15f}, {0.9f, 0.85f, 0.2f}, {0.3f, 0.75f, 0.3f}, {0.25f, 0.75f, 0.85f},
			{0.6f, 0.35f, 0.85f}, {0.9f, 0.9f, 0.9f}, {0.55f, 0.55f, 0.55f}, {0.15f, 0.15f, 0.15f}};

	private ShaderProgram shader;
	private GltfModels models;
	private TileKit kit;
	private Props props;
	private SetPieces pieces;
	private Mesh terrainMesh, dynamicMesh;
	private int terrainVerts, dynamicVerts;
	private final FloatArray buf = new FloatArray(false, 1 << 16);
	private final PerspectiveCamera cam = new PerspectiveCamera(50, 1, 1);
	private Level builtFor;
	private long builtHash;

	@Override
	public void render() {
		Level lv = Dungeon.level;
		if (lv == null || Dungeon.hero == null) return;
		if (shader == null) {
			ShaderProgram.pedantic = false;
			shader = new ShaderProgram(VERT, FRAG);
			if (!shader.isCompiled()) throw new RuntimeException("3D shader: " + shader.getLog());
		}

		if (models == null) { models = new GltfModels(cam); pieces = new SetPieces(models); kit = new TileKit(models, pieces); props = new Props(models); }
		kit.update(lv);
		long h = stateHash(lv) * 31 + kit.version;
		if (lv != builtFor || h != builtHash) {
			buildTerrain(lv);
			terrainMesh = upload(terrainMesh);
			terrainVerts = buf.size / STRIDE;
			builtFor = lv;
			builtHash = h;
		}

		buildTokens(lv);
		kit.prefetch(); // the rest of the region's tiles, queued behind what is on screen
		updateLabels(lv);
		dynamicMesh = upload(dynamicMesh);
		dynamicVerts = buf.size / STRIDE;

		updateCamera(lv);
		kit.draw(lv, cam);
		pieces.draw(lv, cam);

		GL20 gl = Gdx.gl;
		gl.glViewport(0, 0, Gdx.graphics.getBackBufferWidth(), Gdx.graphics.getBackBufferHeight());
		gl.glDisable(GL20.GL_SCISSOR_TEST);
		gl.glDisable(GL20.GL_BLEND);
		gl.glEnable(GL20.GL_DEPTH_TEST);
		gl.glDepthFunc(GL20.GL_LEQUAL);
		gl.glClear(GL20.GL_DEPTH_BUFFER_BIT);

		shader.bind();
		shader.setUniformMatrix("u_proj", cam.combined);
		CharSprite hs = Dungeon.hero.sprite;
		shader.setUniformf("u_hero", hs != null ? spriteX(hs) : Dungeon.hero.pos % lv.width(), 0f,
				hs != null ? spriteZ(hs) : Dungeon.hero.pos / lv.width());
		if (terrainVerts > 0) terrainMesh.render(shader, GL20.GL_TRIANGLES, 0, terrainVerts);
		if (dynamicVerts > 0) dynamicMesh.render(shader, GL20.GL_TRIANGLES, 0, dynamicVerts);
		models.render(); // artist models (gdx-gltf), same depth buffer

		// hand GL back to SPD's 2D renderer in the state it caches
		gl.glDisable(GL20.GL_DEPTH_TEST);
		Blending.useDefault();
		Quad.bindIndices();
		Script.unuse();
		NoosaScript.get().resetCamera();
	}

	/** Test hook: how much of the current level the artist tile kit draws. */
	public static String kitCoverage() {
		return TileKit.active == null || Dungeon.level == null ? "no kit yet" : TileKit.active.coverage(Dungeon.level);
	}

	// test hook: what was drawn as a placeholder in the last frame (characters, props) and how many plain terrain cells
	private static final java.util.ArrayList<String> standIns = new java.util.ArrayList<>();
	private static int plainCells;

	public static String placeholders() {
		return "plainCells=" + plainCells + " standIns=" + standIns
				+ " hero=" + (Dungeon.hero == null ? -1 : Dungeon.hero.pos) + " heroClips=" + GltfModels.heroClips
				+ " yaw=" + (GameScene.worldView == null ? 0 : Math.round(GameScene.worldView.yaw()));
	}

	@Override
	public int cellAt(float screenX, float screenY) {
		Level lv = Dungeon.level;
		if (lv == null) return -1;
		Ray r = cam.getPickRay(screenX, screenY, 0, 0, Game.width, Game.height);
		if (r.direction.y >= -1e-4f) return -1;
		float t = -r.origin.y / r.direction.y; // where the ray meets the floor plane
		int x = Math.round(r.origin.x + r.direction.x * t), z = Math.round(r.origin.z + r.direction.z * t);
		if (x < 0 || z < 0 || x >= lv.width() || z >= lv.height()) return -1;
		return z * lv.width() + x;
	}

	private final Matrix4 floorMap = new Matrix4(), projected = new Matrix4();

	@Override
	public void worldMatrix(float[] out) {
		// 2D world pixel (px, py) -> 3D point (px/16 - 0.5, lift, py/16 - 0.5): the same cell centres the terrain uses
		float[] v = floorMap.val;
		java.util.Arrays.fill(v, 0f);
		v[Matrix4.M00] = 1f / 16f;
		v[Matrix4.M21] = 1f / 16f;
		v[Matrix4.M03] = -0.5f;
		v[Matrix4.M13] = 0.02f; // just above the floor so effects aren't hidden in it
		v[Matrix4.M23] = -0.5f;
		v[Matrix4.M33] = 1f;
		projected.set(cam.combined).mul(floorMap);
		System.arraycopy(projected.val, 0, out, 0, 16);
	}

	// ---------- placeholder tokens and name tags (until real models exist) ----------

	private void buildTokens(Level lv) {
		buf.clear();
		modelled.clear();
		standIns.clear();
		if (models.place(Dungeon.hero)) modelled.add(Dungeon.hero); else token(Dungeon.hero, heroColor());
		for (Mob m : lv.mobs.toArray(new Mob[0])) {
			if (models.place(m)) modelled.add(m); else token(m, hashColor(m.getClass().getName()));
		}
		for (Trap tr : lv.traps.valueList()) {
			if (!tr.visible || (!lv.visited[tr.pos] && !lv.mapped[tr.pos])) { models.asset(Props.trapFile(tr)); continue; } // fetched ahead
			float fog = fog(lv, tr.pos), x = tr.pos % lv.width(), z = tr.pos / lv.width();
			if (props.put(tr, Props.trapFile(tr), x, 0f, z, 0f, fog)) { modelled.add(tr); continue; }
			float[] tc = tr.active ? TRAP_COLORS[Math.max(0, Math.min(8, tr.color))] : new float[]{0.35f, 0.35f, 0.35f};
			standIns.add("trap");
			top(x, z, 0.01f, 0.55f, tc[0] * fog, tc[1] * fog, tc[2] * fog);
		}
		for (Plant p : lv.plants.valueList()) {
			if (!lv.visited[p.pos] && !lv.mapped[p.pos]) { models.asset(Props.plantFile(p)); continue; }
			float fog = fog(lv, p.pos), x = p.pos % lv.width(), z = p.pos / lv.width();
			if (props.put(p, Props.plantFile(p), x, 0f, z, 0f, fog)) { modelled.add(p); continue; }
			float[] c = hashColor(p.getClass().getName());
			standIns.add("plant");
			box(x, 0f, z, 0.05f, 0.22f, 0.05f, 0f, 0.25f * fog, 0.55f * fog, 0.25f * fog);
			box(x, 0.22f, z, 0.16f, 0.1f, 0.16f, 0.785f, c[0] * fog, c[1] * fog, c[2] * fog);
		}
		for (Heap h : lv.heaps.valueList()) {
			if (h.sprite == null || !h.sprite.visible) { models.asset(models.heapFile(h)); continue; } // shown once seen, also in the fog, as in 2D
			float fog = fog(lv, h.pos), x = h.pos % lv.width(), z = h.pos / lv.width();
			float lift = Math.max(0f, (h.sprite.worldToCamera(h.pos).y - h.sprite.y) / 16f); // the toss when an item is dropped
			boolean shop = h.type == Heap.Type.FOR_SALE;
			if (models.heapFile(h) == null && models.itemIndexLoading()) { modelled.add(h); continue; } // its model isn't known yet
			// shop items stand on a price mat; h.sprite keys the mat since h keys the item
			if ((!shop || props.put(h.sprite, "heaps/heap_FOR_SALE.glb", x, 0f, z, 0f, fog))
					&& props.put(h, models.heapFile(h), x, lift + (shop ? 0.07f : 0f), z, 0f, fog)) { modelled.add(h); continue; }
			if (!lv.heroFOV[h.pos]) continue;
			standIns.add("heap:" + h.type + (h.peek() == null ? "" : ":" + h.peek().getClass().getSimpleName()));
			switch (h.type) {
				case CHEST: case LOCKED_CHEST: case CRYSTAL_CHEST: box(x, 0f, z, 0.45f, 0.32f, 0.34f, 0f, 0.5f, 0.34f, 0.18f); break;
				case TOMB: box(x, 0f, z, 0.45f, 0.3f, 0.7f, 0f, 0.55f, 0.55f, 0.55f); break;
				case SKELETON: case REMAINS: box(x, 0f, z, 0.4f, 0.06f, 0.3f, 0.6f, 0.85f, 0.82f, 0.75f); break;
				default: {
					float[] c = h.peek() == null ? new float[]{0.8f, 0.8f, 0.8f} : hashColor(h.peek().getClass().getName());
					box(x, 0.08f, z, 0.2f, 0.2f, 0.2f, Game.timeTotal * 1.5f + h.pos, c[0], c[1], c[2]);
				}
			}
		}
		props.endFrame();
	}

	// a plain pawn: base, body, head. Bosses and large creatures are bigger, flyers float over their base.
	private void token(Char ch, float[] c) {
		CharSprite s = ch.sprite;
		if (s == null || !s.visible || !ch.isAlive()) return;
		standIns.add(ch.getClass().getSimpleName());
		float x = spriteX(s), z = spriteZ(s);
		float k = Char.hasProp(ch, Char.Property.BOSS) ? 1.5f : (Char.hasProp(ch, Char.Property.LARGE) ? 1.25f : 1f);
		float lift = ch.flying ? 0.3f : 0f;
		box(x, 0f, z, 0.55f * k, 0.05f, 0.55f * k, 0f, c[0] * 0.35f, c[1] * 0.35f, c[2] * 0.35f);
		box(x, 0.05f + lift, z, 0.34f * k, 0.42f * k, 0.34f * k, 0f, c[0], c[1], c[2]);
		box(x, 0.05f + lift + 0.42f * k, z, 0.26f * k, 0.24f * k, 0.26f * k, 0f,
				Math.min(1f, c[0] * 1.3f + 0.1f), Math.min(1f, c[1] * 1.3f + 0.1f), Math.min(1f, c[2] * 1.3f + 0.1f));
	}

	private static float[] heroColor() {
		switch (Dungeon.hero.heroClass) {
			case WARRIOR: return new float[]{0.72f, 0.22f, 0.18f};
			case MAGE: return new float[]{0.42f, 0.29f, 0.78f};
			case ROGUE: return new float[]{0.3f, 0.33f, 0.4f};
			case HUNTRESS: return new float[]{0.23f, 0.54f, 0.29f};
			case DUELIST: return new float[]{0.7f, 0.55f, 0.2f};
			default: return new float[]{0.85f, 0.82f, 0.7f};
		}
	}

	// a stable colour per class name, so each monster or item type keeps its colour
	private static float[] hashColor(String name) {
		float hue = (name.hashCode() & 0xffff) / 65535f * 6f, f = hue - (int) hue, v = 0.78f, sat = 0.55f;
		float p = v * (1 - sat), q = v * (1 - sat * f), t = v * (1 - sat * (1 - f));
		switch ((int) hue % 6) {
			case 0: return new float[]{v, t, p};
			case 1: return new float[]{q, v, p};
			case 2: return new float[]{p, v, t};
			case 3: return new float[]{p, q, v};
			case 4: return new float[]{t, p, v};
			default: return new float[]{v, p, q};
		}
	}

	private final HashMap<Object, RenderedTextBlock> labels = new HashMap<>();
	private final HashSet<Object> seen = new HashSet<>();
	private final HashSet<Object> modelled = new HashSet<>(); // drawn as artist models this frame
	private Group layer;
	private final java.util.ArrayList<float[]> placed = new java.util.ArrayList<>();

	// GameScene adds this to its world layers, so the tags are updated and drawn like SPD's damage numbers
	@Override
	public Group overlay() {
		labels.clear();
		layer = new Group();
		return layer;
	}

	private void updateLabels(Level lv) {
		if (layer == null) return;
		seen.clear();
		placed.clear();
		// nearest monsters first, so in a crowd the closest ones keep their tags
		Mob[] mobs = lv.mobs.toArray(new Mob[0]);
		java.util.Arrays.sort(mobs, (a, b) -> Integer.compare(lv.distance(a.pos, Dungeon.hero.pos), lv.distance(b.pos, Dungeon.hero.pos)));
		for (Mob m : mobs) label(m, m);
		int w = lv.width();
		for (Heap h : lv.heaps.valueList()) {
			if (h.sprite == null || !h.sprite.visible || !lv.heroFOV[h.pos]) continue;
			String text = (h.type == Heap.Type.HEAP || h.type == Heap.Type.FOR_SALE) && h.peek() != null ? h.peek().name() : h.title();
			place(h, text, (h.pos % w) * 16 + 8, (h.pos / w + 1) * 16 - 11, 0xFFFFFF);
		}
		for (Trap tr : lv.traps.valueList()) {
			if (!tr.visible || !lv.heroFOV[tr.pos]) continue;
			place(tr, tr.name(), (tr.pos % w) * 16 + 8, (tr.pos / w + 1) * 16 - 4, tr.active ? 0xFFC080 : 0xA0A0A0);
		}
		for (Plant p : lv.plants.valueList()) {
			if (!lv.heroFOV[p.pos]) continue;
			place(p, p.name(), (p.pos % w) * 16 + 8, (p.pos / w + 1) * 16 - 9, 0xB0FFB0);
		}
		labels.keySet().removeIf(k -> {
			if (seen.contains(k)) return false;
			RenderedTextBlock t = labels.get(k);
			layer.remove(t);
			t.destroy();
			return true;
		});
	}

	private void label(Object key, Char ch) {
		CharSprite s = ch.sprite;
		if (s == null || !s.visible || !ch.isAlive()) return;
		int color = ch == Dungeon.hero ? 0x9AD0FF : ch.alignment == Char.Alignment.ALLY ? 0x8AFF8A : ch.alignment == Char.Alignment.ENEMY ? 0xFF9A8A : 0xFFE08A;
		float k = Char.hasProp(ch, Char.Property.BOSS) ? 1.5f : 1f;
		place(key, ch.name(), s.x + s.width() / 2f, s.y + s.height() - 15 * k, color);
	}

	private void place(Object key, String text, float centreX, float bottomY, int color) {
		if (modelled.contains(key)) return; // its 3D model identifies it; only placeholders keep a name tag
		RenderedTextBlock t = labels.get(key);
		if (t == null) { t = PixelScene.renderTextBlock(text, 6); labels.put(key, t); layer.add(t); }
		if (!text.equals(t.text())) t.text(text);
		t.hardlight(color);
		float x = centreX - t.width() / 2f, y = bottomY - t.height();
		for (float[] r : placed) {
			if (x < r[0] + r[2] && r[0] < x + t.width() && y < r[1] + r[3] && r[1] < y + t.height()) return; // would overlap a closer tag
		}
		t.setPos(x, y);
		placed.add(new float[]{x, y, t.width(), t.height()});
		seen.add(key);
	}

	// ---------- camera: follows SPD's own main camera, so its follow, drag-to-pan and pinch zoom all carry over ----------

	private void updateCamera(Level lv) {
		Camera mc = Camera.main;
		float cx = (mc.scroll.x + mc.width / 2f) / 16f - 0.5f;
		float cz = (mc.scroll.y + mc.height / 2f) / 16f - 0.5f;
		float dist = Math.max(4f, mc.height / 16f * 0.95f);
		float pitch = (float) Math.toRadians(PITCH);
		yaw += (yawTarget - yaw) * Math.min(1f, Game.elapsed * 12f); // eases a key press' 45 degree turn
		double y = Math.toRadians(yaw);
		float flat = dist * (float) Math.cos(pitch);
		cam.viewportWidth = Game.width;
		cam.viewportHeight = Game.height;
		cam.near = 0.1f;
		cam.far = 300f;
		cam.up.set(0, 1, 0);
		cam.position.set(cx + flat * (float) Math.sin(y), dist * (float) Math.sin(pitch), cz + flat * (float) Math.cos(y));
		cam.lookAt(cx, 0, cz);
		cam.update();
	}

	private static final float PITCH = 45f; // degrees above the floor
	private float yaw, yawTarget;           // orbit around the view centre; 0 = north up, as in 2D

	@Override
	public float yaw() {
		return yaw;
	}

	@Override
	public void rotate(float degrees) {
		yawTarget += degrees;
	}

	// ---------- terrain ----------

	private static long stateHash(Level lv) {
		long h = lv.width() * 31L + lv.height();
		for (int i = 0; i < lv.length(); i++) {
			h = h * 31 + (lv.map[i] | (lv.visited[i] ? 256 : 0) | (lv.mapped[i] ? 512 : 0) | (lv.heroFOV[i] ? 1024 : 0));
		}
		return h;
	}

	// 2D fog of war as a brightness: in view, explored, or only mapped
	static float fog(Level lv, int c) {
		return lv.heroFOV[c] ? 1f : (lv.visited[c] ? 0.42f : 0.28f);
	}

	private static boolean isTallBlock(int t) {
		return t == Terrain.WALL || t == Terrain.WALL_DECO || t == Terrain.SECRET_DOOR || t == Terrain.BOOKSHELF
				|| t == Terrain.MINE_CRYSTAL || t == Terrain.MINE_BOULDER;
	}

	private void buildTerrain(Level lv) {
		buf.clear();
		plainCells = 0;
		int w = lv.width();
		float[] pal = REGION[Math.max(0, Math.min(4, (Dungeon.depth - 1) / 5))];
		for (int c = 0; c < lv.length(); c++) {
			if (!lv.visited[c] && !lv.mapped[c]) continue;
			float fog = fog(lv, c);
			int t = lv.map[c], flags = Terrain.flags[t];
			float x = c % w, z = c / w;
			float chk = ((c % w + c / w) & 1) == 0 ? 1f : 0.93f; // faint checker so the floor reads as tiles
			float fr = pal[0] * chk * fog, fg = pal[1] * chk * fog, fb = pal[2] * chk * fog;

			if (kit.has(c)) continue; // drawn from the artist's tile kit
			plainCells++;
			if ((flags & Terrain.PIT) != 0) continue; // chasm: leave a hole
			if ((flags & Terrain.LIQUID) != 0) { top(x, z, -0.12f, 1f, pal[6] * fog, pal[7] * fog, pal[8] * fog); continue; }

			if (isTallBlock(t)) {
				float k = t == Terrain.BOOKSHELF ? 0.8f : 1f;
				float wr = pal[3] * fog * k, wg = pal[4] * fog * (t == Terrain.BOOKSHELF ? 0.7f : 1f), wb = pal[5] * fog * (t == Terrain.BOOKSHELF ? 0.55f : 1f);
				if (t == Terrain.MINE_CRYSTAL) { wr = 0.5f * fog; wg = 0.75f * fog; wb = 0.95f * fog; }
				wall(lv, c, x, z, 1f, wr, wg, wb);
				continue;
			}
			switch (t) {
				case Terrain.DOOR: case Terrain.LOCKED_DOOR: case Terrain.HERO_LKD_DR: case Terrain.CRYSTAL_DOOR: {
					top(x, z, 0f, 1f, fr, fg, fb);
					float dr = 0.45f, dg = 0.30f, db = 0.17f;
					if (t == Terrain.LOCKED_DOOR || t == Terrain.HERO_LKD_DR) { dr = 0.55f; dg = 0.45f; db = 0.15f; }
					if (t == Terrain.CRYSTAL_DOOR) { dr = 0.5f; dg = 0.75f; db = 0.9f; }
					box(x, 0f, z, 0.9f, 0.95f, 0.9f, 0f, dr * fog, dg * fog, db * fog);
					break;
				}
				case Terrain.OPEN_DOOR:
					top(x, z, 0f, 1f, 0.42f * fog, 0.30f * fog, 0.18f * fog);
					break;
				case Terrain.BARRICADE:
					top(x, z, 0f, 1f, fr, fg, fb);
					box(x, 0f, z, 0.85f, 0.6f, 0.85f, 0f, 0.5f * fog, 0.36f * fog, 0.2f * fog);
					break;
				case Terrain.STATUE: case Terrain.STATUE_SP:
					top(x, z, 0f, 1f, fr, fg, fb);
					box(x, 0f, z, 0.55f, 0.25f, 0.55f, 0f, 0.55f * fog, 0.55f * fog, 0.58f * fog);
					box(x, 0.25f, z, 0.35f, 0.6f, 0.35f, 0f, 0.62f * fog, 0.62f * fog, 0.66f * fog);
					break;
				case Terrain.GRASS:
					top(x, z, 0f, 1f, 0.28f * fog, 0.5f * fog * chk, 0.22f * fog);
					break;
				case Terrain.HIGH_GRASS: case Terrain.FURROWED_GRASS:
					top(x, z, 0f, 1f, 0.24f * fog, 0.44f * fog, 0.2f * fog);
					box(x, 0f, z, 0.8f, t == Terrain.HIGH_GRASS ? 0.45f : 0.15f, 0.8f, 0f, 0.3f * fog, 0.62f * fog, 0.25f * fog);
					break;
				case Terrain.EMBERS:
					top(x, z, 0f, 1f, 0.45f * fog, 0.25f * fog, 0.15f * fog);
					break;
				case Terrain.ENTRANCE: case Terrain.ENTRANCE_SP:
					top(x, z, 0f, 1f, fr, fg, fb);
					box(x, 0f, z, 0.8f, 0.12f, 0.8f, 0f, fr * 1.3f, fg * 1.3f, fb * 1.3f);
					break;
				case Terrain.EXIT: case Terrain.UNLOCKED_EXIT: case Terrain.LOCKED_EXIT:
					top(x, z, -0.3f, 0.8f, 0.08f * fog, 0.08f * fog, t == Terrain.LOCKED_EXIT ? 0.06f * fog : 0.1f * fog);
					rim(x, z, fr * 1.2f, fg * 1.2f, fb * 1.2f);
					break;
				case Terrain.EMPTY_WELL: case Terrain.WELL:
					top(x, z, 0f, 1f, fr, fg, fb);
					box(x, 0f, z, 0.7f, 0.2f, 0.7f, 0f, 0.5f * fog, 0.5f * fog, 0.52f * fog);
					top(x, z, 0.21f, 0.5f, t == Terrain.WELL ? 0.2f * fog : 0.1f * fog, t == Terrain.WELL ? 0.45f * fog : 0.1f * fog, t == Terrain.WELL ? 0.75f * fog : 0.1f * fog);
					break;
				case Terrain.ALCHEMY:
					top(x, z, 0f, 1f, fr, fg, fb);
					box(x, 0f, z, 0.6f, 0.4f, 0.6f, 0f, 0.25f * fog, 0.35f * fog, 0.25f * fog);
					break;
				case Terrain.PEDESTAL: case Terrain.EMPTY_SP:
					top(x, z, 0f, 1f, fr * 1.15f, fg * 1.15f, fb * 1.15f);
					if (t == Terrain.PEDESTAL) box(x, 0f, z, 0.5f, 0.3f, 0.5f, 0f, 0.6f * fog, 0.58f * fog, 0.5f * fog);
					break;
				default:
					if ((flags & Terrain.SOLID) != 0) { // other solid decorations: a low block
						top(x, z, 0f, 1f, fr, fg, fb);
						box(x, 0f, z, 0.7f, 0.5f, 0.7f, 0f, pal[3] * fog, pal[4] * fog, pal[5] * fog);
					} else {
						top(x, z, 0f, 1f, fr, fg, fb);
					}
			}
		}
	}

	// a wall block: top always, a side only where the neighbour isn't a wall too
	private void wall(Level lv, int c, float x, float z, float h, float r, float g, float b) {
		int w = lv.width(), cx = c % w, cz = c / w;
		top(x, z, h, 1f, r * 1.1f, g * 1.1f, b * 1.1f);
		int[][] dirs = {{0, -1}, {0, 1}, {-1, 0}, {1, 0}};
		for (int[] d : dirs) {
			int nx = cx + d[0], nz = cz + d[1];
			if (nx >= 0 && nz >= 0 && nx < w && nz < lv.height() && isTallBlock(lv.map[nz * w + nx])) continue;
			side(x, z, d[0], d[1], 0f, h, 0.5f, r, g, b);
		}
	}

	private void rim(float x, float z, float r, float g, float b) {
		for (int[] d : new int[][]{{0, -1}, {0, 1}, {-1, 0}, {1, 0}}) side(x, z, d[0], d[1], -0.3f, 0f, 0.4f, r * 0.6f, g * 0.6f, b * 0.6f);
	}

	// ---------- characters and items ----------


	static float spriteX(CharSprite s) { return (s.x + s.width() / 2f) / 16f - 0.5f; }
	static float spriteZ(CharSprite s) { return (s.y + s.height()) / 16f - 1f; }

	// ---------- geometry primitives (two triangles per face, non-indexed) ----------

	private void vert(float x, float y, float z, float nx, float ny, float nz, float r, float g, float b) {
		buf.add(x, y, z, nx);
		buf.add(ny, nz, r, g);
		buf.add(b, 1f);
	}

	private void face(float[] p, float nx, float ny, float nz, float r, float g, float b) {
		int[] order = {0, 1, 2, 0, 2, 3};
		for (int i : order) vert(p[i * 3], p[i * 3 + 1], p[i * 3 + 2], nx, ny, nz, r, g, b);
	}

	// horizontal square of the given size centred on the cell
	private void top(float x, float z, float y, float size, float r, float g, float b) {
		float s = size / 2f;
		face(new float[]{x - s, y, z - s, x - s, y, z + s, x + s, y, z + s, x + s, y, z - s}, 0, 1, 0, r, g, b);
	}

	// vertical face on one edge of a cell, from y0 to y1, half-width s from the cell centre
	private void side(float x, float z, int dx, int dz, float y0, float y1, float s, float r, float g, float b) {
		float ex = x + dx * 0.5f, ez = z + dz * 0.5f, tx = dz != 0 ? s : 0, tz = dx != 0 ? s : 0;
		face(new float[]{ex - tx, y0, ez - tz, ex - tx, y1, ez - tz, ex + tx, y1, ez + tz, ex + tx, y0, ez + tz}, dx, 0, dz, r, g, b);
	}

	// a box standing at height y, rotated by yaw around its vertical axis: top and four sides
	private void box(float x, float y, float z, float sx, float sy, float sz, float yaw, float r, float g, float b) {
		float c = (float) Math.cos(yaw), s = (float) Math.sin(yaw), hx = sx / 2f, hz = sz / 2f;
		float[][] k = new float[4][];
		float[][] corners = {{-hx, -hz}, {-hx, hz}, {hx, hz}, {hx, -hz}};
		for (int i = 0; i < 4; i++) {
			float lx = corners[i][0], lz = corners[i][1];
			k[i] = new float[]{x + lx * c - lz * s, z + lx * s + lz * c};
		}
		float y1 = y + sy;
		face(new float[]{k[0][0], y1, k[0][1], k[1][0], y1, k[1][1], k[2][0], y1, k[2][1], k[3][0], y1, k[3][1]}, 0, 1, 0, r, g, b);
		for (int i = 0; i < 4; i++) {
			float[] a = k[i], bb = k[(i + 1) % 4];
			float nx = (a[1] - bb[1]), nz = (bb[0] - a[0]);
			float len = (float) Math.sqrt(nx * nx + nz * nz);
			face(new float[]{a[0], y, a[1], a[0], y1, a[1], bb[0], y1, bb[1], bb[0], y, bb[1]}, -nx / len, 0, -nz / len, r * 0.85f, g * 0.85f, b * 0.85f);
		}
	}

	private Mesh upload(Mesh mesh) {
		int verts = buf.size / STRIDE;
		if (mesh == null || mesh.getMaxVertices() < verts) {
			if (mesh != null) mesh.dispose();
			mesh = new Mesh(false, Math.max(1024, verts * 2), 0,
					VertexAttribute.Position(), VertexAttribute.Normal(), VertexAttribute.ColorUnpacked());
		}
		mesh.setVertices(buf.items, 0, buf.size);
		return mesh;
	}
}
