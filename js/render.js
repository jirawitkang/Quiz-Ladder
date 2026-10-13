// render.js
// ฟังก์ชันวาด UI จาก room data (อ่านอย่างเดียว ไม่เขียน Firebase)

import { BOARD_SIZE, PHASE, STATUS } from "./config.js";
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

/* ---------- Lobby: player chips ---------- */

export function renderLobbyPlayers(el, players, myPlayerId = null) {
  if (!el) return;
  const list = Object.entries(players || {}).sort(([, a], [, b]) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0));
  if (!list.length) {
    el.innerHTML = `<div class="muted">ยังไม่มีผู้เล่นเข้าห้อง แชร์ Race Code ให้ผู้เล่นได้เลย</div>`;
    return;
  }
  el.innerHTML = list
    .map(([pid, p]) => {
      const cls = ["pchip", !p.emoji && "waiting", pid === myPlayerId && "me"].filter(Boolean).join(" ");
      const color = SAFE_COLOR.test(p.color || "") ? p.color : "#9e9e9e";
      const title = `${p.name}${p.emoji ? "" : " · ยังไม่เลือกตัวหมาก"}`;
      return `<div class="${cls}" title="${escapeHtml(title)}"><span class="pchip-av" style="--c:${color}">${
        escapeHtml(p.emoji || "❔")
      }</span><span class="pchip-name">${escapeHtml(p.name)}</span></div>`;
    })
    .join("");
}

/* ---------- Lobby: emoji picker ---------- */

// taken: Map emoji -> pid
export function renderEmojiPicker(el, { choices, taken, players, myPlayerId, themeSize }) {
  if (!el) return;
  const top = el.scrollTop;
  el.innerHTML = choices
    .map((emoji, i) => {
      const owner = taken.get(emoji);
      const mine = owner === myPlayerId;
      const takenByOther = owner && !mine;
      const label = takenByOther ? players[owner]?.name || "" : mine ? "คุณ" : "";
      const reserve = i === themeSize ? `<div class="pick-reserve">ตัวสำรอง · เพิ่มเพราะผู้เล่นเกิน ${themeSize} คน</div>` : "";
      const aria = `${emoji}${takenByOther ? ` เลือกแล้วโดย ${label}` : mine ? " ตัวของคุณ" : " ว่าง"}`;
      return `${reserve}<button type="button" class="pick-tile${mine ? " mine" : ""}" data-emoji="${escapeHtml(emoji)}"${
        takenByOther ? " disabled" : ""
      } aria-label="${escapeHtml(aria)}"><span>${escapeHtml(emoji)}</span><small>${escapeHtml(label)}</small></button>`;
    })
    .join("");
  el.scrollTop = top;
}

/* ---------- Host: waiting panel ---------- */

// รายชื่อคนที่ยังไม่ได้ทำสิ่งที่รออยู่ (เลือกตัวหมาก / ทอย / ตอบ)
export function renderWaitPanel(el, room) {
  if (!el) return;
  const phase = room.phase || PHASE.IDLE;
  const players = Object.values(room.players || {});

  let title = null;
  let doneOf = null;
  let pendingLabel = "";
  let pool = players;

  if (room.status === STATUS.LOBBY) {
    [title, pendingLabel, doneOf] = ["เลือกตัวหมากแล้ว", "ยังไม่เลือก:", (p) => !!p.emoji];
  } else if (phase === PHASE.ROLLING) {
    [title, pendingLabel, doneOf] = ["ทอยแล้ว", "ยังไม่ทอย:", (p) => !!p.hasRolled];
    pool = players.filter((p) => !isPlayerDone(p));
  } else if (phase === PHASE.ANSWERING) {
    [title, pendingLabel, doneOf] = ["ตอบแล้ว", "ยังไม่ตอบ:", (p) => !!p.answered];
    pool = players.filter((p) => !isPlayerDone(p));
  }

  if (!title) {
    const text = {
      [PHASE.IDLE]: "รอเริ่มรอบใหม่",
      [PHASE.QUESTION_COUNTDOWN]: "กำลังนับถอยหลังก่อนแสดงคำถาม",
      [PHASE.RESULT]: "เฉลยแล้ว กดเริ่มรอบใหม่เพื่อเล่นต่อ",
      [PHASE.ENDED]: "เกมจบแล้ว",
    }[phase] || "";
    el.innerHTML = `<div class="wait-note">${escapeHtml(text)}</div>`;
    return;
  }

  const online = pool.filter((p) => p.connected !== false);
  const done = online.filter(doneOf).length;
  const pending = pool.filter((p) => !doneOf(p));
  const pct = online.length ? (done / online.length) * 100 : 0;
  const chip = (p) =>
    `<span class="${p.connected === false ? "offline" : ""}">${escapeHtml(p.emoji ? `${p.emoji} ` : "")}${escapeHtml(p.name)}${
      p.connected === false ? " 📴" : ""
    }</span>`;

  el.innerHTML = `
    <div class="wait-head"><span>${title}</span><b>${done}/${online.length}</b></div>
    <div class="meter"><i style="width:${pct}%"></i></div>
    <div class="wait-who">${
      pending.length
        ? `<span class="wait-label">${pendingLabel}</span>${pending.map(chip).join("")}`
        : `<span class="wait-done">✔️ ครบทุกคนแล้ว</span>`
    }</div>`;
}

