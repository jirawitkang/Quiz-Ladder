// app.js
// จุดเริ่มต้นของแอป: state ของ session, flow ของ Host/Player, การ sync กับ Firebase และผูก event UI
//
// โครงสร้างไฟล์:
//   config.js        ค่าคงที่ + Firebase config
//   firebase.js      เชื่อมต่อ DB + เวลา server
//   board-config.js  กระดาน 6×5, บันได/งู และกติกาการขึ้นบันได/ตกงู
//   emoji-themes.js  ธีมตัวหมาก emoji + ตัวสำรอง
//   game-logic.js    กติกาเกม (pure function ใช้ใน transaction, มี unit test)
//   board-view.js    วาดกระดาน + แอนิเมชันหมากเดิน
//   render.js        แผง/ตาราง/สรุปผล
//   dice.js          ลูกเต๋า 3D
//   export.js        Export Excel

import {
  ADMIN_PIN,
  BOARD_SIZE,
  COUNTDOWN_FALLBACK_MS,
  DEFAULT_SETTINGS,
  DICE_ROLL_MS,
  PHASE,
  QUESTION_COUNTDOWN_SECONDS,
  ROLE,
  ROOM_MAX_AGE_MS,
  STATUS,
  STORAGE_KEY,
} from "./config.js";
import {
  cleanupOldRooms,
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
  applyClaimEmoji,
  applyDeadlineExpired,
  applyReveal,
  applyRoll,
  applyStartGame,
  applyStartQuestion,
  applyStartRound,
  getAnswerDeadline,
  getRoomEmojiChoices,
  getSettings,
  getTakenEmojis,
  getViewPlayers,
  isGameEnded,
  isPlayerDone,
  maskPendingRolls,
} from "./game-logic.js";
import {
  renderChoices,
  renderEmojiPicker,
  renderEndGameSummary,
  renderFeed,
  renderLeaderboard,
  renderLobbyBadges,
  renderLobbyPlayers,
  renderPlayerList,
  renderPodium,
  renderWaitPanel,
} from "./render.js";
import { createBoardView } from "./board-view.js";
import { THEME_SIZE } from "./emoji-themes.js";
import { createDiceController, rollDie } from "./dice.js";
import { exportRoomToXlsx } from "./export.js";
import {
  isMuted,
  playClockTick,
  playCorrect,
  playCountdownBeep,
  playDiceHit,
  playDiceTick,
  playFanfare,
  playFireworkPop,
  playHop,
  playLadder,
  playReveal,
  playSnake,
  playWrong,
  setMuted,
  unlockAudio,
} from "./sound.js";
import { banner, confetti, fireworks, MEDAL_PALETTES } from "./celebrate.js";
import { clearRoomFromUrl, readRoomFromUrl, renderJoinQr, resetJoinQr } from "./qr.js";
import {
  getQuestionFromRoom,
  getQuestionSetIds,
  getQuestionSetName,
  getQuestionSetTheme,
} from "../questions.js";
import {
  clampPos,
  createId,
  createRoomCode,
  diceFace,
  escapeHtml,
  nameKey,
  normalizeName,
  parseIntOr,
  pickColorAvoidDuplicate,
  roundKey,
  sortedRoundNumbers,
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

  // room bar
  roomView: $("roomView"),
  roundInfo: $("roundInfo"),
  phaseInfo: $("phaseInfo"),
  hostGameControls: $("hostGameControls"),
  startGameBtn: $("startGameBtn"),
  startRoundBtn: $("startRoundBtn"),
  startQuestionBtn: $("startQuestionBtn"),
  toggleQuestionOverlayBtn: $("toggleQuestionOverlayBtn"),
  revealAnswerBtn: $("revealAnswerBtn"),

  // host view
  hostView: $("hostView"),
  hostLobby: $("hostLobby"),
  raceCode: $("raceCode"),
  joinQr: $("joinQr"),
  lobbyCount: $("lobbyCount"),
  lobbyBadges: $("lobbyBadges"),
  lobbyPlayers: $("lobbyPlayers"),
  hostBoardArea: $("hostBoardArea"),
  hostBoard: $("hostBoard"),
  waitPanel: $("waitPanel"),
  leaderboardPanel: $("leaderboardPanel"),
  leaderboard: $("leaderboard"),
  feedPanel: $("feedPanel"),
  feed: $("feed"),
  detailTable: $("detailTable"),
  playerList: $("playerList"),

  // host question panel
  hq: $("hostQuestion"),
  hqLabel: $("hqLabel"),
  hqSetName: $("hqSetName"),
  hqText: $("hqText"),
  hqRing: $("hqRing"),
  hqBar: $("hqBar"),
  hqNum: $("hqNum"),
  hqChoices: $("hqChoices"),
  hqCount: $("hqCount"),
  hqMeter: $("hqMeter"),

  // player view
  playerView: $("playerView"),
  meChip: $("meChip"),
  soundToggle: $("soundToggle"),
  diceDock: $("diceDock"),
  playerBoard: $("playerBoard"),
  playerAction: $("playerAction"),

  // end game
  endGameArea: $("endGameArea"),
  endGameTitle: $("endGameTitle"),
  endGameSummary: $("endGameSummary"),
  podium: $("podium"),
  exportXlsxBtn: $("exportXlsxBtn"),

  // countdown overlay
  questionCountdownOverlay: $("questionCountdownOverlay"),
  questionCountdownNumber: $("questionCountdownNumber"),

  // dice
  diceOverlay: $("diceOverlay"),
  dice3d: $("dice3d"),
  diceRollHint: $("diceRollHint"),
  rollDiceBtn: $("rollDiceBtn"),
};

const show = (el, visible, display = "block") => {
  if (el) el.style.display = visible ? display : "none";
};
const setHidden = (el, hidden) => {
  if (el) el.hidden = hidden;
};

/* =========================
   State
========================= */
const REVEAL_PANEL_MS = 3500; // จอ Host ค้างหน้าเฉลยไว้ก่อนให้หมากเดิน
// ช่วงให้เห็นแต้มอยู่ในแอนิเมชันแล้ว (ท้ายการกลิ้ง + พัก ≈ 1.2 วิ) จึงปิดลูกเต๋าทันทีที่แอนิเมชันจบ
const DICE_AUTO_CLOSE_MS = 0;

const session = {
  roomCode: null,
  role: null, // ROLE.HOST | ROLE.PLAYER
  playerId: null,
};

let roomUnsub = null;
let lastRoom = null; // ข้อมูลจริงจาก Firebase (ใช้ตัดสินใจ/ส่ง transaction)
let lastView = null; // ห้องที่ใช้แสดงผล (ซ่อนผลทอยที่ลูกเต๋าของคนทอยยังกลิ้งอยู่)
let entryPage = "landing"; // "landing" | "admin" | "player" | null (อยู่ในห้องแล้ว)
let presenceMode = null; // "remove" | "mark" — สิ่งที่ onDisconnect ถูกตั้งไว้ตอนนี้
let socketOnline = false; // ค่าจาก .info/connected
let healingPresence = false;

