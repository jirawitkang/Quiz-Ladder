// board-config.js
// กระดาน Quiz Ladder: ขนาด, ตำแหน่งบันไดส้ม (ปีนขึ้น) / บันไดม่วง (ร่วงลง) และกติกาว่าการเดินแบบไหนปีน/ร่วงได้
// ไม่มี DOM — ใช้ได้ทั้งใน game-logic (node test) และ board-view

import { BOARD_SIZE } from "./config.js";

export const BOARD_COLS = 6;
export const BOARD_ROWS = 5; // BOARD_COLS * BOARD_ROWS ต้องเท่ากับ BOARD_SIZE

// บันไดตั้งตรงข้ามแถวเดียว ไม่ทับกัน และระยะสั้น (3–5 ช่อง) ให้เกมยาวพอได้ตอบคำถามหลายข้อ
// บันไดส้ม: ช่องล่าง → ช่องบน (หยุดที่ปลายล่าง = ปีนขึ้น)
export const LADDERS = Object.freeze({ 4: 9, 10: 15, 22: 27 });
// บันไดม่วง: ช่องบน → ช่องล่าง (หยุดที่ปลายบน = ร่วงลง) — แทนงูของเกมบันไดงูเดิม
export const DROPS = Object.freeze({ 14: 11, 21: 16, 26: 23 });

export const MOVE = Object.freeze({
  DICE: "dice", // ปีนได้ ร่วงได้
  CORRECT: "correct", // ปีนได้ ไม่ร่วง (ไม่ลงโทษคนตอบถูก)
  WRONG: "wrong", // ร่วงได้ ไม่ปีน (กันการจงใจตอบผิด)
});

// คืนผลของการหยุดที่ช่อง landing
// special/blocked = "ladder" (ส้ม ปีน) | "drop" (ม่วง ร่วง) — ผลเก่าก่อนเปลี่ยนกระดานอาจเป็น "snake" (= drop)
export function resolveLanding(landing, mode) {
  const ladderTop = LADDERS[landing];
  const dropBottom = DROPS[landing];

  if (ladderTop) {
    return mode === MOVE.WRONG
      ? { to: landing, special: null, blocked: "ladder" }
      : { to: ladderTop, special: "ladder", blocked: null };
  }
  if (dropBottom) {
    return mode === MOVE.CORRECT
      ? { to: landing, special: null, blocked: "drop" }
      : { to: dropBottom, special: "drop", blocked: null };
  }
  return { to: landing, special: null, blocked: null };
}

// ช่อง 1 อยู่ซ้ายล่าง เดินไปทางขวา แล้วขึ้นแถวถัดไปและเดินกลับ (ซิกแซก)
// row นับจากบนลงล่าง (0 = แถวบนสุด)
export function cellPosition(n) {
  const r = Math.floor((n - 1) / BOARD_COLS);
  const i = (n - 1) % BOARD_COLS;
  return { col: r % 2 === 0 ? i : BOARD_COLS - 1 - i, row: BOARD_ROWS - 1 - r };
}

export function cellNumberAt(col, row) {
  const r = BOARD_ROWS - 1 - row;
  return r * BOARD_COLS + (r % 2 === 0 ? col : BOARD_COLS - 1 - col) + 1;
}

if (BOARD_COLS * BOARD_ROWS !== BOARD_SIZE) {
  throw new Error(`board-config: ${BOARD_COLS}x${BOARD_ROWS} does not match BOARD_SIZE ${BOARD_SIZE}`);
}

// ผลในประวัติ: บันไดม่วง (ใหม่ "drop" / เก่า "snake")
export const isDrop = (special) => special === "drop" || special === "snake";