/* ---------- Host: leaderboard ---------- */

function statusIcon(p, phase) {
  if (isPlayerDone(p)) return "🏁";
  if (p.connected === false) return "📴";
  if (phase === PHASE.ROLLING) return p.hasRolled ? "✔️" : "⏳";
  if (phase === PHASE.ANSWERING) return p.answered ? "✔️" : "⏳";
  return "";
}

export function renderLeaderboard(el, room, players) {
  if (!el) return;
  const phase = room.phase || PHASE.IDLE;
  const rank = new Map((room.winners || []).map((w) => [w.playerId, w.rank ?? Infinity]));
  const rows = Object.entries(players || {})
    .map(([pid, p]) => ({ pid, ...p, pos: clampPos(p.position) }))
    .sort((a, b) => (rank.get(a.pid) ?? Infinity) - (rank.get(b.pid) ?? Infinity) || b.pos - a.pos || byName(a, b));

  const top = el.scrollTop;
  el.innerHTML = rows
    .map((p, i) => {
      const color = SAFE_COLOR.test(p.color || "") ? p.color : "#9e9e9e";
      const ans = p.lastAnswerCorrect === true ? "✅" : p.lastAnswerCorrect === false ? "❌" : "";
      const roll = Number.isFinite(p.lastRoll) && p.lastRoll > 0 ? `🎲${p.lastRoll}` : "";
      const cls = [isPlayerDone(p) && "won", p.connected === false && "offline"].filter(Boolean).join(" ");
      return `<li class="${cls}">
        <span class="lb-rank">${i + 1}</span>
        <span class="lb-av" style="--c:${color}">${escapeHtml(p.emoji || "❔")}</span>
        <span class="lb-name">${escapeHtml(p.name)}</span>
        <span class="lb-meta">ช่อง <b>${p.pos}</b>${roll || ans ? ` · ${roll} ${ans}` : ""}</span>
        <span class="lb-st">${statusIcon(p, phase)}</span>
      </li>`;
    })
    .join("");
  el.scrollTop = top;
}

/* ---------- Host: event feed ---------- */

// เหตุการณ์เด่นจาก history (บันได/งู/เข้าเส้นชัย/หลุด) ใหม่สุดอยู่บน
export function buildFeedItems(room, limit = 8) {
  const history = room.history || {};
  const players = room.players || {};
  const items = [];
  const who = (pid, rec) => `${players[pid]?.emoji ? `${players[pid].emoji} ` : ""}${rec.playerName || players[pid]?.name || pid}`;

  for (const rn of sortedRoundNumbers(history)) {
    const rd = history[roundKey(rn)] || {};
    for (const [pid, dm] of Object.entries(rd.diceMoves || {})) {
      const t = dm.timestamp ?? 0;
      const land = dm.landingPosition ?? dm.toPosition;
      if (dm.missed) items.push({ t, kind: "block", text: `📴 ${who(pid, dm)} หลุดการเชื่อมต่อ ถูกข้ามการทอย` });
      if (dm.special === "ladder") items.push({ t, kind: "ladder", text: `🪜 ${who(pid, dm)} ขึ้นบันได ${land} → ${dm.toPosition}` });
      if (dm.special === "snake") items.push({ t, kind: "snake", text: `🐍 ${who(pid, dm)} โดนงูกัด ${land} → ${dm.toPosition}` });
      if ((dm.toPosition ?? 0) >= BOARD_SIZE) items.push({ t: t + 1, kind: "finish", text: `🏁 ${who(pid, dm)} เข้าเส้นชัย!` });
    }
    for (const [pid, ar] of Object.entries(rd.answers || {})) {
      const t = ar.timestamp ?? 0;
      const land = ar.landingPosition ?? ar.finalPosition;
      if (ar.special === "ladder") items.push({ t, kind: "ladder", text: `🪜 ${who(pid, ar)} ตอบถูกแล้วขึ้นบันได ${land} → ${ar.finalPosition}` });
      if (ar.special === "snake") items.push({ t, kind: "snake", text: `🐍 ${who(pid, ar)} ตอบผิดแล้วโดนงูกัด ${land} → ${ar.finalPosition}` });
      if (ar.blocked === "snake") items.push({ t, kind: "shield", text: `🛡️ ${who(pid, ar)} ตอบถูก จึงรอดจากงูที่ช่อง ${land}` });
      if (ar.blocked === "ladder") items.push({ t, kind: "block", text: `🚫 ${who(pid, ar)} ตอบผิด จึงขึ้นบันไดที่ช่อง ${land} ไม่ได้` });
      if ((ar.finalPosition ?? 0) >= BOARD_SIZE && (ar.basePosition ?? 0) < BOARD_SIZE) {
        items.push({ t: t + 1, kind: "finish", text: `🏁 ${who(pid, ar)} เข้าเส้นชัย!` });
      }
    }
  }
  return items.sort((a, b) => b.t - a.t).slice(0, limit);
}

export function renderFeed(el, room) {
  if (!el) return;
  const items = buildFeedItems(room);
  el.innerHTML = items.length
    ? items.map((it) => `<li class="${it.kind}">${escapeHtml(it.text)}</li>`).join("")
    : `<li class="feed-empty">บันได งู และการเข้าเส้นชัยจะแสดงที่นี่</li>`;
}