const busy = { create: false, join: false, roll: false, answer: false, host: false, emoji: false };

// จอ Host: แผงคำถาม/เฉลยบนกระดาน
const hq = {
  questionHidden: false, // host กดซ่อนคำถามช่วงตอบ
  revealKey: null, // เฉลยข้อที่กำลังแสดง
  revealOpen: false,
  revealCloseAt: 0,
  revealTimer: null,
};

// เสียง/ฉลอง: ค่าที่ใช้กันเล่นซ้ำ
const fx = { lastPlayed: {}, countdownBeep: null, clockTick: null, prevEnded: null, endTimer: null };

// แอนิเมชัน: การเดินใหม่จาก history ที่ยังไม่ได้เล่น
const anim = { seen: new Set(), primed: false, queue: [], timer: null };

const inRoom = () => !!session.roomCode && !!session.role;
const isHost = () => session.role === ROLE.HOST;
const isPlayer = () => session.role === ROLE.PLAYER;

// จอ Host = ลำโพงหลักของห้อง: เสียงบันได/งู/เข้าเส้นชัยของทุกคน (ไม่เล่นเสียงก้าวเดิน กันเสียงรก)
const hostBoardView = createBoardView(dom.hostBoard, {
  hooks: {
    onSpecial: (_pid, kind) => throttled(kind, kind === "ladder" ? playLadder : playSnake),
    onFinish: (pid) => celebrateFinish(pid),
  },
});
// มือถือ: เสียงเฉพาะหมากของตัวเอง
const playerBoardView = createBoardView(dom.playerBoard, {
  floatsOnlyForMe: true,
  hooks: {
    onStep: (pid) => pid === session.playerId && playHop(),
    onSpecial: (pid, kind) => pid === session.playerId && (kind === "ladder" ? playLadder() : playSnake()),
    onFinish: (pid) => celebrateFinish(pid),
  },
});
const activeBoardView = () => (isHost() ? hostBoardView : playerBoardView);

const visibleRect = (el) => (el && !el.hidden ? el.getBoundingClientRect() : null);
const dice = createDiceController({
  diceOverlayEl: dom.diceOverlay,
  dice3dEl: dom.dice3d,
  diceRollHintEl: dom.diceRollHint,
  rollDiceBtn: dom.rollDiceBtn,
  getDockRect: () => visibleRect(dom.diceDock), // จุดวางลูกเต๋า (เหนือการ์ดข้อความ)
  getTargetRect: () => visibleRect(dom.playerBoard), // โยนไปหยุดกลางกระดาน
  sound: { hit: playDiceHit, tick: playDiceTick },
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
// รอบแรกของ transaction ใช้ค่าใน cache ซึ่งยังว่างตอนเพิ่ง refresh/rejoin (ยังไม่ได้ subscribe ห้อง)
// → ต้องคืน null (ไม่ใช่ undefined) ให้ไปลองกับค่าจริงบน server; ถ้า server ไม่มีจริง การเขียน null ก็ไม่สร้างอะไร
function setPlayerConnected(code, pid, connected) {
  return runTransaction(playerRef(code, pid), (p) => {
    if (!p) return p;
    p.connected = connected;
    p.lastSeen = serverNow();
    p.disconnectedAt = connected ? null : serverNow();
    return p;
  });
}

// onDisconnect ของ connection เก่า (ก่อน refresh) อาจมาถึง server หลังหน้าใหม่ mark ออนไลน์ไปแล้ว
// → ถ้าเห็นตัวเองเป็น "หลุด" ทั้งที่ยังต่ออยู่ ให้ mark กลับเป็นออนไลน์
function healPresence(room) {
  if (!isPlayer() || !socketOnline || healingPresence) return;
  if (room.players?.[session.playerId]?.connected !== false) return;
  healingPresence = true;
  setPlayerConnected(session.roomCode, session.playerId, true)
    .catch((e) => console.warn("healPresence failed:", e))
    .finally(() => (healingPresence = false));
}

onConnectionChange((connected) => {
  socketOnline = connected;
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
  // ผู้เล่นไม่ต้องเห็น Room/Role (ประหยัดพื้นที่แถบบนมือถือ) — Host ยังเห็นเหมือนเดิม
  show(dom.roomPill, !isPlayer(), "inline-flex");
  show(dom.rolePill, !isPlayer(), "inline-flex");
  show(dom.adminTopBtn, !joined && entryPage === "landing", "inline-flex");
  show(dom.headerHomeBtn, !joined && (entryPage === "admin" || entryPage === "player"), "inline-flex");
  show(dom.headerExitBtn, joined, "inline-flex");
  if (dom.headerExitBtn) dom.headerExitBtn.textContent = isHost() ? "ยกเลิกห้อง" : "ออกจากห้อง";
}

function resetRoomUi() {
  stopTicker();
  clearTimeout(hq.revealTimer);
  clearTimeout(anim.timer);
  Object.assign(hq, { questionHidden: false, revealKey: null, revealOpen: false, revealCloseAt: 0, revealTimer: null });
  Object.assign(anim, { seen: new Set(), primed: false, queue: [], timer: null });
  clearInterval(fx.endTimer);
  clearTimeout(fx.revealTimer);
  Object.assign(fx, { countdownBeep: null, clockTick: null, prevEnded: null, endTimer: null, revealTimer: null });
  lastView = null;
  dom.podium?.classList.remove("rise");
  hostBoardView.reset();
  playerBoardView.reset();
  setHidden(dom.meChip, true);
  resetJoinQr(dom.joinQr);
  setHidden(dom.soundToggle, true);
  setHidden(dom.diceDock, true);
  dom.playerAction.innerHTML = "";
  dom.playerAction.dataset.mode = "";
  dice.setState("hidden");
  show(dom.questionCountdownOverlay, false);
}

// iPhone อาจค้างซูมจากตอนพิมพ์ชื่อ/รหัสห้อง: ปิดคีย์บอร์ด แล้วล็อก maximum-scale ชั่วครู่เพื่อให้กลับมา 1 เท่า
function resetPageZoom() {
  document.activeElement?.blur?.();
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta || (globalThis.visualViewport?.scale ?? 1) <= 1) return;
  const original = meta.getAttribute("content");
  meta.setAttribute("content", `${original}, maximum-scale=1`);
  setTimeout(() => meta.setAttribute("content", original), 400); // คืนค่าเดิม ผู้ใช้ยังซูมเองได้
}

function enterRoom(code, role, playerId = null) {
  session.roomCode = code;
  session.role = role;
  session.playerId = playerId;
  saveSession();

  resetPageZoom();
  resetRoomUi();
  playerBoardView.setMe(playerId);
  entryPage = null;
  show(dom.entrySection, false);
  setHidden(dom.roomView, true); // เปิดหลังได้ข้อมูลห้องรอบแรก (กันกระดานกระพริบก่อนเข้าหน้า Lobby)
  setHidden(dom.hostView, role !== ROLE.HOST);
  setHidden(dom.playerView, role !== ROLE.PLAYER);
  setHidden(dom.hostGameControls, role !== ROLE.HOST);
  updateHeader();
  subscribeRoom(code);
}

function resetToHome(message) {
  roomUnsub?.();
  roomUnsub = null;
  disarmPresence();
  clearSession();

  session.roomCode = null;
  session.role = null;
  session.playerId = null;
  lastRoom = null;
  Object.keys(busy).forEach((k) => (busy[k] = false));

  resetRoomUi();
  setHidden(dom.roomView, true);
  for (const el of [dom.playerList, dom.lobbyPlayers, dom.lobbyBadges, dom.leaderboard, dom.feed, dom.waitPanel]) {
    if (el) el.innerHTML = "";
  }

  showEntryPage("landing");
  if (message) alert(message);
}

/* =========================
   Room subscription + render
========================= */
function subscribeRoom(code) {
  roomUnsub?.();
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
      healPresence(room);
    } catch (e) {
      console.error("[renderRoom] crashed:", e);
    }
  });
}

