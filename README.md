# Quiz Runner

เกมบันไดงูตอบคำถามแบบ multiplayer (Firebase Realtime Database) สำหรับเล่นในห้องเรียน
Host (ครู) เปิดจอขึ้นโปรเจกเตอร์ ผู้เล่น Join ด้วย Race Code จากมือถือ แล้วเลือกตัวหมาก emoji ใน Lobby

แต่ละรอบ: ทอยลูกเต๋า → นับถอยหลัง → ตอบคำถาม → เฉลย

## กติกา

- กระดาน 6×5 = 30 ช่อง เดินแบบงูเลื้อย บันได 3 จุด งู 3 ตัว (แก้ได้ที่ `js/board-config.js`)
- ทอยลูกเต๋า: ขึ้นบันไดได้ ตกงูได้
- ตอบถูก: เดินหน้า ขึ้นบันไดได้ แต่ไม่ตกงู
- ตอบผิดหรือไม่ตอบ: ถอยหลัง ตกงูได้ แต่ไม่ขึ้นบันได
- เดินเกินช่อง 30 ถือว่าเข้าเส้นชัย
- ผู้เล่นที่หลุดการเชื่อมต่อจะถูกข้ามการทอยและไม่ขยับตอนเฉลย

## โครงสร้างไฟล์

```
index.html          หน้าเว็บ
ui.css              สไตล์
questions.js        ชุดคำถาม + ธีมตัวหมากของแต่ละชุด (QUESTION_SET_THEMES)
js/
  app.js            จุดเริ่มต้น: session, flow ของ Host/Player, sync Firebase, ผูก event
  config.js         ค่าคงที่ของเกม + Firebase config + Admin PIN
  firebase.js       เชื่อมต่อ DB + เวลา server (ทุกเครื่องใช้นาฬิกาเดียวกัน)
  board-config.js   ขนาดกระดาน ตำแหน่งบันได/งู และกติกาขึ้นบันได/ตกงู
  emoji-themes.js   ธีม emoji ตัวหมาก (ธีมละ 30 ตัว) + ตัวสำรองเมื่อผู้เล่นเกิน 30 คน
  game-logic.js     กติกาเกม (pure function ใช้ใน transaction)
  board-view.js     วาดกระดาน + แอนิเมชันหมากเดิน/ขึ้นบันได/ตกงู
  render.js         แผงรอผู้เล่น / อันดับ / เหตุการณ์ / ตาราง / สรุปผล
  dice.js           ลูกเต๋า 3D
  export.js         Export Excel (โหลด SheetJS เมื่อกดปุ่มเท่านั้น)
tests/              unit test ของกติกาเกมและการ render
```

## รันในเครื่อง

ต้องเปิดผ่าน HTTP server (ES modules เปิดจาก `file://` ไม่ได้) เช่น

```bash
npx serve .
```

## รันเทสต์

```bash
node --test tests/*.test.mjs
```

## ข้อควรรู้

- Admin PIN และสิทธิ์ Host ตรวจที่ฝั่ง client เท่านั้น ความปลอดภัยจริงต้องตั้ง Firebase Security Rules
- ห้องที่จบแล้วไม่ถูกลบอัตโนมัติ ควรล้าง `rooms/` ใน Firebase เป็นระยะ
