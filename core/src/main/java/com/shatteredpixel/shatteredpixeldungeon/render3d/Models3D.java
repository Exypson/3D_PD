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

import com.badlogic.gdx.math.Matrix4;
import com.badlogic.gdx.math.Vector3;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.items.Amulet;
import com.shatteredpixel.shatteredpixeldungeon.items.Dewdrop;
import com.shatteredpixel.shatteredpixeldungeon.items.Gold;
import com.shatteredpixel.shatteredpixeldungeon.items.Heap;
import com.shatteredpixel.shatteredpixeldungeon.items.Item;
import com.shatteredpixel.shatteredpixeldungeon.items.KindOfWeapon;
import com.shatteredpixel.shatteredpixeldungeon.items.armor.Armor;
import com.shatteredpixel.shatteredpixeldungeon.items.artifacts.Artifact;
import com.shatteredpixel.shatteredpixeldungeon.items.bags.Bag;
import com.shatteredpixel.shatteredpixeldungeon.items.bombs.Bomb;
import com.shatteredpixel.shatteredpixeldungeon.items.food.Food;
import com.shatteredpixel.shatteredpixeldungeon.items.keys.Key;
import com.shatteredpixel.shatteredpixeldungeon.items.potions.Potion;
import com.shatteredpixel.shatteredpixeldungeon.items.rings.Ring;
import com.shatteredpixel.shatteredpixeldungeon.items.scrolls.Scroll;
import com.shatteredpixel.shatteredpixeldungeon.items.stones.Runestone;
import com.shatteredpixel.shatteredpixeldungeon.items.wands.Wand;
import com.shatteredpixel.shatteredpixeldungeon.items.weapon.melee.MeleeWeapon;
import com.shatteredpixel.shatteredpixeldungeon.items.weapon.missiles.MissileWeapon;
import com.shatteredpixel.shatteredpixeldungeon.plants.Plant;
import com.shatteredpixel.shatteredpixeldungeon.sprites.CharSprite;
import com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSpriteSheet;

// Original low-poly models built from boxes: one archetype per creature kind, picked by class name.
// Local space: feet at y=0, the model faces +z, +x is its right. Sizes are in tiles.
final class Models3D {

	private final World3D w;
	private final Matrix4 base = new Matrix4(), m = new Matrix4(), hand = new Matrix4();
	private float light = 1f;

	// pose of the character being built
	private float t, swing, arm, bob;
	private boolean walk, atk;
	private float headY; // centre of the last biped's head, for hats and helmets

	Models3D(World3D w) { this.w = w; }

	// ---------- rig ----------

	private void at(float x, float y, float z, float yawDeg, float s) {
		base.idt().translate(x, y, z).rotate(Vector3.Y, yawDeg).scale(s, s, s);
	}

	private void box(float cx, float cy, float cz, float sx, float sy, float sz, int c) {
		m.set(base).translate(cx, cy, cz).scale(sx, sy, sz);
		w.cube(m, c, light);
	}

	// box rotated (degrees) about its own centre: yaw, then pitch, then roll
	private void rbox(float cx, float cy, float cz, float rx, float ry, float rz, float sx, float sy, float sz, int c) {
		m.set(base).translate(cx, cy, cz);
		if (ry != 0) m.rotate(Vector3.Y, ry);
		if (rx != 0) m.rotate(Vector3.X, rx);
		if (rz != 0) m.rotate(Vector3.Z, rz);
		m.scale(sx, sy, sz);
		w.cube(m, c, light);
	}

	// a part hanging down from a pivot, swung forward/back by ang degrees
	private void limb(float px, float py, float pz, float ang, float sx, float len, float sz, int c) {
		m.set(base).translate(px, py, pz).rotate(Vector3.X, ang).translate(0, -len / 2f, 0).scale(sx, len, sz);
		w.cube(m, c, light);
	}

	// remembers the end of an arm so a weapon can be held there
	private void handAt(float px, float py, float pz, float ang, float len) {
		hand.set(base).translate(px, py, pz).rotate(Vector3.X, ang).translate(0, -len, 0);
	}

	private void hbox(float cx, float cy, float cz, float rx, float sx, float sy, float sz, int c) {
		m.set(hand).translate(cx, cy, cz);
		if (rx != 0) m.rotate(Vector3.X, rx);
		m.scale(sx, sy, sz);
		w.cube(m, c, light);
	}

	private float sin(float v) { return (float) Math.sin(v); }

	// ---------- characters ----------

	void character(Char ch, float time) {
		CharSprite s = ch.sprite;
		if (s == null || !s.visible || !ch.isAlive()) return;
		light = 1f;
		t = time + ch.id() * 0.37f;
		walk = s.isMoving;
		atk = s.isAttacking();
		swing = walk ? sin(t * 12f) * 35f : 0f;
		arm = atk ? -80f : 0f;
		bob = walk ? 0f : 0.012f * sin(t * 2.5f);
		float yaw = s.flipHorizontal ? -45f : 45f; // three-quarter view toward the camera, like the 2D facing
		float lunge = atk ? 0.12f : 0f;
		float k = Char.hasProp(ch, Char.Property.BOSS) ? 1.35f : (Char.hasProp(ch, Char.Property.LARGE) ? 1.2f : 1f);
		float r = (float) Math.toRadians(yaw);
		at(World3D.spriteX(s) + sin(r) * lunge, 0, World3D.spriteZ(s) + (float) Math.cos(r) * lunge, yaw, k);
		if (ch instanceof Hero) hero((Hero) ch);
		else mob(ch.getClass().getSimpleName());
	}

	private void hero(Hero h) {
		Armor a = h.belongings.armor();
		int tier = a == null ? 0 : a.tier;
		// the body keeps the class colour (everyone starts in cloth); leather and up adds pauldrons and a chest plate
		int armorC = tier < 2 ? -1 : new int[]{0, 0xb8a582, 0x7a5233, 0x8c9299, 0x5e7087, 0xc9ced6}[Math.min(5, tier)];
		KindOfWeapon wpn = h.belongings.weapon();
		String wname = wpn == null ? "" : wpn.getClass().getSimpleName();
		heroClassModel(h, wname);
		if (armorC != -1) {
			box(-0.2f, headY - 0.13f, 0, 0.15f, 0.07f, 0.23f, armorC);
			box(0.2f, headY - 0.13f, 0, 0.15f, 0.07f, 0.23f, armorC);
			box(0, headY - 0.27f, 0.105f, 0.3f, 0.2f, 0.02f, armorC);
		}
	}

	private void heroClassModel(Hero h, String wname) {
		switch (h.heroClass) {
			case WARRIOR:
				biped(0xe0b088, 0x9a3328, 0x4a3a2e, 1.08f, 1f);
				box(0, headY + 0.07f, 0, 0.29f, 0.14f, 0.29f, 0x9aa2ab); // steel cap
				box(0, headY + 0.16f, -0.02f, 0.05f, 0.08f, 0.2f, 0xb83a2c); // crest
				box(0, headY - 0.36f, 0.11f, 0.3f, 0.18f, 0.02f, 0xb83a2c); // tabard
				weapon(wname.isEmpty() ? "Sword" : wname);
				break;
			case MAGE:
				biped(0xe8c8a8, 0x4a3a9a, 0x3a2e6a, 1f, 1f);
				robe(0x4a3a9a);
				box(0, headY + 0.1f, 0, 0.34f, 0.04f, 0.34f, 0x2f2668); // hat brim
				box(0, headY + 0.2f, 0, 0.2f, 0.16f, 0.2f, 0x2f2668);
				rbox(0, headY + 0.32f, -0.03f, -15, 0, 0, 0.1f, 0.12f, 0.1f, 0x2f2668);
				weapon(wname.isEmpty() || wname.contains("Staff") ? "MagesStaff" : wname);
				break;
			case ROGUE:
				biped(0xd8b090, 0x3a3f4c, 0x262a33, 0.95f, 1f);
				hood(0x2a2e38);
				box(0, headY - 0.06f, 0.13f, 0.22f, 0.07f, 0.02f, 0x1c1f26); // face mask
				cape(0x2a2e38);
				weapon(wname.isEmpty() ? "Dagger" : wname);
				break;
			case HUNTRESS:
				biped(0xe0b890, 0x3f7a42, 0x4b3a26, 0.95f, 1f);
				hood(0x2f6634);
				rbox(-0.05f, headY - 0.3f, -0.13f, 0, 0, 30, 0.04f, 0.5f, 0.04f, 0x7a5a33); // bow on the back
				weapon(wname.isEmpty() ? "Gloves" : wname);
				break;
			case DUELIST:
				biped(0xd8a880, 0x8a6a2a, 0x2e2a3a, 1f, 1.02f);
				box(0, headY - 0.28f, 0, 0.36f, 0.05f, 0.22f, 0xc8a040); // sash
				box(0, headY + 0.1f, 0, 0.3f, 0.06f, 0.3f, 0x3a2e2a); // flat cap
				weapon(wname.isEmpty() ? "Rapier" : wname);
				break;
			default: // cleric
				biped(0xe8c8a8, 0xe6e0cc, 0xb89a4a, 1f, 1f);
				robe(0xe6e0cc);
				hood(0xe6e0cc);
				box(0, headY - 0.18f, 0.115f, 0.06f, 0.16f, 0.02f, 0xd4af37); // emblem
				box(0, headY - 0.14f, 0.115f, 0.14f, 0.05f, 0.02f, 0xd4af37);
				weapon(wname.isEmpty() ? "Mace" : wname);
		}
	}

