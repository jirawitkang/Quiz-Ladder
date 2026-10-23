// make-intro-voice.mjs
// สร้างเสียงพากย์คลิปวิธีเล่น (js/intro-clip.js) ด้วย Gemini TTS ทีละประโยค → ต่อเป็นไฟล์เดียว assets/intro/intro-voice.m4a
// key: env GEMINI_API_KEY หรือไฟล์ ../.claude/gemini-key.txt (นอก repo — ห้าม commit key)
//
//   node tools/make-intro-voice.mjs --sample Leda,Zephyr     ลองเสียงประโยคแรกหลายเสียง → tmp/voice-samples/
//   node tools/make-intro-voice.mjs --voice Leda --write     สร้างครบ 7 ประโยค แล้วพิมพ์เวลาเริ่มแต่ละประโยค + แก้ VOICE_TIMING ใน js/intro-clip.js ให้เอง
//
// ต่อไฟล์ด้วย afconvert ของ macOS (ไม่ต้องลง ffmpeg)

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const MODEL = "gemini-3.8-flash-tts";
// แยกคำสั่งสไตล์ (DIRECTOR'S NOTES) กับบทพูด (TRANSCRIPT) ชัด ๆ — แบบ "Say ...: ข้อความ" โมเดลมักอ่านคำสั่งออกเสียงด้วย
const STYLE = "Style: bright, cheerful, smiling young Thai female teacher. Lively pace.";
const prompt = (text) => `### DIRECTOR'S NOTES\n${STYLE}\n\n### TRANSCRIPT\n${text}`;

// ต้องตรงกับ LINES ใน js/intro-clip.js (ที่นี่สะกดให้ออกเสียงถูก เช่น ตัวเลขเป็นคำ)
export const LINES = [
  "สวัสดีค่ะทุกคน วันนี้เรามาเล่นเกม Quiz Ladder กัน ใครปีนถึงช่องที่สามสิบก่อน ชนะค่ะ",
  "เริ่มจากสแกนคิวอาร์โค้ด หรือกรอกรหัสห้องบนจอ ใส่ชื่อ แล้วเลือกตัวหมากที่ชอบได้เลย",
  "เกมเล่นเป็นรอบ แต่ละรอบเริ่มจากทอยลูกเต๋า กดที่ลูกเต๋าบนจอของตัวเอง ตัวหมากจะเดินตามแต้ม",
  "จากนั้นเป็นคำถาม ตอบถูกได้เดินหน้า ตอบผิดหรือตอบไม่ทัน ต้องถอยหลังนะคะ",
  "บนกระดานมีบันไดสองสี ตกบันไดส้ม ปีนขึ้น ตกบันไดม่วง ร่วงลง แต่ตอบถูกจะไม่ร่วง ตอบผิดก็จะไม่ได้ปีนค่ะ",
  "ระหว่างตอบ เปิดแท็บอื่นค้นหาคำตอบได้เต็มที่ แต่ห้ามปิดหน้าเกมเด็ดขาด ไม่งั้นจะหลุด และเสียตาในรอบนั้น",
  "ถึงเส้นชัยแล้วยังตอบต่อได้นะคะ พร้อมแล้ว ไปปีนบันไดกันเลยค่ะ!",
];

// ประโยคที่ต้องแยกเป็น 2 ช่วงตรงช่วงหยุดหายใจกลางประโยค เพื่อค้างภาพไว้ก่อนพูดต่อ: เลขประโยค → วินาทีที่เว้นเพิ่ม
// (ประโยค 7: ค้างการ์ดข้อฝึกไว้ก่อน "พร้อมแล้ว ไปปีนบันได…") — ซับไตเติลใน intro-clip.js แยกเป็น 2 บรรทัดตามนี้
const HOLDS = { 7: 1.1 };

const RATE = 24000; // Gemini TTS คืน PCM 16-bit mono 24 kHz
const LEAD_S = 0.6; // เงียบก่อนประโยคแรก
const GAP_S = 0.45; // เว้นระหว่างประโยค

