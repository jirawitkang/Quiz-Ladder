// รัน: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";

import { BOARD_SIZE, PHASE, STATUS } from "../js/config.js";
import {
  applyAnswer,
  applyBeginAnswering,
  applyDeadlineExpired,
  applyReveal,
  applyRoll,
  applyStartQuestion,
  applyStartRound,
} from "../js/game-logic.js";
import { getQuestionFromRoom } from "../questions.js";

function makeRoom(players, settings = {}) {
  return {
    status: STATUS.IN_GAME,
    phase: PHASE.IDLE,
    currentRound: 0,
    winners: [],
    history: {},
    gameSettings: {
      questionSetId: "general",
      maxRounds: 10,
      maxWinners: 5,
      rewardCorrect: 2,
      penaltyWrong: -2,
      ...settings,
    },
    players,
  };
}

function player(name, extra = {}) {
  return { name, position: 1, connected: true, ...extra };
}

function toAnswering(room, now = 1000) {
  applyStartQuestion(room, now);
  applyBeginAnswering(room, now + 3000);
}

test("start round resets per-round state", () => {
  const room = makeRoom({ a: player("A", { answered: true, answer: "A" }) });
  assert.ok(applyStartRound(room));
  assert.equal(room.currentRound, 1);
  assert.equal(room.phase, PHASE.ROLLING);
  assert.equal(room.players.a.hasRolled, false);
  assert.equal(room.players.a.answered, false);
  assert.equal(room.players.a.answer, null);
});

test("start round aborts outside idle/result and at max rounds", () => {
  const room = makeRoom({ a: player("A") }, { maxRounds: 1 });
  room.phase = PHASE.ANSWERING;
  assert.equal(applyStartRound(room), undefined);
  room.phase = PHASE.RESULT;
  room.currentRound = 1;
  assert.equal(applyStartRound(room), undefined);
});

test("roll moves player, records history, rejects double roll", () => {
  const room = makeRoom({ a: player("A") });
  applyStartRound(room);
  assert.ok(applyRoll(room, "a", 3, 1)); // 1 → 4 (ช่องธรรมดา ไม่มีบันได)
  assert.equal(room.players.a.position, 4);
  assert.equal(room.history.round_1.diceMoves.a.diceRoll, 3);
  assert.equal(applyRoll(room, "a", 3, 2), undefined);
});

test("roll aborts when not rolling (so caller sees committed=false)", () => {
  const room = makeRoom({ a: player("A") });
  assert.equal(applyRoll(room, "a", 3, 1), undefined);
});

test("finishing by dice adds a winner and can end the game", () => {
  const room = makeRoom({ a: player("A", { position: BOARD_SIZE - 2 }), b: player("B") }, { maxWinners: 1 });
  applyStartRound(room);
  applyRoll(room, "a", 6, 1);
  assert.equal(room.players.a.finished, true);
  assert.equal(room.winners.length, 1);
  assert.equal(room.phase, PHASE.ENDED);
  assert.equal(room.status, STATUS.FINISHED);
  assert.ok(room.finalPlayers.a);
});

test("start question auto-skips players who did not roll", () => {
  const room = makeRoom({ a: player("A"), b: player("B", { connected: false }) });
  applyStartRound(room);
  applyRoll(room, "a", 2, 1);
  assert.ok(applyStartQuestion(room, 10));
  assert.equal(room.phase, PHASE.QUESTION_COUNTDOWN);
  assert.equal(room.players.b.lastRoll, 0);
  assert.equal(room.history.round_1.diceMoves.b.missed, true);
});

test("reveal: correct moves forward, wrong moves back, disconnected is missed", () => {
  const room = makeRoom({
    a: player("A", { position: 10 }),
    b: player("B", { position: 10 }),
    c: player("C", { position: 10, connected: false }),
    d: player("D", { position: 10 }),
  });
  applyStartRound(room);
  for (const pid of ["a", "b", "c", "d"]) room.players[pid].hasRolled = true;
  toAnswering(room);
  const q = getQuestionFromRoom(room, room.questionIndex);
  const wrong = Object.keys(q.choices).find((k) => k !== q.correctOption);
  applyAnswer(room.players.a, q.correctOption, 5000);
  applyAnswer(room.players.b, wrong, 5000);

  assert.ok(applyReveal(room, 9000));
  assert.equal(room.players.a.position, 12);
  assert.equal(room.players.b.position, 8);
  assert.equal(room.players.c.position, 10);
  assert.equal(room.players.d.position, 8); // online แต่ไม่ตอบ = ผิด
  assert.equal(room.history.round_1.answers.c.missedAnswer, true);
  assert.equal(room.history.round_1.answers.a.correctOption, q.correctOption);
  assert.equal(room.phase, PHASE.RESULT);
});

