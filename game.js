const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const hud = {
  hp: document.getElementById("hpValue"),
  energy: document.getElementById("energyValue"),
  score: document.getElementById("scoreValue"),
  wave: document.getElementById("waveValue"),
  weapon: document.getElementById("weaponLabel"),
  field: document.getElementById("fieldLabel"),
  upgrades: document.getElementById("upgradeLabel"),
};

const world = { width: canvas.width, height: canvas.height, gravity: 1950, score: 0, wave: 1, bossAlive: false, t: 0 };
const camera = { x: 0, y: 0 };
const keys = { left: false, right: false, jump: false, fire: false, mx: canvas.width / 2, my: canvas.height / 2 };

const upgrades = new Set();
const WEAPONS = {
  rifle: { name: "Kinetic Rifle", dmg: 15, speed: 1250, cd: 0.12, spread: 0.02 },
  scatter: { name: "Scatter Blaster", dmg: 9, speed: 1050, cd: 0.22, spread: 0.22, pellets: 6 },
  rail: { name: "Pulse Rail", dmg: 38, speed: 1800, cd: 0.52, spread: 0.005 },
};
const FIELD_TECH = {
  repulse: { name: "Repulse", cost: 28, cd: 0.9 },
  blink: { name: "Blink", cost: 22, cd: 1.1 },
  stasis: { name: "Stasis", cost: 34, cd: 3.2 },
};

const state = {
  player: {
    x: 200,
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
};

const level = {
  floorY: world.height - 90,
  platforms: [
    { x: 200, y: 560, w: 220, h: 24 },
    { x: 530, y: 510, w: 260, h: 24 },
    { x: 900, y: 460, w: 230, h: 24 },
    { x: 1060, y: 340, w: 190, h: 22 },
    { x: 520, y: 320, w: 180, h: 22 },
  ],
};

const rand = (a, b) => Math.random() * (b - a) + a;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function addParticles(x, y, n, hue = 190, force = 220) {
  for (let i = 0; i < n; i += 1) {
    const a = rand(0, Math.PI * 2);
    const s = rand(0.35, 1) * force;
    state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.2, 0.8), hue, size: rand(1.5, 3.5) });
  }
}

function currentWeapon() { return WEAPONS[state.player.weapon]; }

function canUseUpgrade(id) {
  if (upgrades.has(id)) return false;
  if (id === "hyperCore") return upgrades.has("stabilityCore");
  if (id === "railAmp") return state.player.unlockedWeapons.has("rail");
  if (id === "fieldOverclock") return upgrades.has("fieldBattery");
  return true;
}

const UPGRADE_POOL = [
  { id: "stabilityCore", name: "Stability Core", apply: () => { WEAPONS.rifle.spread *= 0.6; WEAPONS.scatter.spread *= 0.84; } },
  { id: "hyperCore", name: "Hyper Core", apply: () => { WEAPONS.rifle.cd *= 0.76; WEAPONS.scatter.cd *= 0.84; } },
  { id: "vampRounds", name: "Vamp Rounds", apply: () => {} },
  { id: "fieldBattery", name: "Field Battery", apply: () => { state.player.maxEnergy += 35; } },
  { id: "fieldOverclock", name: "Field Overclock", apply: () => { FIELD_TECH.repulse.cd *= 0.75; FIELD_TECH.blink.cd *= 0.75; } },
  { id: "railAmp", name: "Rail Amplifier", apply: () => { WEAPONS.rail.dmg += 20; } },
];

function spawnEnemy(kind = "drone") {
  const fromRight = Math.random() < 0.5;
  const x = fromRight ? world.width + 30 : -30;
  if (kind === "boss") {
    state.enemies.push({ type: "boss", x: world.width / 2 + 220, y: 150, vx: 0, vy: 0, w: 130, h: 130, hp: 500 + world.wave * 120, speed: 320, cd: 0.7 });
    world.bossAlive = true;
    return;
  }
  state.enemies.push({ type: kind, x, y: rand(80, 260), vx: rand(-20, 20), vy: 0, w: 42, h: 42, hp: 70 + world.wave * 18, speed: rand(130, 180), cd: rand(0.8, 1.7) });
}

