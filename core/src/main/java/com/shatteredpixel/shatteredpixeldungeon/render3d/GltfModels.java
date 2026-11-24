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
import com.badlogic.gdx.math.Vector3;
import com.shatteredpixel.shatteredpixeldungeon.items.KindOfWeapon;
import com.badlogic.gdx.utils.JsonValue;
import com.badlogic.gdx.utils.JsonReader;
import com.badlogic.gdx.graphics.g3d.model.Node;
import com.badlogic.gdx.math.Matrix4;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
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

	private SceneAsset asset(String file) {
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
		String plain = "characters/char_" + n + ".glb";
		if (!missing.contains(plain)) return plain;
		return "characters/char_" + n + "_alpha.glb";
	}

	/** True when this character is drawn as a model this frame (so World3D skips its token). */
	boolean place(Char ch) {
		CharSprite s = ch.sprite;
		if (s == null || !s.visible) return false;
		String state = s.animState();
		if (!ch.isAlive() && !state.equals("die")) return false; // a dying model stays until its sprite is gone
		String file = fileFor(ch);
		SceneAsset a = asset(file);
		if (a == null && !(ch instanceof Hero) && missing.contains(file) && !file.endsWith("_alpha.glb")) a = asset(fileFor(ch)); // try the _alpha name
		if (a == null) return false;
		file = assets.containsValue(a) ? keyOf(a) : file;
		Scene sc = live.get(ch);
		if (sc == null || !file.equals(liveFile.get(ch))) {
			if (sc != null) scenes.removeScene(sc);
			sc = new Scene(a.scene);
			scenes.addScene(sc);
			live.put(ch, sc);
			liveFile.put(ch, file);
			liveClip.remove(ch);
		}
		// SPD's own animation state picks the clip; walking is also shown while the sprite slides between tiles
		String clip = s.isMoving && state.equals("idle") ? "walk" : state;
		if (sc.modelInstance.getAnimation(clip) == null) clip = s.isMoving ? "walk" : "idle";
		if (!clip.equals(liveClip.get(ch))) {
			boolean once = clip.equals("attack") || clip.equals("cast") || clip.equals("operate") || clip.equals("die");
			sc.animationController.setAnimation(clip, once ? 1 : -1);
			liveClip.put(ch, clip);
		}
		float yaw = s.flipHorizontal ? -45f : 45f; // three-quarter view, like the 2D facing
		sc.modelInstance.transform.setToTranslation(World3D.spriteX(s), 0f, World3D.spriteZ(s))
				.rotate(Vector3.Y, yaw).scale(CHAR_SCALE, CHAR_SCALE, CHAR_SCALE);
		if (ch instanceof Hero) holdWeapon((Hero) ch, sc);
		seen.add(ch);
		return true;
	}

	private String keyOf(SceneAsset a) {
		for (java.util.Map.Entry<String, SceneAsset> e : assets.entrySet()) if (e.getValue() == a) return e.getKey();
		return null;
	}

	// ---------- the hero's weapon, held at grip_R ----------

	private HashMap<String, String> itemFiles; // Item.image() -> item model file (items/items.json)
	private Scene weapon;
	private String weaponFile;
	private final Matrix4 tmp = new Matrix4();

	private String itemFile(int image) {
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

	/** Call once per frame after all place() calls: drops models of characters that are gone, animates and draws the rest. */
	void render() {
		live.keySet().removeIf(ch -> {
			if (seen.contains(ch)) return false;
			scenes.removeScene(live.get(ch));
			liveFile.remove(ch);
			liveClip.remove(ch);
			return true;
		});
		seen.clear();
		if (!weaponSeen) dropWeapon();
		weaponSeen = false;
		scenes.update(Game.elapsed);
		scenes.render();
	}
}
