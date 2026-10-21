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
// รูปแบบ "Say ...: ข้อความ" ตามตัวอย่างของ Gemini — ถ้าเขียนคำสั่งยาวเป็นภาษาไทย โมเดลมักอ่านคำสั่งออกเสียงด้วย
const STYLE =
  "Say in a bright, cheerful, smiling voice, like a friendly young Thai female teacher explaining a fun game to university students, at a lively pace";

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
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${STYLE}: ${text}` }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      }),
    });
    const json = await res.json();
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

function wav(pcm) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

const silence = (s) => Buffer.alloc(Math.round(RATE * s) * 2);
const seconds = (pcm) => pcm.length / 2 / RATE;

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
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
  const parts = [];
  for (const [i, line] of LINES.entries()) {
    parts.push(await speak(key, line, voice));
    console.error(`line ${i + 1}: ${seconds(parts[i]).toFixed(2)} s`);
  }
  const chunks = [silence(LEAD_S)];
  const starts = [];
  let t = LEAD_S;
  for (const pcm of parts) {
    starts.push({ at: +t.toFixed(2), dur: +seconds(pcm).toFixed(2) });
    chunks.push(pcm, silence(GAP_S));
    t += seconds(pcm) + GAP_S;
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
