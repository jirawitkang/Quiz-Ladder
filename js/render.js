// render.js
// ฟังก์ชันวาด UI จาก room data (อ่านอย่างเดียว ไม่เขียน Firebase)

import { BOARD_SIZE, PHASE, STATUS } from "./config.js";
import { getSettings, isPlayerDone } from "./game-logic.js";
import { getRoomQuestionSetName } from "../questions.js";
import { isDrop } from "./board-config.js";
import { clampPos, diceFace, escapeHtml, normalizeName, roundKey, signedText, sortedRoundNumbers } from "./utils.js";

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

// ป้ายการตั้งค่าห้องใน Lobby ของครู (รหัสห้องแสดงตัวใหญ่แยกอยู่แล้ว)
export function renderLobbyBadges(el, room) {
  if (!el) return;
  const s = getSettings(room);
  const items = [
    ["ชุดคำถาม", getRoomQuestionSetName(room)],
    ["ครู", room.hostName || "-"],
    ["รอบสูงสุด", s.maxRounds],
    ["ผู้ชนะ", `${s.maxWinners} คน`],
    ["ตอบถูก", signedText(s.rewardCorrect)],
    ["ตอบผิด", signedText(s.penaltyWrong)],
  ];
  el.innerHTML = items.map(([k, v]) => `<span class="lb-chip">${escapeHtml(k)} <b>${escapeHtml(String(v))}</b></span>`).join("");
}

/* ---------- Player list (lobby / in-game) ---------- */

