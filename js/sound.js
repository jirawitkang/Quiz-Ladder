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
