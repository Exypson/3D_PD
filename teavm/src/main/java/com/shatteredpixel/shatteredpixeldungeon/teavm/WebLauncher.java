package com.shatteredpixel.shatteredpixeldungeon.teavm;

import com.badlogic.gdx.Files;
import com.github.xpenatan.gdx.teavm.backends.web.WebApplication;
import com.github.xpenatan.gdx.teavm.backends.web.WebApplicationConfiguration;
import com.github.xpenatan.gdx.teavm.backends.web.WebPreferences;
import com.github.xpenatan.gdx.teavm.backends.web.assetloader.AssetInstance;
import com.github.xpenatan.gdx.teavm.backends.web.assetloader.AssetLoader;
import com.github.xpenatan.gdx.teavm.backends.web.assetloader.AssetType;
import com.shatteredpixel.shatteredpixeldungeon.SPDSettings;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.render3d.World3D;
import com.badlogic.gdx.Input;
import com.shatteredpixel.shatteredpixeldungeon.sprites.CharSprite;
import com.watabou.input.KeyBindings;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.shatteredpixel.shatteredpixeldungeon.ShatteredPixelDungeon;
import com.watabou.noosa.Game;
import com.watabou.noosa.RenderedText;
import com.watabou.utils.Bundle;
import com.watabou.utils.LazyAssets;
import com.watabou.utils.Reflection;
import com.watabou.utils.FileUtils;
import org.teavm.jso.browser.Storage;
import org.teavm.jso.browser.Window;

public class WebLauncher {

	private static final String[] MESSAGE_GROUPS = {"actors", "items", "journal", "levels", "misc", "plants", "scenes", "ui", "windows"};

	public static void main(String[] args) {
		// shortcut: hard-coded to match build.gradle appVersionName/appVersionCode, generate it when releases start
		Game.version = "4.0.2";
		Game.versionCode = 922;

		WebApplicationConfiguration config = new WebApplicationConfiguration("canvas");
		config.width = 0;  // fill the browser window
		config.height = 0;
		config.storagePrefix = "pd3d";
		// the web FreeType build is a separate script; fonts are created on the first screen, so load it up front
		config.preloadListener = loader -> {
			loader.loadScript("freetype.js");
			// only English text is in the startup download; a player who chose another language gets theirs here too
			String lang = SPDSettings.language().code();
			if (!lang.equals("en")) for (String g : MESSAGE_GROUPS) loader.loadAsset("messages/" + g + "/" + g + "_" + lang + ".properties", AssetType.Binary, Files.FileType.Internal, null);
		};

		Reflection.factory = new GeneratedFactory(); // TeaVM can't construct classes by name; saves need it
		RenderedText.actorThreadCheck = false; // false alarm under TeaVM's simulated threads, see RenderedText
		Actor.useThreadInterrupt = false; // TeaVM breaks locks on interrupted waits, see Actor.interruptActorThread
		// the dungeon is drawn in 3D unless the page is opened with ?2d
		if (!Window.current().getLocation().getSearch().contains("2d")) {
			GameScene.worldView = new World3D();
			// 3D steps take 20% longer, so the walk animation can be seen (only the look: turns don't change)
			CharSprite.setMoveInterval(CharSprite.DEFAULT_MOVE_INTERVAL / 0.8f);
			// , and . turn the camera (handled in CellSelector); SPD only passes bound keys on, so let these through
			KeyBindings.passThrough.add(Input.Keys.COMMA);
			KeyBindings.passThrough.add(Input.Keys.PERIOD);
		}
		// 3D models, music and other languages are not in the startup download: fetch each file the first time the game asks for it
		LazyAssets.state = path -> {
			AssetLoader loader = AssetInstance.getLoaderInstance();
			if (loader.isAssetLoaded(Files.FileType.Internal, path)) return LazyAssets.READY;
			if (loader.isAssetFailed(Files.FileType.Internal, path)) return LazyAssets.MISSING;
			if (!loader.isAssetInQueueOrDownloading(path)) loader.loadAsset(path, AssetType.Binary, Files.FileType.Internal, null);
			return LazyAssets.PENDING;
		};
		Bundle.compressByDefault = false; // TeaVM's gzip writer is broken; saves are stored uncompressed in IndexedDB
		// saves go to libGDX "local" files, which this backend keeps in browser storage
		FileUtils.setDefaultFileProperties(Files.FileType.Local, "");
		// settings are needed before Gdx.app exists, so build them the way the backend would
		SPDSettings.set(new WebPreferences(Storage.getLocalStorage(), config.storagePrefix + ":settings", false));

		if (Window.current().getLocation().getSearch().contains("test")) TestHooks.install();
		new WebApplication(new GameThreadListener(new ShatteredPixelDungeon(new WebPlatformSupport())), config);
	}
}
