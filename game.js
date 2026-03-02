const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const hud = {
hp: document.getElementById("hpValue"),
  energy: document.getElementById("energyValue"),
  score: document.getElementById("scoreValue"),
  wave: document.getElementById("waveValue"),
  combo: document.getElementById("comboValue"),
  weapon: document.getElementById("weaponLabel"),
  field: document.getElementById("fieldLabel"),
  upgrades: document.getElementById("upgradeLabel"),
};

const world = { width: 2400, height: canvas.height, gravity: 1950, score: 0, wave: 1, bossAlive: false, t: 0 };
const camera = { x: 0, y: 0 };
const keys = { left: false, right: false, fire: false, mx: canvas.width / 2, my: canvas.height / 2 };
const upgrades = new Set();

const WEAPONS = {
  rifle: { name: "Kinetic Rifle", dmg: 15, speed: 1250, cd: 0.12, spread: 0.02 },
  scatter: { name: "Scatter Blaster", dmg: 9, speed: 1050, cd: 0.22, spread: 0.22, pellets: 6 },
  rail: { name: "Pulse Rail", dmg: 40, speed: 1850, cd: 0.5, spread: 0.005 },
};

const FIELD_TECH = {
  repulse: { name: "Repulse", cost: 28, cd: 0.9 },
  blink: { name: "Blink", cost: 22, cd: 1.1 },
  stasis: { name: "Stasis", cost: 34, cd: 3.2 },
};

const levelPresets = [
  [
    { x: 160, y: 570, w: 240, h: 24 },
    { x: 500, y: 520, w: 260, h: 24 },
    { x: 860, y: 470, w: 250, h: 24 },
    { x: 1220, y: 420, w: 260, h: 24 },
    { x: 1580, y: 500, w: 280, h: 24 },
    { x: 1970, y: 410, w: 240, h: 22 },
  ],
  [
    { x: 220, y: 550, w: 190, h: 22 },
    { x: 480, y: 470, w: 220, h: 22 },
    { x: 780, y: 560, w: 250, h: 22 },
    { x: 1120, y: 470, w: 220, h: 22 },
    { x: 1420, y: 390, w: 230, h: 22 },
    { x: 1760, y: 520, w: 290, h: 22 },
    { x: 2100, y: 430, w: 190, h: 22 },
  ],
  [
    { x: 140, y: 590, w: 270, h: 22 },
    { x: 510, y: 530, w: 220, h: 22 },
    { x: 810, y: 440, w: 180, h: 22 },
    { x: 1090, y: 350, w: 180, h: 22 },
    { x: 1360, y: 450, w: 260, h: 22 },
    { x: 1700, y: 560, w: 210, h: 22 },
    { x: 1990, y: 470, w: 260, h: 22 },
  ],
];

const state = {
  player: {
    x: 220,
    y: 200,
    vx: 0,
    vy: 0,
    w: 44,
    h: 62,
    hp: 100,
    energy: 100,
    maxEnergy: 100,
    onGround: false,
    coyote: 0,
    jumpBuffer: 0,
    fireCd: 0,
    fieldCd: 0,
    dashCd: 0,
    hitFlash: 0,
    dir: 1,
    weapon: "rifle",
    unlockedWeapons: new Set(["rifle"]),
    field: "repulse",
  },
  bullets: [],
  enemies: [],
  particles: [],
  pickups: [],
  platformRects: [],
  dead: false,
  combo: 1,
  comboTimer: 0,
};

const level = { floorY: world.height - 90, platforms: [...levelPresets[0]] };

const rand = (a, b) => Math.random() * (b - a) + a;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];

const currentWeapon = () => WEAPONS[state.player.weapon];
const screenToWorldX = (sx) => sx + camera.x;
const screenToWorldY = (sy) => sy + camera.y;

function addParticles(x, y, n, hue = 190, force = 220) {
  for (let i = 0; i < n; i += 1) {
    const a = rand(0, Math.PI * 2);
    const s = rand(0.35, 1) * force;
    state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.2, 0.8), hue, size: rand(1.5, 3.5) });
  }
}

function canUseUpgrade(id) {
  if (upgrades.has(id)) return false;
  if (id === "hyperCore") return upgrades.has("stabilityCore");
  if (id === "railAmp") return state.player.unlockedWeapons.has("rail");
  if (id === "fieldOverclock") return upgrades.has("fieldBattery");
  return true;
}

