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
import com.badlogic.gdx.files.FileHandle;
import com.badlogic.gdx.graphics.Camera;
import com.badlogic.gdx.graphics.g3d.Material;
import com.badlogic.gdx.graphics.g3d.RenderableProvider;
import com.badlogic.gdx.utils.Array;
import com.badlogic.gdx.math.Vector3;
import com.shatteredpixel.shatteredpixeldungeon.items.Heap;
import com.shatteredpixel.shatteredpixeldungeon.items.KindOfWeapon;
import com.badlogic.gdx.utils.JsonValue;
import com.badlogic.gdx.utils.JsonReader;
import com.badlogic.gdx.graphics.g3d.model.Node;
import com.badlogic.gdx.math.Matrix4;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.abilities.Ratmogrify;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.npcs.RatKing;
import com.shatteredpixel.shatteredpixeldungeon.sprites.CharSprite;
import com.watabou.noosa.Game;
import com.watabou.utils.LazyAssets;
import net.mgsx.gltf.loaders.glb.GLBLoader;
import net.mgsx.gltf.scene3d.attributes.PBRFlagAttribute;
import net.mgsx.gltf.scene3d.lights.DirectionalLightEx;
import net.mgsx.gltf.scene3d.scene.Scene;
import net.mgsx.gltf.scene3d.scene.SceneAsset;
import net.mgsx.gltf.scene3d.scene.SceneManager;
import net.mgsx.gltf.scene3d.shaders.PBRShaderConfig;
import net.mgsx.gltf.scene3d.shaders.PBRShaderProvider;

import java.util.HashMap;
import java.util.HashSet;

// Artist-made .glb models from assets/models3d (see docs/3D_ASSETS.md), drawn with gdx-gltf.
// Anything without a model file keeps World3D's placeholder token.
public final class GltfModels {

	// characters are authored ~1.1 tiles tall; walls are 1.0, so characters are drawn a bit smaller
	static final float CHAR_SCALE = 0.85f;


	private final SceneManager scenes;
	private final HashMap<String, SceneAsset> assets = new HashMap<>();
	private final HashSet<String> missing = new HashSet<>();
	private final HashMap<Char, Scene> live = new HashMap<>();
	private final HashMap<Char, String> liveFile = new HashMap<>();
	private final HashMap<Char, String> liveClip = new HashMap<>();
	private final HashSet<Char> seen = new HashSet<>();

	GltfModels(Camera cam) {
		PBRShaderConfig cfg = PBRShaderProvider.createDefaultConfig();
		cfg.numBones = 32;
		cfg.numDirectionalLights = 1;
		cfg.numPointLights = 0;
		cfg.numSpotLights = 0;
		com.badlogic.gdx.graphics.g3d.shaders.DepthShader.Config dcfg = PBRShaderProvider.createDefaultDepthConfig();
		dcfg.numBones = 32;
		scenes = new SceneManager(PBRShaderProvider.createDefault(cfg), PBRShaderProvider.createDefaultDepth(dcfg));
		scenes.setCamera(cam);
		// STYLE.md: warm key light from the upper left in front, dim cool ambient
		DirectionalLightEx key = new DirectionalLightEx();
		key.direction.set(0.5f, -1f, -0.6f).nor();
		key.color.set(1f, 0.93f, 0.82f, 1f);
		key.intensity = 2.2f;
		scenes.environment.add(key);
		scenes.setAmbientLight(0.45f);
	}

	/** True once asset(file) found the file doesn't exist. */
	boolean missing(String file) {
		return missing.contains(file);
	}

	SceneAsset asset(String file) {
		if (file == null) return null;
		SceneAsset a = assets.get(file);
		if (a != null || missing.contains(file)) return a;
		int state = LazyAssets.state.apply("models3d/" + file); // the web build downloads models on demand
		if (state == LazyAssets.MISSING) { missing.add(file); return null; }
		if (state == LazyAssets.PENDING) return null; // keep the placeholder until it has downloaded
		FileHandle fh = Gdx.files.internal("models3d/" + file);
		a = new GLBLoader().load(fh);
		// some exports are flagged unlit; the game lights everything, so drop the flag
		for (Material mat : a.scene.model.materials) mat.remove(PBRFlagAttribute.Unlit);
		assets.put(file, a);
		return a;
	}

