// app.js
// จุดเริ่มต้นของแอป: state ของ session, flow ของ Host/Player, การ sync กับ Firebase และผูก event UI
//
// โครงสร้างไฟล์:
//   config.js      ค่าคงที่ + Firebase config
//   firebase.js    เชื่อมต่อ DB + เวลา server
//   game-logic.js  กติกาเกม (pure function ใช้ใน transaction, มี unit test)
//   render.js      วาดตาราง/กระดาน/สรุปผล
//   dice.js        ลูกเต๋า 3D
//   export.js      Export Excel

import {
  COUNTDOWN_FALLBACK_MS,
  ADMIN_PIN,
  BOARD_SIZE,
  DEFAULT_SETTINGS,
  DICE_ROLL_MS,
  PHASE,
  QUESTION_COUNTDOWN_SECONDS,
  ROLE,
  STATUS,
  STORAGE_KEY,
} from "./config.js";
import {
  get,
  onConnectionChange,
  onDisconnect,
  onValue,
  playerRef,
  remove,
  roomRef,
  runTransaction,
  serverNow,
  serverTimestamp,
} from "./firebase.js";
import {
  applyAnswer,
  applyBeginAnswering,
  applyDeadlineExpired,
  applyReveal,
  applyRoll,
  applyStartQuestion,
  applyStartRound,
  getAnswerDeadline,
  getViewPlayers,
  isGameEnded,
  isPlayerDone,
} from "./game-logic.js";
import {
  renderBoard,
  renderChoices,
  renderEndGameSummary,
  renderLobbyBadges,
  renderPlayerList,
  resetBoardCache,
} from "./render.js";
import { createDiceController } from "./dice.js";
import { exportRoomToXlsx } from "./export.js";
import { getQuestionFromRoom, getQuestionSetIds, getQuestionSetName } from "../questions.js";
import {
  createId,
  createRoomCode,
  nameKey,
  normalizeName,
  parseIntOr,
  pickColorAvoidDuplicate,
  roundKey,
} from "./utils.js";

/* =========================
   DOM
========================= */
const $ = (id) => document.getElementById(id);

const dom = {
  // header
  roomPill: $("uiRoomPill"),
  rolePill: $("uiRolePill"),
  adminTopBtn: $("adminTopBtn"),
  headerHomeBtn: $("headerHomeBtn"),
  headerExitBtn: $("headerExitBtn"),

  // entry
  entrySection: $("entrySection"),
  entryLanding: $("entryLanding"),
  adminEntryPage: $("adminEntryPage"),
  playerEntryPage: $("playerEntryPage"),
  joinGameBtn: $("joinGameBtn"),

  // admin entry
  hostNameInput: $("hostNameInput"),
  createRoomBtn: $("createRoomBtn"),
  hostGameOptions: $("hostGameOptions"),
  questionSetSelect: $("questionSetSelect"),
  maxRoundsInput: $("maxRoundsInput"),
  maxWinnersInput: $("maxWinnersInput"),
  rewardCorrectInput: $("rewardCorrectInput"),
  penaltyWrongInput: $("penaltyWrongInput"),
  confirmCreateRoomBtn: $("confirmCreateRoomBtn"),

  // player entry
  roomCodeInput: $("roomCodeInput"),
  playerNameInput: $("playerNameInput"),
  joinRoomBtn: $("joinRoomBtn"),

  // admin PIN
  adminPwOverlay: $("adminPwOverlay"),
  adminPwInput: $("adminPwInput"),
  adminPwError: $("adminPwError"),
  adminPwCancelBtn: $("adminPwCancelBtn"),

  // lobby
  lobby: $("lobby"),
  lobbyBadges: $("lobbyBadges"),
  lobbyCard: document.querySelector("#lobby .lobby-card"),
  lobbyCardHost: $("lobbyCardHost"),
  playerList: $("playerList"),
  startGameBtn: $("startGameBtn"),

  // game bar
  gameBar: $("gameBar"),
  roundInfo: $("roundInfo"),
  phaseInfo: $("phaseInfo"),
  hostGameControls: $("hostGameControls"),
  startRoundBtn: $("startRoundBtn"),
  startQuestionBtn: $("startQuestionBtn"),
  toggleQuestionOverlayBtn: $("toggleQuestionOverlayBtn"),
  revealAnswerBtn: $("revealAnswerBtn"),

  // game area
  gameArea: $("gameArea"),
  board: $("board"),
  endGameArea: $("endGameArea"),
  endGameTitle: $("endGameTitle"),
  endGameSummary: $("endGameSummary"),
  exportXlsxBtn: $("exportXlsxBtn"),

  // question
  questionAreaOverlay: $("questionAreaOverlay"),
  closeQuestionAreaBtn: $("closeQuestionAreaBtn"),
  countdownDisplay: $("countdownDisplay"),
  questionText: $("questionText"),
  choicesContainer: $("choicesContainer"),
  questionCountdownOverlay: $("questionCountdownOverlay"),
  questionCountdownNumber: $("questionCountdownNumber"),

  // dice
  diceOverlay: $("diceOverlay"),
  dice3d: $("dice3d"),
  diceHint: $("diceHint"),
  diceRollHint: $("diceRollHint"),
  rollDiceBtn: $("rollDiceBtn"),
  closeDiceOverlayBtn: $("closeDiceOverlayBtn"),
};