// ตารางละเอียดบนจอครู: อันดับ/ชื่อ, ช่อง, สถานะรอบนี้, แต้มทอย + ผลตอบทีละรอบ, จำนวนตอบถูก
export function renderPlayerList(el, room, players, { sort = "rank" } = {}) {
  if (!el) return;
  const entries = Object.entries(players || {});
  if (!entries.length) {
    el.innerHTML = `<div class="muted">ยังไม่มีผู้เล่นเข้าห้อง</div>`;
    return;
  }
  const history = room.history || {};
  const phase = room.phase || PHASE.IDLE;
  const currentRound = Number(room.currentRound || 0);
  const standings = computeStandings(room, players);
  const rankOf = new Map(standings.map((st, i) => [st.id, i + 1]));
  const stats = new Map(standings.map((st) => [st.id, st]));
  const ordered = entries
    .map(([pid, p]) => ({ pid, p, name: normalizeName(p.name || pid), rank: rankOf.get(pid) ?? 999 }))
    .sort(sort === "name" ? byName : (a, b) => a.rank - b.rank);

  const rows = ordered
    .map(({ pid, p, name, rank }) => {
      const done = isPlayerDone(p);
      const offline = p.connected === false && !done;
      const color = SAFE_COLOR.test(p.color || "") ? p.color : "#9e9e9e";
      const pos = clampPos(p.position);
      const finish = resolveFinishInfo(pid, p, history);
      const st = stats.get(pid);

      let now = "—";
      if (!done && phase === PHASE.ROLLING) now = `<span class="${p.hasRolled ? "ok" : ""}">🎲 ${p.hasRolled ? "ทอยแล้ว" : "ยังไม่ทอย"}</span>`;
      else if (!done && (phase === PHASE.ANSWERING || phase === PHASE.QUESTION_COUNTDOWN)) {
        now = `<span class="ok">🎲 ✓</span><span class="${p.answered ? "ok" : ""}">❓ ${p.answered ? "ตอบแล้ว" : "ยังไม่ตอบ"}</span>`;
      }

      let chips = "";
      for (let rn = 1; rn <= currentRound; rn++) {
        const rd = history[roundKey(rn)] || {};
        const dm = rd.diceMoves?.[pid];
        const ar = rd.answers?.[pid];
        if (finish.finishRound != null && rn > finish.finishRound) {
          // หลังเข้าเส้นชัย: ข้อฝึก (ไม่เดิน ไม่มีผลกับอันดับ)
          const pres = ar?.answered ? (ar.correct ? "ok" : "no") : "none";
          const ptitle = `รอบ ${rn}: ข้อฝึก${pres === "ok" ? " · ตอบถูก" : pres === "no" ? " · ตอบผิด" : " · ไม่ได้ตอบ"}`;
          chips += `<span class="rd practice" title="${escapeHtml(ptitle)}">🏁<i class="${pres}"></i></span>`;
          continue;
        }
        const roll = dm && !dm.missed && Number(dm.diceRoll) > 0 ? dm.diceRoll : rn === currentRound && p.hasRolled ? p.lastRoll ?? "·" : "·";
        const res = !ar || (ar.correct == null && !ar.missedAnswer) ? "none" : ar.missedAnswer ? "miss" : ar.correct ? "ok" : "no";
        const special = [dm?.special, ar?.special].find(Boolean);
        const mark = special === "ladder" ? "🟠" : isDrop(special) ? "🟣" : "";
        const title = `รอบ ${rn}: ทอย ${roll}${res === "ok" ? " · ตอบถูก" : res === "no" ? " · ตอบผิด/ไม่ทัน" : res === "miss" ? " · หลุด" : ""}${
          mark === "🟠" ? " · ปีนบันไดส้ม" : mark === "🟣" ? " · ร่วงบันไดม่วง" : ""
        }`;
        chips += `<span class="rd" title="${escapeHtml(title)}">${escapeHtml(String(roll))}${mark ? `<sup>${mark}</sup>` : ""}<i class="${res}"></i></span>`;
      }

      const tags = `${done ? ` <span class="tag fin">เข้าเส้นชัย</span>` : ""}${offline ? ` <span class="tag off">หลุด</span>` : ""}`;
      return `<tr class="${done ? "fin" : ""}${offline ? " off" : ""}">
        <td class="num">${done && rank <= MEDALS.length ? MEDALS[rank - 1] : rank}</td>
        <td><span class="who"><span class="av" style="--c:${color}">${escapeHtml(p.emoji || "❔")}</span>${escapeHtml(name)}${tags}</span></td>
        <td><span class="cellbar"><b>${pos}</b><span class="bar"><i style="width:${(pos / BOARD_SIZE) * 100}%"></i></span></span></td>
        <td><span class="now">${now}</span></td>
        <td><span class="rounds">${chips || "—"}</span></td>
        <td class="num">${st ? `${st.correct}/${st.answeredTotal}` : "-"}</td>
      </tr>`;
    })
    .join("");

  el.innerHTML = `<table class="dt">
      <thead><tr><th>#</th><th>ผู้เล่น</th><th>ช่อง</th><th>รอบนี้</th><th>แต้มทอย + ผลตอบ แต่ละรอบ</th><th class="num">ตอบถูก</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
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
      const cls = ["choice-btn", `k-${String(key).toLowerCase()}`];
      if (showResult) {
        if (key === question.correctOption) cls.push("correct");
        else if (key === selected) cls.push("wrong");
      } else if (key === selected) {
        cls.push("selected");
      }
      const isDisabled = showResult || disabled;
      return `<button type="button" class="${cls.join(" ")}" data-key="${escapeHtml(key)}"${
        isDisabled ? " disabled" : ""
      }><b>${escapeHtml(key)}</b><span>${escapeHtml(text)}</span></button>`;
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
      if (ar.practice || answerSymbol(ar) === "➖") continue; // ข้อฝึกหลังเข้าเส้นชัย ไม่นับคะแนนเกม
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

// อันดับสุดท้าย: คนเข้าเส้นชัยตามลำดับ → รอบที่เข้า → ช่องที่อยู่ → % ตอบถูก → ชื่อ
export function computeStandings(room, players) {
  const winnerRank = new Map((room.winners || []).map((w) => [w.playerId, w.rank ?? Infinity]));
  return collectPlayerStats(players || {}, room.history || {}).sort(
    (a, b) =>
      (winnerRank.get(a.id) ?? Infinity) - (winnerRank.get(b.id) ?? Infinity) ||
      (a.finishRound ?? Infinity) - (b.finishRound ?? Infinity) ||
      b.finalPosition - a.finalPosition ||
      b.pctCorrect - a.pctCorrect ||
      byName(a, b)
  );
}

// แท่นรับรางวัล 3 อันดับแรก เรียง 2-1-3 (อันดับ 1 อยู่กลางและสูงสุด)
export function renderPodium(el, room, players, myPlayerId = null) {
  if (!el) return;
  const top = computeStandings(room, players).slice(0, 3);
  if (!top.length) {
    el.innerHTML = "";
    return;
  }
  const medals = ["🥇", "🥈", "🥉"];
  const slot = (s, rank) => {
    if (!s) return `<div class="podium-col empty rank-${rank}"></div>`;
    const color = SAFE_COLOR.test(s.player?.color || "") ? s.player.color : "#9e9e9e";
    const where = s.finished ? "เข้าเส้นชัย" : `ช่อง ${s.finalPosition}`;
    return `<div class="podium-col rank-${rank}${s.id === myPlayerId ? " me" : ""}">
      <div class="podium-av" style="--c:${color}">${escapeHtml(s.player?.emoji || "❔")}</div>
      <div class="podium-name">${escapeHtml(s.name)}</div>
      <div class="podium-where">${where}</div>
      <div class="podium-block"><span class="podium-medal">${medals[rank - 1]}</span><b>${rank}</b></div>
    </div>`;
  };
  el.innerHTML = slot(top[1], 2) + slot(top[0], 1) + slot(top[2], 3);
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

  const stats = computeStandings(room, players);

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

// การ์ดแนวนอน: ตัวหมาก (วงสีประจำตัว) + ชื่อ, ยังไม่เลือก = วงเส้นประ — เรียงตามลำดับที่เข้าห้อง
export function renderLobbyPlayers(el, players, myPlayerId = null) {
  if (!el) return;
  const list = Object.entries(players || {}).sort(([, a], [, b]) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0));
  if (!list.length) {
    el.innerHTML = `<div class="lb-empty">ยังไม่มีนักเรียนเข้าห้อง<br>ให้นักเรียนสแกน QR ทางซ้ายได้เลย</div>`;
    return;
  }
  const html = list
    .map(([pid, p]) => {
      const cls = ["lb-tok", !p.emoji && "waiting", pid === myPlayerId && "me"].filter(Boolean).join(" ");
      const color = SAFE_COLOR.test(p.color || "") ? p.color : "#9e9e9e";
      const title = `${p.name}${p.emoji ? "" : " · ยังไม่เลือกตัวหมาก"}`;
      return `<div class="${cls}" data-pid="${escapeHtml(pid)}" title="${escapeHtml(title)}"><span class="av" style="--c:${color}">${escapeHtml(
        p.emoji || "❔"
      )}</span><span class="nm">${escapeHtml(p.name)}</span></div>`;
    })
    .join("");
  // แทนที่ทั้งก้อนเฉพาะตอนเนื้อหาเปลี่ยน — แอนิเมชัน "เด้งเข้าห้อง" จะได้เล่นเฉพาะคนที่เพิ่งเข้า
  if (el.dataset.html === html) return;
  const known = new Set([...el.querySelectorAll(".lb-tok")].map((n) => n.dataset.pid));
  el.dataset.html = html;
  el.innerHTML = html;
  if (known.size) for (const n of el.querySelectorAll(".lb-tok")) if (known.has(n.dataset.pid)) n.classList.add("seen");
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
    <div class="meter${online.length && done >= online.length ? " complete" : ""}"><i style="width:${pct}%"></i></div>
    <div class="wait-who">${
      pending.length
        ? `<span class="wait-label">${pendingLabel}</span>${pending.map(chip).join("")}`
        : pool.length
          ? `<span class="wait-done">✔️ ครบทุกคนแล้ว</span>`
          : `<span class="wait-label">ยังไม่มีผู้เล่น</span>`
    }</div>`;
}

