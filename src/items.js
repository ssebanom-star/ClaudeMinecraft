// Non-placeable inventory items (tools, materials, armor) and their
// procedurally drawn pixel-art icons. Item ids start at ITEM_BASE so they can
// never collide with block ids (1..50) or be stored in the voxel world.
export const ITEM_BASE = 256;

export const ITEM = {
  Stick: 256,
  Coal: 257,
  IronIngot: 258,
  GoldIngot: 259,
  Diamond: 260,
  Flint: 261,
  FlintAndSteel: 262,
  WoodSword: 263,
  StoneSword: 264,
  IronSword: 265,
  IronHelmet: 266,
  IronChestplate: 267,
  IronLeggings: 268,
  IronBoots: 269,
};

// Each item: name, icon (drawer key), optional tint, and behaviour fields:
//   attack  - melee damage when held (swords)
//   armor   - armor points when worn
//   slot    - armor slot: 'head' | 'chest' | 'legs' | 'feet'
//   use     - special right-click/use action ('ignite' for flint & steel)
const ITEMS = {
  256: { name: '막대기', icon: 'stick' },
  257: { name: '석탄', icon: 'coal' },
  258: { name: '철 주괴', icon: 'ingot', tint: '#dcdcdc' },
  259: { name: '금 주괴', icon: 'ingot', tint: '#f2d34b' },
  260: { name: '다이아몬드', icon: 'gem', tint: '#4be0d6' },
  261: { name: '부싯돌', icon: 'flint' },
  262: { name: '부싯돌과 부시', icon: 'flintsteel', use: 'ignite' },
  263: { name: '나무 검', icon: 'sword', tint: '#b58a4f', attack: 4 },
  264: { name: '돌 검', icon: 'sword', tint: '#9a9a9a', attack: 5 },
  265: { name: '철 검', icon: 'sword', tint: '#e6e6e6', attack: 6 },
  266: { name: '철 투구', icon: 'helmet', tint: '#e6e6e6', armor: 2, slot: 'head' },
  267: { name: '철 흉갑', icon: 'chest', tint: '#e6e6e6', armor: 6, slot: 'chest' },
  268: { name: '철 각반', icon: 'legs', tint: '#e6e6e6', armor: 5, slot: 'legs' },
  269: { name: '철 부츠', icon: 'boots', tint: '#e6e6e6', armor: 2, slot: 'feet' },
};

export function isItem(id) {
  return id >= ITEM_BASE;
}

export function itemDef(id) {
  return ITEMS[id] || null;
}

// ---------------------------------------------------------------------------
// Icon rendering (16x16 pixel art -> data URL, cached per id).
// ---------------------------------------------------------------------------
const SIZE = 16;
const iconCache = {};

function shade(hex, amt) {
  const c = parseInt(hex.slice(1), 16);
  let r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  r = Math.max(0, Math.min(255, r + amt));
  g = Math.max(0, Math.min(255, g + amt));
  b = Math.max(0, Math.min(255, b + amt));
  return `rgb(${r},${g},${b})`;
}

function makeCanvas() {
  const cv = document.createElement('canvas');
  cv.width = SIZE;
  cv.height = SIZE;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const px = (x, y, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); };
  const rect = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
  return { cv, ctx, px, rect };
}

// draw a thick diagonal line of pixels from (x0,y0) to (x1,y1)
function diag(px, x0, y0, x1, y1, col, w = 1) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / steps);
    const y = Math.round(y0 + ((y1 - y0) * i) / steps);
    for (let k = 0; k < w; k++) px(x + k, y, col);
  }
}

