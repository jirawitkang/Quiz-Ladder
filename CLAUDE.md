# Quiz Runner

เกมบันไดงูตอบคำถามแบบ multiplayer สำหรับเล่นในห้องเรียน (ใช้หลังสอนเสร็จ เกมต้องสั้น)
Host (ครู) เปิดจอขึ้นโปรเจกเตอร์ ผู้เล่น Join ด้วย Race Code หรือสแกน QR จากมือถือ
เว็บจริง: https://jirawitkang.github.io/Quiz-Runner/ — GitHub Pages deploy จาก branch `main` (push = deploy ภายใน ~1–2 นาที)
ผู้ใช้สื่อสารภาษาไทย ตอบเป็นภาษาไทย

## Stack
- HTML/CSS/vanilla JS แบบ ES modules ไม่มี build step ไม่มี npm dependency
- Firebase Realtime Database project `snake-quiz-cdf1c` (แพ็กเกจฟรี: ไม่มี TTL, ไม่มี Cloud Functions) — rules เปิดอ่าน/เขียน, ไม่มี index
- CDN แบบ lazy-load: SheetJS (Export Excel), qrcode-generator (QR ใน Lobby)

## โครงสร้าง
```
index.html, ui.css        หน้าเว็บ / สไตล์ทั้งหมด (section 15 = บันไดงู)
questions.js              ชุดคำถาม + QUESTION_SET_THEMES (ชุดคำถาม → ธีม emoji)
js/config.js              ค่าคงที่ (BOARD_SIZE=30, เวลา, ROOM_MAX_AGE_MS) + Firebase config + ADMIN_PIN
js/firebase.js            DB, serverNow() (เวลา server), cleanupOldRooms()
js/board-config.js        กระดาน 6×5 งูเลื้อย, LADDERS/SNAKES, resolveLanding() กติกาขึ้นบันได/ตกงู
js/game-logic.js          กติกาทั้งหมดเป็น pure function apply*() ใช้ใน runTransaction (คืน undefined = ยกเลิก)
js/emoji-themes.js        ธีมละ 30 emoji + ตัวสำรอง เพิ่มทีละ 20 เมื่อผู้เล่นเกิน 30
js/board-view.js          วาดกระดาน/บันได/งู (SVG), ตัวหมากซ้อนช่อง (+N), แอนิเมชันเดิน
js/render.js              Lobby, ตัวเลือก emoji, แผงรอ, อันดับ (กล่องเขียวคนเข้าเส้นชัย), feed, ตาราง, สรุปผล
js/dice.js                ลูกเต๋า 3D: วางที่ #diceDock → โยน/กระดอน 4 ครั้ง → หยุดกลางกระดาน (planThrow)
js/sound.js               เสียงสังเคราะห์ด้วย Web Audio (ลูกเต๋า, ก้าว, บันได, งู, ถูก/ผิด, นับถอยหลัง, พลุ, fanfare) + ปุ่ม mute
js/celebrate.js           พลุ/กระดาษสี/ป้ายประกาศ บน canvas (อันดับ 1–3 เข้าเส้นชัย, จบเกม)
js/qr.js                  QR ลิงก์ ?room=CODE, อ่าน/ลบ param ตอนเปิดหน้า
js/export.js              Export Excel ตอนจบเกม
js/app.js                 session, flow Host/Player, presence, render, timers, event bindings
tools/check-active-rooms.mjs  เช็กห้องใน Firebase ก่อน deploy
tests/*.test.mjs          node:test (กติกา, render, emoji, เส้นทางโยนลูกเต๋า)
```

## กติกาที่ตกลงกับผู้ใช้แล้ว (อย่าเปลี่ยนเองโดยไม่ถาม)
- กระดาน 6×5 = 30 ช่อง, บันได 3→12, 9→18, 16→25, งู 14→5, 21→11, 27→19
- ทอย: ขึ้นบันได + ตกงูได้ / ตอบถูก: ขึ้นบันได ไม่ตกงู / ตอบผิดหรือไม่ตอบ: ตกงู ไม่ขึ้นบันได / เกินช่อง 30 = เข้าเส้นชัย
- ผู้เล่นหลุด: ข้ามการทอย (นับ 0) และไม่ขยับตอนเฉลย
- emoji: เข้าห้องก่อนแล้วเลือกใน Lobby แบบเห็นสถานะสด ไม่มี popup ตอนชนกัน, เปลี่ยนได้จนเริ่มเกม, เริ่มเกมแล้วสุ่มให้คนที่ยังไม่เลือก
- ลูกเต๋า: ผู้เล่นแตะที่ตัวลูกเต๋า (ทั้งกล่อง dock แตะได้), เวลาโยนรวม 5 วิ, ทิศหมุนตามทิศที่วิ่ง, ค้างให้เห็นแต้ม ~1.2 วิ
  แล้วการ์ดผลทอยค่อยขึ้น, เงาโผล่ใต้ลูกเต๋า ~2% (SHADOW_Y_RATIO), มีแกนในปิดรูมุมมน
- ห้องอายุเกิน 6 ชม. ถูกลบอัตโนมัติตอน Host สร้างห้องใหม่
- ฉลอง: อันดับ 1–3 เข้าเส้นชัย → Host พลุ+ป้าย+fanfare, มือถือเจ้าตัวกระดาษสี, คนอื่นป้ายเล็ก; จบเกม → แท่นรับรางวัล 2-1-3 ยกขึ้น
  (ยิงตามจังหวะหมากถึงเส้นชัยบนจอ ผ่าน hooks ของ board-view ไม่ใช่ตอนข้อมูลมาถึง)
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
- เขียนข้อมูลผู้เล่นด้วย `runTransaction` ที่ abort ถ้า node เป็น null — `update()` บนห้องที่ถูกลบจะสร้างห้องผีขึ้นมาใหม่
- `onDisconnect` สะสมคำสั่ง ต้อง `cancel()` ก่อนตั้งใหม่ (lobby = remove, ในเกม = mark disconnected)
- การ์ด/แผงที่ซ่อนด้วย attribute `hidden` ใช้ได้เพราะมี `[hidden]{display:none!important}`
- Firebase query ที่ต้องใช้ index จะ error (`Index not defined`) — ใช้ REST `?shallow=true` แทน
- Duplicate Tab คัดลอก sessionStorage → แท็บใหม่จะเข้าห้องเป็นผู้เล่นคนเดิม
- GitHub Pages cache ~10 นาที

## สไตล์โค้ด
- คอมเมนต์ภาษาไทย สั้น อธิบาย "ทำไม", ชื่อตัวแปร/ฟังก์ชันภาษาอังกฤษ
- กติกาใหม่ใส่ใน game-logic.js เป็น pure function + เขียน test; UI อย่าเขียน Firebase ตรง ๆ
- ก่อนเปลี่ยน UI ใหญ่ ผู้ใช้ชอบดูต้นแบบ (Artifact) ก่อน และชอบให้เสนอทางเลือกพร้อมคำแนะนำ
