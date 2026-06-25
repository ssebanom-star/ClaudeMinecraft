// Game bootstrap: scene, render loop, mining/placing/combat, survival HUD,
// day/night cycle, inventory + crafting + armor, furnace smelting, zombies,
// and flint & steel / TNT explosions.
import * as THREE from 'three';
import { buildAtlas } from './textures.js';
import { World, CHUNK } from './world.js';
import { Player } from './player.js';
import { Survival } from './survival.js';
import { blockDef, isLiquid, ID } from './blocks.js';
import { matchRecipe } from './recipes.js';
import { isItem, itemDef, itemIcon, armorSlotOf, ITEM } from './items.js';
import { MobManager } from './mobs.js';
import { FurnaceState, COOK_TIME } from './furnace.js';

// Detect touch / mobile devices to enable on-screen controls and lighter settings.
const IS_TOUCH =
  (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) ||
  'ontouchstart' in window ||
  navigator.maxTouchPoints > 0;

const RENDER_RADIUS = IS_TOUCH ? 3 : 5;

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_TOUCH ? 1.0 : 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const DAY_SKY = new THREE.Color(0x87ceeb);
const NIGHT_SKY = new THREE.Color(0x0a0e1f);
scene.background = DAY_SKY.clone();
scene.fog = new THREE.Fog(DAY_SKY.clone(), CHUNK * (RENDER_RADIUS - 1), CHUNK * (RENDER_RADIUS + 1));

const atlas = buildAtlas();
const world = new World(scene, atlas);
const survival = new Survival();

// initial chunks around spawn
world.update(0, 0, RENDER_RADIUS, 999);
const spawnY = world.surfaceY(0, 0);

const player = new Player(camera, world, canvas);
player.pos.set(0.5, spawnY + 1, 0.5);
player.touchMode = IS_TOUCH;

const mobs = new MobManager(scene, world);

// ---- block highlight ----
const highlightGeo = new THREE.BoxGeometry(1.002, 1.002, 1.002);
const highlightEdges = new THREE.LineSegments(
  new THREE.EdgesGeometry(highlightGeo),
  new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4 })
);
highlightEdges.visible = false;
scene.add(highlightEdges);

// ---- HUD / overlay elements ----
const healthBar = document.getElementById('health');
const hungerBar = document.getElementById('hunger');
const airBar = document.getElementById('air');
const armorBar = document.getElementById('armor');
const hotbarEl = document.getElementById('hotbar');
const breakBar = document.getElementById('breakbar');
const breakFill = document.getElementById('breakfill');
const inventoryEl = document.getElementById('inventory');
const invGrid = document.getElementById('invgrid');
const invHotbarEl = document.getElementById('invhotbar');
const armorSlotsEl = document.getElementById('armorslots');
const craftGridEl = document.getElementById('craftgrid');
const craftOutEl = document.getElementById('craftout');
const invCloseBtn = document.getElementById('invclose');
const furnaceEl = document.getElementById('furnace');
const furnInputEl = document.getElementById('furn-input');
const furnFuelEl = document.getElementById('furn-fuel');
const furnOutputEl = document.getElementById('furn-output');
const furnInvGrid = document.getElementById('furn-invgrid');
const furnHotbarEl = document.getElementById('furn-hotbar');
const furnFlameEl = document.getElementById('furnflame');
const furnBarFill = document.getElementById('furnbarfill');
const furnCloseBtn = document.getElementById('furnaceclose');
const deathEl = document.getElementById('death');
const respawnBtn = document.getElementById('respawn');
const clockEl = document.getElementById('clock');
const toastEl = document.getElementById('toast');

const ARMOR_SLOTS = ['head', 'chest', 'legs', 'feet'];

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.remove('show'), 1400);
}