function dropPickup(x, y, bossDrop = false) {
  const options = ["upgrade", "weapon", "field"];
  const t = bossDrop ? options[Math.floor(Math.random() * options.length)] : (Math.random() < 0.7 ? "upgrade" : "energy");
  state.pickups.push({ x, y, w: 30, h: 30, type: t, pulse: rand(0, 6.28) });
}

function chooseUpgrade() {
  const available = UPGRADE_POOL.filter((u) => canUseUpgrade(u.id));
  if (!available.length) return null;
  return available[Math.floor(Math.random() * available.length)];
}

function applyPickup(p) {
  if (p.type === "energy") {
    state.player.energy = clamp(state.player.energy + 24, 0, state.player.maxEnergy);
    return;
  }
  if (p.type === "weapon") {
    const locked = Object.keys(WEAPONS).filter((w) => !state.player.unlockedWeapons.has(w));
    if (locked.length) state.player.unlockedWeapons.add(locked[Math.floor(Math.random() * locked.length)]);
    return;
  }
  if (p.type === "field") {
    const keysField = Object.keys(FIELD_TECH);
    state.player.field = keysField[Math.floor(Math.random() * keysField.length)];
    return;
  }
  const up = chooseUpgrade();
  if (up) {
    upgrades.add(up.id);
    up.apply();
    if (up.id === "vampRounds") state.player.hp = clamp(state.player.hp + 8, 0, 100);
  }
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function playerRect() { return { x: state.player.x - state.player.w / 2, y: state.player.y - state.player.h / 2, w: state.player.w, h: state.player.h }; }

function shoot() {
  const p = state.player;
  const weap = currentWeapon();
  const tx = keys.mx + camera.x;
  const ty = keys.my + camera.y;
  const base = Math.atan2(ty - p.y, tx - p.x);
  const pellets = weap.pellets || 1;
  for (let i = 0; i < pellets; i += 1) {
    const ang = base + rand(-weap.spread, weap.spread);
    state.bullets.push({ x: p.x + Math.cos(ang) * 28, y: p.y + Math.sin(ang) * 18, vx: Math.cos(ang) * weap.speed, vy: Math.sin(ang) * weap.speed, dmg: weap.dmg, life: 1.1, team: "player" });
  }
  p.fireCd = weap.cd;
  addParticles(p.x + Math.cos(base) * 26, p.y + Math.sin(base) * 10, 6, 196, 110);
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
      if (d < 230) {
        e.vx += (dx / Math.max(d, 1)) * 600;
        e.vy += (dy / Math.max(d, 1)) * 400;
        addParticles(e.x, e.y, 5, 282, 160);
      }
    }
    addParticles(p.x, p.y, 20, 185, 260);
  } else if (p.field === "blink") {
    const dir = p.dir;
    p.x = clamp(p.x + dir * 190, 30, world.width - 30);
    p.vx += dir * 220;
    addParticles(p.x, p.y, 16, 310, 230);
  } else {
    for (const e of state.enemies) e.slow = 1.7;
    addParticles(p.x, p.y, 26, 140, 220);
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
  p.energy = clamp(p.energy + dt * 12, 0, p.maxEnergy);

  const accel = p.onGround ? 2350 : 1300;
  const max = p.onGround ? 420 : 370;
  const move = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  if (move !== 0) p.dir = move;
  p.vx += move * accel * dt;
  p.vx *= p.onGround ? 0.83 : 0.94;
  p.vx = clamp(p.vx, -max, max);
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

function updateEnemies(dt) {
  const p = state.player;
  for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
    const e = state.enemies[i];
    const slow = e.slow ? 0.35 : 1;
    e.slow = Math.max(0, (e.slow || 0) - dt);
    if (e.type === "boss") {
      const targetX = p.x + Math.sin(world.t * 1.2) * 240;
      e.vx += (targetX - e.x) * dt * 2.5;
      e.vy += (220 - e.y) * dt * 1.8;
      e.cd -= dt;
      if (e.cd <= 0) {
        e.cd = 0.55;
        const ang = Math.atan2(p.y - e.y, p.x - e.x);
        state.bullets.push({ x: e.x, y: e.y, vx: Math.cos(ang) * 550, vy: Math.sin(ang) * 550, dmg: 12, life: 2, team: "enemy" });
      }
    } else {
      e.vy += world.gravity * dt;
      const dx = p.x - e.x;
      if (Math.abs(dx) > 18) e.vx += Math.sign(dx) * e.speed * dt * slow;
      e.vx *= 0.88;
      e.cd -= dt;
      if (Math.abs(dx) < 400 && e.cd <= 0) {
        e.cd = rand(1.1, 1.9);
        state.bullets.push({ x: e.x, y: e.y - 10, vx: Math.sign(dx) * 460, vy: rand(-120, -40), dmg: 8, life: 2.1, team: "enemy" });
      }
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

    const pr = playerRect();
    if (rectsOverlap(pr, er)) {
      p.hp = clamp(p.hp - 30 * dt, 0, 100);
      p.hitFlash = 1;
      p.vx += Math.sign(pr.x - er.x) * 22;
      if (p.hp <= 0) state.dead = true;
    }

    if (e.hp <= 0 || e.y > world.height + 250) {
      if (e.type === "boss") {
        world.bossAlive = false;
        dropPickup(e.x, e.y, true);
        dropPickup(e.x + 40, e.y - 30, true);
      } else if (Math.random() < 0.4) {
        dropPickup(e.x, e.y, false);
      }
      addParticles(e.x, e.y, e.type === "boss" ? 44 : 18, e.type === "boss" ? 330 : 14, 300);
      state.enemies.splice(i, 1);
      world.score += e.type === "boss" ? 180 : 22;
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
    if (b.life <= 0) { state.bullets.splice(i, 1); continue; }

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
        state.bullets.splice(i, 1);
        if (p.hp <= 0) state.dead = true;
      }
    }
  }
}

