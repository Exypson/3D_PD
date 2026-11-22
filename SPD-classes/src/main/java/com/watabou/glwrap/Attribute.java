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

package com.watabou.glwrap;

import com.badlogic.gdx.Gdx;

import java.nio.Buffer;
import java.nio.FloatBuffer;

public class Attribute {

	private int location;
	
	public Attribute( int location ) {
		this.location = location;
	}
	
	public int location() {
		return location;
	}
	
	public void enable() {
		Gdx.gl.glEnableVertexAttribArray( location );
	}
	
	public void disable() {
		Gdx.gl.glDisableVertexAttribArray( location );
	}
	
	// WebGL has no client-side vertex arrays, so data from memory is streamed through one shared buffer object
	// shortcut: the buffer handle is not recreated after a GL context loss; reset streamVBO when context restore is handled
	private static int streamVBO = -1;

	public void vertexPointer( int size, int stride, FloatBuffer ptr ) {
		if (streamVBO == -1) streamVBO = Gdx.gl.glGenBuffer();
		int pos = ((Buffer)ptr).position();
		Gdx.gl.glBindBuffer( Gdx.gl.GL_ARRAY_BUFFER, streamVBO );
		((Buffer)ptr).position( 0 );
		Gdx.gl.glBufferData( Gdx.gl.GL_ARRAY_BUFFER, ptr.limit() * 4, ptr, Gdx.gl.GL_STREAM_DRAW );
		((Buffer)ptr).position( pos );
		Gdx.gl.glVertexAttribPointer( location, size, Gdx.gl.GL_FLOAT, false, stride * 4, pos * 4 );
		Gdx.gl.glBindBuffer( Gdx.gl.GL_ARRAY_BUFFER, 0 );
	}

	public void vertexBuffer( int size, int stride, int offset) {
		Gdx.gl.glVertexAttribPointer(location, size, Gdx.gl.GL_FLOAT, false, stride * 4, offset * 4);
	}
}
