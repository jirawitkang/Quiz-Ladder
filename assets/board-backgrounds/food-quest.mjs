// สร้างรูปพื้นหลังกระดาน Food Quest (การ์ตูนอาหารหน้ายิ้ม) เป็น SVG 1200×1000 (สัดส่วนกระดาน 6:5)
import { writeFileSync } from "node:fs";

const W = 1200, H = 1000;
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// หน้าน่ารัก: ตาดำเงา + แก้มชมพู + ปากยิ้ม
const face = (s = 1, { cry = false, wink = false } = {}) => `
  <g transform="scale(${s})">
    ${wink ? `<path d="M-15 -2 q5 -5 10 0" stroke="#3a2a2a" stroke-width="3" fill="none" stroke-linecap="round"/>` : `<circle cx="-10" cy="-2" r="4.2" fill="#3a2a2a"/><circle cx="-8.6" cy="-3.6" r="1.4" fill="#fff"/>`}
    <circle cx="10" cy="-2" r="4.2" fill="#3a2a2a"/><circle cx="11.4" cy="-3.6" r="1.4" fill="#fff"/>
    <ellipse cx="-17" cy="6" rx="5" ry="3" fill="#ff8fa3" opacity=".7"/><ellipse cx="17" cy="6" rx="5" ry="3" fill="#ff8fa3" opacity=".7"/>
    <path d="M-5 5 q5 6 10 0" stroke="#3a2a2a" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    ${cry ? `<path d="M-12 3 q-3 7 0 10 q3 -3 0 -10" fill="#7fd0ff"/>` : ""}
  </g>`;

const shadow = (w) => `<ellipse cx="0" cy="${w * 0.62}" rx="${w * 0.75}" ry="${w * 0.14}" fill="#000" opacity=".08"/>`;
const at = (x, y, s, r, body) => `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})">${body}</g>`;

