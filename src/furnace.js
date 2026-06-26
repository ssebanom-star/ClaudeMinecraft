// Furnace smelting: per-furnace state with input / fuel / output slots that
// progress over time while fuel burns. Slots are length-1 arrays so they can
// reuse the same click-to-move slot UI as the inventory.
import { ID } from './blocks.js';
import { ITEM } from './items.js';

export const COOK_TIME = 4; // seconds to smelt one item

// input id -> { id, count } produced
const SMELT = {
  [ID.IronOre]: { id: ITEM.IronIngot, count: 1 },
  [ID.GoldOre]: { id: ITEM.GoldIngot, count: 1 },
  [ID.Sand]: { id: ID.Glass, count: 1 },
  [ID.Cobblestone]: { id: ID.Stone, count: 1 },
};

// fuel id -> number of items it can smelt
const FUEL = {
  [ITEM.Coal]: 8,
  [ID.CoalBlock]: 80,
  [ID.OakPlanks]: 1,
  [ID.BirchPlanks]: 1,
  [ID.SprucePlanks]: 1,
  [ID.OakLog]: 1,
  [ID.BirchLog]: 1,
  [ID.SpruceLog]: 1,
  [ITEM.Stick]: 0.5,
};

export function smeltResult(id) {
  return SMELT[id] || null;
}
export function fuelValue(id) {
  return FUEL[id] || 0;
}

export class FurnaceState {
  constructor() {
    this.input = [null];
    this.fuel = [null];
    this.output = [null];
    this.burn = 0;     // seconds of fuel remaining
    this.burnMax = 1;  // duration of the current fuel unit (for flame meter)
    this.cook = 0;     // seconds progressed on the current item
    this.cookingId = null; // input id the current cook progress belongs to
  }

  // Can the current input be smelted into the output right now?
  _canSmelt() {
    const inp = this.input[0];
    if (!inp) return false;
    const res = SMELT[inp.id];
    if (!res) return false;
    const out = this.output[0];
    if (!out) return true;
    return out.id === res.id && out.count + res.count <= 64;
  }

  get lit() {
    return this.burn > 0;
  }

  tick(dt) {
    // reset progress if the input slot's item changed since we started cooking it
    const curId = this.input[0] ? this.input[0].id : null;
    if (curId !== this.cookingId) {
      this.cook = 0;
      this.cookingId = curId;
    }

    const can = this._canSmelt();

    // keep the fire going
    if (this.burn > 0) this.burn = Math.max(0, this.burn - dt);

    // light fresh fuel only when there's something worth smelting
    if (this.burn <= 0 && can) {
      const f = this.fuel[0];
      if (f && FUEL[f.id]) {
        this.burnMax = FUEL[f.id] * COOK_TIME;
        this.burn = this.burnMax;
        f.count--;
        if (f.count <= 0) this.fuel[0] = null;
      }
    }

    if (this.burn > 0 && can) {
      this.cook += dt;
      // a `while` (not `if`) so a large dt (e.g. after a frame hitch) drains
      // all earned progress instead of completing at most one item.
      while (this.cook >= COOK_TIME && this._canSmelt()) {
        this.cook -= COOK_TIME;
        const inp = this.input[0];
        const res = SMELT[inp.id];
        if (this.output[0]) this.output[0].count += res.count;
        else this.output[0] = { id: res.id, count: res.count };
        inp.count--;
        if (inp.count <= 0) { this.input[0] = null; this.cookingId = null; }
      }
    } else {
      // lose progress if we can't currently smelt
      this.cook = Math.max(0, this.cook - dt * 2);
    }
  }
}
