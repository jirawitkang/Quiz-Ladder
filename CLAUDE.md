# Quiz Ladder

เกมบันไดตอบคำถาม (Quiz Ladder) แบบ multiplayer สำหรับเล่นในห้องเรียน — บันไดส้มปีนขึ้น บันไดม่วงร่วงลง (ไม่มีงูแล้ว)
Host (ครู) เปิดจอขึ้นโปรเจกเตอร์ ผู้เล่น Join ด้วยรหัสห้อง 6 ตัวหรือสแกน QR จากมือถือ
เว็บจริง: https://jirawitkang.github.io/Quiz-Ladder/ — GitHub Pages deploy จาก branch `main` (push = deploy ภายใน ~1–2 นาที)
ผู้ใช้สื่อสารภาษาไทย ตอบเป็นภาษาไทย

## Stack
- HTML/CSS/vanilla JS แบบ ES modules ไม่มี build step ไม่มี npm dependency
- Firebase Realtime Database project `snake-quiz-cdf1c` (แพ็กเกจฟรี: ไม่มี TTL, ไม่มี Cloud Functions) — rules เปิดอ่าน/เขียน, ไม่มี index
- CDN แบบ lazy-load: SheetJS (Export Excel), qrcode-generator (QR ใน Lobby)

## โครงสร้าง
```
index.html, ui.css        หน้าเว็บ / สไตล์ทั้งหมด (15 = กระดาน/เกมเดิม, 17 = หน้าจอก่อนเข้าห้อง, 18 = Lobby, 19 = หน้าเล่นเกม)
questions.js              ชุดคำถามเดิม (ต้นฉบับที่ย้ายขึ้น Firebase แล้ว + ใช้กับห้องเก่า) + getRoomQuestions() อ่านสำเนาในห้องก่อน
js/config.js              ค่าคงที่ (BOARD_SIZE=30, เวลา, ROOM_MAX_AGE_MS) + Firebase config + ADMIN_PIN
js/firebase.js            DB, serverNow() (เวลา server), cleanupOldRooms()
js/board-config.js        กระดาน 6×5 ซิกแซก, LADDERS (ส้ม)/DROPS (ม่วง), resolveLanding(), isDrop()
js/game-logic.js          กติกาทั้งหมดเป็น pure function apply*() ใช้ใน runTransaction (คืน undefined = ยกเลิก)
js/emoji-themes.js        ธีมละ 30 emoji + ตัวสำรอง เพิ่มทีละ 20 เมื่อผู้เล่นเกิน 30 + EMOJI_CATALOG (ร้าน emoji ให้ครูเลือก)
js/question-sets.js       ชุดคำถามที่ครูแก้จากเว็บ: validate/แปลง draft ↔ รูปแบบที่เก็บ, สำเนาลงห้อง (pure)
js/question-editor.js     หน้าคลังชุดคำถาม + หน้าแก้ชุดคำถาม (DOM ล้วน, app.js เป็นคนบันทึก Firebase)
js/board-view.js          วาดกระดาน/บันไดส้ม-ม่วง + วงลูกศรทางเข้า (SVG), ตัวหมากซ้อนช่อง (+N), แอนิเมชันเดิน
js/render.js              Lobby, ตัวเลือก emoji, แผงรอ, อันดับ (กล่องเขียวคนเข้าเส้นชัย), feed, ตาราง, สรุปผล
js/dice.js                ลูกเต๋า 3D: วางที่ #diceDock → โยน/กระดอน 4 ครั้ง → หยุดกลางกระดาน (planThrow)
js/sound.js               เสียงสังเคราะห์ด้วย Web Audio (ลูกเต๋า, ก้าว, บันได, งู, ถูก/ผิด, นับถอยหลัง, พลุ, fanfare) + ปุ่ม mute
js/celebrate.js           พลุ/กระดาษสี/ป้ายประกาศ บน canvas (อันดับ 1–3 เข้าเส้นชัย, จบเกม)
js/qr.js                  QR ลิงก์ ?room=CODE, อ่าน/ลบ param ตอนเปิดหน้า
js/results.js             ผลการเล่นย้อนหลัง: สร้าง record ตอนจบเกม + สถิติเกมเดียว/ทั้งชุดคำถาม (pure)
js/results-view.js        หน้ารายการผล / ผลเกมเดียว (ภาพรวม·รายข้อ·รายคน) / ภาพรวมชุดคำถาม (DOM ล้วน)
js/export.js              Export Excel (กดจากหน้าผลย้อนหลังเท่านั้น — หน้าจบเกมไม่มีปุ่มแล้ว)
js/app.js                 session, flow Host/Player, presence, render, timers, event bindings
tools/check-active-rooms.mjs  เช็กห้องใน Firebase ก่อน deploy
tools/seed-question-sets.mjs  ย้ายชุดใน questions.js ขึ้น Firebase (เฉพาะที่ยังไม่มี; --write)
tools/restore-backup.mjs  กู้ questionSets/ หรือ results/ จาก branch backups กลับขึ้น Firebase
.github/workflows/backup.yml  GitHub Actions สำรอง Firebase ทุกคืน 02:00 → branch `backups` (กด Run workflow เองได้)
tests/*.test.mjs          node:test (กติกา, render, emoji, เส้นทางโยนลูกเต๋า)
```

