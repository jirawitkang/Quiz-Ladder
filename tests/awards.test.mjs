import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAwards, collectPlayerStats } from "../js/awards.js";

const dice = (roll, extra = {}) => ({ diceRoll: roll, fromPosition: 1, landingPosition: 1 + roll, toPosition: 1 + roll, ...extra });
const ans = (correct, extra = {}) => ({ correct, answered: true, practice: false, answerTimeMs: 4000, ...extra });
const history = {
  round_1: {
    diceMoves: { a: dice(6), b: dice(1), c: dice(3, { special: "drop", landingPosition: 16, toPosition: 9 }) },
    answers: { a: ans(true, { answerTimeMs: 2000 }), b: ans(false), c: ans(true, { special: "ladder" }) },
  },
  round_2: {
    diceMoves: { a: dice(5), b: dice(2), c: dice(4, { special: "snake", landingPosition: 22, toPosition: 15 }), d: { diceRoll: 0, missed: true } },
    answers: { a: ans(true, { answerTimeMs: 3000 }), b: ans(false), c: ans(false), d: ans(null, { practice: true, answered: false }) },
  },
};
const byKey = (list) => Object.fromEntries(list.map((x) => [x.key, x]));

test("awards: lucky / unlucky dice by average roll, missed rolls ignored", () => {
  const w = byKey(computeAwards(history));
  assert.deepEqual(w.lucky.pids, ["a"]);
  assert.equal(w.lucky.value, 5.5);
  assert.deepEqual(w.unlucky.pids, ["b"]);
  assert.match(w.unlucky.line, /1\.5/);
});

test("awards: biggest faller sums purple drops (old 'snake' counts), climber counts orange ladders", () => {
  const w = byKey(computeAwards(history));
  assert.deepEqual(w.faller.pids, ["c"]);
  assert.equal(w.faller.value, 14);
  assert.deepEqual(w.climber.pids, ["c"]);
});

test("awards: brightest = most correct, fastest = avg correct answer time, explorer is kind and never the brain", () => {
  const w = byKey(computeAwards(history));
  assert.deepEqual(w.brain.pids, ["a"]);
  assert.match(w.brain.line, /2 จาก 2/);
  assert.deepEqual(w.speed.pids, ["a"]);
  assert.deepEqual(w.explorer.pids, ["b"]);
  assert.ok(!/โง่/.test(computeAwards(history).map((x) => x.title + x.line).join("")));
});

test("awards: unanswered practice questions are not counted against a finished player", () => {
  const s = collectPlayerStats(history);
  assert.equal(s.d.asked, 0);
});

test("awards: empty history gives no awards; equal dice luck gives no 'unlucky'", () => {
  assert.deepEqual(computeAwards({}), []);
  const flat = { round_1: { diceMoves: { a: dice(3), b: dice(3) } }, round_2: { diceMoves: { a: dice(3), b: dice(3) } } };
  const w = byKey(computeAwards(flat));
  assert.ok(w.lucky);
  assert.equal(w.unlucky, undefined);
});