	// a two-legged figure: legs, torso, arms, head with eyes; the right hand is left ready for a weapon
	private void biped(int skin, int body, int legs, float width, float height) {
		float hip = 0.4f * height;
		limb(-0.09f * width, hip, 0, swing, 0.12f, hip, 0.14f, legs);
		limb(0.09f * width, hip, 0, -swing, 0.12f, hip, 0.14f, legs);
		box(0, hip + 0.15f * height + bob, 0, 0.34f * width, 0.3f * height, 0.2f, body);
		float sh = hip + 0.28f * height + bob;
		limb(-0.22f * width, sh, 0, -swing * 0.8f, 0.1f, 0.3f, 0.11f, body);
		limb(0.22f * width, sh, 0, swing * 0.8f + arm, 0.1f, 0.3f, 0.11f, body);
		handAt(0.22f * width, sh, 0, swing * 0.8f + arm, 0.3f);
		headY = sh + 0.15f;
		box(0, headY, 0, 0.26f, 0.26f, 0.26f, skin);
		box(-0.06f, headY + 0.02f, 0.131f, 0.05f, 0.04f, 0.02f, 0x141414);
		box(0.06f, headY + 0.02f, 0.131f, 0.05f, 0.04f, 0.02f, 0x141414);
	}

	private void robe(int c) { box(0, 0.22f, 0, 0.36f, 0.42f, 0.24f, c); }
	private void hood(int c) { box(0, headY + 0.03f, -0.02f, 0.3f, 0.3f, 0.28f, c); box(0, headY + 0.02f, 0.13f, 0.22f, 0.2f, 0.01f, 0x1a1a1a); }
	private void cape(int c) { rbox(0, headY - 0.33f, -0.13f, walk ? 12 : 4, 0, 0, 0.34f, 0.5f, 0.03f, c); }
	private void helm(int c) { box(0, headY + 0.04f, 0, 0.3f, 0.2f, 0.3f, c); box(0, headY - 0.02f, 0.14f, 0.2f, 0.03f, 0.02f, 0x111111); }
	private void crown(int c) { box(0, headY + 0.17f, 0, 0.3f, 0.06f, 0.3f, c); for (int i = -1; i <= 1; i++) box(i * 0.1f, headY + 0.24f, 0.13f, 0.04f, 0.08f, 0.03f, c); }
	private void beard(int c) { box(0, headY - 0.14f, 0.1f, 0.22f, 0.18f, 0.1f, c); }
	private void horns(int c) { rbox(-0.1f, headY + 0.17f, 0, 0, 0, 25, 0.05f, 0.14f, 0.05f, c); rbox(0.1f, headY + 0.17f, 0, 0, 0, -25, 0.05f, 0.14f, 0.05f, c); }
	private void pointyEars(int c) { box(-0.09f, headY + 0.17f, 0, 0.06f, 0.1f, 0.04f, c); box(0.09f, headY + 0.17f, 0, 0.06f, 0.1f, 0.04f, c); }
	private void snout(int c) { box(0, headY - 0.04f, 0.17f, 0.12f, 0.1f, 0.1f, c); box(0, headY - 0.02f, 0.225f, 0.05f, 0.04f, 0.02f, 0x151515); }
	private void tail(int c) { rbox(0, 0.38f, -0.18f, 35 + sin(t * 3) * 10, 0, 0, 0.05f, 0.05f, 0.28f, c); }
	private void wings(int c, float span) {
		float f = sin(t * 9f) * 30f;
		rbox(-0.2f - span / 2f, headY - 0.2f, -0.12f, 0, 0, 20 + f, span, 0.25f, 0.03f, c);
		rbox(0.2f + span / 2f, headY - 0.2f, -0.12f, 0, 0, -20 - f, span, 0.25f, 0.03f, c);
	}
	private void glowEyes(int c) { box(-0.06f, headY + 0.02f, 0.135f, 0.06f, 0.04f, 0.02f, c); box(0.06f, headY + 0.02f, 0.135f, 0.06f, 0.04f, 0.02f, c); }

	// a weapon held in the right hand, shaped by the weapon's class name
	private void weapon(String n) {
		final int STEEL = 0xc8ced6, WOOD = 0x7a5533, DARK = 0x3c3f45;
		if (n.contains("Gloves") || n.contains("Gauntlet") || n.contains("Knuckle")) { hbox(0, 0, 0, 0, 0.13f, 0.1f, 0.13f, 0x6b4a2b); return; }
		if (n.contains("Staff") || n.contains("Quarterstaff")) {
			hbox(0, 0.05f, 0.04f, 0, 0.04f, 0.75f, 0.04f, WOOD);
			if (n.contains("Mage")) hbox(0, 0.44f, 0.04f, 0, 0.1f, 0.1f, 0.1f, 0x9b7bff);
			return;
		}
		if (n.contains("Spear") || n.contains("Glaive") || n.contains("Trident") || n.contains("Scythe") || n.contains("Halberd")) {
			hbox(0, 0, 0.3f, 90, 0.035f, 0.9f, 0.035f, WOOD);
			hbox(0, 0, 0.8f, 90, n.contains("Glaive") || n.contains("Scythe") ? 0.12f : 0.05f, 0.18f, 0.03f, STEEL);
			return;
		}
		if (n.contains("Axe")) { hbox(0, 0, 0.2f, 90, 0.04f, 0.45f, 0.04f, WOOD); hbox(0.06f, 0, 0.38f, 90, 0.14f, 0.14f, 0.03f, STEEL); return; }
		if (n.contains("Mace") || n.contains("Hammer") || n.contains("Flail")) { hbox(0, 0, 0.18f, 90, 0.04f, 0.4f, 0.04f, WOOD); hbox(0, 0, 0.4f, 90, 0.13f, 0.13f, 0.13f, DARK); return; }
		if (n.contains("Bow")) { hbox(0, 0, 0.05f, 0, 0.04f, 0.55f, 0.04f, WOOD); hbox(0, 0, 0.02f, 0, 0.01f, 0.5f, 0.01f, 0xe8e0d0); return; }
		if (n.contains("Shield")) { hbox(-0.02f, 0.05f, 0.06f, 0, 0.06f, 0.3f, 0.26f, 0x8a6a3a); return; }
		if (n.contains("Whip")) { hbox(0, 0, 0.1f, 90, 0.04f, 0.15f, 0.04f, WOOD); hbox(0, -0.05f, 0.35f, 70, 0.02f, 0.4f, 0.02f, 0x5a3a20); return; }
		boolean shortBlade = n.contains("Dagger") || n.contains("Dirk") || n.contains("Sai") || n.contains("Assassin") || n.contains("Sickle");
		float len = shortBlade ? 0.26f : (n.contains("Great") || n.contains("Long") || n.contains("Runic") ? 0.6f : 0.45f);
		hbox(0, 0, 0.05f, 90, 0.12f, 0.03f, 0.04f, DARK); // guard
		hbox(0, 0, 0.08f + len / 2f, 90, 0.05f, len, 0.02f, STEEL);
	}

