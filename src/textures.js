// Procedurally builds a texture atlas for all blocks (no external image assets).
// Each block gets 3 tiles in the atlas: [top, side, bottom].
import * as THREE from 'three';
import { BLOCKS } from './blocks.js';

const TILE = 16;          // pixels per tile
const COLS = 16;          // tiles per atlas row

// Simple seeded hash for stable per-pixel noise.
function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) >>> 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

function shade(hex, amt) {
  const c = parseInt(hex.slice(1), 16);
  let r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  r = Math.max(0, Math.min(255, r + amt));
  g = Math.max(0, Math.min(255, g + amt));
  b = Math.max(0, Math.min(255, b + amt));
  return `rgb(${r},${g},${b})`;
}

function drawTile(ctx, ox, oy, color, style, face, seed) {
  ctx.fillStyle = color;
  ctx.fillRect(ox, oy, TILE, TILE);

  const px = (x, y, col) => {
    ctx.fillStyle = col;
    ctx.fillRect(ox + x, oy + y, 1, 1);
  };

  switch (style) {
    case 'noise':
    case 'ore':
    case 'wool': {
      for (let y = 0; y < TILE; y++)
        for (let x = 0; x < TILE; x++) {
          const n = hash(x, y, seed);
          const amt = (n - 0.5) * (style === 'wool' ? 22 : 40);
          px(x, y, shade(color, amt));
        }
      if (style === 'ore' && face === 'side') {
        // sprinkle ore nuggets using top color stored in seed offset handled by caller
      }
      break;
    }
    case 'grass': {
      if (face === 'top') {
        for (let y = 0; y < TILE; y++)
          for (let x = 0; x < TILE; x++)
            px(x, y, shade(color, (hash(x, y, seed) - 0.5) * 36));
      } else if (face === 'side') {
        // dirt with grassy top fringe
        for (let y = 0; y < TILE; y++)
          for (let x = 0; x < TILE; x++)
            px(x, y, shade(color, (hash(x, y, seed) - 0.5) * 36));
        const top = '#5fbb46';
        for (let x = 0; x < TILE; x++) {
          const h = 3 + Math.floor(hash(x, 99, seed) * 3);
          for (let y = 0; y < h; y++) px(x, y, shade(top, (hash(x, y, seed) - 0.5) * 30));
        }
      } else {
        for (let y = 0; y < TILE; y++)
          for (let x = 0; x < TILE; x++)
            px(x, y, shade(color, (hash(x, y, seed) - 0.5) * 36));
      }
      break;
    }
    case 'plank': {
      for (let y = 0; y < TILE; y++)
        for (let x = 0; x < TILE; x++)
          px(x, y, shade(color, (hash(x, y, seed) - 0.5) * 18));
      ctx.fillStyle = shade(color, -45);
      for (let y = 3; y < TILE; y += 4) ctx.fillRect(ox, oy + y, TILE, 1);
      break;
    }
    case 'log': {
      if (face === 'top') {
        for (let y = 0; y < TILE; y++)
          for (let x = 0; x < TILE; x++) {
            const dx = x - 7.5, dy = y - 7.5;
            const r = Math.sqrt(dx * dx + dy * dy);
            px(x, y, shade(color, Math.sin(r * 1.8) * 18 + (hash(x, y, seed) - 0.5) * 12));
          }
      } else {
        for (let y = 0; y < TILE; y++)
          for (let x = 0; x < TILE; x++)
            px(x, y, shade(color, (hash(x, y, seed) - 0.5) * 22));
        ctx.fillStyle = shade(color, -35);
        for (let x = 2; x < TILE; x += 5) ctx.fillRect(ox + x, oy, 1, TILE);
      }
      break;
    }
    case 'leaves': {
      for (let y = 0; y < TILE; y++)
        for (let x = 0; x < TILE; x++) {
          const n = hash(x, y, seed);
          if (n < 0.12) px(x, y, 'rgba(0,0,0,0)');
          else px(x, y, shade(color, (n - 0.5) * 60));
        }
      break;
    }
    case 'pane': {
      ctx.fillStyle = color;
      ctx.fillRect(ox, oy, TILE, TILE);
      ctx.clearRect(ox + 2, oy + 2, TILE - 4, TILE - 4);
      ctx.fillStyle = shade(color, 30);
      ctx.fillRect(ox, oy, TILE, 1);
      ctx.fillRect(ox, oy, 1, TILE);
      ctx.fillRect(ox + TILE - 1, oy, 1, TILE);
      ctx.fillRect(ox, oy + TILE - 1, TILE, 1);
      // faint highlight streak
      ctx.fillStyle = shade(color, 60);
      ctx.fillRect(ox + 3, oy + 3, 1, 4);
      break;
    }
    case 'liquid': {
      for (let y = 0; y < TILE; y++)
        for (let x = 0; x < TILE; x++) {
          const w = Math.sin((x + y) * 0.9) * 0.5 + 0.5;
          px(x, y, shade(color, (w - 0.5) * 30 + (hash(x, y, seed) - 0.5) * 14));
        }
      break;
    }
    case 'brick': {
      for (let y = 0; y < TILE; y++)
        for (let x = 0; x < TILE; x++)
          px(x, y, shade(color, (hash(x, y, seed) - 0.5) * 14));
      ctx.fillStyle = shade(color, -50);
      for (let y = 0; y < TILE; y += 4) ctx.fillRect(ox, oy + y, TILE, 1);
      for (let y = 0; y < TILE; y += 8) {
        for (let x = 0; x < TILE; x += 8) ctx.fillRect(ox + x, oy + y, 1, 4);
        for (let x = 4; x < TILE; x += 8) ctx.fillRect(ox + x, oy + y + 4, 1, 4);
      }
      break;
    }
    default: {
      for (let y = 0; y < TILE; y++)
        for (let x = 0; x < TILE; x++)
          px(x, y, shade(color, (hash(x, y, seed) - 0.5) * 16));
    }
  }
}

// Build atlas and return { texture, uvFor(id, face) }
export function buildAtlas() {
  const tilesPerBlock = 3; // top, side, bottom
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
      { face: 'top', color: def.top, idx: base + 0 },
      { face: 'side', color: def.side, idx: base + 1 },
      { face: 'bottom', color: def.bottom, idx: base + 2 },
    ];
    faces.forEach(({ face, color, idx }) => {
      const cx = (idx % COLS) * TILE;
      const cy = Math.floor(idx / COLS) * TILE;
      drawTile(ctx, cx, cy, color, def.style, face, i + 1);
      // ore overlay: speckle the "top" color (ore mineral color) onto stone side
      if (def.style === 'ore' && face !== 'top') {
        ctx.save();
        for (let k = 0; k < 10; k++) {
          const rx = Math.floor(hash(k, idx, 7) * (TILE - 2));
          const ry = Math.floor(hash(idx, k, 11) * (TILE - 2));
          ctx.fillStyle = def.top;
          ctx.fillRect(cx + rx, cy + ry, 2, 2);
        }
        ctx.restore();
      }
    });
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;

  const uTile = TILE / canvas.width;
  const vTile = TILE / canvas.height;
  const pad = 0.5 / canvas.width; // tiny inset to avoid bleeding

  function uvFor(id, face) {
    const i = id - 1;
    const base = i * tilesPerBlock;
    let idx = base + 1; // side default
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

  // Returns a small data URL of one tile (side face) for inventory icons.
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