// ---- icon / name helpers (blocks or items) ----
const blockIconCache = {};
function iconURL(id) {
  if (isItem(id)) return itemIcon(id);
  if (!blockIconCache[id]) blockIconCache[id] = atlas.iconFor(id);
  return blockIconCache[id];
}
function nameOf(id) {
  if (isItem(id)) return itemDef(id)?.name ?? '';
  return blockDef(id)?.name ?? '';
}

// ---- hotbar render ----
function renderHotbar() {
  hotbarEl.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    const slot = document.createElement('div');
    slot.className = 'slot' + (i === survival.selected ? ' sel' : '');
    const s = survival.hotbar[i];
    if (s) {
      const img = document.createElement('img');
      img.src = iconURL(s.id);
      slot.appendChild(img);
      if (s.count > 1) {
        const cnt = document.createElement('span');
        cnt.className = 'cnt';
        cnt.textContent = s.count;
        slot.appendChild(cnt);
      }
    }
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = i + 1;
    slot.appendChild(num);
    slot.addEventListener('click', () => { survival.selected = i; renderHotbar(); });
    hotbarEl.appendChild(slot);
  }
}

// ---- shared slot interaction (click to pick up, click to move/swap/merge) ----
// pickedSlot stores the source array, index and the source slot's accept rule
// (so swaps respect restricted slots like armor / furnace output).
let pickedSlot = null;

function onSlotClick(arr, idx, opts = {}) {
  const cur = arr[idx];
  if (!pickedSlot) {
    if (cur) pickedSlot = { arr, idx, accept: opts.accept };
  } else if (pickedSlot.arr === arr && pickedSlot.idx === idx) {
    pickedSlot = null;
  } else {
    const src = pickedSlot.arr[pickedSlot.idx];
    const dst = arr[idx];
    const destOK = !opts.accept || (src && opts.accept(src));
    if (destOK && src) {
      if (!dst) {
        arr[idx] = src;
        pickedSlot.arr[pickedSlot.idx] = null;
        pickedSlot = null;
      } else if (dst.id === src.id) {
        const move = Math.min(64 - dst.count, src.count);
        dst.count += move;
        src.count -= move;
        if (src.count <= 0) pickedSlot.arr[pickedSlot.idx] = null;
        pickedSlot = null;
      } else {
        const srcOK = !pickedSlot.accept || pickedSlot.accept(dst);
        if (srcOK) {
          pickedSlot.arr[pickedSlot.idx] = dst;
          arr[idx] = src;
          pickedSlot = null;
        }
      }
    }
  }
  refreshScreens();
}

function makeSlotEl(arr, idx, opts = {}) {
  const el = document.createElement('div');
  el.className = 'islot';
  const item = arr[idx];
  if (item) {
    const img = document.createElement('img');
    img.src = iconURL(item.id);
    img.title = nameOf(item.id);
    el.appendChild(img);
    if (item.count > 1) {
      const cnt = document.createElement('span');
      cnt.className = 'cnt';
      cnt.textContent = item.count;
      el.appendChild(cnt);
    }
  } else {
    el.classList.add('empty');
  }
  if (pickedSlot && pickedSlot.arr === arr && pickedSlot.idx === idx) el.classList.add('sel');
  el.addEventListener('click', () => onSlotClick(arr, idx, opts));
  return el;
}

function fillGrid(container, arr, opts) {
  container.innerHTML = '';
  arr.forEach((_, i) => container.appendChild(makeSlotEl(arr, i, opts)));
}

// ---- crafting ----
function doCraft(match) {
  if (!survival.addItem(match.output.id, match.output.count)) {
    toast('인벤토리가 가득 찼습니다');
    return;
  }
  for (const idStr of Object.keys(match.inputs)) {
    const id = Number(idStr);
    let need = match.inputs[idStr];
    for (let i = 0; i < 4 && need > 0; i++) {
      const s = survival.craftGrid[i];
      if (s && s.id === id) {
        const take = Math.min(need, s.count);
        s.count -= take;
        need -= take;
        if (s.count <= 0) survival.craftGrid[i] = null;
      }
    }
  }
  pickedSlot = null;
  toast(nameOf(match.output.id) + ' 제작!');
  refreshScreens();
}

