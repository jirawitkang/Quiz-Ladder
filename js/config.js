// config.js
// ค่าคงที่ของเกมและการตั้งค่า Firebase (ไม่มี side effect — import ได้ทั้งใน browser และ node)

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBUHaaYaSzluNnlI4pSmRk-oUomgydiq2I",
  authDomain: "quizrunner.firebaseapp.com",
  databaseURL: "https://quizrunner-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "quizrunner",
  storageBucket: "quizrunner.firebasestorage.app",
  messagingSenderId: "302500543999",
  appId: "1:302500543999:web:773c1cd297246f73c87bca",
  measurementId: "G-QWX3CDCRBE",
};

// NOTE: ตรวจที่ฝั่ง client เท่านั้น — กันได้แค่ผู้ใช้ทั่วไป ไม่ใช่ระบบความปลอดภัยจริง
export const ADMIN_PIN = "8888";

export const DEBUG = false;

export const BOARD_SIZE = 30;
export const MAX_NAME_LEN = 12;
export const QUESTION_COUNTDOWN_SECONDS = 3;
export const DICE_ROLL_MS = 5000;

// เผื่อ latency ของเครือข่าย: คำตอบที่ส่งหลังหมดเวลาไม่เกินค่านี้ยังนับ
export const ANSWER_GRACE_MS = 1500;
// ถ้า Host ไม่ย้าย phase countdown → answering ภายในเวลานี้ ผู้เล่นจะทำแทน
export const COUNTDOWN_FALLBACK_MS = 3000;

export const STORAGE_KEY = "SQ_SESSION_V1";

export const STATUS = Object.freeze({
  LOBBY: "lobby",
  IN_GAME: "inGame",
  FINISHED: "finished",
});

export const PHASE = Object.freeze({
  IDLE: "idle",
  ROLLING: "rolling",
  QUESTION_COUNTDOWN: "questionCountdown",
  ANSWERING: "answering",
  RESULT: "result",
  ENDED: "ended",
});

export const ROLE = Object.freeze({
  HOST: "host",
  PLAYER: "player",
});

export const DEFAULT_SETTINGS = Object.freeze({
  questionSetId: "general",
  maxRounds: 10,
  maxWinners: 5,
  rewardCorrect: 2,
  penaltyWrong: -2,
});

export const PLAYER_COLORS = [
  "#e53935", "#d81b60", "#8e24aa", "#5e35b1", "#3949ab",
  "#1e88e5", "#039be5", "#00acc1", "#00897b", "#43a047",
  "#7cb342", "#c0ca33", "#fdd835", "#ffb300", "#fb8c00",
  "#f4511e", "#6d4c41", "#757575", "#546e7a", "#c62828",
  "#ad1457", "#6a1b9a", "#4527a0", "#283593", "#1565c0",
  "#0277bd", "#006064", "#004d40", "#2e7d32", "#827717",
];