const PHASE_TEXT = {
  [PHASE.IDLE]: "รอเริ่มรอบใหม่",
  [PHASE.ROLLING]: "ช่วงทอยลูกเต๋า",
  [PHASE.QUESTION_COUNTDOWN]: "เตรียมคำถาม",
  [PHASE.ANSWERING]: "ช่วงตอบคำถาม",
  [PHASE.RESULT]: "เฉลยคำตอบ",
  [PHASE.ENDED]: "เกมจบแล้ว",
};

// ผลทอยของคนอื่นถูกซ่อนจนลูกเต๋า 3D บนมือถือคนทอยกลิ้งจบ (DICE_ROLL_MS) — คนดูจอ Host จะได้ลุ้นไปพร้อมกัน
function renderRoom(rawRoom) {
  lastRoom = rawRoom;
  const masked = maskPendingRolls(rawRoom, serverNow(), DICE_ROLL_MS, isPlayer() ? session.playerId : null);
  const room = masked.room;
  lastView = room;
  clearTimeout(fx.revealTimer);
  if (masked.nextRevealAt) {
    fx.revealTimer = setTimeout(() => lastRoom && renderRoom(lastRoom), Math.max(0, masked.nextRevealAt - serverNow()) + 30);
  }
  const inLobby = room.status === STATUS.LOBBY;
  const ended = isGameEnded(room);
  const { maxRounds } = getSettings(room);

  updateHeader();
  if (dom.roundInfo) dom.roundInfo.textContent = inLobby ? "Lobby" : `รอบที่ ${room.currentRound || 0} / ${maxRounds}`;
  if (dom.phaseInfo) dom.phaseInfo.textContent = inLobby ? "รอผู้เล่น" : PHASE_TEXT[room.phase] || PHASE_TEXT[PHASE.IDLE];

  if (isHost()) renderHostView(room);
  else renderPlayerView(room);

  updateCountdownAndTimers(room);
  collectMoveEvents(room);
  renderBoards();

  setHidden(dom.roomView, false);
  setHidden(dom.endGameArea, !ended);
  setHidden(dom.exportXlsxBtn, !(ended && isHost()));
  if (ended) {
    renderEndGameSummary({ titleEl: dom.endGameTitle, summaryEl: dom.endGameSummary }, room, getViewPlayers(room));
    renderPodium(dom.podium, room, getViewPlayers(room), isPlayer() ? session.playerId : null);
  }
  // เพิ่งจบเกมต่อหน้า (ไม่ใช่เปิดหน้ามาตอนจบแล้ว) → ฉลองหลังหมากเดินเสร็จ
  if (fx.prevEnded === false && ended) scheduleEndCelebration();
  fx.prevEnded = ended;
}

/* ---------- Host ---------- */

function renderHostView(room) {
  const inLobby = room.status === STATUS.LOBBY;
  const players = room.players || {};

  setHidden(dom.hostLobby, !inLobby);
  setHidden(dom.hostBoardArea, inLobby);
  setHidden(dom.leaderboardPanel, inLobby);
  setHidden(dom.feedPanel, inLobby);
  setHidden(dom.detailTable, inLobby);

  renderWaitPanel(dom.waitPanel, room);
  if (inLobby) {
    if (dom.raceCode) dom.raceCode.textContent = session.roomCode || "-";
    renderJoinQr(dom.joinQr, session.roomCode);
    if (dom.lobbyCount) dom.lobbyCount.textContent = String(Object.keys(players).length);
    renderLobbyBadges(dom.lobbyBadges, room, session.roomCode);
    renderLobbyPlayers(dom.lobbyPlayers, players);
  } else {
    renderLeaderboard(dom.leaderboard, room, getViewPlayers(room));
    renderFeed(dom.feed, room);
    if (dom.detailTable?.open) renderPlayerList(dom.playerList, room, players);
  }

  updateSoundToggle();
  updateHostQuestionPanel(room); // ก่อน controls เพราะปุ่มสลับใช้สถานะแผงเฉลย
  updateHostControls(room);
}

function updateHostControls(room) {
  const phase = room.phase || PHASE.IDLE;
  const inLobby = room.status === STATUS.LOBBY;
  const ended = isGameEnded(room);
  const players = room.players || {};
  const inGame = !inLobby && !ended;

  // ผู้เล่นที่ยังออนไลน์และยังเล่นอยู่ต้องทอยครบก่อนเริ่มคำถาม (คนที่หลุดจะถูกนับเป็นทอย 0)
  const waitingFor = Object.values(players).filter((p) => !isPlayerDone(p) && p.connected !== false);
  const allRolled = waitingFor.every((p) => p.hasRolled);
  const showToggle = phase === PHASE.QUESTION_COUNTDOWN || phase === PHASE.ANSWERING || isRevealPhase(room);

  setHidden(dom.startGameBtn, !inLobby);
  if (dom.startGameBtn) dom.startGameBtn.disabled = busy.host || !Object.keys(players).length;

  setHidden(dom.startRoundBtn, !inGame);
  if (dom.startRoundBtn) dom.startRoundBtn.disabled = busy.host || (phase !== PHASE.IDLE && phase !== PHASE.RESULT);

  setHidden(dom.startQuestionBtn, !inGame);
  if (dom.startQuestionBtn) dom.startQuestionBtn.disabled = busy.host || !(phase === PHASE.ROLLING && allRolled);

  setHidden(dom.revealAnswerBtn, !inGame);
  if (dom.revealAnswerBtn) dom.revealAnswerBtn.disabled = busy.host || phase !== PHASE.ANSWERING;

  setHidden(dom.toggleQuestionOverlayBtn, !showToggle);
  if (dom.toggleQuestionOverlayBtn) {
    dom.toggleQuestionOverlayBtn.disabled = phase === PHASE.QUESTION_COUNTDOWN;
    dom.toggleQuestionOverlayBtn.textContent = isRevealPhase(room)
      ? hq.revealOpen ? "ซ่อนเฉลย ดูกระดาน" : "แสดงเฉลย"
      : hq.questionHidden ? "แสดงคำถาม" : "ซ่อนคำถาม ดูกระดาน";
  }
}

