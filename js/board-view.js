// board-view.js
// กระดานบนหน้าจอ: วาดช่อง/บันไดส้ม (ปีน)/บันไดม่วง (ร่วง), วางตัวหมาก (รองรับหลายคนซ้อนช่อง) และเล่นแอนิเมชันการเดิน
// app.js ส่ง "เหตุการณ์การเดิน" (ทอย/เฉลย) เข้ามา แล้ว view จะพาหมากเดินทีละช่อง → ปีนบันไดส้ม/ร่วงบันไดม่วง

import { BOARD_SIZE } from "./config.js";
import { BOARD_COLS, BOARD_ROWS, cellPosition, isDrop } from "./board-config.js";
import { boardCellsHtml, boardSvgHtml } from "./board-markup.js";
import { diceFace, escapeHtml } from "./utils.js";

const REDUCED_MOTION = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const HOP_MS = REDUCED_MOTION ? 20 : 170;
const GLIDE_MS = REDUCED_MOTION ? 20 : 800;
const PAUSE_MS = REDUCED_MOTION ? 0 : 350;
const SAFE_COLOR = /^#[0-9a-f]{3,8}$/i;
const SVG_NS = "http://www.w3.org/2000/svg";

// ตำแหน่งในช่อง (สัดส่วนของขนาดช่อง) ตามจำนวนคนในช่อง; 5 คนขึ้นไปแสดง 3 คน + ป้าย +N
const SLOTS = {
  1: [[0, 0.04]],
  2: [[-0.2, 0.04], [0.2, 0.04]],
  3: [[-0.2, -0.13], [0.2, -0.13], [0, 0.22]],
  4: [[-0.2, -0.13], [0.2, -0.13], [-0.2, 0.22], [0.2, 0.22]],
};
const MAX_VISIBLE_IN_CELL = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cellCenterPct = (n) => {
  const { col, row } = cellPosition(n);
  return { x: ((col + 0.5) / BOARD_COLS) * 100, y: ((row + 0.5) / BOARD_ROWS) * 100 };
};

/* ---------- component ---------- */

