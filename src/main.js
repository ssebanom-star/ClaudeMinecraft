// Game bootstrap: scene, render loop, mining/placing, survival HUD,
// day/night cycle, inventory UI.
import * as THREE from 'three';
import { buildAtlas } from './textures.js';
import { World, CHUNK } from './world.js';
import { Player } from './player.js';
import { Survival } from './survival.js';
import { BLOCKS, blockDef, isLiquid } from './blocks.js';

const RENDER_RADIUS = 5;

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
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

// ---- block highlight ----
const highlightGeo = new THREE.BoxGeometry(1.002, 1.002, 1.002);
const highlightEdges = new THREE.LineSegments(
  new THREE.EdgesGeometry(highlightGeo),
  new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4 })
);
highlightEdges.visible = false;
scene.add(highlightEdges);

// ---- HUD elements ----
const healthBar = document.getElementById('health');
const hungerBar = document.getElementById('hunger');
const airBar = document.getElementById('air');
const hotbarEl = document.getElementById('hotbar');
const breakBar = document.getElementById('breakbar');
const breakFill = document.getElementById('breakfill');
const inventoryEl = document.getElementById('inventory');
const invGrid = document.getElementById('invgrid');
const deathEl = document.getElementById('death');
const respawnBtn = document.getElementById('respawn');
const clockEl = document.getElementById('clock');
const toastEl = document.getElementById('toast');

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.remove('show'), 1400);
}

// ---- icon cache ----
const iconCache = {};
function iconURL(id) {
  if (!iconCache[id]) iconCache[id] = atlas.iconFor(id);
  return iconCache[id];
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

// ---- inventory (all 50 blocks) ----
function buildInventory() {
  invGrid.innerHTML = '';
  BLOCKS.forEach((def, i) => {
    const id = i + 1;
    const cell = document.createElement('div');
    cell.className = 'invcell';
    cell.title = def.name;
    const img = document.createElement('img');
    img.src = iconURL(id);
    cell.appendChild(img);
    const label = document.createElement('span');
    label.textContent = def.name;
    cell.appendChild(label);
    cell.addEventListener('click', () => {
      survival.setHotbar(survival.selected, id);
      renderHotbar();
      toast(def.name + ' → 슬롯 ' + (survival.selected + 1));
    });
    invGrid.appendChild(cell);
  });
}

let inventoryOpen = false;
function toggleInventory(force) {
  inventoryOpen = force !== undefined ? force : !inventoryOpen;
  inventoryEl.style.display = inventoryOpen ? 'flex' : 'none';
  if (inventoryOpen && document.pointerLockElement) document.exitPointerLock();
}

// ---- HUD bars ----
function renderHUD() {
  // health hearts
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

// ---- input: hotbar select, inventory, eat ----
window.addEventListener('keydown', (e) => {
  if (e.code.startsWith('Digit')) {
    const n = parseInt(e.code.slice(5), 10);
    if (n >= 1 && n <= 9) { survival.selected = n - 1; renderHotbar(); }
  }
  if (e.code === 'KeyE') toggleInventory();
  if (e.code === 'Escape') toggleInventory(false);
  if (e.code === 'KeyR') {
    if (survival.eatSelected()) { toast('냠냠!'); renderHUD(); }
  }
});
window.addEventListener('wheel', (e) => {
  if (inventoryOpen) return;
  const dir = Math.sign(e.deltaY);
  survival.selected = (survival.selected + dir + 9) % 9;
  renderHotbar();
});

// ---- mining / placing ----
let mining = false;
let placing = false;
let breakProgress = 0;
let breakTarget = null;

canvas.addEventListener('mousedown', (e) => {
  if (!player.locked) return;
  if (e.button === 0) mining = true;
  if (e.button === 2) placing = true;
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) { mining = false; breakProgress = 0; breakTarget = null; }
  if (e.button === 2) placing = false;
});
window.addEventListener('contextmenu', (e) => e.preventDefault());

function tryPlace() {
  const hit = player.raycast();
  if (!hit) return;
  const id = survival.selectedId();
  if (!id) return;
  const px = hit.x + hit.nx;
  const py = hit.y + hit.ny;
  const pz = hit.z + hit.nz;
  if (world.getBlock(px, py, pz) !== 0) return;
  // don't place inside the player
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

let placeCooldown = 0;

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
      survival.addItem(def.drop ?? hit.id);
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

// ---- day / night ----
let timeOfDay = 0.25; // 0..1, start morning
const DAY_LENGTH = 600; // seconds for full cycle

function updateDayNight(dt) {
  timeOfDay = (timeOfDay + dt / DAY_LENGTH) % 1;
  // brightness: peak at noon (0.25..0.5 day region). Use cosine.
  const angle = timeOfDay * Math.PI * 2;
  let light = Math.sin(angle - Math.PI / 2) * 0.5 + 0.5; // 0 at midnight, 1 at noon (shifted)
  // shift so 0.25 is morning bright; recompute simpler:
  light = Math.cos((timeOfDay - 0.3) * Math.PI * 2) * 0.5 + 0.5;
  const bright = 0.28 + 0.72 * Math.max(0, light);

  world.opaqueMat.color.setScalar(bright);
  world.cutoutMat.color.setScalar(bright);
  world.waterMat.color.setScalar(bright);

  const sky = NIGHT_SKY.clone().lerp(DAY_SKY, Math.max(0, light));
  scene.background.copy(sky);
  scene.fog.color.copy(sky);

  // clock label
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

  if (!survival.dead && !inventoryOpen) {
    player.update(dt);
    updateMining(dt);

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

  world.update(player.pos.x, player.pos.z, RENDER_RADIUS, 2);
  updateDayNight(dt);

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

// init UI
renderHotbar();
buildInventory();
renderHUD();
toggleInventory(false);
requestAnimationFrame(loop);

// expose for debugging
window.__game = { world, player, survival };
