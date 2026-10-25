// app.js
// จุดเริ่มต้นของแอป: state ของ session, flow ของ Host/Player, การ sync กับ Firebase และผูก event UI
//
// โครงสร้างไฟล์:
//   config.js        ค่าคงที่ + Firebase config
//   firebase.js      เชื่อมต่อ DB + เวลา server
//   board-config.js  กระดาน 6×5, บันไดส้ม (ปีน)/บันไดม่วง (ร่วง) และกติกา
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
  push,
  questionSetRef,
  questionSetsRef,
  boardImageRef,
  boardImagesRef,
  resultIndexRef,
  resultRef,
  resultsIndexRef,
  remove,
  roomRef,
  runTransaction,
  serverNow,
  serverTimestamp,
  set,
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
import { isDrop } from "./board-config.js";
import { THEME_SIZE } from "./emoji-themes.js";
import {
  copySet,
  fromDraft,
  listQuestionSets,
  newDraft,
  roomQuestionSnapshot,
  toDraft,
  validateDraft,
} from "./question-sets.js";
import { createSetEditor, renderLibrary } from "./question-editor.js";
import { buildResultIndex, buildResultRecord, computeGameInsights, computeSetInsights, listResults, resultKey } from "./results.js";
import { renderResultDetail, renderResultsList, renderSetInsights, setKey } from "./results-view.js";
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
  playDrop,
  playWrong,
  setMuted,
  unlockAudio,
} from "./sound.js";
import { banner, confetti, fireworks, MEDAL_PALETTES } from "./celebrate.js";
import { openIntroClip } from "./intro-clip.js";
import { clearRoomFromUrl, readRoomFromUrl, renderJoinQr, resetJoinQr } from "./qr.js";
import { getQuestionFromRoom, getRoomQuestionSetName } from "../questions.js";
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

  // entry
  entrySection: $("entrySection"),
  entryLanding: $("entryLanding"),
  adminEntryPage: $("adminEntryPage"),
  playerEntryPage: $("playerEntryPage"),
  adminPinPage: $("adminPinPage"),
  hostMenuPage: $("hostMenuPage"),
  libraryPage: $("libraryPage"),
  setEditorPage: $("setEditorPage"),
  resultsPage: $("resultsPage"),
  resultDetailPage: $("resultDetailPage"),
  setInsightsPage: $("setInsightsPage"),
  resultsList: $("resultsList"),
  resultDetail: $("resultDetail"),
  setInsights: $("setInsights"),
  setLibrary: $("setLibrary"),
  setEditorTitle: $("setEditorTitle"),
  saveSetBtn: $("saveSetBtn"),

  // admin entry
  hostNameInput: $("hostNameInput"),
  questionSetPicker: $("questionSetPicker"),
  maxRoundsInput: $("maxRoundsInput"),
  maxWinnersInput: $("maxWinnersInput"),
  rewardCorrectInput: $("rewardCorrectInput"),
  penaltyWrongInput: $("penaltyWrongInput"),
  confirmCreateRoomBtn: $("confirmCreateRoomBtn"),

  // player entry
  roomCodeInput: $("roomCodeInput"),
  roomCodeBoxes: $("roomCodeBoxes"),
  playerNameInput: $("playerNameInput"),
  joinRoomBtn: $("joinRoomBtn"),

  // admin PIN
  pinDots: $("pinDots"),

  // room bar
  roomView: $("roomView"),
  roundInfo: $("roundInfo"),
  phaseInfo: $("phaseInfo"),
  hostGameControls: $("hostGameControls"),
  phaseSteps: $("phaseSteps"),
  hostNextBtn: $("hostNextBtn"),
  gameExitBtn: $("gameExitBtn"),
  detailBtn: $("detailBtn"),
  detailCloseBtn: $("detailCloseBtn"),
  toggleQuestionOverlayBtn: $("toggleQuestionOverlayBtn"),

  // host view
  hostView: $("hostView"),
  hostLobby: $("hostLobby"),
  raceCode: $("raceCode"),
  joinQr: $("joinQr"),
  lobbyCount: $("lobbyCount"),
  lobbyBadges: $("lobbyBadges"),
  lobbyPlayers: $("lobbyPlayers"),
  joinUrl: $("joinUrl"),
  lobbyMeter: $("lobbyMeter"),
  lobbyMeterText: $("lobbyMeterText"),
  lobbyStartBtn: $("lobbyStartBtn"),
  lobbyStartHint: $("lobbyStartHint"),
  lobbyCancelBtn: $("lobbyCancelBtn"),
  lobbySoundBtn: $("lobbySoundBtn"),
  lobbyHowToBtn: $("lobbyHowToBtn"),
  playerLobby: $("playerLobby"),
  plName: $("plName"),
  plRoom: $("plRoom"),
  plMe: $("plMe"),
  plAv: $("plAv"),
  plTitle: $("plTitle"),
  plSub: $("plSub"),
  plFree: $("plFree"),
  plWait: $("plWait"),
  plSoundBtn: $("plSoundBtn"),
  plExitBtn: $("plExitBtn"),
  pickGrid: $("pickGrid"),
  hostBoardArea: $("hostBoardArea"),
  hostBoard: $("hostBoard"),
  waitPanel: $("waitPanel"),
  leaderboardPanel: $("leaderboardPanel"),
  leaderboard: $("leaderboard"),
  feedPanel: $("feedPanel"),
  feed: $("feed"),
  detailTable: $("detailTable"),
  detailTitle: $("detailTitle"),
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
let entryPage = "landing"; // "landing" | "player" | "pin" | "hostMenu" | "library" | "setEditor" | "admin" | null (อยู่ในห้องแล้ว)
const HOST_PAGES = new Set(["hostMenu", "library", "setEditor", "admin"]);
const RESULT_PAGES = new Set(["results", "resultDetail", "setInsights"]);
// ผลการเล่นย้อนหลัง: ฟังเฉพาะ resultsIndex (สรุปสั้น) — ผลเต็มโหลดเมื่อเปิดดูทีละเกม
const results = { list: [], loaded: false, unsub: null, filter: "all", record: null, insights: null, tab: "overview", confirmDelete: false, busy: false };
const savedResultKeys = new Set();
// ชุดคำถามจาก Firebase questionSets/ (ฟังเฉพาะตอนครูอยู่หน้าเมนู/คลัง/แก้ไข/ตั้งค่าห้อง)
const qsets = { list: [], loaded: false, unsub: null, selectedId: null, confirmDeleteId: null, editingId: null, saving: false };
let pinValue = "";
const SAFE_COLOR = /^#[0-9a-f]{3,8}$/i; // สีผู้เล่นมาจาก Firebase → ตรวจก่อนใส่ใน style
let lastPickedEmoji = null;
let hostNext = null; // ฟังก์ชันของปุ่ม "ขั้นถัดไป" ตามขั้นปัจจุบัน
const detail = { open: false, sort: "rank" }; // ตารางละเอียดบนจอครู // ตัวหมากของฉันที่แสดงล่าสุด (เด้งเมื่อเปลี่ยน)
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

