// Procedurally builds a texture atlas for all blocks (no external image assets).
// Each block gets 3 tiles in the atlas: [top, side, bottom]. Tiles are drawn
// from the block's per-face colors + a "style" renderer.
import * as THREE from 'three';
import { BLOCKS } from './blocks.js';

const TILE = 16;
const COLS = 16;

// seeded per-pixel hash 0..1
function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) >>> 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

// clustered (low + high frequency) noise -> looks rocky rather than like TV static
function cnoise(x, y, s) {
  return 0.55 * hash(x, y, s) + 0.45 * hash((x / 4) | 0, (y / 4) | 0, s + 1234);
}

function shade(hex, amt) {
  const c = parseInt(hex.slice(1), 16);
  let r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  r = Math.max(0, Math.min(255, r + amt));
  g = Math.max(0, Math.min(255, g + amt));
  b = Math.max(0, Math.min(255, b + amt));
  return `rgb(${r},${g},${b})`;
}

function bevel(ctx, ox, oy) {
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(ox, oy, TILE, 1);
  ctx.fillRect(ox, oy, 1, TILE);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(ox, oy + TILE - 1, TILE, 1);
  ctx.fillRect(ox + TILE - 1, oy, 1, TILE);
}

function faceColor(def, face) {
  return face === 'top' ? def.top : face === 'bottom' ? def.bottom : def.side;
}

