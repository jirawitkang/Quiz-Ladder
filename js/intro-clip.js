// intro-clip.js
// คลิปแนะนำกติกา ~1 นาที สำหรับจอครูใน Lobby: แอนิเมชัน DOM ตามเวลาของเสียงพากย์ + เพลง/เสียงเอฟเฟกต์สังเคราะห์
// ทุกอย่างคำนวณจากเวลา t ของไฟล์เสียง → หยุด/เล่นต่อ/เล่นใหม่ได้ตรงกันเสมอ (ไม่มี setTimeout ต่อฉาก)
// เสียงพากย์สร้างด้วย tools/make-intro-voice.mjs ซึ่งเขียน VOICE_TIMING ด้านล่างให้เองทุกครั้งที่สร้างเสียงใหม่

import { LADDERS, DROPS, BOARD_COLS, BOARD_ROWS, cellPosition } from "./board-config.js";
import { boardCellsHtml, boardSvgHtml } from "./board-markup.js";

const VOICE_SRC = "assets/intro/intro-voice.m4a";
const STAGE_W = 1280;
const STAGE_H = 720;
const CELL = 84;

// เวลาเริ่ม/ความยาว (วิ) ของแต่ละประโยคในไฟล์เสียง
// VOICE-TIMING-START (tools/make-intro-voice.mjs แก้ส่วนนี้ให้อัตโนมัติ)
const VOICE_TIMING = {"voice":"Kanya","total":58.24,"lines":[{"at":0.8,"dur":8.56},{"at":9.96,"dur":7.17},{"at":17.73,"dur":7.75},{"at":26.07,"dur":6.29},{"at":32.97,"dur":9.97},{"at":43.54,"dur":8.4},{"at":52.53,"dur":5.11}]};
// VOICE-TIMING-END
const DURATION = VOICE_TIMING.total + 0.1;

// ซับไตเติล (ต้องตรงกับ LINES ใน tools/make-intro-voice.mjs)
const LINE_TEXT = [
  "สวัสดีค่ะทุกคน วันนี้เรามาเล่นเกม Quiz Ladder กัน ใครปีนถึงช่องที่ 30 ก่อน ชนะค่ะ",
  "เริ่มจากสแกน QR Code หรือกรอกรหัสห้องบนจอ ใส่ชื่อ แล้วเลือกตัวหมากที่ชอบได้เลย",
  "เกมเล่นเป็นรอบ แต่ละรอบเริ่มจากทอยลูกเต๋า กดที่ลูกเต๋าบนจอของตัวเอง ตัวหมากจะเดินตามแต้ม",
  "จากนั้นเป็นคำถาม ตอบถูกได้เดินหน้า ตอบผิดหรือตอบไม่ทัน ต้องถอยหลังนะคะ",
  "บนกระดานมีบันไดสองสี ตกบันไดส้ม ปีนขึ้น ตกบันไดม่วง ร่วงลง แต่ตอบถูกจะไม่ร่วง ตอบผิดก็จะไม่ได้ปีนค่ะ",
  "ระหว่างตอบ เปิดแท็บอื่นค้นหาคำตอบได้เต็มที่ แต่ห้ามปิดหน้าเกมเด็ดขาด ไม่งั้นจะหลุด และเสียตาในรอบนั้น",
  "ถึงเส้นชัยแล้วยังตอบต่อได้นะคะ พร้อมแล้ว ไปปีนบันไดกันเลยค่ะ!",
];
const LINES = LINE_TEXT.map((text, i) => ({ at: VOICE_TIMING.lines[i].at, text }));

// จังหวะภาพ = [ประโยคที่, สัดส่วนของประโยคที่คำนั้นถูกพูด] (วัดจากวลีต้นประโยค) → เปลี่ยนเสียงแล้วภาพยังตรงคำ
const CUE_SPEC = {
  s1: [0, 0], s1b: [0, 0.62],
  s2: [1, 0], code: [1, 0.257], name: [1, 0.536], pick: [1, 0.668], picked: [1, 0.83],
  s3: [2, 0], tap: [2, 0.33], roll: [2, 0.37], rolled: [2, 0.654], walk: [2, 0.757],
  s4: [3, 0], ok: [3, 0.235], bad: [3, 0.49],
  s5: [4, 0], up: [4, 0.204], down: [4, 0.414], safe: [4, 0.633], stuck: [4, 0.805],
  s6: [5, 0], tab: [5, 0.079], noclose: [5, 0.429], stop: [5, 0.507], lost: [5, 0.665],
  s7: [6, 0], go: [6, 0.46],
};
const CUES = Object.fromEntries(
  Object.entries(CUE_SPEC).map(([k, [i, f]]) => {
    const l = VOICE_TIMING.lines[i];
    return [k, +(l.at + f * l.dur).toFixed(2)];
  }),
);
const SCENES = [CUES.s1, CUES.s2, CUES.s3, CUES.s4, CUES.s5, CUES.s6, CUES.s7];

