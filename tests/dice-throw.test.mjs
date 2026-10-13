// รัน: node --test tests/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.matchMedia ??= () => ({ matches: false });
const { _planThrowForTest: planThrow, spinTarget, spinDirection } = await import("../js/dice.js");

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

test("spin direction follows travel: right-to-left spins counter-clockwise (angles decrease)", () => {
  assert.equal(spinDirection({ x: 900, y: 100 }, { x: 300, y: 400 }), -1);
  assert.equal(spinDirection({ x: 100, y: 100 }, { x: 700, y: 400 }), 1);
  // มือถือ: โยนขึ้นตรง ๆ ใช้ทวนเข็มนาฬิกาเป็นค่าเริ่มต้น
  assert.equal(spinDirection({ x: 188, y: 560 }, { x: 187, y: 300 }), -1);
});

test("spin targets land on the face orientation and turn enough in the chosen direction", () => {
  for (const [start, target, turns] of [[0, 90, 3], [-8, 270, 5], [370, 0, 1], [-725, 180, 2]]) {
    const ccw = spinTarget(start, target, turns, -1);
    const cw = spinTarget(start, target, turns, 1);
    assert.equal(((ccw % 360) + 360) % 360, target);
    assert.equal(((cw % 360) + 360) % 360, target);
    assert.ok(ccw <= start - 360 * turns && ccw > start - 360 * (turns + 1));
    assert.ok(cw >= start + 360 * turns && cw < start + 360 * (turns + 1));
  }
});

test("counter-clockwise plan keeps decreasing until it stops", () => {
  const start = { x: 0, y: 0, z: 0 };
  const end = { x: spinTarget(0, 90, 6, -1), y: spinTarget(0, 180, 4, -1), z: spinTarget(0, 270, 2, -1) };
  const plan = planThrow(from, to, 5000, start, end);
  let prev = Infinity;
  for (let t = 0; t <= 5000; t += 50) {
    const z = plan.rotAt(t).z;
    assert.ok(z <= prev, `rotateZ went back up at ${t}ms`);
    prev = z;
  }
  assert.deepEqual(plan.rotAt(5000), end);
});

test("sound timing: 4 bounce hits, then softer tumbles with growing gaps, then one settle tick when it stops", () => {
  const plan = planThrow(from, to, 5000, start, end);
  assert.equal(plan.impacts.length, 4);
  const taps = plan.rollTaps;
  assert.ok(taps.length >= 4);
  assert.ok(taps[0].time > plan.impacts[3].time, "tumbles come after the last bounce");
  for (let i = 1; i < taps.length; i++) {
    assert.ok(taps[i].time - taps[i - 1].time > (taps[i - 1].time - (taps[i - 2]?.time ?? plan.rollStart)) - 1, "gaps grow");
    assert.ok(taps[i].strength < taps[i - 1].strength, "gets quieter");
  }
  assert.ok(taps[0].strength < plan.impacts[3].strength, "first tumble quieter than the last bounce");
  assert.ok(taps.at(-1).time < plan.settleTime);
  assert.equal(plan.settleTime, plan.rollEnd);
  // ตอน settle ลูกเต๋าหยุดหมุนแล้ว
  const a = plan.rotAt(plan.settleTime);
  const b = plan.rotAt(plan.settleTime + 200);
  assert.deepEqual(a, b);
});