const isRevealPhase = (room) =>
  room.phase === PHASE.RESULT || (room.phase === PHASE.ENDED && room.ui?.keepQuestionOnEnd === true);

function revealInfo(room) {
  const ui = room.ui || {};
  const keep = room.phase === PHASE.ENDED && ui.keepQuestionOnEnd === true;
  const round = keep ? ui.keepQuestionRound ?? room.currentRound : room.currentRound;
  const qIndex = keep ? ui.keepQuestionIndex ?? room.questionIndex : room.questionIndex;
  return { round, qIndex, key: `${session.roomCode}|${round}|${qIndex}` };
}

function openReveal(key) {
  clearTimeout(hq.revealTimer);
  if (hq.revealKey !== null || anim.primed) playReveal();
  hq.revealKey = key;
  hq.revealOpen = true;
  hq.revealCloseAt = Date.now() + REVEAL_PANEL_MS;
  hq.revealTimer = setTimeout(() => {
    if (hq.revealKey === key) closeReveal();
  }, REVEAL_PANEL_MS);
}

function closeReveal() {
  clearTimeout(hq.revealTimer);
  hq.revealOpen = false;
  hq.revealCloseAt = 0;
  anim.queue.forEach((item) => (item.readyAt = 0)); // ให้หมากเดินทันที
  if (lastRoom) renderRoom(lastRoom);
}

function updateHostQuestionPanel(room) {
  const phase = room.phase || PHASE.IDLE;
  if (phase !== PHASE.ANSWERING) hq.questionHidden = false;

  if (isRevealPhase(room)) {
    const { round, qIndex, key } = revealInfo(room);
    if (hq.revealKey !== key) openReveal(key);
    const question = qIndex != null ? getQuestionFromRoom(room, qIndex) : null;
    setHidden(dom.hq, !hq.revealOpen || !question);
    if (hq.revealOpen && question) fillHostQuestion(room, question, { round, reveal: true });
    return;
  }
  hq.revealKey = null;
  hq.revealOpen = false;

  const question = getQuestionFromRoom(room, room.questionIndex ?? 0);
  const visible = phase === PHASE.ANSWERING && !hq.questionHidden && !!question;
  setHidden(dom.hq, !visible);
  if (visible) fillHostQuestion(room, question, { round: room.currentRound, reveal: false });
}

function fillHostQuestion(room, question, { round, reveal }) {
  const settings = getSettings(room);
  dom.hqLabel.textContent = reveal ? `เฉลยรอบที่ ${round}` : `คำถามรอบที่ ${round}`;
  dom.hqSetName.textContent = getQuestionSetName(settings.questionSetId);
  dom.hqText.textContent = question.text;
  dom.hqText.classList.toggle("long", question.text.length > 160 && question.text.length <= 320);
  dom.hqText.classList.toggle("very-long", question.text.length > 320);
  setHidden(dom.hqRing, reveal);
  dom.hq.classList.toggle("no-ring", reveal);

  const active = Object.values(room.players || {}).filter((p) => !isPlayerDone(p) && p.connected !== false);
  const records = Object.values(room.history?.[roundKey(round)]?.answers || {});
  const answered = reveal ? records.filter((r) => r.answered).length : active.filter((p) => p.answered).length;
  const total = reveal ? records.filter((r) => !r.missedAnswer && (r.basePosition ?? 0) < BOARD_SIZE).length : active.length;
  dom.hqCount.textContent = `ตอบแล้ว ${answered}/${total}`;
  dom.hqMeter.style.width = `${total ? (answered / total) * 100 : 0}%`;
  dom.hqMeter.parentElement.classList.toggle("complete", total > 0 && answered >= total);

  const counts = {};
  if (reveal) records.forEach((r) => r.selectedOption && (counts[r.selectedOption] = (counts[r.selectedOption] || 0) + 1));
  dom.hqChoices.innerHTML = Object.entries(question.choices)
    .map(([k, v]) => {
      const cls = reveal ? (k === question.correctOption ? " correct" : " dim") : "";
      const cnt = reveal ? `<span class="cnt">${counts[k] || 0} คน</span>` : "";
      return `<div class="hq-choice${cls}"><span>${escapeHtml(k)}. ${escapeHtml(v)}</span>${cnt}</div>`;
    })
    .join("");
  if (!reveal) updateHostClock(room);
}

function updateHostClock(room) {
  const deadline = getAnswerDeadline(room);
  const total = room.answerTimeSeconds || 1;
  const left = deadline == null ? total : Math.max(0, Math.ceil((deadline - serverNow()) / 1000));
  dom.hqNum.textContent = String(left);
  dom.hqBar.style.strokeDashoffset = String(276.5 * (1 - left / total));
  dom.hqRing.classList.toggle("low", left <= 5);
  dom.hqRing.classList.toggle("done", left === 0);
  if (left === 0) dom.hqCount.textContent = `หมดเวลา · ${dom.hqCount.textContent.replace(/^หมดเวลา · /, "")}`;
}

/* ---------- Player ---------- */

function renderPlayerView(room) {
  const players = room.players || {};
  const me = players[session.playerId] || getViewPlayers(room)[session.playerId] || {};
  const inLobby = room.status === STATUS.LOBBY;
  const color = me.color || "#9e9e9e";

  setHidden(dom.playerBoard, inLobby);
  dom.playerView.classList.toggle("in-lobby", inLobby);

  // ตัวหมาก + ตำแหน่งของตัวเอง อยู่ในแถบเดียวกับ "รอบที่"
  const av = `<span class="me-av${me.emoji ? "" : " waiting"}" style="--c:${escapeHtml(color)}">${escapeHtml(me.emoji || "❔")}</span>`;
  // ระหว่างลูกเต๋ากลิ้ง แสดงช่องเดิมไว้ก่อน ไม่ให้รู้ผลล่วงหน้า
  const shownPos = isRollRevealPending(room, me) ? me.startOfRoundPos ?? me.position : me.position;
  setHidden(dom.meChip, false);
  dom.meChip.innerHTML = inLobby
    ? `${av}<span>${escapeHtml(me.name || "")}</span>`
    : `${av}<span>ช่อง <b>${clampPos(shownPos)}</b>${isPlayerDone(me) && !isRollRevealPending(room, me) ? " · 🏁" : ""}</span>`;

  if (inLobby) renderPickerAction(room);
  else renderGameAction(room, me);

  updateSoundToggle();
  syncDiceOverlay(room, me);
}