	private void mob(String n) {
		switch (n) {
			// sewers
			case "Rat": case "VaultRat": rodent(0x8a7462, 0xc9a99a); break;
			case "Albino": rodent(0xe8e2dc, 0xf0a8b0); break;
			case "FetidRat": rodent(0x6a7a48, 0x9aa868); break;
			case "TransmogRat": rodent(0x9a8a7a, 0xd8c0b0); break;
			case "RatKing": rodent(0x7a6452, 0xc9a99a); box(0, 0.36f, 0.27f, 0.2f, 0.06f, 0.2f, 0xd4af37); break;
			case "Gnoll": case "GnollExile": gnoll(0xb08850, 0x6b4a2a); weapon("Spear"); break;
			case "GnollTrickster": gnoll(0xa07a48, 0x4a5a3a); weapon("Bow"); break;
			case "GnollGuard": gnoll(0x9a7a4a, 0x5a5a62); helm(0x7a7f88); weapon("Spear"); break;
			case "GnollSapper": gnoll(0xa88250, 0x6a5a3a); weapon("Pickaxe"); break;
			case "GnollGeomancer": gnoll(0x9a7044, 0x5a4a3a); robe(0x6a5a40); weapon("Staff"); break;
			case "Crab": case "VaultCrab": crab(0xc85a32, 1f); break;
			case "GreatCrab": crab(0x9a3a28, 1.35f); break;
			case "HermitCrab": crab(0xb8703a, 1f); box(0, 0.3f, -0.08f, 0.32f, 0.26f, 0.3f, 0xc8b89a); break;
			case "Snake": snake(0x4a8a3a, 0xd8c050); break;
			case "Slime": blob(0x6ab84a, 1f); break;
			case "CausticSlime": blob(0xa8c83a, 1f); break;
			case "Goo": blob(0x2a2a30, 1.5f); glowBlobEyes(0xe03030, 1.5f); break;
			case "Swarm": swarm(0x3a3a3a); break;
			// prison
			case "Skeleton": case "VaultSkeleton": case "NecroSkeleton": skeleton(); weapon("Sword"); break;
			case "Thief": biped(0xd8b090, 0x4a4f6b, 0x2a2c3a, 0.95f, 1f); hood(0x3b3f58); weapon("Dagger"); break;
			case "Bandit": biped(0xd0a888, 0x6b3a3a, 0x2a2c3a, 1f, 1f); hood(0x5a2f2f); weapon("Dagger"); break;
			case "DM100": case "VaultDM100": robot(0x7a8696, 0x4fd0ff, 0.85f, false); break;
			case "DM200": case "VaultDM200": robot(0x8a7a5a, 0x9aff6a, 1.2f, false); break;
			case "DM201": robot(0x6a6a72, 0xffb04a, 1.2f, false); break;
			case "DM300": robot(0xb08a3a, 0xff5a2a, 1.4f, true); break;
			case "Guard": biped(0x9aa0a8, 0x4d5866, 0x2c323a, 1.05f, 1.02f); helm(0x8b939e); weapon("Mace"); break;
			case "Necromancer": biped(0xcfc7b0, 0x2d2238, 0x1e1726, 1f, 1f); robe(0x2d2238); hood(0x1e1726); glowEyes(0x8aff8a); weapon("Staff"); break;
			case "SpectralNecromancer": light = 1f; biped(0xb8c8d8, 0x3a4a6a, 0x2a3450, 1f, 1f); robe(0x3a4a6a); hood(0x2a3450); glowEyes(0x9adfff); weapon("Staff"); break;
			case "Tengu": biped(0xd8b088, 0x2a2a34, 0x1e1e26, 1f, 1.05f); box(0, headY, 0.13f, 0.27f, 0.26f, 0.02f, 0xb82a22); rbox(0, headY, 0.22f, 0, 0, 0, 0.05f, 0.05f, 0.16f, 0xb82a22); cape(0x1e1e26); weapon("Dagger"); break;
			// caves
			case "Bat": bat(0x4a3a4a); break;
			case "Brute": gnoll(0x8a6a40, 0x5a3a2a); weapon("Axe"); break;
			case "ArmoredBrute": gnoll(0x7a5a38, 0x5a5f68); helm(0x6a6f78); weapon("Axe"); break;
			case "RedShaman": case "VaultShaman": shaman(0xb83a2a); break;
			case "BlueShaman": shaman(0x3a6ab8); break;
			case "PurpleShaman": shaman(0x7a3ab8); break;
			case "Spinner": spider(0x3a3a2a, 0x7a5a2a, 1f); break;
			case "FungalSpinner": spider(0x4a5a3a, 0x8a6a9a, 1f); mushroomCap(0x9a5aa8, 0.42f, 0.3f); break;
			case "GnollGeomancerRock": break;
			// city
			case "Ghoul": case "VaultGhoul": case "DKGhoul": biped(0x8a9a7a, 0x4a5a42, 0x3a4434, 1f, 0.92f); glowEyes(0xe8e050); break;
			case "Elemental": case "FireElemental": case "NewbornFireElemental": case "AllyNewBornElemental": elemental(0xff8a2a, 0xffd04a); break;
			case "FrostElemental": elemental(0x7ac8ff, 0xe0f4ff); break;
			case "ShockElemental": elemental(0x7a7aff, 0xffff8a); break;
			case "ChaosElemental": elemental(0xd04ad0, 0x4ad0b0); break;
			case "VaultElemental": case "VaultBossElemental": elemental(0x4ad0ff, 0xb0f0ff); break;
			case "Warlock": case "DKWarlock": biped(0xc8b8a8, 0x3a2a4a, 0x2a1e34, 1f, 1f); robe(0x3a2a4a); hood(0x2a1e34); hbox(0, 0.05f, 0.08f, 0, 0.12f, 0.12f, 0.12f, 0xb04aff); break;
			case "Monk": case "DKMonk": biped(0xd8a878, 0xd87a2a, 0x8a4a1a, 1f, 1f); box(0, headY - 0.3f, 0, 0.36f, 0.05f, 0.22f, 0x3a2a1a); break;
			case "Senior": biped(0xd8a878, 0x6a3a8a, 0x3a1a4a, 1.02f, 1f); beard(0xe8e8e8); break;
			case "Golem": case "VaultGolem": case "DKGolem": golem(0x9a9288); break;
			case "DwarfKing": biped(0xe0b088, 0x6a2a8a, 0x3a1a4a, 1.05f, 0.9f); beard(0xc8c0b0); crown(0xd4af37); cape(0x8a2a2a); weapon("Mace"); break;
			// halls
			case "Succubus": biped(0xe0a8c8, 0x7a2a6a, 0x4a1a3a, 0.95f, 1.05f); horns(0x2a1a2a); wings(0x5a1a4a, 0.35f); break;
			case "Eye": case "YogEye": eye(0x8a2a3a, 0xe8d050, 1f); break;
			case "Scorpio": case "YogScorpio": scorpion(0x8a3a2a); break;
			case "Acidic": scorpion(0x6aa83a); break;
			case "RipperDemon": case "YogRipper": demon(0x8a2a2a); break;
			case "DemonSpawner": portal(0x3a1a2a, 0xff4a2a); break;
			case "Larva": larva(0xd8d0a0); break;
			case "YogDzewa": yog(); break;
			case "BurningFist": fist(0xff7a2a); break;
			case "SoiledFist": fist(0x6a5a3a); break;
			case "RottingFist": fist(0x5a8a3a); break;
			case "RustedFist": fist(0xa85a2a); break;
			case "BrightFist": fist(0xfff0a0); break;
			case "DarkFist": fist(0x3a2a5a); break;
			// mines
			case "CrystalWisp": wisp(0x9adfff); break;
			case "CrystalGuardian": golem(0x6ab8e0); break;
			case "CrystalSpire": crystalSpire(); break;
			case "FungalSentry": mushroom(0x8a5aa8, 0xd8d0c0, 1f); glowEyesAt(0xff4a8a, 0.35f); break;
			case "FungalCore": mushroom(0xa86ab8, 0xd8d0c0, 1.6f); break;
			// everywhere
			case "Statue": case "ArmoredStatue": biped(0x9a9a98, 0x8a8a88, 0x7a7a78, 1f, 1f); if (n.startsWith("Armored")) helm(0x7a7a78); weapon("Sword"); break;
			case "Mimic": mimic(0x8a5a2a, 0x5a5a5a); break;
			case "GoldenMimic": mimic(0xd4af37, 0x8a6a1a); break;
			case "CrystalMimic": mimic(0x9adfff, 0x5a9ac8); break;
			case "EbonyMimic": mimic(0x2a2228, 0x5a4a5a); break;
			case "Wraith": case "TormentedSpirit": wraith(0x5a5a6a, 0xff4a4a); break;
			case "Piranha": fish(0xb85a3a); break;
			case "PhantomPiranha": fish(0x9ab8d8); break;
			case "Bee": bee(); break;
			case "RotLasher": lasher(0x5a7a3a); break;
			case "RotHeart": rotHeart(); break;
			case "Pylon": pylon(); break;
			case "Sheep": sheep(); break;
			// NPCs and allies
			case "Shopkeeper": biped(0xe0b890, 0x5a7a4a, 0x3a3a2a, 1.05f, 1f); box(0, headY - 0.36f, 0.11f, 0.3f, 0.26f, 0.02f, 0xd8cfb8); box(0, headY + 0.12f, 0, 0.28f, 0.08f, 0.28f, 0x4a3a2a); break;
			case "ImpShopkeeper": case "Imp": imp(); break;
			case "Ghost": wraith(0xb8d0e0, 0x2a3a5a); break;
			case "Wandmaker": biped(0xe8c8a8, 0x3a5a8a, 0x2a3a5a, 1f, 1f); robe(0x3a5a8a); beard(0xe8e8e8); box(0, headY + 0.12f, 0, 0.28f, 0.06f, 0.28f, 0x2a3a5a); weapon("Staff"); break;
			case "Blacksmith": biped(0xd8a878, 0x6a4a3a, 0x3a2a22, 1.15f, 0.88f); beard(0x8a5a3a); box(0, headY - 0.3f, 0.11f, 0.32f, 0.3f, 0.02f, 0x3a2a22); weapon("Hammer"); break;
			case "MirrorImage": case "PrismaticImage": case "ShadowAlly": case "AfterImage":
				biped(0xb8b8d8, n.startsWith("Shadow") ? 0x2a2a3a : 0x8a8ac8, 0x4a4a6a, 1f, 1f); weapon("Sword"); break;
			case "HawkAlly": bird(0xb8e0d8); break;
			case "NinjaLog": box(0, 0.15f, 0, 0.22f, 0.22f, 0.6f, 0x7a5533); break;
			case "LightAlly": wisp(0xfff0a0); break;
			case "VaultSentry": case "VaultLaser": sentry(0x6a6a72, 0xff4a4a); break;
			case "VaultMirror": sentry(0x8a8a92, 0xc8e8ff); break;
			case "VaultTokenDoor": box(0, 0.5f, 0, 0.8f, 1f, 0.2f, 0x6a5a4a); break;
			default:
				if (n.contains("Rat")) rodent(0x8a7462, 0xc9a99a);
				else if (n.contains("Elemental")) elemental(0xff8a2a, 0xffd04a);
				else if (n.contains("Skeleton")) { skeleton(); weapon("Sword"); }
				else biped(0xd8b090, hashColor(n), 0x3a3a3a, 1f, 1f);
		}
	}

