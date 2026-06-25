// Shapeless 2x2 crafting recipes. Each recipe's inputs must exactly match the
// summed contents of the 4 craft-grid slots (by id). Outputs may be blocks or
// items. Because matching is by total count (not shape), recipes that would
// need a 3x3 grid in real Minecraft (armor, etc.) are expressed as exact
// ingredient counts that fit in the 2x2 grid's stacks.
import { ID } from './blocks.js';
import { ITEM } from './items.js';

export const RECIPES = [
  // wood
  { inputs: { [ID.OakLog]: 1 }, output: { id: ID.OakPlanks, count: 4 } },
  { inputs: { [ID.BirchLog]: 1 }, output: { id: ID.BirchPlanks, count: 4 } },
  { inputs: { [ID.SpruceLog]: 1 }, output: { id: ID.SprucePlanks, count: 4 } },
  { inputs: { [ID.OakPlanks]: 2 }, output: { id: ITEM.Stick, count: 4 } },
  { inputs: { [ID.BirchPlanks]: 2 }, output: { id: ITEM.Stick, count: 4 } },
  { inputs: { [ID.SprucePlanks]: 2 }, output: { id: ITEM.Stick, count: 4 } },
  { inputs: { [ID.OakPlanks]: 4 }, output: { id: ID.CraftingTable, count: 1 } },
  { inputs: { [ID.BirchPlanks]: 4 }, output: { id: ID.CraftingTable, count: 1 } },
  { inputs: { [ID.SprucePlanks]: 4 }, output: { id: ID.CraftingTable, count: 1 } },

  // stone / misc blocks
  { inputs: { [ID.Stone]: 4 }, output: { id: ID.StoneBricks, count: 4 } },
  { inputs: { [ID.Sand]: 4 }, output: { id: ID.Sandstone, count: 1 } },
  { inputs: { [ID.Cobblestone]: 4 }, output: { id: ID.Furnace, count: 1 } },

  // swords (material + stick)
  { inputs: { [ID.OakPlanks]: 2, [ITEM.Stick]: 1 }, output: { id: ITEM.WoodSword, count: 1 } },
  { inputs: { [ID.BirchPlanks]: 2, [ITEM.Stick]: 1 }, output: { id: ITEM.WoodSword, count: 1 } },
  { inputs: { [ID.SprucePlanks]: 2, [ITEM.Stick]: 1 }, output: { id: ITEM.WoodSword, count: 1 } },
  { inputs: { [ID.Cobblestone]: 2, [ITEM.Stick]: 1 }, output: { id: ITEM.StoneSword, count: 1 } },
  { inputs: { [ITEM.IronIngot]: 2, [ITEM.Stick]: 1 }, output: { id: ITEM.IronSword, count: 1 } },

  // flint & steel
  { inputs: { [ITEM.IronIngot]: 1, [ITEM.Flint]: 1 }, output: { id: ITEM.FlintAndSteel, count: 1 } },

  // iron armor (exact ingot counts)
  { inputs: { [ITEM.IronIngot]: 5 }, output: { id: ITEM.IronHelmet, count: 1 } },
  { inputs: { [ITEM.IronIngot]: 8 }, output: { id: ITEM.IronChestplate, count: 1 } },
  { inputs: { [ITEM.IronIngot]: 7 }, output: { id: ITEM.IronLeggings, count: 1 } },
  { inputs: { [ITEM.IronIngot]: 4 }, output: { id: ITEM.IronBoots, count: 1 } },
];

// grid: array of 4 slots, each {id,count} or null. Returns the matching recipe
// or null. Matching is exact: the grid's id->count totals must equal a recipe's
// inputs precisely (no extra items, no missing items).
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
