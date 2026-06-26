// Hostile zombie mobs: spawn at night, chase the player across the voxel
// terrain (with gravity, AABB collision and 1-block step-up), melee the player,
// take damage from the player's sword, and burn away in daylight.
import * as THREE from 'three';
import { isSolid, isLiquid } from './blocks.js';
import { HEIGHT } from './world.js';

const HALF = 0.3;
const MOB_H = 1.95;
const SPEED = 2.4;
const ATTACK_RANGE = 1.5;
const ATTACK_DMG = 3;       // raw damage (reduced by armor in survival.hurt)
const ATTACK_CD = 1.0;
const MAX_HEALTH = 20;
const HIT_RADIUS = 0.7;     // for the player's attack raycast
const CAP = 10;
const SPAWN_INTERVAL = 3.5;
const DESPAWN_DIST = 48;

const SKIN = new THREE.Color('#6a9a4a');
const SHIRT = new THREE.Color('#36527e');
const PANTS = new THREE.Color('#473f2c');

class Zombie {
  constructor(world, x, y, z) {
    this.world = world;
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.onGround = false;
    this.health = MAX_HEALTH;
    this.cooldown = 0;
    this.phase = Math.random() * Math.PI * 2;
    this.hurtFlash = 0;
    this.skyTimer = 0;
    this.skyExposed = false;
    this.dead = false;

    this._buildMesh();
  }

  _buildMesh() {
    const g = new THREE.Group();
    this.mat = {
      skin: new THREE.MeshBasicMaterial({ color: SKIN.clone() }),
      shirt: new THREE.MeshBasicMaterial({ color: SHIRT.clone() }),
      pants: new THREE.MeshBasicMaterial({ color: PANTS.clone() }),
    };
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), this.mat.skin);
    head.position.set(0, 1.75, 0);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.26), this.mat.shirt);
    body.position.set(0, 1.125, 0);

    const limbGeo = new THREE.BoxGeometry(0.22, 0.75, 0.22);
    const mkJoint = (x, y, mat, baseRotX) => {
      const j = new THREE.Group();
      j.position.set(x, y, 0);
      const m = new THREE.Mesh(limbGeo, mat);
      m.position.set(0, -0.375, 0);
      j.add(m);
      j.rotation.x = baseRotX;
      return j;
    };
    this.larm = mkJoint(0.36, 1.45, this.mat.skin, -1.3);
    this.rarm = mkJoint(-0.36, 1.45, this.mat.skin, -1.3);
    this.lleg = mkJoint(0.14, 0.75, this.mat.pants, 0);
    this.rleg = mkJoint(-0.14, 0.75, this.mat.pants, 0);

    g.add(head, body, this.larm, this.rarm, this.lleg, this.rleg);
    g.position.copy(this.pos);
    this.group = g;
  }

  collides(p) {
    const minX = Math.floor(p.x - HALF), maxX = Math.floor(p.x + HALF);
    const minY = Math.floor(p.y), maxY = Math.floor(p.y + MOB_H);
    const minZ = Math.floor(p.z - HALF), maxZ = Math.floor(p.z + HALF);
    for (let x = minX; x <= maxX; x++)
      for (let y = minY; y <= maxY; y++)
        for (let z = minZ; z <= maxZ; z++)
          if (isSolid(this.world.getBlock(x, y, z))) return true;
    return false;
  }

  _moveAxis(axis, amount) {
    if (amount === 0) return;
    const test = this.pos.clone();
    test[axis] += amount;
    if (!this.collides(test)) { this.pos[axis] = test[axis]; return; }
    if (axis === 'y') {
      if (amount < 0) this.onGround = true;
      this.vel.y = 0;
    } else {
      this.vel[axis] = 0;
    }
  }

  update(dt, player, survival) {
    dt = Math.min(dt, 0.05);
    const dx = player.pos.x - this.pos.x;
    const dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.001) this.yaw = Math.atan2(dx, dz);

    const inWater = isLiquid(
      this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.9), Math.floor(this.pos.z))
    );

    // horizontal chase
    let nx = 0, nz = 0;
    if (dist > ATTACK_RANGE * 0.8) {
      nx = dx / dist; nz = dz / dist;
      this.vel.x = nx * SPEED;
      this.vel.z = nz * SPEED;
    } else {
      this.vel.x = 0; this.vel.z = 0;
    }

    // gravity / buoyancy
    if (inWater) {
      this.vel.y += 12 * dt;
      this.vel.y *= 0.85;
      this.vel.y = Math.max(-2, Math.min(3, this.vel.y));
    } else {
      this.vel.y -= 26 * dt;
      this.vel.y = Math.max(this.vel.y, -28);
    }

    // step up one block when blocked while grounded
    if (this.onGround && (nx || nz)) {
      const fx = this.pos.x + nx * (HALF + 0.05);
      const fz = this.pos.z + nz * (HALF + 0.05);
      const fy = Math.floor(this.pos.y);
      if (isSolid(this.world.getBlock(Math.floor(fx), fy, Math.floor(fz))) &&
          !isSolid(this.world.getBlock(Math.floor(fx), fy + 1, Math.floor(fz))) &&
          !isSolid(this.world.getBlock(Math.floor(fx), fy + 2, Math.floor(fz)))) {
        this.vel.y = 8.2;
        this.onGround = false;
      }
    }

    this._moveAxis('x', this.vel.x * dt);
    this._moveAxis('z', this.vel.z * dt);
    this.onGround = false;
    this._moveAxis('y', this.vel.y * dt);

    // melee the player
    if (this.cooldown > 0) this.cooldown -= dt;
    const dyEye = Math.abs(player.pos.y - this.pos.y);
    if (dist <= ATTACK_RANGE && dyEye < 2 && this.cooldown <= 0 && !survival.dead) {
      survival.hurt(ATTACK_DMG);
      this.cooldown = ATTACK_CD;
      const inv = dist > 0.001 ? 1 / dist : 0;
      player.vel.x += dx * inv * 4.5;
      player.vel.z += dz * inv * 4.5;
      player.vel.y = Math.max(player.vel.y, 3.5);
    }

    // daylight burn (checked periodically)
    this.skyTimer -= dt;
    if (this.skyTimer <= 0) {
      this.skyTimer = 0.5;
      this.skyExposed = this._isSkyExposed();
    }

    // walk animation
    const moving = Math.abs(this.vel.x) + Math.abs(this.vel.z) > 0.1;
    if (moving) this.phase += dt * 9;
    const sw = moving ? Math.sin(this.phase) : 0;
    this.lleg.rotation.x = sw * 0.7;
    this.rleg.rotation.x = -sw * 0.7;
    this.larm.rotation.x = -1.3 + Math.sin(this.phase + Math.PI) * 0.25;
    this.rarm.rotation.x = -1.3 + Math.sin(this.phase) * 0.25;

    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;

    if (this.hurtFlash > 0) this.hurtFlash -= dt;
  }

  _isSkyExposed() {
    const x = Math.floor(this.pos.x), z = Math.floor(this.pos.z);
    for (let y = Math.floor(this.pos.y + MOB_H) + 1; y < HEIGHT; y++) {
      if (isSolid(this.world.getBlock(x, y, z))) return false;
    }
    return true;
  }

  applyTint(brightness) {
    const flash = this.hurtFlash > 0;
    const set = (mat, base) => {
      if (flash) mat.color.setRGB(1, 0.3, 0.3);
      else mat.color.setRGB(base.r * brightness, base.g * brightness, base.b * brightness);
    };
    set(this.mat.skin, SKIN);
    set(this.mat.shirt, SHIRT);
    set(this.mat.pants, PANTS);
  }

  dispose() {
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const k in this.mat) this.mat[k].dispose();
  }
}

