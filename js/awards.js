// รางวัลพิเศษหน้าสรุปผล (pure): ดวงลูกเต๋า, ร่วง/ปีนบันได, ตอบคำถาม — คำพูดน่ารัก ไม่ล้อคนตอบผิด
import { isDrop } from "./board-config.js";

const fmt1 = (n) => (Math.round(n * 10) / 10).toString();
const sec = (ms) => `${fmt1(ms / 1000)} วิ`;

// เก็บสถิติต่อคนจาก history ทุกรอบ
export function collectPlayerStats(history = {}) {
  const stats = {};
  const of = (pid) => (stats[pid] ||= { rolls: [], dropped: 0, drops: 0, climbs: 0, correct: 0, asked: 0, fastMs: [] });
  for (const rd of Object.values(history || {})) {
    for (const [pid, dm] of Object.entries(rd?.diceMoves || {})) {
      if (dm.missed || !(dm.diceRoll > 0)) continue;
      const s = of(pid);
      s.rolls.push(dm.diceRoll);
      if (isDrop(dm.special)) { s.drops++; s.dropped += Math.max(0, (dm.landingPosition ?? 0) - (dm.toPosition ?? 0)); }
      if (dm.special === "ladder") s.climbs++;
    }
    for (const [pid, a] of Object.entries(rd?.answers || {})) {
      const s = of(pid);
      // ข้อฝึกที่ไม่ได้ตอบ (เข้าเส้นชัยแล้ว) ไม่นับ — ไม่ใช่ความผิดของเขา
      if (a.practice && !a.answered) continue;
      s.asked++;
      if (a.correct === true) {
        s.correct++;
        if (Number.isFinite(a.answerTimeMs)) s.fastMs.push(a.answerTimeMs);
      }
      if (!a.practice && isDrop(a.special)) { s.drops++; s.dropped += Math.max(0, (a.landingPosition ?? 0) - (a.finalPosition ?? 0)); }
      if (!a.practice && a.special === "ladder") s.climbs++;
    }
  }
  return stats;
}

// คนที่ได้ค่ามากที่สุด (เสมอกันได้หลายคน)
function top(entries, score, { min = -Infinity, low = false } = {}) {
  const list = entries.map(([pid, s]) => [pid, score(s)]).filter(([, v]) => Number.isFinite(v) && (low || v >= min));
  if (!list.length) return null;
  const best = low ? Math.min(...list.map(([, v]) => v)) : Math.max(...list.map(([, v]) => v));
  return { pids: list.filter(([, v]) => v === best).map(([pid]) => pid), value: best };
}

// รางวัลทั้งหมด (เฉพาะที่มีข้อมูลพอ) — players ใช้กรองคนที่ยังอยู่ในผล
export function computeAwards(history, players = {}) {
  const stats = collectPlayerStats(history);
  const all = Object.entries(stats).filter(([pid]) => !players || Object.keys(players).length === 0 || players[pid]);
  const awards = [];
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  const add = (key, emoji, title, res, line) => res && awards.push({ key, emoji, title, pids: res.pids, value: res.value, line: line(res.value, stats[res.pids[0]]) });

  // ดวงลูกเต๋า: เฉลี่ยต่อครั้ง (ต้องทอยอย่างน้อย 2 ครั้ง ไม่งั้นทอยครั้งเดียวได้ 6 ก็ชนะ)
  const rollers = all.filter(([, s]) => s.rolls.length >= 2);
  add("lucky", "🍀", "เทพลูกเต๋าประจำห้อง", top(rollers, (s) => avg(s.rolls)), (v, s) => `ทอยเฉลี่ย ${fmt1(v)} แต้ม (${s.rolls.length} ครั้ง)`);
  const unlucky = top(rollers, (s) => avg(s.rolls), { low: true });
  if (unlucky && unlucky.value < awards.find((a) => a.key === "lucky").value) {
    add("unlucky", "🎲", "ลูกเต๋าขอพักก่อนนะ", unlucky, (v) => `ทอยเฉลี่ยแค่ ${fmt1(v)} แต้ม รอบหน้าเต๋าต้องใจดีแน่ ๆ`);
  }
  // บันได
  add("faller", "🪂", "นักดิ่งบันไดม่วง", top(all, (s) => s.dropped, { min: 1 }), (v, s) => `ร่วงรวม ${v} ช่อง (${s.drops} ครั้ง) ยังยิ้มได้ เก่งมาก`);
  add("climber", "🧗", "สายปีนตัวจริง", top(all, (s) => s.climbs, { min: 1 }), (v) => `ปีนบันไดส้ม ${v} ครั้ง`);
  // คำถาม
  const answerers = all.filter(([, s]) => s.asked > 0);
  add("brain", "✨", "สมองไบรท์ที่สุด", top(answerers, (s) => s.correct, { min: 1 }), (v, s) => `ตอบถูก ${v} จาก ${s.asked} ข้อ`);
  add("speed", "⚡", "ตอบไวปานสายฟ้า", top(answerers.filter(([, s]) => s.fastMs.length >= 2), (s) => avg(s.fastMs), { low: true }), (v) => `ตอบถูกเฉลี่ยใน ${sec(v)}`);
  // คนตอบถูกน้อยสุด (สัดส่วน) — คำพูดให้กำลังใจ ไม่ล้อ
  const explorers = answerers.filter(([, s]) => s.asked >= 2);
  const brainPids = new Set(awards.find((a) => a.key === "brain")?.pids || []);
  const tryRes = top(explorers, (s) => s.correct / s.asked, { low: true });
  if (tryRes && !tryRes.pids.some((p) => brainPids.has(p))) {
    add("explorer", "🧭", "นักผจญคำถาม", tryRes, (_v, s) => `ลองครบทุกข้อ ถูก ${s.correct} จาก ${s.asked} ข้อ เกมหน้าปังแน่!`);
  }
  return awards;
}
