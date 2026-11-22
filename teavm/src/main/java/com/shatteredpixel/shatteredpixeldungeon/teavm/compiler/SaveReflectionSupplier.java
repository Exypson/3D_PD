package com.shatteredpixel.shatteredpixeldungeon.teavm.compiler;

import org.teavm.classlib.ReflectionContext;
import org.teavm.classlib.ReflectionSupplier;

// Compile-time only (TeaVM loads it as a service; it never ends up in the JS).
// Saves store class names, so every game class must be findable with Class.forName. Construction goes through
// the generated factory (see generateFactory in build.gradle), because TeaVM's reflective construction can't be relied on.
public class SaveReflectionSupplier implements ReflectionSupplier {

	@Override
	public boolean isClassFoundByName(ReflectionContext context, String name) {
		return name.startsWith("com.shatteredpixel.shatteredpixeldungeon.") || name.startsWith("com.watabou.");
	}
}
