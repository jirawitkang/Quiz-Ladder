import test from "node:test";
import assert from "node:assert/strict";

import { buildResultIndex, buildResultRecord, computeGameInsights, computeSetInsights, listResults, resultKey } from "../js/results.js";
import { buildExportTables } from "../js/export.js";
import { QUESTION_SETS } from "../questions.js";

const QS = [
  { text: "ข้อ 1?", choices: { A: "ก", B: "ข", C: "ค" }, correctOption: "A", timeLimit: 30 },
  { text: "ข้อ 2?", choices: { A: "ก", B: "ข", C: "ค", D: "ง" }, correctOption: "C", timeLimit: 30 },
];

// ar(selected, ms) = ตอบ; "miss" = หลุด; "timeout" = ออนไลน์แต่ไม่ตอบ; "done" = เข้าเส้นชัยไปแล้ว
function answer(pid, qi, v, correctOption) {
  const base = { playerId: pid, playerName: pid.toUpperCase(), questionIndex: qi, correctOption };
  if (v === "miss") return { ...base, answered: false, correct: null, missedAnswer: true };
  if (v === "timeout") return { ...base, answered: false, correct: false, missedAnswer: false };
  if (v === "done") return { ...base, answered: false, correct: null, missedAnswer: false };
  const [sel, ms, special] = v;
  return { ...base, answered: true, selectedOption: sel, correct: sel === correctOption, missedAnswer: false, answerTimeMs: ms, special: special || null };
}

function makeRecord() {
  const rounds = [
    // รอบ 1 ถามข้อ 1 (A ถูก)
    { qi: 0, a: { a: ["A", 2000, "ladder"], b: ["B", 5000], c: ["A", 4000], d: "timeout" }, dice: { a: "snake" } },
    // รอบ 2 ถามข้อ 2 (C ถูก) — B เป็นตัวหลอก
    { qi: 1, a: { a: ["C", 3000], b: ["B", 6000, "snake"], c: ["B", 7000], d: "miss" } },
    // รอบ 3 ถามข้อ 1 ซ้ำ — a เข้าเส้นชัยแล้ว
    { qi: 0, a: { a: "done", b: ["A", 1500], c: ["A", 2500], d: ["C", 9000] } },
  ];
  const history = {};
  rounds.forEach((r, i) => {
    const answers = {};
    for (const [pid, v] of Object.entries(r.a)) answers[pid] = answer(pid, r.qi, v, QS[r.qi].correctOption);
    const diceMoves = {};
    for (const [pid, sp] of Object.entries(r.dice || {})) diceMoves[pid] = { playerId: pid, special: sp };
    history[`round_${i + 1}`] = { answers, diceMoves };
  });
  const players = Object.fromEntries(["a", "b", "c", "d"].map((p, i) => [p, { name: p.toUpperCase(), emoji: "🐶🐱🐭🐹"[i] ? [..."🐶🐱🐭🐹"][i] : "", position: 30 - i * 5, finished: p === "a" }]));
  return {
    roomCode: "ABC234",
    createdAt: 1000,
    hostName: "Kang",
    gameSettings: { questionSetId: "-x", maxRounds: 10, maxWinners: 1 },
    questionSet: { id: "-x", name: "ชุดทดสอบ", emojis: [], questions: QS },
    players,
    winners: [{ playerId: "a", rank: 1 }],
    endInfo: { endedAt: 9000, endReason: "winners" },
    history,
  };
}

test("overview: accuracy excludes players who already finished; missed and timeout count as not correct", () => {
  const { overview } = computeGameInsights(makeRecord());
  // มีสิทธิ์ตอบ 4 + 4 + 3 = 11, ถูก a,c (r1) + a (r2) + b,c (r3) = 5
  assert.equal(overview.accuracy, Math.round((5 / 11) * 100));
  assert.equal(overview.answerRate, Math.round((9 / 11) * 100));
  assert.equal(overview.roundsPlayed, 3);
  assert.equal(overview.playerCount, 4);
  assert.deepEqual([overview.ladders, overview.drops], [1, 2]);
  assert.equal(overview.fastest.ms, 1500);
  assert.equal(overview.fastest.name, "B");
});

