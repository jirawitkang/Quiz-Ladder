// dice.js
// ลูกเต๋า 3D: รอที่จุดวาง (#diceDock) → ผู้เล่นแตะ → ถูกโยนไปกลางกระดาน กระดอนเบาลงทีละครั้ง กลิ้ง แล้วหยุดที่แต้มที่สุ่มไว้
//
// แนวคิดให้ดูสมจริง:
// - แยกการเคลื่อนที่เป็น "ตำแหน่งบนพื้น" (เคลื่อนช้าลงทุกครั้งที่กระทบ) + "ความสูง" (พาราโบลา สูงลด ~35% ต่อครั้ง)
// - เงาบนพื้นเล็ก/จางลงเมื่อลอยสูง และลูกเต๋าใหญ่ขึ้นเล็กน้อยตอนอยู่สูง → ตารับรู้ความสูงจากจอ 2D ได้
// - ความเร็วหมุนลดลงเป็นขั้นทุกครั้งที่กระทบพื้น ช่วงท้ายกลิ้งช้าลงจนหยุดที่หน้าที่ต้องการ
// - ยุบตัวเล็กน้อยตอนกระทบ + เสียงกระทบดังตามความแรง
// คำนวณเส้นทางทั้งหมดล่วงหน้าจากแต้มที่บันทึกแล้ว จึงหยุดตรงกลางและหงายหน้าถูกต้องทุกครั้ง

import { DEBUG } from "./config.js";

const log = (...args) => DEBUG && console.log("[DICE]", ...args);

// หน้า (class ใน index.html) → แต้ม
const FACE_CLASS_TO_VALUE = {
  "face-1": 5, // FRONT
  "face-2": 4, // RIGHT
  "face-3": 1, // TOP
  "face-4": 6, // BOTTOM
  "face-5": 3, // LEFT
  "face-6": 2, // BACK
};

const REDUCED_MOTION = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// สัดส่วนเวลา (ของเวลาทอยทั้งหมด) และรูปแบบการกระดอน
const WINDUP_MS = 160; // ยกลูกเต๋าขึ้นก่อนโยน
const ROLL_SHARE = 0.32; // ช่วงกลิ้งบนพื้นหลังกระดอนครั้งสุดท้าย
const REST_SHARE = 0.17; // หยุดนิ่งให้เห็นแต้มก่อนจบ
const BOUNCE_HEIGHT_RATIO = 0.35; // แต่ละครั้งสูงเหลือ 35% ของครั้งก่อน
const BOUNCES = 4;
const GROUND_SHARE = [0.5, 0.25, 0.12, 0.06]; // ระยะทางบนพื้นที่ไปได้ในแต่ละช่วงลอย (ที่เหลือคือช่วงกลิ้ง)
const SPIN_KEEP_ON_IMPACT = 0.6; // ความเร็วหมุนที่เหลือหลังกระทบพื้นแต่ละครั้ง
const END_SCALE = 1.45; // ขนาดตอนหยุดกลางกระดาน (เทียบกับตอนอยู่ที่จุดวาง)
// ตำแหน่งที่ลูกเต๋าแตะพื้นบนจอ (วัดจากมุมกล้อง .dice-cam): หน้าบนอยู่ที่ −0.39×ขนาด → หน้าล่าง/จุดแตะพื้นอยู่ที่ +0.39×ขนาด
// ฐานที่แตะพื้นกว้าง ~1.45×ขนาด สูง ~0.8×ขนาด (สี่เหลี่ยมที่เห็นเฉียง) — เงาใช้ขนาดนี้ (ตั้งใน CSS .dice-shadow)
const CONTACT_Y_RATIO = 0.39;
// กึ่งกลางเงา: ขอบล่างลูกเต๋าอยู่ที่ +0.845×ขนาด, เงาสูง 0.72×ขนาด → 0.493 ทำให้เงา ~2% โผล่ต่ำกว่าขอบล่างลูกเต๋า
// (ทุก ๆ 1% ≈ 0.0072; ต่ำกว่านี้มากลูกเต๋าจะดูเหมือนลอยอยู่เหนือพื้น)
const SHADOW_Y_RATIO = 0.493;

