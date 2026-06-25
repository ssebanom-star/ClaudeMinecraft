// Player controller: pointer-lock camera, AABB voxel collision, gravity,
// jumping, swimming, and voxel raycasting for targeting blocks.
import * as THREE from 'three';
import { isSolid, isLiquid } from './blocks.js';
import { HEIGHT } from './world.js';

const WIDTH = 0.6;
const HALF = WIDTH / 2;
const PHEIGHT = 1.8;
const EYE = 1.62;

export class Player {
  constructor(camera, world, dom) {
    this.camera = camera;
    this.world = world;
    this.dom = dom;
    this.pos = new THREE.Vector3(0, 40, 0); // feet position
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.inWater = false;
    this.flying = false;
    this.reach = 5;

    this.keys = {};
    this.speed = 4.6;
    this.sprintMul = 1.6;
    this.sprinting = false;

    // touch / mobile input
    this.touchMode = false;     // set true on touch devices to skip pointer lock
    this.joyFwd = 0;            // analog forward (-1..1) from virtual joystick
    this.joyStr = 0;            // analog strafe  (-1..1)

    this._bindInput();
  }

  _bindInput() {
    const canvas = this.dom;
    canvas.addEventListener('click', () => {
      if (this.touchMode) return; // touch devices use drag-to-look, no pointer lock
      if (!document.pointerLockElement) canvas.requestPointerLock();
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      const s = 0.0022;
      this.yaw -= e.movementX * s;
      this.pitch -= e.movementY * s;
      const lim = Math.PI / 2 - 0.01;
      this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
    });
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'ShiftLeft') this.sprinting = true;
      if (e.code === 'KeyF') this.flying = !this.flying;
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.code === 'ShiftLeft') this.sprinting = false;
    });
  }

  get locked() {
    return document.pointerLockElement === this.dom;
  }

  // Apply look rotation from a touch/drag delta (pixels).
  addLook(dx, dy) {
    const s = 0.004;
    this.yaw -= dx * s;
    this.pitch -= dy * s;
    const lim = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  }

  // ---- collision helpers ----
  collides(pos) {
    const minX = Math.floor(pos.x - HALF);
    const maxX = Math.floor(pos.x + HALF);
    const minY = Math.floor(pos.y);
    const maxY = Math.floor(pos.y + PHEIGHT);
    const minZ = Math.floor(pos.z - HALF);
    const maxZ = Math.floor(pos.z + HALF);
    for (let x = minX; x <= maxX; x++)
      for (let y = minY; y <= maxY; y++)
        for (let z = minZ; z <= maxZ; z++)
          if (isSolid(this.world.getBlock(x, y, z))) return true;
    return false;
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    // water check at body center
    this.inWater = isLiquid(
      this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.9), Math.floor(this.pos.z))
    );

    // movement input relative to yaw
    let fwd = 0, str = 0;
    if (this.keys['KeyW']) fwd += 1;
    if (this.keys['KeyS']) fwd -= 1;
    if (this.keys['KeyA']) str -= 1;
    if (this.keys['KeyD']) str += 1;
    // analog joystick (mobile)
    fwd += this.joyFwd;
    str += this.joyStr;

    // Movement is relative to where the camera looks. Forward matches the
    // horizontal look direction (sin, cos); right (strafe) = forward x up.
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let mx = fwd * sin - str * cos;
    let mz = fwd * cos + str * sin;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }

    let speed = this.speed * (this.sprinting && fwd > 0 ? this.sprintMul : 1);

    if (this.flying) {
      speed *= 2.2;
      this.vel.x = mx * speed;
      this.vel.z = mz * speed;
      this.vel.y = 0;
      if (this.keys['Space']) this.vel.y = speed;
      if (this.keys['ControlLeft']) this.vel.y = -speed;
    } else if (this.inWater) {
      speed *= 0.6;
      this.vel.x = mx * speed;
      this.vel.z = mz * speed;
      this.vel.y -= 8 * dt; // buoyant gravity
      this.vel.y *= 0.9;
      if (this.keys['Space']) {
        // standing on the bottom: a real jump clears the surface; otherwise swim up
        this.vel.y = this.onGround ? 8.4 : 3.0;
        this.onGround = false;
      }
      this.vel.y = Math.max(this.vel.y, -3);
    } else {
      this.vel.x = mx * speed;
      this.vel.z = mz * speed;
      this.vel.y -= 26 * dt; // gravity
      if (this.keys['Space'] && this.onGround) {
        this.vel.y = 8.4;
        this.onGround = false;
      }
    }

    // integrate with per-axis collision resolution
    const prevY = this.vel.y;
    this._moveAxis('x', this.vel.x * dt);
    this._moveAxis('z', this.vel.z * dt);
    this.onGround = false;
    this._moveAxis('y', this.vel.y * dt);

    // fall damage signal: capture landing speed
    this.landedSpeed = 0;
    if (this.onGround && prevY < 0) {
      this.landedSpeed = -prevY;
    }

    if (this.pos.y < -10) {
      // fell out of world: respawn-ish
      this.pos.set(this.pos.x, this.world.surfaceY(Math.floor(this.pos.x), Math.floor(this.pos.z)) + 1, this.pos.z);
      this.vel.set(0, 0, 0);
    }

    this._updateCamera();
  }

  _moveAxis(axis, amount) {
    if (amount === 0) return;
    const test = this.pos.clone();
    test[axis] += amount;
    if (!this.collides(test)) {
      this.pos[axis] = test[axis];
      return;
    }
    // collision: stop velocity on this axis
    if (axis === 'y') {
      if (amount < 0) this.onGround = true;
      this.vel.y = 0;
    } else {
      this.vel[axis] = 0;
    }
  }

  _updateCamera() {
    this.camera.position.set(this.pos.x, this.pos.y + EYE, this.pos.z);
    const dir = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    this.camera.lookAt(this.camera.position.clone().add(dir));
  }

  lookDir() {
    return new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch)
    );
  }

  // Voxel raycast (Amanatides & Woo). Returns {x,y,z, nx,ny,nz, id} or null.
  raycast() {
    const origin = this.camera.position.clone();
    const dir = this.lookDir().normalize();
    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);
    const stepX = Math.sign(dir.x);
    const stepY = Math.sign(dir.y);
    const stepZ = Math.sign(dir.z);
    const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
    const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
    const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;
    const fracX = origin.x - x, fracY = origin.y - y, fracZ = origin.z - z;
    let tMaxX = dir.x > 0 ? (1 - fracX) * tDeltaX : fracX * tDeltaX;
    let tMaxY = dir.y > 0 ? (1 - fracY) * tDeltaY : fracY * tDeltaY;
    let tMaxZ = dir.z > 0 ? (1 - fracZ) * tDeltaZ : fracZ * tDeltaZ;
    let nx = 0, ny = 0, nz = 0;

    for (let i = 0; i < this.reach * 8; i++) {
      const id = this.world.getBlock(x, y, z);
      if (id !== 0 && !isLiquid(id)) {
        return { x, y, z, nx, ny, nz, id };
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0;
      } else if (tMaxY < tMaxZ) {
        y += stepY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0;
      } else {
        z += stepZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ;
      }
      // distance limit
      if (Math.min(tMaxX, tMaxY, tMaxZ) > this.reach) break;
    }
    return null;
  }
}

export { WIDTH, PHEIGHT, EYE };