const ROLL_END = CUES.rolled;
const STEP = 0.34;

// เส้นทางตัวหมาก: set = วางที่ช่อง, walk = เดินทีละช่อง (กระโดด), slide = ไถลตามบันได
const TOKENS = [
  { id: "hero", emoji: "🦊", color: "#FFA240", name: "มายด์", ops: [
    { at: 0, kind: "set", to: 2 },
    { at: CUES.walk, kind: "walk", from: 2, to: 6 },
    { at: CUES.ok + 0.25, kind: "walk", from: 6, to: 8 },
    { at: CUES.bad + 0.6, kind: "walk", from: 8, to: 6 },
    { at: CUES.s7, kind: "set", to: 30 },
  ] },
  { id: "panda", emoji: "🐼", color: "#1e88e5", ops: [
    { at: 0, kind: "set", to: 4 },
    { at: CUES.up + 0.1, kind: "walk", from: 4, to: 5 },
    { at: CUES.up + 0.55, kind: "slide", from: 5, to: 8, dur: 0.9, sfx: "ladder" },
  ] },
  { id: "frog", emoji: "🐸", color: "#43a047", ops: [
    { at: 0, kind: "set", to: 15 },
    { at: CUES.down + 0.1, kind: "walk", from: 15, to: 16 },
    { at: CUES.down + 0.55, kind: "slide", from: 16, to: 9, dur: 1.0, sfx: "drop" },
  ] },
  { id: "tiger", emoji: "🐯", color: "#fb8c00", ops: [
    { at: 0, kind: "set", to: 20 },
    // ตอบถูก = เดินหน้า มาหยุดที่บันไดม่วงก็ไม่ร่วง
    { at: CUES.safe + 0.05, kind: "walk", from: 20, to: 22 },
  ] },
  { id: "bunny", emoji: "🐰", color: "#d81b60", ops: [
    { at: 0, kind: "set", to: 13 },
    // ตอบผิด = ถอยหลัง มาหยุดที่บันไดส้มก็ไม่ได้ปีน
    { at: CUES.stuck + 0.1, kind: "walk", from: 13, to: 11 },
  ] },
];

const PICK_EMOJIS = ["🐶", "🐱", "🐭", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🐔", "🐧"];
const TAKEN = { "🐼": "ต้น", "🐸": "ฝน", "🐯": "บีม" };
const ROOM_CODE = "K7Q2M9";
const HERO_NAME = "มายด์";

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, f) => a + (b - a) * f;
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

function cellCenter(n) {
  const { col, row } = cellPosition(n);
  return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
}

// ตำแหน่งตัวหมาก ณ เวลา t จากรายการ ops
export function tokenPoint(ops, t) {
  let op = ops[0];
  for (const o of ops) if (o.at <= t) op = o;
  if (op.kind === "set") return { ...cellCenter(op.to), lift: 0 };
  if (op.kind === "walk") {
    const dir = Math.sign(op.to - op.from);
    const steps = Math.abs(op.to - op.from);
    const k = (t - op.at) / STEP;
    if (k >= steps) return { ...cellCenter(op.to), lift: 0 };
    const i = Math.floor(k);
    const f = k - i;
    const a = cellCenter(op.from + dir * i);
    const b = cellCenter(op.from + dir * (i + 1));
    return { x: lerp(a.x, b.x, easeInOut(f)), y: lerp(a.y, b.y, easeInOut(f)), lift: Math.sin(Math.PI * f) * 20 };
  }
  const f = easeInOut(clamp01((t - op.at) / op.dur));
  const a = cellCenter(op.from);
  const b = cellCenter(op.to);
  return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f), lift: 0 };
}

// เหตุการณ์เสียงเอฟเฟกต์ทั้งคลิป เรียงตามเวลา
function buildSfx() {
  const list = [
    { at: CUES.picked, kind: "pop" },
    { at: ROLL_END, kind: "hit" },
    { at: CUES.ok, kind: "correct" },
    { at: CUES.bad, kind: "wrong" },
    { at: CUES.safe + 1.1, kind: "correct" },
    { at: CUES.stuck + 0.85, kind: "wrong" },
    { at: CUES.noclose + 0.66, kind: "wrong" },
    { at: CUES.lost, kind: "drop" },
    { at: CUES.go, kind: "fanfare" },
  ];
  for (let x = CUES.roll; x < ROLL_END - 0.1; x += 0.17) list.push({ at: x, kind: "tick" });
  for (const tk of TOKENS) {
    for (const op of tk.ops) {
      if (op.kind === "walk") {
        const steps = Math.abs(op.to - op.from);
        for (let i = 1; i <= steps; i++) list.push({ at: op.at + i * STEP, kind: "hop" });
      } else if (op.sfx) list.push({ at: op.at, kind: op.sfx });
    }
  }
  return list.sort((a, b) => a.at - b.at);
}

