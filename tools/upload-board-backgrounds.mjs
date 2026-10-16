// อัปโหลดรูปพื้นหลังกระดานใน assets/board-backgrounds/ ขึ้น Firebase (boardImages/bg-<ชื่อไฟล์>)
// แล้วผูกกับชุดคำถามเดิมตาม SET_IMAGES (ข้ามชุดที่ไม่มีใน Firebase หรือครูตั้งรูปเองไว้แล้ว)
// รัน: node tools/upload-board-backgrounds.mjs          (ดูว่าจะทำอะไร)
//      node tools/upload-board-backgrounds.mjs --write  (เขียนจริง)
// รูปต้นฉบับ (.svg) และสคริปต์วาด (.mjs) อยู่โฟลเดอร์เดียวกัน — แก้แล้ววาดใหม่ได้

import { readFile, readdir } from "node:fs/promises";
import { FIREBASE_CONFIG } from "../js/config.js";

const SET_IMAGES = {
  food1: "food-quest", food2: "food-quest", food3: "food-quest", food4: "food-quest", food5: "food-quest",
  general: "work-life-balance", love: "love", friends: "friends-fun-facts", money: "money-coach",
};
const write = process.argv.includes("--write");
const db = FIREBASE_CONFIG.databaseURL;
const dir = new URL("../assets/board-backgrounds/", import.meta.url);
const put = async (path, body, method = "PUT") => {
  const res = await fetch(`${db}/${path}.json`, { method, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
};

for (const file of (await readdir(dir)).filter((f) => f.endsWith(".jpg"))) {
  const name = file.replace(/\.jpg$/, "");
  const buf = await readFile(new URL(file, dir));
  const dataUrl = `data:image/jpeg;base64,${buf.toString("base64")}`;
  if (write) await put(`boardImages/bg-${name}`, { dataUrl, width: 1200, height: 1000, createdAt: Date.now(), source: `assets/board-backgrounds/${file}` });
  console.log(`${write ? "uploaded" : "would upload"} bg-${name} (${Math.round(buf.length / 1024)} KB)`);
}

const sets = (await (await fetch(`${db}/questionSets.json?shallow=true`)).json()) || {};
for (const [setId, name] of Object.entries(SET_IMAGES)) {
  if (!sets[setId]) {
    console.log(`skip  ${setId} (ไม่มีใน Firebase)`);
    continue;
  }
  const current = await (await fetch(`${db}/questionSets/${setId}/boardImageId.json`)).json();
  if (current && !String(current).startsWith("bg-")) {
    console.log(`skip  ${setId} (ครูตั้งรูปเองไว้แล้ว)`);
    continue;
  }
  if (write) await put(`questionSets/${setId}`, { boardImageId: `bg-${name}` }, "PATCH");
  console.log(`${write ? "linked" : "would link"} ${setId} → bg-${name}`);
}