	// a model file for this character: the hero by class and armour tier, everything else by class name
	// (nested classes use a dot, e.g. char_Shaman.RedShaman.glb; translucent ones carry an _alpha suffix)
	private String fileFor(Char ch) {
		if (ch instanceof Hero) {
			String c = ((Hero) ch).heroClass.name();
			return "heroes/hero_" + c.charAt(0) + c.substring(1).toLowerCase() + "_t" + ((Hero) ch).tier() + ".glb";
		}
		String n = ch.getClass().getName();
		n = n.substring(n.lastIndexOf('.') + 1).replace('$', '.');
		// the Rat King's other look, as RatKingSprite picks it
		if (ch instanceof RatKing && Dungeon.hero != null && Dungeon.hero.armorAbility instanceof Ratmogrify) n += "_Ratmogrify";
		String plain = "characters/char_" + n + ".glb";
		if (!missing.contains(plain)) return plain;
		return "characters/char_" + n + "_alpha.glb";
	}

	// walk clips play this much slower, with the 20% slower steps (CharSprite.setMoveInterval in the web launcher)
	static final float WALK_SPEED = 0.8f;
	static int heroClips; // test hook: clips started on the hero, to check a walk doesn't restart on every tile

	// per character: facing yaw, last position x/z, last turn seen, seconds since it last moved, yaw it is turning to
	private final HashMap<Char, float[]> pose = new HashMap<>();

	/** False when this character has no model (World3D then draws its token); true when drawn, or while its model downloads. */
	boolean place(Char ch) {
		CharSprite s = ch.sprite;
		if (s == null) return false;
		String file = fileFor(ch);
		SceneAsset a = asset(file); // asked for even while out of sight, so it has arrived by the time it shows up
		if (a == null && !(ch instanceof Hero) && missing.contains(file) && !file.endsWith("_alpha.glb")) a = asset(file = fileFor(ch)); // the _alpha name
		if (!s.visible) return false;
		String state = s.animState();
		if (!ch.isAlive() && !state.equals("die")) return false; // a dying model stays until its sprite is gone
		if (a == null) return !missing.contains(file); // still downloading: show nothing rather than a placeholder that pops
		Scene sc = live.get(ch);
		if (sc == null || !file.equals(liveFile.get(ch))) {
			if (sc != null) scenes.removeScene(sc);
			sc = new Scene(a.scene);
			scenes.addScene(sc);
			live.put(ch, sc);
			liveFile.put(ch, file);
			liveClip.remove(ch);
		}

		// facing: where it walks, or the cell it last turned to (attacks, spells, shots, noticing someone)
		float x = World3D.spriteX(s), z = World3D.spriteZ(s);
		float[] p = pose.get(ch);
		if (p == null) {
			p = new float[]{0f, x, z, s.turnCount - 1, 1f, 0f};
			pose.put(ch, p);
		}
		float dx = x - p[1], dz = z - p[2], d2 = dx * dx + dz * dz;
		if (d2 > 1e-6f && d2 < 4f) { // (a longer jump is a teleport, not a step)
			p[5] = (float) Math.toDegrees(Math.atan2(dx, dz));
			p[4] = 0f;
		} else {
			p[4] += Game.elapsed;
		}
		boolean turned = s.turnCount != (int) p[3];
		if (turned) {
			int w = Dungeon.level.width();
			if (s.turnFrom >= 0 && s.turnTarget >= 0 && s.turnFrom != s.turnTarget) {
				p[5] = (float) Math.toDegrees(Math.atan2(s.turnTarget % w - s.turnFrom % w, s.turnTarget / w - s.turnFrom / w));
			}
			if (p[3] == s.turnCount - 1 && liveClip.get(ch) == null) p[0] = p[5]; // a new model starts out facing the right way
			p[3] = s.turnCount;
		}
		p[1] = x;
		p[2] = z;
		float turn = ((p[5] - p[0]) % 360f + 540f) % 360f - 180f; // shortest way round
		p[0] += turn * Math.min(1f, Game.elapsed * 14f);

		// SPD's own animation state picks the clip. Walking is kept up across the short pause between steps, and clips
		// blend into each other, so a walk doesn't restart on every tile.
		boolean moving = s.isMoving || p[4] < 0.15f;
		String clip = moving && state.equals("idle") ? "walk" : state;
		if (sc.modelInstance.getAnimation(clip) == null) clip = moving ? "walk" : "idle";
		boolean once = clip.equals("attack") || clip.equals("cast") || clip.equals("operate") || clip.equals("die");
		String was = liveClip.get(ch);
		if (!clip.equals(was) || (once && turned && !clip.equals("die"))) { // a repeated attack turns again: play it again
			sc.animationController.animate(clip, once ? 1 : -1, clip.equals("walk") ? WALK_SPEED : 1f, null, was == null ? 0f : 0.15f);
			if (ch instanceof Hero) heroClips++;
			liveClip.put(ch, clip);
		}
		sc.modelInstance.transform.setToTranslation(x, 0f, z).rotate(Vector3.Y, p[0]).scale(CHAR_SCALE, CHAR_SCALE, CHAR_SCALE);
		if (ch instanceof Hero) holdWeapon((Hero) ch, sc);
		seen.add(ch);
		return true;
	}

