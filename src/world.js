// Chunk-based voxel world: terrain generation + greedy-ish meshing with baked
// face shading and ambient occlusion.
import * as THREE from 'three';
import { Perlin, RNG } from './noise.js';
import { AIR, ID, isTransparent, isSolid, blockDef } from './blocks.js';

export const CHUNK = 16;
export const HEIGHT = 64;
export const SEA = 26;

// Build 6 face definitions programmatically (positions + AO sample offsets).
function buildFaceDefs() {
  const dirs = [
    { n: [1, 0, 0], face: 'side', shade: 0.82 },
    { n: [-1, 0, 0], face: 'side', shade: 0.82 },
    { n: [0, 1, 0], face: 'top', shade: 1.0 },
    { n: [0, -1, 0], face: 'bottom', shade: 0.5 },
    { n: [0, 0, 1], face: 'side', shade: 0.68 },
    { n: [0, 0, -1], face: 'side', shade: 0.68 },
  ];
  const axis = (n) => (n[0] ? 0 : n[1] ? 1 : 2);
  return dirs.map((d) => {
    const na = axis(d.n);
    const ua = (na + 1) % 3;
    const va = (na + 2) % 3;
    const corners = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ].map(([su, sv]) => {
      const pos = [0, 0, 0];
      pos[na] = d.n[na] > 0 ? 1 : 0;
      pos[ua] = su;
      pos[va] = sv;
      const au = su ? 1 : -1;
      const av = sv ? 1 : -1;
      const s1 = [0, 0, 0];
      s1[na] = d.n[na];
      s1[ua] = au;
      const s2 = [0, 0, 0];
      s2[na] = d.n[na];
      s2[va] = av;
      const c = [0, 0, 0];
      c[na] = d.n[na];
      c[ua] = au;
      c[va] = av;
      return { pos, ao: [s1, s2, c], uv: [su, sv] };
    });
    return { ...d, corners };
  });
}
const FACE_DEFS = buildFaceDefs();

function aoLevel(s1, s2, c) {
  if (s1 && s2) return 0;
  return 3 - (s1 + s2 + c);
}

