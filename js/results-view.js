// results-view.js
// หน้าผลการเล่นย้อนหลัง: รายการเกม / ผลเกมเดียว (ภาพรวม·รายข้อ·รายคน) / ภาพรวมชุดคำถามหลายเกม — DOM ล้วน
// ตัวเลขทั้งหมดมาจาก js/results.js; app.js เป็นคนโหลด/ลบข้อมูลบน Firebase

import { escapeHtml } from "./utils.js";
import { EASY_PCT, HARD_PCT } from "./results.js";

const SAFE_TOKEN = /^#[0-9a-f]{3,8}$/i; // สีลูกแก้ว

const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const END_REASON = { winners: "จบเพราะเข้าเส้นชัยครบ", rounds: "จบเพราะเล่นครบทุกรอบ" };
const MEDALS = ["🥇", "🥈", "🥉"];

const sec = (ms) => (ms == null ? "-" : `${(ms / 1000).toFixed(1)} วิ`);
const pctText = (p) => (p == null ? "-" : `${p}%`);
const accClass = (p) => (p == null ? "" : p >= EASY_PCT ? "good" : p >= HARD_PCT ? "mid" : "bad");

function pad(n) {
  return String(n).padStart(2, "0");
}

export function formatDateTime(ms) {
  if (!ms) return "-";
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear() + 543} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const DIFF_TAG = {
  easy: `<span class="rs-tag easy">ง่าย</span>`,
  medium: `<span class="rs-tag mid">ปานกลาง</span>`,
  hard: `<span class="rs-tag hard">ยาก</span>`,
};

/* ---------- รายการเกม ---------- */

// list = listResults(), filter = setKey ที่เลือก ("all" = ทั้งหมด)
export function renderResultsList(el, list, { filter = "all", loading = false } = {}) {
  if (!el) return;
  if (loading) {
    el.innerHTML = `<p class="es-muted">กำลังโหลดผลการเล่น…</p>`;
    return;
  }
  if (!list.length) {
    el.innerHTML = `<p class="rs-empty">ยังไม่มีผลการเล่น — ผลจะถูกบันทึกอัตโนมัติเมื่อเล่นจบเกม</p>`;
    return;
  }
  const sets = new Map();
  for (const r of list) {
    const k = setKey(r);
    if (!sets.has(k)) sets.set(k, { name: r.setName || "ไม่ทราบชื่อชุด", count: 0 });
    sets.get(k).count += 1;
  }
  const shown = filter === "all" ? list : list.filter((r) => setKey(r) === filter);
  const chips = [
    `<button type="button" class="es-chip" data-rs-filter="all" aria-pressed="${filter === "all"}">ทั้งหมด (${list.length})</button>`,
    ...[...sets].map(
      ([k, s]) => `<button type="button" class="es-chip" data-rs-filter="${escapeHtml(k)}" aria-pressed="${filter === k}">${escapeHtml(s.name)} (${s.count})</button>`
    ),
  ].join("");
  const setButton =
    filter !== "all" && sets.has(filter)
      ? `<button type="button" class="es-btn es-play rs-set-btn" data-rs-set="${escapeHtml(filter)}">📈 ภาพรวมชุดนี้จาก ${sets.get(filter).count} เกม</button>`
      : "";
  el.innerHTML = `
    <div class="es-row rs-filters"><span class="es-muted">ชุดคำถาม:</span>${chips}</div>
    ${setButton}
    <div class="rs-games">${shown
      .map((r) => {
        const d = new Date(r.endedAt || r.createdAt || 0);
        return `<button type="button" class="rs-game" data-rs-open="${escapeHtml(r.key)}">
          <span class="rs-date"><b>${d.getDate()}</b><span>${MONTHS[d.getMonth()]} · ${pad(d.getHours())}:${pad(d.getMinutes())}</span></span>
          <span class="rs-game-main"><span class="nm">${escapeHtml(r.setName || "-")}</span>
            <span class="meta">ครู ${escapeHtml(r.hostName || "-")} · ${r.playerCount || 0} คน · เล่น ${r.roundsPlayed || 0}/${r.maxRounds || "-"} รอบ</span></span>
          <span class="rs-pct ${accClass(r.accuracy)}">${pctText(r.accuracy)}<small>ตอบถูกเฉลี่ย</small></span>
        </button>`;
      })
      .join("")}</div>`;
}

// ใช้ id ของชุด (ชื่ออาจถูกแก้) — ผลเก่าที่ไม่มี id ใช้ชื่อแทน
export function setKey(r) {
  return r.setId || `name:${r.setName || ""}`;
}

