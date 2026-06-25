// Survival state: health, hunger, oxygen, regeneration, fall/drown damage,
// plus a hotbar + backpack inventory, armor slots and a 2x2 crafting grid.
import { blockDef } from './blocks.js';
import { itemDef, isItem, ITEM } from './items.js';

export class Survival {
  constructor() {
    this.maxHealth = 20;
    this.health = 20;
    this.maxHunger = 20;
    this.hunger = 20;
    this.saturation = 5;
    this.maxAir = 10;
    this.air = 10;
    this.dead = false;

    this._regenTimer = 0;
    this._starveTimer = 0;
    this._airTimer = 0;
    this._exhaustion = 0;

    // hotbar of 9 slots; each {id, count} or null
    this.hotbar = new Array(9).fill(null);
    this.selected = 0;
    // backpack storage, separate from the hotbar (2 rows of 9)
    this.inventory = new Array(18).fill(null);
    // 2x2 crafting input grid; output is derived via matchRecipe(), not stored
    this.craftGrid = new Array(4).fill(null);
    // worn armor: [head, chest, legs, feet]; each {id,count:1} or null
    this.armorSlots = new Array(4).fill(null);

    this._fillStarter();
  }

  _fillStarter() {
    // hotbar: a few building blocks plus a sword, flint & steel and TNT
    const hb = [
      { id: 1, count: 64 },   // grass
      { id: 3, count: 64 },   // stone
      { id: 14, count: 16 },  // oak log
      { id: 15, count: 32 },  // oak planks
      { id: 33, count: 16 },  // glass
      { id: 39, count: 8 },   // TNT
      { id: ITEM.IronSword, count: 1 },
      { id: ITEM.FlintAndSteel, count: 1 },
      { id: 47, count: 16 },  // glowstone (light)
    ];
    hb.forEach((s, i) => (this.hotbar[i] = s));
    // backpack: smelting + crafting materials to try everything out
    const inv = [
      { id: 22, count: 16 },  // iron ore (smelt -> ingot)
      { id: 257, count: 8 },  // coal (fuel)
      { id: 5, count: 16 },   // sand (smelt -> glass)
      { id: 4, count: 32 },   // cobblestone
      { id: ITEM.Stick, count: 8 },
      { id: ITEM.Flint, count: 4 },
      { id: ITEM.IronIngot, count: 12 },
      { id: 40, count: 4 },   // pumpkin (food)
    ];
    inv.forEach((s, i) => (this.inventory[i] = s));
  }

  // total armor points from worn pieces (0..~15)
  armorPoints() {
    let pts = 0;
    for (const s of this.armorSlots) {
      if (!s) continue;
      const d = itemDef(s.id);
      if (d && d.armor) pts += d.armor;
    }
    return pts;
  }

  // melee damage of the currently held item (fist = 1)
  attackDamage() {
    const s = this.hotbar[this.selected];
    if (s && isItem(s.id)) {
      const d = itemDef(s.id);
      if (d && d.attack) return d.attack;
    }
    return 1;
  }

  selectedId() {
    const s = this.hotbar[this.selected];
    return s ? s.id : 0;
  }

  // returns true if a block could be consumed for placing
  consumeSelected() {
    const s = this.hotbar[this.selected];
    if (!s || s.count <= 0) return false;
    s.count--;
    if (s.count <= 0) this.hotbar[this.selected] = null;
    return true;
  }

  _storageArrays() {
    return [this.hotbar, this.inventory];
  }

  canFit(id, count) {
    let remaining = count;
    for (const arr of this._storageArrays()) {
      for (const s of arr) {
        if (s && s.id === id) remaining -= Math.max(0, 64 - s.count);
        if (remaining <= 0) return true;
      }
    }
    for (const arr of this._storageArrays()) {
      for (const s of arr) {
        if (!s) remaining -= 64;
        if (remaining <= 0) return true;
      }
    }
    return remaining <= 0;
  }

  // Adds `count` of block `id` into the hotbar/inventory, stacking into
  // existing slots first, then empty slots. Returns false (no change made)
  // if there isn't room for all of it.
  addItem(id, count = 1) {
    if (!this.canFit(id, count)) return false;
    let remaining = count;
    for (const arr of this._storageArrays()) {
      for (const s of arr) {
        if (remaining <= 0) break;
        if (s && s.id === id && s.count < 64) {
          const take = Math.min(64 - s.count, remaining);
          s.count += take;
          remaining -= take;
        }
      }
    }
    for (const arr of this._storageArrays()) {
      for (let i = 0; i < arr.length; i++) {
        if (remaining <= 0) break;
        if (!arr[i]) {
          const take = Math.min(64, remaining);
          arr[i] = { id, count: take };
          remaining -= take;
        }
      }
    }
    return remaining <= 0;
  }

  damage(amount) {
    if (this.dead) return;
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) this.dead = true;
  }

  // Combat / explosion damage, reduced by worn armor (min 1 if any got through).
  hurt(amount) {
    if (this.dead || amount <= 0) return;
    const reduced = amount * (1 - Math.min(20, this.armorPoints()) / 25);
    this.damage(Math.max(1, Math.round(reduced)));
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  eatSelected() {
    const s = this.hotbar[this.selected];
    if (!s) return false;
    const def = blockDef(s.id);
    if (def && def.edible > 0) {
      this.hunger = Math.min(this.maxHunger, this.hunger + def.edible * 2);
      this.saturation = Math.min(this.hunger, this.saturation + def.edible);
      return true;
    }
    return false;
  }

  addExhaustion(v) {
    this._exhaustion += v;
  }

  respawn() {
    this.health = this.maxHealth;
    this.hunger = this.maxHunger;
    this.saturation = 5;
    this.air = this.maxAir;
    this.dead = false;
  }

  tick(dt, ctx) {
    if (this.dead) return;
    const { inWater, headInWater, landedSpeed, moving, sprinting } = ctx;

    // fall damage
    if (landedSpeed > 12) {
      const dmg = Math.floor((landedSpeed - 12) * 0.7);
      if (dmg > 0) this.damage(dmg);
    }

    // oxygen / drowning
    if (headInWater) {
      this._airTimer += dt;
      if (this._airTimer >= 1) {
        this._airTimer = 0;
        this.air = Math.max(0, this.air - 1);
        if (this.air === 0) this.damage(2);
      }
    } else {
      this.air = this.maxAir;
      this._airTimer = 0;
    }

    // exhaustion from movement
    if (moving) this._exhaustion += (sprinting ? 0.06 : 0.02) * dt * 10;

    // hunger drain via exhaustion
    if (this._exhaustion >= 4) {
      this._exhaustion -= 4;
      if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
      else this.hunger = Math.max(0, this.hunger - 1);
    }

    // regen / starve
    if (this.hunger >= 18 && this.health < this.maxHealth) {
      this._regenTimer += dt;
      if (this._regenTimer >= 3) {
        this._regenTimer = 0;
        this.heal(1);
        this._exhaustion += 1;
      }
    } else {
      this._regenTimer = 0;
    }

    if (this.hunger <= 0) {
      this._starveTimer += dt;
      if (this._starveTimer >= 4) {
        this._starveTimer = 0;
        if (this.health > 1) this.damage(1);
      }
    }
  }
}
