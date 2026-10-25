// แท่นรับรางวัล 3 มิติ (หน้าสรุปผลเกม): ยอดเขาลอยฟ้าแบบเดียวกับกระดาน — ลานเส้นชัยลายหมากรุก + แท่นหิน 3 ระดับ
// หมากลูกแก้วของอันดับ 1–3 ยืนบนแท่น คนอื่นยืนบนลานหญ้ารอบแท่น; ท้องฟ้าเป็น CSS ของหน้าเกม (canvas โปร่ง)
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const REDUCED = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const SAFE_COLOR = /^#[0-9a-f]{3,8}$/i;
const GROUND = -0.91;         // ฐานหน้าผาใต้ลาน (เตี้ยลง 30% ตามที่ผู้ใช้ขอ: หน้าผาสูงไปหินดูยาว)
const TOP = 0;                // ผิวหญ้าของลาน
const PLAZA_W = 7.6, PLAZA_D = 4.4, PLAZA_Z = -0.2;
// อันดับ → แท่น (x, ความสูง, สีหน้าแท่น) — 2 ซ้าย 1 กลาง 3 ขวา
const PILLARS = {
  1: { x: 0, h: 1.14, top: "#ffe7a3", edge: "#f4c34f", metal: ["#fff3b0", "#ffcc33", "#d18a00"], line: "#7a4a00" },
  2: { x: -1.42, h: 0.9, top: "#eef0fa", edge: "#c9cde0", metal: ["#ffffff", "#c8cede", "#8a93ad"], line: "#3f4660" },
  3: { x: 1.42, h: 0.66, top: "#ffdcc2", edge: "#e9a77a", metal: ["#ffd9b8", "#e08a4c", "#9c4f1c"], line: "#5a2a08" },
};
const PILLAR_W = 1.24, PILLAR_D = 1.12, PILLAR_Z = -0.55;
const HEAD_Y = 0.42;
const CROWD_MAX = 8;

const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const easeOutBack = (k) => 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);