const show = (el, visible, display = "block") => {
  if (el) el.style.display = visible ? display : "none";
};

/* =========================
   State
========================= */
const session = {
  roomCode: null,
  role: null, // ROLE.HOST | ROLE.PLAYER
  playerId: null,
};

let roomUnsub = null;
let lastRoom = null;
let entryPage = "landing"; // "landing" | "admin" | "player" | null (อยู่ในห้องแล้ว)
let presenceMode = null; // "remove" | "mark" — สิ่งที่ onDisconnect ถูกตั้งไว้ตอนนี้

const busy = { create: false, join: false, roll: false, answer: false, host: false };

let hostQuestionOverlayHidden = false; // local เฉพาะเครื่อง host
let revealKey = null; // หน้าเฉลยที่กำลังแสดง
let dismissedRevealKey = null; // หน้าเฉลยที่ผู้ใช้กดปิดแล้ว (ไม่เด้งกลับ)

const inRoom = () => !!session.roomCode && !!session.role;
const isHost = () => session.role === ROLE.HOST;
const isPlayer = () => session.role === ROLE.PLAYER;

const dice = createDiceController({
  diceOverlayEl: dom.diceOverlay,
  dice3dEl: dom.dice3d,
  diceHintEl: dom.diceHint,
  diceRollHintEl: dom.diceRollHint,
  rollDiceBtn: dom.rollDiceBtn,
  closeDiceOverlayBtn: dom.closeDiceOverlayBtn,
  onClose: () => dom.gameArea?.scrollIntoView({ behavior: "smooth", block: "start" }),
});

/* =========================
   Session storage (แยกต่อแท็บ)
========================= */
function saveSession() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ room: session.roomCode, role: session.role, pid: session.playerId }));
  } catch {}
}

function loadSession() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
}

/* =========================
   Timer (นับถอยหลังคำถาม / เวลาตอบ)
   key เดียวกัน = timer เดิม → room update ที่เข้ามาบ่อยจะไม่สร้าง timer ซ้ำ
========================= */
const ticker = { id: null, key: null };

function startTicker(key, tick, ms) {
  if (ticker.key === key) return;
  stopTicker();
  ticker.key = key;
  ticker.id = setInterval(tick, ms);
  tick();
}

// หยุด interval แต่จำ key ไว้ เพื่อไม่ให้เริ่มใหม่จาก room update เดิม
function finishTicker() {
  clearInterval(ticker.id);
  ticker.id = null;
}

function stopTicker() {
  finishTicker();
  ticker.key = null;
}

/* =========================
   Presence (online/offline ของผู้เล่น)
========================= */
// ก่อนเริ่มเกม: หลุด = ลบชื่อ (ให้ join ใหม่/เปลี่ยนชื่อได้)
// เริ่มเกมแล้ว: หลุด = mark disconnected (rejoin ด้วยชื่อเดิมได้)
async function armPresence(room) {
  if (!isPlayer() || !room) return;
  const mode = room.status === STATUS.LOBBY && (room.currentRound || 0) === 0 ? "remove" : "mark";
  if (mode === presenceMode) return;
  presenceMode = mode;

  const od = onDisconnect(playerRef(session.roomCode, session.playerId));
  try {
    // onDisconnect สะสมคำสั่ง ต้อง cancel ของเดิมก่อน ไม่งั้น remove + update จะทำงานทั้งคู่
    await od.cancel();
    if (mode === "remove") await od.remove();
    else await od.update({ connected: false, disconnectedAt: serverTimestamp(), lastSeen: serverTimestamp() });
  } catch (e) {
    presenceMode = null;
    console.warn("armPresence failed:", e);
  }
}

function disarmPresence() {
  if (session.roomCode && session.playerId) {
    onDisconnect(playerRef(session.roomCode, session.playerId)).cancel().catch(() => {});
  }
  presenceMode = null;
}

// ใช้ transaction เพื่อไม่สร้าง record ใหม่ถ้าผู้เล่น/ห้องถูกลบไปแล้ว
function setPlayerConnected(code, pid, connected) {
  return runTransaction(playerRef(code, pid), (p) => {
    if (!p) return;
    p.connected = connected;
    p.lastSeen = serverNow();
    p.disconnectedAt = connected ? null : serverNow();
    return p;
  });
}

onConnectionChange((connected) => {
  if (!connected) {
    presenceMode = null; // server ทำ onDisconnect ไปแล้ว ต้องตั้งใหม่เมื่อกลับมา
    return;
  }
  if (isPlayer() && lastRoom) {
    setPlayerConnected(session.roomCode, session.playerId, true).catch((e) => console.warn(e));
    armPresence(lastRoom);
  }
});

/* =========================
   Navigation
========================= */
function showEntryPage(page) {
  entryPage = page;
  show(dom.entrySection, true);
  show(dom.entryLanding, page === "landing");
  show(dom.adminEntryPage, page === "admin", "grid");
  show(dom.playerEntryPage, page === "player", "grid");

  if (page === "landing") {
    dom.hostGameOptions?.classList.remove("is-open");
    for (const el of [dom.hostNameInput, dom.createRoomBtn, dom.confirmCreateRoomBtn, dom.roomCodeInput, dom.playerNameInput, dom.joinRoomBtn]) {
      if (el) el.disabled = false;
    }
  }

  const target = { landing: dom.entryLanding, admin: dom.adminEntryPage, player: dom.playerEntryPage }[page];
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
  updateHeader();
}

