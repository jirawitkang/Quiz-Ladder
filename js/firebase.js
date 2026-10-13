// firebase.js
// เชื่อมต่อ Firebase Realtime Database + นาฬิกาที่ sync กับ server

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  get,
  remove,
  query,
  orderByChild,
  endAt,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { FIREBASE_CONFIG } from "./config.js";

export {
  ref,
  get,
  set,
  update,
  remove,
  onValue,
  runTransaction,
  onDisconnect,
  serverTimestamp,
  query,
  orderByChild,
  endAt,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

export const db = getDatabase(initializeApp(FIREBASE_CONFIG));

export const roomRef = (code) => ref(db, `rooms/${code}`);
export const playerRef = (code, pid) => ref(db, `rooms/${code}/players/${pid}`);

// ทุกเครื่องใช้เวลาเดียวกัน (เวลา server) — กันนาฬิกาเครื่องผู้เล่นเพี้ยนแล้วตัดเวลาตอบผิด
let serverTimeOffset = 0;
onValue(ref(db, ".info/serverTimeOffset"), (snap) => {
  serverTimeOffset = Number(snap.val()) || 0;
});

export function serverNow() {
  return Date.now() + serverTimeOffset;
}

export function onConnectionChange(callback) {
  return onValue(ref(db, ".info/connected"), (snap) => callback(snap.val() === true));
}

// ลบห้องที่สร้างไว้นานเกิน maxAgeMs (รวมห้องเสียที่ไม่มี createdAt) — คืนรายชื่อห้องที่ลบ
// Firebase แบบฟรีไม่มีการลบตามเวลาให้ จึงให้เครื่อง Host ทำตอนสร้างห้องใหม่
export async function cleanupOldRooms(maxAgeMs, keepCode = null) {
  const cutoff = serverNow() - maxAgeMs;
  const old = (await findOldRoomCodes(cutoff)).filter((code) => code !== keepCode);
  await Promise.all(old.map((code) => remove(roomRef(code))));
  return old;
}

async function findOldRoomCodes(cutoff) {
  try {
    // เร็วสุดถ้าตั้ง ".indexOn": "createdAt" ที่ /rooms ใน Firebase rules
    const snap = await get(query(ref(db, "rooms"), orderByChild("createdAt"), endAt(cutoff)));
    const codes = [];
    snap.forEach((child) => {
      codes.push(child.key);
    });
    return codes;
  } catch (e) {
    if (!/index/i.test(String(e?.message))) throw e;
  }
  // ไม่มี index: ใช้ REST API ดึงแค่รหัสห้อง (shallow) แล้วอ่าน createdAt ทีละห้อง — ไม่ต้องโหลดข้อมูลทั้งห้อง
  const base = FIREBASE_CONFIG.databaseURL;
  const json = async (path) => (await fetch(`${base}/${path}.json${path === "rooms" ? "?shallow=true" : ""}`)).json();
  const codes = Object.keys((await json("rooms")) || {});
  const created = await Promise.all(codes.map((code) => json(`rooms/${encodeURIComponent(code)}/createdAt`)));
  return codes.filter((_, i) => !Number.isFinite(created[i]) || created[i] <= cutoff);
}
