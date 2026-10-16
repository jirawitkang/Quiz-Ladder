// รูปพื้นหลังกระดานของชุดคำถามอื่น ๆ (การ์ตูนหน้ายิ้ม สไตล์เดียวกับ Food Quest) — SVG 1200×1000
import { writeFileSync } from "node:fs";

const W = 1200, H = 1000;

const eyes = (s = 1, { wink = false, sleepy = false, white = false } = {}) => {
  const c = white ? "#fff" : "#3a2a2a";
  const L = sleepy ? `<path d="M-15 -2 q5 4 10 0" stroke="${c}" stroke-width="3" fill="none" stroke-linecap="round"/>`
    : wink ? `<path d="M-15 -2 q5 -5 10 0" stroke="${c}" stroke-width="3" fill="none" stroke-linecap="round"/>`
    : `<circle cx="-10" cy="-2" r="4.2" fill="${c}"/>${white ? "" : `<circle cx="-8.6" cy="-3.6" r="1.4" fill="#fff"/>`}`;
  const R = sleepy ? `<path d="M5 -2 q5 4 10 0" stroke="${c}" stroke-width="3" fill="none" stroke-linecap="round"/>`
    : `<circle cx="10" cy="-2" r="4.2" fill="${c}"/>${white ? "" : `<circle cx="11.4" cy="-3.6" r="1.4" fill="#fff"/>`}`;
  return `<g transform="scale(${s})">${L}${R}
    <ellipse cx="-17" cy="6" rx="5" ry="3" fill="#ff8fa3" opacity=".7"/><ellipse cx="17" cy="6" rx="5" ry="3" fill="#ff8fa3" opacity=".7"/>
    ${sleepy ? `<ellipse cx="0" cy="8" rx="3" ry="3.5" fill="${c}"/>` : `<path d="M-5 5 q5 6 10 0" stroke="${c}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`}</g>`;
};
const shadow = (w) => `<ellipse cx="0" cy="${w * 0.66}" rx="${w * 0.75}" ry="${w * 0.14}" fill="#000" opacity=".08"/>`;
const heart = (fill, stroke, sw = 4) => `<path d="M0 40 C-50 8 -46 -36 -18 -38 C-6 -39 0 -30 0 -24 C0 -30 6 -39 18 -38 C46 -36 50 8 0 40 Z" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
const sparkle = (x, y, s, c) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0 -12 C2 -3 3 -2 12 0 C3 2 2 3 0 12 C-2 3 -3 2 -12 0 C-3 -2 -2 -3 0 -12 Z" fill="${c}"/>`;

