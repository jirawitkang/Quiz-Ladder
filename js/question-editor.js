// question-editor.js
// หน้าคลังชุดคำถาม + หน้าสร้าง/แก้ชุดคำถาม (DOM ล้วน ไม่แตะ Firebase — app.js เป็นคนบันทึก)

import { EMOJI_CATALOG, EMOJI_THEMES } from "./emoji-themes.js";
import { CHOICE_KEYS, MIN_CHOICES, SET_EMOJI_COUNT, TIME_OPTIONS, emptyQuestion } from "./question-sets.js";
import { escapeHtml } from "./utils.js";

/* ---------- คลังชุดคำถาม ---------- */

// sets = listQuestionSets(); confirmDeleteId = ชุดที่กดลบไปแล้วหนึ่งครั้ง (รอยืนยัน)
export function renderLibrary(el, sets, { confirmDeleteId = null, loading = false } = {}) {
  if (!el) return;
  const newCard = `<button type="button" class="es-card es-card-new" data-set-new><span class="plus">+</span>สร้างชุดใหม่</button>`;
  if (loading) {
    el.innerHTML = `${newCard}<p class="es-muted">กำลังโหลดชุดคำถาม…</p>`;
    return;
  }
  el.innerHTML =
    newCard +
    sets
      .map((s) => {
        const id = escapeHtml(s.id);
        const confirming = confirmDeleteId === s.id;
        return `<div class="es-lib-item">
          <button type="button" class="es-card" data-set-open="${id}">
            <span class="emo" aria-hidden="true">${escapeHtml(s.emojis.slice(0, 3).join(""))}</span>
            <span class="nm">${escapeHtml(s.name)}</span>
            <span class="meta">${s.questions.length} ข้อ</span>
          </button>
          <div class="es-lib-actions">
            <button type="button" data-set-copy="${id}">⧉ ทำสำเนา</button>
            <button type="button" data-set-delete="${id}" class="${confirming ? "confirm" : ""}">${confirming ? "ยืนยันลบ?" : "🗑 ลบ"}</button>
          </div>
        </div>`;
      })
      .join("");
}

/* ---------- หน้าแก้ชุดคำถาม ---------- */