const UPGRADE_POOL = [
  { id: "stabilityCore", name: "Stability Core", apply: () => { WEAPONS.rifle.spread *= 0.55; WEAPONS.scatter.spread *= 0.84; } },
  { id: "hyperCore", name: "Hyper Core", apply: () => { WEAPONS.rifle.cd *= 0.76; WEAPONS.scatter.cd *= 0.84; } },
  { id: "vampRounds", name: "Vamp Rounds", apply: () => {} },
  { id: "fieldBattery", name: "Field Battery", apply: () => { state.player.maxEnergy += 35; } },
  { id: "fieldOverclock", name: "Field Overclock", apply: () => { FIELD_TECH.repulse.cd *= 0.75; FIELD_TECH.blink.cd *= 0.75; } },
  { id: "railAmp", name: "Rail Amplifier", apply: () => { WEAPONS.rail.dmg += 20; } },
];

function playerRect() {
  const p = state.player;
  return { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h };
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function chooseUpgrade() {
  const available = UPGRADE_POOL.filter((u) => canUseUpgrade(u.id));
  return available.length ? choice(available) : null;
}

function applyPickup(pickup) {
  if (pickup.type === "energy") {
    state.player.energy = clamp(state.player.energy + 24, 0, state.player.maxEnergy);
    return;
  }
  if (pickup.type === "weapon") {
    const locked = Object.keys(WEAPONS).filter((w) => !state.player.unlockedWeapons.has(w));
    if (locked.length) state.player.unlockedWeapons.add(choice(locked));
    return;
  }
  if (pickup.type === "field") {
    state.player.field = choice(Object.keys(FIELD_TECH));
    return;
  }
  const up = chooseUpgrade();
  if (up) {
    upgrades.add(up.id);
    up.apply();
    if (up.id === "vampRounds") state.player.hp = clamp(state.player.hp + 8, 0, 100);
  }
}

function dropPickup(x, y, bossDrop = false) {
  const type = bossDrop ? choice(["upgrade", "weapon", "field"]) : (Math.random() < 0.7 ? "upgrade" : "energy");
  state.pickups.push({ x, y, w: 30, h: 30, type, pulse: rand(0, 6.28), vx: 0, vy: 0 });
}

function enemySpawnPoint() {
  const base = Math.random() < 0.55 ? choice(level.platforms) : null;
  if (base) {
    return { x: base.x + rand(24, base.w - 24), y: base.y - 16 };M
  }
  return { x: rand(60, world.width - 60), y: level.floorY - 16 };
}

function makeEnemy(kind = "drone") {
  const spot = enemySpawnPoint();
  if (kind === "boss") {
    return {
      type: "boss", x: clamp(state.player.x + 380, 260, world.width - 260), y: 190, vx: 0, vy: 0, w: 130, h: 130,
      hp: 560 + world.wave * 140, maxHp: 560 + world.wave * 140, cd: 0.66, rainCd: 0.3,
    };
  }
  if (kind === "brute") return { type: "brute", x: spot.x, y: spot.y, vx: rand(-20, 20), vy: 0, w: 58, h: 58, hp: 145 + world.wave * 25, speed: rand(90, 130), cd: rand(1.2, 2.1) };
  if (kind === "skitter") return { type: "skitter", x: spot.x, y: spot.y, vx: rand(-20, 20), vy: 0, w: 34, h: 34, hp: 48 + world.wave * 11, speed: rand(180, 260), cd: rand(0.5, 1.1) };
  return { type: "drone", x: spot.x, y: spot.y, vx: rand(-20, 20), vy: 0, w: 42, h: 42, hp: 82 + world.wave * 18, speed: rand(130, 180), cd: rand(0.8, 1.7) };
}

function spawnEnemy(kind = "drone") {
  const e = makeEnemy(kind);
  state.enemies.push(e);
  if (kind === "boss") world.bossAlive = true;
}

function nextWave() {
  world.wave += 1;
  level.platforms = [...choice(levelPresets)];
  buildCollisionRects();

  const count = Math.min(5 + world.wave, 14);
  for (let i = 0; i < count; i += 1) {
    const roll = Math.random();
    if (roll < 0.18 + world.wave * 0.01) spawnEnemy("brute");
    else if (roll < 0.52) spawnEnemy("skitter");
    else spawnEnemy("drone");
  }
  if (world.wave % 3 === 0) spawnEnemy("boss");
}

function shoot() {
  const p = state.player;
  const w = currentWeapon();
  const base = Math.atan2(screenToWorldY(keys.my) - p.y, screenToWorldX(keys.mx) - p.x);
  const pellets = w.pellets || 1;
  for (let i = 0; i < pellets; i += 1) {
    const a = base + rand(-w.spread, w.spread);
    state.bullets.push({ x: p.x + Math.cos(a) * 28, y: p.y + Math.sin(a) * 18, vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed, dmg: w.dmg * state.combo, life: 1.1, team: "player" });
  }
  p.fireCd = w.cd;
  addParticles(p.x + Math.cos(base) * 26, p.y + Math.sin(base) * 10, 8, 196, 130);
}

function useFieldTech() {
  const p = state.player;
  if (p.fieldCd > 0) return;
  const spec = FIELD_TECH[p.field];
  if (p.energy < spec.cost) return;
  p.energy -= spec.cost;
  p.fieldCd = spec.cd;

  if (p.field === "repulse") {
    for (const e of state.enemies) {
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 250) {
        e.vx += (dx / Math.max(d, 1)) * 650;
        e.vy += (dy / Math.max(d, 1)) * 420;
      }
    }
    addParticles(p.x, p.y, 24, 185, 270);
  } else if (p.field === "blink") {
    p.x = clamp(p.x + p.dir * 210, 30, world.width - 30);
    p.vx += p.dir * 260;
    addParticles(p.x, p.y, 20, 310, 240);
  } else {
    for (const e of state.enemies) e.slow = 1.9;
    addParticles(p.x, p.y, 30, 140, 230);
  }
}

