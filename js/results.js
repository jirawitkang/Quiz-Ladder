// results.js
// ผลการเล่นย้อนหลัง: บันทึกเกมที่เล่นจบ + คำนวณข้อมูลเชิงลึก (pure functions ล้วน ไม่แตะ DOM/Firebase)
//
// Firebase:
//   results/{key}       = สำเนาห้องตอนจบเกม (ใช้แสดงผล + Export Excel ย้อนหลังได้เหมือนตอนจบเกม)
//   resultsIndex/{key}  = สรุปสั้น ๆ สำหรับหน้ารายการ (ไม่ต้องโหลดผลทั้งก้อนทุกเกม)

import { getRoomQuestions, getRoomQuestionSetName } from "../questions.js";
import { getSettings, getViewPlayers } from "./game-logic.js";
import { computeStandings } from "./render.js";
import { roundKey, sortedRoundNumbers } from "./utils.js";
import { isDrop } from "./board-config.js";

const RECORD_FIELDS = [
  "createdAt",
  "hostName",
  "boardSize",
  "currentRound",
  "gameSettings",
  "players",
  "finalPlayers",
  "winners",
  "finalWinners",
  "endInfo",
  "history",
];

export const EASY_PCT = 75;
export const HARD_PCT = 45;

// key เดียวกันทุกครั้งสำหรับห้องเดียวกัน → บันทึกซ้ำได้โดยไม่เกิดผลซ้ำ
export function resultKey(room, roomCode) {
  return `${Math.round(Number(room?.createdAt) || 0)}_${String(roomCode || "ROOM").replace(/[^A-Z0-9]/gi, "")}`;
}

export function buildResultRecord(room, roomCode, now) {
  const record = { roomCode, savedAt: now };
  for (const f of RECORD_FIELDS) if (room[f] !== undefined) record[f] = room[f];
  // ห้องเก่าไม่มีสำเนาคำถาม → ใส่จาก questions.js ให้ผลอ่านได้เองแม้ชุดคำถามจะถูกแก้/ลบภายหลัง
  record.questionSet = room.questionSet || {
    id: getSettings(room).questionSetId,
    name: getRoomQuestionSetName(room),
    emojis: [],
    questions: getRoomQuestions(room),
  };
  return record;
}

export function buildResultIndex(record) {
  const insights = computeGameInsights(record);
  return {
    roomCode: record.roomCode || "",
    createdAt: record.createdAt || 0,
    endedAt: record.endInfo?.endedAt || record.savedAt || 0,
    hostName: record.hostName || "",
    setId: record.questionSet?.id || "",
    setName: record.questionSet?.name || "",
    playerCount: insights.overview.playerCount,
    roundsPlayed: insights.overview.roundsPlayed,
    maxRounds: insights.overview.maxRounds,
    accuracy: insights.overview.accuracy,
  };
}

// snapshot ของ resultsIndex/ → รายการเรียงล่าสุดก่อน
export function listResults(raw) {
  return Object.entries(raw || {})
    .map(([key, r]) => ({ key, ...r }))
    .sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0));
}

/* ---------- ตัวช่วย ---------- */

const avg = (list) => (list.length ? list.reduce((s, x) => s + x, 0) / list.length : null);
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : null);