const DRAW = {
  stick(c, tint) {
    const base = '#6e4f27';
    diag(c.px, 4, 13, 10, 3, shade(base, -25), 2);
    diag(c.px, 4, 13, 10, 3, base, 1);
    c.px(5, 12, shade(base, 30));
    c.px(8, 6, shade(base, 30));
  },
  coal(c) {
    const blob = [
      [6, 4], [7, 4], [8, 4],
      [5, 5], [6, 5], [7, 5], [8, 5], [9, 5],
      [4, 6], [5, 6], [6, 6], [7, 6], [8, 6], [9, 6], [10, 6],
      [4, 7], [5, 7], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7],
      [4, 8], [5, 8], [6, 8], [7, 8], [8, 8], [9, 8], [10, 8],
      [5, 9], [6, 9], [7, 9], [8, 9], [9, 9], [10, 9],
      [6, 10], [7, 10], [8, 10], [9, 10],
    ];
    for (const [x, y] of blob) c.px(x, y, '#171717');
    c.px(6, 5, '#3a3a3a'); c.px(8, 7, '#444'); c.px(7, 9, '#333');
    c.px(5, 6, '#000'); c.px(10, 8, '#000');
  },
  ingot(c, tint) {
    const rows = [
      [6, 6, 4], [5, 7, 6], [4, 8, 8], [4, 9, 8], [5, 10, 6],
    ];
    for (const [x, y, w] of rows) c.rect(x, y, w, 1, tint);
    c.rect(5, 7, 6, 1, shade(tint, 35)); // top highlight
    c.rect(5, 10, 6, 1, shade(tint, -45)); // bottom shadow
    c.px(6, 8, shade(tint, 55)); c.px(7, 8, shade(tint, 55));
  },
  gem(c, tint) {
    const shape = [
      [7, 3], [8, 3],
      [6, 4], [7, 4], [8, 4], [9, 4],
      [5, 5], [6, 5], [7, 5], [8, 5], [9, 5], [10, 5],
      [5, 6], [6, 6], [7, 6], [8, 6], [9, 6], [10, 6],
      [6, 7], [7, 7], [8, 7], [9, 7],
      [6, 8], [7, 8], [8, 8], [9, 8],
      [7, 9], [8, 9],
      [7, 10], [8, 10],
    ];
    for (const [x, y] of shape) c.px(x, y, tint);
    c.px(6, 5, shade(tint, 60)); c.px(7, 4, shade(tint, 60));
    c.px(9, 6, shade(tint, -50)); c.px(8, 8, shade(tint, -40));
  },
  flint(c) {
    const dark = '#3b3b3b';
    const shape = [
      [7, 4], [8, 4],
      [5, 5], [6, 5], [7, 5], [8, 5], [9, 5],
      [4, 6], [5, 6], [6, 6], [7, 6], [8, 6], [9, 6], [10, 6],
      [4, 7], [5, 7], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7], [11, 7],
      [5, 8], [6, 8], [7, 8], [8, 8], [9, 8], [10, 8], [11, 8],
      [6, 9], [7, 9], [8, 9], [9, 9], [10, 9],
      [7, 10], [8, 10],
    ];
    for (const [x, y] of shape) c.px(x, y, dark);
    c.px(6, 6, '#5a5a5a'); c.px(7, 7, '#525252');
    c.px(10, 8, '#1c1c1c'); c.px(8, 9, '#1c1c1c');
  },
  flintsteel(c) {
    // dark flint lower-left
    DRAW.flint(c);
    // steel striker (grey curve) upper-right
    const steel = '#8a8a8a';
    diag(c.px, 9, 3, 12, 6, shade(steel, -30), 1);
    diag(c.px, 9, 3, 12, 6, steel, 1);
    c.px(12, 7, steel); c.px(11, 8, steel);
    c.px(10, 3, shade(steel, 40));
    // spark
    c.px(9, 7, '#ffd24a'); c.px(10, 6, '#fff0a0');
  },
  sword(c, tint) {
    const blade = tint;
    const handle = '#6e4f27';
    // blade from lower-mid up to top-right
    diag(c.px, 7, 8, 12, 3, shade(blade, -40), 2);
    diag(c.px, 7, 8, 12, 3, blade, 1);
    diag(c.px, 8, 8, 12, 4, shade(blade, 45), 1); // edge highlight
    c.px(12, 2, shade(blade, 60)); // tip glint
    // crossguard
    c.px(5, 9, '#caa14a'); c.px(6, 9, '#caa14a');
    c.px(7, 10, '#caa14a'); c.px(8, 8, '#caa14a');
    // handle
    diag(c.px, 3, 12, 6, 9, shade(handle, -20), 2);
    diag(c.px, 3, 12, 6, 9, handle, 1);
    c.px(3, 13, '#caa14a'); // pommel
  },
  helmet(c, tint) {
    c.rect(5, 3, 6, 1, shade(tint, 25));
    c.rect(4, 4, 8, 1, tint);
    c.rect(4, 5, 8, 1, tint);
    c.rect(4, 6, 8, 1, tint);
    c.rect(4, 7, 8, 1, tint);
    c.rect(4, 8, 2, 2, tint);
    c.rect(10, 8, 2, 2, tint);
    // face gap
    c.rect(6, 8, 4, 2, shade(tint, -70));
    c.rect(4, 4, 1, 4, shade(tint, 40)); // left highlight
    c.rect(11, 5, 1, 4, shade(tint, -40)); // right shadow
  },
  chest(c, tint) {
    c.rect(4, 4, 2, 1, tint); c.rect(10, 4, 2, 1, tint); // shoulders
    c.rect(4, 5, 8, 1, tint);
    c.rect(6, 4, 4, 1, shade(tint, -60)); // neck gap
    for (let y = 6; y <= 11; y++) c.rect(5, y, 6, 1, tint);
    c.rect(5, 5, 1, 6, shade(tint, 40)); // left highlight
    c.rect(10, 6, 1, 6, shade(tint, -40)); // right shadow
    c.rect(8, 6, 1, 5, shade(tint, -25)); // center seam
  },
  legs(c, tint) {
    c.rect(5, 4, 6, 2, tint); // waist
    for (let y = 6; y <= 12; y++) { c.rect(5, y, 2, 1, tint); c.rect(9, y, 2, 1, tint); }
    c.rect(5, 4, 1, 8, shade(tint, 35));
    c.rect(10, 5, 1, 7, shade(tint, -40));
  },
  boots(c, tint) {
    for (let y = 8; y <= 10; y++) { c.rect(4, y, 3, 1, tint); c.rect(9, y, 3, 1, tint); }
    c.rect(3, 11, 4, 2, tint); c.rect(9, 11, 4, 2, tint); // toes
    c.rect(3, 11, 1, 2, shade(tint, 35));
    c.rect(12, 11, 1, 2, shade(tint, -40));
  },
};

export function itemIcon(id) {
  if (iconCache[id]) return iconCache[id];
  const def = ITEMS[id];
  const c = makeCanvas();
  if (def && DRAW[def.icon]) DRAW[def.icon](c, def.tint || '#cccccc');
  const url = c.cv.toDataURL();
  iconCache[id] = url;
  return url;
}

// Convenience: which armor slot (if any) an item belongs to.
export function armorSlotOf(id) {
  const d = ITEMS[id];
  return d && d.slot ? d.slot : null;
}