function updatePickups(dt) {
  const pr = playerRect();
  for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
    const p = state.pickups[i];
    p.pulse += dt * 3;
    const r = { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h };
    if (rectsOverlap(pr, r)) {
      applyPickup(p);
      addParticles(p.x, p.y, 12, 72, 180);
      state.pickups.splice(i, 1);
    }
  }
}

function step(dt) {
  world.t += dt;
  if (state.dead) return;
  physicsStep(dt);
  updateEnemies(dt);
  updateBullets(dt);
  updatePickups(dt);

  if (state.enemies.length === 0 && !world.bossAlive) {
    world.wave += 1;
    const count = Math.min(4 + world.wave, 10);
    for (let i = 0; i < count; i += 1) spawnEnemy();
    if (world.wave % 3 === 0) spawnEnemy("boss");
  }

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
  ctx.fillRect(0, 0, world.width, world.height);

  ctx.fillStyle = "rgba(120, 205, 255, 0.14)";
  for (let i = 0; i < 7; i += 1) {
    const x = ((i * 260 + world.t * 18) % (world.width + 300)) - 150;
    ctx.fillRect(x, 65 + i * 40, 110, 4);
  }
}

function drawWorld() {
  drawBackground();

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
    const hue = e.type === "boss" ? 338 : 12;
    ctx.fillStyle = `hsla(${hue}, 76%, 56%, 0.25)`;
    ctx.fillRect(e.x - e.w / 2 - 5, e.y - e.h / 2 - 5, e.w + 10, e.h + 10);
    ctx.fillStyle = `hsla(${hue}, 84%, 60%, 0.88)`;
    ctx.fillRect(e.x - e.w / 2, e.y - e.h / 2, e.w, e.h);
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

  if (state.dead) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    ctx.fillRect(0, 0, world.width, world.height);
    ctx.fillStyle = "#ffb4de";
    ctx.textAlign = "center";
    ctx.font = "700 58px Inter, sans-serif";
    ctx.fillText("RUN TERMINATED", world.width / 2, world.height / 2 - 14);
    ctx.font = "500 24px Inter, sans-serif";
    ctx.fillStyle = "#ffe2f2";
    ctx.fillText("Reload to restart prototype", world.width / 2, world.height / 2 + 30);
  }
}

function syncHud() {
  hud.hp.textContent = Math.ceil(state.player.hp).toString();
  hud.energy.textContent = Math.ceil(state.player.energy).toString();
  hud.score.textContent = world.score.toString();
  hud.wave.textContent = world.wave.toString();
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
canvas.addEventListener("mousedown", () => { keys.fire = true; });
window.addEventListener("mouseup", () => { keys.fire = false; });
canvas.addEventListener("contextmenu", (e) => { e.preventDefault(); useFieldTech(); });

buildCollisionRects();
for (let i = 0; i < 4; i += 1) spawnEnemy();
requestAnimationFrame(frame);