	// ---------- archetypes ----------

	private void rodent(int fur, int pink) {
		float b = bob;
		box(0, 0.15f + b, 0, 0.24f, 0.17f, 0.4f, fur);
		box(0, 0.19f + b, 0.25f, 0.17f, 0.15f, 0.17f, fur);
		box(0, 0.17f + b, 0.35f, 0.07f, 0.06f, 0.06f, pink);
		box(-0.06f, 0.28f + b, 0.23f, 0.06f, 0.07f, 0.03f, pink);
		box(0.06f, 0.28f + b, 0.23f, 0.06f, 0.07f, 0.03f, pink);
		box(-0.05f, 0.22f + b, 0.335f, 0.03f, 0.03f, 0.02f, 0x101010);
		box(0.05f, 0.22f + b, 0.335f, 0.03f, 0.03f, 0.02f, 0x101010);
		for (int i = 0; i < 4; i++) limb(i < 2 ? -0.08f : 0.08f, 0.1f, (i % 2 == 0) ? 0.13f : -0.13f, (i % 2 == 0 ? 1 : -1) * swing, 0.06f, 0.1f, 0.06f, fur);
		rbox(0, 0.14f, -0.33f, 15 + sin(t * 4) * 8, sin(t * 3) * 15, 0, 0.035f, 0.035f, 0.3f, pink);
	}

	private void gnoll(int fur, int gear) {
		biped(fur, gear, 0x3a2a1e, 1f, 1f);
		snout(fur);
		pointyEars(fur);
		box(0, headY - 0.32f, 0, 0.36f, 0.05f, 0.22f, 0x3a2a1e); // belt
	}

	private void shaman(int c) {
		gnoll(0xb08850, c);
		robe(c);
		box(0, headY + 0.16f, -0.05f, 0.05f, 0.14f, 0.05f, c); // feather
		weapon("Staff");
		hbox(0, 0.44f, 0.04f, 0, 0.09f, 0.09f, 0.09f, c);
	}

	private void crab(int shell, float s) {
		base.scale(s, s, s);
		float b = bob, pinch = atk ? 25 : 0;
		box(0, 0.14f + b, 0, 0.46f, 0.15f, 0.32f, shell);
		box(-0.08f, 0.27f + b, 0.12f, 0.04f, 0.1f, 0.04f, shell);
		box(0.08f, 0.27f + b, 0.12f, 0.04f, 0.1f, 0.04f, shell);
		box(-0.08f, 0.33f + b, 0.12f, 0.05f, 0.05f, 0.05f, 0x101010);
		box(0.08f, 0.33f + b, 0.12f, 0.05f, 0.05f, 0.05f, 0x101010);
		rbox(-0.27f, 0.16f + b, 0.2f, -pinch, 20, 0, 0.12f, 0.1f, 0.18f, shell);
		rbox(0.27f, 0.16f + b, 0.2f, -pinch, -20, 0, 0.12f, 0.1f, 0.18f, shell);
		for (int i = 0; i < 3; i++) {
			float z = -0.1f + i * 0.1f, f = walk ? sin(t * 14 + i) * 15 : 0;
			rbox(-0.3f, 0.08f, z, 0, 0, 35 + f, 0.2f, 0.03f, 0.03f, shell);
			rbox(0.3f, 0.08f, z, 0, 0, -35 - f, 0.2f, 0.03f, 0.03f, shell);
		}
	}

	private void snake(int c, int belly) {
		for (int i = 0; i < 6; i++) {
			float z = 0.25f - i * 0.1f, x = sin(t * 5 - i * 0.9f) * 0.05f * i;
			box(x, 0.06f, z, 0.12f - i * 0.01f, 0.1f, 0.12f, i % 2 == 0 ? c : belly);
		}
		box(0, 0.12f, 0.32f, 0.16f, 0.12f, 0.16f, c);
		box(-0.04f, 0.16f, 0.4f, 0.03f, 0.03f, 0.02f, 0x101010);
		box(0.04f, 0.16f, 0.4f, 0.03f, 0.03f, 0.02f, 0x101010);
	}

