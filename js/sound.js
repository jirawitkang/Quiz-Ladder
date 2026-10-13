// sound.js
// เสียงประกอบสังเคราะห์ด้วย Web Audio (ไม่ต้องมีไฟล์เสียง)
// เบราว์เซอร์อนุญาตให้เล่นเสียงหลังผู้ใช้แตะหน้าจอเท่านั้น → เรียก unlockAudio() จาก event แตะ

const MUTE_KEY = "QR_SOUND_MUTED";

let ctx = null;
let muted = false;
try {
  muted = localStorage.getItem(MUTE_KEY) === "1";
} catch {}

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = !!value;
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {}
}

export function unlockAudio() {
  try {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    ctx = ctx || new AC();
    if (ctx.state === "suspended") ctx.resume();
  } catch {
    ctx = null;
  }
}

function ready() {
  return !muted && ctx && ctx.state === "running";
}

function noiseBuffer(seconds) {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

// ลูกเต๋ากระทบพื้น: เสียง "ก๊อก" ไม้/พลาสติก = noise สั้นผ่าน bandpass + เสียงทุ้มสั้น ๆ
// strength 0..1 (กระดอนสูง = ดัง)
export function playDiceHit(strength = 1) {
  if (!ready()) return;
  const t = ctx.currentTime;
  const s = Math.max(0.05, Math.min(1, strength));

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(0.09);
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 1700 + Math.random() * 600;
  band.Q.value = 2.5;
  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(0.55 * s, t);
  nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  noise.connect(band).connect(nGain).connect(ctx.destination);
  noise.start(t);
  noise.stop(t + 0.1);

  const thump = ctx.createOscillator();
  thump.type = "sine";
  thump.frequency.setValueAtTime(190, t);
  thump.frequency.exponentialRampToValueAtTime(90, t + 0.07);
  const tGain = ctx.createGain();
  tGain.gain.setValueAtTime(0.35 * s, t);
  tGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  thump.connect(tGain).connect(ctx.destination);
  thump.start(t);
  thump.stop(t + 0.1);
}

// ลูกเต๋ากลิ้งพลิกหน้า: เสียง "แก๊ก" เบา ๆ
export function playDiceTick(strength = 0.3) {
  if (!ready()) return;
  const t = ctx.currentTime;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(0.03);
  const high = ctx.createBiquadFilter();
  high.type = "highpass";
  high.frequency.value = 2500;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.3 * Math.max(0.05, Math.min(1, strength)), t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
  noise.connect(high).connect(gain).connect(ctx.destination);
  noise.start(t);
  noise.stop(t + 0.04);
}

/* ---------- เสียงประกอบเกม ---------- */

// โน้ตสั้น ๆ: freq (Hz), เริ่มหลังจากนี้ delay วินาที, ยาว dur วินาที
function tone(freq, { delay = 0, dur = 0.15, type = "triangle", gain = 0.25, slideTo = null } = {}) {
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

const NOTE = { C4: 261.6, E4: 329.6, G4: 392, A3: 220, F3: 174.6, C5: 523.3, E5: 659.3, G5: 784, A5: 880, C6: 1046.5, E6: 1318.5 };

// หมากเดิน 1 ช่อง
export function playHop() {
  if (!ready()) return;
  tone(760 + Math.random() * 80, { dur: 0.05, type: "sine", gain: 0.12 });
}

// ขึ้นบันได: โน้ตไล่ขึ้น
export function playLadder() {
  if (!ready()) return;
  [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((f, i) => tone(f, { delay: i * 0.08, dur: 0.14, gain: 0.2 }));
}

// ตกงู: เสียงไถลลง
export function playSnake() {
  if (!ready()) return;
  tone(700, { dur: 0.7, type: "sawtooth", gain: 0.08, slideTo: 120 });
  tone(350, { dur: 0.7, type: "sine", gain: 0.12, slideTo: 70 });
}

// ตอบถูก / ตอบผิด
export function playCorrect() {
  if (!ready()) return;
  tone(NOTE.E5, { dur: 0.12, gain: 0.22 });
  tone(NOTE.A5, { delay: 0.11, dur: 0.22, gain: 0.22 });
}

export function playWrong() {
  if (!ready()) return;
  tone(NOTE.A3, { dur: 0.16, type: "square", gain: 0.08 });
  tone(NOTE.F3, { delay: 0.15, dur: 0.3, type: "square", gain: 0.08 });
}

// นับถอยหลัง 3-2-1 (final = ตอนเริ่ม)
export function playCountdownBeep(final = false) {
  if (!ready()) return;
  tone(final ? 1320 : 880, { dur: final ? 0.35 : 0.12, type: "sine", gain: 0.22 });
}

// ติ๊กช่วงเวลาตอบใกล้หมด
export function playClockTick() {
  if (!ready()) return;
  tone(1500, { dur: 0.04, type: "square", gain: 0.06 });
}

// เฉลยคำตอบ (จอ Host)
export function playReveal() {
  if (!ready()) return;
  [NOTE.G4, NOTE.C5, NOTE.E5].forEach((f, i) => tone(f, { delay: i * 0.06, dur: 0.3, gain: 0.14 }));
}

// เข้าเส้นชัย / จบเกม
export function playFanfare(big = false) {
  if (!ready()) return;
  const notes = big ? [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.G5, NOTE.C6, NOTE.E6] : [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6];
  notes.forEach((f, i) => tone(f, { delay: i * 0.11, dur: i === notes.length - 1 ? 0.6 : 0.16, gain: 0.2 }));
  const end = notes.length * 0.11;
  [NOTE.C5, NOTE.E5, NOTE.G5].forEach((f) => tone(f, { delay: end, dur: 0.8, type: "sine", gain: 0.1 }));
}

// พลุระเบิด: เสียงป๊อปทุ้ม
export function playFireworkPop() {
  if (!ready()) return;
  const t = ctx.currentTime;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(0.35);
  const low = ctx.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.setValueAtTime(1400, t);
  low.frequency.exponentialRampToValueAtTime(200, t + 0.3);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.35, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
  noise.connect(low).connect(g).connect(ctx.destination);
  noise.start(t);
  noise.stop(t + 0.35);
}