const FOODS = {
  pizza: () => `${shadow(50)}
    <path d="M-48 -38 Q0 -58 48 -38 L0 56 Z" fill="#ffd66b" stroke="#e3a23b" stroke-width="4" stroke-linejoin="round"/>
    <path d="M-50 -40 Q0 -62 50 -40" stroke="#d98b3a" stroke-width="12" fill="none" stroke-linecap="round"/>
    <circle cx="-20" cy="-18" r="8" fill="#ef5b5b"/><circle cx="18" cy="-14" r="7" fill="#ef5b5b"/><circle cx="2" cy="22" r="6" fill="#ef5b5b"/>
    <g transform="translate(0 2)">${face(0.8)}</g>`,
  cheese: () => `${shadow(52)}
    <path d="M-52 30 L-52 -10 L48 -34 L52 30 Z" fill="#ffe27a" stroke="#e8b94a" stroke-width="4" stroke-linejoin="round"/>
    <path d="M-52 -10 L48 -34 L20 -46 Z" fill="#fff0a8" stroke="#e8b94a" stroke-width="4" stroke-linejoin="round"/>
    <circle cx="-30" cy="18" r="7" fill="#f3c94f"/><circle cx="34" cy="-4" r="9" fill="#f3c94f"/><circle cx="30" cy="20" r="5" fill="#f3c94f"/>
    <g transform="translate(-2 8)">${face(0.85, { wink: true })}</g>`,
  cabbage: () => `${shadow(50)}
    <circle cx="0" cy="0" r="48" fill="#a8e07a"/><path d="M-44 -14 Q-20 -54 18 -46 Q-12 -20 -44 -14" fill="#c9f09c"/>
    <path d="M44 -12 Q30 -50 -6 -48 Q22 -24 44 -12" fill="#8fd062"/><path d="M0 46 Q-6 10 4 -30" stroke="#e9fbd6" stroke-width="5" fill="none" stroke-linecap="round"/>
    <g transform="translate(0 10)">${face(0.85)}</g>`,
  onion: () => `${shadow(46)}
    <path d="M0 -58 C10 -40 46 -26 46 12 C46 40 26 52 0 52 C-26 52 -46 40 -46 12 C-46 -26 -10 -40 0 -58 Z" fill="#d7a4e8" stroke="#b77fcf" stroke-width="4"/>
    <path d="M0 -58 q-8 -14 -2 -22 M0 -58 q8 -12 4 -22" stroke="#7cc46a" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M-14 -30 q-12 30 -4 70 M14 -30 q12 30 4 70" stroke="#c48fdb" stroke-width="3" fill="none"/>
    <g transform="translate(0 14)">${face(0.85, { cry: true })}</g>`,
  fish: () => `${shadow(56)}
    <path d="M-50 0 C-30 -38 30 -38 44 0 C30 38 -30 38 -50 0 Z" fill="#7fc8f8" stroke="#4fa3dc" stroke-width="4"/>
    <path d="M40 0 L70 -26 L66 0 L70 26 Z" fill="#5fb3ec" stroke="#4fa3dc" stroke-width="4" stroke-linejoin="round"/>
    <path d="M-10 -28 q8 28 0 56" stroke="#a9dcfb" stroke-width="5" fill="none"/>
    <g transform="translate(-24 -2)"><circle r="7" fill="#fff"/><circle cx="1.5" r="4" fill="#3a2a2a"/></g>
    <path d="M-44 8 q6 4 10 0" stroke="#3a2a2a" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <ellipse cx="-30" cy="12" rx="5" ry="3" fill="#ff8fa3" opacity=".7"/>`,
  crab: () => `${shadow(56)}
    <g stroke="#e0533f" stroke-width="7" stroke-linecap="round" fill="none"><path d="M-40 20 l-20 14 M-36 30 l-14 18 M40 20 l20 14 M36 30 l14 18"/></g>
    <path d="M-44 -20 q-26 -10 -20 -40 q16 4 22 20 Z" fill="#ff7a5f" stroke="#e0533f" stroke-width="4"/><path d="M44 -20 q26 -10 20 -40 q-16 4 -22 20 Z" fill="#ff7a5f" stroke="#e0533f" stroke-width="4"/>
    <ellipse cx="0" cy="8" rx="52" ry="34" fill="#ff7a5f" stroke="#e0533f" stroke-width="4"/>
    <g stroke="#e0533f" stroke-width="4"><line x1="-12" y1="-22" x2="-14" y2="-38"/><line x1="12" y1="-22" x2="14" y2="-38"/></g>
    <circle cx="-14" cy="-42" r="7" fill="#fff"/><circle cx="-13" cy="-42" r="4" fill="#3a2a2a"/><circle cx="14" cy="-42" r="7" fill="#fff"/><circle cx="15" cy="-42" r="4" fill="#3a2a2a"/>
    <path d="M-8 14 q8 8 16 0" stroke="#3a2a2a" stroke-width="2.8" fill="none" stroke-linecap="round"/>
    <ellipse cx="-24" cy="12" rx="6" ry="3.5" fill="#ffb3c1" opacity=".8"/><ellipse cx="24" cy="12" rx="6" ry="3.5" fill="#ffb3c1" opacity=".8"/>`,
  pasta: () => `${shadow(56)}
    <path d="M-56 -6 Q-56 50 0 52 Q56 50 56 -6 Z" fill="#8fd3ff" stroke="#5fb3ec" stroke-width="4"/>
    <ellipse cx="0" cy="-8" rx="56" ry="16" fill="#ffe3a3" stroke="#f0c46a" stroke-width="4"/>
    <g stroke="#f7c95c" stroke-width="5" fill="none" stroke-linecap="round"><path d="M-36 -10 q10 -14 20 0 q10 14 20 0 q10 -14 20 0"/><path d="M-30 -2 q12 -10 24 0 q12 10 24 0"/></g>
    <circle cx="-14" cy="-16" r="7" fill="#e85d4a"/><circle cx="18" cy="-14" r="6" fill="#e85d4a"/><path d="M6 -26 l8 -10 M12 -26 l-2 -12" stroke="#69c36b" stroke-width="4" stroke-linecap="round"/>
    <g transform="translate(0 26)">${face(0.75)}</g>`,
  cocoa: () => `${shadow(42)}
    <ellipse cx="0" cy="0" rx="40" ry="54" fill="#b8733f" stroke="#8a5229" stroke-width="4"/>
    <g stroke="#9a5f31" stroke-width="4" fill="none"><path d="M-18 -48 q-10 48 0 96"/><path d="M18 -48 q10 48 0 96"/><path d="M0 -54 v108"/></g>
    <path d="M0 -54 q4 -14 14 -16" stroke="#69c36b" stroke-width="5" fill="none" stroke-linecap="round"/>
    <g transform="translate(0 6)"><circle cx="-10" cy="-2" r="4.2" fill="#fff"/><circle cx="-10" cy="-2" r="2.4" fill="#3a2a2a"/><circle cx="10" cy="-2" r="4.2" fill="#fff"/><circle cx="10" cy="-2" r="2.4" fill="#3a2a2a"/>
    <path d="M-5 7 q5 6 10 0" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round"/><ellipse cx="-18" cy="6" rx="5" ry="3" fill="#ff8fa3" opacity=".7"/><ellipse cx="18" cy="6" rx="5" ry="3" fill="#ff8fa3" opacity=".7"/></g>`,
  olives: () => `${shadow(40)}
    <path d="M-4 -46 q14 -10 30 -4" stroke="#7a9a3c" stroke-width="4" fill="none" stroke-linecap="round"/><ellipse cx="22" cy="-50" rx="12" ry="6" fill="#9cc65a" transform="rotate(-20 22 -50)"/>
    <ellipse cx="-20" cy="6" rx="26" ry="32" fill="#9bbf4a" stroke="#7a9a3c" stroke-width="4"/><ellipse cx="-20" cy="-8" rx="7" ry="6" fill="#e85d4a"/>
    <ellipse cx="22" cy="10" rx="26" ry="32" fill="#5a4a6b" stroke="#40334d" stroke-width="4"/>
    <g transform="translate(-20 14) scale(.55)">${face(1)}</g><g transform="translate(22 16) scale(.55)"><circle cx="-10" cy="-2" r="4.2" fill="#fff"/><circle cx="10" cy="-2" r="4.2" fill="#fff"/><path d="M-5 6 q5 6 10 0" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round"/></g>`,
  durian: () => `${shadow(52)}
    ${Array.from({ length: 18 }, (_, i) => { const a = (i / 18) * Math.PI * 2, x = Math.cos(a) * 46, y = Math.sin(a) * 50; return `<path d="M${x * 0.86} ${y * 0.86} L${x * 1.14} ${y * 1.14} L${Math.cos(a + 0.18) * 46 * 0.9} ${Math.sin(a + 0.18) * 50 * 0.9} Z" fill="#9fc24b" stroke="#7a9a2f" stroke-width="2" stroke-linejoin="round"/>`; }).join("")}
    <ellipse cx="0" cy="0" rx="46" ry="50" fill="#b5d65c" stroke="#7a9a2f" stroke-width="4"/>
    <path d="M0 -50 q-2 -14 6 -22" stroke="#6f8a2a" stroke-width="6" fill="none" stroke-linecap="round"/>
    <g transform="translate(0 8)">${face(0.85)}</g>`,
  falafel: () => `${shadow(50)}
    <path d="M-52 10 Q0 -20 52 10 L40 44 Q0 58 -40 44 Z" fill="#f6dfb0" stroke="#d9b77a" stroke-width="4" stroke-linejoin="round"/>
    <circle cx="-22" cy="-6" r="20" fill="#b9783f" stroke="#8f5a2c" stroke-width="3"/><circle cx="18" cy="-10" r="22" fill="#c4834a" stroke="#8f5a2c" stroke-width="3"/>
    <path d="M-40 14 q10 -8 20 0 q10 8 20 0 q10 -8 20 0 q10 8 20 0" stroke="#7cc46a" stroke-width="6" fill="none" stroke-linecap="round"/>
    <g transform="translate(18 -10) scale(.6)">${face(1)}</g>`,
  quest: () => `${shadow(60)}
    <path d="M-60 30 L-60 -20 Q-30 -34 0 -20 Q30 -34 60 -20 L60 30 Q30 16 0 30 Q-30 16 -60 30 Z" fill="#fff" stroke="#b9a7e8" stroke-width="4" stroke-linejoin="round"/>
    <path d="M0 -20 V30" stroke="#b9a7e8" stroke-width="4"/>
    <g stroke="#d5cbf2" stroke-width="3" stroke-linecap="round"><path d="M-48 -8 h36 M-48 2 h30 M-48 12 h34 M12 -8 h36 M12 2 h28"/></g>
    <g transform="translate(34 18) rotate(-20)"><circle cx="0" cy="-18" r="20" fill="#e9f6ff" fill-opacity=".85" stroke="#7b5cd6" stroke-width="7"/><path d="M0 2 v26" stroke="#7b5cd6" stroke-width="9" stroke-linecap="round"/><path d="M-8 -26 q6 -6 14 -2" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/></g>`,
};

