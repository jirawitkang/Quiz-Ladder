// board-markup.js
// HTML/SVG ของกระดานแบบนิ่ง (ช่อง, เส้นกั้นแถว, กรอบ, บันไดส้ม/ม่วง) — ใช้ร่วมกันระหว่างกระดานในเกม (board-view.js)
// และคลิปวิธีเล่น (intro-clip.js) ให้หน้าตาตรงกันเสมอ; ไม่มี DOM จึง import ใน node ได้

import { BOARD_SIZE } from "./config.js";
import { BOARD_COLS, BOARD_ROWS, DROPS, LADDERS, cellNumberAt, cellPosition } from "./board-config.js";

const cellCenterSvg = (n) => {
  const { col, row } = cellPosition(n);
  return { x: (col + 0.5) * 100, y: (row + 0.5) * 100 };
};

// บันได 1 อัน: from = ช่องทางเข้า (ต้องหยุดที่นี่ถึงจะปีน/ร่วง), to = ช่องปลายทาง
// บันไดสั้น 3 ขั้นวางคร่อมเส้นแบ่งระหว่าง 2 ช่อง (ไม่เกะกะกระดาน) + วงลูกศรกลางช่องทางเข้า
const RUNG_GAP = 14;
const RUNGS = 3;
const RAIL_OFFSET = 14;

function ladderSvg(from, to, kind) {
  const p = cellCenterSvg(from);
  const q = cellCenterSvg(to);
  const dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len;
  const nx = -uy * RAIL_OFFSET, ny = ux * RAIL_OFFSET;
  const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
  const half = ((RUNGS - 1) / 2) * RUNG_GAP + 10;
  const a = { x: mx - ux * half, y: my - uy * half };
  const b = { x: mx + ux * half, y: my + uy * half };
  let rungs = "";
  for (let i = 0; i < RUNGS; i++) {
    const d = (i - (RUNGS - 1) / 2) * RUNG_GAP;
    const x = mx + ux * d, y = my + uy * d;
    rungs += `<line x1="${x + nx}" y1="${y + ny}" x2="${x - nx}" y2="${y - ny}"/>`;
  }
  const up = kind === "ladder";
  const arrow = up
    ? `M${p.x - 6} ${p.y + 4} L${p.x} ${p.y - 5} L${p.x + 6} ${p.y + 4} Z`
    : `M${p.x - 6} ${p.y - 4} L${p.x} ${p.y + 5} L${p.x + 6} ${p.y - 4} Z`;
  return `<g class="ladder ${up ? "up" : "down"}" stroke-linecap="round" fill="none">
    <g class="rails" stroke-width="7"><line x1="${a.x + nx}" y1="${a.y + ny}" x2="${b.x + nx}" y2="${b.y + ny}"/><line x1="${a.x - nx}" y1="${a.y - ny}" x2="${b.x - nx}" y2="${b.y - ny}"/></g>
    <g class="rungs" stroke-width="5">${rungs}</g>
    <g class="mark"><circle cx="${p.x}" cy="${p.y}" r="13" stroke="#fff" stroke-width="3"/><path d="${arrow}" fill="#fff" stroke="none"/></g></g>`;
}

// เส้นกั้นระหว่างแถว + กรอบกระดาน: บอกทางเดินซิกแซก — ช่องที่เลี้ยวขึ้นแถวถัดไปเปิดโล่งทั้งช่อง,
// ตรงบันไดเว้นช่องแค่พอดีตัวบันได
const LADDER_GAP = 44;

function wallsSvg() {
  const crossings = new Set(
    [...Object.entries(LADDERS), ...Object.entries(DROPS)].map(([a, b]) => {
      const pa = cellPosition(Number(a));
      const pb = cellPosition(b);
      return `${Math.max(pa.row, pb.row)}:${pa.col}`; // เส้นแบ่งเหนือแถว (row นับจากบน) ที่บันไดพาดผ่าน
    })
  );
  const W = BOARD_COLS * 100;
  let out = "";
  for (let row = 1; row < BOARD_ROWS; row++) {
    const y = row * 100;
    // ช่องสุดท้ายของแถวล่าง (เลขมากสุด) คือจุดที่เดินขึ้นไปแถวบน
    const lastBelow = Math.max(cellNumberAt(0, row), cellNumberAt(BOARD_COLS - 1, row));
    const turnCol = cellPosition(lastBelow).col;
    const gaps = [];
    for (let col = 0; col < BOARD_COLS; col++) {
      if (col === turnCol) gaps.push([col * 100, col * 100 + 100]);
      else if (crossings.has(`${row}:${col}`)) gaps.push([col * 100 + 50 - LADDER_GAP / 2, col * 100 + 50 + LADDER_GAP / 2]);
    }
    let x = 0;
    for (const [g0, g1] of gaps) {
      if (g0 - x > 4) out += `<line x1="${x}" y1="${y}" x2="${g0}" y2="${y}"/>`;
      x = g1;
    }
    if (W - x > 4) out += `<line x1="${x}" y1="${y}" x2="${W}" y2="${y}"/>`;
  }
  return `<g class="walls" stroke-width="4" stroke-linecap="round">${out}</g>
    <rect class="frame" x="2" y="2" width="${W - 4}" height="${BOARD_ROWS * 100 - 4}" rx="12" fill="none" stroke-width="4"/>`;
}

// ช่องทั้ง 30 เรียงตามแถวบน → ล่าง (ใส่ใน .board-grid)
export function boardCellsHtml() {
  let html = "";
  for (let row = 0; row < BOARD_ROWS; row++) {
    for (let col = 0; col < BOARD_COLS; col++) {
      const n = cellNumberAt(col, row);
      // สลับสีทีละแถว (แนวนอน) ให้มองตามทางเดินซิกแซกได้ง่าย
      const cls = `board-cell ${row % 2 ? "alt" : ""}${n === 1 ? " start" : ""}${n === BOARD_SIZE ? " finish" : ""}`;
      html +=
        `<div class="${cls}" data-n="${n}"><span class="cell-num">${n}</span>` +
        (n === 1 ? '<span class="cell-tag">START</span>' : "") +
        (n === BOARD_SIZE ? '<span class="cell-flag" aria-hidden="true">🏁</span><span class="cell-tag">FINISH</span>' : "") +
        "</div>";
    }
  }
  return html;
}

// เส้นกั้นแถว + กรอบ + บันได (ใส่ใน <svg viewBox="0 0 600 500">)
export function boardSvgHtml() {
  return (
    wallsSvg() +
    Object.entries(LADDERS).map(([f, t]) => ladderSvg(Number(f), t, "ladder")).join("") +
    Object.entries(DROPS).map(([f, t]) => ladderSvg(Number(f), t, "drop")).join("")
  );
}