function drawTile(ctx, ox, oy, def, face, seed) {
  const color = faceColor(def, face);
  const style = def.style;
  const px = (x, y, col) => { ctx.fillStyle = col; ctx.fillRect(ox + x, oy + y, 1, 1); };

  ctx.fillStyle = color;
  ctx.fillRect(ox, oy, TILE, TILE);

  switch (style) {
    case 'noise': {
      for (let y = 0; y < TILE; y++)
        for (let x = 0; x < TILE; x++)
          px(x, y, shade(color, (cnoise(x, y, seed) - 0.5) * 34));
      // a few darker speckles / specks of grit
      for (let k = 0; k < 8; k++) {
        const rx = Math.floor(hash(k, seed, 3) * TILE);
        const ry = Math.floor(hash(seed, k, 5) * TILE);
        px(rx, ry, shade(color, -40));
        px((rx + 1) % TILE, ry, shade(color, 22));
      }
      bevel(ctx, ox, oy);
      break;
    }
    case 'cobble': {
      // mortar base, then rounded stones
      ctx.fillStyle = shade(color, -55);
      ctx.fillRect(ox, oy, TILE, TILE);
      const cells = [
        [1, 1, 6, 6], [9, 1, 6, 5], [1, 9, 5, 6], [8, 8, 7, 7],
        [7, 1, 1, 5], [1, 7, 5, 1],
      ];
      for (const [sx, sy, sw, sh] of cells) {
        for (let y = 0; y < sh; y++)
          for (let x = 0; x < sw; x++) {
            if (sx + x >= TILE || sy + y >= TILE) continue;
            const edge = x === 0 || y === 0 || x === sw - 1 || y === sh - 1;
            const amt = (cnoise(sx + x, sy + y, seed) - 0.5) * 30 + (edge ? -14 : 6);
            px(sx + x, sy + y, shade(color, amt));
          }
      }
      bevel(ctx, ox, oy);
      break;
    }
    case 'grass': {
      if (face === 'top') {
        for (let y = 0; y < TILE; y++)
          for (let x = 0; x < TILE; x++) {
            const n = cnoise(x, y, seed);
            px(x, y, shade(color, (n - 0.5) * 30 - (n > 0.82 ? 18 : 0)));
          }
      } else if (face === 'side') {
        const dirt = def.side;
        for (let y = 0; y < TILE; y++)
          for (let x = 0; x < TILE; x++)
            px(x, y, shade(dirt, (cnoise(x, y, seed) - 0.5) * 30));
        const top = def.top;
        for (let x = 0; x < TILE; x++) {
          const h = 3 + Math.floor(hash(x, 99, seed) * 3);
          for (let y = 0; y < h; y++) px(x, y, shade(top, (hash(x, y, seed) - 0.5) * 28));
          // a couple of dangling grass blades
          if (hash(x, 7, seed) > 0.78) px(x, h, shade(top, -10));
        }
        bevel(ctx, ox, oy);
      } else {
        const dirt = def.bottom;
        for (let y = 0; y < TILE; y++)
          for (let x = 0; x < TILE; x++)
            px(x, y, shade(dirt, (cnoise(x, y, seed) - 0.5) * 30));
        bevel(ctx, ox, oy);
      }
      break;
    }
    case 'plank': {
      for (let y = 0; y < TILE; y++)
        for (let x = 0; x < TILE; x++)
          px(x, y, shade(color, (hash(x, y * 3, seed) - 0.5) * 16));
      // plank seams
      ctx.fillStyle = shade(color, -50);
      for (let y = 3; y < TILE; y += 4) ctx.fillRect(ox, oy + y, TILE, 1);
      // grain lines + occasional knot
      for (let y = 0; y < TILE; y++) {
        if (hash(0, y, seed) > 0.6) {
          const gx = Math.floor(hash(1, y, seed) * (TILE - 2));
          px(gx, y, shade(color, -22));
        }
      }
      const kx = 3 + Math.floor(hash(seed, 2, 9) * 8);
      px(kx, 5, shade(color, -38)); px(kx + 1, 5, shade(color, -28)); px(kx, 6, shade(color, -30));
      bevel(ctx, ox, oy);
      break;
    }
    case 'log': {
      if (face === 'top' || face === 'bottom') {
        const ring = def.top;
        for (let y = 0; y < TILE; y++)
          for (let x = 0; x < TILE; x++) {
            const dx = x - 7.5, dy = y - 7.5;
            const r = Math.sqrt(dx * dx + dy * dy);
            px(x, y, shade(ring, Math.sin(r * 2.0) * 16 + (hash(x, y, seed) - 0.5) * 10));
          }
      } else {
        const bark = def.side;
        for (let y = 0; y < TILE; y++)
          for (let x = 0; x < TILE; x++)
            px(x, y, shade(bark, (hash(x, (y / 2) | 0, seed) - 0.5) * 26));
        ctx.fillStyle = shade(bark, -38);
        for (let x = 2; x < TILE; x += 5) ctx.fillRect(ox + x, oy, 1, TILE);
        ctx.fillStyle = shade(bark, 18);
        for (let x = 4; x < TILE; x += 5) ctx.fillRect(ox + x, oy, 1, TILE);
        bevel(ctx, ox, oy);
      }
      break;
    }
    case 'leaves': {
      for (let y = 0; y < TILE; y++)
        for (let x = 0; x < TILE; x++) {
          const n = hash(x, y, seed);
          if (n < 0.10) px(x, y, 'rgba(0,0,0,0)');
          else {
            const c2 = cnoise(x, y, seed + 5);
            px(x, y, shade(color, (c2 - 0.5) * 70));
          }
        }
      break;
    }
    case 'pane': {
      ctx.clearRect(ox + 1, oy + 1, TILE - 2, TILE - 2);
      ctx.fillStyle = shade(color, 10);
      ctx.fillRect(ox + 1, oy + 1, TILE - 2, TILE - 2);
      ctx.clearRect(ox + 3, oy + 3, TILE - 6, TILE - 6);
      ctx.fillStyle = shade(color, 40);
      ctx.fillRect(ox, oy, TILE, 1);
      ctx.fillRect(ox, oy, 1, TILE);
      ctx.fillRect(ox + TILE - 1, oy, 1, TILE);
      ctx.fillRect(ox, oy + TILE - 1, TILE, 1);
      ctx.fillStyle = shade(color, 80);
      ctx.fillRect(ox + 4, oy + 4, 1, 4);
      ctx.fillRect(ox + 4, oy + 4, 3, 1);
      break;
    }
    case 'liquid': {
      for (let y = 0; y < TILE; y++)
        for (let x = 0; x < TILE; x++) {
          const w = Math.sin((x + y) * 0.7) * 0.5 + Math.sin((x - y) * 0.4) * 0.3;
          px(x, y, shade(color, w * 24 + (hash(x, y, seed) - 0.5) * 12));
        }
      break;
    }
    case 'brick': {
      for (let y = 0; y < TILE; y++)
        for (let x = 0; x < TILE; x++)
          px(x, y, shade(color, (cnoise(x, y, seed) - 0.5) * 16));
      ctx.fillStyle = shade(color, -52);
      for (let y = 0; y < TILE; y += 4) ctx.fillRect(ox, oy + y, TILE, 1);
      for (let row = 0; row < 4; row++) {
        const y = row * 4;
        const off = row % 2 ? 4 : 0;
        for (let x = off; x < TILE; x += 8) ctx.fillRect(ox + x, oy + y, 1, 4);
      }
      // mortar highlight
      ctx.fillStyle = shade(color, 18);
      for (let y = 1; y < TILE; y += 4) ctx.fillRect(ox, oy + y, TILE, 1);
      break;
    }
    case 'ore': {
      const stone = def.side;
      const mineral = def.top;
      for (let y = 0; y < TILE; y++)
        for (let x = 0; x < TILE; x++)
          px(x, y, shade(stone, (cnoise(x, y, seed) - 0.5) * 30));
      // mineral nuggets
      const blobs = [[4, 4], [10, 5], [6, 10], [11, 11], [3, 11], [9, 9]];
      for (let i = 0; i < blobs.length; i++) {
        const [bx, by] = blobs[i];
        if (hash(bx, by, seed) < 0.25) continue;
        const cells = [[0, 0], [1, 0], [0, 1], [1, 1], [2, 1], [1, 2]];
        for (const [ddx, ddy] of cells) {
          const x = bx + ddx, y = by + ddy;
          if (x >= TILE || y >= TILE) continue;
          px(x, y, shade(mineral, (hash(x, y, seed) - 0.5) * 26));
        }
        px(bx, by, shade(mineral, 45));        // highlight
        px(bx + 1, by + 2, shade(mineral, -45)); // shadow
      }
      bevel(ctx, ox, oy);
      break;
    }
    case 'wool': {
      for (let y = 0; y < TILE; y++)
        for (let x = 0; x < TILE; x++)
          px(x, y, shade(color, (cnoise(x, y, seed) - 0.5) * 18));
      // soft fiber dabs
      for (let k = 0; k < 12; k++) {
        const rx = Math.floor(hash(k, seed, 2) * TILE);
        const ry = Math.floor(hash(seed, k, 4) * TILE);
        px(rx, ry, shade(color, 14));
      }
      bevel(ctx, ox, oy);
      break;
    }
    default: {
      for (let y = 0; y < TILE; y++)
        for (let x = 0; x < TILE; x++)
          px(x, y, shade(color, (cnoise(x, y, seed) - 0.5) * 16));
      bevel(ctx, ox, oy);
    }
  }
}