function updateHeader() {
  if (dom.roomPill) dom.roomPill.textContent = `Room: ${session.roomCode || "-"}`;
  if (dom.rolePill) dom.rolePill.textContent = `Role: ${session.role || "-"}`;

  const joined = inRoom();
  show(dom.adminTopBtn, !joined && entryPage === "landing", "inline-flex");
  show(dom.headerHomeBtn, !joined && (entryPage === "admin" || entryPage === "player"), "inline-flex");
  show(dom.headerExitBtn, joined, "inline-flex");
  if (dom.headerExitBtn) dom.headerExitBtn.textContent = isHost() ? "ยกเลิกห้อง" : "ออกจากห้อง";
}

function enterRoom(code, role, playerId = null) {
  session.roomCode = code;
  session.role = role;
  session.playerId = playerId;
  saveSession();

  entryPage = null;
  show(dom.entrySection, false);
  show(dom.lobby, true);
  updateHeader();
  subscribeRoom(code);
}

function resetToHome(message) {
  stopTicker();
  roomUnsub?.();
  roomUnsub = null;
  disarmPresence();
  clearSession();

  session.roomCode = null;
  session.role = null;
  session.playerId = null;
  lastRoom = null;
  revealKey = dismissedRevealKey = null;
  hostQuestionOverlayHidden = false;
  Object.keys(busy).forEach((k) => (busy[k] = false));

  document.body.classList.remove("in-game");
  if (dom.lobbyCard && dom.lobby && dom.lobbyCard.parentElement !== dom.lobby) dom.lobby.appendChild(dom.lobbyCard);
  for (const el of [dom.gameBar, dom.lobby, dom.gameArea, dom.endGameArea, dom.questionAreaOverlay, dom.questionCountdownOverlay]) {
    show(el, false);
  }
  for (const el of [dom.playerList, dom.board, dom.lobbyBadges]) if (el) el.innerHTML = "";
  if (dom.countdownDisplay) dom.countdownDisplay.textContent = "";
  resetBoardCache();
  dice.setState("hidden");

  showEntryPage("landing");
  if (message) alert(message);
}

/* =========================
   Room subscription + render
========================= */
function subscribeRoom(code) {
  roomUnsub?.();
  resetBoardCache();
  roomUnsub = onValue(roomRef(code), (snap) => {
    if (!snap.exists()) {
      resetToHome("ห้องนี้ถูกยกเลิก/ปิดแล้ว");
      return;
    }
    const room = snap.val();

    // ผู้เล่นถูกลบออกจากห้อง (เช่น หลุดระหว่างรอใน lobby)
    if (isPlayer() && !room.players?.[session.playerId] && !isGameEnded(room)) {
      resetToHome("คุณไม่ได้อยู่ในห้องนี้แล้ว (อาจหลุดการเชื่อมต่อ) กรุณา Join ใหม่");
      return;
    }

    try {
      renderRoom(room);
      armPresence(room);
    } catch (e) {
      console.error("[renderRoom] crashed:", e);
    }
  });
}

function renderRoom(room) {
  lastRoom = room;
  const players = room.players || {};
  const ended = isGameEnded(room);

  applyLayout(room);
  updateHeader();
  renderLobbyBadges(dom.lobbyBadges, room, session.roomCode);
  renderPlayerList(dom.playerList, room, players);
  renderStatusBar(room, players);
  renderBoard(dom.board, room, getViewPlayers(room), isPlayer() ? session.playerId : null);
  updateStartGameButton(room, players);
  updateHostControls(room, players);
  updateDiceOverlay(room, players);
  updateQuestionUI(room, players);

  show(dom.endGameArea, ended);
  show(dom.exportXlsxBtn, ended && isHost(), "inline-flex");
  if (ended) {
    renderEndGameSummary({ titleEl: dom.endGameTitle, summaryEl: dom.endGameSummary }, room, getViewPlayers(room));
  }
}

function applyLayout(room) {
  const ended = isGameEnded(room);
  const inGame = room.status === STATUS.IN_GAME && !ended;
  const started = inGame || ended || (room.currentRound || 0) > 0;

  // ระหว่างเล่น: ย้ายตารางผู้เล่นไปไว้ใต้กระดาน (CSS body.in-game ซ่อน #lobby)
  document.body.classList.toggle("in-game", inGame);
  const cardParent = inGame ? dom.lobbyCardHost : dom.lobby;
  if (dom.lobbyCard && cardParent && dom.lobbyCard.parentElement !== cardParent) cardParent.appendChild(dom.lobbyCard);

  show(dom.lobbyCardHost, inGame);
  show(dom.lobby, !ended);
  show(dom.gameArea, started);
  show(dom.gameBar, started, "flex");
}

const PHASE_TEXT = {
  [PHASE.ROLLING]: "กำลังทอยลูกเต๋า",
  [PHASE.QUESTION_COUNTDOWN]: "เตรียมคำถาม",
  [PHASE.ANSWERING]: "กำลังตอบคำถาม",
  [PHASE.RESULT]: "สรุปผลคำถามรอบนี้",
  [PHASE.ENDED]: "เกมจบแล้ว",
};