async function apiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  return (await readFile(join(ROOT, "..", ".claude", "gemini-key.txt"), "utf8")).trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function speak(key, text, voice) {
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt(text) }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
          },
        }),
      });
    } catch (e) {
      // เน็ตหลุด/เครื่องหลับ → รอแล้วลองใหม่ ไม่นับเป็นความพยายาม
      console.error(`  ${voice}: เชื่อมต่อไม่ได้ (${e.cause?.code || e.message}) รอ 60 วิ`);
      attempt--;
      await sleep(60000);
      continue;
    }
    const json = await res.json().catch(() => ({}));
    const data = json?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
    if (data) {
      const pcm = trimSilence(Buffer.from(data, "base64"));
      // บางครั้งโมเดลอ่านคำสั่งสไตล์ออกเสียงด้วย → ยาวผิดปกติ ให้สร้างใหม่
      if (seconds(pcm) <= Array.from(text).length * 0.13 + 1) return pcm;
      console.error(`  ${voice}: ยาวผิดปกติ ${seconds(pcm).toFixed(1)} วิ สร้างใหม่`);
      if (attempt >= 6) throw new Error("TTS kept reading the style prompt");
      continue;
    }
    // 429 = โควตาเต็ม (รายนาที/รายวัน) → รอได้เรื่อย ๆ ส่วน error อื่นลองไม่เกิน 6 ครั้ง
    if (res.status !== 429 && attempt >= 6) throw new Error(`TTS failed (${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
    if (attempt >= 80) throw new Error("TTS quota still exhausted");
    // แพ็กเกจฟรีได้ 3 ครั้ง/นาที → รอตามที่ server บอกแล้วลองใหม่
    const wait = res.status === 429 ? Math.min(1800, parseFloat(/"retryDelay":\s*"([\d.]+)s"/.exec(JSON.stringify(json))?.[1] || "60") + 2) : 3;
    console.error(`  ${voice}: รอ ${Math.round(wait)} วิ (${res.status})`);
    await sleep(wait * 1000);
  }
}

// ตัดความเงียบหัว/ท้ายประโยค เพื่อคุมช่องว่างระหว่างประโยคเอง
function trimSilence(pcm) {
  const n = pcm.length / 2;
  const loud = (i) => Math.abs(pcm.readInt16LE(i * 2)) > 400;
  let a = 0;
  while (a < n && !loud(a)) a++;
  let b = n - 1;
  while (b > a && !loud(b)) b--;
  const pad = Math.round(RATE * 0.05);
  return pcm.subarray(Math.max(0, a - pad) * 2, Math.min(n, b + pad) * 2);
}

// Gemini TTS แถมเสียงขยะที่ขอบประโยค: คลิกสั้น ๆ ก่อนช่วงเงียบตอนต้น และเสียงซ่าดัง ~0.15 วิ หลังช่วงเงียบตอนท้าย
// (ตัดจบทันทีไม่จางลง) → ตัดทิ้ง แล้วจางเข้า/ออกสั้น ๆ กันเสียงคลิก
const WIN = RATE / 50; // 20 ms
function rmsAt(pcm, w) {
  let sum = 0;
  for (let i = w * WIN; i < (w + 1) * WIN; i++) sum += pcm.readInt16LE(i * 2) ** 2;
  return Math.sqrt(sum / WIN);
}
export function cleanEdges(pcm) {
  const wins = Math.floor(pcm.length / 2 / WIN);
  const quiet = (w) => rmsAt(pcm, w) < 200;
  let start = 0;
  let end = wins;
  // ต้นประโยค: เสียงดังไม่เกิน 3 ช่องแรกแล้วตามด้วยความเงียบ = คลิก
  for (let w = 1; w <= 3 && w < wins; w++) {
    if (quiet(w) && !quiet(w - 1)) { start = w; break; }
  }
  // ท้ายประโยค: ช่องสุดท้ายยังดัง (ไม่จางลง) และมีช่วงเงียบ ≥0.1 วิ คั่นอยู่ภายใน 0.5 วิสุดท้าย = เสียงซ่า
  if (wins > 30 && rmsAt(pcm, wins - 1) > 3000) {
    for (let w = wins - 2; w > wins - 25; w--) {
      let run = 0;
      while (w - run >= 0 && quiet(w - run)) run++;
      if (run >= 5) { end = w - run + 1 + 5; break; }
    }
  }
  const out = Buffer.from(pcm.subarray(start * WIN * 2, end * WIN * 2));
  const n = out.length / 2;
  const fade = Math.round(RATE * 0.015);
  for (let i = 0; i < fade && i < n; i++) {
    const g = i / fade;
    out.writeInt16LE(Math.round(out.readInt16LE(i * 2) * g), i * 2);
    out.writeInt16LE(Math.round(out.readInt16LE((n - 1 - i) * 2) * g), (n - 1 - i) * 2);
  }
  return out;
}

function wav(pcm) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

// แยกเสียงตรงช่วงเงียบที่ยาวที่สุดระหว่าง 30–75% ของประโยค
function splitAtPause(pcm) {
  const wins = Math.floor(pcm.length / 2 / WIN);
  let best = { len: 0, at: 0 };
  let run = 0;
  for (let w = Math.floor(wins * 0.3); w < Math.floor(wins * 0.75); w++) {
    run = rmsAt(pcm, w) < 300 ? run + 1 : 0;
    if (run > best.len) best = { len: run, at: w - Math.floor(run / 2) };
  }
  if (best.len < 5) throw new Error("splitAtPause: no pause found");
  const cut = best.at * WIN * 2;
  return [pcm.subarray(0, cut), pcm.subarray(cut)];
}

const silence = (s) => Buffer.alloc(Math.round(RATE * s) * 2);
const seconds = (pcm) => pcm.length / 2 / RATE;

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
if (opt("--preview")) {
  // ฟังประโยคที่สร้างเสร็จแล้ว (ตัดขอบแล้ว) โดยไม่เรียก API: --preview <voice> <โฟลเดอร์ปลายทาง>
  const voice = opt("--preview");
  const dir = args[args.indexOf("--preview") + 2];
  await mkdir(dir, { recursive: true });
  const chunks = [];
  for (let i = 1; i <= LINES.length; i++) {
    const raw = await readFile(join(ROOT, "tmp", "voice-lines", voice, `${i}.pcm`)).catch(() => null);
    if (!raw) continue;
    const pcm = cleanEdges(raw);
    await writeFile(join(dir, `${i}.wav`), wav(pcm));
    chunks.push(pcm, silence(GAP_S));
    console.log(`line ${i}: ${seconds(raw).toFixed(2)} → ${seconds(pcm).toFixed(2)} s`);
  }
  await writeFile(join(dir, "all.wav"), wav(Buffer.concat(chunks)));
  process.exit(0);
}

const key = await apiKey();

if (opt("--sample")) {
  const dir = join(ROOT, "tmp", "voice-samples");
  await mkdir(dir, { recursive: true });
  for (const voice of opt("--sample").split(",")) {
    const pcm = await speak(key, LINES[0], voice);
    await writeFile(join(dir, `${voice}.wav`), wav(pcm));
    console.log(`${voice}: ${seconds(pcm).toFixed(2)} s`);
  }
} else {
  const voice = opt("--voice") || "Leda";
  // เก็บเสียงรายประโยคไว้ใน tmp/ → รันซ้ำแล้วทำต่อจากประโยคที่ยังไม่มี (โควตาฟรีน้อย)
  const cacheDir = join(ROOT, "tmp", "voice-lines", voice);
  await mkdir(cacheDir, { recursive: true });
  const parts = [];
  for (const [i, line] of LINES.entries()) {
    const file = join(cacheDir, `${i + 1}.pcm`);
    let pcm = await readFile(file).catch(() => null);
    if (!pcm) {
      pcm = await speak(key, line, voice);
      await writeFile(file, pcm);
    }
    pcm = cleanEdges(pcm);
    parts.push(pcm);
    console.error(`line ${i + 1}: ${seconds(pcm).toFixed(2)} s`);
  }
  // ช่วงเสียงตามลำดับ (ประโยคใน HOLDS ถูกแยกเป็น 2 ช่วง) → VOICE_TIMING.lines มีทีละช่วง
  const segments = [];
  parts.forEach((pcm, i) => {
    const hold = HOLDS[i + 1];
    if (!hold) return segments.push({ pcm, gap: GAP_S });
    const [a, b] = splitAtPause(pcm);
    segments.push({ pcm: a, gap: hold }, { pcm: b, gap: GAP_S });
  });
  const chunks = [silence(LEAD_S)];
  const starts = [];
  let t = LEAD_S;
  for (const { pcm, gap } of segments) {
    starts.push({ at: +t.toFixed(2), dur: +seconds(pcm).toFixed(2) });
    chunks.push(pcm, silence(gap));
    t += seconds(pcm) + gap;
  }
  console.log(JSON.stringify({ voice, total: +t.toFixed(2), lines: starts }));
  if (args.includes("--write")) {
    const tmpWav = join(ROOT, "tmp", "intro-voice.wav");
    await mkdir(join(ROOT, "tmp"), { recursive: true });
    await writeFile(tmpWav, wav(Buffer.concat(chunks)));
    execFileSync("afconvert", ["-f", "m4af", "-d", "aac", "-b", "64000", tmpWav, join(ROOT, "assets", "intro", "intro-voice.m4a")]);
    console.error("wrote assets/intro/intro-voice.m4a");
    // อัปเดตเวลาในคลิปให้ตรงกับเสียงใหม่
    const clipPath = join(ROOT, "js", "intro-clip.js");
    const clip = await readFile(clipPath, "utf8");
    const timing = JSON.stringify({ voice, total: +t.toFixed(2), lines: starts });
    await writeFile(clipPath, clip.replace(/(\/\/ VOICE-TIMING-START.*\n)const VOICE_TIMING = .*;\n/, `$1const VOICE_TIMING = ${timing};\n`));
    console.error("updated VOICE_TIMING in js/intro-clip.js");
  }
}