	// ---------- the hero's weapon, held at grip_R ----------

	private HashMap<String, String> itemFiles; // Item.image() -> item model file (items/items.json)
	private Scene weapon;
	private String weaponFile;
	private final Matrix4 tmp = new Matrix4();

	// what a heap shows: its container, or the top item as SPD's ItemSprite.view(Heap) does
	String heapFile(Heap h) {
		switch (h.type) {
			case HEAP: case FOR_SALE: return h.peek() == null ? null : itemFile(h.peek().image());
			default: return "heaps/heap_" + h.type.name() + ".glb";
		}
	}

	/** True while items.json (the item model index) is still downloading. */
	boolean itemIndexLoading() {
		itemFile(-1); // reads the index once it has arrived
		return itemFiles == null;
	}

	String itemFile(int image) {
		if (itemFiles == null) {
			int state = LazyAssets.state.apply("models3d/items/items.json"); // downloaded on demand like the models
			if (state == LazyAssets.PENDING) return null;
			itemFiles = new HashMap<>();
			if (state == LazyAssets.READY) for (JsonValue v : new JsonReader().parse(Gdx.files.internal("models3d/items/items.json")).get("by_sheet_index")) itemFiles.put(v.name, v.asString());
		}
		String f = itemFiles.get(Integer.toString(image));
		return f == null ? null : "items/" + f;
	}

	private void holdWeapon(Hero h, Scene hero) {
		KindOfWeapon w = h.belongings.weapon();
		String file = w == null ? null : itemFile(w.image());
		SceneAsset a = file == null ? null : asset(file);
		Node grip = hero.modelInstance.getNode("grip_R", true);
		if (a == null || grip == null) { dropWeapon(); return; }
		if (weapon == null || !file.equals(weaponFile)) {
			dropWeapon();
			weapon = new Scene(a.scene);
			scenes.addScene(weapon);
			weaponFile = file;
		}
		weaponSeen = true;
		// hero transform x hand grip x inverse(the weapon's own grip): the weapon's grip lands in the hand
		Node own = weapon.modelInstance.getNode("grip", true);
		weapon.modelInstance.transform.set(hero.modelInstance.transform).mul(grip.globalTransform);
		if (own != null) weapon.modelInstance.transform.mul(tmp.set(own.globalTransform).inv());
	}

	private boolean weaponSeen;

	private void dropWeapon() {
		if (weapon != null) scenes.removeScene(weapon);
		weapon = null;
		weaponFile = null;
	}

	private final Array<RenderableProvider> frame = new Array<>();

	/** Draws a static instance this frame only (tiles, traps, heaps...). */
	void draw(RenderableProvider p) {
		frame.add(p);
	}

	/** Call once per frame after all place() and draw() calls: drops models of characters that are gone, animates and draws the rest. */
	void render() {
		live.keySet().removeIf(ch -> {
			if (seen.contains(ch)) return false;
			scenes.removeScene(live.get(ch));
			liveFile.remove(ch);
			liveClip.remove(ch);
			pose.remove(ch);
			return true;
		});
		seen.clear();
		if (!weaponSeen) dropWeapon();
		weaponSeen = false;
		Array<RenderableProvider> all = scenes.getRenderableProviders();
		int base = all.size;
		all.addAll(frame);
		scenes.update(Game.elapsed);
		scenes.render();
		all.truncate(base);
		frame.clear();
	}
}