// els: { name, count, tray, themes, tabs, shop, questions, addQuestion, error }
export function createSetEditor(els) {
  let draft = null;
  let openIndex = 0;
  let tab = Object.keys(EMOJI_CATALOG)[0];

  function clearError() {
    if (els.error) els.error.hidden = true;
  }

  function renderEmojis() {
    const n = draft.emojis.length;
    els.count.textContent = `${n}/${SET_EMOJI_COUNT}`;
    els.count.className = `es-count${n === SET_EMOJI_COUNT ? " ok" : n > SET_EMOJI_COUNT ? " over" : ""}`;
    els.tray.innerHTML =
      draft.emojis.map((e, i) => `<button type="button" data-emoji-out="${i}" aria-label="เอา ${escapeHtml(e)} ออก">${escapeHtml(e)}</button>`).join("") +
      `<span></span>`.repeat(Math.max(0, SET_EMOJI_COUNT - n));
    els.themes.innerHTML = Object.entries(EMOJI_THEMES)
      .map(([id, t]) => `<button type="button" class="es-chip" data-emoji-theme="${id}">${escapeHtml(t.emojis[0])} ${escapeHtml(t.name)}</button>`)
      .join("");
    els.tabs.innerHTML = Object.keys(EMOJI_CATALOG)
      .map((k) => `<button type="button" data-emoji-tab="${escapeHtml(k)}" aria-pressed="${k === tab}">${escapeHtml(k)}</button>`)
      .join("");
    const chosen = new Set(draft.emojis);
    els.shop.innerHTML = EMOJI_CATALOG[tab]
      .map((e) => {
        const on = chosen.has(e);
        const full = !on && n >= SET_EMOJI_COUNT;
        return `<button type="button" data-emoji-pick="${escapeHtml(e)}" aria-pressed="${on}"${full ? " disabled" : ""}>${escapeHtml(e)}</button>`;
      })
      .join("");
  }

  function renderQuestions() {
    els.questions.innerHTML = draft.questions
      .map((q, i) => {
        const open = i === openIndex;
        const head = `<button type="button" class="es-q-head" data-q-open="${i}" aria-expanded="${open}">
          <span class="es-q-no">${i + 1}</span>
          <span class="es-q-text">${escapeHtml(q.text.trim() || "คำถามใหม่")}</span>
          <span class="es-q-time">⏱ ${q.timeLimit} วิ</span>
        </button>`;
        if (!open) return `<div class="es-q">${head}</div>`;
        const choices = q.choices
          .map(
            (c, j) => `<div class="es-choice${q.correct === j ? " correct" : ""}">
              <button type="button" class="key" data-q-correct="${j}" aria-pressed="${q.correct === j}" aria-label="ตั้ง ${CHOICE_KEYS[j]} เป็นคำตอบที่ถูก">${CHOICE_KEYS[j]}</button>
              <input class="es-input" data-q-choice="${j}" value="${escapeHtml(c)}" maxlength="200" aria-label="ตัวเลือก ${CHOICE_KEYS[j]}" />
              ${q.choices.length > MIN_CHOICES ? `<button type="button" class="rm" data-q-remove-choice="${j}" aria-label="ลบตัวเลือก ${CHOICE_KEYS[j]}">✕</button>` : ""}
            </div>`
          )
          .join("");
        return `<div class="es-q">${head}
          <div class="es-q-body">
            <div><label class="es-label" for="qText${i}">คำถาม</label>
              <textarea class="es-input" id="qText${i}" data-q-text rows="3" maxlength="1500">${escapeHtml(q.text)}</textarea></div>
            <div><span class="es-label">ตัวเลือก <span class="es-muted">· แตะตัวอักษรเพื่อเลือกข้อที่ถูก</span></span>
              <div class="es-choices">${choices}</div>
              ${q.choices.length < CHOICE_KEYS.length ? `<button type="button" class="es-btn es-soft es-small" data-q-add-choice>+ เพิ่มตัวเลือก</button>` : ""}
            </div>
            <div><span class="es-label">เวลาตอบ</span>
              <div class="es-chips">${TIME_OPTIONS.map((t) => `<button type="button" class="es-chip" data-q-time="${t}" aria-pressed="${q.timeLimit === t}">${t} วิ</button>`).join("")}</div>
            </div>
            <div class="es-row">
              <button type="button" class="es-btn es-soft es-small" data-q-up ${i === 0 ? "disabled" : ""}>↑ ย้ายขึ้น</button>
              <span class="es-spacer"></span>
              <button type="button" class="es-btn es-soft es-small es-danger" data-q-delete ${draft.questions.length <= 1 ? "disabled" : ""}>ลบข้อนี้</button>
            </div>
          </div>
        </div>`;
      })
      .join("");
  }

  function render() {
    renderEmojis();
    renderQuestions();
  }

  // พิมพ์: แก้ draft อย่างเดียว ไม่ render ใหม่ (กันเคอร์เซอร์หลุด)
  els.name.addEventListener("input", () => {
    draft.name = els.name.value;
    clearError();
  });
  els.questions.addEventListener("input", (e) => {
    const q = draft.questions[openIndex];
    if (!q) return;
    if (e.target.matches("[data-q-text]")) q.text = e.target.value;
    else if (e.target.dataset.qChoice != null) q.choices[Number(e.target.dataset.qChoice)] = e.target.value;
    clearError();
  });

  els.questions.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    const d = b.dataset;
    const q = draft.questions[openIndex];
    if (d.qOpen != null) openIndex = openIndex === Number(d.qOpen) ? -1 : Number(d.qOpen);
    else if (d.qCorrect != null) q.correct = Number(d.qCorrect);
    else if (d.qRemoveChoice != null) {
      const j = Number(d.qRemoveChoice);
      q.choices.splice(j, 1);
      if (q.correct === j) q.correct = 0;
      else if (q.correct > j) q.correct -= 1;
    } else if (d.qAddChoice != null) q.choices.push("");
    else if (d.qTime != null) q.timeLimit = Number(d.qTime);
    else if (d.qUp != null) {
      [draft.questions[openIndex - 1], draft.questions[openIndex]] = [q, draft.questions[openIndex - 1]];
      openIndex -= 1;
    } else if (d.qDelete != null) {
      draft.questions.splice(openIndex, 1);
      openIndex = -1;
    } else return;
    clearError();
    renderQuestions();
  });

  els.addQuestion.addEventListener("click", () => {
    draft.questions.push(emptyQuestion());
    openIndex = draft.questions.length - 1;
    clearError();
    renderQuestions();
    els.questions.querySelector("[data-q-text]")?.focus();
  });

  const emojiArea = els.tray.closest(".es-emoji") || els.tray.parentElement;
  emojiArea.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.emojiOut != null) draft.emojis.splice(Number(d.emojiOut), 1);
    else if (d.emojiPick != null) {
      const i = draft.emojis.indexOf(d.emojiPick);
      if (i >= 0) draft.emojis.splice(i, 1);
      else if (draft.emojis.length < SET_EMOJI_COUNT) draft.emojis.push(d.emojiPick);
    } else if (d.emojiTheme != null) draft.emojis = [...EMOJI_THEMES[d.emojiTheme].emojis];
    else if (d.emojiTab != null) tab = d.emojiTab;
    else return;
    clearError();
    renderEmojis();
  });

  return {
    open(nextDraft) {
      draft = nextDraft;
      openIndex = draft.questions.length === 1 && !draft.questions[0].text ? 0 : -1;
      els.name.value = draft.name;
      clearError();
      render();
    },
    getDraft: () => draft,
    showError(msg) {
      els.error.textContent = msg;
      els.error.hidden = !msg;
    },
  };
}