function renderInventoryScreen() {
  fillGrid(craftGridEl, survival.craftGrid);

  const match = matchRecipe(survival.craftGrid);
  craftOutEl.innerHTML = '';
  craftOutEl.classList.toggle('empty', !match);
  craftOutEl.onclick = null;
  if (match) {
    const img = document.createElement('img');
    img.src = iconURL(match.output.id);
    craftOutEl.appendChild(img);
    if (match.output.count > 1) {
      const cnt = document.createElement('span');
      cnt.className = 'cnt';
      cnt.textContent = match.output.count;
      craftOutEl.appendChild(cnt);
    }
    craftOutEl.onclick = () => doCraft(match);
  }

  armorSlotsEl.innerHTML = '';
  survival.armorSlots.forEach((_, i) =>
    armorSlotsEl.appendChild(
      makeSlotEl(survival.armorSlots, i, { accept: (it) => armorSlotOf(it.id) === ARMOR_SLOTS[i] })
    )
  );

  fillGrid(invGrid, survival.inventory);
  fillGrid(invHotbarEl, survival.hotbar);
}

// ---- furnace ----
const furnaceStates = new Map(); // "x,y,z" -> FurnaceState
let currentFurnace = null;
let lastFurnSig = '';

function fkey(x, y, z) { return x + ',' + y + ',' + z; }

function renderFurnaceScreen() {
  if (!currentFurnace) return;
  const f = currentFurnace;
  // re-query by id: the previous slot nodes get replaced each render
  document.getElementById('furn-input').replaceWith(makeFurnSlot(f.input, 0, 'furn-input'));
  document.getElementById('furn-fuel').replaceWith(makeFurnSlot(f.fuel, 0, 'furn-fuel'));
  document.getElementById('furn-output').replaceWith(makeFurnSlot(f.output, 0, 'furn-output', { accept: () => false }));
  fillGrid(furnInvGrid, survival.inventory);
  fillGrid(furnHotbarEl, survival.hotbar);
  updateFurnaceMeters();
}

// furnace slots are referenced by id so they can be re-created in place
function makeFurnSlot(arr, idx, id, opts) {
  const el = makeSlotEl(arr, idx, opts);
  el.id = id;
  return el;
}

function updateFurnaceMeters() {
  if (!currentFurnace) return;
  furnFlameEl.classList.toggle('on', currentFurnace.lit);
  furnBarFill.style.width = Math.min(100, (currentFurnace.cook / COOK_TIME) * 100) + '%';
}

function furnSig(f) {
  const c = (s) => (s ? s.id + 'x' + s.count : '-');
  return c(f.input[0]) + '|' + c(f.fuel[0]) + '|' + c(f.output[0]);
}

// ---- screens refresh ----
function refreshScreens() {
  renderHotbar();
  if (inventoryOpen) renderInventoryScreen();
  if (furnaceOpen) { renderFurnaceScreen(); lastFurnSig = currentFurnace ? furnSig(currentFurnace) : ''; }
}

// ---- menus ----
let inventoryOpen = false;
let furnaceOpen = false;
function menuOpen() { return inventoryOpen || furnaceOpen; }

function toggleInventory(force) {
  const next = force !== undefined ? force : !inventoryOpen;
  if (next) {
    closeFurnace();
    inventoryOpen = true;
    inventoryEl.style.display = 'flex';
    mining = false; placing = false;
    if (document.pointerLockElement) document.exitPointerLock();
    renderInventoryScreen();
  } else {
    inventoryOpen = false;
    inventoryEl.style.display = 'none';
    pickedSlot = null;
  }
}

