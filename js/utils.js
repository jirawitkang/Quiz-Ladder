// utils.js
// Helper ทั่วไปที่ไม่ผูกกับ DOM หรือ Firebase

import { BOARD_SIZE, MAX_NAME_LEN, PLAYER_COLORS } from "./config.js";

export function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ตัดช่องว่างซ้ำและตัดความยาวเสมอ (กันกรณี paste/แก้ DOM)
export function normalizeName(raw) {
  return String(raw || "").trim().replace(/\s+/g, " ").slice(0, MAX_NAME_LEN);
}

export function nameKey(raw) {
  return normalizeName(raw).toLowerCase();
}

export function clampPos(pos) {
  const p = Number(pos ?? 1);
  if (!Number.isFinite(p)) return 1;
  return Math.max(1, Math.min(BOARD_SIZE, Math.trunc(p)));
}

export function parseIntOr(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function randomIndex(length) {
  if (globalThis.crypto?.getRandomValues) {
    const buf = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buf);
    return buf[0] % length;
  }
  return Math.floor(Math.random() * length);
}

export function createId(prefix) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}_${globalThis.crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 14)}`;
}

export function createRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[randomIndex(chars.length)];
  return code;
}

export function pickColorAvoidDuplicate(players = {}) {
  const used = new Set(Object.values(players).map((p) => p?.color));
  const available = PLAYER_COLORS.filter((c) => !used.has(c));
  const pool = available.length ? available : PLAYER_COLORS;
  return pool[randomIndex(pool.length)];
}

export function getPathCells(from, to) {
  const cells = [];
  if (from === to) return cells;
  const step = from < to ? 1 : -1;
  for (let pos = from + step; ; pos += step) {
    if (pos >= 1 && pos <= BOARD_SIZE) cells.push(pos);
    if (pos === to) break;
  }
  return cells;
}

export function roundKey(round) {
  return `round_${round}`;
}

// คืนเลขรอบที่เรียงจากน้อยไปมาก จาก history object
export function sortedRoundNumbers(history = {}) {
  return Object.keys(history)
    .filter((k) => k.startsWith("round_"))
    .map((k) => parseInt(k.slice("round_".length), 10))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
}

export function deepClone(obj) {
  try {
    return structuredClone(obj);
  } catch {
    return JSON.parse(JSON.stringify(obj));
  }
}

export function signedText(n) {
  return n >= 0 ? `+${n}` : `${n}`;
}

export function pad2(n) {
  return String(n).padStart(2, "0");
}