/* ---------- Host: leaderboard ---------- */

function statusIcon(p, phase) {
  if (isPlayerDone(p)) return "";
  if (p.connected === false) return "📴";
  if (phase === PHASE.ROLLING) return p.hasRolled ? "✔️" : "⏳";
  if (phase === PHASE.ANSWERING) return p.answered ? "✔️" : "⏳";
  return "";
}

const MEDALS = ["🥇", "🥈", "🥉"];

function leaderboardRow(p, i) {
  const color = SAFE_COLOR.test(p.color || "") ? p.color : "#9e9e9e";
  const ans = p.lastAnswerCorrect === true ? "✅" : p.lastAnswerCorrect === false ? "❌" : "";
  const roll = Number.isFinite(p.lastRoll) && p.lastRoll > 0 ? `<span class="dice-face">${diceFace(p.lastRoll)}</span>` : "";
  const finished = isPlayerDone(p);
  const rank = finished && i < MEDALS.length ? MEDALS[i] : String(i + 1);
  const meta = finished ? "เข้าเส้นชัย" : `ช่อง <b>${p.pos}</b>${roll || ans ? ` · ${roll} ${ans}` : ""}`;
  return `<li class="${p.connected === false && !finished ? "offline" : ""}">
    <span class="lb-rank">${rank}</span>
    <span class="lb-av" style="--c:${color}">${escapeHtml(p.emoji || "❔")}</span>
    <span class="lb-name">${escapeHtml(p.name)}</span>
    <span class="lb-meta">${meta}</span>
    <span class="lb-st">${p.statusIcon}</span>
  </li>`;
}

