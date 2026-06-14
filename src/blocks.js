// 50 block types. Each block defines colors per face (top/side/bottom),
// a procedural texture "style", and survival properties.
//
// pattern styles control how the 16x16 tile is generated in textures.js:
//   noise   - speckled random shading (stone, dirt, ores)
//   grass   - grassy top fringe
//   plank   - horizontal wood planks
//   log     - vertical bark / ring top
//   leaves  - clustered transparent foliage
//   solid   - flat single color
//   pane    - glass-like with border
//   liquid  - animated-ish water/lava
//   gradient- vertical gradient
//   cross   - crossed sapling/flower (rendered flat)

// Block id 0 is always AIR.
export const AIR = 0;

// Helper to keep definitions compact.
function b(name, opts = {}) {
  return {
    name,
    top: opts.top ?? opts.color ?? '#ffffff',
    side: opts.side ?? opts.color ?? '#ffffff',
    bottom: opts.bottom ?? opts.side ?? opts.color ?? '#ffffff',
    style: opts.style ?? 'noise',
    transparent: opts.transparent ?? false,
    liquid: opts.liquid ?? false,
    solid: opts.solid ?? true,        // has collision
    hardness: opts.hardness ?? 1.5,   // seconds to break by hand-ish
    tool: opts.tool ?? null,          // 'pickaxe' | 'axe' | 'shovel'
    light: opts.light ?? 0,           // light emission 0-15
    drop: opts.drop ?? null,          // id dropped, default = self
    flammable: opts.flammable ?? false,
    edible: opts.edible ?? 0,         // hunger restored if eaten
  };
}