function openFurnaceAt(x, y, z) {
  const k = fkey(x, y, z);
  let st = furnaceStates.get(k);
  if (!st) { st = new FurnaceState(); furnaceStates.set(k, st); }
  inventoryOpen = false;
  inventoryEl.style.display = 'none';
  furnaceOpen = true;
  currentFurnace = st;
  furnaceEl.style.display = 'flex';
  mining = false; placing = false;
  if (document.pointerLockElement) document.exitPointerLock();
  renderFurnaceScreen();
  lastFurnSig = furnSig(st);
}

function closeFurnace() {
  if (!furnaceOpen) return;
  furnaceOpen = false;
  furnaceEl.style.display = 'none';
  currentFurnace = null;
  pickedSlot = null;
}

function closeAllMenus() {
  toggleInventory(false);
  closeFurnace();
}

invCloseBtn.addEventListener('click', () => toggleInventory(false));
furnCloseBtn.addEventListener('click', () => closeFurnace());

// ---- HUD bars ----
function renderHUD() {
  healthBar.innerHTML = '';
  for (let i = 0; i < survival.maxHealth / 2; i++) {
    const h = document.createElement('div');
    const v = survival.health - i * 2;
    h.className = 'icon heart ' + (v >= 2 ? 'full' : v === 1 ? 'half' : 'empty');
    healthBar.appendChild(h);
  }
  hungerBar.innerHTML = '';
  for (let i = 0; i < survival.maxHunger / 2; i++) {
    const h = document.createElement('div');
    const v = survival.hunger - i * 2;
    h.className = 'icon food ' + (v >= 2 ? 'full' : v === 1 ? 'half' : 'empty');
    hungerBar.appendChild(h);
  }
  // armor (only the filled portion, up to 10 shields)
  armorBar.innerHTML = '';
  const ap = survival.armorPoints();
  for (let i = 0; i < 10; i++) {
    const v = ap - i * 2;
    if (v <= 0) break;
    const a = document.createElement('div');
    a.className = 'icon armor ' + (v >= 2 ? 'full' : 'half');
    armorBar.appendChild(a);
  }
  // air (only when underwater)
  airBar.innerHTML = '';
  if (survival.air < survival.maxAir) {
    for (let i = 0; i < survival.air; i++) {
      const a = document.createElement('div');
      a.className = 'icon bubble';
      airBar.appendChild(a);
    }
  }
}

// ---- keyboard input ----
window.addEventListener('keydown', (e) => {
  if (e.code.startsWith('Digit')) {
    const n = parseInt(e.code.slice(5), 10);
    if (n >= 1 && n <= 9) { survival.selected = n - 1; renderHotbar(); }
  }
  if (e.code === 'KeyE') { if (furnaceOpen) closeFurnace(); else toggleInventory(); }
  if (e.code === 'Escape') closeAllMenus();
  if (e.code === 'KeyR') {
    if (survival.eatSelected()) { toast('냠냠!'); renderHotbar(); renderHUD(); }
  }
});
window.addEventListener('wheel', (e) => {
  if (menuOpen()) return;
  const dir = Math.sign(e.deltaY);
  survival.selected = (survival.selected + dir + 9) % 9;
  renderHotbar();
});

// ---- mining / placing / combat ----
let mining = false;
let placing = false;
let breakProgress = 0;
let breakTarget = null;
let placeCooldown = 0;

canvas.addEventListener('mousedown', (e) => {
  if (!player.locked) return;
  if (e.button === 0) { if (!tryAttack()) mining = true; }
  if (e.button === 2) { if (!interactUse()) placing = true; }
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) { mining = false; breakProgress = 0; breakTarget = null; }
  if (e.button === 2) placing = false;
});
window.addEventListener('contextmenu', (e) => e.preventDefault());

function blockDistance(hit) {
  const dx = hit.x + 0.5 - camera.position.x;
  const dy = hit.y + 0.5 - camera.position.y;
  const dz = hit.z + 0.5 - camera.position.z;
  return Math.hypot(dx, dy, dz);
}

