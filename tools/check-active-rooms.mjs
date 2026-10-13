// ตรวจห้องใน Firebase ก่อน deploy: แสดงห้องที่มีอยู่ สถานะ และอายุ
// รัน: node tools/check-active-rooms.mjs
// ถ้ามีห้อง status = inGame ที่ไม่ใช่ห้องทดสอบ ให้ถามผู้ใช้ก่อน deploy

import { FIREBASE_CONFIG } from "../js/config.js";

const base = FIREBASE_CONFIG.databaseURL;
const get = async (path, query = "") => (await fetch(`${base}/${path}.json${query}`)).json();

const codes = Object.keys((await get("rooms", "?shallow=true")) || {});
if (!codes.length) {
  console.log("no rooms");
  process.exit(0);
}

const now = Date.now();
for (const code of codes) {
  const [status, phase, createdAt, hostName, round, players] = await Promise.all([
    get(`rooms/${code}/status`),
    get(`rooms/${code}/phase`),
    get(`rooms/${code}/createdAt`),
    get(`rooms/${code}/hostName`),
    get(`rooms/${code}/currentRound`),
    get(`rooms/${code}/players`, "?shallow=true"),
  ]);
  const ageMin = Number.isFinite(createdAt) ? Math.round((now - createdAt) / 60000) : "?";
  const count = Object.keys(players || {}).length;
  console.log(`${code}  status=${status} phase=${phase} round=${round} host=${hostName} players=${count} ageMin=${ageMin}`);
}
