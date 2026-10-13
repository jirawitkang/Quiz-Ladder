// celebrate.js
// พลุ / กระดาษสีโปรย / ป้ายประกาศ บน canvas เต็มจอ (ไม่ต้องใช้ library)
// canvas ไม่รับการคลิก (pointer-events: none) จึงไม่บังการเล่น

const REDUCED_MOTION = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const COLORS = ["#FFD54A", "#FFA240", "#FF6B6B", "#4B3C8C", "#7E6BE0", "#2E9E5B", "#4FC3F7", "#FFFFFF"];
const GRAVITY = 0.12;

let canvas = null;
let ctx = null;
let particles = [];
let rockets = [];
let running = false;

function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement("canvas");
  canvas.className = "celebrate-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);
  ctx = canvas.getContext("2d");
  const resize = () => {
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  addEventListener("resize", resize);
}

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function explode(x, y, palette, onBurst) {
  const count = Math.round(rand(55, 80));
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + rand(-0.05, 0.05);
    const speed = rand(2.2, 5.2);
    particles.push({
      kind: "spark",
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: rand(55, 80),
      age: 0,
      color: pick(palette),
      size: rand(1.8, 3),
    });
  }
  onBurst?.();
}

function step() {
  ctx.clearRect(0, 0, innerWidth, innerHeight);

  rockets = rockets.filter((r) => {
    r.x += r.vx;
    r.y += r.vy;
    r.vy += GRAVITY * 0.6;
    ctx.fillStyle = "rgba(255,240,200,.9)";
    ctx.beginPath();
    ctx.arc(r.x, r.y, 2.4, 0, Math.PI * 2);
    ctx.fill();
    if (r.vy >= -0.5 || r.y <= r.targetY) {
      explode(r.x, r.y, r.palette, r.onBurst);
      return false;
    }
    return true;
  });

  particles = particles.filter((p) => {
    p.age++;
    if (p.kind === "spark") {
      p.vx *= 0.985;
      p.vy = p.vy * 0.985 + GRAVITY * 0.55;
    } else {
      p.vx += Math.sin((p.age + p.seed) / 18) * 0.04; // กระดาษปลิวซ้ายขวา
      p.vy = Math.min(p.vy + 0.05, 3.2);
      p.spin += p.spinSpeed;
    }
    p.x += p.vx;
    p.y += p.vy;
    const alpha = Math.max(0, 1 - p.age / p.life);
    if (alpha <= 0 || p.y > innerHeight + 40) return false;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    if (p.kind === "spark") {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.spin);
      ctx.fillRect(-p.w / 2, -p.h / 2 * Math.abs(Math.cos(p.spin * 1.7)), p.w, p.h * Math.abs(Math.cos(p.spin * 1.7)) + 1);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    return true;
  });

  if (particles.length || rockets.length) {
    requestAnimationFrame(step);
  } else {
    running = false;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
  }
}

function start() {
  if (running) return;
  running = true;
  requestAnimationFrame(step);
}

// พลุ: ยิงจากด้านล่างขึ้นไประเบิดครึ่งบนของจอ; onBurst ใช้เล่นเสียงตอนระเบิด
export function fireworks({ bursts = 5, spreadMs = 1800, palette = COLORS, onBurst } = {}) {
  if (REDUCED_MOTION) return;
  ensureCanvas();
  for (let i = 0; i < bursts; i++) {
    setTimeout(() => {
      const x = rand(innerWidth * 0.15, innerWidth * 0.85);
      rockets.push({
        x,
        y: innerHeight + 10,
        vx: rand(-0.6, 0.6),
        vy: -rand(9.5, 12.5) * Math.min(1.25, Math.max(0.7, innerHeight / 800)),
        targetY: rand(innerHeight * 0.15, innerHeight * 0.45),
        palette,
        onBurst,
      });
      start();
    }, i === 0 ? 0 : rand(0, spreadMs));
  }
}

// กระดาษสีโปรยลงจากด้านบน (เหมาะกับจอมือถือ)
export function confetti({ pieces = 120, palette = COLORS } = {}) {
  if (REDUCED_MOTION) return;
  ensureCanvas();
  for (let i = 0; i < pieces; i++) {
    particles.push({
      kind: "paper",
      x: rand(0, innerWidth),
      y: rand(-innerHeight * 0.4, -10),
      vx: rand(-1, 1),
      vy: rand(1, 3),
      life: rand(200, 300),
      age: 0,
      seed: rand(0, 100),
      color: pick(palette),
      w: rand(6, 10),
      h: rand(10, 16),
      spin: rand(0, Math.PI),
      spinSpeed: rand(-0.15, 0.15),
    });
  }
  start();
}

// ป้ายประกาศกลางจอชั่วคราว
export function banner(title, subtitle = "", { ms = 2600, small = false } = {}) {
  const el = document.createElement("div");
  el.className = `celebrate-banner${small ? " small" : ""}`;
  el.setAttribute("role", "status");
  el.innerHTML = `<div class="celebrate-title"></div>${subtitle ? '<div class="celebrate-sub"></div>' : ""}`;
  el.querySelector(".celebrate-title").textContent = title;
  if (subtitle) el.querySelector(".celebrate-sub").textContent = subtitle;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add("out"), ms);
  setTimeout(() => el.remove(), ms + 500);
}

export const MEDAL_PALETTES = {
  1: ["#FFD54A", "#FFE082", "#FFF3C4", "#FFA240", "#FFFFFF"],
  2: ["#CFD8DC", "#ECEFF1", "#B0BEC5", "#90A4AE", "#FFFFFF"],
  3: ["#E0A060", "#F0C090", "#C47A3A", "#FFD0A0", "#FFFFFF"],
};