// ห้องใหม่ใช้กระดานภูเขา 3 มิติเป็นค่าเริ่มต้น; ครูเปิดเว็บด้วย ?board=2d เพื่อสลับกลับ (เครื่องช้า) — จำไว้ในแท็บนี้แม้ refresh
const BOARD_STYLE = (() => {
  try {
    const q = new URLSearchParams(location.search).get("board");
    if (q === "3d" || q === "2d") sessionStorage.setItem("QL_BOARD_STYLE", q);
    return sessionStorage.getItem("QL_BOARD_STYLE") === "2d" ? "2d" : "3d";
  } catch {
    return "3d";
  }
})();
// กระดาน: 2 มิติเดิม หรือภูเขา 3 มิติ (ห้องที่ตั้ง gameSettings.boardStyle = "3d") — นักเรียนเห็นตามห้องที่ครูสร้าง
// โหลด three.js แบบ lazy เฉพาะเมื่อห้องเป็น 3D; เครื่องที่เปิด WebGL ไม่ได้ใช้ 2 มิติแทนอัตโนมัติ
let board3dModule = null; // null = ยังไม่โหลด, false = โหลดไม่ได้
let board3dLoading = null;
function loadBoard3d() {
  board3dLoading ||= import("./board3d.js")
    .then((m) => (board3dModule = m))
    .catch((e) => {
      console.warn("[board] 3D unavailable, using 2D", e);
      board3dModule = false;
    });
  return board3dLoading;
}
function createSwitchableBoard(root, opts) {
  let inner = createBoardView(root, opts);
  let me = null;
  return {
    get is3d() {
      return !!inner.is3d;
    },
    // สลับชนิดกระดาน (คืน true ถ้าสลับแล้ว)
    setKind(kind) {
      if ((kind === "3d") === !!inner.is3d) return false;
      if (kind === "3d" && !board3dModule) return false;
      inner.reset();
      inner.destroy?.();
      root.innerHTML = "";
      root.classList.remove("board", "board3d", "has-bg");
      inner = (kind === "3d" && board3dModule.createBoard3D(root, { ...opts, bare: true, crop: boardCrop })) || createBoardView(root, opts);
      inner.setMe(me);
      return true;
    },
    update: (...a) => inner.update(...a),
    setBackground: (url) => inner.setBackground(url),
    setMe(pid) {
      me = pid;
      inner.setMe(pid);
    },
    isIdle: () => inner.isIdle(),
    reset: () => inner.reset(),
  };
}
// กระดาน 3 มิติวางบนท้องฟ้าเต็มจอ (body.b3-full): ตัดท้องฟ้าว่างเหนือภูเขา, มือถือนักเรียนตัดต้นไม้ข้างเขาออกให้ช่องใหญ่สุด
const NARROW = typeof matchMedia === "function" ? matchMedia("(max-width: 899px)") : null;
function boardCrop() {
  return isPlayer() && NARROW?.matches ? { sides: 0.1, top: 0.07, bottom: 0.03 } : { top: 0.07, bottom: 0.03 };
}
// ห้องอยากได้กระดานแบบไหน → สลับเฉพาะกระดานของบทบาทนี้ (ครู/นักเรียน ไม่สร้าง 3D สองชุด)
function syncBoardKind(room) {
  const want = room?.gameSettings?.boardStyle === "3d" ? "3d" : "2d";
  const view = activeBoardView();
  if (want === "3d" && board3dModule === null) {
    loadBoard3d().then(() => lastRoom && renderRoom(lastRoom));
    return;
  }
  if (view.setKind(want)) boardBgId = undefined; // กลับมา 2 มิติ → ตั้งรูปพื้นหลังใหม่
}

