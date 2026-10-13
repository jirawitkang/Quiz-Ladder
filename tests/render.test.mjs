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
  // รอบ 1 ตอบถูกแล้วขึ้นบันได 9 → 18, รอบ 3 ทอยเข้าเส้นชัย (ไม่ต้องตอบ)
  assert.equal(alice.totalCorrect, 2);
  assert.equal(alice.finishBy, "dice");
  const bob = t.playersRows.find((r) => r.playerId === "b");
  assert.equal(bob.totalTimeout, 3);
  assert.ok(t.answersRows.every((r) => r.correctOption));
});