	private void blob(int c, float s) {
		float p = 1f + sin(t * 3) * 0.06f + (atk ? 0.12f : 0f);
		box(0, 0.12f * s, 0, 0.5f * s * p, 0.24f * s / p, 0.46f * s * p, c);
		box(0, 0.3f * s, 0, 0.38f * s * p, 0.14f * s, 0.34f * s * p, c);
		box(0, 0.4f * s, 0, 0.24f * s, 0.08f * s, 0.22f * s, c);
		if (s < 1.2f) { box(-0.08f, 0.3f, 0.18f, 0.06f, 0.06f, 0.02f, 0x101010); box(0.08f, 0.3f, 0.18f, 0.06f, 0.06f, 0.02f, 0x101010); }
	}

	private void glowBlobEyes(int c, float s) {
		box(-0.1f * s, 0.32f * s, 0.18f * s, 0.07f * s, 0.06f * s, 0.02f, c);
		box(0.1f * s, 0.32f * s, 0.18f * s, 0.07f * s, 0.06f * s, 0.02f, c);
	}

	private void swarm(int c) {
		for (int i = 0; i < 7; i++) {
			float a = t * (2f + i * 0.3f) + i * 0.9f, r = 0.12f + (i % 3) * 0.07f;
			box((float) Math.cos(a) * r, 0.35f + sin(a * 1.7f) * 0.12f, sin(a) * r, 0.07f, 0.07f, 0.07f, i % 2 == 0 ? c : 0x6a6a6a);
		}
	}

	private void bat(int c) {
		float y = 0.5f + sin(t * 3) * 0.06f, f = sin(t * 18) * 40;
		box(0, y, 0, 0.16f, 0.16f, 0.18f, c);
		box(-0.05f, y + 0.12f, 0.03f, 0.04f, 0.08f, 0.03f, c);
		box(0.05f, y + 0.12f, 0.03f, 0.04f, 0.08f, 0.03f, c);
		box(-0.04f, y + 0.03f, 0.091f, 0.03f, 0.03f, 0.02f, 0xff4a4a);
		box(0.04f, y + 0.03f, 0.091f, 0.03f, 0.03f, 0.02f, 0xff4a4a);
		rbox(-0.2f, y, 0, 0, 0, f, 0.26f, 0.02f, 0.16f, c);
		rbox(0.2f, y, 0, 0, 0, -f, 0.26f, 0.02f, 0.16f, c);
	}

	private void spider(int c, int c2, float s) {
		base.scale(s, s, s);
		box(0, 0.16f + bob, 0.1f, 0.2f, 0.14f, 0.2f, c);
		box(0, 0.2f + bob, -0.15f, 0.28f, 0.22f, 0.3f, c2);
		for (int i = -1; i <= 1; i += 2) for (int j = 0; j < 4; j++) {
			float z = 0.18f - j * 0.08f, f = walk ? sin(t * 14 + j) * 15 : 0;
			rbox(i * 0.2f, 0.12f, z, 0, (j - 1.5f) * 18 * i, -i * (40 + f), 0.25f, 0.025f, 0.025f, c);
		}
		box(-0.04f, 0.2f, 0.205f, 0.03f, 0.03f, 0.02f, 0xff3030);
		box(0.04f, 0.2f, 0.205f, 0.03f, 0.03f, 0.02f, 0xff3030);
	}

	private void scorpion(int c) {
		box(0, 0.14f + bob, 0, 0.3f, 0.14f, 0.42f, c);
		rbox(-0.22f, 0.15f, 0.28f, atk ? -25 : 0, 15, 0, 0.1f, 0.08f, 0.2f, c);
		rbox(0.22f, 0.15f, 0.28f, atk ? -25 : 0, -15, 0, 0.1f, 0.08f, 0.2f, c);
		float sting = atk ? 40 : 0;
		for (int i = 0; i < 4; i++) box(0, 0.2f + i * 0.1f, -0.22f - i * 0.04f + (i == 3 ? sting * 0.004f : 0), 0.1f - i * 0.01f, 0.1f, 0.1f, c);
		box(0, 0.6f, -0.24f + sting * 0.004f, 0.06f, 0.08f, 0.1f, 0x2a1a1a);
		for (int i = 0; i < 3; i++) { rbox(-0.22f, 0.07f, -0.1f + i * 0.1f, 0, 0, 30, 0.18f, 0.03f, 0.03f, c); rbox(0.22f, 0.07f, -0.1f + i * 0.1f, 0, 0, -30, 0.18f, 0.03f, 0.03f, c); }
	}

	private void robot(int c, int glow, float s, boolean drill) {
		base.scale(s, s, s);
		limb(-0.1f, 0.35f, 0, swing * 0.6f, 0.12f, 0.35f, 0.16f, 0x4a4a52);
		limb(0.1f, 0.35f, 0, -swing * 0.6f, 0.12f, 0.35f, 0.16f, 0x4a4a52);
		box(0, 0.52f + bob, 0, 0.42f, 0.32f, 0.3f, c);
		box(0, 0.78f + bob, 0, 0.3f, 0.2f, 0.26f, c);
		box(0, 0.8f + bob, 0.131f, 0.22f, 0.05f, 0.02f, glow);
		box(0, 0.94f + bob, 0, 0.03f, 0.1f, 0.03f, 0x4a4a52);
		box(0, 1f + bob, 0, 0.05f, 0.05f, 0.05f, glow);
		limb(-0.27f, 0.64f, 0, -swing * 0.5f, 0.1f, 0.3f, 0.12f, c);
		limb(0.27f, 0.64f, 0, swing * 0.5f + arm, 0.1f, 0.3f, 0.12f, c);
		handAt(0.27f, 0.64f, 0, swing * 0.5f + arm, 0.3f);
		if (drill) for (int i = 0; i < 3; i++) hbox(0, 0, 0.08f + i * 0.08f, 90, 0.16f - i * 0.05f, 0.08f, 0.16f - i * 0.05f, 0x9a9aa2);
		else hbox(0, 0, 0.03f, 0, 0.12f, 0.06f, 0.12f, 0x4a4a52);
	}

	private void eye(int c, int iris, float s) {
		base.scale(s, s, s);
		float y = 0.6f + sin(t * 2.2f) * 0.06f;
		box(0, y, 0, 0.44f, 0.44f, 0.44f, c);
		box(0, y, 0.221f, 0.24f, 0.24f, 0.02f, iris);
		box(0, y, 0.232f, 0.1f, 0.14f, 0.02f, 0x101010);
		for (int i = 0; i < 4; i++) rbox(-0.15f + i * 0.1f, y - 0.32f, 0, sin(t * 3 + i) * 20, 0, 0, 0.05f, 0.25f, 0.05f, c);
	}

	private void elemental(int core, int shard) {
		float y = 0.45f + sin(t * 2.2f) * 0.06f;
		rbox(0, y, 0, 0, t * 90, 45, 0.3f, 0.3f, 0.3f, core);
		rbox(0, y, 0, 45, -t * 70, 0, 0.18f, 0.18f, 0.18f, shard);
		for (int i = 0; i < 4; i++) {
			float a = t * 2.5f + i * 1.57f;
			rbox((float) Math.cos(a) * 0.3f, y + sin(a * 2) * 0.08f, sin(a) * 0.3f, a * 40, a * 60, 0, 0.08f, 0.08f, 0.08f, shard);
		}
	}

	private void golem(int c) {
		base.scale(1.3f, 1.3f, 1.3f);
		biped(c, c, (c & 0xfefefe) >> 1, 1.15f, 1f);
		box(-0.24f, headY - 0.17f, 0, 0.16f, 0.12f, 0.2f, c);
		box(0.24f, headY - 0.17f, 0, 0.16f, 0.12f, 0.2f, c);
		glowEyes(0xff9a3a);
	}

	private void wisp(int c) {
		float y = 0.5f + sin(t * 3) * 0.08f;
		rbox(0, y, 0, 45, t * 120, 0, 0.16f, 0.16f, 0.16f, c);
		for (int i = 0; i < 3; i++) {
			float a = t * 3 + i * 2.09f;
			box((float) Math.cos(a) * 0.18f, y, sin(a) * 0.18f, 0.05f, 0.05f, 0.05f, 0xffffff);
		}
	}

