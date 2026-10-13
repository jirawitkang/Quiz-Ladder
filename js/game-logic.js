// game-logic.js
// กติกาเกมแบบ pure function: รับ room object แล้วแก้ไขในที่ (ใช้ภายใน runTransaction)
// คืนค่า room เพื่อ commit หรือ undefined เพื่อยกเลิก transaction
// ไม่ import Firebase/DOM จึงทดสอบด้วย node ได้ (ดู tests/game-logic.test.mjs)

import {
  ANSWER_GRACE_MS,
  BOARD_SIZE,
  DEFAULT_SETTINGS,
  PHASE,
  QUESTION_COUNTDOWN_SECONDS,
  STATUS,
} from "./config.js";
import { clampPos, deepClone, getPathCells, roundKey } from "./utils.js";
import { getQuestionFromRoom, getQuestionSetLengthForRoom } from "../questions.js";

/* ---------- Queries ---------- */

export function getSettings(room) {
  const gs = room?.gameSettings || {};
  const num = (v, d) => (Number.isFinite(v) ? v : d);
  return {
    questionSetId: gs.questionSetId || DEFAULT_SETTINGS.questionSetId,
    maxRounds: Math.max(1, num(gs.maxRounds, DEFAULT_SETTINGS.maxRounds)),
    maxWinners: Math.max(1, num(gs.maxWinners, DEFAULT_SETTINGS.maxWinners)),
    rewardCorrect: num(gs.rewardCorrect, DEFAULT_SETTINGS.rewardCorrect),
    penaltyWrong: num(gs.penaltyWrong, DEFAULT_SETTINGS.penaltyWrong),
  };
}

export function isPlayerDone(p) {
  return !!p?.finished || clampPos(p?.position) >= BOARD_SIZE;
}

export function isGameEnded(room) {
  return room?.phase === PHASE.ENDED || room?.status === STATUS.FINISHED;
}

// ผู้เล่นที่ใช้แสดงผล: เมื่อเกมจบใช้ snapshot ตอนจบ เพื่อให้ภาพคงเดิมแม้มีคนออก
export function getViewPlayers(room) {
  if (isGameEnded(room) && room.finalPlayers && typeof room.finalPlayers === "object") {
    return room.finalPlayers;
  }
  return room?.players || {};
}

export function getAnswerDeadline(room) {
  const { answerStartAt: start, answerTimeSeconds: secs } = room || {};
  if (!Number.isFinite(start) || !Number.isFinite(secs)) return null;
  return start + secs * 1000;
}

// คำตอบนับได้เมื่อส่งภายในช่วงเวลาตอบของรอบนี้ (ข้อมูลเก่าที่ไม่มี timestamp ถือว่านับ)
export function isAnswerOnTime(room, p) {
  if (!p?.answered || p.answer == null) return false;
  const at = p.answerUpdatedAt;
  const start = room.answerStartAt;
  const deadline = getAnswerDeadline(room);
  if (!Number.isFinite(at) || deadline == null) return true;
  return at >= start - ANSWER_GRACE_MS && at <= deadline + ANSWER_GRACE_MS;
}

/* ---------- Internal helpers ---------- */

function ensureRoundHistory(room, round) {
  room.history = room.history || {};
  const key = roundKey(round);
  room.history[key] = room.history[key] || {};
  return room.history[key];
}

function markFinished(room, pid, p, round, by) {
  p.finished = true;
  p.finishedRound = round;
  p.finishedBy = by;

  room.winners = Array.isArray(room.winners) ? room.winners : [];
  if (!room.winners.some((w) => w.playerId === pid)) {
    room.winners.push({
      playerId: pid,
      playerName: p.name || pid,
      finishedRound: round,
      finishedBy: by,
      rank: room.winners.length + 1,
    });
  }
}

function endGame(room, now, reason) {
  const settings = getSettings(room);
  room.phase = PHASE.ENDED;
  room.status = STATUS.FINISHED;
  room.endInfo = {
    endedAt: now,
    endReason: reason,
    maxRounds: settings.maxRounds,
    maxWinners: settings.maxWinners,
    winnerCount: (room.winners || []).length,
  };
  if (!room.finalPlayers) {
    room.finalPlayers = deepClone(room.players || {});
    room.finalWinners = (room.winners || []).slice();
  }
}

