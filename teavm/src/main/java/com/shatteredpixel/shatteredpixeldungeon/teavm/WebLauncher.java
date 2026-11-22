package com.shatteredpixel.shatteredpixeldungeon.teavm;

import com.badlogic.gdx.Files;
import com.github.xpenatan.gdx.teavm.backends.web.WebApplication;
import com.github.xpenatan.gdx.teavm.backends.web.WebApplicationConfiguration;
import com.github.xpenatan.gdx.teavm.backends.web.WebPreferences;
import com.shatteredpixel.shatteredpixeldungeon.SPDSettings;
import com.shatteredpixel.shatteredpixeldungeon.ShatteredPixelDungeon;
import com.watabou.noosa.Game;
import com.watabou.utils.FileUtils;
import org.teavm.jso.browser.Storage;

public class WebLauncher {

	public static void main(String[] args) {
		// shortcut: hard-coded to match build.gradle appVersionName/appVersionCode, generate it when releases start
		Game.version = "4.0.2";
		Game.versionCode = 922;

		WebApplicationConfiguration config = new WebApplicationConfiguration("canvas");
		config.width = 0;  // fill the browser window
		config.height = 0;
		config.storagePrefix = "pd3d";
		// the web FreeType build is a separate script; fonts are created on the first screen, so load it up front
		config.preloadListener = loader -> loader.loadScript("freetype.js");

		// saves go to libGDX "local" files, which this backend keeps in browser storage
		FileUtils.setDefaultFileProperties(Files.FileType.Local, "");
		// settings are needed before Gdx.app exists, so build them the way the backend would
		SPDSettings.set(new WebPreferences(Storage.getLocalStorage(), config.storagePrefix + ":settings", false));

		new WebApplication(new ShatteredPixelDungeon(new WebPlatformSupport()), config);
	}
}