	private void crystalSpire() {
		for (int i = 0; i < 5; i++) {
			float a = i * 1.26f, d = i == 0 ? 0 : 0.16f, h = i == 0 ? 1.1f : 0.55f;
			rbox((float) Math.cos(a) * d, h / 2f, sin(a) * d, i == 0 ? 0 : 12, a * 57, i == 0 ? 0 : 10, 0.16f, h, 0.16f, i % 2 == 0 ? 0x7ac8ff : 0xb0e4ff);
		}
	}

	private void mushroom(int cap, int stem, float s) {
		base.scale(s, s, s);
		box(0, 0.18f + bob, 0, 0.16f, 0.36f, 0.16f, stem);
		mushroomCap(cap, 0.48f, 0.36f + bob);
	}

	private void mushroomCap(int cap, float size, float y) {
		box(0, y + 0.06f, 0, size, 0.12f, size, cap);
		box(0, y + 0.15f, 0, size * 0.6f, 0.07f, size * 0.6f, cap);
		box(-size * 0.25f, y + 0.125f, size * 0.2f, 0.06f, 0.02f, 0.06f, 0xf0e8d8);
		box(size * 0.2f, y + 0.125f, -size * 0.15f, 0.06f, 0.02f, 0.06f, 0xf0e8d8);
	}

	private void glowEyesAt(int c, float y) {
		box(-0.04f, y, 0.081f, 0.03f, 0.03f, 0.02f, c);
		box(0.04f, y, 0.081f, 0.03f, 0.03f, 0.02f, c);
	}

	private void mimic(int wood, int band) {
		box(0, 0.15f, 0, 0.5f, 0.3f, 0.36f, wood);
		box(0, 0.15f, 0.181f, 0.5f, 0.04f, 0.01f, band);
		float open = atk ? 55 : 18 + sin(t * 4) * 6;
		m.set(base).translate(0, 0.3f, -0.18f).rotate(Vector3.X, -open).translate(0, 0.06f, 0.18f).scale(0.5f, 0.12f, 0.36f);
		w.cube(m, wood, light);
		for (int i = -2; i <= 2; i++) box(i * 0.09f, 0.33f, 0.15f, 0.04f, 0.06f, 0.03f, 0xf0f0e0);
	}

	private void wraith(int c, int eyes) {
		float y = 0.15f + sin(t * 2) * 0.05f;
		box(0, y + 0.1f, 0, 0.18f, 0.2f, 0.16f, c);
		box(0, y + 0.3f, 0, 0.28f, 0.24f, 0.2f, c);
		box(0, y + 0.52f, 0, 0.34f, 0.24f, 0.22f, c);
		box(0, y + 0.75f, 0, 0.28f, 0.26f, 0.26f, c);
		box(-0.06f, y + 0.76f, 0.131f, 0.06f, 0.04f, 0.02f, eyes);
		box(0.06f, y + 0.76f, 0.131f, 0.06f, 0.04f, 0.02f, eyes);
		rbox(-0.22f, y + 0.5f, 0.05f, atk ? -60 : -10, 0, 15, 0.08f, 0.3f, 0.08f, c);
		rbox(0.22f, y + 0.5f, 0.05f, atk ? -60 : -10, 0, -15, 0.08f, 0.3f, 0.08f, c);
	}

	private void fish(int c) {
		float y = 0.02f + sin(t * 3) * 0.03f;
		box(0, y, 0, 0.16f, 0.2f, 0.36f, c);
		rbox(0, y, -0.24f, 0, sin(t * 10) * 25, 0, 0.03f, 0.18f, 0.14f, c);
		box(0, y + 0.13f, 0, 0.03f, 0.08f, 0.16f, c);
		box(0, y - 0.04f, 0.18f, 0.12f, 0.04f, 0.02f, 0xf0f0e0);
		box(-0.06f, y + 0.04f, 0.15f, 0.03f, 0.03f, 0.02f, 0x101010);
		box(0.06f, y + 0.04f, 0.15f, 0.03f, 0.03f, 0.02f, 0x101010);
	}

	private void bee() {
		float y = 0.45f + sin(t * 4) * 0.06f, f = sin(t * 30) * 35;
		box(0, y, 0.06f, 0.14f, 0.14f, 0.14f, 0x2a2a2a);
		box(0, y, -0.08f, 0.16f, 0.15f, 0.18f, 0xe8b830);
		box(0, y, -0.08f, 0.165f, 0.155f, 0.04f, 0x2a2a2a);
		rbox(-0.1f, y + 0.1f, 0, 0, 0, 20 + f, 0.16f, 0.01f, 0.1f, 0xe8f0ff);
		rbox(0.1f, y + 0.1f, 0, 0, 0, -20 - f, 0.16f, 0.01f, 0.1f, 0xe8f0ff);
	}

	private void lasher(int c) {
		box(0, 0.06f, 0, 0.36f, 0.12f, 0.36f, 0x3a4a2a);
		for (int i = 0; i < 3; i++) {
			float a = i * 2.09f + t * 0.5f;
			rbox((float) Math.cos(a) * 0.08f, 0.3f, sin(a) * 0.08f, sin(t * 3 + i) * 20 + (atk ? -40 : 0), a * 57, 0, 0.06f, 0.5f, 0.06f, c);
		}
	}

	private void rotHeart() {
		float p = 1f + sin(t * 4) * 0.08f;
		box(0, 0.3f, 0, 0.45f * p, 0.5f * p, 0.45f * p, 0x8a2a4a);
		box(0, 0.32f, 0.2f * p, 0.2f, 0.25f, 0.06f, 0xb84a6a);
		for (int i = 0; i < 4; i++) rbox(-0.3f + i * 0.2f, 0.05f, 0, 0, i * 45, 0, 0.06f, 0.06f, 0.6f, 0x4a5a2a);
	}

	private void pylon() {
		box(0, 0.08f, 0, 0.5f, 0.16f, 0.5f, 0x5a5a62);
		box(0, 0.55f, 0, 0.26f, 0.8f, 0.26f, 0x7a7a84);
		rbox(0, 1.08f + sin(t * 2) * 0.04f, 0, 45, t * 60, 0, 0.18f, 0.18f, 0.18f, 0x9adfff);
	}

	private void portal(int frame, int core) {
		for (int i = 0; i < 8; i++) {
			float a = i * 0.785f;
			rbox((float) Math.cos(a) * 0.38f, 0.5f + sin(a) * 0.38f, 0, 0, 0, a * 57, 0.12f, 0.12f, 0.14f, frame);
		}
		float p = 1f + sin(t * 3) * 0.1f;
		box(0, 0.5f, 0, 0.42f * p, 0.42f * p, 0.04f, core);
	}

	private void larva(int c) {
		for (int i = 0; i < 4; i++) box(0, 0.08f + (i == 0 ? 0.02f : 0), 0.15f - i * 0.11f, 0.16f - i * 0.02f, 0.14f - i * 0.02f, 0.11f, c);
		box(0, 0.12f, 0.215f, 0.08f, 0.04f, 0.02f, 0x8a2a2a);
	}

	private void yog() {
		base.scale(1.8f, 1.8f, 1.8f);
		box(0, 0.3f, -0.05f, 0.7f, 0.5f, 0.5f, 0x5a2a3a);
		box(0, 0.5f, 0.1f, 0.56f, 0.56f, 0.4f, 0x7a3a4a);
		box(0, 0.52f, 0.305f, 0.3f, 0.3f, 0.02f, 0xe8c040);
		box(0, 0.52f, 0.316f, 0.08f, 0.22f, 0.02f, 0x101010);
		for (int i = 0; i < 6; i++) {
			float a = i * 1.05f;
			rbox((float) Math.cos(a) * 0.4f, 0.12f, sin(a) * 0.3f, sin(t * 2 + i) * 25, a * 57, 0, 0.08f, 0.4f, 0.08f, 0x4a2030);
		}
	}

	private void fist(int c) {
		float y = 0.45f + sin(t * 2.5f) * 0.07f;
		box(0, y, 0, 0.5f, 0.42f, 0.42f, c);
		for (int i = 0; i < 4; i++) box(-0.18f + i * 0.12f, y + 0.12f, 0.23f, 0.1f, 0.12f, 0.06f, c);
		box(-0.28f, y - 0.02f, 0.08f, 0.1f, 0.18f, 0.12f, c);
	}

