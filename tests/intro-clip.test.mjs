import test from "node:test";
import assert from "node:assert/strict";
import { CLIP_TIMELINE, tokenPoint } from "../js/intro-clip.js";

const { CUES, SCENES, TOKENS, STEP, DURATION } = CLIP_TIMELINE;

test("ฉากเรียงตามเวลาและอยู่ในความยาวคลิป", () => {
  for (let i = 1; i < SCENES.length; i++) assert.ok(SCENES[i] > SCENES[i - 1]);
  for (const [k, t] of Object.entries(CUES)) assert.ok(t >= 0 && t < DURATION, k);
  assert.ok(DURATION <= 62, "คลิปควรจบในราว 1 นาที");
});

test("ตัวหมากเดิน/ไถลจบก่อนเปลี่ยนฉาก", () => {
  for (const tk of TOKENS) {
    for (const op of tk.ops) {
      if (op.kind === "set") continue;
      const end = op.at + (op.kind === "walk" ? Math.abs(op.to - op.from) * STEP : op.dur);
      const next = SCENES.find((s) => s > op.at) ?? DURATION;
      assert.ok(end <= next, `${tk.id} ${op.kind} ${op.from}->${op.to} จบ ${end.toFixed(2)} หลังฉากถัดไป ${next}`);
    }
  }
});

test("tokenPoint: ก่อน/ระหว่าง/หลังเดิน", () => {
  const ops = [{ at: 0, kind: "set", to: 2 }, { at: 1, kind: "walk", from: 2, to: 6 }];
  const a = tokenPoint(ops, 0.5);
  const end = tokenPoint(ops, 10);
  const mid = tokenPoint(ops, 1 + STEP * 1.5);
  assert.equal(a.lift, 0);
  assert.ok(end.x > a.x && end.y === a.y);
  assert.ok(mid.lift > 0);
});
