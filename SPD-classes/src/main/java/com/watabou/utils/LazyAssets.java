package com.watabou.utils;

import com.badlogic.gdx.Gdx;

import java.util.function.Function;

// Whether an asset file can be used yet. On desktop and Android every file ships with the game, so a file is
// either there or missing. The web build replaces `state` so large files (3D models, music, other languages)
// are downloaded the first time they are asked for instead of before the title screen.
public class LazyAssets {

	public static final int READY = 0, PENDING = 1, MISSING = 2;

	public static Function<String, Integer> state = path -> Gdx.files.internal(path).exists() ? READY : MISSING;
}