/* ---------- ผลเกมเดียว ---------- */

export function renderResultDetail(el, record, insights, { tab = "overview", confirmDelete = false } = {}) {
  if (!el) return;
  const o = insights.overview;
  const tabs = [
    ["overview", "ภาพรวม"],
    ["questions", "รายข้อ"],
    ["players", "รายคน"],
  ];
  const meta = [
    formatDateTime(o.endedAt),
    `ครู ${record.hostName || "-"}`,
    `${o.playerCount} คน`,
    `เล่น ${o.roundsPlayed} จาก ${o.maxRounds} รอบ`,
    END_REASON[o.endReason],
  ].filter(Boolean);
  el.innerHTML = `
    <h2>${escapeHtml(record.questionSet?.name || "ผลการเล่น")}</h2>
    <p class="es-sub">${escapeHtml(meta.join(" · "))}</p>
    <div class="es-row rs-actions">
      <span class="es-spacer"></span>
      <button type="button" class="es-btn es-play es-small" data-rs-export>⬇ Export Excel</button>
      <button type="button" class="es-btn es-soft es-small es-danger" data-rs-delete>${confirmDelete ? "ยืนยันลบผลนี้?" : "🗑 ลบผลนี้"}</button>
    </div>
    <div class="rs-tabs" role="tablist">${tabs
      .map(([k, t]) => `<button type="button" class="rs-tab" role="tab" data-rs-tab="${k}" aria-selected="${tab === k}">${t}</button>`)
      .join("")}</div>
    ${tab === "questions" ? questionsTab(insights) : tab === "players" ? playersTab(insights) : overviewTab(insights)}`;
}

function stat(label, value, note, cls = "") {
  return `<div class="rs-stat"><div class="k">${label}</div><div class="v ${cls}">${value}</div><div class="d">${note}</div></div>`;
}

function overviewTab({ overview: o, questions, players, highlights }) {
  const top = players.slice(0, 3);
  const podium = [1, 0, 2]
    .map((i) => {
      const p = top[i];
      if (!p) return `<div></div>`;
      return `<div class="rs-pod p${i + 1}"><div class="e"><span class="glass" style="--c:${SAFE_TOKEN.test(p.color || "") ? p.color : "#7b5cd6"}">${escapeHtml(p.emoji || "❔")}</span></div><div class="n">${escapeHtml(p.name)}</div><div class="bar">${i + 1}</div></div>`;
    })
    .join("");
  return `
    <div class="rs-stats">
      ${stat("ตอบถูกเฉลี่ย", pctText(o.accuracy), "ทุกคน ทุกข้อ", accClass(o.accuracy))}
      ${stat("เวลาตอบเฉลี่ย", sec(o.avgMs), "เฉพาะคนที่ตอบ")}
      ${stat("ตอบทันเวลา", pctText(o.answerRate), "ที่เหลือหมดเวลา/หลุด")}
      ${stat("ตอบถูกเร็วที่สุด", sec(o.fastest?.ms), o.fastest ? `${escapeHtml(o.fastest.name)} · ข้อ ${o.fastest.questionIndex + 1}` : "-")}
      ${stat("ปีน / ร่วงบันได", `🟠${o.ladders} 🟣${o.drops}`, "ทั้งเกม")}
    </div>
    <div class="rs-grid2">
      <div class="rs-card"><h3>ความยากแต่ละข้อ</h3><p class="es-muted">% คนที่ตอบถูก เรียงตามลำดับที่ถาม</p>
        <div class="rs-strip">${questions
          .map((q) => `<div class="${accClass(q.percent)}" style="height:${Math.max(6, q.percent ?? 0)}%" title="ข้อ ${q.index + 1}: ${pctText(q.percent)}"><span>ข้อ ${q.index + 1}</span></div>`)
          .join("")}</div>
        <div class="rs-legend"><span><i class="good"></i>ง่าย ≥${EASY_PCT}%</span><span><i class="mid"></i>ปานกลาง</span><span><i class="bad"></i>ยาก &lt;${HARD_PCT}%</span></div>
      </div>
      <div class="rs-card"><h3>แท่นรับรางวัล</h3><div class="rs-podium">${podium}</div></div>
    </div>
    ${highlights.length ? `<div class="rs-card rs-highlights"><h3>สิ่งที่น่าสนใจ</h3><ul>${highlights.map(highlightItem).join("")}</ul></div>` : ""}`;
}

