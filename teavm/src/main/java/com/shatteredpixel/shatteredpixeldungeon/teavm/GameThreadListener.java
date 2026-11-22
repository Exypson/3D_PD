package com.shatteredpixel.shatteredpixeldungeon.teavm;

import com.badlogic.gdx.ApplicationListener;

import java.util.ArrayDeque;

// Runs every libGDX lifecycle call on one TeaVM thread instead of inside the browser's frame callback.
// SPD's render side waits on and locks against its actor thread; TeaVM can only pause (suspend) code that runs in
// one of its own threads, so doing that from a browser callback fails. The callback now just queues the call.
final class GameThreadListener implements ApplicationListener {

	private final ApplicationListener game;
	private final ArrayDeque<Runnable> queue = new ArrayDeque<>();
	private boolean renderQueued = false;
	static GameThreadListener instance;

	GameThreadListener(ApplicationListener game) {
		this.game = game;
		instance = this;
		Thread t = new Thread(this::loop, "SHPD Render Thread");
		t.start();
	}

	private void loop() {
		while (true) {
			Runnable next;
			synchronized (queue) {
				while (queue.isEmpty()) {
					try { queue.wait(); } catch (InterruptedException ignored) { }
				}
				next = queue.poll();
			}
			next.run();
		}
	}

	void post(Runnable r) {
		synchronized (queue) { queue.add(r); queue.notify(); }
	}

	@Override public void create() { post(game::create); }
	@Override public void resize(int width, int height) { post(() -> game.resize(width, height)); }
	@Override public void pause() { post(game::pause); }
	@Override public void resume() { post(game::resume); }
	@Override public void dispose() { post(game::dispose); }

	@Override public void render() {
		// one frame at a time: if the previous frame is still waiting on the actor thread, skip this tick
		if (renderQueued) return;
		renderQueued = true;
		post(() -> { try { game.render(); } finally { renderQueued = false; } });
	}
}