// ช่วงทอย: เปิดลูกเต๋า 3D รอให้ผู้เล่นแตะที่ลูกเต๋าเอง (เหมือนเดิม)
function syncDiceOverlay(room, me) {
  const canRoll = room.phase === PHASE.ROLLING && room.status === STATUS.IN_GAME && !me.hasRolled && !isPlayerDone(me);
  // เว้นที่วางลูกเต๋าไว้จนลูกเต๋าปิด — การ์ดข้อความจะได้ไม่เลื่อนขึ้นระหว่างลูกเต๋าค้างอยู่กลางกระดาน
  setHidden(dom.diceDock, !(canRoll || busy.roll || dice.getState() !== "hidden"));
  if (busy.roll) return;
  const state = dice.getState();
  if (canRoll && (state === "hidden" || state === "waiting")) dice.setState("waiting"); // waiting ซ้ำ = จัดตำแหน่งตามจุดวางใหม่
  else if (!canRoll && state === "waiting") dice.setState("hidden");
  else if (state !== "hidden" && state !== "done" && room.phase !== PHASE.ROLLING) dice.setState("hidden");
}

// ผู้เล่นทอยแล้วแต่ลูกเต๋า 3D ยังกลิ้ง/ยังไม่ปิด → ยังไม่เฉลยแต้ม
function isRollRevealPending(room, me) {
  return room.phase === PHASE.ROLLING && !!me.hasRolled && (busy.roll || dice.getState() !== "hidden");
}

function updateSoundToggle() {
  if (!dom.soundToggle) return;
  setHidden(dom.soundToggle, !inRoom());
  dom.soundToggle.textContent = isMuted() ? "🔇" : "🔊"; // ไอคอนอย่างเดียว ให้แถบบนมือถืออยู่บรรทัดเดียว
  dom.soundToggle.title = isMuted() ? "เปิดเสียง" : "ปิดเสียง";
  dom.soundToggle.setAttribute("aria-label", isMuted() ? "เปิดเสียง" : "ปิดเสียง");
  dom.soundToggle.setAttribute("aria-pressed", String(!isMuted()));
}

function setActionMode(mode) {
  if (dom.playerAction.dataset.mode === mode) return false;
  dom.playerAction.dataset.mode = mode;
  dom.playerAction.classList.toggle("picker", mode === "picker");
  return true;
}

function renderPickerAction(room) {
  if (setActionMode("picker")) {
    dom.playerAction.innerHTML = `
      <div class="pick-head"><strong>เลือกตัวหมากของคุณ</strong><button type="button" class="btn-ghost" data-action="random-emoji">🎲 สุ่มให้</button></div>
      <div class="pick-grid" id="pickGrid"></div>
      <div class="pick-note">ตัวสีเทามีคนเลือกแล้ว · เปลี่ยนได้จนกว่าครูจะเริ่มเกม</div>`;
  }
  renderEmojiPicker($("pickGrid"), {
    choices: getRoomEmojiChoices(room),
    taken: getTakenEmojis(room),
    players: room.players || {},
    myPlayerId: session.playerId,
    themeSize: THEME_SIZE,
  });
}

function renderGameAction(room, me) {
  const phase = room.phase || PHASE.IDLE;
  const round = room.currentRound || 0;
  const box = dom.playerAction;
  const mode = `${phase}|${round}|${isPlayerDone(me)}|${me.hasRolled}`;
  const changed = setActionMode(mode);
  const html = (s) => {
    box.innerHTML = s;
  };

  if (phase === PHASE.ENDED) {
    const rank = (room.winners || []).find((w) => w.playerId === session.playerId)?.rank;
    html(`<div class="big">🏁</div><div><b>เกมจบแล้ว</b></div><div class="sub">${
      rank ? `คุณเข้าเส้นชัยเป็นอันดับ ${rank}` : `คุณจบที่ช่อง ${clampPos(me.position)}`
    } · ดูสรุปผลด้านล่าง</div>`);
    return;
  }
  if (isPlayerDone(me)) {
    const rank = (room.winners || []).find((w) => w.playerId === session.playerId)?.rank;
    html(`<div class="big">🏁</div><div><b>เข้าเส้นชัยแล้ว!</b></div><div class="sub">${rank ? `อันดับ ${rank} · ` : ""}รอเพื่อน ๆ จบเกม</div>`);
    return;
  }

  switch (phase) {
    case PHASE.ROLLING: {
      if (!me.hasRolled || isRollRevealPending(room, me)) {
        html(busy.roll || me.hasRolled
          ? `<div class="big">🎲</div><div><b>ลูกเต๋ากำลังกลิ้ง…</b></div>`
          : `<div><b>แตะที่ลูกเต๋าด้านบนเพื่อทอย</b></div><div class="sub">ลูกเต๋าจะกลิ้งไปหยุดกลางกระดาน</div>`);
        return;
      }
      const dm = room.history?.[roundKey(round)]?.diceMoves?.[session.playerId];
      const extra =
        dm?.special === "ladder" ? `🪜 ขึ้นบันไดไปช่อง ${dm.toPosition}!` : dm?.special === "snake" ? `🐍 โดนงูกัด ลงไปช่อง ${dm.toPosition}` : "";
      html(`<div class="dice-face-big" aria-label="ทอยได้ ${me.lastRoll ?? "-"} แต้ม">${diceFace(me.lastRoll)}</div>
        <div><b>ทอยได้ ${me.lastRoll ?? "-"} แต้ม</b></div>${extra ? `<div><b>${extra}</b></div>` : ""}<div class="sub">รอครูเริ่มคำถาม</div>`);
      return;
    }
    case PHASE.QUESTION_COUNTDOWN:
      html(`<div class="big">❓</div><div><b>เตรียมตัว คำถามกำลังมา</b></div>`);
      return;
    case PHASE.ANSWERING: {
      const question = getQuestionFromRoom(room, room.questionIndex ?? 0);
      if (!question) return;
      const deadline = getAnswerDeadline(room);
      const expired = room.answerDeadlineExpired === true || (deadline != null && serverNow() > deadline);
      if (changed || !box.querySelector(".choices")) {
        html(`<div class="q-time" id="qTime"><span>ดูคำถามบนจอหน้าห้องได้ด้วย</span><span>เหลือ <b id="qTimeLeft">-</b> วินาที</span></div>
          <div class="q-text"></div><div class="choices" id="playerChoices"></div>`);
        box.querySelector(".q-text").textContent = question.text;
      }
      renderChoices($("playerChoices"), question, { selected: me.answer ?? null, disabled: expired });
      updatePlayerClock(room);
      return;
    }
    case PHASE.RESULT: {
      const question = getQuestionFromRoom(room, room.questionIndex ?? 0);
      const rec = room.history?.[roundKey(round)]?.answers?.[session.playerId];
      html(`${resultMessage(rec)}<div class="choices" id="playerChoices"></div><div class="sub">กดดูกระดานด้านบนว่าหมากเดินไปไหน</div>`);
      renderChoices($("playerChoices"), question, { selected: rec?.selectedOption ?? null, showResult: true });
      return;
    }
    default:
      html(`<div class="big">⏳</div><div><b>${round === 0 ? "เกมเริ่มแล้ว!" : "จบรอบแล้ว"}</b></div><div class="sub">รอครูเริ่มรอบ${round === 0 ? "แรก" : "ใหม่"}</div>`);
  }
}