// ตรวจเงื่อนไขจบเกม คืน true ถ้าจบ
function endGameIfDone(room, now, { roundsExhausted = false } = {}) {
  const players = Object.values(room.players || {});
  const total = players.length;
  if (total === 0) return false;

  const { maxWinners } = getSettings(room);
  const winnerCount = (room.winners || []).length;
  const doneCount = players.filter(isPlayerDone).length;

  let reason = null;
  if (winnerCount >= Math.min(maxWinners, total) || doneCount === total) reason = "winners";
  else if (roundsExhausted) reason = "rounds";
  if (!reason) return false;

  endGame(room, now, reason);
  return true;
}

/* ---------- Transactions (room level) ---------- */

export function applyStartRound(room) {
  if (!room) return room;
  if (room.status !== STATUS.IN_GAME) return;

  const phase = room.phase || PHASE.IDLE;
  if (phase !== PHASE.IDLE && phase !== PHASE.RESULT) return;

  const { maxRounds } = getSettings(room);
  const currentRound = room.currentRound || 0;
  if (currentRound >= maxRounds) return;

  const newRound = currentRound + 1;
  room.currentRound = newRound;
  room.phase = PHASE.ROLLING;
  room.questionIndex = (newRound - 1) % getQuestionSetLengthForRoom(room);
  room.questionCountdownStartAt = null;
  room.answerStartAt = null;
  room.answerTimeSeconds = null;
  room.answerDeadlineExpired = false;

  for (const p of Object.values(room.players || {})) {
    const posNow = clampPos(p.position);
    p.startOfRoundPos = posNow;
    if (isPlayerDone(p)) {
      p.hasRolled = true;
    } else {
      p.lastRoll = null;
      p.hasRolled = false;
    }
    p.answered = false;
    p.answer = null;
    p.answerUpdatedAt = null;
    p.lastAnswerCorrect = null;
  }
  return room;
}

export function applyRoll(room, pid, roll, now) {
  if (!room) return room;
  if (room.phase !== PHASE.ROLLING) return;
  const round = room.currentRound || 0;
  if (round <= 0) return;

  const me = room.players?.[pid];
  if (!me || isPlayerDone(me) || me.hasRolled) return;

  const startPos = clampPos(me.position);
  const newPos = clampPos(startPos + roll);

  me.lastRoll = roll;
  me.position = newPos;
  me.hasRolled = true;
  if (newPos >= BOARD_SIZE) markFinished(room, pid, me, round, "dice");

  const roundHistory = ensureRoundHistory(room, round);
  roundHistory.diceMoves = roundHistory.diceMoves || {};
  roundHistory.diceMoves[pid] = {
    playerId: pid,
    playerName: me.name || "",
    fromPosition: startPos,
    toPosition: newPos,
    diceRoll: roll,
    pathCells: getPathCells(startPos, newPos),
    timestamp: now,
  };

  endGameIfDone(room, now);
  return room;
}

export function applyStartQuestion(room, now) {
  if (!room) return room;
  if (room.phase !== PHASE.ROLLING) return;
  const round = room.currentRound || 0;
  if (round <= 0) return;

  const q = getQuestionFromRoom(room, room.questionIndex ?? 0);
  if (!q) return;

  // ใครยังเล่นอยู่แต่ไม่ได้ทอย (เช่น หลุด) → นับเป็นทอยได้ 0
  const roundHistory = ensureRoundHistory(room, round);
  roundHistory.diceMoves = roundHistory.diceMoves || {};
  for (const [pid, p] of Object.entries(room.players || {})) {
    if (isPlayerDone(p) || p.hasRolled) continue;
    const posNow = clampPos(p.position);
    p.hasRolled = true;
    p.lastRoll = 0;
    if (!roundHistory.diceMoves[pid]) {
      roundHistory.diceMoves[pid] = {
        playerId: pid,
        playerName: p.name || "",
        fromPosition: posNow,
        toPosition: posNow,
        diceRoll: 0,
        pathCells: [],
        timestamp: now,
        missed: true,
      };
    }
  }

  room.phase = PHASE.QUESTION_COUNTDOWN;
  room.questionCountdownStartAt = now;
  room.questionCountdownSeconds = QUESTION_COUNTDOWN_SECONDS;
  room.answerStartAt = null;
  room.answerTimeSeconds = q.timeLimit;
  room.answerDeadlineExpired = false;
  return room;
}

export function applyBeginAnswering(room, now) {
  if (!room) return room;
  if (room.phase !== PHASE.QUESTION_COUNTDOWN) return;
  room.phase = PHASE.ANSWERING;
  room.answerStartAt = now;
  room.answerDeadlineExpired = false;
  return room;
}

