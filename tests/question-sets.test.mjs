import test from "node:test";
import assert from "node:assert/strict";

import {
  builtInQuestionSets,
  copySet,
  fromDraft,
  listQuestionSets,
  newDraft,
  roomQuestionSnapshot,
  toDraft,
  validateDraft,
} from "../js/question-sets.js";
import { EMOJI_CATALOG, getThemeEmojis } from "../js/emoji-themes.js";
import { applyClaimEmoji, applyStartGame, getRoomEmojiChoices } from "../js/game-logic.js";
import { QUESTION_SETS, getQuestionFromRoom, getQuestionSetLengthForRoom, getRoomQuestionSetName } from "../questions.js";

const validDraft = () => ({
  name: "บทที่ 3",
  emojis: [...getThemeEmojis("food")],
  questions: [
    { text: "ข้อแรก?", choices: ["ก", "ข", "ค"], correct: 2, timeLimit: 60 },
    { text: "ข้อสอง?", choices: ["ใช่", "ไม่ใช่"], correct: 0, timeLimit: 15 },
  ],
});

test("valid draft passes; each problem gets a specific message", () => {
  assert.equal(validateDraft(validDraft()), "");
  const cases = [
    [(d) => (d.name = "  "), /ชื่อ/],
    [(d) => d.emojis.pop(), /ครบ 30 ตัว \(ตอนนี้ 29 ตัว\)/],
    [(d) => (d.emojis[1] = d.emojis[0]), /ซ้ำ/],
    [(d) => (d.questions = []), /อย่างน้อย 1 ข้อ/],
    [(d) => (d.questions[1].text = ""), /ข้อ 2: ยังไม่ได้ใส่คำถาม/],
    [(d) => (d.questions[0].choices = ["ก"]), /ข้อ 1: ต้องมีตัวเลือกอย่างน้อย 2/],
    [(d) => (d.questions[0].choices[1] = " "), /ข้อ 1: มีตัวเลือกที่ว่าง/],
    [(d) => (d.questions[0].correct = 3), /ข้อ 1: ยังไม่ได้เลือกข้อที่ถูก/],
  ];
  for (const [mutate, msg] of cases) {
    const d = validDraft();
    mutate(d);
    assert.match(validateDraft(d), msg);
  }
});

test("draft → stored format matches questions.js format and round-trips", () => {
  const stored = fromDraft(validDraft(), 1000, 500);
  assert.deepEqual(stored.questions[0], { text: "ข้อแรก?", choices: { A: "ก", B: "ข", C: "ค" }, correctOption: "C", timeLimit: 60 });
  assert.equal(stored.createdAt, 500);
  assert.equal(stored.updatedAt, 1000);
  assert.deepEqual(toDraft(stored), validDraft());
});

test("new draft starts valid except for the empty question", () => {
  assert.equal(newDraft().emojis.length, 30);
  assert.match(validateDraft({ ...newDraft(), name: "x" }), /ข้อ 1: ยังไม่ได้ใส่คำถาม/);
});

test("Firebase object-shaped arrays are normalized; list sorted newest first", () => {
  const raw = {
    old: { name: "เก่า", updatedAt: 1, emojis: { 0: "🐶", 1: "🐱" }, questions: { 0: { text: "q", choices: { A: "1", B: "2" }, correctOption: "B", timeLimit: 30 } } },
    neu: { name: "ใหม่", updatedAt: 9, emojis: [], questions: [] },
  };
  const list = listQuestionSets(raw);
  assert.deepEqual(list.map((s) => s.id), ["neu", "old"]);
  assert.deepEqual(list[1].emojis, ["🐶", "🐱"]);
  assert.equal(list[1].questions[0].correctOption, "B");
});

test("copy gets a new name and timestamps", () => {
  const c = copySet(fromDraft(validDraft(), 10), 99);
  assert.equal(c.name, "บทที่ 3 (สำเนา)");
  assert.equal(c.createdAt, 99);
  assert.equal(c.questions.length, 2);
});

test("built-in sets convert with their theme emojis and all questions", () => {
  const sets = builtInQuestionSets(1000);
  assert.deepEqual(Object.keys(sets), Object.keys(QUESTION_SETS));
  for (const [id, s] of Object.entries(sets)) {
    assert.equal(s.emojis.length, 30, id);
    assert.equal(s.questions.length, QUESTION_SETS[id].length, id);
    assert.equal(validateDraft(toDraft(s)), "", id);
  }
  assert.ok(sets.general.updatedAt > sets.food5.updatedAt); // ลำดับเดิมในคลัง
});

test("emoji catalog has no duplicates within a category", () => {
  for (const [cat, list] of Object.entries(EMOJI_CATALOG)) assert.equal(new Set(list).size, list.length, cat);
});

test("room uses its own question snapshot and emojis", () => {
  const stored = fromDraft({ ...validDraft(), emojis: [...EMOJI_CATALOG["🚗 ยานพาหนะ"].slice(0, 30)] }, 1);
  const room = {
    status: "lobby",
    gameSettings: { questionSetId: "-abc" },
    questionSet: roomQuestionSnapshot("-abc", stored),
    players: { p0: { name: "a" } },
  };
  assert.equal(getRoomQuestionSetName(room), "บทที่ 3");
  assert.equal(getQuestionSetLengthForRoom(room), 2);
  assert.equal(getQuestionFromRoom(room, 3).text, "ข้อสอง?");
  assert.deepEqual(getRoomEmojiChoices(room), stored.emojis);

  const r = structuredClone(room);
  applyClaimEmoji(r, "p0", stored.emojis[4]);
  assert.equal(r.players.p0.emoji, stored.emojis[4]);
  assert.equal(applyClaimEmoji(structuredClone(room), "p0", "🦊"), undefined); // ไม่ใช่ตัวหมากของชุดนี้

  const started = applyStartGame(structuredClone(room), 1, () => 0);
  assert.ok(stored.emojis.includes(started.players.p0.emoji));
});

test("old rooms without a snapshot still use questions.js", () => {
  const room = { gameSettings: { questionSetId: "love", emojiTheme: "love" } };
  assert.equal(getQuestionFromRoom(room, 0).text, QUESTION_SETS.love[0].text);
  assert.deepEqual(getRoomEmojiChoices({ ...room, players: {} }), getThemeEmojis("love"));
});