// ---------- เสียง (Web Audio) ----------

function createSound() {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC();
  const music = ctx.createGain();
  const sfx = ctx.createGain();
  music.gain.value = 0.55;
  sfx.gain.value = 0.7;
  music.connect(ctx.destination);
  sfx.connect(ctx.destination);
  const noise = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return { ctx, music, sfx, noise };
}

function midiHz(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function note(snd, out, when, freq, { dur = 0.35, gain = 0.05, type = "triangle", slideTo = null, attack = 0.008 } = {}) {
  const { ctx } = snd;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, when);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, when + dur);
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(gain, when + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  o.connect(g).connect(out);
  o.start(when);
  o.stop(when + dur + 0.05);
}

function shaker(snd, when, gain) {
  const { ctx } = snd;
  const src = ctx.createBufferSource();
  src.buffer = snd.noise;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 6500;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.06);
  src.connect(hp).connect(g).connect(snd.music);
  src.start(when);
  src.stop(when + 0.08);
}

// เพลงเบา ๆ 100 BPM: อาร์เปจโจ C–Am–F–G + เบส + เชคเกอร์ จางเข้า/ออกตามความยาวคลิป
const EIGHTH = 0.3;
const CHORDS = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]];
const ARP = [0, 1, 2, 3, 2, 1, 0, 2];

function musicEnvelope(t) {
  return clamp01(t / 1.2) * clamp01((DURATION - 0.4 - t) / 1.6);
}

function playMusicStep(snd, k, when) {
  const t = k * EIGHTH;
  const env = musicEnvelope(t);
  if (env <= 0) return;
  const chord = CHORDS[Math.floor(k / 8) % CHORDS.length];
  const idx = ARP[k % 8];
  const m = idx === 3 ? chord[0] + 12 : chord[idx];
  note(snd, snd.music, when, midiHz(m + 12), { dur: 0.32, gain: 0.032 * env, type: "triangle" });
  if (k % 4 === 0) note(snd, snd.music, when, midiHz(chord[0] - 24), { dur: 0.55, gain: 0.09 * env, type: "sine", attack: 0.02 });
  if (k % 2 === 1) shaker(snd, when, 0.014 * env);
}

function playSfx(snd, kind, when) {
  const out = snd.sfx;
  switch (kind) {
    case "tick": note(snd, out, when, 900 + Math.random() * 500, { dur: 0.05, gain: 0.08, type: "square" }); break;
    case "hit": note(snd, out, when, 180, { dur: 0.18, gain: 0.25, type: "sine", slideTo: 90 }); break;
    case "hop": note(snd, out, when, 620, { dur: 0.09, gain: 0.07, type: "sine", slideTo: 880 }); break;
    case "pop": note(snd, out, when, 520, { dur: 0.12, gain: 0.14, type: "sine", slideTo: 1040 }); break;
    case "ladder": [0, 4, 7, 12].forEach((s, i) => note(snd, out, when + i * 0.12, midiHz(72 + s), { dur: 0.2, gain: 0.12 })); break;
    case "drop": note(snd, out, when, 700, { dur: 0.8, gain: 0.13, type: "sawtooth", slideTo: 110 }); break;
    case "correct": [76, 84].forEach((m, i) => note(snd, out, when + i * 0.1, midiHz(m), { dur: 0.3, gain: 0.14, type: "sine" })); break;
    case "wrong": [0, 0.16].forEach((d) => note(snd, out, when + d, 196, { dur: 0.15, gain: 0.1, type: "square" })); break;
    case "fanfare":
      [72, 76, 79, 84].forEach((m, i) => note(snd, out, when + i * 0.13, midiHz(m), { dur: i === 3 ? 0.9 : 0.22, gain: 0.15 }));
      [0.7, 0.95, 1.3].forEach((d) => shaker(snd, when + d, 0.08));
      break;
  }
}

// ---------- ภาพ ----------

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

const LOGO_SVG = `<svg viewBox="0 0 44 44" aria-hidden="true"><rect x="2" y="2" width="40" height="40" rx="11" fill="#FFA240"/><circle cx="19" cy="19" r="10.5" fill="none" stroke="#fff" stroke-width="3.6"/><g stroke="#fff" stroke-width="2.6" stroke-linecap="round"><line x1="28" y1="23" x2="38" y2="33"/><line x1="23" y1="28" x2="33" y2="38"/><line x1="29.5" y1="26.5" x2="26.5" y2="29.5"/><line x1="33" y1="30" x2="30" y2="33"/><line x1="36.5" y1="33.5" x2="33.5" y2="36.5"/></g></svg>`;
const D_UP = `<svg class="iv-d" viewBox="0 0 70 86"><path d="M9 9 H29 C53 9 63 25 63 43 C63 61 53 77 29 77 H9 Z" fill="#FFA240" stroke="#fff" stroke-width="9" stroke-linejoin="round"/><path d="M20 53 L35 29 L50 53 Z" fill="#fff"/></svg>`;
const D_DOWN = `<svg class="iv-d" viewBox="0 0 70 86"><path d="M9 9 H29 C53 9 63 25 63 43 C63 61 53 77 29 77 H9 Z" fill="#7b5cd6" stroke="#fff" stroke-width="9" stroke-linejoin="round"/><path d="M20 33 L35 57 L50 33 Z" fill="#fff"/></svg>`;