export function applyDeadlineExpired(room, now) {
  if (!room) return room;
  if (room.phase !== PHASE.ANSWERING || room.answerDeadlineExpired === true) return;
  const round = room.currentRound || 0;
  if (round <= 0) return;

  room.answerDeadlineExpired = true;
  room.answerDeadlineExpiredAt = now;

  // คนที่ยังเล่นอยู่ + หลุดตอนหมดเวลา + ยังไม่ตอบ → ล็อกว่า missed รอบนี้ (ไม่โดนหัก)
  for (const p of Object.values(room.players || {})) {
    if (!isPlayerDone(p) && p.connected === false && p.answered !== true) {
      p.missedAnswerRound = round;
      p.missedAnswerAt = now;
    }
  }
  return room;
}

export function applyReveal(room, now) {
  if (!room) return room;
  if (room.phase !== PHASE.ANSWERING) return;

  const questionIndex = room.questionIndex ?? 0;
  const q = getQuestionFromRoom(room, questionIndex);
  if (!q) return;

  const settings = getSettings(room);
  const round = room.currentRound || 0;
  const roundHistory = ensureRoundHistory(room, round);
  roundHistory.answers = roundHistory.answers || {};

  const finishedByAnswer = [];

  for (const [pid, p] of Object.entries(room.players || {})) {
    const basePos = clampPos(p.position);
    const alreadyDone = isPlayerDone(p);
    const onTime = !alreadyDone && isAnswerOnTime(room, p);
    const answered = onTime;
    const selected = onTime ? p.answer : null;

    // หลุดและไม่ได้ตอบ → missed (ไม่ขยับ) ส่วนคนที่ออนไลน์แต่ไม่ตอบ → นับเป็นผิด
    const missedAnswer =
      !alreadyDone &&
      !answered &&
      (p.missedAnswerRound === round || p.connected === false);

    let correct = null;
    let configuredMove = 0;
    let finalPos = basePos;

    if (!alreadyDone && !missedAnswer) {
      correct = answered && selected === q.correctOption;
      configuredMove = correct ? settings.rewardCorrect : settings.penaltyWrong;
      finalPos = clampPos(basePos + configuredMove);
      p.position = finalPos;
      p.lastAnswerCorrect = correct;
      if (finalPos >= BOARD_SIZE) finishedByAnswer.push([pid, p]);
    } else if (missedAnswer) {
      p.lastAnswerCorrect = null;
    }

    roundHistory.answers[pid] = {
      playerId: pid,
      playerName: p.name || "",
      questionSetId: settings.questionSetId,
      questionIndex,
      questionText: q.text,
      correctOption: q.correctOption,
      selectedOption: selected,
      correct,
      answered,
      missedAnswer,
      diceRoll: p.lastRoll ?? null,
      basePosition: basePos,
      finalPosition: finalPos,
      configuredMove,
      actualDelta: finalPos - basePos,
      answeredAt: answered ? p.answerUpdatedAt ?? null : null,
      answerTimeMs:
        answered && Number.isFinite(p.answerUpdatedAt) && Number.isFinite(room.answerStartAt)
          ? Math.max(0, p.answerUpdatedAt - room.answerStartAt)
          : null,
      timestamp: now,
    };
  }

  // คนที่เข้าเส้นชัยพร้อมกันจากการตอบ: ใครตอบเร็วกว่าได้อันดับดีกว่า
  finishedByAnswer
    .sort(([, a], [, b]) => (a.answerUpdatedAt ?? Infinity) - (b.answerUpdatedAt ?? Infinity))
    .forEach(([pid, p]) => markFinished(room, pid, p, round, "answer"));

  const ended = endGameIfDone(room, now, { roundsExhausted: round >= settings.maxRounds });
  if (ended) {
    // ให้ UI ค้างหน้าเฉลยข้อสุดท้ายไว้
    room.ui = {
      keepQuestionOnEnd: true,
      keepQuestionRound: round,
      keepQuestionIndex: questionIndex,
      keepQuestionSetId: settings.questionSetId,
    };
  } else {
    room.phase = PHASE.RESULT;
  }
  return room;
}

/* ---------- Transactions (player level) ---------- */

// ใช้กับ transaction บน rooms/{code}/players/{pid} เท่านั้น — ไม่ชนกับผู้เล่นคนอื่น
export function applyAnswer(player, optionKey, now) {
  if (!player || isPlayerDone(player)) return;
  player.answer = optionKey;
  player.answered = true;
  player.answerUpdatedAt = now;
  return player;
}
