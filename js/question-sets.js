// question-sets.js
// ชุดคำถามที่ครูสร้าง/แก้จากหน้าเว็บ (เก็บใน Firebase: questionSets/{id}) — pure functions ล้วน ไม่แตะ DOM/Firebase
//
// รูปแบบที่เก็บ (เหมือนคำถามใน questions.js เดิม เพื่อให้ game-logic ใช้ได้ทันที):
//   { name, emojis: [30 ตัว], questions: [{ text, choices: {A,B,C?,D?}, correctOption, timeLimit }], boardImageId, createdAt, updatedAt }
// boardImageId = รูปพื้นหลังกระดานใน boardImages/{id} (ไม่มี = กระดานปกติ) — รูปแยกเก็บ ไม่ฝังในชุดคำถามเพราะใหญ่
// ร่างในหน้าแก้ไข (draft) ใช้ array ให้แก้ง่าย: choices = ["..", ".."], correct = index

import { QUESTION_SETS, QUESTION_SET_NAMES, getQuestionSetTheme } from "../questions.js";
import { getThemeEmojis } from "./emoji-themes.js";

export const SET_EMOJI_COUNT = 30;
export const CHOICE_KEYS = ["A", "B", "C", "D"];
export const MIN_CHOICES = 2;
export const TIME_OPTIONS = [15, 30, 60, 120];
export const DEFAULT_TIME_LIMIT = 30;
export const SET_NAME_MAX = 40;

// Firebase เก็บ array เป็น object ได้ถ้ามีช่องว่าง → แปลงกลับเป็น array เสมอ
const toArray = (v) => (Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : []).filter((x) => x != null);

export function normalizeQuestion(q) {
  const choices = {};
  for (const k of CHOICE_KEYS) {
    const c = q?.choices?.[k];
    if (c != null && String(c).trim() !== "") choices[k] = String(c);
  }
  const keys = Object.keys(choices);
  return {
    text: String(q?.text ?? ""),
    choices,
    correctOption: keys.includes(q?.correctOption) ? q.correctOption : keys[0] || "A",
    timeLimit: Number(q?.timeLimit) > 0 ? Number(q.timeLimit) : DEFAULT_TIME_LIMIT,
  };
}

export function normalizeSet(raw) {
  return {
    name: String(raw?.name ?? "").trim() || "ชุดคำถามไม่มีชื่อ",
    emojis: toArray(raw?.emojis).map(String),
    questions: toArray(raw?.questions).map(normalizeQuestion),
    boardImageId: raw?.boardImageId ? String(raw.boardImageId) : null,
    createdAt: Number(raw?.createdAt) || 0,
    updatedAt: Number(raw?.updatedAt) || 0,
  };
}

// snapshot ของ questionSets/ → รายการเรียงตามที่แก้ล่าสุดก่อน
export function listQuestionSets(raw) {
  return Object.entries(raw || {})
    .map(([id, s]) => ({ id, ...normalizeSet(s) }))
    .sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name, "th"));
}

export function emptyQuestion() {
  return { text: "", choices: ["", "", "", ""], correct: 0, timeLimit: DEFAULT_TIME_LIMIT };
}

export function newDraft() {
  return { name: "", emojis: [...getThemeEmojis("animals")], questions: [emptyQuestion()], boardImageId: null };
}

export function toDraft(set) {
  const s = normalizeSet(set);
  return {
    name: s.name,
    emojis: [...s.emojis],
    questions: s.questions.map((q) => {
      const keys = Object.keys(q.choices);
      return {
        text: q.text,
        choices: keys.map((k) => q.choices[k]),
        correct: Math.max(0, keys.indexOf(q.correctOption)),
        timeLimit: q.timeLimit,
      };
    }),
    boardImageId: s.boardImageId,
  };
}

// คืนข้อความบอกสิ่งที่ต้องแก้ก่อนบันทึก หรือ "" ถ้าบันทึกได้
export function validateDraft(draft) {
  if (!String(draft?.name ?? "").trim()) return "ตั้งชื่อชุดคำถามก่อน";
  const emojis = draft.emojis || [];
  if (new Set(emojis).size !== emojis.length) return "มีตัวหมาก emoji ซ้ำกัน";
  if (emojis.length !== SET_EMOJI_COUNT) return `เลือกตัวหมากให้ครบ ${SET_EMOJI_COUNT} ตัว (ตอนนี้ ${emojis.length} ตัว)`;
  const qs = draft.questions || [];
  if (!qs.length) return "เพิ่มคำถามอย่างน้อย 1 ข้อ";
  for (let i = 0; i < qs.length; i++) {
    const q = qs[i];
    const no = `ข้อ ${i + 1}`;
    if (!String(q.text ?? "").trim()) return `${no}: ยังไม่ได้ใส่คำถาม`;
    if ((q.choices || []).length < MIN_CHOICES) return `${no}: ต้องมีตัวเลือกอย่างน้อย ${MIN_CHOICES} ข้อ`;
    if (q.choices.some((c) => !String(c ?? "").trim())) return `${no}: มีตัวเลือกที่ว่างอยู่ (ใส่ข้อความหรือลบช่องนั้น)`;
    if (!(q.correct >= 0 && q.correct < q.choices.length)) return `${no}: ยังไม่ได้เลือกข้อที่ถูก`;
  }
  return "";
}

export function fromDraft(draft, now, createdAt = now) {
  return {
    name: String(draft.name).trim().slice(0, SET_NAME_MAX),
    emojis: [...draft.emojis],
    questions: draft.questions.map((q) => {
      const choices = {};
      q.choices.forEach((c, i) => (choices[CHOICE_KEYS[i]] = String(c).trim()));
      return {
        text: String(q.text).trim(),
        choices,
        correctOption: CHOICE_KEYS[q.correct],
        timeLimit: TIME_OPTIONS.includes(q.timeLimit) ? q.timeLimit : DEFAULT_TIME_LIMIT,
      };
    }),
    boardImageId: draft.boardImageId || null,
    createdAt,
    updatedAt: now,
  };
}

export function copySet(set, now) {
  const s = normalizeSet(set);
  return { ...s, name: `${s.name} (สำเนา)`.slice(0, SET_NAME_MAX), createdAt: now, updatedAt: now };
}

// สิ่งที่ห้องเก็บไว้ตอนสร้าง: ครูแก้/ลบชุดระหว่างเกม เกมที่เล่นอยู่ไม่เพี้ยน
export function roomQuestionSnapshot(id, set) {
  const s = normalizeSet(set);
  return { id, name: s.name, emojis: s.emojis, questions: s.questions, boardImageId: s.boardImageId };
}

// ชุดคำถามเดิมใน questions.js → รูปแบบที่เก็บใน Firebase (ใช้ย้ายข้อมูลครั้งแรก)
export function builtInQuestionSets(now) {
  const out = {};
  Object.keys(QUESTION_SETS).forEach((id, i) => {
    out[id] = {
      name: QUESTION_SET_NAMES[id] || id,
      emojis: [...getThemeEmojis(getQuestionSetTheme(id))],
      questions: QUESTION_SETS[id].map(normalizeQuestion),
      createdAt: now - i, // ให้ลำดับในคลังเหมือนเดิม
      updatedAt: now - i,
    };
  });
  return out;
}