## กติกาที่ตกลงกับผู้ใช้แล้ว (อย่าเปลี่ยนเองโดยไม่ถาม)
- กระดาน 6×5 = 30 ช่อง สลับสีทีละแถว (แนวนอน); บันไดตั้งตรงข้ามแถวเดียว ไม่ทับกัน ระยะสั้นให้เกมยาวพอ
  บันไดส้ม (ปีน) 4→9, 10→15, 22→27 / บันไดม่วง (ร่วง) 14→11, 21→16, 26→23 — วงลูกศรที่ช่องทางเข้า (ส้มล่าง ▲ / ม่วงบน ▼)
- ทอย: ปีน + ร่วงได้ / ตอบถูก: ปีนได้ ไม่ร่วง / ตอบผิดหรือไม่ตอบ: ร่วงได้ ไม่ปีน / เกินช่อง 30 = เข้าเส้นชัย
- ข้อมูลใน history: special/blocked = "ladder" | "drop" (ผลเก่าก่อน 2026-10-14 เป็น "snake" = drop → ใช้ isDrop())
- ผู้เล่นหลุด: ข้ามการทอย (นับ 0) และไม่ขยับตอนเฉลย
- emoji: เข้าห้องก่อนแล้วเลือกใน Lobby แบบเห็นสถานะสด ไม่มี popup ตอนชนกัน, เปลี่ยนได้จนเริ่มเกม, เริ่มเกมแล้วสุ่มให้คนที่ยังไม่เลือก
- ลูกเต๋า: ผู้เล่นแตะที่ตัวลูกเต๋า (ทั้งกล่อง dock แตะได้), เวลาโยนรวม 5 วิ, ทิศหมุนตามทิศที่วิ่ง, ค้างให้เห็นแต้ม ~1.2 วิ
  แล้วการ์ดผลทอยค่อยขึ้น, เงาโผล่ใต้ลูกเต๋า ~2% (SHADOW_Y_RATIO), มีแกนในปิดรูมุมมน
- ห้องอายุเกิน 6 ชม. ถูกลบอัตโนมัติตอน Host สร้างห้องใหม่
- ฉลอง: อันดับ 1–3 เข้าเส้นชัย → Host พลุ+ป้าย+fanfare, มือถือเจ้าตัวกระดาษสี, คนอื่นป้ายเล็ก; จบเกม → แท่นรับรางวัล 2-1-3 ยกขึ้น
  (ยิงตามจังหวะหมากถึงเส้นชัยบนจอ ผ่าน hooks ของ board-view ไม่ใช่ตอนข้อมูลมาถึง)