test("questions: repeated question merges rounds; option spread, fastest, trap", () => {
  const { questions } = computeGameInsights(makeRecord());
  assert.equal(questions.length, 2);
  const [q1, q2] = questions;
  assert.deepEqual(q1.rounds, [1, 3]);
  assert.equal(q1.eligible, 7);
  assert.equal(q1.correct, 4);
  assert.equal(q1.noAnswer, 1);
  assert.equal(q1.fastest.ms, 1500);
  assert.equal(q2.percent, 25);
  assert.equal(q2.difficulty, "hard");
  assert.deepEqual(q2.trap, { option: "B", count: 2, percent: 67 });
  assert.deepEqual(q2.options.map((o) => [o.key, o.count]), [["A", 0], ["B", 2], ["C", 1], ["D", 0]]);
  assert.equal(q2.avgMs, (3000 + 6000 + 7000) / 3);
});

test("players: ranked by finish, per-round status, ladders and drops (old 'snake' counts)", () => {
  const { players } = computeGameInsights(makeRecord());
  assert.equal(players[0].id, "a");
  const a = players[0];
  assert.deepEqual(a.byRound.map((r) => r.status), ["correct", "correct", "done"]);
  assert.deepEqual([a.correct, a.eligible, a.ladders, a.drops], [2, 2, 1, 1]);
  const d = players.find((p) => p.id === "d");
  assert.deepEqual(d.byRound.map((r) => r.status), ["timeout", "missed", "wrong"]);
  assert.equal(d.percent, 0);
});

test("highlights point at the hardest question and the trap", () => {
  const { highlights } = computeGameInsights(makeRecord());
  const kinds = highlights.map((h) => h.kind);
  assert.equal(highlights[0].kind, "hardest");
  assert.equal(highlights[0].question.index, 1);
  assert.ok(kinds.includes("trap"));
  assert.ok(kinds.includes("quickest"));
});

test("record/index: stable key, legacy rooms get questions from questions.js, export still works", () => {
  const room = { ...makeRecord(), questionSet: undefined, gameSettings: { questionSetId: "love", maxRounds: 10 } };
  delete room.roomCode;
  assert.equal(resultKey(room, "ABC234"), "1000_ABC234");
  const rec = buildResultRecord(room, "ABC234", 5);
  assert.equal(rec.questionSet.questions.length, QUESTION_SETS.love.length);
  assert.equal(rec.roomCode, "ABC234");
  const idx = buildResultIndex(buildResultRecord(makeRecord(), "ABC234", 5));
  assert.deepEqual([idx.setName, idx.playerCount, idx.roundsPlayed, idx.endedAt], ["ชุดทดสอบ", 4, 3, 9000]);
  assert.ok(buildExportTables(rec, "ABC234").answersRows.length > 0);
  assert.deepEqual(listResults({ x: { endedAt: 1 }, y: { endedAt: 5 } }).map((r) => r.key), ["y", "x"]);
});

test("set insights combine games and match questions by text", () => {
  const g1 = makeRecord();
  const g2 = makeRecord();
  g2.endInfo.endedAt = 20000;
  g2.history.round_2.answers.c = answer("c", 1, ["C", 2000], "C");
  const s = computeSetInsights([g2, g1]);
  assert.equal(s.gameCount, 2);
  assert.equal(s.playerTotal, 8);
  assert.deepEqual(s.trend.map((t) => t.endedAt), [9000, 20000]);
  assert.equal(s.questions[0].text, "ข้อ 2?");
  assert.equal(s.questions[0].eligible, 8);
  assert.equal(s.questions[0].correct, 3);
  assert.equal(s.mostOftenHardest.text, "ข้อ 2?");
  const single = computeSetInsights([makeRecord()]);
  assert.equal(single.avgMs, computeGameInsights(makeRecord()).overview.avgMs);
});