function buildCollisionRects() {
  state.platformRects = [{ x: 0, y: level.floorY, w: world.width, h: world.height - level.floorY }];
  for (const pl of level.platforms) state.platformRects.push({ ...pl });
}

function physicsStep(dt) {
  const p = state.player;
  p.coyote -= dt;
  p.jumpBuffer -= dt;
  p.hitFlash = Math.max(0, p.hitFlash - dt * 2.2);
  p.fireCd -= dt;
  p.fieldCd -= dt;
  p.dashCd -= dt;
  p.energy = clamp(p.energy + dt * 12, 0, p.maxEnergy);

  const accel = p.onGround ? 2350 : 1320;
  const maxSpeed = p.onGround ? 420 : 375;
  const move = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  if (move !== 0) p.dir = move;
  p.vx += move * accel * dt;
  p.vx *= p.onGround ? 0.83 : 0.94;
  p.vx = clamp(p.vx, -maxSpeed, maxSpeed);
  p.vy += world.gravity * dt;

  const prev = playerRect();
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  const next = playerRect();

  p.onGround = false;
  for (const r of state.platformRects) {
    if (!rectsOverlap(next, r)) continue;
    const prevBottom = prev.y + prev.h;
    const prevTop = prev.y;
    const prevRight = prev.x + prev.w;
    const prevLeft = prev.x;
    if (prevBottom <= r.y && p.vy >= 0) {
      p.y = r.y - p.h / 2;
      p.vy = 0;
      p.onGround = true;
      p.coyote = 0.11;
    } else if (prevTop >= r.y + r.h && p.vy < 0) {
      p.y = r.y + r.h + p.h / 2;
      p.vy = 20;
    } else if (prevRight <= r.x && p.vx > 0) {
      p.x = r.x - p.w / 2;
      p.vx = 0;
    } else if (prevLeft >= r.x + r.w && p.vx < 0) {
      p.x = r.x + r.w + p.w / 2;
      p.vx = 0;
    }
  }

  if (p.jumpBuffer > 0 && (p.onGround || p.coyote > 0)) {
    p.vy = -760;
    p.onGround = false;
    p.coyote = 0;
    p.jumpBuffer = 0;
    addParticles(p.x, p.y + p.h / 2, 8, 180, 120);
  }

  if (keys.fire && p.fireCd <= 0 && !state.dead) shoot();

  p.x = clamp(p.x, p.w / 2, world.width - p.w / 2);
  if (p.y > world.height + 120) {
    p.hp = 0;
    state.dead = true;
  }
}

function dash() {
  const p = state.player;
  if (state.dead || p.dashCd > 0 || p.energy < 22) return;
  p.energy -= 22;
  p.dashCd = 0.45;
  p.vx = p.dir * 980;
  p.vy *= 0.35;
  addParticles(p.x, p.y, 16, 200, 240);
}