function fakeQr() {
  const N = 25;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const finder = (x, y) => x < 7 && y < 7;
  const inFinder = (x, y) => finder(x, y) || finder(N - 1 - x, y) || finder(x, N - 1 - y);
  let s = `<svg viewBox="-2 -2 ${N + 4} ${N + 4}" class="iv-qr"><rect x="-2" y="-2" width="${N + 4}" height="${N + 4}" fill="#fff"/>`;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!inFinder(x, y) && rnd() < 0.48) s += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="#2f2a66"/>`;
  }
  for (const [x, y] of [[0, 0], [N - 7, 0], [0, N - 7]]) {
    s += `<rect x="${x + 0.5}" y="${y + 0.5}" width="6" height="6" fill="none" stroke="#2f2a66"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3" fill="#2f2a66"/>`;
  }
  return s + "</svg>";
}

const PIPS = { 1: [5], 2: [3, 7], 3: [3, 5, 7], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
function diceHtml() {
  const face = (v, cls) => `<div class="iv-face ${cls}">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => `<i${PIPS[v].includes(i) ? ' class="on"' : ""}></i>`).join("")}</div>`;
  return `<div class="iv-cube">${face(1, "f-front")}${face(6, "f-back")}${face(3, "f-right")}${face(4, "f-left")}${face(2, "f-top")}${face(5, "f-bottom")}</div>`;
}

function stageHtml() {
  const opt = (k, text, extra = "") => `<div class="iv-opt k-${k}" ${extra}><b>${k}</b><span>${text}</span></div>`;
  return `
  <div class="iv-bg"></div>

  <div class="iv-logo" data-in="s1" data-out="s2" data-on="s1b">
    <div class="iv-badge">${LOGO_SVG}</div>
    <div class="iv-wordmark"><span class="q">QUIZ</span><span class="l">LA${D_UP}${D_DOWN}ER</span></div>
  </div>
  <div class="iv-chip iv-win" data-in="s1b" data-out="s2">← ปีนถึง <b>ช่อง 30</b> ก่อน = ชนะ!</div>

  <div class="iv-board" id="ivBoard">
    <div class="board"><div class="board-grid">${boardCellsHtml()}</div><svg viewBox="0 0 ${BOARD_COLS * 100} ${BOARD_ROWS * 100}" aria-hidden="true">${boardSvgHtml()}</svg><div class="iv-tokens"></div></div>
  </div>

  <!-- ฉาก 2: เข้าห้อง -->
  <div class="iv-scene iv-join" data-in="s2" data-out="s3">
    <div class="iv-projector">
      <div class="iv-cap">สแกนเพื่อเข้าห้อง</div>
      ${fakeQr()}
      <div class="iv-cap">หรือกรอกรหัสห้อง</div>
      <div class="iv-code-big">${ROOM_CODE}</div>
    </div>
    <div class="iv-hand-arrow">➜</div>
    <div class="iv-phone">
      <div class="iv-screen iv-scan" data-in="s2" data-out="code">
        <div class="iv-cam">${fakeQr()}<i class="iv-scanline"></i></div>
        <div class="iv-ph-cap">กำลังสแกน…</div>
      </div>
      <div class="iv-screen iv-form" data-in="code" data-out="pick">
        <div class="iv-ph-title">เข้าร่วมเกม</div>
        <label>รหัสห้อง</label><div class="iv-field mono" data-type="code"></div>
        <label data-in="name">ชื่อเล่น</label><div class="iv-field" data-in="name" data-type="name"></div>
      </div>
      <div class="iv-screen iv-pickscr" data-in="pick">
        <div class="iv-ph-title">เลือกตัวหมาก</div>
        <div class="iv-pick">${PICK_EMOJIS.map((e) => `<span class="${TAKEN[e] ? "taken" : ""}${e === "🦊" ? " mine" : ""}" ${e === "🦊" ? 'data-on="picked"' : ""}>${e}${TAKEN[e] ? `<small>${TAKEN[e]}</small>` : ""}</span>`).join("")}</div>
        <div class="iv-ph-ok" data-in="picked">✓ ${HERO_NAME} พร้อมแล้ว</div>
      </div>
    </div>
  </div>

  <!-- ฉาก 3–4: แต่ละรอบ -->
  <div class="iv-panel iv-round" data-in="s3" data-out="s5">
    <div class="iv-round-tag">รอบที่ 1</div>
    <div class="iv-steps"><span data-on="s3" data-off="s4">① ทอยลูกเต๋า</span><span data-on="s4" data-off="s5">② ตอบคำถาม</span></div>
  </div>
  <div class="iv-panel iv-dicebox" data-in="s3" data-out="s4">
    <div class="iv-dock">${diceHtml()}<div class="iv-shadow"></div><div class="iv-tap" data-in="tap" data-out="roll">👆</div></div>
    <div class="iv-hint" data-out="rolled">แตะที่ลูกเต๋าบนจอของตัวเอง</div>
    <div class="iv-result" data-in="rolled">ได้ <b>4</b> แต้ม → เดิน 4 ช่อง</div>
  </div>
  <div class="iv-panel iv-q" data-in="s4" data-out="s5">
    <div class="iv-card">
      <div class="iv-qhead"><span>คำถาม</span><span class="iv-timer"><i></i></span><span class="iv-timeout" data-in="bad">หมดเวลา</span></div>
      <div class="iv-qtext">ฐานข้อมูลใดเน้นบทความด้านการแพทย์และสุขภาพ?</div>
      <div class="iv-opts">
        ${opt("A", "ERIC", 'data-on="bad"')}${opt("B", "PubMed", 'data-on="ok" data-off="bad"')}${opt("C", "IEEE Xplore")}${opt("D", "JSTOR")}
      </div>
    </div>
    <div class="iv-verdicts">
      <div class="iv-chip good" data-in="ok">✓ ตอบถูก → เดินหน้า</div>
      <div class="iv-chip bad" data-in="bad">✗ ตอบผิด / ไม่ทัน → ถอยหลัง</div>
    </div>
  </div>

  <!-- ฉาก 5: บันไดสองสี -->
  <div class="iv-panel iv-legend" data-in="s5" data-out="s6">
    <h3>บันไดสองสี</h3>
    <div class="iv-row up" data-in="up"><i>▲</i><div><b>บันไดส้ม</b> ปีนขึ้น</div></div>
    <div class="iv-row down" data-in="down"><i>▼</i><div><b>บันไดม่วง</b> ร่วงลง</div></div>
    <div class="iv-row safe" data-in="safe"><i>✓</i><div><b>ตอบถูก</b> ไม่ร่วงบันไดม่วง</div></div>
    <div class="iv-row stuck" data-in="stuck"><i>✗</i><div><b>ตอบผิด</b> ไม่ได้ปีนบันไดส้ม</div></div>
  </div>

  <!-- ฉาก 6: แท็บเบราว์เซอร์ -->
  <div class="iv-scene iv-browser-scene" data-in="s6" data-out="s7">
    <div class="iv-browser">
      <div class="iv-tabs">
        <div class="iv-tab game">${LOGO_SVG}<span>Quiz Ladder</span><em class="iv-x">×</em></div>
        <div class="iv-tab alt" data-in="tab" data-on="tab" data-off="noclose"><span class="ico">🔎</span><span>PubMed · ค้นหา</span><em>×</em></div>
      </div>
      <div class="iv-page iv-page-game">
        <div class="iv-mini-q">คำถาม: ฐานข้อมูลใดเน้นบทความด้านการแพทย์และสุขภาพ?</div>
        <div class="iv-mini-me">🦊 ${HERO_NAME} · กำลังตอบ…</div>
        <div class="iv-lost" data-in="lost"><div>🦊 ${HERO_NAME} <b>หลุดจากเกม</b></div><small>เสียตาในรอบนี้</small></div>
      </div>
      <div class="iv-page iv-page-search" data-in="tab" data-out="noclose">
        <div class="iv-search">🔎 nursing burnout systematic review</div>
        <div class="iv-hit"><b>Burnout among nurses: a systematic review…</b><i></i><i class="s"></i></div>
        <div class="iv-hit"><b>Prevalence of burnout in ICU staff…</b><i></i><i class="s"></i></div>
      </div>
      <div class="iv-cursor" data-in="noclose">
        <svg viewBox="0 0 24 24"><path d="M3 2 L3 20 L8 15 L11.5 22 L14.5 20.6 L11 13.8 L18 13.8 Z" fill="#fff" stroke="#1f2330" stroke-width="1.5" stroke-linejoin="round"/></svg>
      </div>
    </div>
    <div class="iv-ban" data-in="stop">🚫</div>
    <div class="iv-chip good iv-tip-ok" data-in="tab" data-out="noclose">✓ เปิดแท็บอื่นค้นหาคำตอบได้</div>
    <div class="iv-chip bad iv-tip-no" data-in="stop">ห้ามปิดหน้าเกม!</div>
  </div>

  <!-- ฉาก 7: เส้นชัย -->
  <div class="iv-chip good iv-finish" data-in="s7">🏁 ถึงเส้นชัยแล้ว ยังตอบคำถามต่อได้<small>เป็นข้อฝึก ไม่มีผลกับอันดับ</small></div>
  <div class="iv-go" data-in="go"><span>พร้อมแล้ว</span><b>ไปปีนบันไดกันเลย!</b></div>
  <div class="iv-confetti" data-in="go"></div>

  <div class="iv-sub"><span></span></div>`;
}

function confettiHtml() {
  const colors = ["#FFA240", "#7b5cd6", "#43a047", "#1e88e5", "#fdd835", "#e53935"];
  let s = "";
  for (let i = 0; i < 80; i++) {
    const x = (i * 37) % 100;
    const d = ((i * 53) % 100) / 100;
    s += `<i style="left:${x}%;background:${colors[i % colors.length]};--d:${(d * 0.8).toFixed(2)}s;--r:${(i * 47) % 360}deg;--s:${(2.2 + d * 1.6).toFixed(2)}s"></i>`;
  }
  return s;
}

// ---------- ตัวเล่น ----------

// เปิดคลิปเต็มจอ — เรียกจาก click (ต้องมี user gesture ถึงจะเล่นเสียงได้)
// autoplay=false: แสดงปุ่มเล่นก่อน (ใช้ในหน้าต้นแบบ)
export function openIntroClip({ voiceSrc = VOICE_SRC, autoplay = true, muted = false, onClose } = {}) {
  const overlay = el("div", "iv-overlay");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", "คลิปวิธีเล่น Quiz Ladder");
  overlay.innerHTML = `
    <div class="iv-frame"><div class="iv-stage">${stageHtml()}</div></div>
    <div class="iv-controls">
      <button type="button" class="iv-btn" data-act="toggle" aria-label="หยุดชั่วคราว">❚❚</button>
      <button type="button" class="iv-btn" data-act="music" aria-label="ปิดเพลงประกอบ">♫</button>
      <button type="button" class="iv-btn wide" data-act="close">ข้าม ✕</button>
    </div>
    <div class="iv-progress"><i></i></div>
    <div class="iv-start" ${autoplay ? "hidden" : ""}><button type="button" data-act="play">▶ เล่นคลิปวิธีเล่น</button><small>ประมาณ 1 นาที</small></div>
    <div class="iv-end" hidden><button type="button" data-act="replay">↻ ดูอีกครั้ง</button><button type="button" class="primary" data-act="close">✓ เริ่มกันเลย</button></div>`;
  document.body.appendChild(overlay);
  document.body.classList.add("iv-open");

  const stage = overlay.querySelector(".iv-stage");
  const frame = overlay.querySelector(".iv-frame");
  stage.querySelector(".iv-confetti").innerHTML = confettiHtml();
  const tokenLayer = stage.querySelector(".iv-tokens");
  const tokenEls = TOKENS.map((tk) => {
    const e = el("div", "iv-token", `<span>${tk.emoji}</span>${tk.name ? `<em>${tk.name}</em>` : ""}`);
    e.style.setProperty("--ring", tk.color);
    tokenLayer.appendChild(e);
    return e;
  });
  // ป้ายเหนือช่องในฉากบันได (ตอบถูกไม่ร่วง / ตอบผิดไม่ได้ปีน)
  const mark = (cell, cls, text, cue) => {
    const p = cellCenter(cell);
    const m = el("div", `iv-mark ${cls}`, text);
    m.dataset.in = cue;
    m.dataset.out = "s6";
    m.style.left = `${p.x}px`;
    m.style.top = `${p.y - 44}px`;
    tokenLayer.appendChild(m);
  };
  mark(22, "good", "✓ ตอบถูก เดินหน้า ไม่ร่วง", "safe+1.1");
  mark(11, "bad", "✗ ตอบผิด ถอยหลัง ไม่ได้ปีน", "stuck+0.85");

  const cueTime = (v) => {
    if (v == null) return null;
    const [name, add] = v.split("+");
    return (CUES[name] ?? 0) + (add ? parseFloat(add) : 0);
  };
  const timed = [...stage.querySelectorAll("[data-in],[data-out],[data-on]")].map((e) => ({
    e,
    tin: cueTime(e.dataset.in),
    tout: cueTime(e.dataset.out),
    ton: cueTime(e.dataset.on),
    toff: cueTime(e.dataset.off),
  }));
  // วงลูกศรของบันได (เรียงตาม LADDERS แล้ว DROPS เหมือน boardSvgHtml) → ใช้กะพริบตอนพูดถึงบันไดนั้น
  const ladderFrom = [...Object.keys(LADDERS), ...Object.keys(DROPS)].map(Number);
  const arrows = [...stage.querySelectorAll(".board .ladder .mark")].map((e, i) => {
    e.dataset.cell = String(ladderFrom[i]);
    return e;
  });
  const cube = stage.querySelector(".iv-cube");
  const shadow = stage.querySelector(".iv-shadow");
  const codeField = stage.querySelector('[data-type="code"]');
  const nameField = stage.querySelector('[data-type="name"]');
  const timerBar = stage.querySelector(".iv-timer i");
  const sub = stage.querySelector(".iv-sub span");
  const progress = overlay.querySelector(".iv-progress i");
  const board = stage.querySelector(".iv-board");
  const finishCell = stage.querySelector('.board-cell[data-n="30"]');
  const toggleBtn = overlay.querySelector('[data-act="toggle"]');
  const musicBtn = overlay.querySelector('[data-act="music"]');
  const endBox = overlay.querySelector(".iv-end");
  const startBox = overlay.querySelector(".iv-start");

  const voice = new Audio(voiceSrc);
  voice.preload = "auto";
  voice.muted = muted;
  let snd = null;
  let musicOn = !muted;
  let playing = false;
  let ended = false;
  let fallback = false; // โหลดเสียงไม่ได้ → ใช้นาฬิกาเครื่องแทน ภาพ+ซับยังเล่นได้
  let fbBase = 0;
  let fbStart = 0;
  let lastT = 0;
  let nextStep = 0;
  let raf = 0;
  const sfxList = buildSfx();

  voice.addEventListener("error", () => {
    if (fallback) return;
    fallback = true;
    fbBase = voice.currentTime || 0;
    fbStart = performance.now();
  });

  const now = () => (fallback ? fbBase + (playing ? (performance.now() - fbStart) / 1000 : 0) : voice.currentTime);

  function fit() {
    const s = Math.min(frame.clientWidth / STAGE_W, frame.clientHeight / STAGE_H);
    stage.style.transform = `scale(${s})`;
  }

  function render(t) {
    let scene = 0;
    SCENES.forEach((at, i) => { if (t >= at) scene = i + 1; });
    stage.dataset.scene = String(scene);
    for (const x of timed) {
      if (x.tin != null || x.tout != null) {
        const shown = (x.tin == null || t >= x.tin) && (x.tout == null || t < x.tout);
        x.e.classList.toggle("is-in", shown);
        x.e.classList.toggle("is-out", x.tout != null && t >= x.tout && t < x.tout + 0.4);
      }
      if (x.ton != null) x.e.classList.toggle("is-on", t >= x.ton && (x.toff == null || t < x.toff));
    }

    const boardShown = (scene === 1 && t >= CUES.s1b) || scene === 3 || scene === 4 || scene === 5 || scene === 7;
    board.classList.toggle("show", boardShown);
    finishCell.classList.toggle("occupied", scene === 7); // ธงเส้นชัยหลบให้หมากที่เข้าเส้นชัย (เหมือนในเกม)
    TOKENS.forEach((tk, i) => {
      const p = tokenPoint(tk.ops, t);
      const vis = scene >= 3 && scene <= 5 ? true : scene === 7 && tk.id === "hero";
      const e = tokenEls[i];
      e.style.transform = `translate(${p.x}px, ${p.y - p.lift}px)`;
      e.classList.toggle("show", vis);
    });
    for (const a of arrows) {
      const n = +a.dataset.cell;
      const pulse = (n === 5 && t >= CUES.up && t < CUES.up + 2) || (n === 16 && t >= CUES.down && t < CUES.down + 2);
      a.classList.toggle("pulse", pulse);
    }

    // ลูกเต๋า: หมุนช้า ๆ รอ → โยนกระดอน → หยุดที่หน้า 4
    const p = clamp01((t - CUES.roll) / (ROLL_END - CUES.roll));
    const e = easeOut(p);
    const idle = t < CUES.roll ? Math.sin(t * 2) * 6 : 0;
    const hop = p > 0 && p < 1 ? -Math.abs(Math.sin(p * Math.PI * 3.5)) * (1 - p) * 90 : 0;
    cube.style.transform = `translateY(${hop}px) rotateX(${-16 + 1080 * e + idle}deg) rotateY(${20 + 770 * e}deg)`;
    shadow.style.transform = `scale(${1 + hop / 160})`;

    const typed = (text, t0, per) => Array.from(text).slice(0, Math.max(0, Math.floor((t - t0) / per) + 1)).join("");
    codeField.textContent = t >= CUES.code + 0.2 ? typed(ROOM_CODE, CUES.code + 0.2, 0.2) : "";
    nameField.textContent = t >= CUES.name + 0.15 ? typed(HERO_NAME, CUES.name + 0.15, 0.12) : "";

    const timeLeft = t < CUES.bad ? lerp(1, 0.42, clamp01((t - CUES.s4) / (CUES.bad - CUES.s4))) : lerp(0.42, 0, clamp01((t - CUES.bad) / 0.5));
    timerBar.style.width = `${timeLeft * 100}%`;

    let line = "";
    for (const l of LINES) if (t >= l.at - 0.1) line = l.text;
    if (sub.textContent !== line) sub.textContent = line;
    sub.parentElement.classList.toggle("show", !!line);
    progress.style.width = `${clamp01(t / DURATION) * 100}%`;
  }

  function audioTick(t) {
    if (!snd) return;
    const base = snd.ctx.currentTime;
    for (const s of sfxList) if (s.at > lastT && s.at <= t + 0.03) playSfx(snd, s.kind, base + Math.max(0, s.at - t));
    if (!musicOn) { nextStep = Math.ceil(t / EIGHTH); return; }
    while (nextStep * EIGHTH < t + 0.25) {
      const at = nextStep * EIGHTH;
      if (at >= t - 0.02) playMusicStep(snd, nextStep, base + Math.max(0, at - t));
      nextStep++;
    }
  }

  function loop() {
    raf = 0;
    const t = Math.min(now(), DURATION);
    render(t);
    if (playing) {
      audioTick(t);
      lastT = t;
      if (t >= DURATION) finish();
      else raf = requestAnimationFrame(loop);
    }
  }

  function play() {
    if (ended) return;
    startBox.hidden = true;
    if (!snd) {
      snd = createSound();
      if (snd) snd.sfx.gain.value = muted ? 0 : 0.7;
    }
    snd?.ctx.resume?.();
    playing = true;
    nextStep = Math.ceil(now() / EIGHTH);
    lastT = now();
    if (fallback) fbStart = performance.now();
    else voice.play().catch(() => {
      // เล่นเสียงไม่ได้ (เช่นไม่มี user gesture) → เดินภาพด้วยนาฬิกาเครื่อง
      if (!fallback) { fallback = true; fbBase = voice.currentTime || 0; fbStart = performance.now(); }
    });
    overlay.classList.remove("paused");
    toggleBtn.textContent = "❚❚";
    toggleBtn.setAttribute("aria-label", "หยุดชั่วคราว");
    if (!raf) raf = requestAnimationFrame(loop);
  }

  function pause() {
    if (!playing) return;
    if (fallback) fbBase = now();
    playing = false;
    voice.pause();
    snd?.ctx.suspend?.();
    overlay.classList.add("paused");
    toggleBtn.textContent = "▶";
    toggleBtn.setAttribute("aria-label", "เล่นต่อ");
  }

  function finish() {
    pause();
    ended = true;
    endBox.hidden = false;
  }

  function replay() {
    ended = false;
    endBox.hidden = true;
    voice.currentTime = 0;
    fbBase = 0;
    lastT = 0;
    // ล้างคลาสเพื่อให้แอนิเมชันเข้าฉากเล่นใหม่
    for (const x of timed) x.e.classList.remove("is-in", "is-out", "is-on");
    render(0);
    play();
  }

  function close() {
    playing = false;
    if (raf) cancelAnimationFrame(raf);
    voice.pause();
    voice.removeAttribute("src");
    snd?.ctx.close?.();
    window.removeEventListener("resize", fit);
    document.removeEventListener("keydown", onKey);
    overlay.remove();
    document.body.classList.remove("iv-open");
    onClose?.();
  }

  function onKey(ev) {
    if (ev.key === "Escape") close();
    else if (ev.key === " " && !ended) {
      ev.preventDefault();
      playing ? pause() : play();
    }
  }

  overlay.addEventListener("click", (ev) => {
    const act = ev.target.closest("[data-act]")?.dataset.act;
    if (act === "toggle") playing ? pause() : play();
    else if (act === "play") play();
    else if (act === "replay") replay();
    else if (act === "close") close();
    else if (act === "music") {
      musicOn = !musicOn;
      musicBtn.classList.toggle("off", !musicOn);
      musicBtn.setAttribute("aria-label", musicOn ? "ปิดเพลงประกอบ" : "เปิดเพลงประกอบ");
    }
  });
  window.addEventListener("resize", fit);
  document.addEventListener("keydown", onKey);
  fit();
  render(0);
  if (autoplay) play();
  else overlay.classList.add("paused");

  // ข้ามไปเวลา t (ใช้ทดสอบ/ดูทีละฉาก)
  function seek(t) {
    if (fallback) { fbBase = t; fbStart = performance.now(); }
    else voice.currentTime = t;
    lastT = t;
    nextStep = Math.ceil(t / EIGHTH);
    render(t);
  }

  return { close, play, pause, seek, get time() { return now(); } };
}

// สำหรับ test: ตรวจว่าจังหวะภาพยังอยู่ในคลิปหลังเปลี่ยนเสียง
export const CLIP_TIMELINE = { CUES, SCENES, TOKENS, STEP, DURATION };
