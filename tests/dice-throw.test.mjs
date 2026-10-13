// รัน: node --test tests/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.matchMedia ??= () => ({ matches: false });
const { _planThrowForTest: planThrow } = await import("../js/dice.js");

const from = { x: 900, y: 120 };
const to = { x: 400, y: 380 };
const start = { x: 0, y: 0, z: 0 };
const end = { x: 1980, y: 1170, z: 450 };

test("throw takes exactly the requested time and ends at the board center", () => {
  const plan = planThrow(from, to, 5000, start, end);
  assert.equal(plan.total, 5000);
  const last = plan.at(5000);
  assert.deepEqual(last.ground, to);
  assert.equal(last.z, 0);
  assert.equal(last.phase, "rest");
});

test("each bounce is lower and quieter than the one before", () => {
  const plan = planThrow(from, to, 5000, start, end);
  const peaks = [];
  let prevTime = 160;
  for (const imp of plan.impacts) {
    let peak = 0;
    for (let t = prevTime; t <= imp.time; t += 5) peak = Math.max(peak, plan.at(t).z);
    peaks.push(peak);
    prevTime = imp.time;
  }
  assert.equal(peaks.length, 4);
  for (let i = 1; i < peaks.length; i++) assert.ok(peaks[i] < peaks[i - 1] * 0.5, `bounce ${i} not lower`);
  for (let i = 1; i < plan.impacts.length; i++) assert.ok(plan.impacts[i].strength < plan.impacts[i - 1].strength);
  for (const imp of plan.impacts) assert.ok(plan.at(imp.time).z < 1, "touches the ground on impact");
});

test("ground travel keeps moving toward the target and slows down", () => {
  const plan = planThrow(from, to, 5000, start, end);
  const dist = (t) => Math.hypot(plan.at(t).ground.x - to.x, plan.at(t).ground.y - to.y);
  let prev = Infinity;
  for (let t = 160; t <= 5000; t += 50) {
    const d = dist(t);
    assert.ok(d <= prev + 25, `moved away at ${t}ms`); // เบี่ยงข้างเล็กน้อยได้
    prev = d;
  }
  const early = dist(200) - dist(700);
  const late = dist(plan.rollEnd - 500) - dist(plan.rollEnd);
  assert.ok(early > late * 3, "slows down over time");
});

test("spin slows down and lands exactly on the target orientation", () => {
  const plan = planThrow(from, to, 5000, start, end);
  let prev = -1;
  const speeds = [];
  for (let t = 0; t <= 5000; t += 50) {
    const r = plan.rotAt(t).x;
    assert.ok(r >= prev, "never spins backwards");
    speeds.push(r - Math.max(prev, 0));
    prev = r;
  }
  assert.deepEqual(plan.rotAt(plan.rollEnd), end);
  assert.deepEqual(plan.rotAt(5000), end);
  const firstSecond = speeds.slice(4, 20).reduce((a, b) => a + b, 0);
  const lastSecond = speeds.slice(-30, -14).reduce((a, b) => a + b, 0);
  assert.ok(firstSecond > lastSecond * 4, "much faster at the start");
});