function renderStatusBar(room, players) {
  const round = room.currentRound || 0;
  const phase = room.phase || PHASE.IDLE;

  if (dom.roundInfo) {
    dom.roundInfo.textContent =
      round > 0 ? `รอบที่: ${round}` : room.status === STATUS.IN_GAME ? "รอบที่: -" : "ยังไม่ได้เริ่มรอบ";
  }

  let suffix = "";
  if (isHost() && !isGameEnded(room)) {
    const active = Object.values(players).filter((p) => !isPlayerDone(p));
    if (phase === PHASE.ROLLING) {
      suffix = ` | ทอยแล้ว ${active.filter((p) => p.hasRolled).length}/${active.length} คน`;
    } else if (phase === PHASE.ANSWERING) {
      suffix = ` | ตอบแล้ว ${active.filter((p) => p.answered).length}/${active.length} คน`;
      if (room.answerDeadlineExpired === true) suffix += " | หมดเวลาแล้ว";
    }
  }

  if (dom.phaseInfo) {
    dom.phaseInfo.textContent = round > 0 ? `[สถานะรอบ: ${PHASE_TEXT[phase] || "รอ Host เริ่มรอบใหม่"}${suffix}]` : "";
  }
}

function updateStartGameButton(room, players) {
  const canStart = isHost() && room.status === STATUS.LOBBY && Object.keys(players).length > 0;
  show(dom.startGameBtn, canStart, "inline-flex");
  if (dom.startGameBtn) dom.startGameBtn.disabled = !canStart || busy.host;
}

function updateHostControls(room, players) {
  show(dom.hostGameControls, isHost(), "flex");
  if (!isHost()) return;

  const phase = room.phase || PHASE.IDLE;
  const ended = isGameEnded(room);
  const inCountdown = phase === PHASE.QUESTION_COUNTDOWN;
  const showToggle = !ended && (inCountdown || phase === PHASE.ANSWERING);

  // ผู้เล่นที่ยังออนไลน์และยังเล่นอยู่ต้องทอยครบก่อนเริ่มคำถาม (คนที่หลุดจะถูกนับเป็นทอย 0)
  const waitingFor = Object.values(players).filter((p) => !isPlayerDone(p) && p.connected !== false);
  const allRolled = waitingFor.every((p) => p.hasRolled);

  show(dom.startRoundBtn, !ended, "inline-flex");
  if (dom.startRoundBtn) dom.startRoundBtn.disabled = ended || (phase !== PHASE.IDLE && phase !== PHASE.RESULT);

  show(dom.startQuestionBtn, !ended && !showToggle, "inline-block");
  if (dom.startQuestionBtn) dom.startQuestionBtn.disabled = !(phase === PHASE.ROLLING && allRolled);

  if (!showToggle) hostQuestionOverlayHidden = false;
  show(dom.toggleQuestionOverlayBtn, showToggle, "inline-block");
  if (dom.toggleQuestionOverlayBtn) {
    dom.toggleQuestionOverlayBtn.disabled = inCountdown;
    dom.toggleQuestionOverlayBtn.textContent = hostQuestionOverlayHidden ? "แสดงคำถาม" : "ซ่อนคำถาม";
  }

  show(dom.revealAnswerBtn, !ended, "inline-block");
  if (dom.revealAnswerBtn) dom.revealAnswerBtn.disabled = phase !== PHASE.ANSWERING;
}

function updateDiceOverlay(room, players) {
  const state = dice.getState();
  if (!isPlayer()) {
    if (state !== "hidden") dice.setState("hidden");
    return;
  }
  if (busy.roll) return; // กำลังทอย/บันทึกผล อย่าแทรก

  const me = players[session.playerId] || {};
  const rolling = room.phase === PHASE.ROLLING;
  const done = isPlayerDone(me);

  if (rolling && !done && !me.hasRolled && state === "hidden") dice.setState("waiting");
  else if ((!rolling || done) && state !== "hidden") dice.setState("hidden");
}

/* =========================
   Question UI
========================= */
function hideQuestionOverlay() {
  show(dom.questionAreaOverlay, false);
  show(dom.closeQuestionAreaBtn, false);
}

function updateQuestionUI(room, players) {
  const phase = room.phase || PHASE.IDLE;
  const round = room.currentRound || 0;
  const ui = room.ui || {};
  const keepOnEnd = phase === PHASE.ENDED && ui.keepQuestionOnEnd === true;

  if (phase !== PHASE.QUESTION_COUNTDOWN) show(dom.questionCountdownOverlay, false);
  if (phase !== PHASE.ANSWERING && phase !== PHASE.QUESTION_COUNTDOWN) stopTicker();

  if (round === 0) {
    hideQuestionOverlay();
    if (dom.countdownDisplay) dom.countdownDisplay.textContent = "";
    return;
  }

  if (phase === PHASE.QUESTION_COUNTDOWN) {
    hideQuestionOverlay();
    if (dom.choicesContainer) dom.choicesContainer.innerHTML = "";
    startCountdownTicker(room);
    return;
  }

  if (phase === PHASE.ANSWERING) {
    showAnsweringView(room, players);
    return;
  }

  if (phase === PHASE.RESULT || keepOnEnd) {
    const showRound = keepOnEnd ? ui.keepQuestionRound ?? round : round;
    const qIndex = keepOnEnd ? ui.keepQuestionIndex ?? room.questionIndex : room.questionIndex;
    showRevealView(room, players, showRound, qIndex, keepOnEnd ? "end" : "result");
    return;
  }

  hideQuestionOverlay();
  if (dom.countdownDisplay) dom.countdownDisplay.textContent = "";
}