export class MobManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.mobs = [];
    this.spawnTimer = 0;
  }

  update(dt, ctx) {
    const { player, survival, isNight, brightness } = ctx;

    if (isNight && this.mobs.length < CAP) {
      this.spawnTimer += dt;
      if (this.spawnTimer >= SPAWN_INTERVAL) {
        this.spawnTimer = 0;
        this._trySpawn(player);
      }
    } else {
      this.spawnTimer = 0;
    }

    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      m.update(dt, player, survival);

      // burn in daylight
      if (brightness > 0.82 && m.skyExposed) {
        m.health -= dt * 3;
        m.hurtFlash = 0.15;
      }

      m.applyTint(Math.max(0.55, brightness));

      const far = Math.hypot(player.pos.x - m.pos.x, player.pos.z - m.pos.z) > DESPAWN_DIST;
      if (m.health <= 0 || m.pos.y < -8 || far) {
        this.scene.remove(m.group);
        m.dispose();
        this.mobs.splice(i, 1);
      }
    }
  }

  _trySpawn(player) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const ang = Math.random() * Math.PI * 2;
      const d = 14 + Math.random() * 16;
      const x = player.pos.x + Math.cos(ang) * d;
      const z = player.pos.z + Math.sin(ang) * d;
      const fx = Math.floor(x), fz = Math.floor(z);
      const y = this.world.surfaceY(fx, fz);
      if (y <= 1 || y >= HEIGHT - 2) continue;
      // need ground below and two air blocks for the body
      if (!isSolid(this.world.getBlock(fx, y - 1, fz))) continue;
      if (isSolid(this.world.getBlock(fx, y, fz)) || isSolid(this.world.getBlock(fx, y + 1, fz))) continue;
      const m = new Zombie(this.world, fx + 0.5, y, fz + 0.5);
      this.scene.add(m.group);
      this.mobs.push(m);
      return;
    }
  }

  // Nearest zombie hit by a ray (player attack). Returns {mob, dist} or null.
  attackRay(origin, dir, maxDist) {
    let best = null, bestT = Infinity;
    for (const m of this.mobs) {
      const cx = m.pos.x, cy = m.pos.y + MOB_H * 0.5, cz = m.pos.z;
      const ox = origin.x - cx, oy = origin.y - cy, oz = origin.z - cz;
      const b = ox * dir.x + oy * dir.y + oz * dir.z;
      const c = ox * ox + oy * oy + oz * oz - HIT_RADIUS * HIT_RADIUS;
      const disc = b * b - c;
      if (disc < 0) continue;
      const sq = Math.sqrt(disc);
      let t = -b - sq;
      if (t < 0) t = -b + sq;
      if (t < 0 || t > maxDist) continue;
      if (t < bestT) { bestT = t; best = m; }
    }
    return best ? { mob: best, dist: bestT } : null;
  }

  damageMob(mob, dmg, fromPos) {
    mob.health -= dmg;
    mob.hurtFlash = 0.2;
    const kx = mob.pos.x - fromPos.x;
    const kz = mob.pos.z - fromPos.z;
    const d = Math.hypot(kx, kz) || 1;
    mob.vel.x += (kx / d) * 6;
    mob.vel.z += (kz / d) * 6;
    mob.vel.y = 5;
  }

  damageInRadius(cx, cy, cz, r, dmg) {
    for (const m of this.mobs) {
      const d = Math.hypot(m.pos.x - cx, m.pos.y + MOB_H * 0.5 - cy, m.pos.z - cz);
      if (d <= r) this.damageMob(m, dmg * (1 - d / (r + 1)), { x: cx, y: cy, z: cz });
    }
  }

  count() {
    return this.mobs.length;
  }
}
