// export.js
// Export ผลเกมเป็นไฟล์ Excel (SheetJS โหลดเมื่อกดปุ่มครั้งแรกเท่านั้น ไม่ต้องโหลดทุกครั้งที่เปิดหน้า)

import { BOARD_SIZE } from "./config.js";
import { getSettings, getViewPlayers, isPlayerDone } from "./game-logic.js";
import { pad2, roundKey, sortedRoundNumbers } from "./utils.js";

const XLSX_URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
let xlsxPromise = null;

function loadXlsx() {
  if (globalThis.XLSX) return Promise.resolve(globalThis.XLSX);
  if (!xlsxPromise) {
    xlsxPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = XLSX_URL;
      s.onload = () => resolve(globalThis.XLSX);
      s.onerror = () => {
        xlsxPromise = null;
        reject(new Error("โหลดไลบรารี XLSX ไม่สำเร็จ"));
      };
      document.head.appendChild(s);
    });
  }
  return xlsxPromise;
}

function answerResult(ar) {
  if (ar.missedAnswer === true) return "Missed";
  if (ar.answered === true) return ar.correct === true ? "Correct" : "Wrong";
  if ((ar.basePosition ?? 0) >= BOARD_SIZE) return "AlreadyFinished";
  return "Timeout";
}

export function buildExportTables(room, roomCode) {
  const history = room.history || {};
  const settings = getSettings(room);
  const endInfo = room.endInfo || {};
  const winners = Array.isArray(room.winners) ? room.winners : [];
  const players = getViewPlayers(room);
  const gameId = roomCode || null;

  const gameRows = [
    {
      gameId,
      hostName: room.hostName || null,
      status: room.status || null,
      phase: room.phase || null,
      ...settings,
      createdAt: room.createdAt ?? null,
      startedAt: room.gameStartedAt ?? null,
      endedAt: endInfo.endedAt ?? null,
      endReason: endInfo.endReason ?? null,
      winnerCount: winners.length,
      totalPlayers: Object.keys(players).length,
      totalRoundsPlayed: room.currentRound ?? null,
    },
  ];

  const answersRows = [];
  const diceRows = [];
  const totals = {};
  const bump = (pid, field) => {
    totals[pid] = totals[pid] || { Correct: 0, Wrong: 0, Timeout: 0, Missed: 0 };
    if (field in totals[pid]) totals[pid][field] += 1;
  };

  for (const rn of sortedRoundNumbers(history)) {
    const rd = history[roundKey(rn)] || {};

    for (const [pid, dm] of Object.entries(rd.diceMoves || {})) {
      diceRows.push({
        gameId,
        round: rn,
        playerId: pid,
        playerName: dm.playerName || players[pid]?.name || pid,
        diceRoll: dm.diceRoll ?? null,
        fromPosition: dm.fromPosition ?? null,
        landingPosition: dm.landingPosition ?? null,
        toPosition: dm.toPosition ?? null,
        snakeOrLadder: dm.special ?? null,
        autoSkipped: dm.missed === true,
        timestamp: dm.timestamp ?? null,
      });
    }

    for (const [pid, ar] of Object.entries(rd.answers || {})) {
      const result = answerResult(ar);
      bump(pid, result);
      answersRows.push({
        gameId,
        round: rn,
        questionSetId: ar.questionSetId ?? settings.questionSetId,
        questionIndex: ar.questionIndex ?? null,
        questionText: ar.questionText ?? null,
        correctOption: ar.correctOption ?? null,
        playerId: pid,
        playerName: ar.playerName || players[pid]?.name || pid,
        selectedOption: ar.selectedOption ?? null,
        answered: ar.answered === true,
        correct: typeof ar.correct === "boolean" ? ar.correct : null,
        missedAnswer: ar.missedAnswer === true,
        answerResult: result,
        answerTimeMs: ar.answerTimeMs ?? null,
        basePosition: ar.basePosition ?? null,
        landingPosition: ar.landingPosition ?? null,
        finalPosition: ar.finalPosition ?? null,
        snakeOrLadder: ar.special ?? null,
        blockedByRule: ar.blocked ?? null,
        positionDelta: ar.actualDelta ?? null,
        rewardOrPenalty: ar.configuredMove ?? null,
        answeredAt: ar.answeredAt ?? null,
        timestamp: ar.timestamp ?? null,
      });
    }
  }

  const rankById = new Map(winners.map((w) => [w.playerId, w.rank ?? null]));
  const playersRows = Object.entries(players).map(([pid, p]) => ({
    gameId,
    playerId: pid,
    playerName: p.name || pid,
    emoji: p.emoji || null,
    color: p.color || null,
    joinedAt: p.joinedAt ?? null,
    finished: isPlayerDone(p),
    finishRound: p.finishedRound ?? null,
    finishBy: p.finishedBy ?? null,
    finalPosition: p.position ?? 1,
    winnerRank: rankById.get(pid) ?? null,
    totalCorrect: totals[pid]?.Correct ?? 0,
    totalWrong: totals[pid]?.Wrong ?? 0,
    totalTimeout: totals[pid]?.Timeout ?? 0,
    totalMissed: totals[pid]?.Missed ?? 0,
  }));

  return { gameRows, playersRows, answersRows, diceRows };
}

function buildExportFilename(room, roomCode) {
  const qsid = String(getSettings(room).questionSetId).replace(/[^\w-]+/g, "_");
  const nPlayers = Object.keys(getViewPlayers(room)).length;
  const t = new Date(room.endInfo?.endedAt || Date.now());
  const stamp = `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}_${pad2(t.getHours())}${pad2(t.getMinutes())}`;
  return `QuizRunner_${stamp}_${qsid}_${nPlayers}players_${roomCode || "ROOM"}.xlsx`;
}

export async function exportRoomToXlsx(room, roomCode) {
  const XLSX = await loadXlsx();
  const { gameRows, playersRows, answersRows, diceRows } = buildExportTables(room, roomCode);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gameRows), "Game");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(playersRows), "Players");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(answersRows), "Answers");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(diceRows), "DiceRolls");
  XLSX.writeFile(wb, buildExportFilename(room, roomCode));
}