function startCountdownTicker(room) {
  const startAt = room.questionCountdownStartAt;
  const endAt = startAt + (room.questionCountdownSeconds || QUESTION_COUNTDOWN_SECONDS) * 1000;
  show(dom.questionCountdownOverlay, true, "flex");

  startTicker(`${session.roomCode}|countdown|${room.currentRound}|${startAt}`, () => {
    const remaining = Math.max(0, Math.ceil((endAt - serverNow()) / 1000));
    if (dom.questionCountdownNumber) dom.questionCountdownNumber.textContent = remaining > 0 ? String(remaining) : "";
    if (remaining > 0) return;

    finishTicker();
    show(dom.questionCountdownOverlay, false);

    // Host เป็นคนย้ายไป phase ตอบคำถาม — ผู้เล่นทำแทนเฉพาะเมื่อ host ไม่ทำ (เช่น host หลุด)
    const beginAnswering = () =>
      runTransaction(roomRef(session.roomCode), (r) => applyBeginAnswering(r, serverNow())).catch((e) =>
        console.error(e)
      );
    if (isHost()) {
      beginAnswering();
    } else {
      setTimeout(() => {
        if (lastRoom?.phase === PHASE.QUESTION_COUNTDOWN && lastRoom.questionCountdownStartAt === startAt) {
          beginAnswering();
        }
      }, COUNTDOWN_FALLBACK_MS);
    }
  }, 100);
}

function showAnsweringView(room, players) {
  const question = getQuestionFromRoom(room, room.questionIndex ?? 0);
  if (!question) {
    hideQuestionOverlay();
    return;
  }

  show(dom.questionAreaOverlay, !(isHost() && hostQuestionOverlayHidden), "flex");
  show(dom.closeQuestionAreaBtn, false);
  if (dom.questionText) dom.questionText.textContent = question.text;

  const me = (isPlayer() && players[session.playerId]) || null;
  const deadline = getAnswerDeadline(room);
  const isExpired = () => room.answerDeadlineExpired === true || (deadline != null && serverNow() > deadline);

  const disabled = !me || isPlayerDone(me) || isExpired();
  renderChoices(dom.choicesContainer, question, { selected: me?.answer ?? null, disabled });

  if (deadline == null) {
    if (dom.countdownDisplay) dom.countdownDisplay.textContent = "กำลังซิงค์เวลาเริ่ม…";
    return;
  }

  startTicker(`${session.roomCode}|answer|${room.currentRound}|${room.answerStartAt}`, () => {
    const remaining = Math.max(0, Math.ceil((deadline - serverNow()) / 1000));
    if (dom.countdownDisplay) dom.countdownDisplay.textContent = `⏱ เหลือเวลา ${remaining} วินาที`;
    if (remaining > 0) return;

    finishTicker();
    dom.choicesContainer?.querySelectorAll("button").forEach((b) => (b.disabled = true));
    if (isHost()) {
      runTransaction(roomRef(session.roomCode), (r) => applyDeadlineExpired(r, serverNow())).catch((e) =>
        console.error(e)
      );
    }
  }, 250);
}

function showRevealView(room, players, showRound, qIndex, kind) {
  const question = qIndex != null ? getQuestionFromRoom(room, qIndex) : null;
  revealKey = `${session.roomCode}|${kind}|${showRound}|${qIndex}`;

  if (!question || dismissedRevealKey === revealKey) {
    hideQuestionOverlay();
    return;
  }

  // ใช้คำตอบที่บันทึกตอนเฉลย (ตรงกับที่ถูกนับคะแนนจริง)
  let selected = null;
  if (isPlayer()) {
    const rec = room.history?.[roundKey(showRound)]?.answers?.[session.playerId];
    selected = rec ? rec.selectedOption ?? null : players[session.playerId]?.answer ?? null;
  }

  show(dom.questionAreaOverlay, true, "flex");
  show(dom.closeQuestionAreaBtn, true, "inline-flex");
  if (dom.questionText) dom.questionText.textContent = question.text;
  if (dom.countdownDisplay) dom.countdownDisplay.textContent = `เฉลยรอบที่ ${showRound}:`;
  renderChoices(dom.choicesContainer, question, { selected, showResult: true });
}

/* =========================
   Host flows
========================= */
function populateQuestionSetSelect() {
  const sel = dom.questionSetSelect;
  if (!sel) return;
  sel.innerHTML = "";
  for (const id of getQuestionSetIds()) sel.add(new Option(getQuestionSetName(id), id));
  sel.value = DEFAULT_SETTINGS.questionSetId;
}

function hostOpenGameOptions() {
  const hostName = normalizeName(dom.hostNameInput?.value);
  if (!hostName) {
    alert("กรุณากรอกชื่อของ Host ก่อน");
    return;
  }
  dom.hostNameInput.value = hostName;
  dom.hostNameInput.disabled = true;
  dom.createRoomBtn.disabled = true;
  dom.hostGameOptions?.classList.add("is-open");
}

function readGameSettings() {
  return {
    questionSetId: dom.questionSetSelect?.value || DEFAULT_SETTINGS.questionSetId,
    maxRounds: Math.max(1, parseIntOr(dom.maxRoundsInput?.value, DEFAULT_SETTINGS.maxRounds)),
    maxWinners: Math.max(1, parseIntOr(dom.maxWinnersInput?.value, DEFAULT_SETTINGS.maxWinners)),
    rewardCorrect: Math.abs(parseIntOr(dom.rewardCorrectInput?.value, DEFAULT_SETTINGS.rewardCorrect)),
    penaltyWrong: -Math.abs(parseIntOr(dom.penaltyWrongInput?.value, DEFAULT_SETTINGS.penaltyWrong)),
  };
}