function updateEnemies(dt) {
  const p = state.player;
  for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
    const e = state.enemies[i];
    const slow = e.slow ? 0.35 : 1;
    e.slow = Math.max(0, (e.slow || 0) - dt);

    if (e.type === "boss") {
      const phase2 = e.hp <= e.maxHp * 0.5;
      const targetX = clamp(p.x + Math.sin(world.t * 0.8) * 300, camera.x + 160, camera.x + canvas.width - 160);
      const targetY = 170 + Math.sin(world.t * 1.4) * 70;

      e.vx += (targetX - e.x) * dt * 3.2;
      e.vy += (targetY - e.y) * dt * 2.6;
      e.vx *= 0.9;
      e.vy *= 0.9;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.x = clamp(e.x, 120, world.width - 120);
      e.y = clamp(e.y, 80, 290);

      e.cd -= dt;
      if (e.cd <= 0) {
        e.cd = phase2 ? 0.42 : 0.64;
        const a = Math.atan2(p.y - e.y, p.x - e.x);
        state.bullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 610, vy: Math.sin(a) * 610, dmg: 12, life: 2, team: "enemy" });
      }

      if (phase2) {
        e.rainCd -= dt;
        if (e.rainCd <= 0) {
          e.rainCd = 0.3;
          const rainCount = Math.random() < 0.5 ? 1 : 2;
          for (let r = 0; r < rainCount; r += 1) {
            const rx = clamp(camera.x + rand(40, canvas.width - 40), 30, world.width - 30);
            state.bullets.push({ x: rx, y: camera.y - 20, vx: rand(-40, 40), vy: rand(520, 680), dmg: 10, life: 2.2, team: "enemy" });
          }
        }
      }
    } else {
      e.vy += world.gravity * dt;
      const dx = p.x - e.x;
      if (Math.abs(dx) > 18) e.vx += Math.sign(dx) * e.speed * dt * slow;
      e.vx *= e.type === "skitter" ? 0.92 : 0.88;
      e.cd -= dt;
      if (Math.abs(dx) < 460 && e.cd <= 0) {
        e.cd = e.type === "skitter" ? rand(0.7, 1.2) : rand(1.1, 2.1);
        state.bullets.push({ x: e.x, y: e.y - 10, vx: Math.sign(dx) * (e.type === "brute" ? 390 : 480), vy: rand(-130, -40), dmg: e.type === "brute" ? 14 : 8, life: 2.2, team: "enemy" });
      }

      e.x += e.vx * dt;
      e.y += e.vy * dt;

      const er = { x: e.x - e.w / 2, y: e.y - e.h / 2, w: e.w, h: e.h };
      for (const r of state.platformRects) {
        if (!rectsOverlap(er, r)) continue;
        if (e.vy >= 0 && er.y + er.h - 6 <= r.y) {
          e.y = r.y - e.h / 2;
          e.vy = 0;
        }
      }
    }

    const er = { x: e.x - e.w / 2, y: e.y - e.h / 2, w: e.w, h: e.h };
    const pr = playerRect();
    if (rectsOverlap(pr, er)) {
      p.hp = clamp(p.hp - (e.type === "brute" ? 42 : 30) * dt, 0, 100);
      p.hitFlash = 1;
      p.vx += Math.sign(pr.x - er.x) * 26;
      state.combo = 1;
      state.comboTimer = 0;
      if (p.hp <= 0) state.dead = true;
    }

    if (e.hp <= 0 || e.y > world.height + 250) {
      if (e.type === "boss") {
        world.bossAlive = false;
        dropPickup(e.x, e.y, true);
        dropPickup(e.x + 40, e.y - 30, true);
      } else if (Math.random() < 0.46) {
        dropPickup(e.x, e.y, false);
      }
      addParticles(e.x, e.y, e.type === "boss" ? 50 : 18, e.type === "boss" ? 330 : 14, 320);
      state.enemies.splice(i, 1);
      const base = e.type === "boss" ? 240 : (e.type === "brute" ? 42 : 24);
      world.score += Math.round(base * state.combo);
      state.combo = clamp(state.combo + 0.1, 1, 3);
      state.comboTimer = 3.5;
      if (upgrades.has("vampRounds")) p.hp = clamp(p.hp + 3, 0, 100);
    }
  }
}

