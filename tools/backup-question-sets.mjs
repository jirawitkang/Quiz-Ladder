// สำรองชุดคำถามทั้งหมดจาก Firebase ลงไฟล์ backups/question-sets.json (commit เก็บใน git ได้)
// กู้คืน: node tools/backup-question-sets.mjs --restore  (เขียนทับ questionSets/ ทั้งหมดด้วยไฟล์สำรอง)

import { readFile, writeFile } from "node:fs/promises";
import { FIREBASE_CONFIG } from "../js/config.js";

const url = `${FIREBASE_CONFIG.databaseURL}/questionSets.json`;
const file = new URL("../backups/question-sets.json", import.meta.url);

if (process.argv.includes("--restore")) {
  const body = await readFile(file, "utf8");
  const res = await fetch(url, { method: "PUT", body });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  console.log(`restored ${Object.keys(JSON.parse(body)).length} sets from backups/question-sets.json`);
} else {
  const data = (await (await fetch(url)).json()) || {};
  await writeFile(file, JSON.stringify(data, null, 2) + "\n");
  const n = Object.values(data).reduce((sum, s) => sum + (s.questions?.length || 0), 0);
  console.log(`saved ${Object.keys(data).length} sets (${n} questions) → backups/question-sets.json`);
}