// Attack the nearest zombie in front (if closer than the targeted block).
function tryAttack() {
  const dir = player.lookDir().normalize();
  const hitMob = mobs.attackRay(camera.position, dir, player.reach + 0.5);
  if (!hitMob) return false;
  const block = player.raycast();
  if (block && blockDistance(block) < hitMob.dist) return false;
  mobs.damageMob(hitMob.mob, survival.attackDamage(), player.pos);
  return true;
}

// Right-click interactions: open furnace / crafting table, ignite TNT with
// flint & steel. Returns true if something was handled (so we skip placing).
function interactUse() {
  const hit = player.raycast();
  if (!hit) return false;
  if (hit.id === ID.Furnace) { openFurnaceAt(hit.x, hit.y, hit.z); return true; }
  if (hit.id === ID.CraftingTable) { toggleInventory(true); return true; }
  const sel = survival.hotbar[survival.selected];
  if (sel && isItem(sel.id) && itemDef(sel.id)?.use === 'ignite') {
    if (hit.id === ID.TNT) {
      primeTNT(hit.x, hit.y, hit.z, 1.6);
      toast('치익...');
    } else {
      toast('불을 붙일 수 없습니다');
    }
    return true;
  }
  return false;
}

function tryPlace() {
  const hit = player.raycast();
  if (!hit) return;
  const id = survival.selectedId();
  if (!id || isItem(id)) return; // items aren't placeable
  const px = hit.x + hit.nx;
  const py = hit.y + hit.ny;
  const pz = hit.z + hit.nz;
  if (world.getBlock(px, py, pz) !== 0) return;
  const minX = Math.floor(player.pos.x - 0.3), maxX = Math.floor(player.pos.x + 0.3);
  const minY = Math.floor(player.pos.y), maxY = Math.floor(player.pos.y + 1.8);
  const minZ = Math.floor(player.pos.z - 0.3), maxZ = Math.floor(player.pos.z + 0.3);
  if (px >= minX && px <= maxX && py >= minY && py <= maxY && pz >= minZ && pz <= maxZ) return;
  if (!survival.consumeSelected()) return;
  world.setBlock(px, py, pz, id);
  rebuildAround(px, pz);
}

function rebuildAround(wx, wz) {
  const cx = Math.floor(wx / CHUNK);
  const cz = Math.floor(wz / CHUNK);
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++) {
      const c = world.chunks.get(world.key(cx + dx, cz + dz));
      if (c && c.dirty) world.buildMesh(c);
    }
}

function updateMining(dt) {
  const hit = player.raycast();
  highlightEdges.visible = !!hit;
  if (hit) highlightEdges.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);

  if (mining && hit) {
    const def = blockDef(hit.id);
    if (!def || def.hardness === Infinity) {
      breakBar.style.display = 'none';
      return;
    }
    if (!breakTarget || breakTarget.x !== hit.x || breakTarget.y !== hit.y || breakTarget.z !== hit.z) {
      breakTarget = hit;
      breakProgress = 0;
    }
    breakProgress += dt;
    const ratio = Math.min(1, breakProgress / def.hardness);
    breakBar.style.display = 'block';
    breakFill.style.width = (ratio * 100) + '%';
    if (ratio >= 1) {
      world.setBlock(hit.x, hit.y, hit.z, 0);
      rebuildAround(hit.x, hit.z);
      if (hit.id === ID.Furnace) furnaceStates.delete(fkey(hit.x, hit.y, hit.z));
      if (!survival.addItem(def.drop ?? hit.id)) toast('인벤토리가 가득 찼습니다');
      survival.addExhaustion(0.05);
      breakProgress = 0;
      breakTarget = null;
      breakBar.style.display = 'none';
      renderHotbar();
    }
  } else {
    breakBar.style.display = 'none';
    breakProgress = 0;
    breakTarget = null;
  }

  if (placing && placeCooldown <= 0) {
    tryPlace();
    placeCooldown = 0.18;
    renderHotbar();
  }
  placeCooldown -= dt;
}

