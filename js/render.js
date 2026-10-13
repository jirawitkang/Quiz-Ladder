// render.js
// ฟังก์ชันวาด UI จาก room data (อ่านอย่างเดียว ไม่เขียน Firebase)

import { BOARD_SIZE } from "./config.js";
import { getSettings, isPlayerDone } from "./game-logic.js";
import { getQuestionSetName } from "../questions.js";
import { clampPos, escapeHtml, normalizeName, roundKey, signedText, sortedRoundNumbers } from "./utils.js";

const DICE_GLYPHS = ["☐", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
const SAFE_COLOR = /^#[0-9a-f]{3,8}$/i;

const byName = (a, b) => String(a.name || "").localeCompare(String(b.name || ""));

/* ---------- Shared: per-round symbols ---------- */

// รอบที่เข้าเส้นชัย: ใช้ค่าจาก player ก่อน ถ้าไม่มีให้หาจาก history
function resolveFinishInfo(pid, p, history) {
  if (Number.isFinite(p?.finishedRound)) {
    return { finishRound: p.finishedRound, finishBy: p.finishedBy ?? null };
  }
  for (const rn of sortedRoundNumbers(history)) {
    const rd = history[roundKey(rn)] || {};
    if ((rd.diceMoves?.[pid]?.toPosition ?? 0) >= BOARD_SIZE) return { finishRound: rn, finishBy: "dice" };
    if ((rd.answers?.[pid]?.finalPosition ?? 0) >= BOARD_SIZE) return { finishRound: rn, finishBy: "answer" };
  }
  return { finishRound: null, finishBy: null };
}

function answerSymbol(ar) {
  const neutral =
    ar.correct == null &&
    ar.answered === false &&
    (ar.basePosition ?? 0) >= BOARD_SIZE &&
    (ar.finalPosition ?? 0) >= BOARD_SIZE;
  if (neutral) return "➖";
  if (ar.missedAnswer === true) return "⚠️";
  if (ar.answered === true && ar.correct === true) return "✅";
  return "❌";
}

// สร้างข้อความ "ผลทอย" และ "ผลคำตอบ" ต่อรอบ ของผู้เล่นหนึ่งคน
function buildRoundSymbols(pid, finish, history, roundsToShow) {
  let rolls = "";
  let answers = "";

  for (let rn = 1; rn <= roundsToShow; rn++) {
    const rd = history[roundKey(rn)] || {};
    const hasAnswers = !!rd.answers && Object.keys(rd.answers).length > 0;

    if (finish.finishRound != null && rn > finish.finishRound) {
      rolls += "☐";
      if (hasAnswers) answers += "➖";
      continue;
    }

    const dm = rd.diceMoves?.[pid];
    if (dm && dm.diceRoll != null) rolls += DICE_GLYPHS[Number(dm.diceRoll)] || "";

    const ar = rd.answers?.[pid];
    if (ar) answers += answerSymbol(ar);
    else if (hasAnswers && rn === finish.finishRound && finish.finishBy === "dice") answers += "➖";
  }

  return { rolls: rolls || "-", answers: answers || "-" };
}

/* ---------- Lobby badges ---------- */

export function renderLobbyBadges(el, room, roomCode) {
  if (!el) return;
  const s = getSettings(room);
  const items = [
    `Room: ${roomCode || "-"}`,
    `Host: ${room.hostName || "-"}`,
    `ชุดคำถาม: ${getQuestionSetName(s.questionSetId)}`,
    `รอบสูงสุด: ${s.maxRounds}`,
    `เข้าเส้นชัย: ${s.maxWinners} คน`,
    `ถูก: ${signedText(s.rewardCorrect)}`,
    `ผิด/ไม่ทัน: ${signedText(s.penaltyWrong)}`,
  ];
  el.innerHTML = items.map((t) => `<div class="lobby-badge">${escapeHtml(t)}</div>`).join("");
}

/* ---------- Player list (lobby / in-game) ---------- */

export function renderPlayerList(el, room, players) {
  if (!el) return;

  const entries = Object.entries(players || {});
  if (entries.length === 0) {
    el.innerHTML = `<div class="muted">ยังไม่มีผู้เล่นเข้าห้อง</div>`;
    return;
  }

  const history = room.history || {};
  const currentRound = Number(room.currentRound || 0);
  const curr = history[roundKey(currentRound)] || {};

  const rows = entries
    .map(([pid, p]) => ({ pid, p, name: normalizeName(p.name || pid) }))
    .sort(byName)
    .map(({ pid, p, name }, index) => {
      const connected = p.connected !== false;
      const dm = curr.diceMoves?.[pid];
      const ar = curr.answers?.[pid];

      // ทอยเองจริง = มีแต้ม > 0 และไม่ได้ถูก auto-skip
      const rolledThisRound = !!dm && dm.missed !== true && Number(dm.diceRoll) > 0;
      // ถ้า host เฉลยแล้ว ใช้ record ใน history ไม่งั้นใช้สถานะ realtime
      const answeredThisRound = ar ? ar.answered === true && ar.selectedOption != null : !!p.answered;

      const offlineMark = connected ? "-" : "⚠️";
      const sym = buildRoundSymbols(pid, resolveFinishInfo(pid, p, history), history, currentRound);

      return `
        <tr>
          <td>${index + 1}</td>
          <td class="name-col">${escapeHtml(name)}</td>
          <td>${clampPos(p.position)}</td>
          <td>${rolledThisRound ? "🎲" : offlineMark}</td>
          <td>${answeredThisRound ? "✔️" : offlineMark}</td>
          <td class="rolls-col"><span class="rolls-text">${sym.rolls}</span></td>
          <td>${sym.answers}</td>
          <td>${isPlayerDone(p) ? "🏁 เข้าเส้นชัย" : "-"}</td>
        </tr>`;
    })
    .join("");

  el.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th class="name-col">รายชื่อผู้เล่น</th>
          <th>ตำแหน่ง</th>
          <th>ทอยแล้ว</th>
          <th>ตอบแล้ว</th>
          <th>ผลทอย</th>
          <th>ผลคำตอบ</th>
          <th>สถานะผู้เล่น</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/* ---------- Board ---------- */

// สถานะของแต่ละช่อง: past / dice / wrong / correct (ค่าที่สำคัญกว่าทับค่าก่อน)
function buildCellStates(pid, p, currentRoundData) {
  const state = new Array(BOARD_SIZE + 1).fill("none");
  const priority = { none: 0, past: 1, dice: 2, wrong: 3, correct: 4 };
  const mark = (from, to, value) => {
    for (let pos = Math.max(1, from); pos <= Math.min(BOARD_SIZE, to); pos++) {
      if (priority[value] > priority[state[pos]]) state[pos] = value;
    }
  };

  const startOfRound = clampPos(p.startOfRoundPos ?? 1);
  const currentPos = clampPos(p.position);
  mark(1, startOfRound, "past");

  const rec = currentRoundData.answers?.[pid];
  if (!rec) {
    if (p.hasRolled && p.lastRoll != null) mark(startOfRound + 1, currentPos, "dice");
  } else {
    const basePos = clampPos(rec.basePosition ?? startOfRound);
    const finalPos = clampPos(rec.finalPosition ?? currentPos);
    mark(startOfRound + 1, basePos, "dice");
    mark(Math.min(basePos, finalPos) + 1, Math.max(basePos, finalPos), rec.correct ? "correct" : "wrong");
  }
  return state;
}

let lastBoardKey = null;

export function resetBoardCache() {
  lastBoardKey = null;
}

export function renderBoard(el, room, players, myPlayerId) {
  if (!el) return;

  const currentRoundData = room.history?.[roundKey(room.currentRound || 0)] || {};

  // วาดใหม่เฉพาะเมื่อข้อมูลที่ใช้เปลี่ยน (room update เกิดบ่อยมากระหว่างตอบคำถาม)
  const key = JSON.stringify([players, currentRoundData.answers || null, myPlayerId]);
  if (key === lastBoardKey && el.childElementCount > 0) return;
  lastBoardKey = key;

  let labelCells = `<div class="cell-card start-cell"><span class="cell-label">START</span></div>`;
  for (let i = 1; i <= BOARD_SIZE; i++) {
    labelCells += `<div class="cell-card play-cell"><span class="cell-label">${i}</span></div>`;
  }
  labelCells += `<div class="cell-card finish-cell"><span class="cell-label">FINISH</span></div>`;

  let html = `<div class="board-label-row"><div class="board-track">${labelCells}</div></div>`;

  const sorted = Object.entries(players || {}).sort(([, a], [, b]) => byName(a, b));
  for (const [pid, p] of sorted) {
    const offline = p.connected === false;
    const offCls = offline ? " cell-disconnected" : "";
    const rowCls = ["player-row", offline && "player-disconnected", pid === myPlayerId && "is-me"]
      .filter(Boolean)
      .join(" ");

    const states = buildCellStates(pid, p, currentRoundData);
    const playerPos = clampPos(p.position);
    const color = SAFE_COLOR.test(p.color || "") ? p.color : "#ffb300";
    const initial = escapeHtml(String(p.name || "?").charAt(0));

    let cells = `<div class="cell-card start-cell${offCls}">${escapeHtml(p.name || pid)}</div>`;
    for (let pos = 1; pos <= BOARD_SIZE; pos++) {
      const stateCls = states[pos] !== "none" ? ` cell-${states[pos]}` : "";
      const token =
        playerPos === pos
          ? `<div class="token" style="background-color:${color}"><div class="token-inner">${initial}</div></div>`
          : "";
      cells += `<div class="cell-card play-cell${offCls}${stateCls}">${token}</div>`;
    }
    cells += `<div class="cell-card finish-cell${offCls}"></div>`;

    html += `<div class="${rowCls}"><div class="board-track">${cells}</div></div>`;
  }

  el.innerHTML = html;
}

/* ---------- Question choices ---------- */

export function renderChoices(el, question, { selected = null, showResult = false, disabled = false } = {}) {
  if (!el) return;
  if (!question) {
    el.innerHTML = "";
    return;
  }

  el.innerHTML = Object.entries(question.choices)
    .map(([key, text]) => {
      const cls = ["choice-btn"];
      if (showResult) {
        if (key === question.correctOption) cls.push("correct");
        else if (key === selected) cls.push("wrong");
      } else if (key === selected) {
        cls.push("selected");
      }
      const isDisabled = showResult || disabled;
      return `<button type="button" class="${cls.join(" ")}" data-key="${escapeHtml(key)}"${
        isDisabled ? " disabled" : ""
      }>${escapeHtml(key)}. ${escapeHtml(text)}</button>`;
    })
    .join("");
}

/* ---------- End game summary ---------- */

function collectPlayerStats(players, history) {
  const stats = {};
  const ensure = (pid, name) => {
    if (!stats[pid]) {
      const p = players[pid] || {};
      stats[pid] = {
        id: pid,
        name: p.name || name || pid,
        player: p,
        finalPosition: clampPos(p.position),
        correct: 0,
        answeredTotal: 0,
      };
    }
    return stats[pid];
  };

  for (const pid of Object.keys(players)) ensure(pid);

  for (const rn of sortedRoundNumbers(history)) {
    const rd = history[roundKey(rn)] || {};
    for (const [pid, dm] of Object.entries(rd.diceMoves || {})) ensure(pid, dm.playerName);
    for (const [pid, ar] of Object.entries(rd.answers || {})) {
      const s = ensure(pid, ar.playerName);
      if (answerSymbol(ar) === "➖") continue;
      s.answeredTotal += 1;
      if (ar.correct === true) s.correct += 1;
      // ผู้เล่นที่ไม่มีใน players (ข้อมูลเก่า) ใช้ตำแหน่งล่าสุดจาก history
      if (!players[pid] && Number.isFinite(ar.finalPosition)) s.finalPosition = ar.finalPosition;
    }
  }

  for (const s of Object.values(stats)) {
    Object.assign(s, resolveFinishInfo(s.id, s.player, history));
    s.finished = isPlayerDone(s.player) || s.finishRound != null;
    s.pctCorrect = s.answeredTotal > 0 ? (s.correct / s.answeredTotal) * 100 : 0;
  }
  return Object.values(stats);
}

export function renderEndGameSummary({ titleEl, summaryEl }, room, players) {
  const history = room.history || {};
  const settings = getSettings(room);
  const endReason = room.endInfo?.endReason;
  const playerCount = Object.keys(players || {}).length;

  let reasonText = "เกมจบแล้ว";
  if (endReason === "winners") {
    reasonText = `เกมจบเพราะมีผู้เข้าเส้นชัยครบ ${Math.min(settings.maxWinners, playerCount)} คน`;
  } else if (endReason === "rounds") {
    reasonText = `เกมจบเพราะเล่นครบ ${settings.maxRounds} รอบแล้ว`;
  }

  const winnerRank = new Map((room.winners || []).map((w) => [w.playerId, w.rank ?? Infinity]));
  const stats = collectPlayerStats(players || {}, history).sort(
    (a, b) =>
      (winnerRank.get(a.id) ?? Infinity) - (winnerRank.get(b.id) ?? Infinity) ||
      (a.finishRound ?? Infinity) - (b.finishRound ?? Infinity) ||
      b.finalPosition - a.finalPosition ||
      b.pctCorrect - a.pctCorrect ||
      byName(a, b)
  );

  const roundsToShow = Number(room.currentRound || 0) || sortedRoundNumbers(history).length;
  const finishByIcon = { dice: "🎲", answer: "📝" };

  const rows = stats
    .map((s, i) => {
      const sym = buildRoundSymbols(s.id, s, history, roundsToShow);
      return `
        <tr>
          <td>${i + 1}</td>
          <td class="name-col">${escapeHtml(s.name)}</td>
          <td>${s.finalPosition}</td>
          <td>${s.finished ? "🏆" : "-"}</td>
          <td>${s.finishRound ?? "-"}</td>
          <td>${s.finished ? finishByIcon[s.finishBy] || "✖️" : "-"}</td>
          <td class="rolls-col"><span class="rolls-text">${sym.rolls}</span></td>
          <td>${sym.answers}</td>
        </tr>`;
    })
    .join("");

  if (titleEl) {
    titleEl.innerHTML = `สรุปผลเกม <span class="muted end-reason">• ${escapeHtml(reasonText)}</span>`;
  }
  if (summaryEl) {
    summaryEl.innerHTML = `
      <h4 class="end-table-title">ตารางอันดับผู้เล่น</h4>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th class="name-col">รายชื่อผู้เล่น</th>
            <th>ตำแหน่ง</th>
            <th>เข้าเส้นชัย?</th>
            <th>รอบที่เข้า</th>
            <th>วิธีเข้า</th>
            <th>ผลทอย</th>
            <th>ผลคำตอบ</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }
}