function highlightItem(h) {
  const q = h.question;
  const qText = q ? `"${escapeHtml(q.text)}"` : "";
  const li = (icon, html) => `<li><span class="ic" aria-hidden="true">${icon}</span><div>${html}</div></li>`;
  switch (h.kind) {
    case "hardest":
      return li("🧱", `<b>ข้อที่ยากที่สุด: ข้อ ${q.index + 1}</b> ตอบถูก ${pctText(q.percent)} — ${qText} ควรทบทวนเรื่องนี้ในคาบถัดไป`);
    case "trap":
      return li(
        "🪤",
        `<b>ตัวหลอกที่ได้ผลที่สุด: ข้อ ${q.index + 1}</b> ${q.trap.percent}% เลือก ${escapeHtml(q.trap.option)} "${escapeHtml(q.choices[q.trap.option] ?? "")}" แทนคำตอบที่ถูก — น่าจะเป็นความเข้าใจผิดที่พบบ่อย`
      );
    case "easiest":
      return li("🎯", `<b>ข้อที่ง่ายที่สุด: ข้อ ${q.index + 1}</b> ตอบถูก ${pctText(q.percent)}${q.avgCorrectMs != null ? ` เฉลี่ย ${sec(q.avgCorrectMs)}` : ""}`);
    case "slowest":
      return li("🐢", `<b>ข้อที่ใช้เวลาคิดนานที่สุด: ข้อ ${q.index + 1}</b> คนที่ตอบถูกใช้เวลาเฉลี่ย ${sec(q.avgCorrectMs)}`);
    case "quickest":
      return li("⚡", `<b>${escapeHtml(h.player.emoji)} ${escapeHtml(h.player.name)}</b> ตอบเร็วที่สุดโดยเฉลี่ย ${sec(h.player.avgMs)}/ข้อ และถูก ${h.player.correct}/${h.player.eligible} ข้อ`);
    case "perfect":
      return li("🏅", `<b>ตอบถูกทุกข้อ ${h.players.length} คน:</b> ${h.players.map((p) => escapeHtml(`${p.emoji} ${p.name}`)).join(", ")}`);
    case "best":
      return li("🏅", `<b>ไม่มีใครตอบถูกครบทุกข้อ</b> มากที่สุดคือ ${escapeHtml(h.player.name)} ${h.player.correct}/${h.player.eligible} ข้อ`);
    default:
      return "";
  }
}

function questionsTab({ questions }) {
  if (!questions.length) return `<p class="rs-empty">เกมนี้ยังไม่มีการตอบคำถาม</p>`;
  return `<div class="rs-qs">${questions
    .map((q) => {
      const options = q.options
        .map((op) => {
          const cls = op.key === q.correctOption ? "correct" : q.trap?.option === op.key ? "trap" : "";
          return `<div class="rs-opt ${cls}"><span class="key">${escapeHtml(op.key)}</span>
            <div class="track"><div class="fill" style="width:${op.percent}%"></div><span class="label">${escapeHtml(op.text)}${op.key === q.correctOption ? " ✓" : ""}</span></div>
            <span class="p">${op.percent}%</span></div>`;
        })
        .join("");
      const roundsText = q.rounds.length > 1 ? `ถามในรอบ ${q.rounds.join(", ")}` : `รอบ ${q.rounds[0]}`;
      return `<div class="rs-card">
        <div class="rs-q-top"><span class="es-q-no">${q.index + 1}</span><button type="button" class="rs-q-text" data-rs-expand aria-expanded="false" title="แตะเพื่อดูคำถามเต็ม">${escapeHtml(q.text)}</button>${DIFF_TAG[q.difficulty] || ""}</div>
        <p class="es-muted">${roundsText}</p>
        <div class="rs-opts">${options}</div>
        <div class="rs-facts">
          <span>ตอบถูก <b>${pctText(q.percent)}</b> (${q.correct}/${q.eligible})</span>
          <span>เร็วสุด <b>${q.fastest ? `${sec(q.fastest.ms)} · ${escapeHtml(q.fastest.name)}` : "-"}</b></span>
          <span>เฉลี่ย <b>${sec(q.avgMs)}</b></span>
          <span>มัธยฐาน <b>${sec(q.medianMs)}</b></span>
          <span>ไม่ได้ตอบ <b>${q.noAnswer} คน</b></span>
        </div>
        ${q.trap ? `<div class="rs-note">🪤 ${q.trap.percent}% เลือก ${escapeHtml(q.trap.option)} — ตัวหลอกนี้ได้ผล ลองอธิบายความต่างระหว่าง ${escapeHtml(q.trap.option)} กับ ${escapeHtml(q.correctOption)}</div>` : ""}
      </div>`;
    })
    .join("")}</div>`;
}