// คนที่เข้าเส้นชัยแล้วอยู่ในกล่องสีเขียวด้านบน เรียงตามอันดับเข้าเส้นชัย
// limit = จำนวนแถวที่แสดง (ที่เหลือบอกเป็น "+ อีก N คน" ให้ดูในตารางละเอียด)
export function renderLeaderboard(el, room, players, { limit = Infinity } = {}) {
  if (!el) return;
  const phase = room.phase || PHASE.IDLE;
  const rank = new Map((room.winners || []).map((w) => [w.playerId, w.rank ?? Infinity]));
  const rows = Object.entries(players || {})
    .map(([pid, p]) => ({ pid, ...p, pos: clampPos(p.position), statusIcon: statusIcon(p, phase) }))
    .sort((a, b) => (rank.get(a.pid) ?? Infinity) - (rank.get(b.pid) ?? Infinity) || b.pos - a.pos || byName(a, b));

  const shown = rows.slice(0, limit);
  const finished = shown.filter((p) => isPlayerDone(p));
  const racing = shown.filter((p) => !isPlayerDone(p));
  const allFinished = rows.filter((p) => isPlayerDone(p)).length;
  const hiddenCount = rows.length - shown.length;
  const top = el.scrollTop;
  el.innerHTML =
    (finished.length
      ? `<div class="lb-finish"><div class="lb-finish-head">🏁 เข้าเส้นชัยแล้ว · ${allFinished} คน</div>
         <ol class="lb-list">${finished.map((p, i) => leaderboardRow(p, i)).join("")}</ol></div>`
      : "") +
    (racing.length ? `<ol class="lb-list">${racing.map((p, i) => leaderboardRow(p, finished.length + i)).join("")}</ol>` : "") +
    (hiddenCount > 0 ? `<div class="lb-more">+ อีก ${hiddenCount} คน · ดูทั้งหมดใน "ตารางละเอียด"</div>` : "");
  el.scrollTop = top;
}

/* ---------- Host: event feed ---------- */

// เหตุการณ์เด่นจาก history (ปีน/ร่วงบันได/เข้าเส้นชัย/หลุด) ใหม่สุดอยู่บน
export function buildFeedItems(room, limit = 12) {
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
      if (dm.special === "ladder") items.push({ t, kind: "ladder", text: `🟠 ${who(pid, dm)} ปีนบันไดส้ม ${land} → ${dm.toPosition}` });
      if (isDrop(dm.special)) items.push({ t, kind: "drop", text: `🟣 ${who(pid, dm)} ร่วงบันไดม่วง ${land} → ${dm.toPosition}` });
      if ((dm.toPosition ?? 0) >= BOARD_SIZE) items.push({ t: t + 1, kind: "finish", text: `🏁 ${who(pid, dm)} เข้าเส้นชัย!` });
    }
    for (const [pid, ar] of Object.entries(rd.answers || {})) {
      const t = ar.timestamp ?? 0;
      const land = ar.landingPosition ?? ar.finalPosition;
      if (ar.special === "ladder") items.push({ t, kind: "ladder", text: `🟠 ${who(pid, ar)} ตอบถูกแล้วปีนบันไดส้ม ${land} → ${ar.finalPosition}` });
      if (isDrop(ar.special)) items.push({ t, kind: "drop", text: `🟣 ${who(pid, ar)} ตอบผิดแล้วร่วงบันไดม่วง ${land} → ${ar.finalPosition}` });
      if (isDrop(ar.blocked)) items.push({ t, kind: "shield", text: `🛡️ ${who(pid, ar)} ตอบถูก จึงไม่ร่วงบันไดม่วงที่ช่อง ${land}` });
      if (ar.blocked === "ladder") items.push({ t, kind: "block", text: `🚫 ${who(pid, ar)} ตอบผิด จึงปีนบันไดส้มที่ช่อง ${land} ไม่ได้` });
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
    : `<li class="feed-empty">การปีน/ร่วงบันได และการเข้าเส้นชัยจะแสดงที่นี่</li>`;
}