async function hostCreateRoom() {
  if (busy.create) return;
  const hostName = normalizeName(dom.hostNameInput?.value);
  if (!hostName) {
    alert("กรุณากรอกชื่อของ Host ก่อน");
    return;
  }

  busy.create = true;
  dom.confirmCreateRoomBtn.disabled = true;

  const roomData = {
    createdAt: serverNow(),
    status: STATUS.LOBBY,
    hostId: createId("host"),
    hostName,
    boardSize: BOARD_SIZE,
    currentRound: 0,
    phase: PHASE.IDLE,
    questionCountdownSeconds: QUESTION_COUNTDOWN_SECONDS,
    answerDeadlineExpired: false,
    gameSettings: readGameSettings(),
  };

  try {
    // transaction: สร้างเฉพาะเมื่อรหัสยังว่าง (กันรหัสชนแบบ atomic)
    let code = null;
    for (let i = 0; i < 6 && !code; i++) {
      const candidate = createRoomCode();
      const tx = await runTransaction(roomRef(candidate), (cur) => (cur === null ? roomData : undefined));
      if (tx.committed) code = candidate;
    }
    if (!code) {
      alert("สร้างห้องไม่สำเร็จ (รหัสชนกันหลายครั้ง) ลองใหม่อีกครั้ง");
      return;
    }

    dom.hostGameOptions?.classList.remove("is-open");
    enterRoom(code, ROLE.HOST);
    alert(`สร้างห้องสำเร็จ!\nRoom Code: ${code}\nแชร์รหัสนี้ให้ผู้เล่นใช้ Join ได้เลย`);
  } catch (err) {
    console.error("Error creating room:", err);
    alert("มีปัญหาในการสร้างห้อง ดู error ใน Console");
  } finally {
    busy.create = false;
    if (dom.confirmCreateRoomBtn) dom.confirmCreateRoomBtn.disabled = false;
  }
}

// รัน transaction ของ host พร้อมกันกดซ้ำ — คืน true ถ้า commit
async function hostTransaction(mutate, failMessage) {
  if (!isHost() || busy.host) return false;
  busy.host = true;
  try {
    const tx = await runTransaction(roomRef(session.roomCode), mutate);
    if (!tx.committed && failMessage) alert(failMessage);
    return tx.committed;
  } catch (e) {
    console.error(e);
    alert("ดำเนินการไม่สำเร็จ (เครือข่าย/ระบบมีปัญหา ลองใหม่)");
    return false;
  } finally {
    busy.host = false;
  }
}

