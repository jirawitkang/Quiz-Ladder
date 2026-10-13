// รัน: node --test tests/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { PHASE, STATUS } from "../js/config.js";
import { LADDERS, MOVE, SNAKES, cellNumberAt, cellPosition, resolveLanding } from "../js/board-config.js";
import { getEmojiPool, getThemeEmojis, visibleEmojiCount, EMOJI_THEMES, RESERVE_EMOJIS } from "../js/emoji-themes.js";
import {
  applyAnswer,
  applyBeginAnswering,
  applyClaimEmoji,
  applyReveal,
  applyRoll,
  applyStartGame,
  applyStartQuestion,
  applyStartRound,
  getRoomEmojiChoices,
} from "../js/game-logic.js";
import { getQuestionFromRoom } from "../questions.js";

const [LADDER_FOOT, LADDER_TOP] = Object.entries(LADDERS)[0].map(Number);
const [SNAKE_HEAD, SNAKE_TAIL] = Object.entries(SNAKES)[0].map(Number);

function room(players, extra = {}) {
  return {
    status: STATUS.IN_GAME,
    phase: PHASE.IDLE,
    currentRound: 0,
    winners: [],
    history: {},
    gameSettings: { questionSetId: "general", maxRounds: 10, maxWinners: 5, rewardCorrect: 2, penaltyWrong: -2, emojiTheme: "office" },
    players,
    ...extra,
  };
}

const p = (name, extra = {}) => ({ name, position: 1, connected: true, ...extra });

function answerRound(r, answers) {
  applyStartRound(r);
  for (const pl of Object.values(r.players)) pl.hasRolled = true;
  applyStartQuestion(r, 1000);
  applyBeginAnswering(r, 4000);
  const q = getQuestionFromRoom(r, r.questionIndex);
  const wrong = Object.keys(q.choices).find((k) => k !== q.correctOption);
  for (const [pid, ok] of Object.entries(answers)) applyAnswer(r.players[pid], ok ? q.correctOption : wrong, 5000);
  applyReveal(r, 9000);
}

/* ---------- board geometry ---------- */

test("serpentine numbering: 1 bottom-left, rows alternate direction", () => {
  assert.deepEqual(cellPosition(1), { col: 0, row: 4 });
  assert.deepEqual(cellPosition(6), { col: 5, row: 4 });
  assert.deepEqual(cellPosition(7), { col: 5, row: 3 });
  assert.deepEqual(cellPosition(25), { col: 0, row: 0 });
  assert.deepEqual(cellPosition(30), { col: 5, row: 0 }); // 5 แถว → เส้นชัยอยู่มุมขวาบน
  for (let n = 1; n <= 30; n++) {
    const { col, row } = cellPosition(n);
    assert.equal(cellNumberAt(col, row), n);
  }
});

test("resolveLanding applies the agreed rules", () => {
  assert.deepEqual(resolveLanding(LADDER_FOOT, MOVE.DICE), { to: LADDER_TOP, special: "ladder", blocked: null });
  assert.deepEqual(resolveLanding(SNAKE_HEAD, MOVE.DICE), { to: SNAKE_TAIL, special: "snake", blocked: null });
  assert.deepEqual(resolveLanding(LADDER_FOOT, MOVE.CORRECT).to, LADDER_TOP);
  assert.deepEqual(resolveLanding(SNAKE_HEAD, MOVE.CORRECT), { to: SNAKE_HEAD, special: null, blocked: "snake" });
  assert.deepEqual(resolveLanding(SNAKE_HEAD, MOVE.WRONG).to, SNAKE_TAIL);
  assert.deepEqual(resolveLanding(LADDER_FOOT, MOVE.WRONG), { to: LADDER_FOOT, special: null, blocked: "ladder" });
});

/* ---------- moves ---------- */

test("dice landing on a ladder climbs, recorded in history", () => {
  const r = room({ a: p("A", { position: LADDER_FOOT - 2 }) });
  applyStartRound(r);
  applyRoll(r, "a", 2, 1);
  const dm = r.history.round_1.diceMoves.a;
  assert.equal(r.players.a.position, LADDER_TOP);
  assert.equal(dm.landingPosition, LADDER_FOOT);
  assert.equal(dm.special, "ladder");
});

test("dice landing on a snake slides down", () => {
  const r = room({ a: p("A", { position: SNAKE_HEAD - 3 }) });
  applyStartRound(r);
  applyRoll(r, "a", 3, 1);
  assert.equal(r.players.a.position, SNAKE_TAIL);
  assert.equal(r.history.round_1.diceMoves.a.special, "snake");
});

