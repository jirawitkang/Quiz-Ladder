// dice.js
// Dice overlay + 3D dice engine
// สุ่มแต้มด้วย crypto ก่อน แล้วค่อยหมุนลูกเต๋าไปหยุดที่ท่าที่ "หน้าบนสุดที่มองเห็น" ตรงกับแต้มนั้น

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

const raf = () => new Promise((r) => requestAnimationFrame(r));
const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const rotate = ({ x, y, z }) => `rotateX(${x}deg) rotateY(${y}deg) rotateZ(${z}deg)`;
const easeOutPow = (t, p = 3.2) => 1 - Math.pow(1 - t, p);

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

function waitTransformEnd(el, timeoutMs) {
  return new Promise((resolve) => {
    const done = () => {
      el.removeEventListener("transitionend", onEnd);
      clearTimeout(timer);
      resolve();
    };
    const onEnd = (e) => {
      if (e.target === el && e.propertyName === "transform") done();
    };
    el.addEventListener("transitionend", onEnd);
    const timer = setTimeout(done, timeoutMs);
  });
}

function cancelAnimations(el) {
  try {
    el.getAnimations().forEach((a) => a.cancel());
  } catch {}
  el.style.transition = "none";
}

// องศาที่เทียบเท่า target แต่ใกล้ current ที่สุด (กันหมุนกลับหลายรอบตอน settle)
function nearestEquivalentDeg(current, target) {
  return target + 360 * Math.round(((Number(current) || 0) - target) / 360);
}

export function createDiceController({
  diceOverlayEl,
  dice3dEl,
  diceHintEl,
  diceRollHintEl,
  rollDiceBtn,
  closeDiceOverlayBtn,
  onClose,
} = {}) {
  let state = "hidden"; // "hidden" | "waiting" | "rolling" | "committing" | "done"
  let posesByTopValue = null;

  const show = (el, display) => el && (el.style.display = display);

  function getState() {
    return state;
  }

  function setState(next, { roll = null, hint = null } = {}) {
    state = next;
    if (!diceOverlayEl) return;

    if (next === "hidden") {
      show(diceOverlayEl, "none");
      show(closeDiceOverlayBtn, "none");
      show(rollDiceBtn, "none");
      diceRollHintEl?.classList.remove("show");
      return;
    }

    show(diceOverlayEl, "flex");

    if (diceHintEl) {
      if (hint != null) diceHintEl.textContent = hint;
      else if (next === "rolling") diceHintEl.textContent = "ลูกเต๋ากำลังกลิ้ง…";
      else if (next === "committing") diceHintEl.textContent = `ได้แต้ม: ${roll ?? "-"} (กำลังบันทึกผล…)`;
      else if (next === "done") diceHintEl.textContent = roll != null ? `ได้แต้ม: ${roll}` : "เสร็จแล้ว";
    }

    diceRollHintEl?.classList.toggle("show", next === "waiting");

    if (rollDiceBtn) {
      show(rollDiceBtn, next === "done" ? "none" : "block");
      rollDiceBtn.disabled = next !== "waiting";
    }
    if (closeDiceOverlayBtn) {
      show(closeDiceOverlayBtn, next === "done" ? "inline-flex" : "none");
      closeDiceOverlayBtn.disabled = false;
    }
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

  // สร้างตาราง แต้ม → ท่าหมุน (64 ท่า) ครั้งเดียว
  // getBoundingClientRect บังคับ layout แบบ synchronous จึงไม่ต้องรอเฟรม (เดิมใช้ ~1 วินาที)
  function buildPoseMap() {
    const map = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    const A = [0, 90, 180, 270];
    const prev = { transition: dice3dEl.style.transition, transform: dice3dEl.style.transform };

    dice3dEl.style.transition = "none";
    for (const x of A) {
      for (const y of A) {
        for (const z of A) {
          dice3dEl.style.transform = rotate({ x, y, z });
          const top = getTopVisibleValue();
          if (map[top]) map[top].push({ x, y, z });
        }
      }
    }
    dice3dEl.style.transform = prev.transform;
    dice3dEl.style.transition = prev.transition;

    log("pose map", Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v.length])));
    return map;
  }

  async function animateRoll(pick, rollMs) {
    cancelAnimations(dice3dEl);
    dice3dEl.getBoundingClientRect();

    const start = { x: randInt(-18, 18), y: randInt(0, 359), z: randInt(-18, 18) };
    const end = {
      x: pick.x + 360 * randInt(1, 3),
      y: pick.y + 360 * randInt(2, 4),
      z: pick.z + 360 * randInt(1, 3),
    };

    const frames = [0, 0.22, 0.48, 0.72, 0.88, 1].map((offset) => {
      const f = easeOutPow(offset);
      return {
        offset,
        transform: rotate({
          x: start.x + (end.x - start.x) * f,
          y: start.y + (end.y - start.y) * f,
          z: start.z + (end.z - start.z) * f,
        }),
      };
    });

    await dice3dEl.animate(frames, { duration: rollMs, easing: "linear", fill: "forwards" }).finished;

    cancelAnimations(dice3dEl);
    dice3dEl.style.transform = rotate(end);
    return end;
  }

  async function settle(pick, settleMs, endAbs) {
    const target = {
      x: nearestEquivalentDeg(endAbs.x, pick.x),
      y: nearestEquivalentDeg(endAbs.y, pick.y),
      z: nearestEquivalentDeg(endAbs.z, pick.z),
    };
    if (settleMs > 0) {
      dice3dEl.style.transition = `transform ${settleMs}ms cubic-bezier(.18,.92,.22,1)`;
      dice3dEl.style.transform = rotate(target);
      await waitTransformEnd(dice3dEl, settleMs + 120);
    }
    dice3dEl.style.transition = "none";
    dice3dEl.style.transform = rotate(pick);
    await raf();
  }

  async function rollWithOverlay(durationMs = 5000) {
    const finalRoll = secureRandomInt(1, 6);
    if (!diceOverlayEl || !dice3dEl) return finalRoll;

    setState("rolling");
    await raf();

    posesByTopValue = posesByTopValue || buildPoseMap();
    const candidates = posesByTopValue[finalRoll];
    const pick = candidates.length ? candidates[randInt(0, candidates.length - 1)] : { x: 0, y: 0, z: 0 };

    const rollMs = Math.max(2000, Math.floor(durationMs * 0.94));
    const settleMs = Math.max(80, durationMs - rollMs);

    const end = await animateRoll(pick, rollMs);
    await settle(pick, settleMs, end);

    const seenTop = getTopVisibleValue();
    if (seenTop != null && seenTop !== finalRoll) console.warn("[DICE] face mismatch", { finalRoll, seenTop, pick });

    return finalRoll;
  }

  closeDiceOverlayBtn?.addEventListener("click", () => {
    setState("hidden");
    onClose?.();
  });

  return { getState, setState, rollWithOverlay };
}
