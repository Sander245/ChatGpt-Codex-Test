const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const hpValue = document.getElementById("hpValue");
const scoreValue = document.getElementById("scoreValue");
const waveValue = document.getElementById("waveValue");

const world = {
  width: canvas.width,
  height: canvas.height,
  time: 0,
  score: 0,
  wave: 1,
};

const input = {
  up: false,
  down: false,
  left: false,
  right: false,
  firing: false,
  mouseX: canvas.width / 2,
  mouseY: canvas.height / 2,
};

const player = {
  x: world.width / 2,
  y: world.height / 2,
  vx: 0,
  vy: 0,
  radius: 16,
  hp: 100,
  cooldown: 0,
  damageFlash: 0,
};

const bullets = [];
const enemies = [];
const particles = [];

const rand = (min, max) => Math.random() * (max - min) + min;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function spawnEnemy() {
  const edge = Math.floor(Math.random() * 4);
  let x = 0;
  let y = 0;

  if (edge === 0) {
    x = rand(0, world.width);
    y = -30;
  } else if (edge === 1) {
    x = world.width + 30;
    y = rand(0, world.height);
  } else if (edge === 2) {
    x = rand(0, world.width);
    y = world.height + 30;
  } else {
    x = -30;
    y = rand(0, world.height);
  }

  const scale = 1 + world.wave * 0.07;
  enemies.push({
    x,
    y,
    vx: 0,
    vy: 0,
    radius: rand(11, 20),
    hp: 15 * scale,
    speed: rand(46, 90) * (1 + world.wave * 0.04),
    hue: rand(180, 330),
  });
}

function spawnBurst(x, y, hue, count, speed) {
  for (let i = 0; i < count; i += 1) {
    const a = rand(0, Math.PI * 2);
    const s = rand(speed * 0.4, speed);
    particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: rand(0.3, 0.7),
      size: rand(1.5, 3.5),
      hue,
    });
  }
}

function fireBullet() {
  const angle = Math.atan2(input.mouseY - player.y, input.mouseX - player.x);
  const speed = 740;
  bullets.push({
    x: player.x + Math.cos(angle) * 20,
    y: player.y + Math.sin(angle) * 20,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: 0.8,
    damage: 10,
  });

  spawnBurst(player.x + Math.cos(angle) * 16, player.y + Math.sin(angle) * 16, 195, 6, 100);
}

function update(dt) {
  world.time += dt;
  player.damageFlash = Math.max(0, player.damageFlash - dt * 4);

  const accel = 840;
  const drag = 7;
  const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);

  player.vx += dx * accel * dt;
  player.vy += dy * accel * dt;

  player.vx -= player.vx * drag * dt;
  player.vy -= player.vy * drag * dt;

  player.x = clamp(player.x + player.vx * dt, player.radius, world.width - player.radius);
  player.y = clamp(player.y + player.vy * dt, player.radius, world.height - player.radius);

  if (input.firing && player.cooldown <= 0) {
    fireBullet();
    player.cooldown = 0.09;
  }
  player.cooldown -= dt;

  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    const b = bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;

    if (b.life <= 0 || b.x < -40 || b.y < -40 || b.x > world.width + 40 || b.y > world.height + 40) {
      bullets.splice(i, 1);
    }
  }

  for (let i = enemies.length - 1; i >= 0; i -= 1) {
    const e = enemies[i];
    const ang = Math.atan2(player.y - e.y, player.x - e.x);
    e.vx += Math.cos(ang) * e.speed * dt;
    e.vy += Math.sin(ang) * e.speed * dt;
    e.vx *= 0.94;
    e.vy *= 0.94;
    e.x += e.vx * dt;
    e.y += e.vy * dt;

    const distToPlayer = Math.hypot(player.x - e.x, player.y - e.y);
    if (distToPlayer < player.radius + e.radius) {
      player.hp = Math.max(0, player.hp - 16 * dt);
      player.damageFlash = 1;
      const push = (player.radius + e.radius - distToPlayer) * 0.6;
      player.x += Math.cos(ang + Math.PI) * push;
      player.y += Math.sin(ang + Math.PI) * push;
    }

    for (let j = bullets.length - 1; j >= 0; j -= 1) {
      const b = bullets[j];
      const hitDist = Math.hypot(e.x - b.x, e.y - b.y);
      if (hitDist < e.radius + 4) {
        e.hp -= b.damage;
        bullets.splice(j, 1);
        spawnBurst(b.x, b.y, e.hue, 4, 90);
        if (e.hp <= 0) {
          world.score += 10;
          spawnBurst(e.x, e.y, e.hue, 22, 210);
          enemies.splice(i, 1);
        }
        break;
      }
    }
  }

  const desired = 4 + world.wave * 2;
  if (enemies.length < desired) {
    spawnEnemy();
  }

  if (world.score > world.wave * 220) {
    world.wave += 1;
  }

  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.97;
    p.vy *= 0.97;
    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }

  hpValue.textContent = Math.ceil(player.hp).toString();
  scoreValue.textContent = world.score.toString();
  waveValue.textContent = world.wave.toString();
}

