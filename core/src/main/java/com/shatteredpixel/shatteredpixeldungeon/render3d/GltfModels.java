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
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.sprites.CharSprite;
import com.watabou.noosa.Game;
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
final class GltfModels {

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
		FileHandle fh = Gdx.files.internal("models3d/" + file);
		if (!fh.exists()) { missing.add(file); return null; }
		a = new GLBLoader().load(fh);
		// some exports are flagged unlit; the game lights everything, so drop the flag
		for (Material mat : a.scene.model.materials) mat.remove(PBRFlagAttribute.Unlit);
		assets.put(file, a);
		return a;
	}

	static String fileFor(Char ch) {
		if (ch instanceof Hero) {
			String c = ((Hero) ch).heroClass.name();
			return "heroes/hero_" + c.charAt(0) + c.substring(1).toLowerCase() + "_t" + ((Hero) ch).tier() + ".glb";
		}
		return null; // monsters come in the next step
	}

	/** True when this character is drawn as a model this frame (so World3D skips its token). */
	boolean place(Char ch) {
		CharSprite s = ch.sprite;
		String file = fileFor(ch);
		if (file == null || s == null || !s.visible || !ch.isAlive()) return false;
		SceneAsset a = asset(file);
		if (a == null) return false;
		Scene sc = live.get(ch);
		if (sc == null || !file.equals(liveFile.get(ch))) {
			if (sc != null) scenes.removeScene(sc);
			sc = new Scene(a.scene);
			scenes.addScene(sc);
			live.put(ch, sc);
			liveFile.put(ch, file);
			liveClip.remove(ch);
		}
		String clip = s.isMoving ? "walk" : "idle"; // the rest pose is a T-pose, so a clip always plays
		if (!clip.equals(liveClip.get(ch))) {
			sc.animationController.setAnimation(clip, -1);
			liveClip.put(ch, clip);
		}
		float yaw = s.flipHorizontal ? -45f : 45f; // three-quarter view, like the 2D facing
		sc.modelInstance.transform.setToTranslation(World3D.spriteX(s), 0f, World3D.spriteZ(s))
				.rotate(Vector3.Y, yaw).scale(CHAR_SCALE, CHAR_SCALE, CHAR_SCALE);
		seen.add(ch);
		return true;
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
		scenes.update(Game.elapsed);
		scenes.render();
	}
}