- หน้าก่อนเข้าห้อง (#entrySection) เป็นหน้าจอเกม ไม่ใช่หน้าเว็บ: body.on-entry ซ่อนแถบหัว, 4 หน้า landing / player / pin / admin
  (showEntryPage), PIN เป็นแป้นตัวเลขในหน้า (ไม่มี overlay), ตั้งค่าห้องหน้าเดียว, ไม่มีคำโปรยใต้โลโก้, ข้อความภาษาไทย
  ชื่อเกม Quiz Ladder, โลโก้ = ตัว Q หางเป็นบันได (SVG inline ใน index.html ใช้ซ้ำทั้ง favicon/แถบหัว/หน้าแรก)
- ชุดคำถามเก็บใน Firebase `questionSets/{id}` (ชุดเดิม id = general, love, ... ; ชุดใหม่ id จาก push)
  ครูอ่าน/ทำสำเนา/แก้/ลบได้ทุกชุด (ลบต้องกดยืนยันซ้ำ), ตัวหมาก 30 ตัวเลือกเองจากร้าน emoji (บังคับครบ 30 พอดี)
  ตัวเลือก 2–4 ข้อ, เวลา 15/30/60/120 วิ; ห้องเก็บสำเนา `room.questionSet` {id,name,emojis,questions} ตอนสร้าง → แก้ชุดระหว่างเกมไม่กระทบ
  flow: PIN → เมนูครู (hostMenu) → สร้างห้องเกม (admin) / ชุดคำถาม (library → setEditor) / ผลย้อนหลัง (results → resultDetail, setInsights)
- ผลการเล่น: Host บันทึกตอนเกมจบ (เฉพาะเกมที่เล่นจบ ไม่บันทึกเกมที่ยกเลิก) → `results/{createdAt_CODE}` (สำเนาห้องเต็ม)
  + `resultsIndex/{key}` (สรุปสำหรับหน้ารายการ); เก็บตลอดไป ลบจากหน้าเว็บได้ (กดยืนยันซ้ำ) — ลบต้องลบทั้งสองที่
  สถิติ: ผู้เล่นที่เข้าเส้นชัยแล้วไม่นับในรอบหลังจากนั้น (answer correct=null และไม่ใช่ missed), หลุด/หมดเวลานับเป็นไม่ถูก
  ง่าย ≥75% / ยาก <45% (EASY_PCT/HARD_PCT), ตัวหลอก = ตัวเลือกผิดที่ถูกเลือก ≥25% ของคนตอบและ ≥2 คน
- Lobby (status lobby) เป็นหน้าจอเกมแยกนอก #roomView: #hostLobby (รหัสห้อง+QR ซ้าย, การ์ดนักเรียนแนวนอน 3 คอลัมน์, ปุ่มเริ่มเกม)
  และ #playerLobby (เลือกตัวหมาก 5 คอลัมน์ + สุ่ม) — body.on-lobby ซ่อนแถบหัวเว็บ; เริ่มเกมแล้วกลับไป #roomView (กระดานแบบเดิม)
- หน้าเล่นเกม (body.on-game): แถบบน .game-top แถวเดียวเสมอ (จอแคบย่อข้อความ ไม่ขึ้นบรรทัดใหม่)
  ครู: ขั้นของรอบเป็นตัวบอกสถานะ (ไม่ใช่ปุ่ม) + ปุ่ม "ขั้นถัดไป" ปุ่มเดียว #hostNextBtn (hostNextAction) อยู่แถบบน
  กระดานซ้าย + แถบขวาเสมอ (เรียงลงล่างเฉพาะ <640px): ทอย/ตอบแล้ว, อันดับ 5 คนแรก, เกิดอะไรขึ้นบ้าง, ปุ่มตารางละเอียด
  (ตารางลอยทับกระดาน เรียงตามอันดับ/ชื่อ); คำถามเป็นการ์ดกระดาษ ตัวเลือก 4 สี A ส้ม B ฟ้า C เขียว D ม่วง (ตรงกับมือถือ)
- เสียง: จอ Host เล่นเสียงของทุกคน (ไม่มีเสียงก้าวเดิน กันรก), มือถือเล่นเฉพาะเรื่องของตัวเอง

## รัน / ทดสอบ
```bash
node --test tests/*.test.mjs                 # ต้องผ่านทั้งหมดก่อน commit
node "../.claude/serve.mjs"                  # static server :8765 (python http.server ใช้ไม่ได้ใน Desktop)
```
- http://localhost:8765 = Firebase จริง (ลบห้องทดสอบทุกครั้ง: Host กด "ยกเลิกห้อง")
- http://localhost:8765/test.html = Firebase จำลองในหน่วยความจำ (`../.claude/mock/`, import map ใน serve.mjs)
  ใช้ `window.__mockDb.get/set` ตั้งสถานะห้อง และ `import('/js/game-logic.js')` จำลองการกระทำของคนอื่น
- Browser pane มักถูกนับเป็นแท็บเบื้องหลัง: rAF/Web Animations หยุด → ใส่ shim
  `window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 16)` และวัดค่าแทนการดูภาพ

## Deploy (ผู้ใช้อนุญาตให้ deploy เองได้หลังแก้)
1. ทำบน branch (`fix/...`, `feature/...`) → `node --test` ผ่าน
2. ทดสอบในเบราว์เซอร์; อะไรที่ต้องกด ทดสอบด้วยการคลิกเมาส์จริง (computer tool) ไม่ใช่ `el.click()`
3. `node tools/check-active-rooms.mjs` — ถ้ามีห้อง `inGame` ที่ไม่ใช่ห้องทดสอบของผู้ใช้ (host "Kang") ให้หยุดถามก่อน
4. `git checkout main && git merge --ff-only <branch> && git push origin main` แล้วเช็กไฟล์บน github.io ว่าอัปเดต
5. บอกผู้ใช้ว่าเปลี่ยนอะไร, กด `Cmd + Shift + R` เพื่อล้าง cache
- auto-mode classifier อาจบล็อก push ขึ้น main → ขอให้ผู้ใช้ตอบ "ยืนยัน deploy"; Claude แก้ไฟล์ settings สิทธิ์เองไม่ได้
- commit ลงท้ายด้วย `Co-Authored-By` ตาม attribution ของ session

## กับดักที่เคยเจอ
- `button:active{transform:translateY(1px)}` ใน ui.css ทับ transform จัดกึ่งกลาง → ปุ่มกระโดดตอนกด คลิกหลุด
  ปุ่มที่ใช้ `translate(-50%,-50%)` ต้องล็อก transform ตอน `:active` ด้วย
- อย่าบันทึกผลหลังแอนิเมชัน: แท็บเบื้องหลังหยุดแอนิเมชัน → บันทึกผลทอยก่อน แล้วค่อยเล่นแอนิเมชัน
  แต่ผลจะไปถึงจออื่นก่อนลูกเต๋าหยุด → ทุกจอแสดงผลผ่าน `maskPendingRolls()` (game-logic) ที่ซ่อนผลทอยของคนอื่น
  จนครบ DICE_ROLL_MS นับจาก timestamp (รวมผู้ชนะ/ประวัติ/การจบเกม) — app.js: `lastRoom` = ข้อมูลจริง, `lastView` = ใช้แสดงผล
- เขียนข้อมูลผู้เล่นด้วย `runTransaction` — `update()` บนห้องที่ถูกลบจะสร้างห้องผีขึ้นมาใหม่
  แต่รอบแรกของ transaction ใช้ cache ในเครื่อง: ถ้ายังไม่ได้ subscribe (เพิ่ง refresh/rejoin) จะได้ null
  → ต้อง `if (!p) return p;` (ลองใหม่กับ server) ห้าม `return;` (ยกเลิกทันที = เคยทำให้ผู้เล่นค้างสถานะ "หลุด")
- presence: `healPresence()` mark ออนไลน์กลับถ้าเห็นตัวเอง `connected:false` ขณะยังต่ออยู่ (onDisconnect ของแท็บก่อน refresh มาช้า)
- `onDisconnect` สะสมคำสั่ง ต้อง `cancel()` ก่อนตั้งใหม่ (lobby = remove, ในเกม = mark disconnected)
- การ์ด/แผงที่ซ่อนด้วย attribute `hidden` ใช้ได้เพราะมี `[hidden]{display:none!important}`
- Firebase query ที่ต้องใช้ index จะ error (`Index not defined`) — ใช้ REST `?shallow=true` แทน
- Duplicate Tab คัดลอก sessionStorage → แท็บใหม่จะเข้าห้องเป็นผู้เล่นคนเดิม
- GitHub Pages cache ~10 นาที
- Firebase rules เปิด ใครก็ลบข้อมูลได้ → สำรองอัตโนมัติไว้ที่ branch `backups` (ไม่ใช่ main เพราะ push main = deploy)
  GitHub ปิด scheduled workflow เองถ้า repo ไม่มีความเคลื่อนไหว 60 วัน → กด Enable ในแท็บ Actions
- `.entry-stage` ต้องมี `grid-template-columns: minmax(0,1fr)` ไม่งั้นแถวที่ nowrap (แถบหมวด emoji) ดันหน้าจอกว้างเกินมือถือ

## สไตล์โค้ด
- คอมเมนต์ภาษาไทย สั้น อธิบาย "ทำไม", ชื่อตัวแปร/ฟังก์ชันภาษาอังกฤษ
- กติกาใหม่ใส่ใน game-logic.js เป็น pure function + เขียน test; UI อย่าเขียน Firebase ตรง ๆ
- ก่อนเปลี่ยน UI ใหญ่ ผู้ใช้ชอบดูต้นแบบ (Artifact) ก่อน และชอบให้เสนอทางเลือกพร้อมคำแนะนำ