	private void sheep() {
		box(0, 0.28f + bob, 0, 0.36f, 0.26f, 0.44f, 0xf0ece4);
		box(0, 0.36f + bob, 0.27f, 0.16f, 0.17f, 0.16f, 0x2a2a2a);
		for (int i = 0; i < 4; i++) limb(i < 2 ? -0.11f : 0.11f, 0.18f, (i % 2 == 0) ? 0.14f : -0.14f, (i % 2 == 0 ? 1 : -1) * swing, 0.06f, 0.18f, 0.06f, 0x2a2a2a);
	}

	private void imp() {
		base.scale(0.8f, 0.8f, 0.8f);
		biped(0xc8503a, 0xa83a2a, 0x7a2a1a, 0.9f, 0.9f);
		horns(0x2a1a1a);
		tail(0xa83a2a);
	}

	private void demon(int c) {
		biped(c, (c & 0xfefefe) >> 1, 0x2a1a1a, 0.95f, 1.05f);
		horns(0x1a1010);
		glowEyes(0xffd040);
		hbox(0, -0.04f, 0.1f, 0, 0.12f, 0.04f, 0.16f, 0xe8e0d0); // claws
	}

	private void skeleton() {
		int bone = 0xe2dccb, dark = 0x4a463e;
		limb(-0.08f, 0.4f, 0, swing, 0.06f, 0.4f, 0.06f, bone);
		limb(0.08f, 0.4f, 0, -swing, 0.06f, 0.4f, 0.06f, bone);
		box(0, 0.42f + bob, 0, 0.24f, 0.06f, 0.14f, bone);
		for (int i = 0; i < 3; i++) box(0, 0.5f + i * 0.07f + bob, 0, 0.28f, 0.035f, 0.16f, bone);
		box(0, 0.58f + bob, 0, 0.05f, 0.24f, 0.05f, bone);
		float sh = 0.68f + bob;
		limb(-0.18f, sh, 0, -swing * 0.8f, 0.05f, 0.3f, 0.05f, bone);
		limb(0.18f, sh, 0, swing * 0.8f + arm, 0.05f, 0.3f, 0.05f, bone);
		handAt(0.18f, sh, 0, swing * 0.8f + arm, 0.3f);
		headY = sh + 0.15f;
		box(0, headY, 0, 0.24f, 0.24f, 0.24f, bone);
		box(-0.055f, headY + 0.02f, 0.121f, 0.06f, 0.06f, 0.02f, dark);
		box(0.055f, headY + 0.02f, 0.121f, 0.06f, 0.06f, 0.02f, dark);
	}

	private void bird(int c) {
		float y = 0.6f + sin(t * 3) * 0.06f, f = sin(t * 16) * 35;
		box(0, y, 0, 0.14f, 0.14f, 0.26f, c);
		box(0, y + 0.06f, 0.15f, 0.11f, 0.11f, 0.11f, c);
		box(0, y + 0.05f, 0.23f, 0.04f, 0.04f, 0.06f, 0xe8b830);
		rbox(-0.18f, y + 0.03f, 0, 0, 0, f, 0.26f, 0.02f, 0.14f, c);
		rbox(0.18f, y + 0.03f, 0, 0, 0, -f, 0.26f, 0.02f, 0.14f, c);
	}

	private void sentry(int c, int gem) {
		box(0, 0.25f, 0, 0.4f, 0.5f, 0.4f, c);
		box(0, 0.6f, 0, 0.28f, 0.2f, 0.28f, c);
		box(0, 0.6f, 0.141f, 0.12f, 0.12f, 0.02f, gem);
	}

	// ---------- items, heaps and plants ----------

	void heap(Heap heap, float x, float z, float time) {
		light = 1f;
		t = time + heap.pos * 0.7f;
		switch (heap.type) {
			case CHEST: case LOCKED_CHEST: case CRYSTAL_CHEST: {
				at(x, 0, z, 0, 1f);
				int wood = heap.type == Heap.Type.CRYSTAL_CHEST ? 0x8ad0f0 : 0x8a5a2a;
				int band = heap.type == Heap.Type.LOCKED_CHEST ? 0xc8a040 : (heap.type == Heap.Type.CRYSTAL_CHEST ? 0xd8f4ff : 0x5a5a5a);
				box(0, 0.15f, 0, 0.5f, 0.3f, 0.36f, wood);
				box(0, 0.33f, 0, 0.52f, 0.08f, 0.38f, wood);
				box(0, 0.2f, 0.181f, 0.06f, 0.1f, 0.01f, band);
				box(-0.2f, 0.18f, 0, 0.04f, 0.36f, 0.37f, band);
				box(0.2f, 0.18f, 0, 0.04f, 0.36f, 0.37f, band);
				return;
			}
			case TOMB:
				at(x, 0, z, 0, 1f);
				box(0, 0.12f, 0, 0.5f, 0.24f, 0.8f, 0x8a8a88);
				box(0, 0.45f, -0.35f, 0.4f, 0.5f, 0.1f, 0x9a9a98);
				return;
			case SKELETON: case REMAINS:
				at(x, 0, z, heap.pos * 37 % 360, 1f);
				box(0, 0.06f, 0.1f, 0.16f, 0.12f, 0.16f, 0xe2dccb);
				rbox(-0.1f, 0.03f, -0.1f, 0, 30, 0, 0.04f, 0.04f, 0.3f, 0xe2dccb);
				rbox(0.12f, 0.03f, -0.05f, 0, -20, 0, 0.04f, 0.04f, 0.26f, 0xe2dccb);
				return;
			default:
				break;
		}
		Item it = heap.peek();
		if (it == null) return;
		if (heap.type == Heap.Type.FOR_SALE) { at(x, 0, z, 0, 1f); box(0, 0.04f, 0, 0.6f, 0.08f, 0.6f, 0x6a4a2a); }
		at(x, (heap.type == Heap.Type.FOR_SALE ? 0.1f : 0.06f) + 0.04f * sin(t * 2), z, t * 60, 1f);
		item(it);
	}