function resultMessage(rec) {
  if (!rec) return `<div class="big">⏳</div><div><b>กำลังสรุปผล…</b></div>`;
  if (rec.missedAnswer) return `<div class="big">📴</div><div><b>หลุดการเชื่อมต่อ รอบนี้ไม่ขยับ</b></div>`;
  const move = Math.abs(rec.configuredMove || 0);
  let head;
  if (rec.correct) head = `<div class="big">✅</div><div><b>ตอบถูก เดินหน้า ${move} ช่อง</b></div>`;
  else if (rec.answered) head = `<div class="big">❌</div><div><b>ตอบผิด ถอยหลัง ${move} ช่อง</b></div>`;
  else head = `<div class="big">⌛</div><div><b>ไม่ได้ตอบ ถอยหลัง ${move} ช่อง</b></div>`;

  const extra = {
    ladder: `🪜 แล้วขึ้นบันไดไปช่อง ${rec.finalPosition}!`,
    snake: `🐍 แล้วโดนงูกัด ลงไปช่อง ${rec.finalPosition}`,
  }[rec.special] || {
    snake: "🛡️ ตอบถูกจึงไม่ตกงู",
    ladder: "ตอบผิดจึงขึ้นบันไดไม่ได้",
  }[rec.blocked] || "";
  return `${head}${extra ? `<div class="sub">${extra}</div>` : ""}`;
}

function updatePlayerClock(room) {
  const el = $("qTimeLeft");
  if (!el) return;
  const deadline = getAnswerDeadline(room);
  const left = deadline == null ? room.answerTimeSeconds ?? "-" : Math.max(0, Math.ceil((deadline - serverNow()) / 1000));
  el.textContent = String(left);
  $("qTime")?.classList.toggle("low", left !== "-" && left <= 5);
  if (left === 0) $("playerChoices")?.querySelectorAll("button").forEach((b) => (b.disabled = true));
}

/* ---------- Countdown + answer timers ---------- */

function beginAnswering() {
  return runTransaction(roomRef(session.roomCode), (r) => applyBeginAnswering(r, serverNow())).catch((e) => console.error(e));
}

function updateCountdownAndTimers(room) {
  const phase = room.phase || PHASE.IDLE;

  if (phase === PHASE.QUESTION_COUNTDOWN) {
    const startAt = room.questionCountdownStartAt;
    const endAt = startAt + (room.questionCountdownSeconds || QUESTION_COUNTDOWN_SECONDS) * 1000;
    show(dom.questionCountdownOverlay, true, "flex");
    startTicker(`${session.roomCode}|countdown|${room.currentRound}|${startAt}`, () => {
      const remaining = Math.max(0, Math.ceil((endAt - serverNow()) / 1000));
      if (dom.questionCountdownNumber) dom.questionCountdownNumber.textContent = remaining > 0 ? String(remaining) : "";
      if (isHost() && fx.countdownBeep !== remaining) {
        if (fx.countdownBeep !== null || remaining > 0) playCountdownBeep(remaining === 0);
        fx.countdownBeep = remaining;
      }
      if (remaining > 0) return;

      finishTicker();
      show(dom.questionCountdownOverlay, false);
      // Host เป็นคนย้ายไป phase ตอบคำถาม — ผู้เล่นทำแทนเฉพาะเมื่อ host ไม่ทำ (เช่น host หลุด)
      if (isHost()) {
        beginAnswering();
      } else {
        setTimeout(() => {
          if (lastRoom?.phase === PHASE.QUESTION_COUNTDOWN && lastRoom.questionCountdownStartAt === startAt) beginAnswering();
        }, COUNTDOWN_FALLBACK_MS);
      }
    }, 100);
    return;
  }

  show(dom.questionCountdownOverlay, false);

  if (phase === PHASE.ANSWERING) {
    const deadline = getAnswerDeadline(room);
    if (deadline == null) return;
    startTicker(`${session.roomCode}|answer|${room.currentRound}|${room.answerStartAt}`, () => {
      const current = lastRoom || room;
      if (isHost()) updateHostClock(current);
      else updatePlayerClock(current);
      // ติ๊กช่วง 5 วินาทีสุดท้าย: Host เสมอ / ผู้เล่นเฉพาะคนที่ยังไม่ตอบ
      const left = Math.max(0, Math.ceil((deadline - serverNow()) / 1000));
      const me = current.players?.[session.playerId];
      if (left > 0 && left <= 5 && fx.clockTick !== left && (isHost() || (me && !me.answered))) playClockTick();
      fx.clockTick = left;
      if (serverNow() <= deadline) return;

      finishTicker();
      if (isHost()) {
        runTransaction(roomRef(session.roomCode), (r) => applyDeadlineExpired(r, serverNow())).catch((e) => console.error(e));
      }
    }, 250);
    return;
  }

  stopTicker();
}

/* ---------- Board animation ---------- */

// หาการเดินใหม่จาก history (ทอย/เฉลย) — ครั้งแรกที่เข้าห้องจะจำไว้เฉย ๆ ไม่เล่นแอนิเมชันย้อนหลัง
function collectMoveEvents(room) {
  const history = room.history || {};
  const host = isHost();

  for (const rn of sortedRoundNumbers(history)) {
    const rd = history[roundKey(rn)] || {};

    for (const [pid, dm] of Object.entries(rd.diceMoves || {})) {
      const key = `d|${rn}|${pid}`;
      if (anim.seen.has(key)) continue;
      anim.seen.add(key);
      if (!anim.primed || dm.missed || !(dm.diceRoll > 0)) continue;
      anim.queue.push({
        readyAt: 0,
        ev: {
          pid,
          kind: "dice",
          roll: dm.diceRoll,
          from: dm.fromPosition,
          landing: dm.landingPosition ?? dm.toPosition,
          to: dm.toPosition,
          special: dm.special || null,
        },
      });
    }

    for (const [pid, ar] of Object.entries(rd.answers || {})) {
      const key = `a|${rn}|${pid}`;
      if (anim.seen.has(key)) continue;
      anim.seen.add(key);
      // มือถือ: เสียงตอบถูก/ผิดของตัวเองตอนเฉลย
      if (anim.primed && isPlayer() && pid === session.playerId && !ar.missedAnswer && (ar.basePosition ?? 0) < BOARD_SIZE) {
        (ar.correct ? playCorrect : playWrong)();
      }
      if (!anim.primed || ar.missedAnswer || (ar.basePosition ?? 0) >= BOARD_SIZE) continue;
      anim.queue.push({
        // จอ Host: รอให้ทุกคนเห็นเฉลยก่อน แล้วค่อยให้หมากเดิน
        readyAt: host && hq.revealOpen ? hq.revealCloseAt : 0,
        ev: {
          pid,
          kind: "answer",
          correct: ar.correct === true,
          delta: ar.configuredMove ?? 0,
          from: ar.basePosition,
          landing: ar.landingPosition ?? ar.finalPosition,
          to: ar.finalPosition,
          special: ar.special || null,
          blocked: ar.blocked || null,
        },
      });
    }
  }
  anim.primed = true;
}