// The order here defines block IDs (index + 1).
export const BLOCKS = [
  b('Grass Block',   { top: '#5fbb46', side: '#7d6b3f', bottom: '#7a5a3a', style: 'grass', tool: 'shovel', hardness: 0.9 }),
  b('Dirt',          { color: '#7a5a3a', style: 'noise', tool: 'shovel', hardness: 0.8 }),
  b('Stone',         { color: '#8c8c8c', style: 'noise', tool: 'pickaxe', hardness: 2.5 }),
  b('Cobblestone',   { color: '#7f7f7f', style: 'noise', tool: 'pickaxe', hardness: 2.8 }),
  b('Sand',          { color: '#e6d8a0', style: 'noise', tool: 'shovel', hardness: 0.7 }),
  b('Sandstone',     { top: '#e7d9a3', side: '#ddca8e', bottom: '#cdb877', style: 'noise', tool: 'pickaxe', hardness: 2.0 }),
  b('Gravel',        { color: '#857f7a', style: 'noise', tool: 'shovel', hardness: 0.9 }),
  b('Clay',          { color: '#9aa1ad', style: 'noise', tool: 'shovel', hardness: 0.9 }),
  b('Snow Block',    { color: '#f2f7fb', style: 'noise', tool: 'shovel', hardness: 0.6 }),
  b('Ice',           { color: '#9bc8f0', style: 'pane', transparent: true, tool: 'pickaxe', hardness: 0.6 }),

  b('Bedrock',       { color: '#3a3a3a', style: 'noise', hardness: Infinity }),
  b('Water',         { color: '#3a6fe0', style: 'liquid', transparent: true, liquid: true, solid: false, hardness: Infinity }),
  b('Lava',          { color: '#e0641a', style: 'liquid', transparent: true, liquid: true, solid: false, light: 15, hardness: Infinity }),
  b('Oak Log',       { top: '#9c7b46', side: '#6e5430', bottom: '#9c7b46', style: 'log', tool: 'axe', hardness: 2.0, flammable: true }),
  b('Oak Planks',    { color: '#b08a4f', style: 'plank', tool: 'axe', hardness: 1.8, flammable: true }),
  b('Oak Leaves',    { color: '#3f9b32', style: 'leaves', transparent: true, hardness: 0.3, flammable: true }),
  b('Birch Log',     { top: '#dcd6c2', side: '#e8e6dc', bottom: '#dcd6c2', style: 'log', tool: 'axe', hardness: 2.0, flammable: true }),
  b('Birch Planks',  { color: '#d6c79a', style: 'plank', tool: 'axe', hardness: 1.8, flammable: true }),
  b('Spruce Log',    { top: '#5b4327', side: '#43331f', bottom: '#5b4327', style: 'log', tool: 'axe', hardness: 2.0, flammable: true }),
  b('Spruce Planks', { color: '#7a5a34', style: 'plank', tool: 'axe', hardness: 1.8, flammable: true }),

  b('Coal Ore',      { color: '#8c8c8c', side: '#8c8c8c', style: 'ore', top: '#2b2b2b', tool: 'pickaxe', hardness: 3.0 }),
  b('Iron Ore',      { color: '#8c8c8c', top: '#d8a679', style: 'ore', tool: 'pickaxe', hardness: 3.0 }),
  b('Gold Ore',      { color: '#8c8c8c', top: '#f2d34b', style: 'ore', tool: 'pickaxe', hardness: 3.0 }),
  b('Diamond Ore',   { color: '#8c8c8c', top: '#4be0d6', style: 'ore', tool: 'pickaxe', hardness: 3.5 }),
  b('Emerald Ore',   { color: '#8c8c8c', top: '#3fd96b', style: 'ore', tool: 'pickaxe', hardness: 3.5 }),
  b('Redstone Ore',  { color: '#8c8c8c', top: '#e03a2a', style: 'ore', tool: 'pickaxe', hardness: 3.0, light: 7 }),
  b('Lapis Ore',     { color: '#8c8c8c', top: '#2350c8', style: 'ore', tool: 'pickaxe', hardness: 3.0 }),
  b('Coal Block',    { color: '#1f1f1f', style: 'noise', tool: 'pickaxe', hardness: 3.0 }),
  b('Iron Block',    { color: '#e3e3e3', style: 'noise', tool: 'pickaxe', hardness: 3.5 }),
  b('Gold Block',    { color: '#f2d34b', style: 'noise', tool: 'pickaxe', hardness: 3.5 }),

  b('Diamond Block', { color: '#5cf0e6', style: 'noise', tool: 'pickaxe', hardness: 4.0 }),
  b('Emerald Block', { color: '#3fd96b', style: 'noise', tool: 'pickaxe', hardness: 4.0 }),
  b('Glass',         { color: '#bfe6f2', style: 'pane', transparent: true, hardness: 0.4 }),
  b('Bricks',        { color: '#9e4b3a', style: 'brick', tool: 'pickaxe', hardness: 2.5 }),
  b('Stone Bricks',  { color: '#888888', style: 'brick', tool: 'pickaxe', hardness: 2.5 }),
  b('Bookshelf',     { top: '#b08a4f', side: '#caa45e', bottom: '#b08a4f', style: 'plank', tool: 'axe', hardness: 1.8, flammable: true }),
  b('Crafting Table',{ top: '#a87b3f', side: '#7a5a34', bottom: '#b08a4f', style: 'plank', tool: 'axe', hardness: 1.8, flammable: true }),
  b('Furnace',       { top: '#6e6e6e', side: '#6e6e6e', bottom: '#6e6e6e', style: 'noise', tool: 'pickaxe', hardness: 3.0 }),
  b('TNT',           { top: '#c4392b', side: '#c4392b', bottom: '#3a3a3a', style: 'noise', hardness: 0.2, flammable: true }),
  b('Pumpkin',       { top: '#d97b1f', side: '#e0892a', bottom: '#c46c18', style: 'noise', tool: 'axe', hardness: 1.0, edible: 2 }),

  b('Melon',         { color: '#5a8a2a', style: 'noise', tool: 'axe', hardness: 1.0, edible: 3 }),
  b('Cactus',        { top: '#3f7a2a', side: '#356b24', bottom: '#3f7a2a', style: 'noise', transparent: true, hardness: 0.5 }),
  b('Mushroom Block',{ color: '#d6d0c0', style: 'noise', tool: 'axe', hardness: 0.5, edible: 1 }),
  b('Mossy Cobble',  { color: '#6f7a5a', style: 'noise', tool: 'pickaxe', hardness: 2.8 }),
  b('Obsidian',      { color: '#1a1426', style: 'noise', tool: 'pickaxe', hardness: 9.0 }),
  b('Netherrack',    { color: '#7a3030', style: 'noise', tool: 'pickaxe', hardness: 1.0, light: 2 }),
  b('Glowstone',     { color: '#e8c45a', style: 'noise', light: 15, hardness: 0.6 }),
  b('Wool White',    { color: '#ececec', style: 'wool', hardness: 0.8, flammable: true }),
  b('Wool Red',      { color: '#b03a2e', style: 'wool', hardness: 0.8, flammable: true }),
  b('Wool Blue',     { color: '#2a52b0', style: 'wool', hardness: 0.8, flammable: true }),
];

// id -> definition (id 0 = air -> null)
export function blockDef(id) {
  if (id === AIR) return null;
  return BLOCKS[id - 1] || null;
}

export const BLOCK_COUNT = BLOCKS.length;

export function isTransparent(id) {
  if (id === AIR) return true;
  const d = BLOCKS[id - 1];
  return d ? d.transparent : false;
}

export function isSolid(id) {
  if (id === AIR) return false;
  const d = BLOCKS[id - 1];
  return d ? d.solid : true;
}

export function isLiquid(id) {
  if (id === AIR) return false;
  const d = BLOCKS[id - 1];
  return d ? d.liquid : false;
}

// Named ids used by world generation.
export const ID = {};
BLOCKS.forEach((def, i) => {
  ID[def.name.replace(/[^a-zA-Z]/g, '')] = i + 1;
});