	private void item(Item it) {
		if (it instanceof Gold) { for (int i = 0; i < 4; i++) box((i % 2) * 0.1f - 0.05f, 0.02f + i * 0.03f, (i / 2) * 0.08f - 0.04f, 0.12f, 0.03f, 0.12f, 0xe8c040); return; }
		if (it instanceof Potion) {
			int c = potionColor(it.image());
			box(0, 0.1f, 0, 0.18f, 0.18f, 0.18f, c);
			box(0, 0.22f, 0, 0.07f, 0.08f, 0.07f, 0xd8e8f0);
			box(0, 0.28f, 0, 0.08f, 0.04f, 0.08f, 0x8a5a33);
			return;
		}
		if (it instanceof Scroll) { rbox(0, 0.06f, 0, 0, 0, 90, 0.1f, 0.3f, 0.1f, 0xe2d0a6); rbox(0, 0.06f, 0, 0, 0, 90, 0.11f, 0.06f, 0.11f, hashColor(String.valueOf(it.image()))); return; }
		if (it instanceof Ring) { int g = ringColor(it.image()); box(0, 0.08f, 0, 0.16f, 0.03f, 0.03f, 0xd4af37); box(0, 0.08f, 0, 0.03f, 0.03f, 0.16f, 0xd4af37); box(0, 0.11f, 0, 0.07f, 0.07f, 0.07f, g); return; }
		if (it instanceof Wand) { rbox(0, 0.05f, 0, 90, 0, 0, 0.04f, 0.4f, 0.04f, 0x7a5533); box(0, 0.05f, 0.2f, 0.07f, 0.07f, 0.07f, hashColor(it.getClass().getSimpleName())); return; }
		if (it instanceof MeleeWeapon || it instanceof MissileWeapon) { handAtItem(); weapon(it.getClass().getSimpleName()); return; }
		if (it instanceof Armor) { int c = new int[]{0, 0xb8a582, 0x7a5233, 0x8c9299, 0x5e7087, 0xc9ced6}[Math.max(1, Math.min(5, ((Armor) it).tier))]; box(0, 0.12f, 0, 0.34f, 0.24f, 0.12f, c); box(-0.2f, 0.18f, 0, 0.08f, 0.1f, 0.12f, c); box(0.2f, 0.18f, 0, 0.08f, 0.1f, 0.12f, c); return; }
		if (it instanceof Food) { box(0, 0.06f, 0, 0.26f, 0.12f, 0.16f, 0xc8964a); box(0, 0.13f, 0, 0.22f, 0.03f, 0.12f, 0xe0b878); return; }
		if (it instanceof Key) { box(0, 0.03f, -0.06f, 0.1f, 0.03f, 0.1f, 0xd4af37); box(0, 0.03f, 0.06f, 0.03f, 0.03f, 0.18f, 0xd4af37); return; }
		if (it instanceof Bomb) { box(0, 0.1f, 0, 0.2f, 0.2f, 0.2f, 0x2a2a30); box(0, 0.23f, 0, 0.03f, 0.08f, 0.03f, 0xc8a070); return; }
		if (it instanceof Plant.Seed) { box(0, 0.04f, 0, 0.08f, 0.08f, 0.1f, hashColor(it.getClass().getName())); return; }
		if (it instanceof Runestone) { box(0, 0.04f, 0, 0.2f, 0.08f, 0.16f, 0x8a8a88); box(0, 0.085f, 0, 0.08f, 0.01f, 0.08f, hashColor(it.getClass().getSimpleName())); return; }
		if (it instanceof Artifact || it instanceof Amulet) { box(0, 0.08f, 0, 0.16f, 0.16f, 0.06f, 0xd4af37); box(0, 0.08f, 0.035f, 0.08f, 0.08f, 0.02f, it instanceof Amulet ? 0xd02a2a : 0x4ab0d0); return; }
		if (it instanceof Bag) { box(0, 0.12f, 0, 0.24f, 0.24f, 0.2f, 0x8a6a3a); box(0, 0.26f, 0, 0.1f, 0.05f, 0.1f, 0x6a4a2a); return; }
		if (it instanceof Dewdrop) { box(0, 0.06f, 0, 0.1f, 0.1f, 0.1f, 0x6ab8f0); return; }
		box(0, 0.08f, 0, 0.18f, 0.16f, 0.18f, hashColor(it.getClass().getSimpleName()));
	}

	// weapons on the floor lie flat: point the "hand" along the ground
	private void handAtItem() { hand.set(base).rotate(Vector3.Y, 90).translate(0, 0.05f, -0.2f); }

	void plant(Plant p, float x, float z, float fog) {
		light = fog;
		at(x, 0, z, p.pos * 53 % 360, 1f);
		int bloom;
		switch (p.getClass().getSimpleName()) {
			case "Firebloom": bloom = 0xff6a2a; break;
			case "Icecap": bloom = 0x9adfff; break;
			case "Sungrass": bloom = 0xe8e040; break;
			case "Sorrowmoss": bloom = 0x6a3a8a; break;
			case "Earthroot": bloom = 0xa8803a; break;
			case "Fadeleaf": bloom = 0xd8d8f0; break;
			case "Rotberry": bloom = 0xc83a5a; break;
			case "Blindweed": bloom = 0x3a3a3a; break;
			case "Stormvine": bloom = 0x5a8ad8; break;
			case "Starflower": bloom = 0xfff0a0; break;
			case "Swiftthistle": bloom = 0xd88ad8; break;
			case "Mageroyal": bloom = 0x8a5ad8; break;
			default: bloom = hashColor(p.getClass().getSimpleName());
		}
		box(0, 0.12f, 0, 0.04f, 0.24f, 0.04f, 0x3a7a3a);
		rbox(-0.08f, 0.08f, 0, 0, 0, 30, 0.14f, 0.02f, 0.08f, 0x4a9a4a);
		rbox(0.08f, 0.12f, 0, 0, 0, -30, 0.14f, 0.02f, 0.08f, 0x4a9a4a);
		rbox(0, 0.27f, 0, 0, 45, 0, 0.14f, 0.08f, 0.14f, bloom);
		light = 1f;
	}

	// ---------- colours ----------

	// SPD's sprite indices are computed at startup, so they can't be switch cases: match them in tables instead
	private static final int[] POTION_IMG = {ItemSpriteSheet.POTION_CRIMSON, ItemSpriteSheet.POTION_AMBER, ItemSpriteSheet.POTION_GOLDEN,
			ItemSpriteSheet.POTION_JADE, ItemSpriteSheet.POTION_TURQUOISE, ItemSpriteSheet.POTION_AZURE, ItemSpriteSheet.POTION_INDIGO,
			ItemSpriteSheet.POTION_MAGENTA, ItemSpriteSheet.POTION_BISTRE, ItemSpriteSheet.POTION_CHARCOAL, ItemSpriteSheet.POTION_SILVER, ItemSpriteSheet.POTION_IVORY};
	private static final int[] EXOTIC_IMG = {ItemSpriteSheet.EXOTIC_CRIMSON, ItemSpriteSheet.EXOTIC_AMBER, ItemSpriteSheet.EXOTIC_GOLDEN,
			ItemSpriteSheet.EXOTIC_JADE, ItemSpriteSheet.EXOTIC_TURQUOISE, ItemSpriteSheet.EXOTIC_AZURE, ItemSpriteSheet.EXOTIC_INDIGO,
			ItemSpriteSheet.EXOTIC_MAGENTA, ItemSpriteSheet.EXOTIC_BISTRE, ItemSpriteSheet.EXOTIC_CHARCOAL, ItemSpriteSheet.EXOTIC_SILVER, ItemSpriteSheet.EXOTIC_IVORY};
	private static final int[] POTION_RGB = {0xc02a2a, 0xe08a20, 0xe8c830, 0x3aa860, 0x3ac8c0, 0x3a7ae0, 0x4a3ab0, 0xc83ab0, 0x6a4a2a, 0x2e2e32, 0xb8c0c8, 0xe8e0c8};
	private static final int[] RING_IMG = {ItemSpriteSheet.RING_GARNET, ItemSpriteSheet.RING_RUBY, ItemSpriteSheet.RING_TOPAZ, ItemSpriteSheet.RING_EMERALD,
			ItemSpriteSheet.RING_ONYX, ItemSpriteSheet.RING_OPAL, ItemSpriteSheet.RING_TOURMALINE, ItemSpriteSheet.RING_SAPPHIRE,
			ItemSpriteSheet.RING_AMETHYST, ItemSpriteSheet.RING_QUARTZ, ItemSpriteSheet.RING_AGATE, ItemSpriteSheet.RING_DIAMOND};
	private static final int[] RING_RGB = {0x8a1a2a, 0xd02030, 0xe8a830, 0x20a050, 0x1e1e22, 0xe0e8f0, 0xd060a0, 0x2050d0, 0x8a40c0, 0xf0d0d8, 0xa86a40, 0xe8f4ff};

	private static int potionColor(int image) {
		for (int i = 0; i < POTION_IMG.length; i++) if (image == POTION_IMG[i] || image == EXOTIC_IMG[i]) return POTION_RGB[i];
		return hashColor(String.valueOf(image));
	}

	private static int ringColor(int image) {
		for (int i = 0; i < RING_IMG.length; i++) if (image == RING_IMG[i]) return RING_RGB[i];
		return hashColor(String.valueOf(image));
	}

	// a stable, fairly saturated colour per name
	static int hashColor(String name) {
		float hue = (name.hashCode() & 0xffff) / 65535f * 6f;
		int i = (int) hue;
		float f = hue - i, v = 0.78f, s = 0.55f, p = v * (1 - s), q = v * (1 - s * f), tt = v * (1 - s * (1 - f));
		float r, g, b;
		switch (i % 6) {
			case 0: r = v; g = tt; b = p; break;
			case 1: r = q; g = v; b = p; break;
			case 2: r = p; g = v; b = tt; break;
			case 3: r = p; g = q; b = v; break;
			case 4: r = tt; g = p; b = v; break;
			default: r = v; g = p; b = q;
		}
		return ((int) (r * 255) << 16) | ((int) (g * 255) << 8) | (int) (b * 255);
	}
}
