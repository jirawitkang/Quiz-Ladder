// qr.js
// QR code สำหรับให้ผู้เล่นสแกนเข้าห้อง (โหลดไลบรารีเฉพาะตอนที่ Host เปิด Lobby)

const QR_LIB_URL = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js";
const ROOM_PARAM = "room";
let libPromise = null;

function loadQrLib() {
  if (globalThis.qrcode) return Promise.resolve(globalThis.qrcode);
  if (!libPromise) {
    libPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = QR_LIB_URL;
      s.onload = () => resolve(globalThis.qrcode);
      s.onerror = () => {
        libPromise = null;
        reject(new Error("โหลดไลบรารี QR code ไม่สำเร็จ"));
      };
      document.head.appendChild(s);
    });
  }
  return libPromise;
}

// ลิงก์ที่ผู้เล่นสแกนแล้วเปิดหน้า Join พร้อมรหัสห้อง
export function buildJoinUrl(roomCode) {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set(ROOM_PARAM, roomCode);
  return url.toString();
}

// รหัสห้องจาก URL (?room=XXXXXX) ถ้ามี
export function readRoomFromUrl() {
  const code = new URLSearchParams(location.search).get(ROOM_PARAM);
  return code ? code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) : null;
}

// ลบ ?room= ออกจากแถบที่อยู่หลังใช้แล้ว (กันเติมรหัสซ้ำตอน refresh)
export function clearRoomFromUrl() {
  const url = new URL(location.href);
  if (!url.searchParams.has(ROOM_PARAM)) return;
  url.searchParams.delete(ROOM_PARAM);
  history.replaceState(null, "", url.toString());
}

let renderedKey = null;

export async function renderJoinQr(el, roomCode) {
  if (!el || !roomCode) return;
  const url = buildJoinUrl(roomCode);
  if (renderedKey === url && el.childElementCount) return;
  renderedKey = url;
  try {
    const qrcode = await loadQrLib();
    if (renderedKey !== url) return; // ห้องเปลี่ยนระหว่างโหลด
    const qr = qrcode(0, "M");
    qr.addData(url);
    qr.make();
    el.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true, alt: `QR code เข้าห้อง ${roomCode}` });
    el.title = url;
  } catch (e) {
    console.warn(e);
    renderedKey = null;
    el.textContent = url; // สำรอง: แสดงลิงก์แทน
  }
}

export function resetJoinQr(el) {
  renderedKey = null;
  if (el) el.innerHTML = "";
}
