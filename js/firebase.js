// firebase.js
// เชื่อมต่อ Firebase Realtime Database + นาฬิกาที่ sync กับ server

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
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
