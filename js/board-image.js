// board-image.js
// ย่อรูปพื้นหลังกระดานในเบราว์เซอร์ก่อนเก็บใน Firebase (เก็บเป็น data URL ใน boardImages/{id})
// ครอปให้เต็มสัดส่วนกระดาน 6:5 แล้วบีบ JPEG จนไม่เกิน ~250 KB

export const BOARD_IMAGE_W = 1200;
export const BOARD_IMAGE_H = 1000;
const MAX_BYTES = 250 * 1024;

const dataUrlBytes = (url) => Math.round(((url.length - url.indexOf(",") - 1) * 3) / 4);

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("เปิดไฟล์รูปไม่ได้ (รองรับ JPG, PNG, WebP, SVG)"));
    };
    img.src = url;
  });
}

export async function fileToBoardImage(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error("เลือกไฟล์รูปภาพ (JPG, PNG, WebP)");
  const img = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = BOARD_IMAGE_W;
  canvas.height = BOARD_IMAGE_H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; // รูปโปร่งใส (PNG) ให้พื้นขาว ไม่ดำเมื่อเป็น JPEG
  ctx.fillRect(0, 0, BOARD_IMAGE_W, BOARD_IMAGE_H);
  // cover: ขยายให้เต็มกรอบแล้วตัดส่วนเกินตรงกลาง
  const iw = img.naturalWidth || img.width || BOARD_IMAGE_W;
  const ih = img.naturalHeight || img.height || BOARD_IMAGE_H;
  const scale = Math.max(BOARD_IMAGE_W / iw, BOARD_IMAGE_H / ih);
  const w = iw * scale;
  const h = ih * scale;
  ctx.drawImage(img, (BOARD_IMAGE_W - w) / 2, (BOARD_IMAGE_H - h) / 2, w, h);

  let quality = 0.85;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrlBytes(dataUrl) > MAX_BYTES && quality > 0.4) {
    quality -= 0.1;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  return { dataUrl, width: BOARD_IMAGE_W, height: BOARD_IMAGE_H, bytes: dataUrlBytes(dataUrl) };
}
