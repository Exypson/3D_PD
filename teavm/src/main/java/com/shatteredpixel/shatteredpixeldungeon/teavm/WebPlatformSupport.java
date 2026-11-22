/*
 * Pixel Dungeon
 * Copyright (C) 2012-2015 Oleg Dolya
 *
 * Shattered Pixel Dungeon
 * Copyright (C) 2014-2026 Evan Debenham
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

package com.shatteredpixel.shatteredpixeldungeon.teavm;

import com.badlogic.gdx.Gdx;
import com.badlogic.gdx.graphics.Pixmap;
import com.badlogic.gdx.graphics.g2d.PixmapPacker;
import com.badlogic.gdx.graphics.g2d.freetype.FreeTypeFontGenerator;
import com.watabou.utils.PlatformSupport;

import java.util.ArrayList;
import java.util.HashMap;

// Desktop platform support without window management: the browser owns the window.
public class WebPlatformSupport extends PlatformSupport {

	@Override
	public void updateDisplaySize() { }

	@Override
	public void updateSystemUI() { }

	@Override
	public boolean connectedToUnmeteredNetwork() {
		return true;
	}

	@Override
	public boolean supportsVibration() {
		return false;
	}

	/* FONT SUPPORT */
	
	//custom pixel font, for use with Latin and Cyrillic languages
	private static FreeTypeFontGenerator basicFontGenerator;
	//droid sans fallback, for asian fonts
	private static FreeTypeFontGenerator asianFontGenerator;
	
	@Override
	public void setupFontGenerators(int pageSize, boolean systemfont) {
		//don't bother doing anything if nothing has changed
		if (fonts != null && this.pageSize == pageSize && this.systemfont == systemfont){
			return;
		}
		this.pageSize = pageSize;
		this.systemfont = systemfont;

		resetGenerators(false);
		fonts = new HashMap<>();

		if (systemfont) {
			basicFontGenerator = asianFontGenerator = new FreeTypeFontGenerator(Gdx.files.internal("fonts/droid_sans.ttf"));
		} else {
			basicFontGenerator = new FreeTypeFontGenerator(Gdx.files.internal("fonts/pixel_font.ttf"));
			asianFontGenerator = new FreeTypeFontGenerator(Gdx.files.internal("fonts/droid_sans.ttf"));
		}
		
		fonts.put(basicFontGenerator, new HashMap<>());
		fonts.put(asianFontGenerator, new HashMap<>());
		
		packer = new PixmapPacker(pageSize, pageSize, Pixmap.Format.RGBA8888, 1, false);
	}
	
	// TeaVM's regex engine has no Unicode-block classes, so the desktop regexes are rewritten as plain loops with the same output.
	private static boolean isAsian(char c){
		return (c >= 0xAC00 && c <= 0xD7AF)   // Hangul syllables
			|| (c >= 0x4E00 && c <= 0x9FFF)   // CJK unified ideographs
			|| (c >= 0x3000 && c <= 0x303F)   // CJK symbols and punctuation
			|| (c >= 0xFF00 && c <= 0xFFEF)   // halfwidth and fullwidth forms
			|| (c >= 0x3040 && c <= 0x30FF);  // hiragana + katakana
	}

	@Override
	protected FreeTypeFontGenerator getGeneratorForString( String input ){
		for (int i = 0; i < input.length(); i++){
			if (isAsian(input.charAt(i))) return asianFontGenerator;
		}
		return basicFontGenerator;
	}

	// splits on newline (for layout), chinese/japanese (for font choice), '_'/'**' (for highlighting), and spaces when multiline
	@Override
	public String[] splitforTextBlock(String text, boolean multiline) {
		ArrayList<String> out = new ArrayList<>();
		int start = 0, i = 0, n = text.length();
		while (i < n){
			char c = text.charAt(i);
			int len = 0;
			if (c == '\n' || c == '_' || (multiline && c == ' ')) len = 1;
			else if (c == '*' && i + 1 < n && text.charAt(i + 1) == '*') len = 2;
			else if (c >= 0x3000 && c <= 0x9FFF && c != 0xAC00 && (c <= 0x303F || (c >= 0x3040 && c <= 0x30FF) || c >= 0x4E00)) len = 1; // hiragana, katakana, CJK ideographs and punctuation
			if (len == 0){ i++; continue; }
			if (i > start) out.add(text.substring(start, i));
			out.add(text.substring(i, i + len));
			i += len; start = i;
		}
		if (start < n) out.add(text.substring(start));
		return out.toArray(new String[0]);
	}
}