// hooks: { onStep(pid), onSpecial(pid, "ladder"|"drop"), onFinish(pid) } — เรียกตามจังหวะแอนิเมชันจริงบนจอ
export function createBoardView(root, { meId = null, floatsOnlyForMe = false, hooks = {} } = {}) {
  root.classList.add("board");
  root.innerHTML = "";

  const grid = document.createElement("div");
  grid.className = "board-grid";
  grid.innerHTML = boardCellsHtml();

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${BOARD_COLS * 100} ${BOARD_ROWS * 100}`);
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = boardSvgHtml();

  const layer = document.createElement("div");
  layer.className = "board-layer";
  // รูปพื้นหลังของชุดคำถาม (ถ้ามี) อยู่ใต้ช่องทั้งหมด — ช่องจะโปร่งแสงและไม่สลับสีแถว (.has-bg)
  const bg = document.createElement("div");
  bg.className = "board-bg";
  root.append(bg, grid, svg, layer);
  let bgUrl = null;

  let me = meId;
  let players = {}; // pid -> { name, emoji, color, position, offline }
  const display = new Map(); // pid -> ตำแหน่งที่แสดงอยู่ (อาจต่างจากข้อมูลจริงระหว่างแอนิเมชัน)
  const moving = new Set();
  const chains = new Map(); // pid -> Promise ของแอนิเมชันที่ต่อคิวอยู่
  const tokens = new Map();
  const chips = new Map();
  let held = new Set();
  let pop = null;

  /* ----- popover: รายชื่อคนในช่อง ----- */
  const closePop = () => {
    pop?.remove();
    pop = null;
  };
  grid.addEventListener("click", (e) => {
    const cell = e.target.closest(".board-cell");
    closePop();
    if (!cell) return;
    const n = Number(cell.dataset.n);
    const here = [...display].filter(([, pos]) => pos === n).map(([pid]) => players[pid]).filter(Boolean);
    if (here.length < 2) return;
    const { x, y } = cellCenterPct(n);
    pop = document.createElement("div");
    pop.className = "board-pop";
    pop.style.left = `${Math.min(Math.max(x, 14), 86)}%`;
    pop.style.top = `${y}%`;
    pop.innerHTML = `<strong>ช่อง ${n} · ${here.length} คน</strong><ul>${here
      .map((p) => `<li>${escapeHtml(p.emoji || "")} ${escapeHtml(p.name)}</li>`)
      .join("")}</ul>`;
    root.appendChild(pop);
    e.stopPropagation();
  });
  document.addEventListener("click", (e) => {
    if (pop && !pop.contains(e.target)) closePop();
  });

  /* ----- layout ----- */
  function layout() {
    const groups = new Map();
    const order = Object.keys(players).sort((a, b) => (a === me ? -1 : b === me ? 1 : 0));
    for (const pid of order) {
      const pos = display.get(pid) ?? players[pid].position;
      if (!groups.has(pos)) groups.set(pos, []);
      groups.get(pos).push(pid);
    }

    for (const [pid, el] of tokens) {
      if (!players[pid]) {
        el.remove();
        tokens.delete(pid);
        display.delete(pid);
      }
    }

    grid.querySelectorAll(".board-cell").forEach((c) => {
      const count = (groups.get(Number(c.dataset.n)) || []).length;
      c.classList.toggle("crowded", count > 1);
      c.classList.toggle("occupied", count > 0);
    });

    const usedChips = new Set();
    for (const [n, pids] of groups) {
      const c = cellCenterPct(n);
      const crowded = pids.length > SLOTS[4].length;
      const slots = SLOTS[Math.min(pids.length, 4)];
      const at = ([ox, oy]) => ({ left: `${c.x + (ox * 100) / BOARD_COLS}%`, top: `${c.y + (oy * 100) / BOARD_ROWS}%` });

      pids.forEach((pid, i) => {
        const p = players[pid];
        let el = tokens.get(pid);
        if (!el) {
          el = document.createElement("div");
          el.className = "board-token glass"; // ลูกแก้วแบบเดียวกับกระดาน 3 มิติ
          layer.appendChild(el);
          tokens.set(pid, el);
        }
        el.textContent = p.emoji || String(p.name || "?").charAt(0);
        el.title = p.name;
        el.style.setProperty("--c", SAFE_COLOR.test(p.color || "") ? p.color : "#ffb300");
        Object.assign(el.style, at(slots[Math.min(i, slots.length - 1)]));
        el.classList.toggle("me", pid === me);
        el.classList.toggle("moving", moving.has(pid));
        el.classList.toggle("offline", !!p.offline);
        el.classList.toggle("hidden", crowded && i >= MAX_VISIBLE_IN_CELL && !moving.has(pid));
      });

      if (crowded) {
        usedChips.add(n);
        let chip = chips.get(n);
        if (!chip) {
          chip = document.createElement("div");
          chip.className = "board-more";
          layer.appendChild(chip);
          chips.set(n, chip);
        }
        chip.textContent = `+${pids.length - MAX_VISIBLE_IN_CELL}`;
        Object.assign(chip.style, at(SLOTS[4][3]));
      }
    }
    for (const [n, chip] of chips) {
      if (!usedChips.has(n)) {
        chip.remove();
        chips.delete(n);
      }
    }
  }

  /* ----- animation ----- */
  function float(pid, text, kind = "") {
    if (floatsOnlyForMe && pid !== me) return;
    const { x, y } = cellCenterPct(display.get(pid) ?? players[pid]?.position ?? 1);
    const el = document.createElement("div");
    el.className = `board-float ${kind}`;
    el.textContent = text;
    el.style.left = `${Math.min(Math.max(x, 8), 92)}%`;
    el.style.top = `${y - 6}%`;
    root.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }

  async function hop(pid, to) {
    let pos = display.get(pid) ?? to;
    if (pos === to) return;
    const step = to > pos ? 1 : -1;
    moving.add(pid);
    while (pos !== to) {
      pos += step;
      display.set(pid, pos);
      layout();
      hooks.onStep?.(pid);
      await sleep(HOP_MS);
    }
    moving.delete(pid);
    layout();
  }

  async function glide(pid, to) {
    const el = tokens.get(pid);
    el?.classList.add("glide");
    moving.add(pid);
    display.set(pid, to);
    layout();
    await sleep(GLIDE_MS);
    moving.delete(pid);
    el?.classList.remove("glide");
    layout();
  }

  async function play(ev) {
    const { pid } = ev;
    if (!players[pid]) return;
    if (!display.has(pid)) display.set(pid, ev.from);

    if (ev.kind === "dice") float(pid, `${diceFace(ev.roll)} ${ev.roll}`, "dice");
    else float(pid, ev.correct ? `✅ ${ev.delta >= 0 ? "+" : ""}${ev.delta}` : `❌ ${ev.delta}`, ev.correct ? "good" : "bad");
    await sleep(PAUSE_MS);
    await hop(pid, ev.landing);

    if (ev.special === "ladder") {
      float(pid, "🟠 ปีนบันได!", "ladder");
      hooks.onSpecial?.(pid, "ladder");
      await sleep(PAUSE_MS);
      await glide(pid, ev.to);
    } else if (isDrop(ev.special)) {
      float(pid, "🟣 ร่วงบันได!", "drop");
      hooks.onSpecial?.(pid, "drop");
      await sleep(PAUSE_MS);
      await glide(pid, ev.to);
    } else if (isDrop(ev.blocked)) {
      float(pid, "🛡️ ตอบถูก ไม่ร่วง", "good");
    } else if (ev.blocked === "ladder") {
      float(pid, "ตอบผิด ปีนบันไดไม่ได้", "info");
    }
    if (ev.to >= BOARD_SIZE) {
      float(pid, "🏁 เข้าเส้นชัย!", "finish");
      hooks.onFinish?.(pid);
    }
  }

  function enqueue(ev) {
    const prev = chains.get(ev.pid) || Promise.resolve();
    const next = prev
      .then(() => play(ev))
      .catch((e) => console.warn("[board] animation failed", e))
      .finally(() => {
        if (chains.get(ev.pid) === next) {
          chains.delete(ev.pid);
          syncIdle();
          layout();
        }
      });
    chains.set(ev.pid, next);
  }

  // ผู้เล่นที่ไม่มีแอนิเมชันค้าง/ไม่ถูกพักไว้ → แสดงตามตำแหน่งจริง
  function syncIdle() {
    for (const [pid, p] of Object.entries(players)) {
      if (!chains.has(pid) && !held.has(pid)) display.set(pid, p.position);
    }
  }

  return {
    // players: pid -> { name, emoji, color, position, offline }
    // events: การเดินใหม่ที่ต้องเล่นแอนิเมชัน, hold: pid ที่ยังต้องค้างตำแหน่งเดิมไว้ (มีเหตุการณ์รอเล่น)
    update(nextPlayers, { events = [], hold = new Set() } = {}) {
      players = nextPlayers || {};
      held = hold;
      // ต่อคิวแอนิเมชันก่อน เพื่อไม่ให้ syncIdle กระโดดหมากไปตำแหน่งปลายทางก่อนเดิน
      for (const ev of events) {
        if (players[ev.pid] && !display.has(ev.pid)) display.set(ev.pid, ev.from);
      }
      events.forEach(enqueue);
      for (const pid of Object.keys(players)) {
        if (!display.has(pid)) display.set(pid, players[pid].position);
      }
      syncIdle();
      layout();
    },
    // url = data URL / URL ของรูป หรือ null = ไม่มีรูป
    setBackground(url) {
      if (url === bgUrl) return;
      bgUrl = url || null;
      bg.style.backgroundImage = bgUrl ? `url("${bgUrl}")` : "";
      root.classList.toggle("has-bg", !!bgUrl);
    },
    setMe(pid) {
      me = pid;
    },
    // ไม่มีแอนิเมชันค้าง (ใช้รอให้หมากเดินจบก่อนฉลองจบเกม)
    isIdle() {
      return chains.size === 0;
    },
    reset() {
      players = {};
      display.clear();
      chains.clear();
      moving.clear();
      tokens.forEach((el) => el.remove());
      tokens.clear();
      chips.forEach((el) => el.remove());
      chips.clear();
      closePop();
    },
  };
}