const DOT_TITLE = { correct: "ถูก", wrong: "ผิด", timeout: "ไม่ทัน", missed: "หลุด", done: "เข้าเส้นชัยแล้ว (ไม่ได้ตอบข้อฝึก)" };

function playersTab({ players }) {
  const rows = players
    .map(
      (p) => `<tr>
        <td>${p.rank <= 3 ? MEDALS[p.rank - 1] : p.rank}</td>
        <td>${escapeHtml(`${p.emoji} ${p.name}`)}</td>
        <td><span class="rs-dots">${p.byRound
          .map((r) => `<i class="${r.status}${r.practice ? " practice" : ""}" title="รอบ ${r.round}: ${r.practice ? "ข้อฝึก · " : ""}${DOT_TITLE[r.status]}"></i>`)
          .join("")}</span></td>
        <td class="n">${p.correct}/${p.eligible}</td>
        <td class="n">${pctText(p.percent)}</td>
        <td class="n">${sec(p.avgMs)}</td>
        <td class="n">${sec(p.fastestMs)}</td>
        <td class="n">${p.ladders}</td>
        <td class="n">${p.drops}</td>
      </tr>`
    )
    .join("");
  return `<div class="rs-table"><table>
      <thead><tr><th>#</th><th>ผู้เล่น</th><th>ผลแต่ละรอบ</th><th class="n">ถูก</th><th class="n">%</th><th class="n">เวลาเฉลี่ย</th><th class="n">เร็วสุด</th><th class="n" title="ปีนบันไดส้ม">🟠</th><th class="n" title="ร่วงบันไดม่วง">🟣</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    <div class="rs-legend"><span><i class="good"></i>ถูก</span><span><i class="bad"></i>ผิด/ไม่ทัน</span><span><i class="miss"></i>หลุด</span><span><i class="done"></i>เข้าเส้นชัยแล้ว</span><span><i class="good practice"></i>ข้อฝึกหลังเข้าเส้นชัย</span></div>`;
}

/* ---------- ภาพรวมชุดคำถาม ---------- */

export function renderSetInsights(el, setName, s, { loading = false } = {}) {
  if (!el) return;
  if (loading) {
    el.innerHTML = `<h2>ภาพรวมชุดคำถาม</h2><p class="es-sub">${escapeHtml(setName)}</p><p class="es-muted">กำลังรวมผลทุกเกม…</p>`;
    return;
  }
  const trend = s.trend.map((t) => `${formatDateTime(t.endedAt).split(" · ")[0]} ${pctText(t.accuracy)}`).join(" → ");
  el.innerHTML = `
    <h2>ภาพรวมชุดคำถาม</h2>
    <p class="es-sub">${escapeHtml(setName)} · เล่นแล้ว ${s.gameCount} เกม · รวม ${s.playerTotal} คน</p>
    <div class="rs-stats">
      ${stat("ตอบถูกเฉลี่ยทุกเกม", pctText(s.accuracy), escapeHtml(trend), accClass(s.accuracy))}
      ${stat("เวลาตอบเฉลี่ย", sec(s.avgMs), "ทุกเกม")}
      ${s.mostOftenHardest ? stat("ข้อที่ยากที่สุดบ่อยที่สุด", `ข้อ ${s.mostOftenHardest.index + 1}`, `ยากที่สุดใน ${s.mostOftenHardest.hardestIn} จาก ${s.gameCount} เกม`) : ""}
    </div>
    <div class="rs-card"><h3>คำถามแต่ละข้อ (รวมทุกเกม)</h3>
      <p class="es-muted">เรียงจากยากไปง่าย · ข้อที่ง่ายเกินอาจเพิ่มตัวหลอก ข้อที่ยากเกินอาจต้องสอนเพิ่ม</p>
      <div class="rs-heat">${s.questions
        .map(
          (q) => `<div class="rs-hrow"><span class="es-q-no">${q.index + 1}</span><span class="t" title="${escapeHtml(q.text)}">${escapeHtml(q.text)}</span>
            <div class="rs-mini"><div class="${accClass(q.percent)}" style="width:${q.percent ?? 0}%"></div></div>
            <b class="${accClass(q.percent)}">${pctText(q.percent)}</b><span class="es-muted">${q.games} เกม</span></div>`
        )
        .join("")}</div>
    </div>`;
}