function median(list) {
  if (!list.length) return null;
  const s = [...list].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function difficultyOf(percent) {
  if (percent == null) return null;
  return percent >= EASY_PCT ? "easy" : percent >= HARD_PCT ? "medium" : "hard";
}

// ผู้เล่นที่เข้าเส้นชัยไปแล้วก่อนรอบนี้ ไม่นับในรอบนี้ (history บันทึกเป็น correct=null, ไม่ใช่ missed)
const isEligible = (ar) => !(ar.correct == null && !ar.missedAnswer);
const answerTime = (ar) => (ar.answered && Number.isFinite(ar.answerTimeMs) ? ar.answerTimeMs : null);

/* ---------- เกมเดียว ---------- */

export function computeGameInsights(record) {
  const history = record.history || {};
  const players = getViewPlayers(record);
  const questions = getRoomQuestions(record);
  const rounds = sortedRoundNumbers(history);
  const nameOf = (pid, fallback) => players[pid]?.name || fallback || pid;

  const qMap = new Map();
  const pMap = new Map();
  const ensureP = (pid, name) => {
    if (!pMap.has(pid)) {
      pMap.set(pid, { id: pid, name: nameOf(pid, name), emoji: players[pid]?.emoji || "", correct: 0, eligible: 0, answered: 0, times: [], ladders: 0, drops: 0, byRound: [] });
    }
    return pMap.get(pid);
  };
  for (const pid of Object.keys(players)) ensureP(pid);

  let ladders = 0;
  let drops = 0;
  const countSpecial = (p, special) => {
    if (special === "ladder") (ladders++, p.ladders++);
    else if (isDrop(special)) (drops++, p.drops++);
  };

  for (const rn of rounds) {
    const rd = history[roundKey(rn)] || {};
    for (const [pid, dm] of Object.entries(rd.diceMoves || {})) countSpecial(ensureP(pid, dm.playerName), dm.special);

    for (const [pid, ar] of Object.entries(rd.answers || {})) {
      const p = ensureP(pid, ar.playerName);
      countSpecial(p, ar.special);
      if (!isEligible(ar)) {
        p.byRound.push({ round: rn, status: "done" });
        continue;
      }
      // ข้อฝึกหลังเข้าเส้นชัย (practice) นับในสถิติคำถาม/ผู้เล่นด้วย — ใช้วิเคราะห์แบบทดสอบ แต่ไม่เกี่ยวกับอันดับ
      const qi = Number.isFinite(ar.questionIndex) ? ar.questionIndex : 0;
      if (!qMap.has(qi)) {
        const q = questions[qi] || {};
        qMap.set(qi, {
          index: qi,
          text: q.text || ar.questionText || "",
          choices: q.choices || {},
          correctOption: q.correctOption || ar.correctOption,
          rounds: [],
          eligible: 0,
          answered: 0,
          correct: 0,
          counts: {},
          times: [],
          correctTimes: [],
        });
      }
      const qs = qMap.get(qi);
      if (!qs.rounds.includes(rn)) qs.rounds.push(rn);
      qs.eligible++;
      p.eligible++;
      const t = answerTime(ar);
      if (ar.answered) {
        qs.answered++;
        p.answered++;
        if (ar.selectedOption) qs.counts[ar.selectedOption] = (qs.counts[ar.selectedOption] || 0) + 1;
        if (t != null) {
          qs.times.push(t);
          p.times.push(t);
        }
      }
      if (ar.correct === true) {
        qs.correct++;
        p.correct++;
        if (t != null) qs.correctTimes.push({ ms: t, pid, name: p.name, emoji: p.emoji });
      }
      p.byRound.push({ round: rn, status: ar.missedAnswer ? "missed" : ar.correct ? "correct" : ar.answered ? "wrong" : "timeout", practice: !!ar.practice });
    }
  }

  const questionStats = [...qMap.values()]
    .sort((a, b) => a.rounds[0] - b.rounds[0])
    .map((q) => {
      const percent = pct(q.correct, q.eligible);
      const fastest = q.correctTimes.sort((a, b) => a.ms - b.ms)[0] || null;
      const wrong = Object.entries(q.counts)
        .filter(([k]) => k !== q.correctOption)
        .sort((a, b) => b[1] - a[1])[0];
      const trap = wrong && wrong[1] >= 2 && wrong[1] >= q.answered * 0.25 ? { option: wrong[0], count: wrong[1], percent: pct(wrong[1], q.answered) } : null;
      const options = Object.keys(q.choices).length ? Object.keys(q.choices) : Object.keys(q.counts).sort();
      return {
        index: q.index,
        text: q.text,
        choices: q.choices,
        correctOption: q.correctOption,
        rounds: q.rounds,
        eligible: q.eligible,
        answered: q.answered,
        correct: q.correct,
        noAnswer: q.eligible - q.answered,
        percent,
        difficulty: difficultyOf(percent),
        options: options.map((k) => ({ key: k, text: q.choices[k] ?? "", count: q.counts[k] || 0, percent: pct(q.counts[k] || 0, q.answered) ?? 0 })),
        avgMs: avg(q.times),
        medianMs: median(q.times),
        avgCorrectMs: avg(q.correctTimes.map((c) => c.ms)),
        fastest,
        trap,
      };
    });

  const order = computeStandings(record, players).map((s) => s.id);
  const playerStats = [...pMap.values()]
    .map((p) => ({
      id: p.id,
      name: p.name,
      emoji: p.emoji,
      correct: p.correct,
      eligible: p.eligible,
      answered: p.answered,
      percent: pct(p.correct, p.eligible),
      avgMs: avg(p.times),
      fastestMs: p.times.length ? Math.min(...p.times) : null,
      ladders: p.ladders,
      drops: p.drops,
      byRound: p.byRound,
      finished: !!players[p.id]?.finished,
      position: players[p.id]?.position ?? null,
    }))
    .sort((a, b) => {
      const ia = order.indexOf(a.id);
      const ib = order.indexOf(b.id);
      return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib);
    })
    .map((p, i) => ({ ...p, rank: i + 1 }));

  const totals = questionStats.reduce((t, q) => ((t.correct += q.correct), (t.eligible += q.eligible), (t.answered += q.answered), t), { correct: 0, eligible: 0, answered: 0 });
  const allTimes = [...pMap.values()].flatMap((p) => p.times);
  const fastestQ = questionStats.filter((q) => q.fastest).sort((a, b) => a.fastest.ms - b.fastest.ms)[0];

  const overview = {
    playerCount: Object.keys(players).length,
    roundsPlayed: rounds.length,
    maxRounds: getSettings(record).maxRounds,
    accuracy: pct(totals.correct, totals.eligible),
    answerRate: pct(totals.answered, totals.eligible),
    avgMs: avg(allTimes),
    fastest: fastestQ ? { ...fastestQ.fastest, questionIndex: fastestQ.index } : null,
    ladders,
    drops,
    endReason: record.endInfo?.endReason || null,
    endedAt: record.endInfo?.endedAt || record.savedAt || null,
  };

  return { overview, questions: questionStats, players: playerStats, highlights: buildHighlights(questionStats, playerStats) };
}