function updateBullets(dt) {
  const p = state.player;
  for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
    const b = state.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) {
      state.bullets.splice(i, 1);
      continue;
    }

    if (b.team === "player") {
      for (const e of state.enemies) {
        if (Math.abs(b.x - e.x) < e.w / 2 && Math.abs(b.y - e.y) < e.h / 2) {
          e.hp -= b.dmg;
          state.bullets.splice(i, 1);
          addParticles(b.x, b.y, 4, 24, 90);
          break;
        }
      }
    } else {
      const pr = playerRect();
      if (b.x > pr.x && b.x < pr.x + pr.w && b.y > pr.y && b.y < pr.y + pr.h) {
        p.hp = clamp(p.hp - b.dmg, 0, 100);
        p.hitFlash = 1;
        state.combo = 1;
        state.comboTimer = 0;
        state.bullets.splice(i, 1);
        if (p.hp <= 0) state.dead = true;
      }
    }
  }
}

function updatePickups(dt) {
  const p = state.player;
  const pr = playerRect();
  for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
    const pick = state.pickups[i];
    pick.pulse += dt * 3;

    const dx = p.x - pick.x;
    const dy = p.y - pick.y;
    const dist = Math.hypot(dx, dy);
    const speed = clamp(180 + (900 / Math.max(dist, 40)), 180, 420);
    pick.vx += (dx / Math.max(dist, 1)) * speed * dt;
    pick.vy += (dy / Math.max(dist, 1)) * speed * dt;
    pick.vx *= 0.87;
    pick.vy *= 0.87;
    pick.x += pick.vx * dt;
    pick.y += pick.vy * dt;

    const r = { x: pick.x - pick.w / 2, y: pick.y - pick.h / 2, w: pick.w, h: pick.h };
    if (rectsOverlap(pr, r)) {
      applyPickup(pick);
      addParticles(pick.x, pick.y, 14, 72, 200);
      state.pickups.splice(i, 1);
    }
  }
}

function updateCamera(dt) {
  const targetX = state.player.x - canvas.width * 0.5;
  const maxX = world.width - canvas.width;
  camera.x += (clamp(targetX, 0, maxX) - camera.x) * Math.min(1, dt * 8);
  camera.x = clamp(camera.x, 0, maxX);
}

function step(dt) {
  world.t += dt;
  if (state.dead) return;

  physicsStep(dt);
  updateEnemies(dt);
  updateBullets(dt);
  updatePickups(dt);
  updateCamera(dt);

  state.comboTimer -= dt;
  if (state.comboTimer <= 0) state.combo = Math.max(1, state.combo - dt * 0.5);

  if (state.enemies.length === 0 && !world.bossAlive) nextWave();

  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const p = state.particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.96;
    p.vy *= 0.96;
    if (p.life <= 0) state.particles.splice(i, 1);
  }
}

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, world.height);
  g.addColorStop(0, "#090f1f");
  g.addColorStop(1, "#040913");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, world.height);

  ctx.fillStyle = "rgba(120, 205, 255, 0.1)";
  for (let i = -1; i < 10; i += 1) {
    const x = ((i * 260 + world.t * 18) % (canvas.width + 300)) - 150;
    ctx.fillRect(x, 65 + i * 24, 110, 4);
  }

  ctx.fillStyle = "rgba(88, 136, 208, 0.16)";
  for (let i = -2; i < 12; i += 1) {
    const x = (i * 260) - (world.t * 26 % 240);
    ctx.beginPath();
    ctx.moveTo(x, level.floorY);
    ctx.lineTo(x + 120, 360 + (i % 2) * 80);
    ctx.lineTo(x + 240, level.floorY);
    ctx.closePath();
    ctx.fill();
  }
}

