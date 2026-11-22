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
import com.badlogic.gdx.math.collision.Ray;
import com.badlogic.gdx.utils.FloatArray;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob;
import com.shatteredpixel.shatteredpixeldungeon.items.Heap;
import com.shatteredpixel.shatteredpixeldungeon.levels.Level;
import com.shatteredpixel.shatteredpixeldungeon.levels.Terrain;
import com.shatteredpixel.shatteredpixeldungeon.levels.traps.Trap;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.shatteredpixel.shatteredpixeldungeon.sprites.CharSprite;
import com.watabou.glscripts.Script;
import com.watabou.glwrap.Blending;
import com.watabou.glwrap.Quad;
import com.watabou.noosa.Camera;
import com.watabou.noosa.Game;
import com.watabou.noosa.NoosaScript;

// A 3D view of the dungeon drawn under SPD's own (unchanged) 2D interface.
// Geometry comes from the level map, fog from the hero's field of view, and characters are placed where their
// 2D sprites are, so movement timing stays SPD's own. All shapes and colours are original placeholder designs.
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
			{0.85f, 0.2f, 0.2f}, {0.9f, 0.55f, 0.15f}, {0.9f, 0.85f, 0.2f}, {0.3f, 0.75f, 0.3f},
			{0.25f, 0.75f, 0.85f}, {0.6f, 0.35f, 0.85f}, {0.85f, 0.85f, 0.85f}, {0.25f, 0.25f, 0.25f}};

	private ShaderProgram shader;
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

		long h = stateHash(lv);
		if (lv != builtFor || h != builtHash) {
			buildTerrain(lv);
			terrainMesh = upload(terrainMesh);
			terrainVerts = buf.size / STRIDE;
			builtFor = lv;
			builtHash = h;
		}
		buildDynamic(lv);
		dynamicMesh = upload(dynamicMesh);
		dynamicVerts = buf.size / STRIDE;

		updateCamera(lv);

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

		// hand GL back to SPD's 2D renderer in the state it caches
		gl.glDisable(GL20.GL_DEPTH_TEST);
		Blending.useDefault();
		Quad.bindIndices();
		Script.unuse();
		NoosaScript.get().resetCamera();
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

	// ---------- camera: follows SPD's own main camera, so its follow, drag-to-pan and pinch zoom all carry over ----------

	private void updateCamera(Level lv) {
		Camera mc = Camera.main;
		float cx = (mc.scroll.x + mc.width / 2f) / 16f - 0.5f;
		float cz = (mc.scroll.y + mc.height / 2f) / 16f - 0.5f;
		float dist = Math.max(4f, mc.height / 16f * 0.95f);
		float pitch = (float) Math.toRadians(58);
		cam.viewportWidth = Game.width;
		cam.viewportHeight = Game.height;
		cam.near = 0.1f;
		cam.far = 300f;
		cam.up.set(0, 1, 0);
		cam.position.set(cx, dist * (float) Math.sin(pitch), cz + dist * (float) Math.cos(pitch));
		cam.lookAt(cx, 0, cz);
		cam.update();
	}

	// ---------- terrain ----------

	private static long stateHash(Level lv) {
		long h = lv.width() * 31L + lv.height();
		for (int i = 0; i < lv.length(); i++) {
			h = h * 31 + (lv.map[i] | (lv.visited[i] ? 256 : 0) | (lv.mapped[i] ? 512 : 0) | (lv.heroFOV[i] ? 1024 : 0));
		}
		return h;
	}

	private static boolean isTallBlock(int t) {
		return t == Terrain.WALL || t == Terrain.WALL_DECO || t == Terrain.SECRET_DOOR || t == Terrain.BOOKSHELF
				|| t == Terrain.MINE_CRYSTAL || t == Terrain.MINE_BOULDER;
	}

	private void buildTerrain(Level lv) {
		buf.clear();
		int w = lv.width();
		float[] pal = REGION[Math.max(0, Math.min(4, (Dungeon.depth - 1) / 5))];
		for (int c = 0; c < lv.length(); c++) {
			if (!lv.visited[c] && !lv.mapped[c]) continue;
			float fog = lv.heroFOV[c] ? 1f : (lv.visited[c] ? 0.42f : 0.28f);
			int t = lv.map[c], flags = Terrain.flags[t];
			float x = c % w, z = c / w;
			float chk = ((c % w + c / w) & 1) == 0 ? 1f : 0.93f; // faint checker so the floor reads as tiles
			float fr = pal[0] * chk * fog, fg = pal[1] * chk * fog, fb = pal[2] * chk * fog;

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
				case Terrain.TRAP: case Terrain.INACTIVE_TRAP: {
					top(x, z, 0f, 1f, fr, fg, fb);
					Trap trap = lv.traps.get(c);
					float[] tc = t == Terrain.INACTIVE_TRAP || trap == null ? new float[]{0.35f, 0.35f, 0.35f} : TRAP_COLORS[Math.max(0, Math.min(7, trap.color))];
					top(x, z, 0.01f, 0.55f, tc[0] * fog, tc[1] * fog, tc[2] * fog);
					break;
				}
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

	private static float spriteX(CharSprite s) { return (s.x + s.width() / 2f) / 16f - 0.5f; }
	private static float spriteZ(CharSprite s) { return (s.y + s.height()) / 16f - 1f; }

	private void buildDynamic(Level lv) {
		buf.clear();
		float time = Game.timeTotal;
		figure(Dungeon.hero, heroColor(), time);
		for (Mob m : lv.mobs.toArray(new Mob[0])) {
			figure(m, typeColor(m.getClass().getSimpleName()), time);
		}
		for (Heap heap : lv.heaps.valueList()) {
			if (heap.sprite == null || !heap.sprite.visible || !lv.heroFOV[heap.pos]) continue;
			float[] col = heap.peek() == null ? new float[]{0.8f, 0.7f, 0.3f} : typeColor(heap.peek().getClass().getSimpleName());
			float x = heap.pos % lv.width(), z = heap.pos / lv.width();
			box(x, 0.12f + 0.05f * (float) Math.sin(time * 2 + heap.pos), z, 0.26f, 0.26f, 0.26f, time * 1.3f + heap.pos, col[0], col[1], col[2]);
		}
	}

	// an original block figure: legs, body, head; bosses and large creatures are scaled up
	private void figure(Char ch, float[] col, float time) {
		CharSprite s = ch.sprite;
		if (s == null || !s.visible || !ch.isAlive()) return;
		float x = spriteX(s), z = spriteZ(s);
		float k = Char.hasProp(ch, Char.Property.BOSS) ? 1.6f : (Char.hasProp(ch, Char.Property.LARGE) ? 1.35f : 1f);
		float bob = 0.02f * (float) Math.sin(time * 3 + ch.id());
		float yaw = s.flipHorizontal ? (float) Math.PI : 0f;
		box(x, 0f, z, 0.32f * k, 0.28f * k, 0.22f * k, yaw, col[0] * 0.45f, col[1] * 0.45f, col[2] * 0.45f);
		box(x, 0.28f * k + bob, z, 0.42f * k, 0.36f * k, 0.28f * k, yaw, col[0], col[1], col[2]);
		box(x, 0.64f * k + bob, z, 0.3f * k, 0.28f * k, 0.28f * k, yaw, Math.min(1, col[0] * 1.35f + 0.1f), Math.min(1, col[1] * 1.35f + 0.1f), Math.min(1, col[2] * 1.35f + 0.1f));
	}

	private static float[] heroColor() {
		switch (Dungeon.hero.heroClass) {
			case WARRIOR: return new float[]{0.72f, 0.22f, 0.18f};
			case MAGE: return new float[]{0.42f, 0.29f, 0.78f};
			case ROGUE: return new float[]{0.3f, 0.33f, 0.4f};
			case HUNTRESS: return new float[]{0.23f, 0.54f, 0.29f};
			case DUELIST: return new float[]{0.7f, 0.55f, 0.2f};
			default: return new float[]{0.85f, 0.78f, 0.45f};
		}
	}

	// a stable, distinct colour per monster or item type
	private static float[] typeColor(String name) {
		float hue = (name.hashCode() & 0xffff) / 65535f * 6f;
		int i = (int) hue;
		float f = hue - i, v = 0.75f, s = 0.55f, p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
		switch (i % 6) {
			case 0: return new float[]{v, t, p};
			case 1: return new float[]{q, v, p};
			case 2: return new float[]{p, v, t};
			case 3: return new float[]{p, q, v};
			case 4: return new float[]{t, p, v};
			default: return new float[]{v, p, q};
		}
	}

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