function buildHighlights(questions, players) {
  const out = [];
  const asked = questions.filter((q) => q.percent != null);
  if (!asked.length) return out;
  const byPct = [...asked].sort((a, b) => a.percent - b.percent);
  const hardest = byPct[0];
  const easiest = byPct[byPct.length - 1];

  out.push({ kind: "hardest", question: hardest });
  const trap = asked.filter((q) => q.trap).sort((a, b) => b.trap.percent - a.trap.percent)[0];
  if (trap) out.push({ kind: "trap", question: trap });
  if (easiest !== hardest) out.push({ kind: "easiest", question: easiest });
  const slow = asked.filter((q) => q.avgCorrectMs != null).sort((a, b) => b.avgCorrectMs - a.avgCorrectMs)[0];
  if (slow && asked.length > 1) out.push({ kind: "slowest", question: slow });

  // เร็วเฉลี่ยที่สุด: นับเฉพาะคนที่ตอบอย่างน้อยครึ่งหนึ่งของข้อที่มีสิทธิ์ตอบ
  const quick = players.filter((p) => p.avgMs != null && p.answered * 2 >= p.eligible && p.eligible > 0).sort((a, b) => a.avgMs - b.avgMs)[0];
  if (quick) out.push({ kind: "quickest", player: quick });
  const perfect = players.filter((p) => p.eligible > 0 && p.correct === p.eligible);
  const best = [...players].filter((p) => p.eligible > 0).sort((a, b) => b.correct - a.correct)[0];
  if (perfect.length) out.push({ kind: "perfect", players: perfect });
  else if (best) out.push({ kind: "best", player: best });
  return out;
}

/* ---------- ภาพรวมชุดคำถาม (หลายเกม) ---------- */

// records: ผลเต็มของเกมที่ใช้ชุดคำถามเดียวกัน — จับคู่คำถามด้วยข้อความ (ครูอาจแก้ลำดับ/เพิ่มข้อภายหลัง)
export function computeSetInsights(records) {
  const games = records
    .map((r) => ({ record: r, insights: computeGameInsights(r) }))
    .sort((a, b) => (a.insights.overview.endedAt || 0) - (b.insights.overview.endedAt || 0));

  const qMap = new Map();
  let playerTotal = 0;
  let timeSum = 0;
  let timeCount = 0;
  for (const { insights } of games) {
    playerTotal += insights.overview.playerCount;
    // เฉลี่ยจากทุกคำตอบ (ถ่วงตามจำนวนคำตอบ) ให้ตรงกับตัวเลขในหน้าเกมเดียว
    for (const p of insights.players) {
      if (p.avgMs == null) continue;
      const n = p.byRound.filter((r) => r.status === "correct" || r.status === "wrong").length;
      timeSum += p.avgMs * n;
      timeCount += n;
    }
    const hardest = [...insights.questions].filter((q) => q.percent != null).sort((a, b) => a.percent - b.percent)[0];
    for (const q of insights.questions) {
      const key = q.text.trim();
      if (!qMap.has(key)) qMap.set(key, { text: q.text, index: q.index, correct: 0, eligible: 0, games: 0, hardestIn: 0 });
      const agg = qMap.get(key);
      agg.correct += q.correct;
      agg.eligible += q.eligible;
      agg.games += 1;
      agg.index = q.index;
      if (hardest && hardest.text.trim() === key) agg.hardestIn += 1;
    }
  }

  const questions = [...qMap.values()]
    .map((q) => ({ ...q, percent: pct(q.correct, q.eligible), difficulty: difficultyOf(pct(q.correct, q.eligible)) }))
    .sort((a, b) => (a.percent ?? 101) - (b.percent ?? 101));
  const totals = questions.reduce((t, q) => ((t.c += q.correct), (t.e += q.eligible), t), { c: 0, e: 0 });
  const mostOftenHardest = [...questions].sort((a, b) => b.hardestIn - a.hardestIn)[0] || null;

  return {
    gameCount: games.length,
    playerTotal,
    accuracy: pct(totals.c, totals.e),
    avgMs: timeCount ? timeSum / timeCount : null,
    trend: games.map(({ insights }) => ({ endedAt: insights.overview.endedAt, accuracy: insights.overview.accuracy })),
    mostOftenHardest: mostOftenHardest?.hardestIn ? mostOftenHardest : null,
    questions,
  };
}