// pixelRatio: ความละเอียดภาพ, crop: ตัดขอบข้างเกาะออก (สัดส่วน 0–0.5 ต่อข้าง หรือฟังก์ชัน) — มือถือจอแคบให้แท่นใหญ่ขึ้น
export function createPodium3D(root, { pixelRatio = null, crop = 0 } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (e) {
    console.warn("[podium3d] WebGL not available", e);
    return null;
  }
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(pixelRatio || Math.min(globalThis.devicePixelRatio || 1, 2));
  root.classList.add("podium3d");
  root.innerHTML = '<div class="p3-glows"></div><div class="p3-meglow" hidden></div><div class="p3-labels"></div>';
  root.prepend(renderer.domElement);
  const glowsEl = root.querySelector(".p3-glows");
  const labelsEl = root.querySelector(".p3-labels");
  const meGlowEl = root.querySelector(".p3-meglow");
  let meId = null;

  const scene = new THREE.Scene();
  const overlay = new THREE.Scene(); // ลูกแก้ว/ประกาย วาดทับทีหลัง อยู่บนสุดเสมอ
  let destroyed = false;

  /* ---------- เครื่องมือ (ชุดเดียวกับกระดาน) ---------- */
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  function canvasTex(w, h, draw) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    return t;
  }
  let seed = 23;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const range = (a, b) => a + rnd() * (b - a);
  function roundRect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra });
  const mesh = (geo, material, shadow = true) => {
    const m = new THREE.Mesh(geo, material);
    m.castShadow = shadow; m.receiveShadow = true;
    return m;
  };

  /* ---------- แสง (เหมือนกระดาน: หัวค่ำส้มพีช + เงาม่วง) ---------- */
  scene.add(new THREE.HemisphereLight(0xc0c2ff, 0x5a3f96, 1.35));
  const sun = new THREE.DirectionalLight(0xffc49a, 2.35);
  sun.position.set(-5.5, 10, 8);
  sun.target.position.set(0, 0.4, -0.6);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.025; sun.shadow.radius = 4;
  const rim = new THREE.DirectionalLight(0xb9a2ff, 1.5); rim.position.set(4, 6, -12);
  const fill = new THREE.DirectionalLight(0xa7b0ff, 0.65); fill.position.set(7, 4, 10);
  scene.add(sun, sun.target, rim, fill);

  /* ---------- วัสดุ ---------- */
  const rockCanvas = (base, dark, light) => (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    let sd = 3; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 70; i++) {
      const x = r() * w, y = r() * h, rw = 22 + r() * 34, rh = 16 + r() * 22;
      const gr = g.createRadialGradient(x - rw * 0.2, y - rh * 0.3, 2, x, y, rw);
      gr.addColorStop(0, light); gr.addColorStop(1, dark);
      g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rw / 2, rh / 2, (r() - 0.5) * 0.5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "rgba(40,38,44,.35)"; g.lineWidth = 2.5; g.stroke();
    }
  };
  const cliffTex = canvasTex(256, 256, rockCanvas("#76747c", "#68666e", "#8c8a92"));
  cliffTex.wrapS = cliffTex.wrapT = THREE.RepeatWrapping; cliffTex.repeat.set(1.3, 0.8);
  const grassTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#4fcf6e"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { g.fillStyle = rnd() < 0.5 ? "rgba(30,150,70,.35)" : "rgba(170,255,170,.38)"; g.fillRect(rnd() * w, rnd() * h, 2, 5); }
  });
  grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping; grassTex.repeat.set(3, 2);
  const M = {
    cliff: std(0xffffff, { map: cliffTex, bumpMap: cliffTex, bumpScale: 2.5, roughness: 0.95, emissive: 0x111014 }),
    grass: std(0xffffff, { map: grassTex, roughness: 0.9 }),
    rock: std(0xffffff, { flatShading: true, roughness: 0.9, emissive: 0x111014 }),
    boulder: std(0x7c7a80, { flatShading: true, roughness: 0.9, emissive: 0x111014 }),
    trunk: std(0x8a5a3c), leafA: std(0x33c26f, { roughness: 0.7 }), leafB: std(0x23a65e, { roughness: 0.7 }), pine: std(0x1d8f56, { flatShading: true }),
    gold: std(0xffc93c, { metalness: 0.35, roughness: 0.3, emissive: 0x5a3b00, side: THREE.DoubleSide }),
    arch: std(0xff9a3c, { roughness: 0.5 }),
    lampPost: std(0x4a3426, { roughness: 0.8 }), lampCap: std(0x3a2a20, { roughness: 0.7, flatShading: true }),
    lampGlass: std(0xffd890, { emissive: 0xffa640, emissiveIntensity: 1.8, roughness: 0.4 }),
  };

  const world = new THREE.Group();
  scene.add(world);

  /* ---------- เกาะลอย: ลานหญ้า + หน้าผาหิน + หินเรียวลงใต้ฐาน ---------- */
  const fronts = []; // หน้าผาไว้แปะหิน { x0, x1, z, y0, y1 }
  {
    for (let x = -PLAZA_W / 2; x < PLAZA_W / 2 - 0.02;) {
      let w = range(0.5, 0.85);
      if (PLAZA_W / 2 - (x + w) < 0.3) w = PLAZA_W / 2 - x;
      const off = range(-0.14, 0.08), front = PLAZA_Z + PLAZA_D / 2 + off, back = PLAZA_Z - PLAZA_D / 2;
      const cx = x + w / 2, cz = (front + back) / 2, d = front - back;
      const body = mesh(new RoundedBoxGeometry(w + 0.03, TOP - GROUND - 0.1, d, 3, 0.12), M.cliff);
      body.position.set(cx, (TOP + GROUND) / 2 - 0.05, cz); world.add(body);
      const cap = mesh(new RoundedBoxGeometry(w + 0.08, 0.16, d + 0.08, 3, 0.07), M.grass);
      cap.position.set(cx, TOP - 0.08, cz + 0.02); world.add(cap);
      fronts.push({ x0: x, x1: x + w, z: front, y0: GROUND, y1: TOP - 0.16 });
      x += w;
    }
    // ไหล่เกาะซ้าย/ขวาไม่เป็นเส้นตรง
    for (const side of [-1, 1]) {
      for (let z = PLAZA_Z + PLAZA_D / 2 - 0.1; z > PLAZA_Z - PLAZA_D / 2 + 0.2;) {
        const dep = range(0.5, 0.8), out = range(0.05, 0.3), drop = rnd() < 0.5 ? 0 : range(0.06, 0.18);
        const w = out + 0.35, cx = side * (PLAZA_W / 2 + out - w / 2), cz = z - dep / 2;
        const hb = TOP - drop - 0.1 - GROUND;
        const body = mesh(new RoundedBoxGeometry(w, hb, dep + 0.05, 3, 0.14), M.cliff); body.position.set(cx, GROUND + hb / 2, cz); world.add(body);
        const cap = mesh(new RoundedBoxGeometry(w + 0.06, 0.16, dep + 0.08, 3, 0.07), M.grass); cap.position.set(cx + side * 0.02, TOP - drop - 0.08, cz); world.add(cap);
        z -= dep;
      }
    }
  }
  // หินบนหน้าผา (instanced) — ไม่มีหินลอยใต้เกาะ (ผู้ใช้ให้เอาออก)
  {
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) * range(0.85, 1.12), pos.getY(i) * range(0.85, 1.12), pos.getZ(i) * range(0.85, 1.12));
    geo.computeVertexNormals();
    const items = [];
    // หน้าผาหน้า: หินแท่งสูงเต็มหน้าผาแถวเดียวเรียงชิด + ก้อนแคบอุดซอกด้านหลัง (ไม่ยื่นออกมาซ้อนเป็นสองแถว)
    for (const f of fronts) {
      const hgt = f.y1 - f.y0;
      for (let x = f.x0 + 0.12; x < f.x1 - 0.04; x += range(0.25, 0.3)) {
        items.push([x, f.y0 + hgt * 0.5, f.z + range(0, 0.03), range(0.2, 0.24), hgt * range(0.47, 0.52), range(0.12, 0.15), true]);
        items.push([x + 0.14, f.y0 + hgt * 0.5, f.z - 0.05, range(0.12, 0.15), hgt * range(0.4, 0.46), 0.08, true]);
      }
    }
    // ไหล่เกาะซ้าย/ขวา: หินเรียงตามผนังข้าง
    for (const side of [-1, 1]) {
      for (let z = PLAZA_Z + PLAZA_D / 2; z > PLAZA_Z - PLAZA_D / 2 + 0.3; z -= range(0.26, 0.32)) {
        for (let y = GROUND + 0.2; y < TOP - 0.2; y += range(0.28, 0.34)) {
          const r = range(0.15, 0.21);
          items.push([side * (PLAZA_W / 2 + range(0.28, 0.4)), y, z, range(0.1, 0.14), r, r * range(0.9, 1.15), true]);
        }
      }
    }
    const inst = new THREE.InstancedMesh(geo, M.rock, items.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
    items.forEach(([x, y, z, a, b, c, upright], i) => {
      q.setFromEuler(upright ? e.set(range(-0.06, 0.06), range(0, 6.28), range(-0.06, 0.06)) : e.set(range(-0.4, 0.4), range(0, 6.28), range(-0.3, 0.3)));
      m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(a, b, c));
      inst.setMatrixAt(i, m4);
      inst.setColorAt(i, col.setHSL(0.08 + range(-0.03, 0.03), range(0.03, 0.08), upright ? range(0.42, 0.54) : range(0.37, 0.49)));
    });
    inst.castShadow = true; inst.receiveShadow = true;
    world.add(inst);
  }

  /* ---------- ลานเส้นชัยลายหมากรุก (แบบช่อง 30) ---------- */
  const checker = canvasTex(256, 256, (g, w) => {
    g.fillStyle = "#c9f1d8"; g.fillRect(0, 0, w, w);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2) { g.fillStyle = "#8fd6ab"; g.fillRect(x * 32, y * 32, 32, 32); }
  });
  checker.wrapS = checker.wrapT = THREE.RepeatWrapping; checker.repeat.set(3, 1.6);
  {
    const slab = mesh(new RoundedBoxGeometry(5.0, 0.16, 2.6, 3, 0.06), [std(0x74c896, { roughness: 0.7 }), std(0x74c896, { roughness: 0.7 }), std(0xffffff, { map: checker, roughness: 0.55 }), std(0x74c896), std(0x74c896, { roughness: 0.7 }), std(0x74c896, { roughness: 0.7 })]);
    slab.position.set(0, TOP + 0.08, PILLAR_Z + 0.15);
    world.add(slab);
  }
  const SLAB_TOP = TOP + 0.16;

  /* ---------- แท่นหิน 3 ระดับ: หินซ้อนชั้น ผิวบนสีเหรียญ เลขสลักหน้าแท่น ---------- */
  const tileSide = std(0xa699dc, { roughness: 0.75 });
  const pillarTex = canvasTex(256, 256, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#c2b6f2"); gr.addColorStop(1, "#9e90d6");
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) { c.fillStyle = `rgba(70,50,140,${range(0.05, 0.12)})`; c.beginPath(); c.arc(rnd() * w, rnd() * h, range(1.5, 4), 0, Math.PI * 2); c.fill(); }
    for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(255,255,255,${range(0.06, 0.14)})`; c.beginPath(); c.arc(rnd() * w, rnd() * h, range(1, 3), 0, Math.PI * 2); c.fill(); }
  });
  const pillarMat = std(0xffffff, { map: pillarTex, bumpMap: pillarTex, bumpScale: 1.2, roughness: 0.7 });
  const pillarGroups = {};
  for (const [rank, P] of Object.entries(PILLARS)) {
    const g = new THREE.Group();
    g.position.set(P.x, SLAB_TOP, PILLAR_Z);
    const block = mesh(new RoundedBoxGeometry(PILLAR_W, P.h, PILLAR_D, 4, 0.09), pillarMat);
    block.position.y = P.h / 2;
    g.add(block);
    // ผิวบนสีเหรียญ (ทอง/เงิน/ทองแดง) ขอบนูนแบบแผ่นหิน
    const topTex = canvasTex(128, 128, (c, w, h) => {
      const gr = c.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.72);
      gr.addColorStop(0, P.top); gr.addColorStop(1, P.edge); c.fillStyle = gr; c.fillRect(0, 0, w, h);
    });
    const topMat = std(0xffffff, { map: topTex, roughness: 0.5, emissive: 0xffffff, emissiveMap: topTex, emissiveIntensity: 0.18 });
    const top = mesh(new RoundedBoxGeometry(PILLAR_W + 0.06, 0.1, PILLAR_D + 0.06, 3, 0.04), [tileSide, tileSide, topMat, tileSide, tileSide, tileSide]);
    top.position.y = P.h + 0.03;
    g.add(top);
    // เลขสลักหน้าแท่น (สไตล์เดียวกับเลขบนช่อง)
    // เลขโลหะ: ไล่สีทอง/เงิน/ทองแดง + ขอบเข้ม + ไฮไลต์ขาว → อ่านอันดับได้จากหลังห้อง
    const ls = 0.62; // ขนาดเดียวกันทุกแท่น — แท่น 3 (เตี้ยสุด) สูงพอให้เลขอยู่ในหน้าแท่นทั้งตัว
    const label = new THREE.Mesh(new THREE.PlaneGeometry(ls, ls), new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, map: canvasTex(160, 160, (c) => {
      c.font = '128px "Lilita One","Arial Rounded MT Bold",sans-serif'; c.textAlign = "center"; c.textBaseline = "middle";
      c.lineJoin = "round";
      c.lineWidth = 14; c.strokeStyle = P.line; c.strokeText(rank, 80, 90);
      const gr = c.createLinearGradient(0, 30, 0, 140);
      gr.addColorStop(0, P.metal[0]); gr.addColorStop(0.45, P.metal[1]); gr.addColorStop(1, P.metal[2]);
      c.fillStyle = gr; c.fillText(rank, 80, 90);
      c.lineWidth = 3; c.strokeStyle = "rgba(255,255,255,.7)"; c.strokeText(rank, 78, 87);
    }) }));
    label.position.set(0, P.h * 0.5, PILLAR_D / 2 + 0.006);
    g.add(label);
    g.scale.y = 0.001; // ยกขึ้นตอนเปิดตัว
    world.add(g);
    pillarGroups[rank] = g;
  }

  /* ---------- ซุ้ม FINISH ด้านหลังแท่น ---------- */
  const ARCH_H = 3.05, CUP_DX = 0.36;
  let cup;
  {
    const z = PILLAR_Z - 0.95;
    for (const dx of [-2.25, 2.25]) {
      const post = mesh(new RoundedBoxGeometry(0.16, ARCH_H, 0.16, 2, 0.04), M.arch);
      post.position.set(dx, SLAB_TOP + ARCH_H / 2, z); world.add(post);
    }
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(4.9, 0.62), new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, map: canvasTex(640, 82, (g) => {
      roundRect(g, 4, 4, 632, 74, 30); g.fillStyle = "#FFA240"; g.fill(); g.lineWidth = 7; g.strokeStyle = "#fff"; g.stroke();
      g.font = '58px "Lilita One",sans-serif'; g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("FINISH", 320, 46);
    }) }));
    banner.position.set(0, SLAB_TOP + ARCH_H, z + 0.1); banner.rotation.x = -0.12;
    world.add(banner);
    // ถ้วยทองตั้งบนแท่นที่ 1 ข้างหมาก (โผล่ตอนแท่นยกขึ้นเสร็จ)
    cup = mesh(new THREE.LatheGeometry([
      new THREE.Vector2(0.0, 0), new THREE.Vector2(0.12, 0), new THREE.Vector2(0.12, 0.03), new THREE.Vector2(0.035, 0.06),
      new THREE.Vector2(0.035, 0.15), new THREE.Vector2(0.14, 0.2), new THREE.Vector2(0.16, 0.36), new THREE.Vector2(0.14, 0.37),
    ], 24), M.gold);
    cup.position.set(CUP_DX, SLAB_TOP + PILLARS[1].h + 0.08, PILLAR_Z - 0.1); cup.scale.setScalar(1.25);
    cup.visible = false;
    world.add(cup);
    const finLight = new THREE.PointLight(0xffc56b, 6, 4.5, 1.6);
    finLight.position.set(0, SLAB_TOP + 2.0, PILLAR_Z + 0.5);
    scene.add(finLight);
  }

  /* ---------- ต้นไม้ พุ่มไม้ หิน ตะเกียง รอบลาน ---------- */
  function roundTree(x, z, s) {
    const g = new THREE.Group();
    const trunk = mesh(new THREE.CylinderGeometry(0.05 * s, 0.075 * s, 0.32 * s, 8), M.trunk); trunk.position.y = 0.16 * s; g.add(trunk);
    for (const [bx, by, bz, r] of [[0, 0.5, 0, 0.27], [-0.14, 0.4, 0.05, 0.19], [0.15, 0.42, -0.02, 0.2], [0.02, 0.7, 0, 0.19]]) {
      const b = mesh(new THREE.IcosahedronGeometry(r * s, 1), rnd() < 0.5 ? M.leafA : M.leafB); b.position.set(bx * s, by * s, bz * s); g.add(b);
    }
    g.position.set(x, TOP, z); world.add(g);
  }
  function pineTree(x, z, s) {
    const g = new THREE.Group();
    const trunk = mesh(new THREE.CylinderGeometry(0.045 * s, 0.065 * s, 0.25 * s, 7), M.trunk); trunk.position.y = 0.12 * s; g.add(trunk);
    [[0.3, 0.48, 0.42], [0.23, 0.4, 0.7], [0.15, 0.3, 0.93]].forEach(([r, h, yy]) => {
      const c = mesh(new THREE.ConeGeometry(r * s, h * s, 8), M.pine); c.position.y = yy * s; g.add(c);
    });
    g.position.set(x, TOP, z); world.add(g);
  }
  function bush(x, z, s) {
    for (const [bx, bz, r] of [[0, 0, 0.16], [0.14, 0.03, 0.12], [-0.13, 0.02, 0.11]]) {
      const b = mesh(new THREE.IcosahedronGeometry(r * s, 1), M.leafA); b.position.set(x + bx * s, TOP + r * s * 0.7, z + bz * s); world.add(b);
    }
  }
  function boulder(x, z, r) {
    const b = mesh(new THREE.DodecahedronGeometry(r, 0), M.boulder); b.position.set(x, TOP + r * 0.45, z); b.rotation.set(0.4, x * 3, 0.2); world.add(b);
  }
  const lampPts = [];
  function lantern(x, z) {
    const p1 = mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.62, 8), M.lampPost); p1.position.set(x, TOP + 0.31, z); world.add(p1);
    const head = mesh(new THREE.BoxGeometry(0.15, 0.18, 0.15), M.lampGlass, false); head.position.set(x, TOP + 0.71, z); world.add(head);
    const top = mesh(new THREE.ConeGeometry(0.13, 0.11, 4), M.lampCap); top.rotation.y = Math.PI / 4; top.position.set(x, TOP + 0.855, z); world.add(top);
    lampPts.push(new THREE.Vector3(x, TOP + 0.71, z));
  }
  // แนวหลัง: ต้นไม้ใหญ่สลับสน + หิน (ไม่บังซุ้ม FINISH ตรงกลาง)
  const backZ = PLAZA_Z - PLAZA_D / 2 + 0.35;
  for (const [x, kind, s] of [[-3.4, "pine", 1.35], [-2.85, "round", 1.25], [-3.2, "bush", 1], [2.85, "round", 1.3], [3.4, "pine", 1.4], [3.15, "bush", 1]]) {
    const z = backZ + (kind === "bush" ? 0.55 : 0);
    if (kind === "pine") pineTree(x, z, s); else if (kind === "round") roundTree(x, z, s); else bush(x, z, s);
  }
  for (const x of [-1.6, -0.6, 0.6, 1.6]) bush(x, backZ - 0.05, range(0.8, 1.05));
  for (const x of [-1.1, 1.1]) roundTree(x, backZ - 0.25, range(0.95, 1.1));
  // ข้างลาน: หิน พุ่ม ต้นไม้เตี้ย ตะเกียงหน้ามุม
  boulder(-3.35, 0.35, 0.26); bush(-3.0, 0.75, 0.9); roundTree(-3.45, -0.55, 1.0);
  boulder(3.3, 0.4, 0.24); bush(3.0, 0.8, 0.85); pineTree(3.5, -0.6, 1.05);
  lantern(-2.7, 1.3); lantern(2.7, 1.3);
  boulder(-1.9, 1.55, 0.13); boulder(2.05, 1.6, 0.11); bush(-2.3, 1.6, 0.6); bush(2.35, 1.55, 0.55);
  // ประกายรอบถ้วย
  const sparkleMat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false, toneMapped: false, map: canvasTex(64, 64, (g) => {
    g.fillStyle = "#fff6c2"; g.beginPath();
    for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4, r = i % 2 ? 9 : 30; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
    g.closePath(); g.fill();
  }) });
  const sparkles = [];
  for (const [x, y, s] of [[0.62, 1.85, 0.16], [0.12, 2.15, 0.12], [-0.55, 1.95, 0.15], [-0.35, 1.55, 0.11], [0.75, 1.45, 0.11]]) {
    const sp = new THREE.Sprite(sparkleMat); sp.scale.set(s, s, 1); sp.position.set(x, SLAB_TOP + y, PILLAR_Z - 0.4); sp.userData.base = s; overlay.add(sp); sparkles.push(sp);
  }

  /* ---------- หมากลูกแก้ว (แบบเดียวกับกระดาน) ---------- */
  function glassTex(emoji, tint) {
    return canvasTex(256, 256, (g) => {
      const c = 128, R = 116;
      let gr = g.createRadialGradient(c - 30, c - 40, 8, c, c, R);
      gr.addColorStop(0, "rgba(255,255,255,.62)"); gr.addColorStop(0.72, "rgba(225,232,255,.38)"); gr.addColorStop(1, "rgba(110,98,196,.78)");
      g.fillStyle = gr; g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.fill();
      g.font = '128px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(emoji, c, c + 10);
      g.save(); g.globalAlpha = 0.5;
      gr = g.createRadialGradient(c, c + 30, R * 0.55, c, c, R);
      gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, tint);
      g.fillStyle = gr; g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.fill(); g.restore();
      g.fillStyle = "rgba(255,255,255,.35)"; g.beginPath(); g.ellipse(c - 36, c - 52, 52, 30, -0.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = "rgba(255,255,255,.9)"; g.beginPath(); g.ellipse(c - 48, c - 60, 18, 10, -0.6, 0, Math.PI * 2); g.fill();
      g.lineWidth = 5; g.strokeStyle = "rgba(255,255,255,.75)"; g.beginPath(); g.arc(c, c, R - 2, 0, Math.PI * 2); g.stroke();
    });
  }
  const baseGeo = new THREE.CylinderGeometry(0.25, 0.28, 0.1, 32);
  const capGeo = new THREE.CylinderGeometry(0.2, 0.23, 0.04, 32);
  const cupGeo = new THREE.TorusGeometry(0.15, 0.03, 10, 28);
  const white = std(0xffffff, { roughness: 0.35 });
  const pawns = []; // { obj, head, home: Vector3, rank, id, scale }
  function makePawn(p, home, scale = 1) {
    const color = SAFE_COLOR.test(p.color || "") ? p.color : "#ffb300";
    const g = new THREE.Group();
    const base = mesh(baseGeo, std(color, { roughness: 0.45 })); base.position.y = 0.05; g.add(base);
    const cap = mesh(capGeo, white); cap.position.y = 0.12; g.add(cap);
    const ring = mesh(cupGeo, white); ring.rotation.x = Math.PI / 2; ring.position.y = 0.15; g.add(ring);
    g.scale.setScalar(scale);
    g.position.copy(home);
    const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: glassTex(p.emoji || "❔", color), toneMapped: false, depthTest: false, transparent: true }));
    head.scale.set(0.62 * scale, 0.62 * scale, 1);
    world.add(g); overlay.add(head);
    return { obj: g, head, home: home.clone(), scale };
  }
  const crownMat = new THREE.SpriteMaterial({ transparent: true, depthTest: false, toneMapped: false, map: canvasTex(128, 96, (g) => {
    g.lineJoin = "round"; g.beginPath();
    g.moveTo(14, 80); g.lineTo(8, 26); g.lineTo(38, 52); g.lineTo(64, 12); g.lineTo(90, 52); g.lineTo(120, 26); g.lineTo(114, 80); g.closePath();
    const gr = g.createLinearGradient(0, 12, 0, 84); gr.addColorStop(0, "#fff3b0"); gr.addColorStop(0.5, "#ffcc33"); gr.addColorStop(1, "#d18a00");
    g.fillStyle = gr; g.fill(); g.lineWidth = 6; g.strokeStyle = "#7a4a00"; g.stroke();
    for (const [x, y, c] of [[64, 60, "#e5396b"], [36, 64, "#3d8bff"], [92, 64, "#3d8bff"]]) { g.fillStyle = c; g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill(); }
    for (const [x, y] of [[8, 26], [64, 12], [120, 26]]) { g.fillStyle = "#fff3b0"; g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill(); g.lineWidth = 3; g.stroke(); }
  }) });
  let crown = null;
  function clearPawns() {
    if (crown) { overlay.remove(crown); crown = null; }
    if (cup) cup.visible = false;
    for (const pw of pawns) { world.remove(pw.obj); overlay.remove(pw.head); pw.head.material.map?.dispose(); pw.head.material.dispose(); }
    pawns.length = 0;
    labelsEl.innerHTML = "";
  }

  /* ---------- กล้องตรง (orthographic) มุมเดียวกับกระดาน ---------- */
  const ELEV = 33 * Math.PI / 180;
  const dir = new THREE.Vector3(0, Math.sin(ELEV), Math.cos(ELEV));
  const target = new THREE.Vector3(0, 0.75, -0.4);
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  // ตัดใต้เกาะออกเกือบหมด (แค่ให้เห็นว่าลอยอยู่) → แท่นใหญ่ขึ้น
  const bounds = new THREE.Box3(new THREE.Vector3(-PLAZA_W / 2 - 0.2, GROUND - 0.2, PLAZA_Z - PLAZA_D / 2), new THREE.Vector3(PLAZA_W / 2 + 0.2, SLAB_TOP + 3.3, PLAZA_Z + PLAZA_D / 2 + 0.2));
  function frameCamera(aspect) {
    camera.position.copy(target).addScaledVector(dir, 30); camera.lookAt(target); camera.updateMatrixWorld();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      const v = new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x); minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
    }
    const side = typeof crop === "function" ? crop() : crop;
    const cw = maxX - minX; minX += cw * side; maxX -= cw * side;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    let hw = (maxX - minX) / 2 * 1.02, hh = (maxY - minY) / 2 * 1.02;
    if (hw / hh > aspect) hh = hw / aspect; else hw = hh * aspect;
    Object.assign(camera, { left: cx - hw, right: cx + hw, top: cy + hh, bottom: cy - hh });
    camera.updateProjectionMatrix();
  }
  const toPx = (v) => {
    const q = v.clone().project(camera);
    return [(q.x + 1) / 2 * root.clientWidth, (1 - q.y) / 2 * root.clientHeight];
  };

  /* ---------- วาด (เฉพาะตอนมีอะไรขยับ) ---------- */
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
  const sleep = (ms) => (document.hidden || REDUCED ? Promise.resolve() : new Promise((r) => setTimeout(r, ms)));
  let sparkleT0 = performance.now();
  function frame(now) {
    needRender = false;
    if (destroyed) return;
    for (const tw of [...tweens]) {
      const k = Math.min(1, (now - tw.start) / tw.dur);
      tw.fn(k);
      if (k >= 1) { tweens.delete(tw); tw.done(); }
    }
    const t = (now - sparkleT0) / 1000;
    sparkles.forEach((sp, i) => { const s = sp.userData.base * (0.75 + 0.35 * Math.sin(t * 3 + i * 1.7)); sp.scale.set(s, s, 1); });
    draw();
    // ประกายกระพริบเบา ๆ ต่อเนื่อง (แค่ ~10 fps พอ ไม่กินเครื่อง)
    if (tweens.size) requestRender();
    else if (!REDUCED) setTimeout(requestRender, 100);
  }
  function draw() {
    for (const pw of pawns) pw.head.position.set(pw.obj.position.x, pw.obj.position.y + HEAD_Y * pw.scale, pw.obj.position.z);
    const champ = crown && pawns.find((p) => p.rank === 1);
    if (champ) crown.position.set(champ.obj.position.x, champ.obj.position.y + HEAD_Y + 0.4, champ.obj.position.z);
    renderer.render(scene, camera);
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(overlay, camera);
    renderer.autoClear = true;
    placeLabels();
  }
  function placeLabels() {
    for (const el of labelsEl.children) {
      const pw = pawns[+el.dataset.i];
      if (!pw) continue;
      // ผู้ชนะ: ป้ายเหนือหัว (ไม่โดนใครบัง) / คนอื่น: ป้ายเล็กใต้ฐาน
      const anchor = el.dataset.at === "front"
        ? new THREE.Vector3(pw.obj.position.x, pw.obj.position.y + HEAD_Y + (pw.rank === 1 ? 0.66 : 0.4), pw.obj.position.z)
        : new THREE.Vector3(pw.obj.position.x, pw.obj.position.y, pw.obj.position.z + 0.3);
      const [x, y] = toPx(anchor);
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, ${el.dataset.at === "front" ? "-100%" : "0"})`;
    }
    // หมากของฉัน (จอนักเรียน): วงแสงเรืองนุ่มแบบเดียวกับบนกระดาน
    const mine = meId && pawns.find((p) => p.id === meId && p.obj.visible);
    meGlowEl.hidden = !mine;
    if (mine) {
      const [x, y] = toPx(new THREE.Vector3(mine.obj.position.x, mine.obj.position.y + HEAD_Y * mine.scale, mine.obj.position.z));
      const d = (root.clientWidth / (camera.right - camera.left)) * 0.95 * mine.scale;
      Object.assign(meGlowEl.style, { width: `${d}px`, height: `${d}px`, transform: `translate(${x - d / 2}px, ${y - d / 2}px)` });
    }
    // แสงตะเกียง/ถ้วย (DOM)
    const [lx0, ly0] = toPx(lampPts[0]), [lx1, ly1] = toPx(lampPts[1]);
    const glows = glowsEl.children;
    if (glows.length) {
      glows[0].style.transform = `translate(${lx0}px, ${ly0}px)`;
      glows[1].style.transform = `translate(${lx1}px, ${ly1}px)`;
      const [cx, cy] = toPx(new THREE.Vector3(CUP_DX, SLAB_TOP + PILLARS[1].h + 0.35, PILLAR_Z - 0.1));
      glows[2].style.transform = `translate(${cx}px, ${cy}px)`;
    }
  }
  glowsEl.innerHTML = '<i class="lamp"></i><i class="lamp"></i><i class="cup"></i>';
  function fit() {
    const w = root.clientWidth, h = root.clientHeight;
    if (!w || !h || destroyed) return;
    renderer.setSize(w, h, false);
    frameCamera(w / h);
    glowsEl.style.setProperty("--u", `${Math.round(w / (camera.right - camera.left))}px`);
    requestRender();
  }
  const ro = new ResizeObserver(fit);
  ro.observe(root);
  fit();

  /* ---------- เปิดตัว: แท่น 3 → 2 → 1 ยกขึ้น แล้วหมากกระโดดขึ้นแท่น ---------- */
  let runId = 0;
  async function show({ standings = [], others = [], meId: mine = null } = {}) {
    const run = ++runId;
    meId = mine;
    await document.fonts?.ready?.catch?.(() => {});
    clearPawns();
    for (const g of Object.values(pillarGroups)) g.scale.y = 0.001;
    // คนอื่นยืนบนลานหน้าแท่นเป็นแนวโค้ง (ไม่เกิน CROWD_MAX ที่เหลือเป็นป้าย +N)
    const crowd = others.slice(0, CROWD_MAX);
    // สองแถวสลับกันหน้าแท่น (แถวหน้าเว้นกลาง ไม่บังเลขแท่น)
    crowd.forEach((p, i) => {
      const row = i % 2, k = Math.floor(i / 2), n = Math.ceil(crowd.length / 2);
      const a = n === 1 ? 0 : k / (n - 1) - 0.5;
      const home = new THREE.Vector3(a * (row ? 4.4 : 5.2) + (row ? 0.3 : 0), TOP, PILLAR_Z + 1.75 + row * 0.55);
      const pw = makePawn(p, home, 0.78);
      pw.id = p.id;
      pawns.push(pw);
      addLabel(pawns.length - 1, p, "", "crowd", p.id === meId);
    });
    if (others.length > CROWD_MAX) {
      const more = document.createElement("div");
      more.className = "p3-more";
      more.textContent = `+${others.length - CROWD_MAX}`;
      labelsEl.appendChild(more);
      const [x, y] = toPx(new THREE.Vector3(3.0, TOP, PILLAR_Z + 2.0));
      more.style.transform = `translate(${x}px, ${y}px)`;
    }
    const winners = [3, 2, 1].map((r) => standings.find((s) => s.rank === r)).filter(Boolean);
    for (const s of winners) {
      const P = PILLARS[s.rank];
      const home = new THREE.Vector3(P.x + (s.rank === 1 ? -0.2 : 0), SLAB_TOP + P.h + 0.08, PILLAR_Z);
      const pw = makePawn(s, home);
      pw.id = s.id; pw.rank = s.rank;
      pw.obj.visible = false; pw.head.visible = false;
      pawns.push(pw);
    }
    requestRender();
    await sleep(350);
    for (const rank of [3, 2, 1]) {
      if (run !== runId) return;
      const g = pillarGroups[rank];
      await tween(rank === 1 ? 900 : 650, (k) => { g.scale.y = Math.max(0.001, easeOutBack(k)); });
      if (rank === 1) cup.visible = true;
      const pw = pawns.find((x) => x.rank === rank);
      if (pw) {
        pw.obj.visible = true; pw.head.visible = true;
        const from = pw.home.clone().add(new THREE.Vector3(0, 1.4, 0));
        await tween(520, (k) => { pw.obj.position.lerpVectors(from, pw.home, ease(k)); pw.obj.position.y += Math.sin(Math.PI * k) * 0.25; });
        if (rank === 1) {
          crown = new THREE.Sprite(crownMat); crown.scale.set(0.36, 0.27, 1); overlay.add(crown);
          await tween(380, (k) => crown.scale.set(0.36 * easeOutBack(k), 0.27 * easeOutBack(k), 1));
        }
        // ยืนบนแท่นก็รู้อันดับแล้ว → ป้ายแค่ชื่อ
        addLabel(pawns.indexOf(pw), standings.find((s) => s.rank === rank), "", "front", pw.id === meId);
        root.dispatchEvent(new CustomEvent("podium:rank", { detail: { rank } }));
      } else {
        addEmptyLabel(rank);
      }
      await sleep(rank === 1 ? 0 : 250);
    }
    root.dispatchEvent(new CustomEvent("podium:done"));
  }
  function addLabel(i, p, title, at, mine) {
    const el = document.createElement("div");
    el.className = `p3-name ${at}${mine ? " me" : ""}`;
    el.dataset.i = i; el.dataset.at = at;
    el.innerHTML = `${title ? `<small>${title}</small>` : ""}<b></b>`;
    el.querySelector("b").textContent = p?.name || "";
    labelsEl.appendChild(el);
    requestRender();
  }
  function addEmptyLabel(rank) {
    const el = document.createElement("div");
    el.className = "p3-name front empty";
    labelsEl.appendChild(el);
    el.innerHTML = `<b>ว่าง</b>`;
    const P = PILLARS[rank];
    const [x, y] = toPx(new THREE.Vector3(P.x, SLAB_TOP + P.h + 0.5, PILLAR_Z));
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
  }
  // จุดบนจอของหมากคนหนึ่ง (ไว้วางวงแสง "หมากของฉัน")
  function pawnPoint(id) {
    const pw = pawns.find((p) => p.id === id);
    if (!pw || !pw.obj.visible) return null;
    const [x, y] = toPx(new THREE.Vector3(pw.obj.position.x, pw.obj.position.y + HEAD_Y * pw.scale, pw.obj.position.z));
    return { x, y, r: (root.clientWidth / (camera.right - camera.left)) * 0.36 * pw.scale };
  }

  return {
    show,
    pawnPoint,
    destroy() {
      destroyed = true;
      runId++;
      ro.disconnect();
      clearPawns();
      renderer.dispose();
      renderer.forceContextLoss?.();
      root.classList.remove("podium3d");
      root.innerHTML = "";
    },
  };
}
