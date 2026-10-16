// รัน: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";

import { PHASE, STATUS } from "../js/config.js";
import { applyAnswer, applyBeginAnswering, applyReveal, applyRoll, applyStartQuestion, applyStartRound, getViewPlayers } from "../js/game-logic.js";
import { renderEndGameSummary, renderPlayerList } from "../js/render.js";
import { buildExportTables } from "../js/export.js";
import { getQuestionFromRoom } from "../questions.js";

function playGame() {
  const room = {
    status: STATUS.IN_GAME, phase: PHASE.IDLE, currentRound: 0, winners: [], history: {},
    gameSettings: { questionSetId: "general", maxRounds: 3, maxWinners: 2, rewardCorrect: 2, penaltyWrong: -2 },
    players: {
      a: { name: "Alice", position: 1, connected: true },
      b: { name: "<b>Bob</b>", position: 1, connected: true },
    },
  };
  let t = 0;
  for (let r = 1; r <= 3 && room.phase !== PHASE.ENDED; r++) {
    applyStartRound(room);
    applyRoll(room, "a", 6, (t += 100));
    applyRoll(room, "b", 1, (t += 100));
    if (room.phase === PHASE.ENDED) break;
    applyStartQuestion(room, (t += 100));
    applyBeginAnswering(room, (t += 3000));
    const q = getQuestionFromRoom(room, room.questionIndex);
    applyAnswer(room.players.a, q.correctOption, (t += 1000));
    applyReveal(room, (t += 1000));
  }
  return room;
}

test("full game renders player list and summary without errors", () => {
  const room = playGame();
  assert.equal(room.phase, PHASE.ENDED);

  const list = { innerHTML: "" };
  renderPlayerList(list, room, room.players);
  assert.match(list.innerHTML, /Alice/);
  assert.match(list.innerHTML, /&lt;b&gt;Bob/); // escaped
  assert.doesNotMatch(list.innerHTML, /<b>Bob/);

  const title = { innerHTML: "" };
  const summary = { innerHTML: "" };
  renderEndGameSummary({ titleEl: title, summaryEl: summary }, room, getViewPlayers(room));
  assert.match(title.innerHTML, /3 รอบ/);
  assert.match(summary.innerHTML, /✅/); // Alice ตอบถูก
  assert.match(summary.innerHTML, /❌/); // Bob ไม่ตอบ
});

test("export tables include room code and totals", () => {
  const room = playGame();
  const t = buildExportTables(room, "ABC123");
  assert.equal(t.gameRows[0].gameId, "ABC123");
  assert.equal(t.answersRows.length, 6);
  const alice = t.playersRows.find((r) => r.playerId === "a");
  // ทอย 6 + ตอบถูก +2 ทุกรอบ: 1 → 9 → 17 (ปีนบันไดส้มไป 20) → 28 (ตอบถูกจึงไม่ร่วงบันไดม่วงที่ 28)
  assert.equal(alice.totalCorrect, 3);
  assert.equal(room.players.a.position, 28);
  assert.ok(!alice.finishBy);
  const bob = t.playersRows.find((r) => r.playerId === "b");
  assert.equal(bob.totalTimeout, 3);
  assert.ok(t.answersRows.every((r) => r.correctOption));
});

test("podium shows top 3 in 2-1-3 order with medals; non-finishers ranked by position", async () => {
  const { renderPodium, computeStandings } = await import("../js/render.js");
  const room = {
    status: STATUS.FINISHED,
    phase: PHASE.ENDED,
    winners: [{ playerId: "b", rank: 1 }],
    history: {},
    players: {
      a: { name: "A", emoji: "🍎", color: "#e53935", position: 12 },
      b: { name: "B", emoji: "🍕", color: "#3949ab", position: 30, finished: true, finishedRound: 3 },
      c: { name: "C", emoji: "🍣", color: "#43a047", position: 20 },
      d: { name: "D", emoji: "🍩", color: "#fb8c00", position: 5 },
    },
  };
  assert.deepEqual(computeStandings(room, room.players).map((s) => s.id), ["b", "c", "a", "d"]);
  const el = { innerHTML: "" };
  renderPodium(el, room, room.players, "a");
  const order = [...el.innerHTML.matchAll(/podium-col rank-(\d)/g)].map((m) => m[1]);
  assert.deepEqual(order, ["2", "1", "3"]);
  assert.match(el.innerHTML, /rank-1"?[^>]*>[\s\S]*🍕/);
  assert.match(el.innerHTML, /rank-3 me/); // A อันดับ 3 และเป็นผู้เล่นของเครื่องนี้
});