async function hostStartGame() {
  const ok = await hostTransaction((room) => {
    if (!room) return room;
    if (room.status !== STATUS.LOBBY || !Object.keys(room.players || {}).length) return;
    room.status = STATUS.IN_GAME;
    room.phase = PHASE.IDLE;
    room.gameStartedAt = serverNow();
    return room;
  }, "เริ่มเกมไม่ได้ (ห้องเริ่มไปแล้ว หรือยังไม่มีผู้เล่น)");
  if (ok) dom.gameArea?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function hostStartRound() {
  return hostTransaction(applyStartRound, "เริ่มรอบใหม่ไม่ได้ (อาจถึงรอบสูงสุดแล้ว หรืออยู่ในช่วงตอบ/นับถอยหลัง)");
}

function hostStartQuestion() {
  return hostTransaction((room) => applyStartQuestion(room, serverNow()), "เริ่มคำถามไม่ได้ (phase ไม่ถูกต้อง)");
}

function hostReveal() {
  return hostTransaction((room) => applyReveal(room, serverNow()), "เฉลยไม่ได้ (phase ไม่ถูกต้อง)");
}

function hostToggleQuestionOverlay() {
  if (!isHost()) return;
  hostQuestionOverlayHidden = !hostQuestionOverlayHidden;
  show(dom.questionAreaOverlay, !hostQuestionOverlayHidden, "flex");
  if (dom.toggleQuestionOverlayBtn) {
    dom.toggleQuestionOverlayBtn.textContent = hostQuestionOverlayHidden ? "แสดงคำถาม" : "ซ่อนคำถาม";
  }
}

async function hostCancelRoom() {
  if (!isHost()) return;
  if (!confirm("ต้องการยกเลิกห้องนี้ใช่ไหม? ผู้เล่นทุกคนจะถูกเตะออก")) return;
  try {
    await remove(roomRef(session.roomCode)); // onValue จะพากลับหน้าแรกเอง
  } catch (e) {
    console.error(e);
    alert("ยกเลิกห้องไม่สำเร็จ (ดู Console)");
  }
}

async function hostExport() {
  if (!lastRoom) return;
  try {
    await exportRoomToXlsx(lastRoom, session.roomCode);
  } catch (e) {
    console.error(e);
    alert("Export ไม่สำเร็จ (ดู Console)");
  }
}

/* =========================
   Player flows
========================= */
async function playerJoin() {
  if (busy.join) return;
  const code = (dom.roomCodeInput?.value || "").trim().toUpperCase();
  const name = normalizeName(dom.playerNameInput?.value);
  if (!code || !name) {
    alert("กรุณากรอกทั้ง Race Code และชื่อผู้เล่น");
    return;
  }
  dom.playerNameInput.value = name;

  busy.join = true;
  dom.joinRoomBtn.disabled = true;
  try {
    const snap = await get(roomRef(code));
    if (!snap.exists()) {
      alert("ไม่พบห้องนี้ กรุณาตรวจสอบ Race Code");
      return;
    }

    const room = snap.val();
    const players = room.players || {};
    const key = nameKey(name);

    if (nameKey(room.hostName) === key) {
      alert("ชื่อนี้ซ้ำกับชื่อ Host กรุณาใช้ชื่ออื่น");
      return;
    }

    const existingPid = Object.keys(players).find((pid) => nameKey(players[pid].name) === key) || null;
    const started = room.status !== STATUS.LOBBY || (room.currentRound || 0) > 0;

    if (!started && existingPid) {
      alert("มีผู้เล่นใช้ชื่อนี้ในห้องแล้ว (ไม่สนตัวพิมพ์เล็ก/ใหญ่) กรุณาใช้ชื่ออื่น");
      return;
    }
    if (started && !existingPid) {
      alert("ห้องนี้เริ่มเกมแล้ว ไม่สามารถ Join เพิ่มได้");
      return;
    }

    if (started) {
      // rejoin ได้เฉพาะชื่อที่หลุดอยู่ — กันแย่งชื่อคนที่ยังออนไลน์
      if (players[existingPid].connected !== false) {
        alert("ชื่อนี้กำลังออนไลน์อยู่ในห้องแล้ว กรุณาใช้ชื่อของตนเอง (หรือแจ้งผู้จัดหากเป็นชื่อซ้ำ)");
        return;
      }
      await setPlayerConnected(code, existingPid, true);
      enterRoom(code, ROLE.PLAYER, existingPid);
      alert(`กลับเข้าห้องสำเร็จ! คุณอยู่ในห้อง ${code}`);
      return;
    }

    // join ใหม่: transaction บน players กันชื่อซ้ำกรณีสองคนกดพร้อมกัน
    const pid = createId("p");
    const joinTx = await runTransaction(roomRef(code), (r) => {
      if (!r) return r;
      if (r.status !== STATUS.LOBBY) return;
      r.players = r.players || {};
      if (Object.values(r.players).some((p) => nameKey(p.name) === key)) return;
      r.players[pid] = {
        name,
        color: pickColorAvoidDuplicate(r.players),
        position: 1,
        startOfRoundPos: 1,
        lastRoll: null,
        hasRolled: false,
        answered: false,
        answer: null,
        lastAnswerCorrect: null,
        finished: false,
        joinedAt: serverNow(),
        connected: true,
        lastSeen: serverNow(),
      };
      return r;
    });
    if (!joinTx.committed || !joinTx.snapshot.val()?.players?.[pid]) {
      alert("Join ไม่สำเร็จ (ชื่อซ้ำหรือห้องเริ่มเกมแล้ว) ลองใหม่อีกครั้ง");
      return;
    }

    enterRoom(code, ROLE.PLAYER, pid);
    alert(`เข้าห้องสำเร็จ! คุณอยู่ในห้อง ${code}`);
  } catch (err) {
    console.error("Error joining room:", err);
    alert("มีปัญหาในการ Join ห้อง ดู error ใน Console");
  } finally {
    busy.join = false;
    if (dom.joinRoomBtn) dom.joinRoomBtn.disabled = false;
  }
}

async function playerRollDice() {
  if (!isPlayer() || busy.roll || !lastRoom) return;

  const me = lastRoom.players?.[session.playerId];
  if (lastRoom.phase !== PHASE.ROLLING) {
    alert("ตอนนี้ยังไม่ใช่ช่วงทอยลูกเต๋า (รอ Host เริ่มรอบ)");
    return;
  }
  if (!me || me.hasRolled || isPlayerDone(me)) return;

  busy.roll = true;
  try {
    const roll = await dice.rollWithOverlay(DICE_ROLL_MS);
    dice.setState("committing", { roll });

    const tx = await runTransaction(roomRef(session.roomCode), (room) =>
      applyRoll(room, session.playerId, roll, serverNow())
    );
    if (tx.committed) {
      dice.setState("done", { roll });
    } else {
      dice.setState("hidden");
      alert("บันทึกผลทอยไม่สำเร็จ (สถานะห้องเปลี่ยนแล้ว)");
    }
  } catch (e) {
    console.error(e);
    dice.setState("hidden");
    alert("ทอยเต๋าไม่สำเร็จ (เครือข่าย/ระบบมีปัญหา ลองใหม่)");
  } finally {
    busy.roll = false;
    if (lastRoom && dice.getState() === "hidden") updateDiceOverlay(lastRoom, lastRoom.players || {});
  }
}

async function playerSubmitAnswer(optionKey) {
  if (!isPlayer() || busy.answer || !lastRoom) return;

  const deadline = getAnswerDeadline(lastRoom);
  if (lastRoom.phase !== PHASE.ANSWERING) return;
  if (lastRoom.answerDeadlineExpired === true || (deadline != null && serverNow() > deadline)) {
    alert("ส่งคำตอบไม่สำเร็จ (หมดเวลาแล้ว)");
    return;
  }

  busy.answer = true;
  try {
    // เขียนเฉพาะ node ของตัวเอง — ผู้เล่นหลายคนตอบพร้อมกันได้โดยไม่ชนกัน
    const tx = await runTransaction(playerRef(session.roomCode, session.playerId), (p) =>
      applyAnswer(p, optionKey, serverNow())
    );
    if (!tx.committed) alert("ส่งคำตอบไม่สำเร็จ (ลองใหม่)");
  } catch (e) {
    console.error("submitAnswer failed:", e);
    alert("ส่งคำตอบไม่สำเร็จ (เครือข่าย/ระบบมีปัญหา ลองใหม่)");
  } finally {
    busy.answer = false;
  }
}

async function playerLeave() {
  const { roomCode, playerId } = session;
  if (roomCode && playerId) {
    disarmPresence();
    try {
      const room = lastRoom;
      const inLobby = room && room.status === STATUS.LOBBY && (room.currentRound || 0) === 0;
      if (inLobby) await remove(playerRef(roomCode, playerId));
      else await setPlayerConnected(roomCode, playerId, false);
    } catch (e) {
      console.warn("leave failed:", e);
    }
  }
  resetToHome("ออกจากห้องเรียบร้อย");
}

/* =========================
   Admin PIN overlay
========================= */
function openAdminPwOverlay() {
  if (!dom.adminPwOverlay || !dom.adminPwInput) return;
  dom.adminPwInput.value = "";
  show(dom.adminPwError, false);
  show(dom.adminPwOverlay, true, "flex");
  setTimeout(() => dom.adminPwInput.focus(), 0);
}

function closeAdminPwOverlay() {
  show(dom.adminPwOverlay, false);
  if (dom.adminPwInput) dom.adminPwInput.value = "";
  show(dom.adminPwError, false);
}

function onAdminPwInput() {
  const v = String(dom.adminPwInput.value || "").replace(/\D/g, "").slice(0, 4);
  dom.adminPwInput.value = v;
  show(dom.adminPwError, false);
  if (v.length < 4) return;

  if (v === ADMIN_PIN) {
    closeAdminPwOverlay();
    showEntryPage("admin");
  } else {
    show(dom.adminPwError, true);
    dom.adminPwInput.value = "";
    dom.adminPwInput.focus();
  }
}

/* =========================
   Event bindings
========================= */
function bindUIEvents() {
  const on = (el, type, fn) => el?.addEventListener(type, fn);

  on(dom.headerHomeBtn, "click", () => showEntryPage("landing"));
  on(dom.headerExitBtn, "click", () => (isHost() ? hostCancelRoom() : playerLeave()));
  on(dom.joinGameBtn, "click", () => showEntryPage("player"));
  on(dom.adminTopBtn, "click", openAdminPwOverlay);

  on(dom.adminPwCancelBtn, "click", closeAdminPwOverlay);
  on(dom.adminPwOverlay, "click", (e) => e.target === dom.adminPwOverlay && closeAdminPwOverlay());
  on(dom.adminPwInput, "input", onAdminPwInput);
  on(dom.adminPwInput, "keydown", (e) => e.key === "Enter" && e.preventDefault());

  // host
  on(dom.createRoomBtn, "click", hostOpenGameOptions);
  on(dom.confirmCreateRoomBtn, "click", hostCreateRoom);
  on(dom.startGameBtn, "click", hostStartGame);
  on(dom.startRoundBtn, "click", hostStartRound);
  on(dom.startQuestionBtn, "click", hostStartQuestion);
  on(dom.toggleQuestionOverlayBtn, "click", hostToggleQuestionOverlay);
  on(dom.revealAnswerBtn, "click", hostReveal);
  on(dom.exportXlsxBtn, "click", hostExport);

  // player
  on(dom.joinRoomBtn, "click", playerJoin);
  on(dom.rollDiceBtn, "click", playerRollDice);
  on(dom.choicesContainer, "click", (e) => {
    const btn = e.target.closest("button[data-key]");
    if (btn && !btn.disabled) playerSubmitAnswer(btn.dataset.key);
  });

  on(dom.closeQuestionAreaBtn, "click", () => {
    hideQuestionOverlay();
    dismissedRevealKey = revealKey;
  });

  // Enter เพื่อส่งฟอร์ม
  on(dom.hostNameInput, "keydown", (e) => e.key === "Enter" && hostOpenGameOptions());
  on(dom.playerNameInput, "keydown", (e) => e.key === "Enter" && playerJoin());
}

/* =========================
   Boot
========================= */
async function restoreSession() {
  const s = loadSession();
  if (!s?.room || !s?.role) return false;

  const code = String(s.room).trim().toUpperCase();
  try {
    const snap = await get(roomRef(code));
    if (!snap.exists()) return false;
    const room = snap.val();

    if (s.role === ROLE.HOST) {
      enterRoom(code, ROLE.HOST);
      return true;
    }
    if (s.role === ROLE.PLAYER && s.pid && room.players?.[s.pid]) {
      await setPlayerConnected(code, s.pid, true);
      enterRoom(code, ROLE.PLAYER, String(s.pid));
      return true;
    }
  } catch (e) {
    console.warn("restore session failed:", e);
  }
  clearSession();
  return false;
}

async function boot() {
  bindUIEvents();
  populateQuestionSetSelect();
  if (!(await restoreSession())) showEntryPage("landing");
}

window.addEventListener("unhandledrejection", (e) => console.error("[UNHANDLED PROMISE]", e.reason));

boot();