// ---- TNT / explosions ----
const primed = [];
const effects = [];

function primeTNT(x, y, z, fuse) {
  world.setBlock(x, y, z, 0);
  rebuildAround(x, z);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.02, 1.02, 1.02),
    new THREE.MeshBasicMaterial({ color: 0xff3322 })
  );
  mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
  scene.add(mesh);
  primed.push({ mesh, x, y, z, fuse });
}

function updatePrimed(dt) {
  for (let i = primed.length - 1; i >= 0; i--) {
    const p = primed[i];
    p.fuse -= dt;
    p.mesh.visible = Math.floor(p.fuse * 8) % 2 === 0;
    if (p.fuse <= 0) {
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      primed.splice(i, 1);
      explode(p.x + 0.5, p.y + 0.5, p.z + 0.5, 3);
    }
  }
}

function explode(cx, cy, cz, R) {
  const bx0 = Math.floor(cx), by0 = Math.floor(cy), bz0 = Math.floor(cz);
  for (let dy = -R; dy <= R; dy++)
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy + dz * dz > R * R + 1) continue;
        const bx = bx0 + dx, by = by0 + dy, bz = bz0 + dz;
        const id = world.getBlock(bx, by, bz);
        if (id === 0) continue;
        if (id === ID.TNT) { primeTNT(bx, by, bz, 0.15 + Math.random() * 0.15); continue; }
        const def = blockDef(id);
        if (!def || def.hardness === Infinity || def.liquid) continue;
        if (id === ID.Furnace) furnaceStates.delete(fkey(bx, by, bz));
        world.setBlock(bx, by, bz, 0);
      }
  rebuildAround(bx0, bz0);

  // damage + knockback the player
  const pd = Math.hypot(player.pos.x - cx, player.pos.y + 0.9 - cy, player.pos.z - cz);
  if (pd < R + 1.5) {
    const f = 1 - pd / (R + 1.5);
    survival.hurt(14 * f);
    const dx = player.pos.x - cx, dz = player.pos.z - cz;
    const d = Math.hypot(dx, dz) || 1;
    player.vel.x += (dx / d) * 11 * f;
    player.vel.z += (dz / d) * 11 * f;
    player.vel.y += 8 * f;
  }
  mobs.damageInRadius(cx, cy, cz, R + 1, 18);

  // flash effect
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xffb04a, transparent: true, opacity: 0.85, depthWrite: false })
  );
  mesh.position.set(cx, cy, cz);
  scene.add(mesh);
  effects.push({ mesh, life: 0.45, max: 0.45, R });
}

function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.life -= dt;
    const t = 1 - e.life / e.max;
    e.mesh.scale.setScalar(0.6 + t * e.R * 1.6);
    e.mesh.material.opacity = 0.85 * (1 - t);
    if (e.life <= 0) {
      scene.remove(e.mesh);
      e.mesh.geometry.dispose();
      e.mesh.material.dispose();
      effects.splice(i, 1);
    }
  }
}

// ---- day / night ----
let timeOfDay = 0.25;
const DAY_LENGTH = 600;
let brightness = 1;
let isNight = false;

function updateDayNight(dt) {
  timeOfDay = (timeOfDay + dt / DAY_LENGTH) % 1;
  const light = Math.cos((timeOfDay - 0.3) * Math.PI * 2) * 0.5 + 0.5;
  brightness = 0.28 + 0.72 * Math.max(0, light);
  isNight = light < 0.22;

  world.opaqueMat.color.setScalar(brightness);
  world.cutoutMat.color.setScalar(brightness);
  world.waterMat.color.setScalar(brightness);

  const sky = NIGHT_SKY.clone().lerp(DAY_SKY, Math.max(0, light));
  scene.background.copy(sky);
  scene.fog.color.copy(sky);

  const hours = Math.floor(((timeOfDay + 0.25) % 1) * 24);
  const mins = Math.floor((((timeOfDay + 0.25) % 1) * 24 * 60) % 60);
  clockEl.textContent =
    (hours < 10 ? '0' : '') + hours + ':' + (mins < 10 ? '0' : '') + mins +
    (light > 0.35 ? ' ☀' : ' ☾');
}

