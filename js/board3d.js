// board3d.js
// กระดานภูเขาขั้นบันได 2.5 มิติ (Three.js) — คำสั่งเหมือน createBoardView ใน board-view.js (update/setMe/isIdle/reset)
// ฉากนิ่งสร้างครั้งเดียว วาดใหม่เฉพาะตอนมีอะไรขยับ; ท้องฟ้า ดาว เมฆ หิ่งห้อย แสงหมากของฉัน เป็น DOM/CSS ทับ canvas (ไม่กินเครื่อง)
// ต้นแบบที่ผู้ใช้อนุมัติ: ../design/board-2.5d-prototype.html

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { BOARD_SIZE } from "./config.js";
import { BOARD_COLS, BOARD_ROWS, DROPS, LADDERS, isDrop } from "./board-config.js";
import { diceFace, escapeHtml } from "./utils.js";

const COLS = BOARD_COLS, TIERS = BOARD_ROWS, SIZE = BOARD_SIZE;
// ช่อง 1 ซ้ายล่าง เดินซิกแซกขึ้นไป — tier 0 = ชั้นล่างสุด
function cellPos(n) {
  const r = Math.floor((n - 1) / COLS), i = (n - 1) % COLS;
  return { col: r % 2 === 0 ? i : COLS - 1 - i, tier: r };
}

/* ---------- ขนาดฉาก ---------- */
const H = 0.8;          // ความสูงหน้าผาต่อชั้น
const D = 1.6;          // ความลึกต่อชั้น
const COLW = 1.4;       // ระยะห่างคอลัมน์ (กว้างพอวางหมาก 2 ตัวในช่องเดียวไม่เบียด)
const TILE_W = 1.3, TILE_D = 1.22; // ช่องเกือบเต็มความลึกชั้น เหลือขอบหญ้าแค่แนวมอส
const HALF = (COLS * COLW) / 2;
const TAPER = 0.016; // แคบลง 1.6% ต่อ 1 หน่วยความลึก → แถวบนแคบกว่าแถวล่างราว 10%
const sx = (z) => 1 + TAPER * z;
const warp = (v) => { v.x *= sx(v.z); return v; };
const TILE_H = 0.12;
const CAP = 0.16;       // ความหนาชั้นหญ้า (ยื่นเลยหน้าผาเล็กน้อยแบบการ์ตูน)
const GROUND = -0.5;
const yTop = (t) => 0.3 + t * H;      // ผิวหญ้าของชั้น
const zMid = (t) => -t * D;           // แนวกลางช่องของชั้น
const xCol = (c) => (c - (COLS - 1) / 2) * COLW;
const SIDE_J = [0.06, -0.07, 0.11, -0.03, 0.08]; // ไหล่เขาแต่ละชั้นยื่นไม่เท่ากัน ไม่เป็นแนวตรง
const sideW = (t) => 0.8 - t * 0.07 + SIDE_J[t]; // แคบลงเมื่อสูงขึ้น → ทรงภูเขา
// ช่องเลี้ยวขึ้นชั้นถัดไป: 6→7, 12→13, 18→19, 24→25 (คอลัมน์เดียวกัน)
const TURNS = [6, 12, 18, 24].map((n) => ({ n, ...cellPos(n) }));
const stairAt = (tier, col) => TURNS.some((s) => s.tier === tier && s.col === col);
const ladderCols = (lowerTier) => [...Object.entries(LADDERS), ...Object.entries(DROPS).map(([a, b]) => [b, a])]
  .map(([lo]) => cellPos(+lo)).filter((p) => p.tier === lowerTier).map((p) => p.col);


const REDUCED = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const PAUSE_MS = REDUCED ? 0 : 350;
const SAFE_COLOR = /^#[0-9a-f]{3,8}$/i;
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
// แท็บที่ถูกซ่อน (นักเรียนสลับไปค้นคำตอบ) ไม่มี rAF → ข้ามแอนิเมชัน/การรอ ไปผลลัพธ์ทันที ไม่ค้าง
const sleep = (ms) => (document.hidden || ms <= 0 ? Promise.resolve() : new Promise((r) => setTimeout(r, ms)));

const STAGE_HTML = `<div class="b3-sky"><div class="b3-stars a"></div><div class="b3-stars b"></div><div class="b3-cloud c1"></div><div class="b3-cloud c2"></div><div class="b3-cloud c3"></div><div class="b3-cloud c4"></div></div>
<div class="b3-glows"></div><div class="b3-clouds"></div><div class="b3-vignette"></div><div class="b3-marks"><div class="b3-meglow" hidden></div></div>`;