function boardPlayers(room) {
  const out = {};
  for (const [pid, p] of Object.entries(getViewPlayers(room))) {
    out[pid] = {
      name: p.name || pid,
      emoji: p.emoji || null,
      color: p.color,
      position: clampPos(p.position),
      offline: p.connected === false,
    };
  }
  return out;
}

function renderBoards() {
  clearTimeout(anim.timer);
  const room = lastView;
  if (!room || room.status === STATUS.LOBBY) return;

  const now = Date.now();
  const diceOpen = dice.getState() !== "hidden";
  const ready = [];
  const keep = [];
  const hold = new Set();
  for (const item of anim.queue) {
    // หมากของตัวเอง: รอให้ปิดลูกเต๋าก่อนค่อยเดิน
    const waitDice = isPlayer() && item.ev.kind === "dice" && item.ev.pid === session.playerId && diceOpen;
    if (item.readyAt > now || waitDice) {
      keep.push(item);
      hold.add(item.ev.pid);
    } else {
      ready.push(item.ev);
    }
  }
  anim.queue = keep;
  activeBoardView().update(boardPlayers(room), { events: ready, hold });

  const nextAt = Math.min(...keep.map((i) => i.readyAt).filter((t) => t > now));
  if (Number.isFinite(nextAt)) anim.timer = setTimeout(renderBoards, nextAt - now + 20);
}

/* =========================
   Celebrations (พลุ / แท่นรับรางวัล / เสียง)
========================= */
const MEDALS = ["🥇", "🥈", "🥉"];

function throttled(kind, play, gapMs = 150) {
  const now = Date.now();
  if (now - (fx.lastPlayed[kind] || 0) < gapMs) return;
  fx.lastPlayed[kind] = now;
  play();
}

// หมากเดินถึงเส้นชัยบนจอ: อันดับ 1–3 ได้พลุ/กระดาษสี
function celebrateFinish(pid) {
  const room = lastRoom;
  const p = room ? getViewPlayers(room)[pid] : null;
  if (!p) return;
  const rank = (room.winners || []).find((w) => w.playerId === pid)?.rank ?? null;
  const who = `${p.emoji || ""} ${p.name}`.trim();
  const mine = isPlayer() && pid === session.playerId;

  if (rank && rank <= 3) {
    const title = `${MEDALS[rank - 1]} ${who} เข้าเส้นชัยอันดับ ${rank}!`;
    if (isHost()) {
      fireworks({ bursts: 4 - rank + 2, palette: MEDAL_PALETTES[rank], onBurst: () => throttled("pop", playFireworkPop, 90) });
      banner(title);
      playFanfare();
    } else if (mine) {
      confetti({ palette: MEDAL_PALETTES[rank] });
      banner(`${MEDALS[rank - 1]} คุณเข้าเส้นชัยอันดับ ${rank}!`);
      playFanfare();
    } else {
      banner(title, "", { small: true, ms: 2000 });
    }
    return;
  }
  // อันดับถัดไป: แจ้งเบา ๆ
  if (isHost()) {
    banner(`🏁 ${who} เข้าเส้นชัย${rank ? ` อันดับ ${rank}` : ""}`, "", { small: true, ms: 2000 });
    throttled("finish", playCorrect);
  } else if (mine) {
    banner(`🏁 คุณเข้าเส้นชัย${rank ? ` อันดับ ${rank}` : ""}!`, "", { small: true });
    playFanfare();
  }
}

// จบเกม: รอหมากเดินจบ (และแผงเฉลยปิด) แล้วค่อยขึ้นแท่นรับรางวัล + พลุ
function scheduleEndCelebration() {
  clearInterval(fx.endTimer);
  const startedAt = Date.now();
  fx.endTimer = setInterval(() => {
    const idle = activeBoardView().isIdle() && anim.queue.length === 0 && !hq.revealOpen;
    if (!idle && Date.now() - startedAt < 12000) return;
    clearInterval(fx.endTimer);
    fx.endTimer = null;
    celebrateEnd();
  }, 300);
}

function celebrateEnd() {
  const room = lastRoom;
  if (!room || !isGameEnded(room)) return;
  dom.podium?.classList.remove("rise");
  void dom.podium?.offsetWidth; // เริ่มแอนิเมชันแท่นใหม่
  dom.podium?.classList.add("rise");
  dom.endGameArea?.scrollIntoView({ behavior: "smooth", block: "start" });

  if (isHost()) {
    fireworks({ bursts: 9, spreadMs: 3200, onBurst: () => throttled("pop", playFireworkPop, 90) });
    playFanfare(true);
    return;
  }
  const myRank = room.winners?.findIndex((w) => w.playerId === session.playerId);
  if (myRank >= 0 && myRank < 3) confetti({ palette: MEDAL_PALETTES[myRank + 1], pieces: 160 });
  playFanfare(myRank >= 0 && myRank < 3);
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
  const questionSetId = dom.questionSetSelect?.value || DEFAULT_SETTINGS.questionSetId;
  return {
    questionSetId,
    emojiTheme: getQuestionSetTheme(questionSetId),
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
    enterRoom(code, ROLE.HOST); // Race Code แสดงตัวใหญ่ในหน้า Lobby
    // ล้างห้องเก่าที่ค้างอยู่ (ทำเบื้องหลัง ไม่ให้ช้าตอนสร้างห้อง)
    cleanupOldRooms(ROOM_MAX_AGE_MS, code)
      .then((removed) => removed.length && console.info(`[cleanup] ลบห้องเก่า ${removed.length} ห้อง`, removed))
      .catch((e) => console.warn("[cleanup] failed:", e));
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
    if (lastRoom) updateHostControls(lastRoom);
  }
}