// ---- death / respawn ----
respawnBtn.addEventListener('click', () => {
  survival.respawn();
  const y = world.surfaceY(0, 0);
  player.pos.set(0.5, y + 1, 0.5);
  player.vel.set(0, 0, 0);
  deathEl.style.display = 'none';
  renderHUD();
});

// ---- main loop ----
let last = performance.now();
let hudTimer = 0;

function loop(now) {
  const dt = (now - last) / 1000;
  last = now;

  updateDayNight(dt);

  const paused = survival.dead || menuOpen();
  if (!paused) {
    player.update(dt);
    updateMining(dt);
    mobs.update(dt, { player, survival, isNight, brightness });
    updatePrimed(dt);

    const headInWater = isLiquid(
      world.getBlock(Math.floor(player.pos.x), Math.floor(player.pos.y + 1.6), Math.floor(player.pos.z))
    );
    const moving = Math.abs(player.vel.x) + Math.abs(player.vel.z) > 0.1;
    survival.tick(dt, {
      inWater: player.inWater,
      headInWater,
      landedSpeed: player.landedSpeed || 0,
      moving,
      sprinting: player.sprinting,
    });

    if (survival.dead) {
      deathEl.style.display = 'flex';
      if (document.pointerLockElement) document.exitPointerLock();
    }
  }

  // furnaces smelt in the background, even with a menu open
  for (const f of furnaceStates.values()) f.tick(dt);
  if (furnaceOpen && currentFurnace) {
    updateFurnaceMeters();
    const sig = furnSig(currentFurnace);
    if (sig !== lastFurnSig) { renderFurnaceScreen(); lastFurnSig = sig; }
  }

  updateEffects(dt);

  world.update(player.pos.x, player.pos.z, RENDER_RADIUS, 2);

  hudTimer += dt;
  if (hudTimer > 0.2) { renderHUD(); hudTimer = 0; }

  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- mobile touch controls ----
function touchPrimary() {
  if (tryAttack()) return;
  if (interactUse()) return;
  tryPlace();
  renderHotbar();
}

function setupTouchControls() {
  if (!IS_TOUCH) return;
  document.body.classList.add('touch');

  const root = document.createElement('div');
  root.id = 'touch-controls';
  root.innerHTML = `
    <div id="joy"><div id="joy-knob"></div></div>
    <button class="tbtn jump" id="t-jump" aria-label="jump">⤒</button>
    <div id="side">
      <button class="tbtn small" id="t-inv" aria-label="inventory">🎒</button>
      <button class="tbtn small" id="t-fly" aria-label="fly">✈</button>
      <button class="tbtn small" id="t-down" aria-label="down">⬇</button>
      <button class="tbtn small" id="t-eat" aria-label="eat">🍖</button>
    </div>`;
  document.body.appendChild(root);

  const joy = document.getElementById('joy');
  const knob = document.getElementById('joy-knob');
  const R = 48;
  const DEAD = 0.15;
  let joyId = null;
  let joyCx = 0, joyCy = 0;
  const joyMove = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== joyId) continue;
      let dx = t.clientX - joyCx;
      let dy = t.clientY - joyCy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      let nx = dx / R, ny = dy / R;
      const mag = Math.hypot(nx, ny);
      if (mag < DEAD) { nx = 0; ny = 0; }
      else { const scale = (mag - DEAD) / (1 - DEAD) / mag; nx *= scale; ny *= scale; }
      player.joyStr = nx;
      player.joyFwd = -ny;
      e.preventDefault();
    }
  };
  const joyEnd = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== joyId) continue;
      joyId = null;
      player.joyFwd = 0;
      player.joyStr = 0;
      knob.style.transform = 'translate(0,0)';
    }
  };
  joy.addEventListener('touchstart', (e) => {
    joyId = e.changedTouches[0].identifier;
    const rect = joy.getBoundingClientRect();
    joyCx = rect.left + rect.width / 2;
    joyCy = rect.top + rect.height / 2;
    joyMove(e);
    e.preventDefault();
  }, { passive: false });
  joy.addEventListener('touchmove', joyMove, { passive: false });
  joy.addEventListener('touchend', joyEnd);
  joy.addEventListener('touchcancel', joyEnd);

  // canvas: drag to look, quick tap to attack/use/place, hold to mine
  const HOLD_MS = 280;
  const MOVE_THRESH = 10;
  let lookId = null, lastX = 0, lastY = 0, startX = 0, startY = 0;
  let holdTimer = null, holdMoved = false, touchMining = false;

  const cancelHold = () => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } };
  const stopTouchMining = () => {
    if (touchMining) { touchMining = false; mining = false; breakProgress = 0; breakTarget = null; }
  };

  canvas.addEventListener('touchstart', (e) => {
    if (menuOpen() || survival.dead) return;
    if (lookId === null) {
      const t = e.changedTouches[0];
      lookId = t.identifier;
      lastX = t.clientX; lastY = t.clientY;
      startX = t.clientX; startY = t.clientY;
      holdMoved = false;
      cancelHold();
      holdTimer = setTimeout(() => {
        holdTimer = null;
        if (!holdMoved) { touchMining = true; mining = true; }
      }, HOLD_MS);
    }
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== lookId) continue;
      if (!holdMoved && Math.hypot(t.clientX - startX, t.clientY - startY) > MOVE_THRESH) {
        holdMoved = true;
        cancelHold();
      }
      player.addLook(t.clientX - lastX, t.clientY - lastY);
      lastX = t.clientX;
      lastY = t.clientY;
      e.preventDefault();
    }
  }, { passive: false });
  const lookEnd = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== lookId) continue;
      lookId = null;
      cancelHold();
      if (touchMining) stopTouchMining();
      else if (!holdMoved) touchPrimary();
    }
  };
  canvas.addEventListener('touchend', lookEnd);
  canvas.addEventListener('touchcancel', lookEnd);

  const hold = (id, on, off) => {
    const el = document.getElementById(id);
    el.addEventListener('touchstart', (e) => { on(); el.classList.add('down'); e.preventDefault(); }, { passive: false });
    const end = (e) => { off && off(); el.classList.remove('down'); if (e && e.preventDefault) e.preventDefault(); };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
  };
  const tap = (id, fn) => {
    document.getElementById(id).addEventListener('touchstart', (e) => { fn(); e.preventDefault(); }, { passive: false });
  };

  hold('t-jump', () => { player.keys['Space'] = true; }, () => { player.keys['Space'] = false; });
  hold('t-down', () => { player.keys['ControlLeft'] = true; }, () => { player.keys['ControlLeft'] = false; });
  tap('t-fly', () => { player.flying = !player.flying; toast(player.flying ? '비행 ON' : '비행 OFF'); });
  tap('t-eat', () => { if (survival.eatSelected()) { toast('냠냠!'); renderHotbar(); renderHUD(); } });
  tap('t-inv', () => { if (furnaceOpen) closeFurnace(); else toggleInventory(); });
}

// init UI
renderHotbar();
renderHUD();
inventoryEl.style.display = 'none';
furnaceEl.style.display = 'none';
setupTouchControls();
requestAnimationFrame(loop);

// expose for debugging / tests
window.__game = {
  world, player, survival, mobs, furnaceStates, scene,
  openFurnaceAt, primeTNT, toggleInventory, closeFurnace,
  renderInventoryScreen, renderHUD,
};