// คืน null ถ้าเครื่องเปิด WebGL ไม่ได้ → ผู้เรียกใช้กระดาน 2 มิติแทน
export function createBoard3D(root, { meId = null, floatsOnlyForMe = false, hooks = {} } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (e) {
    console.warn("[board3d] WebGL not available", e);
    return null;
  }
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.setClearColor(0x000000, 0); // โปร่ง → เห็นท้องฟ้า CSS ด้านหลัง
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2)); // ภาพสวยเป็นค่าเริ่มต้น (ผู้ใช้เลือกทั้งคอมและมือถือ)

  root.classList.add("board3d");
  root.innerHTML = STAGE_HTML;
  root.querySelector(".b3-sky").after(renderer.domElement);
  const glowsEl = root.querySelector(".b3-glows");
  const marksEl = root.querySelector(".b3-marks");
  const meGlowEl = root.querySelector(".b3-meglow");
  let built = false;
  let markReady;
  const ready = new Promise((r) => (markReady = r));

  const scene = new THREE.Scene();
  // sprite (หัวหมาก ป้ายลูกศร ประกาย) วาดทับทีหลัง อยู่บนสุดเสมอ อ่านง่าย
  const overlay = new THREE.Scene();

  /* ---------- texture จาก canvas (ไม่ต้องโหลดรูป) ---------- */
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  function canvasTex(w, h, draw, srgb = true) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    return t;
  }
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const range = (a, b) => a + rnd() * (b - a);
  function roundRect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  // ท้องฟ้ากลางคืน: ไล่สี + ดาว (เป็นพื้นหลังจอ ไม่ขยับตามกล้อง)
  // ท้องฟ้าอยู่ใน CSS (.sky) ด้านหลัง canvas

  /* ---------- แสง ---------- */
  scene.add(new THREE.HemisphereLight(0xc0c2ff, 0x5a3f96, 1.35)); // ฟ้าคราม พื้นสะท้อนม่วง → เงาออกม่วงน้ำเงิน (โทนเย็นตัดกับแสงหลักอุ่น)
  const sun = new THREE.DirectionalLight(0xffc49a, 2.35); // แสงหัวค่ำส้มพีช: อุ่นตัดกับเงาม่วง → สดใสแต่ยังเป็นกลางคืน
  sun.position.set(-5.5, 10, 8);
  sun.target.position.set(0, 1.2, -3.5);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 32 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = 4;
  const rim = new THREE.DirectionalLight(0xb9a2ff, 1.5); // แสงขอบม่วงจากด้านหลัง: ประกายแสงจันทร์ตามขอบหินและต้นไม้
  rim.position.set(4, 6, -12);
  const fill = new THREE.DirectionalLight(0xa7b0ff, 0.65); // แสงเติมเย็นจากหน้าขวา ลดเงาแข็ง
  fill.position.set(7, 4, 10);
  scene.add(sun, sun.target, rim, fill);

  /* ---------- วัสดุ ---------- */
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra });
  // หน้าผา: ลายหินมนบน canvas + bump จาก texture เดียวกัน ให้ผิวมีมิติ
  const rockCanvas = (base, dark, light) => (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    let sd = 3; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 70; i++) {
      const x = r() * w, y = r() * h, rw = 22 + r() * 34, rh = 16 + r() * 22;
      const gr = g.createRadialGradient(x - rw * 0.2, y - rh * 0.3, 2, x, y, rw);
      gr.addColorStop(0, light); gr.addColorStop(1, dark);
      g.fillStyle = gr;
      g.beginPath(); g.ellipse(x, y, rw / 2, rh / 2, (r() - 0.5) * 0.5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "rgba(40,38,44,.35)"; g.lineWidth = 2.5; g.stroke();
    }
    // รอยแตกหิน
    g.strokeStyle = "rgba(36,34,40,.45)"; g.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      let x = r() * w, y = r() * h;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 30; y += 8 + r() * 16; g.lineTo(x, y); }
      g.stroke();
    }
  };
  const cliffTex = canvasTex(256, 256, rockCanvas("#66646a", "#58565c", "#7f7d84")); // หินเทากลาง: ไม่น้ำตาล (ดูกลางวัน) และเข้มกว่า/ไม่ม่วงแบบทางเดิน → ทางเดินเด่น
  cliffTex.wrapS = cliffTex.wrapT = THREE.RepeatWrapping;
  cliffTex.repeat.set(1.3, 0.8);
  const grassTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#4fcf6e"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { g.fillStyle = rnd() < 0.5 ? "rgba(30,150,70,.35)" : "rgba(170,255,170,.38)"; g.fillRect(rnd() * w, rnd() * h, 2, 5); }
  });
  grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
  grassTex.repeat.set(2, 2);
  const M = {
    cliff: std(0xffffff, { map: cliffTex, bumpMap: cliffTex, bumpScale: 2.5, roughness: 0.95, emissive: 0x111014 }),
    grass: std(0xffffff, { map: grassTex, roughness: 0.9 }),
    grassEdge: std(0x3fae5e, { roughness: 0.9 }),
    stepTread: std(0xf8f6ff, { roughness: 0.5, emissive: 0x1d1a33 }),  // ลูกนอน (รับแสง สว่าง)
    stepRiser: std(0xaaa1d8, { roughness: 0.7 }),                       // ลูกตั้ง (หันหน้าเข้ากล้อง เข้มกว่า เห็นเป็นขั้น)
    stepSide: std(0x9a90c8, { roughness: 0.8 }),
    rock: std(0xffffff, { flatShading: true, roughness: 0.9, emissive: 0x111014 }),
    trunk: std(0x8a5a3c), leafA: std(0x33c26f, { roughness: 0.7 }), leafB: std(0x23a65e, { roughness: 0.7 }), pine: std(0x1d8f56, { flatShading: true }),
    wood: std(0xc4844b, { roughness: 0.7 }), woodDark: std(0x8a5a3c),
    gold: std(0xffc93c, { metalness: 0.35, roughness: 0.3, emissive: 0x5a3b00, side: THREE.DoubleSide }), // สองด้าน: ไม่งั้นมองทะลุปากถ้วย
  };

  /* ---------- ภูเขาขั้นบันได ---------- */
  const board = new THREE.Group();
  scene.add(board);
  const mesh = (geo, material, shadow = true) => {
    const m = new THREE.Mesh(geo, material);
    m.castShadow = shadow; m.receiveShadow = true;
    return m;
  };
  // แต่ละชั้นแบ่งเป็นคอลัมน์ แล้วรวมคอลัมน์ติดกันที่หน้า/หลังเท่ากันเป็นก้อนเดียว (ตะเข็บน้อย ขอบมนต่อเนื่อง)
  const cliffFronts = []; // หน้าผาของแต่ละชั้นไว้แปะก้อนหิน { tier, x0, x1, z, y0, y1 }
  for (let t = 0; t < TIERS; t++) {
    const cols = [];
    for (let c = -1; c <= COLS; c++) {
      let front = t === 0 ? zMid(0) + D / 2 + 0.3 : zMid(t) + D / 2;
      if (t > 0 && c >= 0 && c < COLS && stairAt(t - 1, c)) front = zMid(t) + TILE_D / 2; // เว้าถึงขอบหน้าแผ่นหินพอดี ให้บันไดหิน
      let back = t === TIERS - 1 ? zMid(t) - D / 2 - 0.9 : zMid(t) - D / 2;
      if (t < TIERS - 1 && c >= 0 && c < COLS && stairAt(t, c)) back = zMid(t + 1) + TILE_D / 2 + 0.04;
      const x0 = c < 0 ? xCol(0) - COLW / 2 - sideW(t) : c >= COLS ? xCol(COLS - 1) + COLW / 2 : xCol(c) - COLW / 2;
      const x1 = c < 0 ? xCol(0) - COLW / 2 : c >= COLS ? xCol(COLS - 1) + COLW / 2 + sideW(t) : xCol(c) + COLW / 2;
      const last = cols[cols.length - 1];
      if (last && last.front === front && last.back === back) last.x1 = x1;
      else cols.push({ x0, x1, front, back });
    }
    const normalFront = t === 0 ? zMid(0) + D / 2 + 0.3 : zMid(t) + D / 2;
    const ladderXs = t > 0 ? ladderCols(t - 1).map((c) => xCol(c)) : [];
    for (const s of cols) {
      // แบ่งเป็นก้อน ๆ กว้างไม่เท่ากัน แต่ละก้อนเว้าเข้า/ยื่นออกต่างกัน → แนวหน้าผาเป็นหินธรรมชาติ ไม่เป็นเส้นตรง
      const chunks = [];
      for (let x = s.x0; x < s.x1 - 0.02;) {
        let w = range(0.42, 0.78);
        if (s.x1 - (x + w) < 0.3) w = s.x1 - x;
        chunks.push([x, x + w]); x += w;
      }
      const recessed = s.front !== normalFront; // ช่องบันไดหิน: ห้ามยื่นออกมาทับบันได
      for (const [cx0, cx1] of chunks) {
        const nearLadder = ladderXs.some((lx) => lx > cx0 - 0.3 && lx < cx1 + 0.3);
        const off = nearLadder || recessed ? 0 : range(-0.14, 0.06);
        const front = s.front + off;
        const w = cx1 - cx0 + 0.03, d = front - s.back, cx = (cx0 + cx1) / 2, cz = (front + s.back) / 2;
        const hBody = yTop(t) - CAP * 0.6 - GROUND - range(0, 0.04);
        const body = mesh(new RoundedBoxGeometry(w, hBody, d, 3, 0.12), M.cliff);
        body.position.set(cx, GROUND + hBody / 2, cz);
        board.add(body);
        // ชั้นหญ้ายื่นเลยหน้าผานิดหน่อย
        const cap = mesh(new RoundedBoxGeometry(w + 0.06, CAP, recessed ? d : d + 0.08, 3, 0.07), M.grass); // ช่องบันได: หญ้าไม่ยื่นทับบันได
        cap.position.set(cx, yTop(t) - CAP / 2, recessed ? cz : cz + 0.02);
        board.add(cap);
        cliffFronts.push({ tier: t, x0: cx0, x1: cx1, z: front, y0: t === 0 ? GROUND : yTop(t - 1), y1: yTop(t) - CAP });
      }
    }
  }

  // ไหล่เขาซ้าย/ขวา (แบบภาพตัวอย่าง): ก้อนผายื่นออกไม่เท่ากัน บางก้อนต่ำลง ยอดคลุมหญ้า ขอบมีมอสห้อย → ไม่เป็นเส้นตรง
  const sideEdges = []; // ไว้วางมอสตามขอบนอก { x, z0, z1, y, side }
  for (let t = 0; t < TIERS; t++) {
    const zFront = t === 0 ? zMid(0) + D / 2 + 0.2 : zMid(t) + D / 2 - 0.05;
    const zEnd = t === TIERS - 1 ? zMid(t) - D / 2 - 0.8 : zMid(t) - D / 2 - 0.15;
    for (const side of [-1, 1]) {
      const edge = side * (HALF + sideW(t));
      for (let z = zFront; z > zEnd + 0.12;) {
        const dep = Math.min(range(0.4, 0.75), z - zEnd);
        const out = range(0.04, 0.34), drop = rnd() < 0.55 ? 0 : range(0.06, 0.22);
        const yT = yTop(t) - drop, w = out + 0.35;
        const cx = edge + side * (out - w / 2), cz = z - dep / 2;
        const hb = yT - CAP * 0.6 - GROUND;
        const body = mesh(new RoundedBoxGeometry(w, hb, dep + 0.05, 3, 0.14), M.cliff); body.position.set(cx, GROUND + hb / 2, cz); board.add(body);
        const cap = mesh(new RoundedBoxGeometry(w + 0.06, CAP, dep + 0.08, 3, 0.07), M.grass); cap.position.set(cx + side * 0.02, yT - CAP / 2, cz); board.add(cap);
        sideEdges.push({ x: edge + side * (out + 0.03), z0: z, z1: z - dep, y: yT, side });
        z -= dep;
      }
    }
  }

  // บันไดหินเจาะหน้าผาตรงช่องเลี้ยว: จากขอบหลังช่องล่าง ขึ้นไปขอบหน้าช่องบน (คอลัมน์เดียวกัน)
  // ตีนบันไดชนขอบหลังแผ่นหินช่องล่างพอดี ขั้นบนสุดชนขอบหน้าแผ่นหินช่องบนและสูงเสมอแผ่นหิน → ต่อกันไม่ทับกัน
  const STEPS = 3;
  const stepMats = [M.stepSide, M.stepSide, M.stepTread, M.stepSide, M.stepRiser, M.stepSide]; // [+x,-x,บน,ล่าง,หน้า,หลัง]
  for (const s of TURNS) {
    const z0 = zMid(s.tier) - TILE_D / 2;
    const capFront = zMid(s.tier + 1) + TILE_D / 2 + 0.01;
    const zBack = zMid(s.tier + 1) + TILE_D / 2 - 0.22; // สอดเข้าไปใต้แผ่นหินชั้นบน
    const run = (z0 - capFront) / (STEPS - 1), rise = (H + TILE_H - 0.015) / STEPS;
    for (let i = 0; i < STEPS; i++) {
      const zFront = z0 - i * run;
      const hgt = rise * (i + 1);
      const m = mesh(new THREE.BoxGeometry(TILE_W - 0.14, hgt, zFront - zBack), stepMats);
      m.position.set(xCol(s.col), yTop(s.tier) + hgt / 2, (zFront + zBack) / 2);
      board.add(m);
    }
    // แผ่นรองบาง ๆ ใต้ขอบแผ่นหินช่องล่าง ปิดหญ้าที่โผล่ตามขอบหินเบี้ยว (อยู่ต่ำกว่าผิวหิน มองไม่เห็นว่าทับ)
    const pad = mesh(new THREE.BoxGeometry(TILE_W - 0.14, TILE_H * 0.55, 0.14), stepMats);
    pad.position.set(xCol(s.col), yTop(s.tier) + TILE_H * 0.27, z0 + 0.06);
    board.add(pad);
  }

  /* ---------- ก้อนหินบนหน้าผา (instanced = วาดครั้งเดียวหลายร้อยก้อน) ---------- */
  {
    const geo = new THREE.DodecahedronGeometry(1, 0); // เหลี่ยมใหญ่ ๆ แบบหินในภาพตัวอย่าง
    const pos = geo.attributes.position; // บิดผิวให้เป็นหินไม่กลมเป๊ะ
    for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) * range(0.85, 1.12), pos.getY(i) * range(0.85, 1.12), pos.getZ(i) * range(0.85, 1.12));
    geo.computeVertexNormals();
    const items = [];
    const skip = (t, x) => {
      if (t === 0) return false;
      if (ladderCols(t - 1).some((c) => Math.abs(x - xCol(c)) < 0.36)) return true;
      return TURNS.some((s) => s.tier === t - 1 && Math.abs(x - xCol(s.col)) < COLW * 0.45);
    };
    for (const f of cliffFronts) {
      const hgt = f.y1 - f.y0;
      // หินก้อนใหญ่ตั้งเรียงเต็มความสูงหน้าผา + ก้อนเล็กแซมที่ฐาน (เหมือนภาพตัวอย่าง)
      for (let x = f.x0 + 0.16; x < f.x1 - 0.08;) {
        const step = range(0.3, 0.38);
        if (!skip(f.tier, x)) {
          const tall = Math.min(hgt * 0.58, 0.62);
          items.push([x + range(-0.02, 0.02), f.y0 + hgt * 0.5 + range(-0.04, 0.03), f.z + range(0.0, 0.04), range(0.2, 0.25), tall * range(0.86, 1.04), range(0.12, 0.16), true]);
          // อุดซอกระหว่างก้อนใหญ่: ก้อนกลางด้านบน + ก้อนเล็กด้านล่าง (สูงต่ำไม่เท่ากัน)
          const gx = x + step * 0.5;
          if (!skip(f.tier, gx)) {
            items.push([gx + range(-0.03, 0.03), f.y0 + hgt * range(0.68, 0.82), f.z - 0.01, range(0.13, 0.18), range(0.11, 0.16), 0.1, true]);
            items.push([gx + range(-0.03, 0.03), f.y0 + hgt * range(0.18, 0.32), f.z - 0.01, range(0.12, 0.17), range(0.1, 0.15), 0.1, true]);
          }
          if (rnd() < 0.5) items.push([x + range(0.12, 0.22), f.y0 + range(0.05, 0.1), f.z + 0.08, range(0.08, 0.12), range(0.06, 0.1), range(0.07, 0.1)]);
        }
        x += step;
      }
    }
    // ผนังด้านข้างของไหล่เขา: หินเรียงแน่นช่วงที่โผล่เหนือหญ้าชั้นล่าง
    for (const e of sideEdges) {
      const t = e.y > yTop(0) + 0.3 ? Math.round((e.y - 0.3) / H) : 0;
      const yLow = t === 0 ? GROUND : yTop(t - 1) - 0.05, yHigh = e.y - CAP;
      for (let z = e.z0 - 0.12; z > e.z1; z -= range(0.26, 0.34)) {
        for (let y = yLow + 0.18; y < yHigh; y += range(0.3, 0.38)) {
          const r = range(0.15, 0.22);
          items.push([e.x - e.side * 0.04, Math.min(y, yHigh - r * 0.4), z, range(0.1, 0.14), r, r * range(0.9, 1.15), true]);
        }
      }
    }
    // หินใหญ่ที่ไหล่เขาและฐาน ทำให้ขอบภูเขาไม่เป็นเส้นตรง
    for (let t = 0; t < TIERS; t++) {
      for (const sx of [-1, 1]) {
        const edge = xCol(COLS - 1) + COLW / 2 + sideW(t);
        for (let k = 0; k < 4; k++) {
          const s = range(0.22, 0.38);
          items.push([sx * (edge + range(-0.05, 0.12)), range(GROUND + 0.2, yTop(t) - 0.2), zMid(t) + D / 2 - 0.15 - k * 0.42, s, s * range(0.8, 1.1), s]);
        }
      }
    }
    for (let i = 0; i < 16; i++) {
      const s = range(0.18, 0.34);
      items.push([range(-HALF - 0.6, HALF + 0.6), GROUND + 0.02, D / 2 + 0.36 + range(-0.05, 0.08), s, s * 0.8, s * 0.7]);
    }
    // พุ่มมอสฟู ๆ ตามขอบหน้าชั้นหญ้า (ห้อยลงหน้าผานิดหน่อย)
    const moss = [];
    for (const f of cliffFronts) {
      const yEdge = f.tier === 0 ? yTop(0) : yTop(f.tier);
      for (let x = f.x0 + 0.04; x < f.x1 - 0.04; x += range(0.07, 0.1)) {
        if (skip(f.tier, x)) continue;
        moss.push([x, yEdge - range(0.0, 0.04), f.z + range(0.0, 0.04), range(0.09, 0.13)]);   // แนวขอบหญ้า
        if (rnd() < 0.55) moss.push([x + range(-0.03, 0.03), yEdge - range(0.1, 0.17), f.z + range(0.05, 0.09), range(0.06, 0.1)]); // ห้อยลงหน้าผา
      }
    }
    for (const e of sideEdges) {
      for (let z = e.z0; z > e.z1; z -= range(0.08, 0.12)) {
        moss.push([e.x + e.side * range(-0.02, 0.03), e.y - range(0, 0.04), z, range(0.09, 0.13)]);
        if (rnd() < 0.5) moss.push([e.x + e.side * range(0.04, 0.08), e.y - range(0.1, 0.18), z, range(0.06, 0.1)]);
      }
    }
    const mossMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), std(0xffffff, { roughness: 0.9 }), moss.length);
    {
      const m4 = new THREE.Matrix4(), col = new THREE.Color();
      moss.forEach(([x, y, z, r], i) => {
        m4.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(r * 1.2, r * 0.75, r));
        mossMesh.setMatrixAt(i, m4);
        mossMesh.setColorAt(i, col.setHSL(range(0.3, 0.36), 0.68, range(0.38, 0.47)));
      });
    }
    mossMesh.castShadow = true; mossMesh.receiveShadow = true;
    board.add(mossMesh);

    // ใต้ฐาน: หินก้อนใหญ่เรียวลงเป็นเกาะลอย จมหายในเมฆด้านล่าง
    for (const [yy, half, n, r0] of [[GROUND - 0.35, HALF + 0.4, 11, 0.55], [GROUND - 1.0, 3.3, 8, 0.6], [GROUND - 1.7, 2.1, 5, 0.6], [GROUND - 2.3, 0.9, 2, 0.55]]) {
      for (let k = 0; k < n; k++) {
        const r = r0 * range(0.85, 1.2);
        items.push([-half + (k + 0.5) * (2 * half) / n + range(-0.1, 0.1), yy, range(-6, -1.6), r * 1.1, r, r]);
      }
    }
    const inst = new THREE.InstancedMesh(geo, M.rock, items.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
    items.forEach(([x, y, z, a, b, c, upright], i) => {
      // แท่งหินหน้าผาตั้งตรง (หมุนรอบแกนตั้งอย่างเดียว) ส่วนก้อนอื่นเอียงสุ่ม
      q.setFromEuler(upright ? e.set(range(-0.06, 0.06), range(0, 6.28), range(-0.06, 0.06)) : e.set(range(-0.4, 0.4), range(0, 6.28), range(-0.3, 0.3)));
      m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(a, b, c));
      inst.setMatrixAt(i, m4);
      inst.setColorAt(i, col.setHSL(0.08 + range(-0.03, 0.03), range(0.03, 0.08), upright ? range(0.42, 0.54) : range(0.37, 0.49))); // เทาอมอุ่นนิด ๆ ต่างกันทีละก้อน
    });
    inst.castShadow = true; inst.receiveShadow = true;
    board.add(inst);
  }

  /* ---------- ช่อง ---------- */
  // แผ่นหินธรรมชาติ: มุมมนไม่เท่ากัน ขอบเบี้ยวเล็กน้อย ขอบลบมุม (bevel) — สุ่มทุกช่องให้ไม่ซ้ำกัน
  function stoneGeo(h) {
    const B = 0.035; // ความกว้างขอบลบมุม
    const hw = TILE_W / 2 - B, hd = TILE_D / 2 - B;
    const pts = [];
    const corners = [[hw, hd, 0], [-hw, hd, Math.PI / 2], [-hw, -hd, Math.PI], [hw, -hd, Math.PI * 1.5]];
    corners.forEach(([cx, cy, a0], i) => {
      const r = range(0.06, 0.16);
      const ox = cx - Math.sign(cx) * r, oy = cy - Math.sign(cy) * r;
      for (let k = 0; k <= 3; k++) { const a = a0 + (k / 3) * (Math.PI / 2); pts.push(new THREE.Vector2(ox + Math.cos(a) * r, oy + Math.sin(a) * r)); }
      // จุดกลางขอบถัดไปเบี้ยวเข้า/ออกเล็กน้อย
      const [nx, ny] = corners[(i + 1) % 4];
      const mx = (cx + nx) / 2, my = (cy + ny) / 2;
      pts.push(new THREE.Vector2(mx + (mx === 0 ? range(-0.12, 0.12) : Math.sign(mx) * range(-0.025, 0.012)), my + (my === 0 ? range(-0.1, 0.1) : Math.sign(my) * range(-0.025, 0.012))));
    });
    const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: h - 2 * B * 0.6, bevelEnabled: true, bevelThickness: B * 0.6, bevelSize: B, bevelSegments: 2, curveSegments: 3 });
    geo.rotateX(-Math.PI / 2);          // แกนยื่น (z) → แกนตั้ง (y)
    geo.translate(0, -h / 2 + B * 0.6, 0);
    // texture แปะตามตำแหน่งบนแผ่น (0..1)
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + TILE_W / 2) / TILE_W, (p.getZ(i) + TILE_D / 2) / TILE_D);
    return geo;
  }
  const tileSide = std(0xa699dc, { roughness: 0.75 });  // ขอบหินโทนเดียวกับผิว เข้มกว่านิดเดียว
  const finishSide = std(0x74c896, { roughness: 0.7 }); // ขอบช่อง 30 เป็นสีเขียว
  const tileFaces = (top, side = tileSide) => [top, side]; // ExtrudeGeometry: [หน้าบน/ล่าง, ขอบข้าง+ลบมุม]
  // เงานุ่มใต้แผ่นหินบนหญ้า (ทำให้แผ่นหินดูนูนขึ้นมาจากพื้น)
  const tileShadowMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, map: canvasTex(128, 128, (g, w, h) => {
    g.filter = "blur(7px)"; g.fillStyle = "rgba(20,30,10,.55)"; g.fillRect(16, 16, w - 32, h - 32);
  }) });
  // ผิวหินขัดบนช่อง: ขอบเข้มขึ้นนิด + จุดลายหิน
  const tileTex = (base, edge) => canvasTex(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.72);
    gr.addColorStop(0, base); gr.addColorStop(1, edge);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(80,60,150,${range(0.04, 0.1)})`; g.beginPath(); g.arc(rnd() * w, rnd() * h, range(1, 3), 0, Math.PI * 2); g.fill(); }
    // ลบมุมขอบ: ขอบบน/ซ้ายสว่าง ขอบล่าง/ขวามืด
  });
  const TILE_MAT = [std(0xffffff, { map: tileTex("#e7dcff", "#bfa9f8"), roughness: 0.55 }), std(0xffffff, { map: tileTex("#ddd0ff", "#b6a0f5"), roughness: 0.55 })]; // ลาเวนเดอร์อิ่มขึ้น เด่นกว่าทุกอย่าง
  const START_MAT = std(0xffffff, { map: tileTex("#ffe6c4", "#f6c58e"), roughness: 0.6 });
  // เรืองแสงตามลายผิวหิน (ไม่ใช่สีขาวทับ) → ยังเห็นลายและเลขสลักชัด
  for (const m of [...TILE_MAT, START_MAT]) { m.emissive.set(0xffffff); m.emissiveMap = m.map; m.emissiveIntensity = 0.24; }
  const FINISH_MAT = std(0xffffff, { roughness: 0.55, map: canvasTex(256, 256, (g, w) => {
    g.fillStyle = "#c9f1d8"; g.fillRect(0, 0, w, w);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2) { g.fillStyle = "#8fd6ab"; g.fillRect(x * 32, y * 32, 32, 32); }
  }) });
  const LABEL_STRETCH = 1.55;
  function cellWorld(n) {
    const { col, tier } = cellPos(n);
    return new THREE.Vector3(xCol(col), yTop(tier) + TILE_H + (n === SIZE ? 0.07 : 0), zMid(tier));
  }
  async function buildTiles() {
    await Promise.all([document.fonts.load('80px "Lilita One"'), document.fonts.load('600 40px "Mitr"')]).catch(() => {});
    for (let n = 1; n <= SIZE; n++) {
      const { tier } = cellPos(n);
      const p = cellWorld(n);
      const tile = mesh(stoneGeo(n === SIZE ? TILE_H + 0.07 : TILE_H), tileFaces(n === 1 ? START_MAT : n === SIZE ? FINISH_MAT : TILE_MAT[tier % 2], n === SIZE ? finishSide : tileSide));
      tile.position.set(p.x, p.y - (TILE_H + (n === SIZE ? 0.07 : 0)) / 2, p.z);
      board.add(tile);
      const shade = new THREE.Mesh(new THREE.PlaneGeometry(TILE_W + 0.2, TILE_D + 0.2), tileShadowMat);
      shade.rotation.x = -Math.PI / 2;
      shade.position.set(p.x + 0.04, yTop(tier) + 0.004, p.z - 0.03);
      board.add(shade);
      // เลขช่องมุมซ้ายหน้า ยืดแนวลึกไว้ก่อนเพราะกล้องมองเฉียงจะบีบตัวเลข
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(0.52, 0.52 * LABEL_STRETCH),
        new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, map: canvasTex(128, Math.round(128 * LABEL_STRETCH), (g) => {
          g.scale(1, LABEL_STRETCH);
          g.font = '92px "Lilita One","Arial Rounded MT Bold",sans-serif'; g.textAlign = "center"; g.textBaseline = "middle";
          const txt = String(n);
          const deep = n === 1 ? "rgba(140,70,10," : n === SIZE ? "rgba(20,90,50," : "rgba(60,42,140,";
          g.fillStyle = "rgba(255,255,255,.85)"; g.fillText(txt, 66.5, 72.5);   // ขอบร่องรับแสง
          g.fillStyle = deep + ".95)"; g.fillText(txt, 64, 70);                  // ผนังร่องด้านเงา
          g.save(); g.globalCompositeOperation = "source-atop";
          g.fillStyle = deep + ".55)"; g.fillRect(0, 0, 128, 128);              // ก้นร่อง
          g.restore();
          g.fillStyle = deep + ".6)"; g.fillText(txt, 65.5, 71.5);              // ก้นร่องเลื่อนนิด → ผนังซ้ายบนมืดกว่า
        }) }),
      );
      label.rotation.x = -Math.PI / 2;
      label.userData.overlay = true;
      label.position.set(p.x - TILE_W * 0.3, p.y + 0.003, p.z + TILE_D * 0.14);
      board.add(label);
    }
    // ป้าย START
    const s = cellWorld(1);
    const signX = s.x - TILE_W / 2 - 0.36;
    for (const dx of [-0.38, 0.38]) {
      const post = mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.98, 8), M.woodDark);
      post.position.set(signX + dx, s.y + 0.49, s.z - 0.02); board.add(post); // หลังป้าย
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.44), new THREE.MeshStandardMaterial({ roughness: 0.8, map: canvasTex(256, 104, (g) => {
      roundRect(g, 4, 4, 248, 96, 18); g.fillStyle = "#9a6237"; g.fill(); g.lineWidth = 6; g.strokeStyle = "#6e4325"; g.stroke();
      g.font = '62px "Lilita One",sans-serif'; g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("START", 128, 56);
    }) }));
    sign.position.set(signX, s.y + 0.82, s.z + 0.15); sign.rotation.x = -0.3; sign.castShadow = true;
    board.add(sign);
    // ซุ้ม FINISH + ถ้วย + ประกาย บนช่อง 30
    const fin = cellWorld(SIZE);
    // แสงตะเกียงอุ่น ๆ ที่เส้นชัย: จุดสว่างที่สุดของภาพกลางคืน
    const finLight = new THREE.PointLight(0xffc56b, 5, 3.2, 1.6);
    finLight.position.set(fin.x, fin.y + 0.7, fin.z + 0.2);
    warp(finLight.position); // ให้ตรงกับฉากที่ถูกบีบเป็นทรงคางหมู
    scene.add(finLight);
    const archMat = std(0xff9a3c, { roughness: 0.5 });
    for (const dx of [-(TILE_W / 2 - 0.07), TILE_W / 2 - 0.07]) {
      const post = mesh(new RoundedBoxGeometry(0.12, 0.92, 0.12, 2, 0.03), archMat);
      post.position.set(fin.x + dx, fin.y + 0.46, fin.z - TILE_D / 2 + 0.02); board.add(post); // หลังป้าย
    }
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(TILE_W + 0.12, 0.4), new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, map: canvasTex(320, 100, (g) => {
      roundRect(g, 4, 4, 312, 92, 26); g.fillStyle = "#FFA240"; g.fill(); g.lineWidth = 7; g.strokeStyle = "#fff"; g.stroke();
      g.font = '66px "Lilita One",sans-serif'; g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("FINISH", 160, 54);
    }) }));
    banner.position.set(fin.x, fin.y + 0.9, fin.z - TILE_D / 2 + 0.16); banner.rotation.x = -0.15;
    board.add(banner);
    const cup = mesh(new THREE.LatheGeometry([
      new THREE.Vector2(0.0, 0), new THREE.Vector2(0.12, 0), new THREE.Vector2(0.12, 0.03), new THREE.Vector2(0.035, 0.06),
      new THREE.Vector2(0.035, 0.15), new THREE.Vector2(0.14, 0.2), new THREE.Vector2(0.16, 0.36), new THREE.Vector2(0.14, 0.37),
    ], 24), M.gold);
    cup.position.set(fin.x, fin.y, fin.z - 0.22); cup.scale.setScalar(1.25);
    board.add(cup);
    const sparkle = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false, toneMapped: false, map: canvasTex(64, 64, (g) => {
      g.fillStyle = "#fff6c2"; g.beginPath();
      for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4, r = i % 2 ? 9 : 30; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
      g.closePath(); g.fill();
    }) });
    for (const [dx, dy, s2] of [[-0.42, 0.75, 0.16], [0.48, 0.62, 0.12], [0.1, 0.9, 0.1]]) {
      const sp = new THREE.Sprite(sparkle); sp.scale.set(s2, s2, 1); sp.position.set(fin.x + dx, fin.y + dy, fin.z - 0.3); overlay.add(sp);
    }
    bakeWarp();
    requestRender();
  }

  // บิดฉากนิ่งทั้งหมดเป็นทรงคางหมู: ฝังตำแหน่งลงเรขาคณิตแล้วหดแกน x ตามความลึก
  function bakeWarp() {
    const isDynamic = (o) => { for (let q = o; q; q = q.parent) if (q.userData.dynamic) return true; return false; };
    const list = [];
    board.updateMatrixWorld(true);
    board.traverse((o) => { if (o.isMesh && !isDynamic(o)) list.push(o); });
    const m4 = new THREE.Matrix4(), pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    for (const m of list) {
      if (m.isInstancedMesh) {
        for (let i = 0; i < m.count; i++) {
          m.getMatrixAt(i, m4); m4.decompose(pos, q, sc);
          m.setMatrixAt(i, m4.compose(warp(pos), q, sc));
        }
        m.instanceMatrix.needsUpdate = true;
        m.computeBoundingSphere();
        continue;
      }
      const g = m.geometry.clone();
      g.applyMatrix4(m.matrixWorld);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * sx(p.getZ(i)));
      g.boundingSphere = null; g.boundingBox = null;
      m.geometry = g;
      m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.scale.set(1, 1, 1);
      board.add(m);
    }
    for (const o of overlay.children) if (!o.userData.head) warp(o.position);
    for (const pts of Object.values(ladderPaths)) pts.forEach(warp);
    onBuilt();
  }

  /* ---------- บันได (ไม้ทรงมน พิงหน้าผา ระหว่างช่องคอลัมน์เดียวกัน) ---------- */
  const ladderPaths = {};
  function makeLadder(lower, upper, railColor, rungColor) {
    const a = cellPos(lower), b = cellPos(upper);
    const x = xCol(a.col);
    const cliff = zMid(a.tier) - D / 2;
    const foot = new THREE.Vector3(x, yTop(a.tier) + TILE_H, zMid(a.tier) - TILE_D / 2 + 0.16); // บนแผ่นหินช่องล่าง
    const head = new THREE.Vector3(x, yTop(b.tier) + 0.22, cliff + 0.12); // ยื่นพ้นขอบหญ้าช่องบน
    const g = new THREE.Group();
    const v = head.clone().sub(foot);
    const L = v.length();
    const rail = std(railColor, { roughness: 0.55 }), rung = std(rungColor, { roughness: 0.55 });
    for (const dx of [-0.18, 0.18]) { const r = mesh(new THREE.CapsuleGeometry(0.05, L + 0.06, 4, 10), rail); r.position.set(dx, L / 2, 0); g.add(r); }
    for (const f of [0.22, 0.47, 0.72]) { const r = mesh(new THREE.CapsuleGeometry(0.038, 0.32, 4, 8), rung); r.rotation.z = Math.PI / 2; r.position.set(0, L * f, 0); g.add(r); }
    g.position.copy(foot);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
    board.add(g);
    return { foot, head };
  }
  function badgeTex(color, up) {
    return canvasTex(128, 128, (g) => {
      g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fillStyle = "#fff"; g.fill();
      g.beginPath(); g.arc(64, 64, 50, 0, Math.PI * 2); g.fillStyle = color; g.fill();
      g.fillStyle = "#fff"; g.beginPath();
      if (up) { g.moveTo(36, 76); g.lineTo(64, 38); g.lineTo(92, 76); } else { g.moveTo(36, 52); g.lineTo(64, 90); g.lineTo(92, 52); }
      g.closePath(); g.fill();
    });
  }
  // ป้ายลูกศรติดกลางตัวบันได
  function addBadge(foot, head, color, up) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: badgeTex(color, up), toneMapped: false, depthTest: false }));
    s.scale.set(0.27, 0.27, 1);
    s.position.copy(foot).lerp(head, 0.5).add(new THREE.Vector3(0, 0, 0.08));
    overlay.add(s);
  }
  for (const [f, t] of Object.entries(LADDERS)) {
    const { foot, head } = makeLadder(+f, t, 0xd9761b, 0xf3a64f);
    ladderPaths[f] = [foot, head];
  }
  for (const [f, t] of Object.entries(DROPS)) {
    const { foot, head } = makeLadder(t, +f, 0x6a4fc4, 0x9b84e6);
    ladderPaths[f] = [head, foot];
  }

  /* ---------- พืชพรรณ: ต้นไม้ พุ่มไม้ กอหญ้า ดอกไม้ (เฉพาะขอบ ไม่ทับทางเดิน) ---------- */
  function roundTree(x, y, z, s) {
    const g = new THREE.Group();
    const trunk = mesh(new THREE.CylinderGeometry(0.05 * s, 0.075 * s, 0.32 * s, 8), M.trunk); trunk.position.y = 0.16 * s; g.add(trunk);
    const blobs = [[0, 0.5, 0, 0.27], [-0.14, 0.4, 0.05, 0.19], [0.15, 0.42, -0.02, 0.2], [0.02, 0.7, 0, 0.19]];
    for (const [bx, by, bz, r] of blobs) {
      const b = mesh(new THREE.IcosahedronGeometry(r * s, 1), rnd() < 0.5 ? M.leafA : M.leafB);
      b.position.set(bx * s, by * s, bz * s); g.add(b);
    }
    g.position.set(x, y, z); board.add(g);
  }
  function pineTree(x, y, z, s) {
    const g = new THREE.Group();
    const trunk = mesh(new THREE.CylinderGeometry(0.045 * s, 0.065 * s, 0.25 * s, 7), M.trunk); trunk.position.y = 0.12 * s; g.add(trunk);
    [[0.3, 0.48, 0.42], [0.23, 0.4, 0.7], [0.15, 0.3, 0.93]].forEach(([r, h, yy]) => {
      const c = mesh(new THREE.ConeGeometry(r * s, h * s, 8), M.pine); c.position.y = yy * s; g.add(c);
    });
    g.position.set(x, y, z); board.add(g);
  }
  function bush(x, y, z, s) {
    for (const [bx, bz, r] of [[0, 0, 0.16], [0.14, 0.03, 0.12], [-0.13, 0.02, 0.11]]) {
      const b = mesh(new THREE.IcosahedronGeometry(r * s, 1), M.leafA); b.position.set(x + bx * s, y + r * s * 0.7, z + bz * s); board.add(b);
    }
  }
  for (let t = 0; t < TIERS; t++) {
    const y = yTop(t), edgeL = xCol(0) - COLW / 2, edgeR = xCol(COLS - 1) + COLW / 2, w = sideW(t);
    const z = zMid(t);
    const sideRock = std(0x7c7a80, { flatShading: true, roughness: 0.9, emissive: 0x111014 });
    for (const side of [-1, 1]) {
      const edge = side < 0 ? edgeL : edgeR;
      const n = 2 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        const x = edge + side * w * range(0.18, 0.85);
        const zz = z + range(-0.65, 0.5);
        if (t === 0 && side < 0 && zz > z - 0.3) continue; // เว้นที่ป้าย START
        const pick = rnd();
        if (pick < 0.22) pineTree(x, y, zz, range(0.85, 1.25));
        else if (pick < 0.44) roundTree(x, y, zz, range(0.8, 1.15));
        else if (pick < 0.82) bush(x, y, zz, range(0.75, 1.15));
        else { const b = mesh(new THREE.DodecahedronGeometry(range(0.16, 0.3), 0), sideRock); b.position.set(x, y + 0.08, zz); b.rotation.set(rnd(), rnd() * 6, rnd()); board.add(b); }
      }
    }
  }
  // ตะเกียงตามไหล่เขา สลับซ้ายขวาทุกชั้น (ชั้นล่างซ้ายเว้นให้ป้าย START)
  const lanternPts = [];
  {
    const post = std(0x4a3426, { roughness: 0.8 }), cap = std(0x3a2a20, { roughness: 0.7, flatShading: true });
    const glass = std(0xffd890, { emissive: 0xffa640, emissiveIntensity: 1.8, roughness: 0.4 });
    [1, -1, 1, -1, -1].forEach((side, t) => {
      const x = side * (HALF + sideW(t) * 0.42), z = zMid(t) + 0.38, y = yTop(t);
      const p1 = mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.62, 8), post); p1.position.set(x, y + 0.31, z); board.add(p1);
      const head = mesh(new THREE.BoxGeometry(0.15, 0.18, 0.15), glass, false); head.position.set(x, y + 0.71, z); board.add(head);
      const top = mesh(new THREE.ConeGeometry(0.13, 0.11, 4), cap); top.rotation.y = Math.PI / 4; top.position.set(x, y + 0.855, z); board.add(top);
      lanternPts.push(new THREE.Vector3(x, y, z));
    });
  }
  roundTree(xCol(0) - 0.95, yTop(4), zMid(4) - 0.85, 1.25);
  pineTree(xCol(COLS - 1) + 0.85, yTop(4), zMid(4) - 0.9, 1.3);
  // ฉากหลังแถว 25–30: ต้นไม้ห่าง ๆ แซมหินกับพุ่มไม้ และแนวหลังสุดเป็นพุ่ม/หินชิดกันบังขอบหญ้า ไม่ให้เห็นเส้นตรงตัดฟ้า
  {
    const tileBack = zMid(TIERS - 1) - TILE_D / 2;
    const edgeZ = zMid(TIERS - 1) - D / 2 - 0.9; // ขอบหลังหญ้าชั้นบนสุด
    const yR = yTop(TIERS - 1);
    const halfW = HALF + sideW(TIERS - 1);
    const boulder = std(0x7c7a80, { flatShading: true, roughness: 0.9, emissive: 0x111014 });
    const rock = (x, z, r) => { const b = mesh(new THREE.DodecahedronGeometry(r, 0), boulder); b.position.set(x, yR + r * 0.45, z); b.rotation.set(rnd(), rnd() * 6, rnd()); board.add(b); };
    const finX = xCol(cellPos(SIZE).col);
    for (let x = -halfW - 0.15; x < halfW + 0.15; x += range(0.26, 0.38)) {
      if (rnd() < 0.3 && Math.abs(x - finX) > 0.9) rock(x, edgeZ + range(0.02, 0.15), range(0.24, 0.38)); // หลังซุ้ม FINISH ไม่มีหินบังถ้วย
      else bush(x, yR, edgeZ + range(0.05, 0.2), range(1.15, 1.6));
    }
    for (let x = -halfW + 0.3; x < halfW - 0.2; x += range(0.6, 0.95)) {
      const nearFinish = Math.abs(x - finX) < 0.8; // หลังซุ้ม FINISH ใช้ของเตี้ย ไม่บังซุ้ม
      const zm = range(edgeZ + 0.35, tileBack - 0.35);
      const pick = rnd();
      if (!nearFinish && pick < 0.3) (rnd() < 0.5 ? pineTree : roundTree)(x, yR, zm, range(1.0, 1.35));
      else if (pick < 0.6) rock(x, zm, range(0.2, 0.34));
      else bush(x, yR, zm, range(0.9, 1.3));
    }
    for (let x = -halfW + 0.2; x < halfW - 0.1; x += range(0.5, 0.9)) if (rnd() < 0.55) bush(x, yR, tileBack - range(0.14, 0.24), range(0.7, 0.95));
  }
  {
    // กอหญ้าและดอกไม้: สุ่มบนผิวหญ้าที่ไม่ใช่ช่อง/บันได
    const onTile = (x, z, t) => Math.abs(z - zMid(t)) < TILE_D / 2 + 0.06 && Math.abs(x) < HALF + 0.02;
    const onStair = (x, z, t) => TURNS.some((s) => (s.tier === t || s.tier === t - 1) && Math.abs(x - xCol(s.col)) < COLW / 2 && z < zMid(s.tier) - 0.4 && z > zMid(s.tier + 1));
    const tufts = [], flowers = [];
    for (let t = 0; t < TIERS; t++) {
      const front = t === 0 ? zMid(0) + D / 2 + 0.25 : zMid(t) + D / 2 - 0.05;
      const back = t === TIERS - 1 ? zMid(t) - D / 2 - 0.8 : zMid(t) - D / 2 + 0.05;
      const half = HALF + sideW(t) - 0.08;
      for (let i = 0; i < 140; i++) {
        const x = range(-half, half), z = range(back, front);
        if (onTile(x, z, t) || onStair(x, z, t)) continue;
        if (ladderCols(t).some((c) => Math.abs(x - xCol(c)) < 0.3 && z < zMid(t) - 0.4)) continue;
        const margin = Math.abs(x) > HALF + 0.05;
        if (margin && rnd() < 0.25) flowers.push([x, yTop(t), z]);
        else tufts.push([x, yTop(t), z]);
      }
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    const tuftGeo = new THREE.ConeGeometry(0.045, 0.16, 4);
    tuftGeo.translate(0, 0.08, 0);
    const tuftMesh = new THREE.InstancedMesh(tuftGeo, std(0xffffff, { roughness: 0.9 }), tufts.length * 3);
    let k = 0;
    for (const [x, y, z] of tufts) for (let j = 0; j < 3; j++) {
      q.setFromEuler(new THREE.Euler(range(-0.35, 0.35), rnd() * 6, range(-0.35, 0.35)));
      const s = range(0.7, 1.2);
      m4.compose(new THREE.Vector3(x + range(-0.04, 0.04), y - 0.01, z + range(-0.04, 0.04)), q, new THREE.Vector3(s, s, s));
      tuftMesh.setMatrixAt(k, m4);
      tuftMesh.setColorAt(k++, col.setHSL(range(0.3, 0.36), 0.66, range(0.38, 0.5)));
    }
    board.add(tuftMesh);
    const flowerMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.04, 0), std(0xffffff, { roughness: 0.6 }), flowers.length);
    const petals = ["#ffffff", "#ffd1e8", "#ffe27a", "#c9b8ff"];
    flowers.forEach(([x, y, z], i) => {
      m4.compose(new THREE.Vector3(x, y + 0.05, z), q.identity(), new THREE.Vector3(1, 1, 1));
      flowerMesh.setMatrixAt(i, m4);
      flowerMesh.setColorAt(i, col.set(petals[i % petals.length]));
    });
    board.add(flowerMesh);
  }


  // ลูกแก้ว: emoji อยู่ข้างใน + เงาขอบ + แสงสะท้อน (วาดบน canvas ครั้งเดียว ไม่ต้องคำนวณแก้วจริง)
  function glassTex(emoji, tint) {
    return canvasTex(256, 256, (g) => {
      const c = 128, R = 116;
      let gr = g.createRadialGradient(c - 30, c - 40, 8, c, c, R);
      gr.addColorStop(0, "rgba(255,255,255,.62)"); gr.addColorStop(0.72, "rgba(225,232,255,.38)"); gr.addColorStop(1, "rgba(110,98,196,.78)");
      g.fillStyle = gr; g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.fill();
      g.font = '128px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(emoji, c, c + 10);
      // แสงสีประจำตัวสะท้อนขอบล่างของลูกแก้ว
      g.save(); g.globalAlpha = 0.5;
      gr = g.createRadialGradient(c, c + 30, R * 0.55, c, c, R);
      gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, tint);
      g.fillStyle = gr; g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.fill(); g.restore();
      // ไฮไลต์
      g.fillStyle = "rgba(255,255,255,.35)"; g.beginPath(); g.ellipse(c - 36, c - 52, 52, 30, -0.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = "rgba(255,255,255,.9)"; g.beginPath(); g.ellipse(c - 48, c - 60, 18, 10, -0.6, 0, Math.PI * 2); g.fill();
      g.lineWidth = 5; g.strokeStyle = "rgba(255,255,255,.75)"; g.beginPath(); g.arc(c, c, R - 2, 0, Math.PI * 2); g.stroke();
    });
  }
  const HEAD_Y = 0.4; // ความสูงกลางลูกแก้วจากพื้นช่อง
  const SLOTS = { 1: [[0, 0]], 2: [[-0.31, 0], [0.31, 0]], 3: [[-0.31, -0.12], [0.31, -0.12], [0, 0.16]], 4: [[-0.31, -0.14], [0.31, -0.14], [-0.31, 0.16], [0.31, 0.16]] };
  const baseGeo = new THREE.CylinderGeometry(0.25, 0.28, 0.1, 32);
  const capGeo = new THREE.CylinderGeometry(0.2, 0.23, 0.04, 32);
  const cupGeo = new THREE.TorusGeometry(0.15, 0.03, 10, 28); // วงรองลูกแก้ว

  /* ---------- กล้อง ---------- */
  const ELEV = 33 * Math.PI / 180; // ต่ำพอเห็นหน้าผาเป็นชั้น ๆ แต่ยังอ่านเลขบนช่องได้
  const dir = new THREE.Vector3(0, Math.sin(ELEV), Math.cos(ELEV));
  const target = new THREE.Vector3(0, 1.8, -3.6);
  const ortho = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  const camera = ortho; // กล้องตรง: ทุกชั้นขนาดเท่ากัน อ่านเลขจากหลังห้องได้
  const bounds = new THREE.Box3(new THREE.Vector3(-(HALF + sideW(0) + 0.5), GROUND - 0.5, -4 * D - 1.6), new THREE.Vector3(HALF + sideW(0) + 0.5, yTop(4) + 1.5, D / 2 + 0.6));
  function frameCamera(cam, aspect, margin = 1.03) {
    cam.position.copy(target).addScaledVector(dir, 30); cam.lookAt(target); cam.updateMatrixWorld();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      const v = new THREE.Vector3(x, y, z).applyMatrix4(cam.matrixWorldInverse);
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x); minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    let hw = (maxX - minX) / 2 * margin, hh = (maxY - minY) / 2 * margin;
    if (hw / hh > aspect) hh = hw / aspect; else hw = hh * aspect;
    return { cx, cy, hw, hh };
  }


  // หิ่งห้อย + แสงเรืองเส้นชัย: จุดในโลก 3 มิติ → ตำแหน่งบนจอ (กล้องนิ่ง คำนวณใหม่แค่ตอนเปลี่ยนขนาดจอ)
  const fireflyPts = [];
  for (let t = 0; t < TIERS; t++) for (const side of [-1, 1]) for (let k = 0; k < 3; k++)
    fireflyPts.push(new THREE.Vector3(side * (HALF + sideW(t) * range(0.15, 0.9)), yTop(t) + range(0.25, 0.85), zMid(t) + range(-0.6, 0.5)));
  for (let k = 0; k < 8; k++) fireflyPts.push(new THREE.Vector3(range(-HALF, HALF), yTop(TIERS - 1) + range(0.4, 1.1), zMid(TIERS - 1) - D / 2 - range(0.1, 0.7)));
  function placeGlows(w, h) {
    const box = glowsEl;
    if (!box.children.length) {
      box.innerHTML = fireflyPts.map((_, i) => `<i style="animation-delay:${(-i * 0.73).toFixed(2)}s;animation-duration:${(2.4 + (i % 5) * 0.5).toFixed(1)}s"></i>`).join("")
        + '<i class="finglow"></i>' + lanternPts.map((_, i) => `<i class="pool"></i><i class="lamp" style="animation-delay:${-i * 0.6}s"></i>`).join("");
    }
    const toPx = (v) => { const q = warp(v.clone()).project(ortho); return [(q.x + 1) / 2 * w, (1 - q.y) / 2 * h]; };
    const els = [...box.children];
    const put = (el, v, r) => { const [x, y] = toPx(v); el.style.left = `${x}px`; el.style.top = `${y}px`; if (r) el.style.setProperty("--r", `${Math.round(w * r)}px`); };
    let k = 0;
    for (const v of fireflyPts) put(els[k++], v);
    put(els[k++], cellWorld(SIZE).add(new THREE.Vector3(0, 0.55, 0)), 0.16);
    for (const v of lanternPts) {
      put(els[k++], v.clone().add(new THREE.Vector3(0, 0.02, 0)), 0.11);  // แอ่งแสงส้มบนหญ้า
      put(els[k++], v.clone().add(new THREE.Vector3(0, 0.71, 0)), 0.065); // วงแสงรอบโคม
    }
  }

  sun.shadow.mapSize.set(2048, 2048);
  const CROWD = [[-0.31, -0.14], [0.31, -0.14], [-0.06, 0.16], [0.42, 0.2]]; // เกิน 4 คน: 3 คนสามเหลี่ยมสลับ + ป้าย +N มุมหน้าขวา

  /* ---------- สถานะ (เหมือน board-view) ---------- */
  let me = meId;
  let players = {}; // pid -> { name, emoji, color, position, offline }
  const display = new Map(); // ตำแหน่งที่แสดง (อาจต่างจากข้อมูลจริงระหว่างแอนิเมชัน)
  const moving = new Set();
  const chains = new Map();
  let held = new Set();
  const pawns = new Map(); // pid -> { obj, head, baseMat, key, placed }
  const glassCache = new Map();
  let crowd = []; // [{ pos, n, at }]
  let destroyed = false;

  function glassFor(emoji, color) {
    const key = `${emoji}|${color}`;
    if (!glassCache.has(key)) glassCache.set(key, glassTex(emoji, color));
    return glassCache.get(key);
  }
  function pawnFor(pid) {
    const p = players[pid] || {};
    const color = SAFE_COLOR.test(p.color || "") ? p.color : "#ffb300";
    const emoji = p.emoji || String(p.name || "?").charAt(0);
    let pw = pawns.get(pid);
    if (!pw) {
      const g = new THREE.Group();
      g.userData.dynamic = true;
      const baseMat = std(color, { roughness: 0.45 });
      const base = mesh(baseGeo, baseMat); base.position.y = 0.05; g.add(base);
      const capM = mesh(capGeo, std(0xffffff, { roughness: 0.35 })); capM.position.y = 0.12; g.add(capM);
      const cupM = mesh(cupGeo, std(0xffffff, { roughness: 0.35 })); cupM.rotation.x = Math.PI / 2; cupM.position.y = 0.15; g.add(cupM);
      const head = new THREE.Sprite(new THREE.SpriteMaterial({ toneMapped: false, depthTest: false, transparent: true }));
      head.scale.set(0.62, 0.62, 1);
      head.userData.head = true;
      board.add(g); overlay.add(head);
      pw = { obj: g, head, baseMat, key: null, placed: false };
      pawns.set(pid, pw);
    }
    const key = `${emoji}|${color}|${p.offline ? 1 : 0}`;
    if (pw.key !== key) {
      pw.head.material.map = glassFor(emoji, color);
      pw.head.material.opacity = p.offline ? 0.45 : 1; // หลุด: ลูกแก้วจาง ฐานเทา
      pw.head.material.needsUpdate = true;
      pw.baseMat.color.set(p.offline ? "#9a9aa8" : color);
      pw.key = key;
    }
    return pw;
  }

  function spotPoint(pos, spot) {
    const c = cellWorld(pos);
    return warp(new THREE.Vector3(c.x + 0.08 + spot[0], c.y, c.z - TILE_D * 0.1 + spot[1] + (pos === SIZE ? 0.14 : 0)));
  }
  // คนในช่องเดียวกัน: ไม่เกิน 4 คนแสดงครบ / เกิน 4 แสดง 3 คน + ป้าย "+N" (หมากของฉันอยู่ใน 3 คนนั้นและอยู่หน้าสุดเสมอ)
  function cellLayout(pids) {
    const mine = pids.includes(me) ? me : null;
    const others = pids.filter((x) => x !== mine);
    const room = pids.length > 4 ? 3 : pids.length;
    const shown = [...others.slice(0, room - (mine ? 1 : 0)), ...(mine ? [mine] : [])];
    const hidden = pids.length - shown.length;
    return { shown, hidden, spots: hidden ? CROWD : SLOTS[Math.max(shown.length, 1)] };
  }
  function layout(animate = true) {
    if (!built || destroyed) return;
    for (const [pid, pw] of pawns) {
      if (!players[pid]) { board.remove(pw.obj); overlay.remove(pw.head); pawns.delete(pid); }
    }
    const groups = new Map();
    for (const pid of Object.keys(players)) {
      if (moving.has(pid)) continue;
      const pos = display.get(pid) ?? players[pid].position;
      if (!groups.has(pos)) groups.set(pos, []);
      groups.get(pos).push(pid);
    }
    crowd = [];
    for (const [pos, pids] of groups) {
      const L = cellLayout(pids);
      for (const pid of pids) {
        const pw = pawnFor(pid);
        const k = L.shown.indexOf(pid);
        pw.obj.visible = k >= 0;
        if (k < 0) continue;
        const target = spotPoint(pos, L.spots[k]);
        if (animate && pw.placed && pw.obj.position.distanceTo(target) > 0.01) slide(pw, target);
        else pw.obj.position.copy(target);
        pw.placed = true;
      }
      if (L.hidden) crowd.push({ pos, n: L.hidden, at: spotPoint(pos, CROWD[3]) });
    }
    for (const pid of moving) pawnFor(pid).obj.visible = true;
    requestRender();
  }
  // เลื่อนหมากที่ยืนอยู่ไปตำแหน่งใหม่ในช่อง (ตอนมีคนมาเพิ่ม/ออก) แบบนุ่ม ๆ
  function slide(pw, target) {
    const from = pw.obj.position.clone(), token = {};
    pw.slideToken = token;
    tween(220, (k) => { if (pw.slideToken === token) pw.obj.position.lerpVectors(from, target, ease(k)); });
  }

  /* ---------- วาด (เฉพาะตอนมีอะไรเปลี่ยน) ---------- */
  let needRender = false;
  const tweens = new Set();
  function requestRender() {
    if (needRender || destroyed) return;
    needRender = true;
    requestAnimationFrame(frame);
  }
  function tween(ms, fn) {
    if (document.hidden || REDUCED || ms <= 0) { fn(1); requestRender(); return Promise.resolve(); }
    return new Promise((done) => { tweens.add({ start: performance.now(), dur: ms, fn, done }); requestRender(); });
  }
  function frame(now) {
    needRender = false;
    if (destroyed) return;
    for (const tw of [...tweens]) {
      const k = Math.min(1, (now - tw.start) / tw.dur);
      tw.fn(k);
      if (k >= 1) { tweens.delete(tw); tw.done(); }
    }
    draw();
    if (tweens.size) requestRender();
  }
  const toPx = (v) => {
    const q = v.clone().project(ortho);
    return [(q.x + 1) / 2 * root.clientWidth, (1 - q.y) / 2 * root.clientHeight];
  };
  function draw() {
    for (const pw of pawns.values()) {
      pw.head.position.set(pw.obj.position.x, pw.obj.position.y + HEAD_Y, pw.obj.position.z);
      pw.head.visible = pw.obj.visible;
    }
    // หัวที่อยู่ใกล้กล้องวาดทีหลัง ให้ทับหัวด้านหลัง
    [...pawns.values()].sort((a, b) => a.obj.position.z - b.obj.position.z).forEach((pw, i) => (pw.head.renderOrder = 10 + i));
    // หมากของฉัน (จอนักเรียน): แสงเรืองรอบลูกแก้ว เป็น DOM จึงหายใจได้โดยไม่ต้องวาดฉากใหม่
    const mine = me && pawns.get(me);
    meGlowEl.hidden = !mine || !mine.obj.visible;
    if (!meGlowEl.hidden) {
      const [x, y] = toPx(mine.head.position);
      meGlowEl.style.left = `${x}px`; meGlowEl.style.top = `${y}px`;
      meGlowEl.style.setProperty("--d", `${Math.round(0.62 * root.clientWidth / (ortho.right - ortho.left))}px`);
    }
    marksEl.querySelectorAll(".b3-crowd").forEach((el) => el.remove());
    for (const c of crowd) {
      const [x, y] = toPx(c.at.clone().add(new THREE.Vector3(0.06, 0.02, 0.1)));
      marksEl.insertAdjacentHTML("beforeend", `<span class="b3-crowd" style="left:${x}px;top:${y}px">+${c.n}</span>`);
    }
    renderer.autoClear = false;
    renderer.clear();
    renderer.render(scene, camera);
    renderer.clearDepth();
    renderer.render(overlay, camera);
    renderer.autoClear = true;
  }
  function fit() {
    const w = root.clientWidth, h = root.clientHeight;
    if (!w || !h || destroyed) return;
    renderer.setSize(w, h, false);
    const { cx, cy, hw, hh } = frameCamera(ortho, w / h);
    Object.assign(ortho, { left: cx - hw, right: cx + hw, top: cy + hh, bottom: cy - hh });
    ortho.updateProjectionMatrix();
    if (built) placeGlows(w, h);
    requestRender();
  }
  const ro = new ResizeObserver(fit);
  ro.observe(root);
  const onVisible = () => !document.hidden && requestRender();
  document.addEventListener("visibilitychange", onVisible);

  function onBuilt() {
    built = true;
    layout(false);
    fit();
    markReady();
  }

  /* ---------- popover: รายชื่อคนในช่อง (กดที่ช่องที่มีหลายคน) ---------- */
  let pop = null;
  const closePop = () => { pop?.remove(); pop = null; };
  renderer.domElement.addEventListener("click", (e) => {
    closePop();
    if (!built) return;
    const r = root.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    let best = null, bestD = Infinity;
    for (let n = 1; n <= SIZE; n++) {
      const [x, y] = toPx(warp(cellWorld(n)));
      const d = Math.hypot(x - px, (y - py) * 1.4);
      if (d < bestD) { bestD = d; best = { n, x, y }; }
    }
    if (!best || bestD > r.width / 12) return;
    const here = Object.keys(players).filter((pid) => (display.get(pid) ?? players[pid].position) === best.n).map((pid) => players[pid]);
    if (here.length < 2) return;
    pop = document.createElement("div");
    pop.className = "board-pop";
    pop.style.left = `${Math.min(Math.max(best.x, 90), r.width - 90)}px`;
    pop.style.top = `${best.y}px`;
    pop.innerHTML = `<strong>ช่อง ${best.n} · ${here.length} คน</strong><ul>${here
      .map((p) => `<li>${escapeHtml(p.emoji || "")} ${escapeHtml(p.name)}</li>`).join("")}</ul>`;
    root.appendChild(pop);
    e.stopPropagation();
  });
  const onDocClick = (e) => { if (pop && !pop.contains(e.target)) closePop(); };
  document.addEventListener("click", onDocClick);

  /* ---------- แอนิเมชันการเดิน (ลำดับเหมือน board-view) ---------- */
  function float(pid, text, kind = "") {
    if (floatsOnlyForMe && pid !== me) return;
    const pw = pawns.get(pid);
    const at = pw ? pw.head.position.clone().add(new THREE.Vector3(0, 0.3, 0)) : warp(cellWorld(display.get(pid) ?? 1));
    const [x, y] = toPx(at);
    const el = document.createElement("div");
    el.className = `board-float ${kind}`;
    el.textContent = text;
    el.style.left = `${Math.min(Math.max(x, 50), root.clientWidth - 50)}px`;
    el.style.top = `${y}px`;
    root.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }
  async function hop(pid, to) {
    let pos = display.get(pid) ?? to;
    if (pos === to) return;
    const step = to > pos ? 1 : -1;
    moving.add(pid);
    layout();
    const pw = pawnFor(pid);
    pw.obj.visible = true;
    while (pos !== to) {
      const next = pos + step;
      const a = pw.obj.position.clone(), b = spotPoint(next, [0, 0]);
      const turn = cellPos(pos).tier !== cellPos(next).tier; // ขึ้น/ลงบันไดหินระหว่างชั้น กระโดดสูงกว่า
      await tween(turn ? 420 : 260, (k) => {
        pw.obj.position.lerpVectors(a, b, ease(k));
        pw.obj.position.y += Math.sin(Math.PI * k) * (turn ? 0.55 : 0.32);
      });
      pos = next;
      display.set(pid, pos);
      hooks.onStep?.(pid);
    }
    moving.delete(pid);
    layout();
  }
  async function glide(pid, entry, to) {
    const pw = pawnFor(pid);
    moving.add(pid);
    layout();
    const path = [pw.obj.position.clone(), ...(ladderPaths[entry] || []), spotPoint(to, [0, 0])];
    const lens = path.slice(1).map((q, i) => q.distanceTo(path[i]));
    const total = lens.reduce((s, x) => s + x, 0);
    await tween(1100, (k) => {
      let d = ease(k) * total, i = 0;
      while (i < lens.length - 1 && d > lens[i]) { d -= lens[i]; i++; }
      pw.obj.position.lerpVectors(path[i], path[i + 1], lens[i] ? Math.min(1, d / lens[i]) : 1);
    });
    display.set(pid, to);
    moving.delete(pid);
    layout();
  }
  async function play(ev) {
    const { pid } = ev;
    if (!players[pid]) return;
    await ready;
    if (!display.has(pid)) display.set(pid, ev.from);
    if (ev.kind === "dice") float(pid, `${diceFace(ev.roll)} ${ev.roll}`, "dice");
    else float(pid, ev.correct ? `✅ ${ev.delta >= 0 ? "+" : ""}${ev.delta}` : `❌ ${ev.delta}`, ev.correct ? "good" : "bad");
    await sleep(PAUSE_MS);
    await hop(pid, ev.landing);
    if (ev.special === "ladder" || isDrop(ev.special)) {
      const up = ev.special === "ladder";
      float(pid, up ? "🟠 ปีนบันได!" : "🟣 ร่วงบันได!", up ? "ladder" : "drop");
      hooks.onSpecial?.(pid, up ? "ladder" : "drop");
      await sleep(PAUSE_MS);
      await glide(pid, ev.landing, ev.to);
    } else if (isDrop(ev.blocked)) {
      float(pid, "🛡️ ตอบถูก ไม่ร่วง", "good");
    } else if (ev.blocked === "ladder") {
      float(pid, "ตอบผิด ปีนบันไดไม่ได้", "info");
    }
    if (ev.to >= SIZE) {
      float(pid, "🏁 เข้าเส้นชัย!", "finish");
      hooks.onFinish?.(pid);
    }
  }
  function enqueue(ev) {
    const prev = chains.get(ev.pid) || Promise.resolve();
    const next = prev
      .then(() => play(ev))
      .catch((e) => console.warn("[board3d] animation failed", e))
      .finally(() => {
        if (chains.get(ev.pid) === next) {
          chains.delete(ev.pid);
          syncIdle();
          layout();
        }
      });
    chains.set(ev.pid, next);
  }
  function syncIdle() {
    for (const [pid, p] of Object.entries(players)) {
      if (!chains.has(pid) && !held.has(pid)) display.set(pid, p.position);
    }
  }

  buildTiles();

  return {
    is3d: true,
    update(nextPlayers, { events = [], hold = new Set() } = {}) {
      players = nextPlayers || {};
      held = hold;
      for (const ev of events) {
        if (players[ev.pid] && !display.has(ev.pid)) display.set(ev.pid, ev.from);
      }
      events.forEach(enqueue);
      for (const pid of Object.keys(players)) {
        if (!display.has(pid)) display.set(pid, players[pid].position);
      }
      syncIdle();
      layout();
    },
    setBackground() {}, // รูปพื้นหลังของชุดคำถามใช้เฉพาะกระดาน 2 มิติ
    setMe(pid) {
      me = pid;
      layout(false);
    },
    isIdle() {
      return chains.size === 0;
    },
    reset() {
      players = {};
      display.clear();
      chains.clear();
      moving.clear();
      for (const pw of pawns.values()) { board.remove(pw.obj); overlay.remove(pw.head); }
      pawns.clear();
      crowd = [];
      closePop();
      requestRender();
    },
    destroy() {
      destroyed = true;
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("click", onDocClick);
      renderer.dispose();
      renderer.forceContextLoss?.();
      root.innerHTML = "";
      root.classList.remove("board3d");
    },
  };
}