function drawWorld() {
  drawBackground();

  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  ctx.fillStyle = "#121e3c";
  ctx.fillRect(0, level.floorY, world.width, world.height - level.floorY);
  ctx.strokeStyle = "rgba(126, 227, 255, 0.35)";
  ctx.lineWidth = 2;

  for (const pl of level.platforms) {
    ctx.fillStyle = "#122646";
    ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
    ctx.strokeRect(pl.x, pl.y, pl.w, pl.h);
  }

  for (const p of state.pickups) {
    const glow = 0.5 + Math.sin(p.pulse) * 0.35;
    const hues = { weapon: 48, field: 290, upgrade: 165, energy: 205 };
    ctx.fillStyle = `hsla(${hues[p.type] || 180}, 95%, 60%, ${glow})`;
    ctx.fillRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
  }

  for (const b of state.bullets) {
    ctx.fillStyle = b.team === "player" ? "#8ff4ff" : "#ff9ecf";
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.team === "player" ? 3.2 : 3.8, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const e of state.enemies) {
    const hue = e.type === "boss" ? 338 : (e.type === "brute" ? 24 : e.type === "skitter" ? 300 : 12);
    ctx.fillStyle = `hsla(${hue}, 76%, 56%, 0.25)`;
    ctx.fillRect(e.x - e.w / 2 - 5, e.y - e.h / 2 - 5, e.w + 10, e.h + 10);
    ctx.fillStyle = `hsla(${hue}, 84%, 60%, 0.88)`;
    ctx.fillRect(e.x - e.w / 2, e.y - e.h / 2, e.w, e.h);

    if (e.type === "boss") {
      const hpRatio = clamp(e.hp / e.maxHp, 0, 1);
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(e.x - 80, e.y - 92, 160, 10);
      ctx.fillStyle = "#ff80c7";
      ctx.fillRect(e.x - 80, e.y - 92, 160 * hpRatio, 10);
    }
  }

  for (const p of state.particles) {
    ctx.fillStyle = `hsla(${p.hue}, 100%, 66%, ${p.life})`;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  }

  const pl = state.player;
  ctx.save();
  ctx.translate(pl.x, pl.y);
  ctx.scale(pl.dir, 1);
  ctx.fillStyle = `rgba(138, 240, 255, ${0.82 + pl.hitFlash * 0.18})`;
  ctx.fillRect(-pl.w / 2, -pl.h / 2, pl.w, pl.h);
  ctx.fillStyle = "#d2fbff";
  ctx.fillRect(8, -18, 24, 7);
  ctx.restore();

  ctx.restore();

  if (state.dead) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    ctx.fillRect(0, 0, canvas.width, world.height);
    ctx.fillStyle = "#ffb4de";
    ctx.textAlign = "center";
    ctx.font = "700 58px Inter, sans-serif";
    ctx.fillText("RUN TERMINATED", canvas.width / 2, world.height / 2 - 14);
    ctx.font = "500 24px Inter, sans-serif";
    ctx.fillStyle = "#ffe2f2";
    ctx.fillText("Reload to restart prototype", canvas.width / 2, world.height / 2 + 30);
  }
}

function syncHud() {
  hud.hp.textContent = Math.ceil(state.player.hp).toString();
  hud.energy.textContent = Math.ceil(state.player.energy).toString();
  hud.score.textContent = world.score.toString();
  hud.wave.textContent = world.wave.toString();
  hud.combo.textContent = `x${state.combo.toFixed(1)}`;
  hud.weapon.textContent = currentWeapon().name;
  hud.field.textContent = FIELD_TECH[state.player.field].name;
  hud.upgrades.textContent = [...upgrades].join(", ") || "None";
}

let prev = performance.now();
function frame(now) {
  const dt = Math.min((now - prev) / 1000, 0.033);
  prev = now;
  step(dt);
  drawWorld();
  syncHud();
  requestAnimationFrame(frame);
}

window.addEventListener("keydown", (e) => {
  if (e.key === "a" || e.key === "ArrowLeft") keys.left = true;
  if (e.key === "d" || e.key === "ArrowRight") keys.right = true;
  if (e.key === " " || e.key === "w" || e.key === "ArrowUp") state.player.jumpBuffer = 0.14;
  if (e.key === "Shift") dash();
  if (e.key === "1" && state.player.unlockedWeapons.has("rifle")) state.player.weapon = "rifle";
  if (e.key === "2" && state.player.unlockedWeapons.has("scatter")) state.player.weapon = "scatter";
  if (e.key === "3" && state.player.unlockedWeapons.has("rail")) state.player.weapon = "rail";
});

window.addEventListener("keyup", (e) => {
  if (e.key === "a" || e.key === "ArrowLeft") keys.left = false;
  if (e.key === "d" || e.key === "ArrowRight") keys.right = false;
});

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width;
  const sy = canvas.height / rect.height;
  keys.mx = (e.clientX - rect.left) * sx;
  keys.my = (e.clientY - rect.top) * sy;
});

canvas.addEventListener("mousedown", (e) => {
  if (e.button === 0) keys.fire = true;
});

window.addEventListener("mouseup", (e) => {
  if (e.button === 0) keys.fire = false;
});

canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  useFieldTech();
});

window.addEventListener("blur", () => {
  keys.fire = false;
});

buildCollisionRects();
for (let i = 0; i < 5; i += 1) spawnEnemy(choice(["drone", "skitter", "brute"]));
requestAnimationFrame(frame);