export function buildAtlas() {
  const tilesPerBlock = 3;
  const totalTiles = BLOCKS.length * tilesPerBlock;
  const rows = Math.ceil(totalTiles / COLS);
  const canvas = document.createElement('canvas');
  canvas.width = COLS * TILE;
  canvas.height = rows * TILE;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  BLOCKS.forEach((def, i) => {
    const base = i * tilesPerBlock;
    const faces = [
      { face: 'top', idx: base + 0 },
      { face: 'side', idx: base + 1 },
      { face: 'bottom', idx: base + 2 },
    ];
    faces.forEach(({ face, idx }) => {
      const cx = (idx % COLS) * TILE;
      const cy = Math.floor(idx / COLS) * TILE;
      drawTile(ctx, cx, cy, def, face, i + 1);
    });
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;

  const uTile = TILE / canvas.width;
  const vTile = TILE / canvas.height;
  const pad = 0.5 / canvas.width;

  function uvFor(id, face) {
    const i = id - 1;
    const base = i * tilesPerBlock;
    let idx = base + 1;
    if (face === 'top') idx = base + 0;
    else if (face === 'bottom') idx = base + 2;
    const col = idx % COLS;
    const row = Math.floor(idx / COLS);
    const u0 = col * uTile + pad;
    const v1 = 1 - row * vTile - pad;
    const u1 = (col + 1) * uTile - pad;
    const v0 = 1 - (row + 1) * vTile + pad;
    return { u0, v0, u1, v1 };
  }

  function iconFor(id) {
    const i = id - 1;
    const idx = i * tilesPerBlock + 1;
    const col = idx % COLS;
    const row = Math.floor(idx / COLS);
    const out = document.createElement('canvas');
    out.width = TILE;
    out.height = TILE;
    const octx = out.getContext('2d');
    octx.imageSmoothingEnabled = false;
    octx.drawImage(canvas, col * TILE, row * TILE, TILE, TILE, 0, 0, TILE, TILE);
    return out.toDataURL();
  }

  return { texture, uvFor, iconFor, canvas };
}
