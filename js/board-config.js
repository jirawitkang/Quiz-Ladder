// board-config.js
// กระดานบันไดงู: ขนาด, ตำแหน่งบันได/งู และกติกาว่าการเดินแบบไหนขึ้นบันได/ตกงูได้
// ไม่มี DOM — ใช้ได้ทั้งใน game-logic (node test) และ board-view

import { BOARD_SIZE } from "./config.js";

export const BOARD_COLS = 6;
export const BOARD_ROWS = 5; // BOARD_COLS * BOARD_ROWS ต้องเท่ากับ BOARD_SIZE

// เชิงบันได → ปลายบันได
export const LADDERS = Object.freeze({ 3: 12, 9: 18, 16: 25 });
// หัวงู → หางงู
export const SNAKES = Object.freeze({ 14: 5, 21: 11, 27: 19 });

export const MOVE = Object.freeze({
  DICE: "dice", // ขึ้นบันไดได้ ตกงูได้
  CORRECT: "correct", // ขึ้นบันไดได้ ไม่ตกงู (ไม่ลงโทษคนตอบถูก)
  WRONG: "wrong", // ตกงูได้ ไม่ขึ้นบันได (กันการจงใจตอบผิด)
});

// คืนผลของการหยุดที่ช่อง landing
// special = บันได/งูที่ทำงาน, blocked = บันได/งูที่ช่องนี้แต่กติกาไม่ให้ทำงาน
export function resolveLanding(landing, mode) {
  const ladderTop = LADDERS[landing];
  const snakeTail = SNAKES[landing];

  if (ladderTop) {
    return mode === MOVE.WRONG
      ? { to: landing, special: null, blocked: "ladder" }
      : { to: ladderTop, special: "ladder", blocked: null };
  }
  if (snakeTail) {
    return mode === MOVE.CORRECT
      ? { to: landing, special: null, blocked: "snake" }
      : { to: snakeTail, special: "snake", blocked: null };
  }
  return { to: landing, special: null, blocked: null };
}

// ช่อง 1 อยู่ซ้ายล่าง เดินไปทางขวา แล้วขึ้นแถวถัดไปและเดินกลับ (แบบงูเลื้อย)
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