export class World {
  constructor(scene, atlas, seed = 20260614) {
    this.scene = scene;
    this.atlas = atlas;
    this.seed = seed;
    this.heightNoise = new Perlin(seed);
    this.detailNoise = new Perlin(seed ^ 0x9e3779b9);
    this.biomeNoise = new Perlin(seed ^ 0x12345);
    this.caveNoise = new Perlin(seed ^ 0xabcdef);
    this.chunks = new Map();

    this.opaqueMat = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      vertexColors: true,
      side: THREE.DoubleSide,
    });
    this.cutoutMat = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.5,
    });
    this.waterMat = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
  }

  key(cx, cz) {
    return cx + ',' + cz;
  }

  // ---- terrain generation ----
  generateChunk(cx, cz) {
    const blocks = new Uint8Array(CHUNK * HEIGHT * CHUNK);
    const idx = (x, y, z) => (y * CHUNK + z) * CHUNK + x;
    const rng = new RNG((cx * 73856093) ^ (cz * 19349663) ^ this.seed);

    const treeSpots = [];

    for (let x = 0; x < CHUNK; x++) {
      for (let z = 0; z < CHUNK; z++) {
        const wx = cx * CHUNK + x;
        const wz = cz * CHUNK + z;

        const base = this.heightNoise.fbm2(wx * 0.012, wz * 0.012, 4, 2, 0.5);
        const detail = this.detailNoise.fbm2(wx * 0.05, wz * 0.05, 3, 2, 0.5);
        const biome = this.biomeNoise.fbm2(wx * 0.004, wz * 0.004, 2, 2, 0.5);

        let h = Math.floor(SEA + base * 16 + detail * 4);
        h = Math.max(4, Math.min(HEIGHT - 8, h));

        const desert = biome > 0.35;
        const snowy = biome < -0.4;
        const mountain = base > 0.45;

        for (let y = 0; y <= h; y++) {
          let id;
          if (y === 0) id = ID.Bedrock;
          else if (y < h - 4) {
            id = ID.Stone;
            // ore distribution by depth
            const o = this.caveNoise.noise3(wx * 0.1, y * 0.1, wz * 0.1);
            if (y < 14 && rng.next() < 0.006) id = ID.DiamondOre;
            else if (y < 18 && rng.next() < 0.004) id = ID.EmeraldOre;
            else if (y < 22 && rng.next() < 0.012) id = ID.GoldOre;
            else if (y < 16 && rng.next() < 0.012) id = ID.RedstoneOre;
            else if (y < 20 && rng.next() < 0.01) id = ID.LapisOre;
            else if (rng.next() < 0.02) id = ID.IronOre;
            else if (rng.next() < 0.03) id = ID.CoalOre;
            // simple caves
            if (o > 0.55 && y > 2 && y < h - 3) id = AIR;
          } else if (y < h) {
            id = desert ? ID.Sandstone : ID.Dirt;
          } else {
            // surface
            if (desert) id = ID.Sand;
            else if (snowy) id = ID.SnowBlock;
            else if (h <= SEA) id = ID.Sand;
            else id = ID.GrassBlock;
            if (mountain && y > SEA + 18) id = ID.Stone;
          }
          if (id) blocks[idx(x, y, z)] = id;
        }

        // water fill
        if (h < SEA) {
          for (let y = h + 1; y <= SEA; y++) {
            if (blocks[idx(x, y, z)] === AIR) blocks[idx(x, y, z)] = ID.Water;
          }
        }

        // surface decorations
        const top = h;
        if (top > SEA && blocks[idx(x, top, z)] === ID.GrassBlock) {
          const r = rng.next();
          if (r < 0.012 && x > 1 && x < CHUNK - 2 && z > 1 && z < CHUNK - 2) {
            treeSpots.push([x, top + 1, z, biome]);
          } else if (r < 0.05) {
            // tall grass / flower as cross-less placeholder: skip (no cross mesh)
          }
        }
        if (desert && top > SEA && blocks[idx(x, top, z)] === ID.Sand) {
          if (rng.next() < 0.01 && x > 0 && x < CHUNK - 1 && z > 0 && z < CHUNK - 1) {
            const ch = 2 + rng.int(0, 2);
            for (let c = 1; c <= ch && top + c < HEIGHT; c++) blocks[idx(x, top + c, z)] = ID.Cactus;
          }
        }
      }
    }

    // grow trees (within chunk bounds only to keep it simple)
    for (const [x, y, z, biome] of treeSpots) {
      const spruce = biome < -0.2;
      const birch = !spruce && biome > 0.15;
      const log = spruce ? ID.SpruceLog : birch ? ID.BirchLog : ID.OakLog;
      const leaf = ID.OakLeaves;
      const th = 4 + rng.int(0, 2);
      for (let i = 0; i < th && y + i < HEIGHT; i++) blocks[idx(x, y + i, z)] = log;
      const cy = y + th;
      for (let dy = -2; dy <= 1; dy++) {
        const r = dy <= -1 ? 2 : 1;
        for (let dx = -r; dx <= r; dx++) {
          for (let dz = -r; dz <= r; dz++) {
            if (dx === 0 && dz === 0 && dy < 1) continue;
            const lx = x + dx, ly = cy + dy, lz = z + dz;
            if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK || ly < 0 || ly >= HEIGHT) continue;
            if (Math.abs(dx) === r && Math.abs(dz) === r && rng.next() < 0.5) continue;
            if (blocks[idx(lx, ly, lz)] === AIR) blocks[idx(lx, ly, lz)] = leaf;
          }
        }
      }
    }

    return { blocks, cx, cz, meshOpaque: null, meshCutout: null, meshWater: null, dirty: true };
  }

  getChunk(cx, cz, create = true) {
    const k = this.key(cx, cz);
    let c = this.chunks.get(k);
    if (!c && create) {
      c = this.generateChunk(cx, cz);
      this.chunks.set(k, c);
    }
    return c;
  }

  getBlock(x, y, z) {
    if (y < 0 || y >= HEIGHT) return AIR;
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    const c = this.chunks.get(this.key(cx, cz));
    if (!c) return AIR;
    const lx = x - cx * CHUNK;
    const lz = z - cz * CHUNK;
    return c.blocks[(y * CHUNK + lz) * CHUNK + lx];
  }

  setBlock(x, y, z, id) {
    if (y < 0 || y >= HEIGHT) return;
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    const c = this.getChunk(cx, cz);
    const lx = x - cx * CHUNK;
    const lz = z - cz * CHUNK;
    c.blocks[(y * CHUNK + lz) * CHUNK + lx] = id;
    c.dirty = true;
    // mark neighbor chunks dirty if on border
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CHUNK - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CHUNK - 1) this.markDirty(cx, cz + 1);
  }

  markDirty(cx, cz) {
    const c = this.chunks.get(this.key(cx, cz));
    if (c) c.dirty = true;
  }

  // ---- meshing ----
  buildMesh(chunk) {
    const { cx, cz, blocks } = chunk;
    const ox = cx * CHUNK;
    const oz = cz * CHUNK;

    const op = { pos: [], col: [], uv: [], idx: [] };
    const cut = { pos: [], col: [], uv: [], idx: [] };
    const wat = { pos: [], col: [], uv: [], idx: [] };

    const at = (x, y, z) => this.getBlock(ox + x, y, oz + z);

    for (let y = 0; y < HEIGHT; y++) {
      for (let z = 0; z < CHUNK; z++) {
        for (let x = 0; x < CHUNK; x++) {
          const id = blocks[(y * CHUNK + z) * CHUNK + x];
          if (id === AIR) continue;
          const def = blockDef(id);
          const isWater = def.liquid;
          const target = isWater ? wat : def.transparent ? cut : op;

          for (const fd of FACE_DEFS) {
            const nx = x + fd.n[0];
            const ny = y + fd.n[1];
            const nz = z + fd.n[2];
            const neighbor = at(nx, ny, nz);

            // face visibility rules
            let show;
            if (isWater) {
              show = neighbor === AIR; // only top/exposed water faces vs air
            } else if (def.transparent) {
              show = neighbor === AIR || (isTransparent(neighbor) && neighbor !== id);
            } else {
              show = isTransparent(neighbor);
            }
            if (!show) continue;

            const uv = this.atlas.uvFor(id, fd.face);
            const vbase = target.pos.length / 3;

            for (let ci = 0; ci < 4; ci++) {
              const corner = fd.corners[ci];
              const px = x + corner.pos[0];
              const py = y + corner.pos[1];
              const pz = z + corner.pos[2];
              target.pos.push(px, py, pz);

              // ambient occlusion
              const s1 = isSolid(at(x + corner.ao[0][0], y + corner.ao[0][1], z + corner.ao[0][2])) ? 1 : 0;
              const s2 = isSolid(at(x + corner.ao[1][0], y + corner.ao[1][1], z + corner.ao[1][2])) ? 1 : 0;
              const cc = isSolid(at(x + corner.ao[2][0], y + corner.ao[2][1], z + corner.ao[2][2])) ? 1 : 0;
              const ao = aoLevel(s1, s2, cc);
              const aoMul = 0.55 + 0.45 * (ao / 3);
              const light = fd.shade * aoMul;
              target.col.push(light, light, light);

              const [su, sv] = corner.uv;
              const u = su ? uv.u1 : uv.u0;
              const v = sv ? uv.v1 : uv.v0;
              target.uv.push(u, v);
            }
            target.idx.push(vbase, vbase + 1, vbase + 2, vbase, vbase + 2, vbase + 3);
          }
        }
      }
    }

    const makeMesh = (data, mat) => {
      if (data.idx.length === 0) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(data.pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(data.col, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(data.uv, 2));
      g.setIndex(data.idx);
      const m = new THREE.Mesh(g, mat);
      m.position.set(ox, 0, oz);
      return m;
    };

    // dispose previous
    for (const key of ['meshOpaque', 'meshCutout', 'meshWater']) {
      if (chunk[key]) {
        this.scene.remove(chunk[key]);
        chunk[key].geometry.dispose();
      }
    }

    chunk.meshOpaque = makeMesh(op, this.opaqueMat);
    chunk.meshCutout = makeMesh(cut, this.cutoutMat);
    chunk.meshWater = makeMesh(wat, this.waterMat);
    for (const m of [chunk.meshOpaque, chunk.meshCutout, chunk.meshWater]) {
      if (m) this.scene.add(m);
    }
    chunk.dirty = false;
  }

  // Ensure chunks around (px,pz) exist; mesh dirty ones (budgeted per call).
  update(px, pz, radius, meshBudget = 2) {
    const ccx = Math.floor(px / CHUNK);
    const ccz = Math.floor(pz / CHUNK);
    // generate
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        this.getChunk(ccx + dx, ccz + dz, true);
      }
    }
    // mesh closest dirty chunks first
    let budget = meshBudget;
    const dirty = [];
    for (const c of this.chunks.values()) {
      if (c.dirty) {
        const d = Math.abs(c.cx - ccx) + Math.abs(c.cz - ccz);
        dirty.push([d, c]);
      }
    }
    dirty.sort((a, b) => a[0] - b[0]);
    for (const [, c] of dirty) {
      if (budget-- <= 0) break;
      this.buildMesh(c);
    }
    // unload far chunks
    const unloadR = radius + 3;
    for (const [k, c] of this.chunks) {
      if (Math.abs(c.cx - ccx) > unloadR || Math.abs(c.cz - ccz) > unloadR) {
        for (const key of ['meshOpaque', 'meshCutout', 'meshWater']) {
          if (c[key]) {
            this.scene.remove(c[key]);
            c[key].geometry.dispose();
          }
        }
        this.chunks.delete(k);
      }
    }
  }

  // Find a safe spawn height at world x,z
  surfaceY(x, z) {
    for (let y = HEIGHT - 1; y > 0; y--) {
      if (isSolid(this.getBlock(x, y, z))) return y + 1;
    }
    return SEA + 1;
  }
}
