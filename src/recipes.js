// Basic shapeless 2x2 crafting recipes. Each recipe's inputs must exactly
// match the contents of the 4 craft-grid slots, summed by block id.
import { ID } from './blocks.js';

export const RECIPES = [
  { inputs: { [ID.OakLog]: 1 }, output: { id: ID.OakPlanks, count: 4 } },
  { inputs: { [ID.BirchLog]: 1 }, output: { id: ID.BirchPlanks, count: 4 } },
  { inputs: { [ID.SpruceLog]: 1 }, output: { id: ID.SprucePlanks, count: 4 } },
  { inputs: { [ID.OakPlanks]: 4 }, output: { id: ID.CraftingTable, count: 1 } },
  { inputs: { [ID.BirchPlanks]: 4 }, output: { id: ID.CraftingTable, count: 1 } },
  { inputs: { [ID.SprucePlanks]: 4 }, output: { id: ID.CraftingTable, count: 1 } },
  { inputs: { [ID.Stone]: 4 }, output: { id: ID.StoneBricks, count: 4 } },
  { inputs: { [ID.Sand]: 4 }, output: { id: ID.Sandstone, count: 1 } },
  { inputs: { [ID.Cobblestone]: 4 }, output: { id: ID.Furnace, count: 1 } },
];

// grid: array of 4 slots, each {id,count} or null. Returns the matching
// recipe, or null. Matching is exact: the grid's id->count totals must
// equal a recipe's inputs precisely (no extra items, no missing items).
export function matchRecipe(grid) {
  const have = {};
  for (const s of grid) {
    if (!s) continue;
    have[s.id] = (have[s.id] || 0) + s.count;
  }
  const haveIds = Object.keys(have);
  if (haveIds.length === 0) return null;
  for (const r of RECIPES) {
    const reqIds = Object.keys(r.inputs);
    if (reqIds.length !== haveIds.length) continue;
    if (reqIds.every((id) => have[id] === r.inputs[id])) return r;
  }
  return null;
}