function drawGrid() {
  const spacing = 42;
  const pulse = 0.2 + Math.sin(world.time * 1.4) * 0.05;
  ctx.strokeStyle = `rgba(90, 170, 255, ${pulse})`;
  ctx.lineWidth = 1;

  for (let x = 0; x <= world.width; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, world.height);
    ctx.stroke();
  }

  for (let y = 0; y <= world.height; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(world.width, y);
    ctx.stroke();
  }
}

function draw() {
  const bg = ctx.createLinearGradient(0, 0, 0, world.height);
  bg.addColorStop(0, "#030814");
  bg.addColorStop(1, "#02050c");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, world.width, world.height);

  drawGrid();

  for (const p of particles) {
    ctx.fillStyle = `hsla(${p.hue}, 95%, 65%, ${p.life})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const b of bullets) {
    ctx.fillStyle = "rgba(158, 243, 255, 0.95)";
    ctx.shadowBlur = 12;
    ctx.shadowColor = "#93f5ff";
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  for (const e of enemies) {
    ctx.fillStyle = `hsla(${e.hue}, 78%, 54%, 0.22)`;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius + 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `hsla(${e.hue}, 95%, 65%, 1)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  const angle = Math.atan2(input.mouseY - player.y, input.mouseX - player.x);
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(angle);

  ctx.fillStyle = `rgba(138, 240, 255, ${0.85 + player.damageFlash * 0.15})`;
  ctx.shadowBlur = 18;
  ctx.shadowColor = player.damageFlash > 0 ? "#ff6e9f" : "#7ce6ff";

  ctx.beginPath();
  ctx.moveTo(22, 0);
  ctx.lineTo(-14, 11);
  ctx.lineTo(-9, 0);
  ctx.lineTo(-14, -11);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.restore();

  if (player.hp <= 0) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.62)";
    ctx.fillRect(0, 0, world.width, world.height);
    ctx.fillStyle = "#ff8db5";
    ctx.textAlign = "center";
    ctx.font = "700 56px Inter, sans-serif";
    ctx.fillText("SYSTEM FAILURE", world.width / 2, world.height / 2 - 10);
    ctx.fillStyle = "#ffd6e6";
    ctx.font = "500 20px Inter, sans-serif";
    ctx.fillText("Reload page to reboot the arena", world.width / 2, world.height / 2 + 34);
  }
}

let previous = performance.now();
function loop(now) {
  const dt = Math.min((now - previous) / 1000, 0.033);
  previous = now;

  if (player.hp > 0) {
    update(dt);
  }
  draw();
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  if (event.key === "w" || event.key === "ArrowUp") input.up = true;
  if (event.key === "s" || event.key === "ArrowDown") input.down = true;
  if (event.key === "a" || event.key === "ArrowLeft") input.left = true;
  if (event.key === "d" || event.key === "ArrowRight") input.right = true;
});

window.addEventListener("keyup", (event) => {
  if (event.key === "w" || event.key === "ArrowUp") input.up = false;
  if (event.key === "s" || event.key === "ArrowDown") input.down = false;
  if (event.key === "a" || event.key === "ArrowLeft") input.left = false;
  if (event.key === "d" || event.key === "ArrowRight") input.right = false;
});

canvas.addEventListener("mousemove", (event) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  input.mouseX = (event.clientX - rect.left) * scaleX;
  input.mouseY = (event.clientY - rect.top) * scaleY;
});

canvas.addEventListener("mousedown", () => {
  input.firing = true;
});

window.addEventListener("mouseup", () => {
  input.firing = false;
});

for (let i = 0; i < 6; i += 1) {
  spawnEnemy();
}
requestAnimationFrame(loop);