const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const rand = (a, b) => a + Math.random() * (b - a);
const rotate = ({ x, y, z }) => `rotateX(${x}deg) rotateY(${y}deg) rotateZ(${z}deg)`;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const clamp01 = (t) => Math.max(0, Math.min(1, t));

// สุ่มแต้มลูกเต๋า 1–6 (แยกจากแอนิเมชัน เพื่อบันทึกผลได้ทันทีแม้ผู้ใช้สลับแท็บ)
export function rollDie() {
  return secureRandomInt(1, 6);
}

function secureRandomInt(min, max) {
  const range = max - min + 1;
  if (globalThis.crypto?.getRandomValues) {
    // rejection sampling กัน modulo bias
    const maxValid = Math.floor(256 / range) * range - 1;
    const buf = new Uint8Array(1);
    do globalThis.crypto.getRandomValues(buf);
    while (buf[0] > maxValid);
    return min + (buf[0] % range);
  }
  return min + Math.floor(Math.random() * range);
}

// เล่นแอนิเมชันตามเวลาจริง: ถ้าแท็บถูกพักแล้วกลับมาเกินเวลา จะกระโดดไปเฟรมสุดท้ายทันที
function animateFor(durationMs, frame) {
  return new Promise((resolve) => {
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(durationMs, now - start);
      frame(t);
      if (t >= durationMs) resolve();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

const rectCenter = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/* ---------- throw planning ---------- */

// คำนวณเส้นทางทั้งหมดของการโยนจาก from → to ภายในเวลา durationMs
function planThrow(from, to, durationMs, startRot, endRot) {
  const rollMs = durationMs * ROLL_SHARE;
  const restMs = durationMs * REST_SHARE;
  const flightMs = Math.max(600, durationMs - WINDUP_MS - rollMs - restMs);

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;

  // ช่วงลอย: เวลาของแต่ละครั้ง ∝ √ความสูง
  const timeRatios = Array.from({ length: BOUNCES }, (_, k) => Math.sqrt(Math.pow(BOUNCE_HEIGHT_RATIO, k)));
  const ratioSum = timeRatios.reduce((a, b) => a + b, 0);
  const firstHeight = Math.max(110, Math.min(260, len * 0.45));

  // จุดกระทบพื้น: เดินหน้าตามสัดส่วน + เบี่ยงซ้าย/ขวาสลับกันและน้อยลงเรื่อย ๆ
  const side = Math.random() < 0.5 ? -1 : 1;
  let u = 0;
  let t = WINDUP_MS;
  let prev = { ...from };
  const arcs = [];
  for (let k = 0; k < BOUNCES; k++) {
    u += GROUND_SHARE[k];
    const wobble = len * [0.08, 0.05, 0.03, 0.015][k] * side * (k % 2 ? -1 : 1) * rand(0.6, 1);
    const land = { x: from.x + dx * u + nx * wobble, y: from.y + dy * u + ny * wobble };
    const dur = (flightMs * timeRatios[k]) / ratioSum;
    arcs.push({ start: t, end: t + dur, from: prev, to: land, height: firstHeight * Math.pow(BOUNCE_HEIGHT_RATIO, k), u0: u - GROUND_SHARE[k], u1: u });
    prev = land;
    t += dur;
  }
  const roll = { start: t, end: t + rollMs, from: prev, to, u0: u, u1: 1 };
  const total = durationMs;

  // ความเร็วหมุน: คงที่ในแต่ละช่วงลอย ลดลงทุกครั้งที่กระทบ แล้วลดเป็นศูนย์ตอนกลิ้ง
  const omegas = arcs.map((_, k) => Math.pow(SPIN_KEEP_ON_IMPACT, k));
  const rollOmega = Math.pow(SPIN_KEEP_ON_IMPACT, BOUNCES);
  const spinArea = arcs.reduce((sum, a, k) => sum + omegas[k] * (a.end - a.start), 0) + (rollOmega * rollMs) / 2;

  function spinProgress(time) {
    let acc = 0;
    for (let k = 0; k < arcs.length; k++) {
      const a = arcs[k];
      if (time <= a.start) return acc / spinArea;
      acc += omegas[k] * (Math.min(time, a.end) - a.start);
      if (time < a.end) return acc / spinArea;
    }
    const r = Math.min(time, roll.end) - roll.start;
    acc += rollOmega * (r - (r * r) / (2 * rollMs)); // ความเร็วลดเชิงเส้นเป็นศูนย์
    return Math.min(1, acc / spinArea);
  }

  function at(time) {
    if (time < WINDUP_MS) {
      const s = time / WINDUP_MS;
      return { ground: from, z: 14 * Math.sin((s * Math.PI) / 2), u: 0, phase: "windup" };
    }
    for (const a of arcs) {
      if (time < a.end) {
        const s = (time - a.start) / (a.end - a.start); // ลอยด้วยความเร็วแนวนอนคงที่
        return {
          ground: { x: a.from.x + (a.to.x - a.from.x) * s, y: a.from.y + (a.to.y - a.from.y) * s },
          z: 4 * a.height * s * (1 - s),
          u: a.u0 + (a.u1 - a.u0) * s,
          phase: "air",
        };
      }
    }
    if (time < roll.end) {
      const s = easeOutCubic((time - roll.start) / rollMs);
      return {
        ground: { x: roll.from.x + (roll.to.x - roll.from.x) * s, y: roll.from.y + (roll.to.y - roll.from.y) * s },
        z: 0,
        u: roll.u0 + (roll.u1 - roll.u0) * s,
        phase: "roll",
      };
    }
    return { ground: to, z: 0, u: 1, phase: "rest" };
  }

  const impacts = arcs.map((a, k) => ({ time: a.end, strength: Math.sqrt(Math.pow(BOUNCE_HEIGHT_RATIO, k)) }));
  const rotAt = (time) => {
    const p = spinProgress(time);
    return {
      x: startRot.x + (endRot.x - startRot.x) * p,
      y: startRot.y + (endRot.y - startRot.y) * p,
      z: startRot.z + (endRot.z - startRot.z) * p,
    };
  };
  return { total, at, rotAt, impacts, rollStart: roll.start, rollEnd: roll.end };
}

export { planThrow as _planThrowForTest };

// มุมปลายทาง = ท่าที่ได้แต้มนั้น และหมุนอย่างน้อย turns รอบในทิศ dir (+1 = ค่ามุมเพิ่ม, -1 = ค่ามุมลด)
export function spinTarget(start, target, turns, dir) {
  return dir >= 0
    ? target + 360 * Math.ceil((start + 360 * turns - target) / 360)
    : target + 360 * Math.floor((start - 360 * turns - target) / 360);
}

// ทิศการหมุนให้สอดคล้องกับทิศที่ลูกเต๋าวิ่ง: ไปทางซ้าย = ทวนเข็มนาฬิกา (มุมลด), ไปทางขวา = ตามเข็มนาฬิกา
// (rotateZ ติดลบ = ทวนเข็มนาฬิกาบนจอ เพราะกล้อง .dice-cam ยังมองจากด้านบนค่อนหน้า)
export function spinDirection(from, to) {
  const dx = to.x - from.x;
  return dx > 12 ? 1 : -1;
}

/* ---------- controller ---------- */

export function createDiceController({
  diceOverlayEl,
  dice3dEl,
  diceRollHintEl,
  rollDiceBtn,
  getDockRect = () => null, // จุดวางลูกเต๋า (viewport rect)
  getTargetRect = () => null, // กระดาน (ลูกเต๋าไปหยุดกลางกระดาน)
  sound = {}, // { hit(strength), tick(strength) }
} = {}) {
  const mover = diceOverlayEl?.querySelector(".dice-mover");
  const lift = diceOverlayEl?.querySelector(".dice-lift");
  const shadow = diceOverlayEl?.querySelector(".dice-shadow");

  let state = "hidden"; // "hidden" | "waiting" | "rolling" | "done"
  let posesByTopValue = null;
  let rot = { x: -8, y: 12, z: 0 };
  // ground = กึ่งกลางลูกเต๋าตอนวางบนพื้น, z = ความสูงจากพื้น, base = ขนาดตามระยะทาง (ไม่รวมผลความสูง)
  const pose = { ground: { x: 0, y: 0 }, z: 0, base: 1, scale: 1, sx: 1, sy: 1 };
  const diceSize = () => parseFloat(getComputedStyle(diceOverlayEl).getPropertyValue("--dice-size")) || 84;

  function applyPose() {
    if (!mover) return;
    const { ground, z, base, scale, sx, sy } = pose;
    const contact = CONTACT_Y_RATIO * diceSize();
    mover.style.transform = `translate(${ground.x}px, ${ground.y}px)`;
    // ตอนยุบตัวกระแทกพื้น ขยับลงชดเชย ให้ฐานลูกเต๋ายังแตะพื้นอยู่
    const squashDrop = contact * scale * (1 - sy);
    lift.style.transform = `translateY(${-z + squashDrop}px) scale(${scale * sx}, ${scale * sy})`;
    // เงาอยู่บนพื้นใต้จุดแตะพื้นเสมอ (ไม่ลอยตามลูกเต๋า) แสงจากซ้ายบน: ยิ่งลอยสูง เงายิ่งเล็ก จาง และเลื่อนไปขวาล่างเล็กน้อย
    const h = Math.min(z, 320);
    shadow.style.transform = `translate(calc(-50% + ${h * 0.12}px), calc(-50% + ${SHADOW_Y_RATIO * diceSize() * base + h * 0.08}px)) scale(${base * (1 - h / 520)})`;
    shadow.style.opacity = String(0.08 + 0.34 * (1 - h / 380));
    dice3dEl.style.transform = rotate(rot);
  }

  function placeAtDock() {
    const r = getDockRect();
    pose.ground = r ? rectCenter(r) : { x: innerWidth - 90, y: innerHeight - 110 };
    pose.z = 0;
    pose.base = 1;
    pose.scale = 1;
    pose.sx = pose.sy = 1;
    applyPose();
  }

  const onViewportChange = () => {
    if (state === "waiting") placeAtDock();
  };
  addEventListener("resize", onViewportChange);
  addEventListener("scroll", onViewportChange, { passive: true, capture: true });

  function getState() {
    return state;
  }

  function setState(next) {
    state = next;
    if (!diceOverlayEl) return;
    diceOverlayEl.hidden = next === "hidden";
    diceRollHintEl?.classList.toggle("show", next === "waiting");
    if (rollDiceBtn) {
      rollDiceBtn.disabled = next !== "waiting";
      rollDiceBtn.hidden = next === "rolling" || next === "done";
    }
    if (next === "waiting") placeAtDock();
  }

  // หาแต้มของหน้าที่อยู่ "สูงสุดบนจอ" (ขึ้นกับมุมกล้องใน CSS .dice-cam)
  function getTopVisibleValue() {
    let best = { y: Infinity, value: null };
    dice3dEl?.querySelectorAll(".face").forEach((el) => {
      const rect = el.getBoundingClientRect();
      const cy = rect.top + rect.height / 2;
      const cls = [...el.classList].find((c) => c in FACE_CLASS_TO_VALUE);
      if (cls && cy < best.y) best = { y: cy, value: FACE_CLASS_TO_VALUE[cls] };
    });
    return best.value;
  }

  // ตาราง แต้ม → ท่าหมุน (64 ท่า) สร้างครั้งเดียว; getBoundingClientRect บังคับ layout ทันทีจึงไม่ต้องรอเฟรม
  function buildPoseMap() {
    const map = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    const A = [0, 90, 180, 270];
    const prev = dice3dEl.style.transform;
    for (const x of A) {
      for (const y of A) {
        for (const z of A) {
          dice3dEl.style.transform = rotate({ x, y, z });
          const top = getTopVisibleValue();
          if (map[top]) map[top].push({ x, y, z });
        }
      }
    }
    dice3dEl.style.transform = prev;
    log("pose map", Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v.length])));
    return map;
  }

  async function rollWithOverlay(durationMs = 5000, presetRoll = null) {
    const finalRoll = presetRoll ?? secureRandomInt(1, 6);
    if (!diceOverlayEl || !dice3dEl || !mover) return finalRoll;

    if (state === "hidden") setState("waiting"); // ให้มีตำแหน่งเริ่มที่จุดวาง
    setState("rolling");

    posesByTopValue = posesByTopValue || buildPoseMap();
    const candidates = posesByTopValue[finalRoll];
    const pick = candidates.length ? candidates[randInt(0, candidates.length - 1)] : { x: 0, y: 0, z: 0 };

    const from = { ...pose.ground };
    const target = getTargetRect();
    const to = target ? rectCenter(target) : { x: innerWidth / 2, y: innerHeight / 2 };

    if (REDUCED_MOTION) {
      rot = { ...pick };
      Object.assign(pose, { ground: to, z: 0, base: END_SCALE, scale: END_SCALE, sx: 1, sy: 1 });
      applyPose();
      sound.hit?.(0.6);
      return finalRoll;
    }

    const startRot = { ...rot };
    const dir = spinDirection(from, to);
    const endRot = {
      x: spinTarget(startRot.x, pick.x, randInt(5, 7), dir),
      y: spinTarget(startRot.y, pick.y, randInt(3, 5), dir),
      z: spinTarget(startRot.z, pick.z, randInt(1, 3), dir),
    };
    const plan = planThrow(from, to, durationMs, startRot, endRot);

    let nextImpact = 0;
    let lastTickStep = null;
    await animateFor(plan.total, (t) => {
      const p = plan.at(t);
      rot = plan.rotAt(t);

      // ยุบตัวสั้น ๆ หลังกระทบพื้น (แรงตามความสูงที่ตกลงมา)
      let squash = 0;
      for (const imp of plan.impacts) {
        const since = t - imp.time;
        if (since >= 0 && since < 110) squash = Math.max(squash, 0.13 * imp.strength * (1 - since / 110));
      }
      while (nextImpact < plan.impacts.length && t >= plan.impacts[nextImpact].time) {
        sound.hit?.(plan.impacts[nextImpact].strength);
        nextImpact++;
      }

      // ช่วงกลิ้ง: เสียงแก๊กทุกครั้งที่พลิกไป 90°
      if (p.phase === "roll") {
        const step = Math.floor(rot.x / 90);
        if (lastTickStep !== null && step !== lastTickStep) {
          sound.tick?.(0.5 * (1 - (t - plan.rollStart) / (plan.rollEnd - plan.rollStart)) + 0.1);
        }
        lastTickStep = step;
      }

      pose.ground = p.ground;
      pose.z = p.z;
      pose.base = 1 + (END_SCALE - 1) * clamp01(p.u);
      pose.scale = pose.base * (1 + p.z / 700); // ใกล้กล้องขึ้นเล็กน้อยตอนลอย
      pose.sx = 1 + squash * 0.7;
      pose.sy = 1 - squash;
      applyPose();
    });

    rot = { ...pick };
    Object.assign(pose, { ground: to, z: 0, base: END_SCALE, scale: END_SCALE, sx: 1, sy: 1 });
    applyPose();

    const seenTop = getTopVisibleValue();
    if (seenTop != null && seenTop !== finalRoll) console.warn("[DICE] face mismatch", { finalRoll, seenTop, pick });
    return finalRoll;
  }

  return { getState, setState, rollWithOverlay };
}