const sparkle = (x, y, s, c) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0 -12 C2 -3 3 -2 12 0 C3 2 2 3 0 12 C-2 3 -3 2 -12 0 C-3 -2 -2 -3 0 -12 Z" fill="${c}"/>`;

// วางอาหารกระจายรอบกระดาน (ตรงกลางโล่งกว่าเล็กน้อย กระดานจะได้อ่านง่าย)
const PLACES = [
  ["pizza", 140, 150, 1.25, -12], ["cheese", 1060, 140, 1.15, 10], ["cabbage", 600, 120, 1.0, 0],
  ["crab", 130, 520, 1.15, 6], ["fish", 1070, 520, 1.1, -8], ["quest", 600, 520, 1.2, 0],
  ["onion", 360, 330, 0.95, 8], ["cocoa", 860, 330, 0.95, -10], ["olives", 360, 740, 1.0, -6],
  ["durian", 860, 720, 1.0, 8], ["pasta", 150, 880, 1.15, 4], ["falafel", 1060, 880, 1.1, -6],
  ["olives", 600, 900, 0.75, 12], ["cheese", 600, 320, 0.6, -14], ["pizza", 380, 520, 0.6, 20], ["cabbage", 830, 520, 0.6, -8],
];

let dots = "";
for (let i = 0; i < 120; i++) {
  const c = ["#ffd6a5", "#caffbf", "#bde0fe", "#ffc8dd", "#fdffb6"][i % 5];
  dots += `<circle cx="${(rnd() * W).toFixed(0)}" cy="${(rnd() * H).toFixed(0)}" r="${(4 + rnd() * 9).toFixed(1)}" fill="${c}" opacity=".7"/>`;
}
let sparks = "";
for (let i = 0; i < 26; i++) sparks += sparkle((rnd() * W).toFixed(0), (rnd() * H).toFixed(0), (0.6 + rnd() * 0.8).toFixed(2), ["#ffb703", "#ff8fab", "#8ecae6", "#b5e48c"][i % 4]);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff4e0"/><stop offset=".5" stop-color="#ffeef3"/><stop offset="1" stop-color="#e9f7ef"/></linearGradient>
    <pattern id="check" width="80" height="80" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="#fff" opacity=".35"/><rect x="40" y="40" width="40" height="40" fill="#fff" opacity=".35"/></pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#check)"/>
  ${dots}${sparks}
  ${PLACES.map(([k, x, y, s, r]) => at(x, y, s, r, FOODS[k]())).join("\n")}
</svg>`;

writeFileSync(new URL("./food-quest.svg", import.meta.url), svg);
console.log("ok", svg.length);
