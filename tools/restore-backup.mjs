// กู้คืนข้อมูลจากไฟล์สำรองใน branch "backups" (ที่ GitHub Actions สำรองไว้ทุกคืน) กลับขึ้น Firebase
// รัน (ในโฟลเดอร์ Quiz-Runner):
//   node tools/restore-backup.mjs question-sets          ดูว่าจะกู้อะไร
//   node tools/restore-backup.mjs question-sets --write  เขียนทับ questionSets/ ทั้งหมด
//   node tools/restore-backup.mjs results --write        เขียนทับ results/ ทั้งหมด (กู้คู่กับ results-index)
//   node tools/restore-backup.mjs results-index --write  เขียนทับ resultsIndex/ (สรุปที่หน้ารายการใช้)
//   node tools/restore-backup.mjs board-images --write   เขียนทับ boardImages/ (รูปพื้นหลังกระดาน)
// ใส่ --at <commit> เพื่อกู้จากรอบสำรองที่เก่ากว่า (ดูรายการ: git log origin/backups --oneline)

import { execFileSync } from "node:child_process";
import { FIREBASE_CONFIG } from "../js/config.js";

const TARGETS = { "question-sets": "questionSets", results: "results", "results-index": "resultsIndex", "board-images": "boardImages" };
const [what] = process.argv.slice(2);
const node = TARGETS[what];
if (!node) {
  console.log("ระบุสิ่งที่จะกู้: question-sets, results, results-index หรือ board-images");
  process.exit(1);
}
const atIndex = process.argv.indexOf("--at");
const rev = atIndex > 0 ? process.argv[atIndex + 1] : "origin/backups";

execFileSync("git", ["fetch", "--quiet", "origin", "backups"]);
const body = execFileSync("git", ["show", `${rev}:backups/${what}.json`], { encoding: "utf8" });
const data = JSON.parse(body) || {};
console.log(`${rev}: ${Object.keys(data).length} รายการใน ${what}`);

if (!process.argv.includes("--write")) {
  console.log("(ยังไม่ได้เขียน — ใส่ --write เพื่อเขียนทับบน Firebase)");
  process.exit(0);
}
const res = await fetch(`${FIREBASE_CONFIG.databaseURL}/${node}.json`, { method: "PUT", body: JSON.stringify(data) });
if (!res.ok) throw new Error(`HTTP ${res.status}`);
console.log(`กู้คืน ${node}/ เรียบร้อย`);