function hostStartGame() {
  return hostTransaction((room) => applyStartGame(room, serverNow()), "เริ่มเกมไม่ได้ (ห้องเริ่มไปแล้ว หรือยังไม่มีผู้เล่น)");
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

function hostToggleQuestionPanel() {
  if (!isHost() || !lastRoom) return;
  if (isRevealPhase(lastRoom)) {
    if (hq.revealOpen) {
      closeReveal();
      return;
    }
    hq.revealOpen = true;
  } else {
    hq.questionHidden = !hq.questionHidden;
  }
  renderRoom(lastRoom);
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
      // rejoin ได้เฉพาะชื่อที่หลุดอยู่ — กันแย่งชื่อคนที่ยังออนไลน์ (ได้ตัวหมากเดิมกลับมา)
      if (players[existingPid].connected !== false) {
        alert("ชื่อนี้กำลังออนไลน์อยู่ในห้องแล้ว กรุณาใช้ชื่อของตนเอง (หรือแจ้งผู้จัดหากเป็นชื่อซ้ำ)");
        return;
      }
      await setPlayerConnected(code, existingPid, true);
      enterRoom(code, ROLE.PLAYER, existingPid);
      return;
    }

    // join ใหม่: transaction บนห้อง กันชื่อซ้ำกรณีสองคนกดพร้อมกัน (เลือกตัวหมากทีหลังใน lobby)
    const pid = createId("p");
    const joinTx = await runTransaction(roomRef(code), (r) => {
      if (!r) return r;
      if (r.status !== STATUS.LOBBY) return;
      r.players = r.players || {};
      if (Object.values(r.players).some((p) => nameKey(p.name) === key)) return;
      r.players[pid] = {
        name,
        color: pickColorAvoidDuplicate(r.players),
        emoji: null,
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
  } catch (err) {
    console.error("Error joining room:", err);
    alert("มีปัญหาในการ Join ห้อง ดู error ใน Console");
  } finally {
    busy.join = false;
    if (dom.joinRoomBtn) dom.joinRoomBtn.disabled = false;
  }
}

// เลือกตัวหมาก: ถ้ามีคนแย่งไปก่อน transaction จะยกเลิกเงียบ ๆ แล้วช่องนั้นจะกลายเป็นสีเทาเอง
async function playerClaimEmoji(emoji) {
  if (!isPlayer() || busy.emoji || !emoji) return;
  busy.emoji = true;
  try {
    await runTransaction(roomRef(session.roomCode), (r) => applyClaimEmoji(r, session.playerId, emoji));
  } catch (e) {
    console.warn("claim emoji failed:", e);
  } finally {
    busy.emoji = false;
  }
}

function playerRandomEmoji() {
  if (!lastRoom) return;
  const taken = getTakenEmojis(lastRoom, session.playerId);
  const free = getRoomEmojiChoices(lastRoom).filter((e) => !taken.has(e));
  if (free.length) playerClaimEmoji(free[Math.floor(Math.random() * free.length)]);
}

async function playerRollDice() {
  if (!isPlayer() || busy.roll || !lastRoom) return;

  const me = lastRoom.players?.[session.playerId];
  if (lastRoom.phase !== PHASE.ROLLING || !me || me.hasRolled || isPlayerDone(me)) return;

  unlockAudio(); // เบราว์เซอร์อนุญาตเสียงหลังผู้ใช้แตะเท่านั้น
  busy.roll = true;
  renderRoom(lastRoom);
  try {
    // บันทึกผลก่อน แล้วค่อยเล่นแอนิเมชันไปพร้อมกัน — ถ้าผู้ใช้สลับแท็บ (แอนิเมชันหยุด) ผลก็ยังถูกบันทึก
    const roll = rollDie();
    const animation = dice.rollWithOverlay(DICE_ROLL_MS, roll);
    const tx = await runTransaction(roomRef(session.roomCode), (room) =>
      applyRoll(room, session.playerId, roll, serverNow())
    );
    if (!tx.committed) {
      dice.setState("hidden");
      alert("บันทึกผลทอยไม่สำเร็จ (สถานะห้องเปลี่ยนแล้ว)");
      return;
    }
    await animation;
    dice.setState("done", { roll });
    setTimeout(() => {
      if (dice.getState() === "done") {
        dice.setState("hidden");
        if (lastRoom) renderRoom(lastRoom);
      }
    }, DICE_AUTO_CLOSE_MS);
  } catch (e) {
    console.error(e);
    dice.setState("hidden");
    alert("ทอยเต๋าไม่สำเร็จ (เครือข่าย/ระบบมีปัญหา ลองใหม่)");
  } finally {
    busy.roll = false;
    if (lastRoom) renderRoom(lastRoom);
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
    // เลิกฟังห้องก่อน ไม่งั้น healPresence จะ mark ออนไลน์กลับทันทีที่เขียนว่าออก
    roomUnsub?.();
    roomUnsub = null;
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
  on(dom.toggleQuestionOverlayBtn, "click", hostToggleQuestionPanel);
  on(dom.revealAnswerBtn, "click", hostReveal);
  on(dom.exportXlsxBtn, "click", hostExport);
  on(dom.detailTable, "toggle", () => {
    if (dom.detailTable.open && lastRoom) renderPlayerList(dom.playerList, lastRoom, lastRoom.players || {});
  });

  // player
  on(dom.joinRoomBtn, "click", playerJoin);
  // เบราว์เซอร์อนุญาตเสียงหลังผู้ใช้แตะครั้งแรก — Host ปลดล็อกตอนกดปุ่มใดก็ได้
  document.addEventListener("pointerdown", () => !isMuted() && unlockAudio(), { passive: true });
  on(dom.rollDiceBtn, "click", playerRollDice); // แตะที่ลูกเต๋า 3D
  on(dom.diceDock, "click", () => dice.getState() === "waiting" && playerRollDice()); // แตะตรงไหนในกล่องลูกเต๋าก็ได้
  on(dom.soundToggle, "click", () => {
    setMuted(!isMuted());
    if (!isMuted()) unlockAudio();
    updateSoundToggle();
  });
  on(dom.playerAction, "click", (e) => {
    const tile = e.target.closest(".pick-tile");
    if (tile && !tile.disabled) return playerClaimEmoji(tile.dataset.emoji);
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (action === "random-emoji") return playerRandomEmoji();
    const choice = e.target.closest("button[data-key]");
    if (choice && !choice.disabled) playerSubmitAnswer(choice.dataset.key);
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
  const roomFromLink = readRoomFromUrl(); // สแกน QR code มา: ?room=XXXXXX
  if (await restoreSession()) {
    clearRoomFromUrl();
    return;
  }
  if (roomFromLink) {
    showEntryPage("player");
    dom.roomCodeInput.value = roomFromLink;
    dom.playerNameInput.focus();
    clearRoomFromUrl();
  } else {
    showEntryPage("landing");
  }
}

window.addEventListener("unhandledrejection", (e) => console.error("[UNHANDLED PROMISE]", e.reason));

boot();