test("reveal: finishing by answer counts as a winner and ends the game", () => {
  const room = makeRoom(
    { a: player("A", { position: BOARD_SIZE - 1 }), b: player("B") },
    { maxWinners: 1 }
  );
  applyStartRound(room);
  room.players.a.hasRolled = true;
  room.players.b.hasRolled = true;
  toAnswering(room);
  const q = getQuestionFromRoom(room, room.questionIndex);
  applyAnswer(room.players.a, q.correctOption, 5000);

  applyReveal(room, 9000);
  assert.equal(room.winners.length, 1);
  assert.equal(room.winners[0].playerId, "a");
  assert.equal(room.winners[0].finishedBy, "answer");
  assert.equal(room.phase, PHASE.ENDED);
  assert.equal(room.endInfo.endReason, "winners");
  assert.equal(room.ui.keepQuestionOnEnd, true);
});

test("reveal: simultaneous answer finishers ranked by answer time", () => {
  const room = makeRoom(
    {
      a: player("A", { position: BOARD_SIZE - 1 }),
      b: player("B", { position: BOARD_SIZE - 1 }),
      c: player("C"),
    },
    { maxWinners: 3 }
  );
  applyStartRound(room);
  for (const pid of ["a", "b", "c"]) room.players[pid].hasRolled = true;
  toAnswering(room);
  const q = getQuestionFromRoom(room, room.questionIndex);
  applyAnswer(room.players.a, q.correctOption, 6000);
  applyAnswer(room.players.b, q.correctOption, 5000);
  applyReveal(room, 9000);
  assert.deepEqual(room.winners.map((w) => w.playerId), ["b", "a"]);
  assert.equal(room.phase, PHASE.RESULT);
});

test("reveal: late answers are treated as not answered", () => {
  const room = makeRoom({ a: player("A", { position: 10 }) });
  applyStartRound(room);
  room.players.a.hasRolled = true;
  toAnswering(room, 0);
  const q = getQuestionFromRoom(room, room.questionIndex);
  const deadline = room.answerStartAt + room.answerTimeSeconds * 1000;
  applyAnswer(room.players.a, q.correctOption, deadline + 10_000);
  applyReveal(room, deadline + 20_000);
  assert.equal(room.history.round_1.answers.a.answered, false);
  assert.equal(room.players.a.position, 8);
});

test("reveal at max rounds ends the game by rounds", () => {
  const room = makeRoom({ a: player("A"), b: player("B") }, { maxRounds: 1 });
  applyStartRound(room);
  room.players.a.hasRolled = true;
  room.players.b.hasRolled = true;
  toAnswering(room);
  applyReveal(room, 9000);
  assert.equal(room.phase, PHASE.ENDED);
  assert.equal(room.endInfo.endReason, "rounds");
});

test("deadline expiry marks disconnected non-answerers as missed", () => {
  const room = makeRoom({ a: player("A", { connected: false }), b: player("B") });
  applyStartRound(room);
  toAnswering(room);
  assert.ok(applyDeadlineExpired(room, 99));
  assert.equal(room.players.a.missedAnswerRound, 1);
  assert.equal(room.players.b.missedAnswerRound, undefined);
  assert.equal(applyDeadlineExpired(room, 100), undefined);
});

test("applyAnswer aborts for a missing player; finished players may still answer (practice)", () => {
  assert.equal(applyAnswer(null, "A", 1), undefined);
  assert.ok(applyAnswer(player("A", { finished: true }), "A", 1));
});

test("reveal: finished player's answer is recorded as practice — no move, no rank change", () => {
  const room = makeRoom(
    { w: player("W", { position: BOARD_SIZE, finished: true, finishedRound: 1 }), x: player("X", { position: BOARD_SIZE, finished: true }), a: player("A", { position: 10 }) },
    { maxWinners: 5 }
  );
  room.winners = [{ playerId: "w", rank: 1 }, { playerId: "x", rank: 2 }];
  applyStartRound(room);
  room.players.a.hasRolled = true;
  toAnswering(room);
  const q = getQuestionFromRoom(room, room.questionIndex);
  const wrong = Object.keys(q.choices).find((k) => k !== q.correctOption);
  applyAnswer(room.players.w, wrong, 5000); // x ไม่ตอบ
  applyAnswer(room.players.a, q.correctOption, 5000);

  assert.ok(applyReveal(room, 9000));
  const w = room.history.round_1.answers.w;
  assert.deepEqual([w.practice, w.answered, w.correct, w.selectedOption], [true, true, false, wrong]);
  assert.equal(w.finalPosition, BOARD_SIZE);
  assert.ok(Number.isFinite(w.answerTimeMs));
  const x = room.history.round_1.answers.x;
  assert.deepEqual([x.practice, x.answered, x.correct, x.missedAnswer], [true, false, null, false]);
  assert.equal(room.players.w.position, BOARD_SIZE);
  assert.deepEqual(room.winners.map((r) => r.playerId), ["w", "x"]);
  assert.equal(room.history.round_1.answers.a.practice, false);
  assert.equal(room.players.a.position, 12);
});
