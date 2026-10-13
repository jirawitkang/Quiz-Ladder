// ย้ายชุดคำถามเดิมใน questions.js ขึ้น Firebase (questionSets/{id}) — ใส่เฉพาะชุดที่ยังไม่มี ไม่ทับของที่ครูแก้ไว้
// รัน: node tools/seed-question-sets.mjs          (ดูว่าจะเพิ่มอะไร)
//      node tools/seed-question-sets.mjs --write  (เขียนจริง)

import { FIREBASE_CONFIG } from "../js/config.js";
import { builtInQuestionSets } from "../js/question-sets.js";

const base = `${FIREBASE_CONFIG.databaseURL}/questionSets`;
const write = process.argv.includes("--write");

const existing = (await (await fetch(`${base}.json?shallow=true`)).json()) || {};
const sets = builtInQuestionSets(Date.now());
for (const [id, data] of Object.entries(sets)) {
  if (existing[id]) {
    console.log(`skip  ${id} (มีอยู่แล้ว)`);
    continue;
  }
  if (write) {
    const res = await fetch(`${base}/${id}.json`, { method: "PUT", body: JSON.stringify(data) });
    if (!res.ok) throw new Error(`${id}: HTTP ${res.status}`);
  }
  console.log(`${write ? "added" : "would add"} ${id} — ${data.name} (${data.questions.length} ข้อ)`);
}