const THEMES = {
  office: {
    file: "work-life-balance",
    bg: ["#eef4ff", "#f3eefe", "#eefaf6"],
    dots: ["#cfe0ff", "#e2d6ff", "#d3f2e6", "#fff1c9", "#ffd9e2"],
    sparks: ["#8ecae6", "#b8a6ff", "#ffb703", "#90d8b2"],
    items: {
      coffee: () => `${shadow(46)}
        <path d="M-6 -60 q-10 -12 0 -24 M10 -60 q-10 -12 0 -24" stroke="#c9b6a6" stroke-width="5" fill="none" stroke-linecap="round"/>
        <path d="M-42 -46 H42 L34 44 Q0 56 -34 44 Z" fill="#fff" stroke="#b9a7e8" stroke-width="4" stroke-linejoin="round"/>
        <path d="M42 -26 q30 0 26 26 q-4 22 -30 18" stroke="#b9a7e8" stroke-width="8" fill="none" stroke-linecap="round"/>
        <ellipse cx="0" cy="-46" rx="42" ry="9" fill="#a8744f"/>
        <g transform="translate(0 6)">${eyes(0.9, { sleepy: true })}</g>`,
      laptop: () => `${shadow(60)}
        <rect x="-56" y="-48" width="112" height="72" rx="10" fill="#d7e3ff" stroke="#7d9be0" stroke-width="4"/>
        <rect x="-46" y="-38" width="92" height="52" rx="6" fill="#f4f8ff"/>
        <path d="M-70 26 H70 L60 40 H-60 Z" fill="#b9c9f2" stroke="#7d9be0" stroke-width="4" stroke-linejoin="round"/>
        <g transform="translate(0 -12)">${eyes(0.85)}</g>`,
      clock: () => `${shadow(46)}
        <circle cx="-30" cy="-38" r="12" fill="#ff9aa8" stroke="#e66a7c" stroke-width="4"/><circle cx="30" cy="-38" r="12" fill="#ff9aa8" stroke="#e66a7c" stroke-width="4"/>
        <circle cx="0" cy="2" r="44" fill="#ffc2cb" stroke="#e66a7c" stroke-width="4"/><circle cx="0" cy="2" r="34" fill="#fff"/>
        <path d="M0 2 V-18 M0 2 L14 10" stroke="#e66a7c" stroke-width="4" stroke-linecap="round"/>
        <g transform="translate(0 22) scale(.7)">${eyes(1, { wink: true })}</g>`,
      notes: () => `${shadow(46)}
        <g transform="rotate(-8)"><rect x="-40" y="-40" width="70" height="70" rx="6" fill="#fff3a6" stroke="#e8c84a" stroke-width="4"/></g>
        <g transform="rotate(10) translate(14 10)"><rect x="-38" y="-38" width="70" height="70" rx="6" fill="#ffd1dc" stroke="#ef8fa6" stroke-width="4"/>
        <path d="M-26 -16 h40 M-26 -4 h32 M-26 8 h36" stroke="#ef8fa6" stroke-width="3.5" stroke-linecap="round"/></g>`,
      plant: () => `${shadow(40)}
        <path d="M0 -10 C-30 -30 -40 -64 -14 -66 C0 -60 2 -36 0 -10 Z" fill="#8fd27a" stroke="#5aa34a" stroke-width="3"/>
        <path d="M0 -10 C30 -34 44 -66 18 -70 C4 -62 0 -36 0 -10 Z" fill="#a8e08f" stroke="#5aa34a" stroke-width="3"/>
        <path d="M-34 -6 H34 L26 46 Q0 54 -26 46 Z" fill="#ffb98a" stroke="#e08a55" stroke-width="4" stroke-linejoin="round"/>
        <g transform="translate(0 18)">${eyes(0.8)}</g>`,
      battery: () => `${shadow(52)}
        <rect x="-56" y="-28" width="104" height="56" rx="12" fill="#fff" stroke="#9aa6c8" stroke-width="5"/>
        <rect x="50" y="-12" width="10" height="24" rx="3" fill="#9aa6c8"/>
        <rect x="-48" y="-20" width="24" height="40" rx="6" fill="#ff8f8f"/>
        <g transform="translate(14 2)">${eyes(0.8, { sleepy: true })}</g>`,
      clip: () => `<path d="M-10 40 V-30 a16 16 0 0 1 32 0 V30 a10 10 0 0 1 -20 0 V-20" stroke="#8fa3c9" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
      folder: () => `${shadow(52)}
        <path d="M-56 -34 H-14 L-4 -22 H56 V40 H-56 Z" fill="#a9c6ff" stroke="#6e93e0" stroke-width="4" stroke-linejoin="round"/>
        <path d="M-56 -14 H56 V40 H-56 Z" fill="#c2d6ff" stroke="#6e93e0" stroke-width="4" stroke-linejoin="round"/>
        <g transform="translate(0 14)">${eyes(0.85)}</g>`,
    },
    places: [["coffee", 150, 150, 1.25, -8], ["laptop", 600, 130, 1.0, 0], ["clock", 1060, 150, 1.1, 10],
      ["notes", 140, 520, 1.1, 0], ["folder", 1060, 520, 1.1, -6], ["battery", 600, 520, 1.0, 0],
      ["plant", 360, 330, 0.95, 0], ["clip", 860, 330, 0.9, 20], ["coffee", 860, 730, 0.8, 8],
      ["clock", 360, 740, 0.75, -12], ["laptop", 150, 880, 0.95, 4], ["plant", 1060, 880, 1.0, 0], ["notes", 600, 900, 0.75, 8],
      ["clip", 380, 520, 0.6, -30], ["battery", 830, 520, 0.55, 10], ["folder", 600, 320, 0.55, -6]],
  },

  love: {
    file: "love",
    bg: ["#fff0f5", "#ffeef8", "#fff6ec"],
    dots: ["#ffc8dd", "#ffd6e7", "#fde2e4", "#ffe5b4", "#e9d5ff"],
    sparks: ["#ff8fab", "#ffb3c6", "#ffb703", "#c8a2ff"],
    items: {
      heart: () => `${shadow(40)}${heart("#ff8fab", "#f06292")}<g transform="translate(0 -6)">${eyes(0.8)}</g>`,
      heartY: () => `${shadow(40)}${heart("#ffd166", "#f0b429")}<g transform="translate(0 -6)">${eyes(0.8, { wink: true })}</g>`,
      heartP: () => `${shadow(40)}${heart("#c8a2ff", "#a07be0")}<g transform="translate(0 -6)">${eyes(0.8)}</g>`,
      letter: () => `${shadow(54)}
        <rect x="-56" y="-36" width="112" height="72" rx="8" fill="#fff" stroke="#f48fb1" stroke-width="4"/>
        <path d="M-56 -32 L0 8 L56 -32" stroke="#f48fb1" stroke-width="4" fill="none" stroke-linejoin="round"/>
        <g transform="translate(0 8) scale(.35)">${heart("#ff6b8b", "#e04d70", 8)}</g>`,
      rose: () => `${shadow(30)}
        <path d="M0 0 V70" stroke="#5aa34a" stroke-width="6" stroke-linecap="round"/><path d="M0 40 q-24 -6 -30 -24 q22 0 30 18" fill="#8fd27a"/>
        <circle cx="0" cy="-10" r="30" fill="#ff6b8b" stroke="#e04d70" stroke-width="4"/>
        <path d="M-14 -16 q14 -16 28 0 q-14 10 -28 0 M-18 -2 q18 14 36 0" stroke="#e04d70" stroke-width="3.5" fill="none"/>`,
      diary: () => `${shadow(50)}
        <rect x="-44" y="-56" width="88" height="112" rx="10" fill="#ffc2d6" stroke="#ef7fa6" stroke-width="4"/>
        <rect x="-44" y="-56" width="16" height="112" rx="6" fill="#ef9fbd"/>
        <rect x="34" y="-10" width="18" height="24" rx="4" fill="#ffd166" stroke="#e0a82e" stroke-width="3"/>
        <g transform="translate(6 -26) scale(.32)">${heart("#fff", "#ef7fa6", 8)}</g>
        <g transform="translate(6 18)">${eyes(0.8, { wink: true })}</g>`,
      bear: () => `${shadow(48)}
        <circle cx="-32" cy="-34" r="16" fill="#e4b48a" stroke="#c48b5c" stroke-width="4"/><circle cx="32" cy="-34" r="16" fill="#e4b48a" stroke="#c48b5c" stroke-width="4"/>
        <circle cx="0" cy="0" r="46" fill="#e8bd96" stroke="#c48b5c" stroke-width="4"/><ellipse cx="0" cy="16" rx="18" ry="14" fill="#f8e0c8"/>
        <ellipse cx="0" cy="10" rx="6" ry="4.5" fill="#6b4630"/>${eyes(0.85)}`,
      ring: () => `${shadow(36)}
        <circle cx="0" cy="14" r="30" fill="none" stroke="#f0c75e" stroke-width="9"/>
        <path d="M-16 -18 L0 -40 L16 -18 L0 -8 Z" fill="#bde0fe" stroke="#7fb6e8" stroke-width="3" stroke-linejoin="round"/>`,
    },
    places: [["heart", 150, 150, 1.25, -10], ["letter", 600, 130, 1.0, 4], ["heartY", 1060, 150, 1.05, 10],
      ["bear", 140, 520, 1.1, -6], ["diary", 1060, 520, 1.05, 6], ["heartP", 600, 520, 1.1, 0],
      ["rose", 360, 320, 1.0, -10], ["ring", 860, 330, 1.0, 8], ["heart", 860, 730, 0.75, 12],
      ["letter", 360, 740, 0.75, -8], ["heartP", 150, 880, 1.0, 6], ["rose", 1060, 860, 0.95, 10], ["heartY", 600, 900, 0.7, -8],
      ["heart", 380, 520, 0.5, 18], ["heart", 830, 520, 0.5, -14], ["heartP", 600, 320, 0.5, 0]],
  },

  friends: {
    file: "friends-fun-facts",
    bg: ["#fffbe6", "#eefcf4", "#eef6ff"],
    dots: ["#fdffb6", "#caffbf", "#9bf6ff", "#ffc6ff", "#ffd6a5"],
    sparks: ["#ffb703", "#3ec7a2", "#8ecae6", "#ff70a6"],
    items: {
      balloons: () => `
        <path d="M-20 34 q-6 30 4 60 M10 30 q10 34 -2 64 M34 36 q-2 30 -14 58" stroke="#b0b0c0" stroke-width="2.5" fill="none"/>
        <ellipse cx="-24" cy="-6" rx="28" ry="34" fill="#ff8fab" stroke="#ef6b8f" stroke-width="4"/>
        <ellipse cx="34" cy="0" rx="26" ry="32" fill="#7fd1ff" stroke="#4fb0e8" stroke-width="4"/>
        <ellipse cx="6" cy="-30" rx="28" ry="34" fill="#ffd166" stroke="#f0b429" stroke-width="4"/>
        <g transform="translate(6 -26) scale(.75)">${eyes(1)}</g>`,
      hat: () => `${shadow(40)}
        <path d="M0 -62 L40 40 H-40 Z" fill="#b8a6ff" stroke="#8f78e8" stroke-width="4" stroke-linejoin="round"/>
        <path d="M-20 -10 L26 4 M-30 18 L34 30" stroke="#ffd166" stroke-width="7" stroke-linecap="round"/>
        <circle cx="0" cy="-66" r="10" fill="#ff8fab"/>`,
      gift: () => `${shadow(50)}
        <rect x="-46" y="-20" width="92" height="66" rx="8" fill="#7fe0b8" stroke="#3ec7a2" stroke-width="4"/>
        <rect x="-52" y="-36" width="104" height="22" rx="6" fill="#9cefcb" stroke="#3ec7a2" stroke-width="4"/>
        <rect x="-8" y="-36" width="16" height="82" fill="#ff8fab"/>
        <path d="M0 -36 q-30 -30 -34 -8 q10 10 34 8 q24 2 34 -8 q-4 -22 -34 8" fill="#ff8fab" stroke="#ef6b8f" stroke-width="3"/>
        <g transform="translate(0 14)">${eyes(0.85)}</g>`,
      controller: () => `${shadow(56)}
        <path d="M-58 -10 Q-56 -34 -30 -34 H30 Q56 -34 58 -10 L62 26 Q60 44 42 40 L26 22 H-26 L-42 40 Q-60 44 -62 26 Z" fill="#c9b8ff" stroke="#8f78e8" stroke-width="4" stroke-linejoin="round"/>
        <path d="M-38 -12 v20 M-48 -2 h20" stroke="#fff" stroke-width="6" stroke-linecap="round"/>
        <circle cx="34" cy="-14" r="6" fill="#ff8fab"/><circle cx="46" cy="-2" r="6" fill="#ffd166"/>
        <g transform="translate(0 0) scale(.7)">${eyes(1)}</g>`,
      dice: () => `${shadow(40)}
        <rect x="-38" y="-38" width="76" height="76" rx="16" fill="#fff" stroke="#b0b0c8" stroke-width="4"/>
        <circle cx="-16" cy="-16" r="7" fill="#ff8fab"/><circle cx="16" cy="16" r="7" fill="#ff8fab"/><circle cx="16" cy="-16" r="7" fill="#7fd1ff"/><circle cx="-16" cy="16" r="7" fill="#7fd1ff"/>`,
      cake: () => `${shadow(52)}
        <rect x="-50" y="-6" width="100" height="50" rx="10" fill="#ffd1dc" stroke="#ef8fa6" stroke-width="4"/>
        <path d="M-50 4 q12 14 25 0 q12 14 25 0 q12 14 25 0 q12 14 25 0" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round"/>
        <g stroke-width="5" stroke-linecap="round"><path d="M-22 -8 v-26" stroke="#7fd1ff"/><path d="M0 -8 v-30" stroke="#ffd166"/><path d="M22 -8 v-26" stroke="#7fe0b8"/></g>
        <g fill="#ffb703"><ellipse cx="-22" cy="-40" rx="5" ry="8"/><ellipse cx="0" cy="-44" rx="5" ry="8"/><ellipse cx="22" cy="-40" rx="5" ry="8"/></g>
        <g transform="translate(0 24)">${eyes(0.8)}</g>`,
      note: () => `<path d="M-14 30 V-34 L30 -44 V20" stroke="#8f78e8" stroke-width="7" fill="none" stroke-linejoin="round"/>
        <ellipse cx="-24" cy="32" rx="14" ry="11" fill="#8f78e8"/><ellipse cx="20" cy="22" rx="14" ry="11" fill="#8f78e8"/>`,
      soda: () => `${shadow(34)}
        <path d="M10 -64 L-4 -40" stroke="#ff8fab" stroke-width="6" stroke-linecap="round"/>
        <path d="M-32 -40 H32 L24 50 H-24 Z" fill="#9bf6ff" stroke="#4fb0e8" stroke-width="4" stroke-linejoin="round"/>
        <rect x="-32" y="-48" width="64" height="10" rx="4" fill="#ffd166"/>
        <g transform="translate(0 6)">${eyes(0.8, { wink: true })}</g>`,
    },
    places: [["balloons", 150, 170, 1.15, -6], ["hat", 600, 130, 1.0, 8], ["gift", 1060, 150, 1.05, 6],
      ["controller", 140, 520, 1.0, -6], ["cake", 1060, 520, 1.05, 4], ["dice", 600, 520, 1.0, 12],
      ["soda", 360, 330, 0.95, -8], ["note", 860, 330, 0.9, 10], ["gift", 860, 730, 0.75, -10],
      ["hat", 360, 740, 0.8, -14], ["cake", 150, 880, 1.0, 0], ["balloons", 1060, 860, 0.95, 6], ["dice", 600, 900, 0.65, -14],
      ["note", 380, 520, 0.55, -10], ["dice", 830, 520, 0.5, 20], ["soda", 600, 320, 0.55, 8]],
  },

  money: {
    file: "money-coach",
    bg: ["#f0fbf2", "#fffbe8", "#eef7ff"],
    dots: ["#caffbf", "#fdffb6", "#d9f99d", "#ffe5b4", "#bde0fe"],
    sparks: ["#ffb703", "#52b788", "#ffd166", "#8ecae6"],
    items: {
      coin: () => `${shadow(40)}
        <circle cx="0" cy="0" r="40" fill="#ffd166" stroke="#e0a82e" stroke-width="5"/><circle cx="0" cy="0" r="30" fill="none" stroke="#f3c04a" stroke-width="3"/>
        <g transform="translate(0 4)">${eyes(0.8)}</g>`,
      piggy: () => `${shadow(56)}
        <ellipse cx="0" cy="4" rx="56" ry="42" fill="#ffc2d1" stroke="#f08aa6" stroke-width="4"/>
        <path d="M-30 -30 L-22 -54 L-8 -36 Z" fill="#ffa8bf" stroke="#f08aa6" stroke-width="4" stroke-linejoin="round"/>
        <rect x="-10" y="-40" width="24" height="6" rx="3" fill="#c96b85"/>
        <ellipse cx="50" cy="8" rx="13" ry="11" fill="#ffa8bf" stroke="#f08aa6" stroke-width="4"/><circle cx="46" cy="8" r="2.5" fill="#c96b85"/><circle cx="54" cy="8" r="2.5" fill="#c96b85"/>
        <g stroke="#f08aa6" stroke-width="7" stroke-linecap="round"><path d="M-30 42 v12 M-8 44 v12 M14 44 v12 M34 40 v12"/></g>
        <g transform="translate(16 -6)">${eyes(0.8)}</g>`,
      bag: () => `${shadow(52)}
        <path d="M-14 -46 Q0 -60 14 -46 L22 -36 H-22 Z" fill="#d9b77a" stroke="#b08a4a" stroke-width="4"/>
        <path d="M-22 -36 Q-62 -10 -54 26 Q-48 52 0 52 Q48 52 54 26 Q62 -10 22 -36 Z" fill="#e9cc8e" stroke="#b08a4a" stroke-width="4"/>
        <path d="M-20 -36 H20" stroke="#8a6a2e" stroke-width="6" stroke-linecap="round"/>
        <text x="0" y="14" text-anchor="middle" font-size="40" font-family="Arial Rounded MT Bold,Arial" font-weight="700" fill="#8a6a2e">฿</text>`,
      note: () => `${shadow(58)}
        <rect x="-62" y="-32" width="124" height="64" rx="8" fill="#b7e4c7" stroke="#52b788" stroke-width="4"/>
        <circle cx="0" cy="0" r="20" fill="#d8f3dc" stroke="#52b788" stroke-width="3"/>
        <g transform="translate(0 2) scale(.7)">${eyes(1)}</g>
        <circle cx="-46" cy="-18" r="5" fill="#52b788"/><circle cx="46" cy="18" r="5" fill="#52b788"/>`,
      wallet: () => `${shadow(54)}
        <rect x="-54" y="-34" width="108" height="72" rx="12" fill="#a0b4ff" stroke="#6e86e0" stroke-width="4"/>
        <path d="M20 -10 H58 V22 H20 Q8 22 8 6 Q8 -10 20 -10 Z" fill="#b8c7ff" stroke="#6e86e0" stroke-width="4"/>
        <circle cx="24" cy="6" r="5" fill="#ffd166"/>
        <g transform="translate(-18 4)">${eyes(0.75, { sleepy: true })}</g>`,
      calendar: () => `${shadow(48)}
        <rect x="-46" y="-44" width="92" height="90" rx="10" fill="#fff" stroke="#9aa6c8" stroke-width="4"/>
        <rect x="-46" y="-44" width="92" height="24" rx="10" fill="#ff8f8f"/><rect x="-46" y="-30" width="92" height="10" fill="#ff8f8f"/>
        <g stroke="#9aa6c8" stroke-width="5" stroke-linecap="round"><path d="M-24 -54 v16 M24 -54 v16"/></g>
        <text x="0" y="26" text-anchor="middle" font-size="40" font-family="Arial Rounded MT Bold,Arial" font-weight="700" fill="#52b788">25</text>
        <circle cx="0" cy="12" r="28" fill="none" stroke="#ffb703" stroke-width="4" stroke-dasharray="6 5"/>`,
      card: () => `${shadow(54)}
        <rect x="-58" y="-36" width="116" height="74" rx="10" fill="#ffd6a5" stroke="#f0a35e" stroke-width="4"/>
        <rect x="-58" y="-20" width="116" height="14" fill="#f0a35e"/>
        <rect x="-42" y="8" width="26" height="18" rx="4" fill="#ffe8a3"/>
        <g transform="translate(22 16) scale(.7)">${eyes(1, { wink: true })}</g>`,
      chart: () => `<path d="M-50 40 L-16 4 L8 22 L46 -30" stroke="#52b788" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M28 -34 L50 -36 L48 -14" stroke="#52b788" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    },
    places: [["piggy", 150, 160, 1.15, -6], ["calendar", 600, 130, 0.95, 0], ["bag", 1060, 150, 1.05, 8],
      ["note", 140, 520, 1.0, -8], ["wallet", 1060, 520, 1.0, 6], ["coin", 600, 520, 1.1, 0],
      ["coin", 360, 330, 0.85, -10], ["chart", 860, 330, 0.9, 0], ["card", 860, 730, 0.8, 10],
      ["coin", 360, 740, 0.7, 12], ["bag", 150, 880, 0.95, -6], ["piggy", 1060, 880, 0.9, 6], ["note", 600, 900, 0.7, 6],
      ["coin", 380, 520, 0.5, 0], ["coin", 830, 520, 0.5, 0], ["chart", 600, 320, 0.5, 0]],
  },
};

for (const [, t] of Object.entries(THEMES)) {
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let dots = "";
  for (let i = 0; i < 120; i++) dots += `<circle cx="${(rnd() * W).toFixed(0)}" cy="${(rnd() * H).toFixed(0)}" r="${(4 + rnd() * 9).toFixed(1)}" fill="${t.dots[i % t.dots.length]}" opacity=".7"/>`;
  let sparks = "";
  for (let i = 0; i < 26; i++) sparks += sparkle((rnd() * W).toFixed(0), (rnd() * H).toFixed(0), (0.6 + rnd() * 0.8).toFixed(2), t.sparks[i % t.sparks.length]);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.bg[0]}"/><stop offset=".5" stop-color="${t.bg[1]}"/><stop offset="1" stop-color="${t.bg[2]}"/></linearGradient>
    <pattern id="check" width="80" height="80" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="#fff" opacity=".35"/><rect x="40" y="40" width="40" height="40" fill="#fff" opacity=".35"/></pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/><rect width="${W}" height="${H}" fill="url(#check)"/>
  ${dots}${sparks}
  ${t.places.map(([k, x, y, s, r]) => `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})">${t.items[k]()}</g>`).join("\n")}
</svg>`;
  writeFileSync(new URL(`./${t.file}.svg`, import.meta.url), svg);
  console.log(t.file);
}