test("overshooting the last cell finishes", () => {
  const r = room({ a: p("A", { position: 29 }), b: p("B") }, {});
  r.gameSettings.maxWinners = 2;
  applyStartRound(r);
  applyRoll(r, "a", 6, 1);
  assert.equal(r.players.a.position, 30);
  assert.equal(r.players.a.finished, true);
});

test("correct answer can climb a ladder", () => {
  const r = room({ a: p("A", { position: LADDER_FOOT - 2 }) });
  answerRound(r, { a: true });
  assert.equal(r.players.a.position, LADDER_TOP);
  assert.equal(r.history.round_1.answers.a.special, "ladder");
});

test("correct answer never falls down a snake", () => {
  const r = room({ a: p("A", { position: SNAKE_HEAD - 2 }) });
  answerRound(r, { a: true });
  assert.equal(r.players.a.position, SNAKE_HEAD);
  assert.equal(r.history.round_1.answers.a.blocked, "snake");
});

test("wrong answer falls down a snake", () => {
  const r = room({ a: p("A", { position: SNAKE_HEAD + 2 }) });
  answerRound(r, { a: false });
  assert.equal(r.players.a.position, SNAKE_TAIL);
  assert.equal(r.history.round_1.answers.a.special, "snake");
});

test("wrong answer never climbs a ladder", () => {
  const r = room({ a: p("A", { position: LADDER_FOOT + 2 }) });
  answerRound(r, { a: false });
  assert.equal(r.players.a.position, LADDER_FOOT);
  assert.equal(r.history.round_1.answers.a.blocked, "ladder");
});

test("no answer from an online player counts as wrong and can hit a snake", () => {
  const r = room({ a: p("A", { position: SNAKE_HEAD + 2 }) });
  answerRound(r, {});
  assert.equal(r.players.a.position, SNAKE_TAIL);
});

/* ---------- emoji ---------- */

test("every theme has 30 unique emoji and the reserve is unique", () => {
  for (const [id, t] of Object.entries(EMOJI_THEMES)) {
    assert.equal(t.emojis.length, 30, id);
    assert.equal(new Set(t.emojis).size, 30, id);
  }
  assert.equal(new Set(RESERVE_EMOJIS).size, RESERVE_EMOJIS.length);
  for (const id of Object.keys(EMOJI_THEMES)) {
    const pool = getEmojiPool(id);
    assert.equal(new Set(pool).size, pool.length, id);
    assert.ok(pool.length >= 70, id);
  }
});

test("reserve emoji appear in batches of 20 after 30 players", () => {
  assert.equal(visibleEmojiCount(1, 90), 30);
  assert.equal(visibleEmojiCount(30, 90), 30);
  assert.equal(visibleEmojiCount(31, 90), 50);
  assert.equal(visibleEmojiCount(50, 90), 50);
  assert.equal(visibleEmojiCount(51, 90), 70);
  assert.equal(visibleEmojiCount(200, 90), 90);
});

function lobby(n) {
  const players = {};
  for (let i = 0; i < n; i++) players[`p${i}`] = p(`P${i}`);
  return room(players, { status: STATUS.LOBBY });
}

test("claim emoji: free one succeeds, taken one aborts, switching frees the old one", () => {
  const r = lobby(3);
  const [e1, e2] = getThemeEmojis("office");
  assert.ok(applyClaimEmoji(r, "p0", e1));
  assert.equal(applyClaimEmoji(r, "p1", e1), undefined);
  assert.ok(applyClaimEmoji(r, "p0", e2));
  assert.ok(applyClaimEmoji(r, "p1", e1));
});

test("claim emoji: rejected outside lobby or outside visible choices", () => {
  const r = lobby(2);
  assert.equal(applyClaimEmoji(r, "p0", "🚀"), undefined); // ตัวสำรองยังไม่แสดงเมื่อมี 2 คน
  r.status = STATUS.IN_GAME;
  assert.equal(applyClaimEmoji(r, "p0", getThemeEmojis("office")[0]), undefined);
});

test("reserve emoji become claimable once there are more than 30 players", () => {
  const r = lobby(31);
  const choices = getRoomEmojiChoices(r);
  assert.equal(choices.length, 50);
  assert.ok(applyClaimEmoji(r, "p0", choices[40]));
});

test("start game assigns unique emoji to players who did not pick", () => {
  const r = lobby(35);
  applyClaimEmoji(r, "p0", getThemeEmojis("office")[0]);
  let seed = 1;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  assert.ok(applyStartGame(r, 123, rng));
  const emojis = Object.values(r.players).map((pl) => pl.emoji);
  assert.ok(emojis.every(Boolean));
  assert.equal(new Set(emojis).size, 35);
  assert.equal(r.players.p0.emoji, getThemeEmojis("office")[0]);
  assert.equal(r.status, STATUS.IN_GAME);
});