// จอ Host = ลำโพงหลักของห้อง: เสียงปีน/ร่วงบันได/เข้าเส้นชัยของทุกคน (ไม่เล่นเสียงก้าวเดิน กันเสียงรก)
const hostBoardView = createSwitchableBoard(dom.hostBoard, {
  hooks: {
    onSpecial: (_pid, kind) => throttled(kind, kind === "ladder" ? playLadder : playDrop),
    onFinish: (pid) => celebrateFinish(pid),
  },
});
// มือถือ: เสียงเฉพาะหมากของตัวเอง
const playerBoardView = createSwitchableBoard(dom.playerBoard, {
  floatsOnlyForMe: true,
  hooks: {
    onStep: (pid) => pid === session.playerId && playHop(),
    onSpecial: (pid, kind) => pid === session.playerId && (kind === "ladder" ? playLadder() : playDrop()),
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
  document.body.classList.add("on-entry"); // หน้าจอเกม: ซ่อนแถบหัวเว็บ
  setHidden(dom.entrySection, false);
  setHidden(dom.entryLanding, page !== "landing");
  setHidden(dom.playerEntryPage, page !== "player");
  setHidden(dom.adminPinPage, page !== "pin");
  setHidden(dom.hostMenuPage, page !== "hostMenu");
  setHidden(dom.libraryPage, page !== "library");
  setHidden(dom.setEditorPage, page !== "setEditor");
  setHidden(dom.resultsPage, page !== "results");
  setHidden(dom.resultDetailPage, page !== "resultDetail");
  setHidden(dom.setInsightsPage, page !== "setInsights");
  if (RESULT_PAGES.has(page)) watchResults();
  else unwatchResults();
  if (page === "results") renderResultsPage();
  setHidden(dom.adminEntryPage, page !== "admin");
  if (HOST_PAGES.has(page) || RESULT_PAGES.has(page)) watchQuestionSets();
  else unwatchQuestionSets();
  if (page === "library") {
    qsets.confirmDeleteId = null;
    renderSetLibrary();
  }
  if (page === "admin") renderSetPicker();

  for (const el of [dom.hostNameInput, dom.confirmCreateRoomBtn, dom.roomCodeInput, dom.playerNameInput, dom.joinRoomBtn]) {
    if (el) el.disabled = false;
  }
  if (page === "pin") resetPin();
  if (page === "player") drawRoomCode();
  window.scrollTo(0, 0);
  updateExitButton();
}

function updateExitButton() {
  if (dom.gameExitBtn) {
    dom.gameExitBtn.textContent = isHost() ? "✕ ยกเลิกห้อง" : "🚪";
    dom.gameExitBtn.title = isHost() ? "ยกเลิกห้อง" : "ออกจากห้อง";
    dom.gameExitBtn.setAttribute("aria-label", dom.gameExitBtn.title);
  }
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
  boardBgId = undefined;
  hostBoardView.setBackground(null);
  playerBoardView.setBackground(null);
  setHidden(dom.meChip, true);
  resetJoinQr(dom.joinQr);
  setHidden(dom.soundToggle, true);
  setHidden(dom.hostLobby, true);
  setHidden(dom.playerLobby, true);
  document.body.classList.remove("on-lobby", "b3-full");
  if (dom.lobbyPlayers) dom.lobbyPlayers.dataset.html = "";
  lastPickedEmoji = null;
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
  unwatchQuestionSets();
  unwatchResults();
  document.body.classList.remove("on-entry");
  setHidden(dom.entrySection, true);
  setHidden(dom.roomView, true); // เปิดหลังได้ข้อมูลห้องรอบแรก (กันกระดานกระพริบก่อนเข้าหน้า Lobby)
  setHidden(dom.hostView, role !== ROLE.HOST);
  setHidden(dom.playerView, role !== ROLE.PLAYER);
  setHidden(dom.hostGameControls, role !== ROLE.HOST);
  updateExitButton();
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
// จอคนทอยเอง: ซ่อนผลของตัวเอง (ตำแหน่ง/เข้าเส้นชัย/อันดับ/จบเกม) จนลูกเต๋าบนจอหยุดและปิด แม้ข้อมูลบันทึกไปแล้ว
function renderRoom(rawRoom) {
  lastRoom = rawRoom;
  syncBoardKind(rawRoom);
  syncBoardBackground(rawRoom);
  const ownRolling = isPlayer() && (busy.roll || dice.getState() !== "hidden");
  const masked = maskPendingRolls(rawRoom, serverNow(), DICE_ROLL_MS, isPlayer() ? session.playerId : null, ownRolling ? session.playerId : null);
  const room = masked.room;
  lastView = room;
  clearTimeout(fx.revealTimer);
  if (masked.nextRevealAt) {
    fx.revealTimer = setTimeout(() => lastRoom && renderRoom(lastRoom), Math.max(0, masked.nextRevealAt - serverNow()) + 30);
  }
  const inLobby = room.status === STATUS.LOBBY;
  const ended = isGameEnded(room);
  const { maxRounds } = getSettings(room);

  updateExitButton();
  if (dom.roundInfo) dom.roundInfo.innerHTML = inLobby ? "Lobby" : `<small>รอบ</small>${room.currentRound || 0}/${maxRounds}`;
  if (dom.phaseInfo) dom.phaseInfo.textContent = inLobby ? "รอผู้เล่น" : PHASE_TEXT[room.phase] || PHASE_TEXT[PHASE.IDLE];

  // Lobby เป็นหน้าจอเกมแยก (ซ่อนแถบหัวเว็บ + แถบห้อง); เริ่มเกมแล้วกลับไปหน้ากระดาน
  // ต้องแสดงหน้าก่อนวาด view — ลูกเต๋า 3D วัดตำแหน่งกล่อง #diceDock ตอน render ถ้าหน้ายังซ่อนจะได้ขนาด 0 แล้วลอยไปมุมจอ
  document.body.classList.toggle("on-lobby", inLobby);
  document.body.classList.toggle("on-game", !inLobby);
  document.body.classList.toggle("b3-full", !inLobby && activeBoardView().is3d);
  setHidden(dom.roomView, inLobby);
  setHidden(dom.hostLobby, !(inLobby && isHost()));
  setHidden(dom.playerLobby, !(inLobby && isPlayer()));
  setHidden(dom.endGameArea, !ended);

  if (isHost()) renderHostView(room);
  else renderPlayerView(room);

  updateCountdownAndTimers(room);
  collectMoveEvents(room);
  renderBoards();

  if (ended) {
    saveResultIfEnded(rawRoom);
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

  setHidden(dom.hostBoardArea, inLobby);
  setHidden(dom.leaderboardPanel, inLobby);
  setHidden(dom.feedPanel, inLobby);
  if (inLobby) detail.open = false;
  setHidden(dom.detailTable, !detail.open);
  dom.hostBoardArea?.classList.toggle("detail-open", detail.open);
  if (dom.detailBtn) dom.detailBtn.textContent = detail.open ? "✕ ปิดตาราง" : "📋 ตารางละเอียด";

  renderWaitPanel(dom.waitPanel, room);
  if (inLobby) {
    renderHostLobby(room, players);
  } else {
    renderLeaderboard(dom.leaderboard, room, getViewPlayers(room), { limit: 5 });
    renderFeed(dom.feed, room);
    if (detail.open) renderDetailTable(room);
  }

  updateSoundToggle();
  updateHostQuestionPanel(room); // ก่อน controls เพราะปุ่มสลับใช้สถานะแผงเฉลย
  updateHostControls(room);
}

function renderHostLobby(room, players) {
  const code = session.roomCode || "";
  if (dom.raceCode && dom.raceCode.dataset.code !== code) {
    dom.raceCode.dataset.code = code;
    dom.raceCode.innerHTML = [...code].map((c) => `<span>${escapeHtml(c)}</span>`).join("");
  }
  renderJoinQr(dom.joinQr, code);
  if (dom.joinUrl) dom.joinUrl.textContent = `${location.host}${location.pathname}`.replace(/\/(index\.html)?$/, "");
  const list = Object.values(players);
  const picked = list.filter((p) => p.emoji).length;
  dom.lobbyCount.textContent = String(list.length);
  dom.lobbyMeter.style.width = list.length ? `${(picked / list.length) * 100}%` : "0%";
  dom.lobbyMeterText.textContent =
    list.length && picked === list.length ? "ทุกคนเลือกตัวหมากแล้ว ✓" : `เลือกตัวหมากแล้ว ${picked} จาก ${list.length} คน`;
  dom.lobbyStartBtn.disabled = busy.host || !list.length;
  dom.lobbyStartHint.textContent = !list.length
    ? "รอนักเรียนเข้าห้องอย่างน้อย 1 คน"
    : picked < list.length
      ? "คนที่ยังไม่เลือก ระบบจะสุ่มตัวหมากให้ตอนเริ่ม"
      : "พร้อมแล้ว!";
  renderLobbyBadges(dom.lobbyBadges, room);
  renderLobbyPlayers(dom.lobbyPlayers, players);
}

// ขั้นของรอบ (ตัวบอกสถานะ ไม่ใช่ปุ่ม) + ปุ่ม "ขั้นถัดไป" ปุ่มเดียวที่เปลี่ยนตามขั้น
const STEP_LABELS = ["🎲 ทอยลูกเต๋า", "❓ คำถาม", "✅ เฉลย"];

function hostNextAction(room) {
  const phase = room.phase || PHASE.IDLE;
  const round = room.currentRound || 0;
  const maxRounds = getSettings(room).maxRounds;
  const players = Object.values(room.players || {});
  if (phase === PHASE.ROLLING) {
    // ผู้เล่นที่ยังออนไลน์และยังเล่นอยู่ต้องทอยครบก่อนเริ่มคำถาม (คนที่หลุดจะถูกนับเป็นทอย 0)
    const left = players.filter((p) => !isPlayerDone(p) && p.connected !== false && !p.hasRolled).length;
    return { label: "❓ เริ่มคำถาม", sub: left ? `รอทอยอีก ${left} คน` : "ทอยครบแล้ว", run: hostStartQuestion, enabled: left === 0 };
  }
  if (phase === PHASE.QUESTION_COUNTDOWN) return { label: "❓ กำลังเริ่มคำถาม…", sub: "", run: null, enabled: false };
  if (phase === PHASE.ANSWERING) {
    const active = players.filter((p) => !isPlayerDone(p) && p.connected !== false);
    const answered = active.filter((p) => p.answered).length;
    return { label: "✅ เฉลยคำตอบ", sub: `ตอบแล้ว ${answered}/${active.length}`, run: hostReveal, enabled: true };
  }
  const next = round + 1;
  return { label: `🎲 เริ่มรอบที่ ${next}`, sub: round ? `จาก ${maxRounds} รอบ` : "รอบแรก", run: hostStartRound, enabled: true };
}

function updateHostControls(room) {
  const phase = room.phase || PHASE.IDLE;
  const inLobby = room.status === STATUS.LOBBY;
  const ended = isGameEnded(room);
  const inGame = !inLobby && !ended;
  const showToggle = phase === PHASE.QUESTION_COUNTDOWN || phase === PHASE.ANSWERING || isRevealPhase(room);

  const step = phase === PHASE.ROLLING ? 0 : phase === PHASE.QUESTION_COUNTDOWN || phase === PHASE.ANSWERING ? 1 : phase === PHASE.RESULT ? 2 : -1;
  setHidden(dom.phaseSteps, !inGame);
  if (dom.phaseSteps) {
    dom.phaseSteps.innerHTML = STEP_LABELS.map((t, i) => {
      const [icon, ...words] = t.split(" ");
      const cls = i === step ? "on" : i < step ? "done" : "";
      return `<span class="${cls}">${i < step ? "✓" : icon}<span class="t"> ${words.join(" ")}</span></span>`;
    }).join('<i aria-hidden="true">›</i>');
  }

  const next = inGame ? hostNextAction(room) : null;
  setHidden(dom.hostNextBtn, !next);
  if (next) {
    dom.hostNextBtn.querySelector(".gt-next-label").textContent = next.label;
    dom.hostNextBtn.querySelector(".gt-next-sub").textContent = next.sub;
    dom.hostNextBtn.title = next.sub;
    dom.hostNextBtn.disabled = busy.host || !next.enabled;
    hostNext = next.run;
  }

  setHidden(dom.toggleQuestionOverlayBtn, !showToggle);
  if (dom.toggleQuestionOverlayBtn) {
    dom.toggleQuestionOverlayBtn.disabled = phase === PHASE.QUESTION_COUNTDOWN;
    dom.toggleQuestionOverlayBtn.textContent = isRevealPhase(room)
      ? hq.revealOpen ? "🙈 ซ่อนเฉลย" : "👁 แสดงเฉลย"
      : hq.questionHidden ? "👁 แสดงคำถาม" : "🙈 ซ่อนคำถาม";
  }
}

function renderDetailTable(room) {
  renderPlayerList(dom.playerList, room, getViewPlayers(room), { sort: detail.sort });
  dom.detailTitle && (dom.detailTitle.textContent = `ตารางละเอียด · รอบ ${room.currentRound || 0}/${getSettings(room).maxRounds}`);
  for (const b of dom.detailTable.querySelectorAll("[data-sort]")) b.setAttribute("aria-pressed", String(b.dataset.sort === detail.sort));
}

function toggleDetail(open = !detail.open) {
  detail.open = open;
  if (lastView && isHost()) renderHostView(lastView);
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
  dom.hqSetName.textContent = getRoomQuestionSetName(room);
  dom.hqText.textContent = question.text;
  dom.hqText.classList.toggle("long", question.text.length > 160 && question.text.length <= 320);
  dom.hqText.classList.toggle("very-long", question.text.length > 320);
  setHidden(dom.hqRing, reveal);
  dom.hq.classList.toggle("no-ring", reveal);

  const active = Object.values(room.players || {}).filter((p) => !isPlayerDone(p) && p.connected !== false);
  const records = Object.values(room.history?.[roundKey(round)]?.answers || {});
  // นับเฉพาะคนที่ยังแข่งอยู่ — ข้อฝึกของคนเข้าเส้นชัยแล้วไม่นับในตัวเลข "ตอบแล้ว"
  const answered = reveal ? records.filter((r) => r.answered && !r.practice).length : active.filter((p) => p.answered).length;
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
      return `<div class="hq-choice k-${escapeHtml(k.toLowerCase())}${cls}"><b>${escapeHtml(k)}</b><span>${escapeHtml(v)}</span>${cnt}</div>`;
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

  // ตัวหมาก + ตำแหน่งของตัวเอง อยู่ในแถบเดียวกับ "รอบที่"
  const av = `<span class="me-av${me.emoji ? " glass" : " waiting"}" style="--c:${escapeHtml(color)}">${escapeHtml(me.emoji || "❔")}</span>`;
  // ระหว่างลูกเต๋ากลิ้ง แสดงช่องเดิมไว้ก่อน ไม่ให้รู้ผลล่วงหน้า
  const shownPos = isRollRevealPending(room, me) ? me.startOfRoundPos ?? me.position : me.position;
  setHidden(dom.meChip, false);
  dom.meChip.innerHTML = inLobby
    ? `${av}<span>${escapeHtml(me.name || "")}</span>`
    : `${av}<span>ช่อง <b>${clampPos(shownPos)}</b>${isPlayerDone(me) && !isRollRevealPending(room, me) ? " · 🏁" : ""}</span>`;

  if (inLobby) renderPlayerLobby(room, me);
  else renderGameAction(room, me);

  updateSoundToggle();
  syncDiceOverlay(room, me);
}

// ช่วงทอย: เปิดลูกเต๋า 3D รอให้ผู้เล่นแตะที่ลูกเต๋าเอง (เหมือนเดิม)
function syncDiceOverlay(room, me) {
  const canRoll = room.phase === PHASE.ROLLING && room.status === STATUS.IN_GAME && !me.hasRolled && !isPlayerDone(me);
  // แสดงกล่องก่อน ลูกเต๋าจะได้วัดตำแหน่งกล่องได้ (ซ่อนอยู่ = ขนาด 0 → ลูกเต๋าลอยไปมุมจอ)
  if (canRoll) setHidden(dom.diceDock, false);
  if (!busy.roll) {
    const state = dice.getState();
    if (canRoll && (state === "hidden" || state === "waiting")) dice.setState("waiting"); // waiting ซ้ำ = จัดตำแหน่งตามจุดวางใหม่
    else if (!canRoll && state === "waiting") dice.setState("hidden");
    else if (state !== "hidden" && state !== "done" && room.phase !== PHASE.ROLLING) dice.setState("hidden");
  }
  // เว้นที่วางลูกเต๋าไว้จนลูกเต๋าปิด — การ์ดข้อความจะได้ไม่เลื่อนขึ้นระหว่างลูกเต๋าค้างอยู่กลางกระดาน
  // (ตัดสินหลังอัปเดตสถานะลูกเต๋า ไม่งั้นกล่องว่างค้างอยู่อีกหนึ่งรอบการอัปเดต)
  setHidden(dom.diceDock, !(canRoll || busy.roll || dice.getState() !== "hidden"));
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
  for (const btn of [dom.lobbySoundBtn, dom.plSoundBtn]) {
    if (!btn) continue;
    btn.textContent = isMuted() ? "🔇" : "🔊";
    btn.title = isMuted() ? "เปิดเสียง" : "ปิดเสียง";
    btn.setAttribute("aria-label", btn.title);
    btn.setAttribute("aria-pressed", String(!isMuted()));
  }
}

function setActionMode(mode) {
  if (dom.playerAction.dataset.mode === mode) return false;
  dom.playerAction.dataset.mode = mode;
  dom.playerAction.classList.toggle("picker", mode === "picker");
  return true;
}

function renderPlayerLobby(room, me) {
  const players = room.players || {};
  dom.plName.textContent = me.name || "";
  dom.plRoom.textContent = `ห้อง ${session.roomCode || "-"}`;
  dom.plAv.textContent = me.emoji || "❔";
  dom.plAv.classList.toggle("none", !me.emoji);
  dom.plAv.classList.toggle("glass", !!me.emoji);
  dom.plAv.style.setProperty("--c", SAFE_COLOR.test(me.color || "") ? me.color : "#FFA240");
  dom.plTitle.textContent = me.emoji ? "ตัวหมากของคุณ" : "เลือกตัวหมากของคุณ";
  dom.plSub.textContent = me.emoji ? "แตะตัวอื่นเพื่อเปลี่ยนได้" : "ตัวหมากนี้จะเดินบนกระดานแทนคุณ";
  if (me.emoji && me.emoji !== lastPickedEmoji && lastPickedEmoji !== null) {
    dom.plMe.classList.remove("picked");
    void dom.plMe.offsetWidth; // เล่นแอนิเมชันเด้งใหม่
    dom.plMe.classList.add("picked");
  }
  lastPickedEmoji = me.emoji || "";

  const choices = getRoomEmojiChoices(room);
  const taken = getTakenEmojis(room);
  const free = choices.filter((e) => !taken.has(e) || taken.get(e) === session.playerId).length;
  dom.plFree.textContent = `ว่าง ${free} จาก ${choices.length}`;
  dom.plWait.textContent = `รอครูเริ่มเกม · ในห้องตอนนี้ ${Object.keys(players).length} คน`;
  renderEmojiPicker(dom.pickGrid, {
    choices,
    taken,
    players,
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
  // จอเต็มท้องฟ้า: คำถาม/เฉลย = การ์ดใหญ่ทับกระดาน (คอม: กระดานเลื่อนหลบ), รอทอย = ลูกเต๋าลอยอย่างเดียว
  dom.playerView.classList.toggle("has-q", phase === PHASE.ANSWERING || phase === PHASE.RESULT);
  dom.playerView.classList.toggle("can-roll", phase === PHASE.ROLLING && !me.hasRolled && !busy.roll && !isPlayerDone(me));

  if (phase === PHASE.ENDED) {
    const rank = (room.winners || []).find((w) => w.playerId === session.playerId)?.rank;
    html(`<div class="big">🏁</div><div><b>เกมจบแล้ว</b></div><div class="sub">${
      rank ? `คุณเข้าเส้นชัยเป็นอันดับ ${rank}` : `คุณจบที่ช่อง ${clampPos(me.position)}`
    } · ดูสรุปผลด้านล่าง</div>`);
    return;
  }
  // เข้าเส้นชัยแล้ว: ยังตอบคำถามต่อได้เป็น "ข้อฝึก" (ไม่เดิน ไม่มีผลกับอันดับ) — ระหว่างรอทอยแสดงการ์ดรอข้อต่อไป
  const practice = isPlayerDone(me);
  if (practice && phase !== PHASE.ANSWERING && phase !== PHASE.RESULT) {
    const rank = (room.winners || []).find((w) => w.playerId === session.playerId)?.rank;
    html(`<div class="big">🏁</div><div><b>เข้าเส้นชัยแล้ว${rank ? ` อันดับ ${rank}` : ""}! เก่งมาก ✨</b></div>
      <div class="sub">รอคำถามข้อต่อไปนะ มาตอบเล่นกันต่อ<br>ตอบถูกตอบผิดก็ไม่มีผลกับอันดับแล้ว สบายใจได้เลย 😊</div>`);
    return;
  }

  switch (phase) {
    case PHASE.ROLLING: {
      if (!me.hasRolled || isRollRevealPending(room, me)) {
        html(busy.roll || me.hasRolled
          ? `<div class="big">🎲</div><div><b>ลูกเต๋ากำลังกลิ้ง…</b></div>`
          : `<div><b>แตะที่ลูกเต๋าเพื่อทอย</b></div><div class="sub">ลูกเต๋าจะกลิ้งไปหยุดกลางกระดาน</div>`);
        return;
      }
      const dm = room.history?.[roundKey(round)]?.diceMoves?.[session.playerId];
      const extra =
        dm?.special === "ladder" ? `🟠 ปีนบันไดส้มไปช่อง ${dm.toPosition}!` : isDrop(dm?.special) ? `🟣 ร่วงบันไดม่วงลงไปช่อง ${dm.toPosition}` : "";
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
        html(`${practice ? PRACTICE_BANNER : ""}<div class="q-time" id="qTime"><span>ดูคำถามบนจอหน้าห้องได้ด้วย</span><span>เหลือ <b id="qTimeLeft">-</b> วินาที</span></div>
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
      html(`${resultMessage(rec)}<div class="choices" id="playerChoices"></div><div class="sub">${
        practice ? "ข้อฝึก · ไม่มีผลกับอันดับ รอข้อต่อไปได้เลย" : "ดูบนกระดานว่าหมากเดินไปไหน"
      }</div>`);
      renderChoices($("playerChoices"), question, { selected: rec?.selectedOption ?? null, showResult: true });
      return;
    }
    default:
      html(`<div class="big">⏳</div><div><b>${round === 0 ? "เกมเริ่มแล้ว!" : "จบรอบแล้ว"}</b></div><div class="sub">รอครูเริ่มรอบ${round === 0 ? "แรก" : "ใหม่"}</div>`);
  }
}

const PRACTICE_BANNER = `<div class="practice-banner"><span class="ic" aria-hidden="true">🏆</span><span>
  <b>เข้าเส้นชัยแล้วก็ยังตอบต่อได้นะ!</b>ข้อนี้ไว้ฝึกสมองเฉย ๆ ไม่มีผลกับอันดับแล้ว ไม่ต้องห่วง ลองตอบดูเลย 💪</span></div>`;

function resultMessage(rec) {
  if (!rec) return `<div class="big">⏳</div><div><b>กำลังสรุปผล…</b></div>`;
  if (rec.practice) {
    if (!rec.answered) return `<div class="big">⏰</div><div><b>ข้อนี้ไม่ทันไม่เป็นไรนะ</b></div><div class="sub">ข้อต่อไปลองใหม่ได้เลย 😊</div>`;
    return rec.correct
      ? `<div class="big">🎉</div><div><b>ถูกต้อง! เก่งไม่หยุดเลยนะ</b></div>`
      : `<div class="big">💡</div><div><b>ไม่เป็นไรนะ ข้อนี้ได้รู้เพิ่มแล้ว</b></div>`;
  }
  if (rec.missedAnswer) return `<div class="big">📴</div><div><b>หลุดการเชื่อมต่อ รอบนี้ไม่ขยับ</b></div>`;
  const move = Math.abs(rec.configuredMove || 0);
  let head;
  if (rec.correct) head = `<div class="big">✅</div><div><b>ตอบถูก เดินหน้า ${move} ช่อง</b></div>`;
  else if (rec.answered) head = `<div class="big">❌</div><div><b>ตอบผิด ถอยหลัง ${move} ช่อง</b></div>`;
  else head = `<div class="big">⌛</div><div><b>ไม่ได้ตอบ ถอยหลัง ${move} ช่อง</b></div>`;

  const extra =
    rec.special === "ladder"
      ? `🟠 แล้วปีนบันไดส้มไปช่อง ${rec.finalPosition}!`
      : isDrop(rec.special)
        ? `🟣 แล้วร่วงบันไดม่วงลงไปช่อง ${rec.finalPosition}`
        : isDrop(rec.blocked)
          ? "🛡️ ตอบถูกจึงไม่ร่วงบันไดม่วง"
          : rec.blocked === "ladder"
            ? "ตอบผิดจึงปีนบันไดส้มไม่ได้"
            : "";
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
// ค่าเริ่มต้นของกติกาในหน้าตั้งค่าห้อง
function populateHostSetup() {
  if (dom.maxRoundsInput) dom.maxRoundsInput.value = DEFAULT_SETTINGS.maxRounds;
  if (dom.maxWinnersInput) dom.maxWinnersInput.value = DEFAULT_SETTINGS.maxWinners;
  if (dom.rewardCorrectInput) dom.rewardCorrectInput.value = Math.abs(DEFAULT_SETTINGS.rewardCorrect);
  if (dom.penaltyWrongInput) dom.penaltyWrongInput.value = Math.abs(DEFAULT_SETTINGS.penaltyWrong);
}

/* ---------- ชุดคำถาม (Firebase questionSets/) ---------- */
function watchQuestionSets() {
  if (qsets.unsub) return;
  qsets.unsub = onValue(
    questionSetsRef(),
    (snap) => {
      qsets.list = listQuestionSets(snap.val());
      qsets.loaded = true;
      if (qsets.confirmDeleteId && !qsets.list.some((s) => s.id === qsets.confirmDeleteId)) qsets.confirmDeleteId = null;
      if (entryPage === "library") renderSetLibrary();
      if (entryPage === "admin") renderSetPicker();
    },
    (err) => {
      console.error("[questionSets] load failed:", err);
      alert("โหลดชุดคำถามไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่");
    }
  );
}

function unwatchQuestionSets() {
  qsets.unsub?.();
  qsets.unsub = null;
  qsets.loaded = false;
}

const findSet = (id) => qsets.list.find((s) => s.id === id) || null;

// การ์ดเลือกชุดคำถามในหน้าตั้งค่าห้อง (emoji 3 ตัวแรกของชุด)
function renderSetPicker() {
  const picker = dom.questionSetPicker;
  if (!picker) return;
  if (!qsets.loaded) {
    picker.innerHTML = `<p class="es-muted">กำลังโหลดชุดคำถาม…</p>`;
    return;
  }
  if (!qsets.list.length) {
    picker.innerHTML = `<p class="es-muted">ยังไม่มีชุดคำถาม — กด "จัดการชุดคำถาม" เพื่อสร้าง</p>`;
    return;
  }
  if (!findSet(qsets.selectedId)) qsets.selectedId = (findSet(DEFAULT_SETTINGS.questionSetId) || qsets.list[0]).id;
  picker.innerHTML = qsets.list
    .map(
      (s) => `<button type="button" class="es-set" data-set-id="${escapeHtml(s.id)}" aria-pressed="${s.id === qsets.selectedId}">
        <span class="emo" aria-hidden="true">${escapeHtml(s.emojis.slice(0, 3).join(""))}</span>
        <span class="nm">${escapeHtml(s.name)}</span>
      </button>`
    )
    .join("");
}

function selectQuestionSet(btn) {
  qsets.selectedId = btn.dataset.setId;
  for (const b of dom.questionSetPicker.querySelectorAll(".es-set")) b.setAttribute("aria-pressed", String(b === btn));
}

function renderSetLibrary() {
  renderLibrary(dom.setLibrary, qsets.list, { confirmDeleteId: qsets.confirmDeleteId, loading: !qsets.loaded });
}

// รูปพื้นหลังกระดาน: โหลดครั้งเดียวต่อ id (รูปไม่เคยถูกแก้ทับ เปลี่ยนรูป = id ใหม่)
const boardImageCache = new Map();
function loadBoardImage(id) {
  if (!boardImageCache.has(id)) {
    const p = get(boardImageRef(id)).then((snap) => {
      const url = snap.val()?.dataUrl;
      if (!url) throw new Error("ไม่พบรูปพื้นหลัง");
      return url;
    });
    p.catch(() => boardImageCache.delete(id)); // โหลดพลาด → ลองใหม่ครั้งหน้า
    boardImageCache.set(id, p);
  }
  return boardImageCache.get(id);
}

let boardBgId; // รูปที่กระดานแสดงอยู่ (undefined = ยังไม่ได้ตั้ง)
function syncBoardBackground(room) {
  const id = room?.questionSet?.boardImageId || null;
  if (id === boardBgId) return;
  boardBgId = id;
  const apply = (url) => {
    hostBoardView.setBackground(url);
    playerBoardView.setBackground(url);
  };
  if (!id) return apply(null);
  loadBoardImage(id)
    .then((url) => boardBgId === id && apply(url))
    .catch((e) => console.warn("[board] background failed:", e));
}

const setEditor = createSetEditor({
  name: $("setNameInput"),
  count: $("setEmojiCount"),
  tray: $("setEmojiTray"),
  themes: $("setEmojiThemes"),
  tabs: $("setEmojiTabs"),
  shop: $("setEmojiShop"),
  questions: $("setQuestionList"),
  addQuestion: $("addQuestionBtn"),
  error: $("setEditorError"),
  bgPreview: $("setBgPreview"),
  bgInput: $("setBgInput"),
  bgRemove: $("setBgRemove"),
  bgNote: $("setBgNote"),
}, { loadImage: loadBoardImage });

function openSetEditor(id) {
  const existing = id ? findSet(id) : null;
  qsets.editingId = existing ? id : null;
  dom.setEditorTitle.textContent = existing ? "แก้ชุดคำถาม" : "สร้างชุดคำถามใหม่";
  setEditor.open(existing ? toDraft(existing) : newDraft());
  showEntryPage("setEditor");
}

async function saveQuestionSet() {
  if (qsets.saving) return;
  const draft = setEditor.getDraft();
  const error = validateDraft(draft);
  if (error) return setEditor.showError(error);

  qsets.saving = true;
  dom.saveSetBtn.disabled = true;
  try {
    const now = serverNow();
    const existing = qsets.editingId ? findSet(qsets.editingId) : null;
    // รูปใหม่: อัปโหลดเป็นรายการใหม่ใน boardImages แล้วอ้างอิง id (รูปเก่าคงไว้ ห้องที่ใช้อยู่ไม่พัง)
    if (draft.pendingImage) {
      const imgRef = await push(boardImagesRef(), { dataUrl: draft.pendingImage, width: 1200, height: 1000, createdAt: now });
      boardImageCache.set(imgRef.key, Promise.resolve(draft.pendingImage));
      draft.boardImageId = imgRef.key;
      draft.pendingImage = null;
    }
    const data = fromDraft(draft, now, existing?.createdAt || now);
    if (existing) await set(questionSetRef(existing.id), data);
    else await push(questionSetsRef(), data);
    showEntryPage("library");
  } catch (e) {
    console.error("[questionSets] save failed:", e);
    setEditor.showError("บันทึกไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่");
  } finally {
    qsets.saving = false;
    dom.saveSetBtn.disabled = false;
  }
}

async function onLibraryClick(e) {
  const b = e.target.closest("button");
  if (!b) return;
  const d = b.dataset;
  try {
    if (d.setNew != null) return openSetEditor(null);
    if (d.setOpen) return openSetEditor(d.setOpen);
    if (d.setCopy) {
      const src = findSet(d.setCopy);
      if (src) await push(questionSetsRef(), copySet(src, serverNow()));
      return;
    }
    if (d.setDelete) {
      // กดครั้งแรก = ถาม, ครั้งที่สอง = ลบจริง
      if (qsets.confirmDeleteId !== d.setDelete) {
        qsets.confirmDeleteId = d.setDelete;
        return renderSetLibrary();
      }
      qsets.confirmDeleteId = null;
      if (qsets.selectedId === d.setDelete) qsets.selectedId = null;
      await remove(questionSetRef(d.setDelete));
    }
  } catch (err) {
    console.error("[questionSets] action failed:", err);
    alert("ทำรายการไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่");
  }
}

// ปุ่ม − / + ข้างช่องตัวเลข (ยังพิมพ์ตัวเลขเองได้)
function stepRuleInput(btn) {
  const input = btn.closest(".es-stepper")?.querySelector("input");
  if (!input) return;
  const min = Number(input.min) || 1;
  const max = Number(input.max) || 99;
  const next = parseIntOr(input.value, min) + Number(btn.dataset.step);
  input.value = Math.min(max, Math.max(min, next));
}

function readGameSettings(questionSetId) {
  return {
    questionSetId,
    maxRounds: Math.max(1, parseIntOr(dom.maxRoundsInput?.value, DEFAULT_SETTINGS.maxRounds)),
    maxWinners: Math.max(1, parseIntOr(dom.maxWinnersInput?.value, DEFAULT_SETTINGS.maxWinners)),
    rewardCorrect: Math.abs(parseIntOr(dom.rewardCorrectInput?.value, DEFAULT_SETTINGS.rewardCorrect)),
    penaltyWrong: -Math.abs(parseIntOr(dom.penaltyWrongInput?.value, DEFAULT_SETTINGS.penaltyWrong)),
    boardStyle: BOARD_STYLE,
  };
}

async function hostCreateRoom() {
  if (busy.create) return;
  const hostName = normalizeName(dom.hostNameInput?.value);
  if (!hostName) {
    alert("กรุณากรอกชื่อของ Host ก่อน");
    return;
  }

  const chosenSet = findSet(qsets.selectedId);
  if (!chosenSet?.questions.length) {
    alert("เลือกชุดคำถามที่มีคำถามอย่างน้อย 1 ข้อก่อน");
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
    gameSettings: readGameSettings(chosenSet.id),
    // สำเนาคำถาม + ตัวหมาก ณ ตอนสร้างห้อง: ครูแก้/ลบชุดระหว่างเกม เกมนี้ไม่เพี้ยน
    questionSet: roomQuestionSnapshot(chosenSet.id, chosenSet),
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

    enterRoom(code, ROLE.HOST); // รหัสห้องแสดงตัวใหญ่ในหน้า Lobby
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

/* ---------- ผลการเล่นย้อนหลัง ---------- */

// Host บันทึกผลเมื่อเกมจบ (ครั้งเดียวต่อห้อง) — transaction เขียนเฉพาะเมื่อยังไม่มี กันหลายแท็บเขียนทับกัน
async function saveResultIfEnded(room) {
  if (!isHost() || !isGameEnded(room) || !session.roomCode) return;
  const key = resultKey(room, session.roomCode);
  if (savedResultKeys.has(key)) return;
  savedResultKeys.add(key);
  try {
    const record = buildResultRecord(room, session.roomCode, serverNow());
    await runTransaction(resultRef(key), (cur) => cur || record);
    await set(resultIndexRef(key), buildResultIndex(record));
  } catch (e) {
    savedResultKeys.delete(key); // ลองใหม่ตอนห้องอัปเดตครั้งถัดไป
    console.error("[results] save failed:", e);
  }
}

function watchResults() {
  if (results.unsub) return;
  results.unsub = onValue(
    resultsIndexRef(),
    (snap) => {
      results.list = listResults(snap.val());
      results.loaded = true;
      if (entryPage === "results") renderResultsPage();
    },
    (err) => {
      console.error("[results] load failed:", err);
      alert("โหลดผลการเล่นไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่");
    }
  );
}

function unwatchResults() {
  results.unsub?.();
  results.unsub = null;
  results.loaded = false;
}

function renderResultsPage() {
  if (results.filter !== "all" && !results.list.some((r) => setKey(r) === results.filter)) results.filter = "all";
  renderResultsList(dom.resultsList, results.list, { filter: results.filter, loading: !results.loaded });
}

function renderResultDetailPage() {
  if (!results.record) return;
  renderResultDetail(dom.resultDetail, results.record, results.insights, { tab: results.tab, confirmDelete: results.confirmDelete });
}

async function loadResult(key) {
  const snap = await get(resultRef(key));
  if (!snap.exists()) throw new Error("ไม่พบผลการเล่นนี้ (อาจถูกลบไปแล้ว)");
  return { key, ...snap.val() };
}

async function openResult(key) {
  if (results.busy) return;
  results.busy = true;
  try {
    results.record = await loadResult(key);
    results.insights = computeGameInsights(results.record);
    results.tab = "overview";
    results.confirmDelete = false;
    showEntryPage("resultDetail");
    renderResultDetailPage();
  } catch (e) {
    console.error("[results] open failed:", e);
    alert(e.message || "เปิดผลการเล่นไม่สำเร็จ");
  } finally {
    results.busy = false;
  }
}

async function openSetInsights(filterKey) {
  if (results.busy) return;
  const items = results.list.filter((r) => setKey(r) === filterKey);
  if (!items.length) return;
  const name = items[0].setName || "-";
  results.busy = true;
  showEntryPage("setInsights");
  renderSetInsights(dom.setInsights, name, null, { loading: true });
  try {
    const records = (await Promise.all(items.map((r) => loadResult(r.key).catch(() => null)))).filter(Boolean);
    renderSetInsights(dom.setInsights, name, computeSetInsights(records));
  } catch (e) {
    console.error("[results] set insights failed:", e);
    alert("รวมผลไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่");
  } finally {
    results.busy = false;
  }
}

async function onResultsClick(e) {
  const b = e.target.closest("button");
  if (!b) return;
  const d = b.dataset;
  if (d.rsFilter) {
    results.filter = d.rsFilter;
    return renderResultsPage();
  }
  if (d.rsOpen) return openResult(d.rsOpen);
  if (d.rsSet) return openSetInsights(d.rsSet);
}

async function onResultDetailClick(e) {
  const b = e.target.closest("button");
  if (!b || !results.record) return;
  const d = b.dataset;
  if (d.rsExpand != null) {
    // คำถามยาว (เช่น ชุด Food Quest) ย่อไว้ 4 บรรทัด แตะเพื่อดูเต็ม
    b.setAttribute("aria-expanded", String(b.getAttribute("aria-expanded") !== "true"));
    return;
  }
  if (d.rsTab) {
    results.tab = d.rsTab;
    return renderResultDetailPage();
  }
  if (d.rsExport != null) {
    try {
      await exportRoomToXlsx(results.record, results.record.roomCode);
    } catch (err) {
      console.error(err);
      alert("Export ไม่สำเร็จ (ดู Console)");
    }
    return;
  }
  if (d.rsDelete != null) {
    // กดครั้งแรก = ถาม, ครั้งที่สอง = ลบจริง
    if (!results.confirmDelete) {
      results.confirmDelete = true;
      return renderResultDetailPage();
    }
    try {
      const key = results.record.key;
      await Promise.all([remove(resultRef(key)), remove(resultIndexRef(key))]);
      results.record = null;
      showEntryPage("results");
    } catch (err) {
      console.error("[results] delete failed:", err);
      alert("ลบไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่");
    }
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
    alert("กรุณากรอกทั้งรหัสห้องและชื่อผู้เล่น");
    return;
  }
  dom.playerNameInput.value = name;

  busy.join = true;
  dom.joinRoomBtn.disabled = true;
  try {
    const snap = await get(roomRef(code));
    if (!snap.exists()) {
      alert("ไม่พบห้องนี้ กรุณาตรวจสอบรหัสห้อง");
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
   รหัสห้อง (กล่อง 6 ช่อง) + PIN ครู
========================= */
function drawRoomCode() {
  const input = dom.roomCodeInput;
  if (!input || !dom.roomCodeBoxes) return;
  input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  const focused = document.activeElement === input;
  [...dom.roomCodeBoxes.children].forEach((box, i) => {
    box.textContent = input.value[i] || "";
    box.classList.toggle("active", focused && i === Math.min(input.value.length, 5));
  });
}

function drawPin() {
  [...dom.pinDots.children].forEach((dot, i) => dot.classList.toggle("on", i < pinValue.length));
  dom.pinDots.setAttribute("aria-label", `ใส่แล้ว ${pinValue.length} จาก 4 หลัก`);
}

function resetPin() {
  pinValue = "";
  drawPin();
}

function pressPin(key) {
  if (key === "del") pinValue = pinValue.slice(0, -1);
  else if (/^\d$/.test(key) && pinValue.length < 4) pinValue += key;
  drawPin();
  if (pinValue.length < 4) return;

  // ค้างให้เห็นจุดครบ 4 แป๊บหนึ่งก่อนเปลี่ยนหน้า/สั่น
  const entered = pinValue;
  setTimeout(() => {
    if (entryPage !== "pin") return;
    if (entered === ADMIN_PIN) return showEntryPage("hostMenu");
    dom.pinDots.classList.remove("shake");
    void dom.pinDots.offsetWidth; // เริ่มแอนิเมชันสั่นใหม่
    dom.pinDots.classList.add("shake");
    resetPin();
  }, 180);
}

/* =========================
   Event bindings
========================= */
function bindUIEvents() {
  const on = (el, type, fn) => el?.addEventListener(type, fn);


  // หน้าจอเกมก่อนเข้าห้อง: ปุ่มเปลี่ยนหน้า, PIN, การ์ดชุดคำถาม, ปุ่ม − / +
  on(dom.entrySection, "click", (e) => {
    const nav = e.target.closest("[data-entry]");
    if (nav) return showEntryPage(nav.dataset.entry);
    const key = e.target.closest("[data-key]");
    if (key) return pressPin(key.dataset.key);
    const set = e.target.closest(".es-set");
    if (set) return selectQuestionSet(set);
    const step = e.target.closest("[data-step]");
    if (step) stepRuleInput(step);
  });
  document.addEventListener("keydown", (e) => {
    if (entryPage !== "pin") return;
    if (/^\d$/.test(e.key)) pressPin(e.key);
    else if (e.key === "Backspace") pressPin("del");
    else if (e.key === "Escape") showEntryPage("landing");
  });
  for (const ev of ["input", "focus", "blur"]) on(dom.roomCodeInput, ev, drawRoomCode);
  on(dom.roomCodeInput, "keydown", (e) => e.key === "Enter" && dom.playerNameInput?.focus());

  on(dom.setLibrary, "click", onLibraryClick);
  on(dom.resultsList, "click", onResultsClick);
  on(dom.resultDetail, "click", onResultDetailClick);
  on(dom.saveSetBtn, "click", saveQuestionSet);

  // host
  on(dom.confirmCreateRoomBtn, "click", hostCreateRoom);
  on(dom.lobbyStartBtn, "click", hostStartGame);
  on(dom.lobbyCancelBtn, "click", hostCancelRoom);
  // คลิปวิธีเล่นฉายจากจอครู (ปิดเสียงเกมไว้ = คลิปปิดเสียงด้วย)
  on(dom.lobbyHowToBtn, "click", () => openIntroClip({ muted: isMuted(), onClose: () => dom.lobbyHowToBtn.focus() }));
  on(dom.plExitBtn, "click", playerLeave);
  on(dom.hostNextBtn, "click", () => hostNext?.());
  on(dom.toggleQuestionOverlayBtn, "click", hostToggleQuestionPanel);
  on(dom.detailBtn, "click", () => toggleDetail());
  on(dom.detailCloseBtn, "click", () => toggleDetail(false));
  on(dom.detailTable, "click", (e) => {
    const b = e.target.closest("[data-sort]");
    if (!b) return;
    detail.sort = b.dataset.sort;
    if (lastView) renderDetailTable(lastView);
  });
  on(dom.gameExitBtn, "click", () => (isHost() ? hostCancelRoom() : playerLeave()));

  // player
  on(dom.joinRoomBtn, "click", playerJoin);
  // เบราว์เซอร์อนุญาตเสียงหลังผู้ใช้แตะครั้งแรก — Host ปลดล็อกตอนกดปุ่มใดก็ได้
  document.addEventListener("pointerdown", () => !isMuted() && unlockAudio(), { passive: true });
  on(dom.rollDiceBtn, "click", playerRollDice); // แตะที่ลูกเต๋า 3D
  on(dom.diceDock, "click", () => dice.getState() === "waiting" && playerRollDice()); // แตะตรงไหนในกล่องลูกเต๋าก็ได้
  const toggleSound = () => {
    setMuted(!isMuted());
    if (!isMuted()) unlockAudio();
    updateSoundToggle();
  };
  for (const btn of [dom.soundToggle, dom.lobbySoundBtn, dom.plSoundBtn]) on(btn, "click", toggleSound);
  on(dom.playerLobby, "click", (e) => {
    const tile = e.target.closest(".pick-tile");
    if (tile && !tile.disabled) return playerClaimEmoji(tile.dataset.emoji);
    if (e.target.closest('[data-action="random-emoji"]')) playerRandomEmoji();
  });
  on(dom.playerAction, "click", (e) => {
    const choice = e.target.closest("button[data-key]");
    if (choice && !choice.disabled) playerSubmitAnswer(choice.dataset.key);
  });

  // Enter เพื่อส่งฟอร์ม
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
  populateHostSetup();
  const roomFromLink = readRoomFromUrl(); // สแกน QR code มา: ?room=XXXXXX
  if (await restoreSession()) {
    clearRoomFromUrl();
    return;
  }
  if (roomFromLink) {
    showEntryPage("player");
    dom.roomCodeInput.value = roomFromLink;
    drawRoomCode();
    dom.playerNameInput.focus();
    clearRoomFromUrl();
  } else {
    showEntryPage("landing");
  }
}

window.addEventListener("unhandledrejection", (e) => console.error("[UNHANDLED PROMISE]", e.reason));

boot();
