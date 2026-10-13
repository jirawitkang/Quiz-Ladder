# Quiz Runner

เกมแข่งวิ่งตอบคำถามแบบ multiplayer (Firebase Realtime Database) — Host สร้างห้อง ผู้เล่น Join ด้วย Race Code
แต่ละรอบ: ทอยลูกเต๋า → นับถอยหลัง → ตอบคำถาม → เฉลย (ตอบถูกเดินหน้า / ผิดหรือไม่ตอบถอยหลัง)

## โครงสร้างไฟล์

```
index.html          หน้าเว็บ
ui.css              สไตล์
questions.js        ชุดคำถาม (เพิ่ม/แก้ชุดคำถามที่ไฟล์นี้ไฟล์เดียว)
js/
  app.js            จุดเริ่มต้น: session, flow ของ Host/Player, sync Firebase, ผูก event
  config.js         ค่าคงที่ของเกม + Firebase config + Admin PIN
  firebase.js       เชื่อมต่อ DB + เวลา server (ทุกเครื่องใช้นาฬิกาเดียวกัน)
  game-logic.js     กติกาเกม (pure function ใช้ใน transaction)
  render.js         วาดตารางผู้เล่น / กระดาน / ตัวเลือก / สรุปผล
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
