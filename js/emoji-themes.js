// emoji-themes.js
// ธีมตัวหมาก emoji (ธีมละ 30 ตัว) + ตัวสำรองเมื่อผู้เล่นเกิน 30 คน
// ใช้เฉพาะ emoji ที่มีมาตั้งแต่ปี 2020 หรือก่อนหน้า เพื่อให้แสดงได้บนมือถือรุ่นเก่า
// ชุดคำถามไหนใช้ธีมอะไร กำหนดที่ QUESTION_SET_THEMES ใน questions.js

export const THEME_SIZE = 30;
export const RESERVE_STEP = 20;
export const DEFAULT_EMOJI_THEME = "animals";

const list = (s) => Object.freeze(s.split(" "));

export const EMOJI_THEMES = Object.freeze({
  animals: { name: "สัตว์", emojis: list("🦊 🐼 🐸 🐯 🐰 🐵 🐨 🦁 🐷 🐙 🐧 🦄 🐶 🐱 🐭 🐹 🐻 🐮 🐔 🐤 🦉 🐢 🦒 🦖 🐳 🐬 🦀 🐝 🦋 🐞") },
  office: { name: "ออฟฟิศ", emojis: list("💼 📎 📌 ✏️ 🖊️ 📏 📐 📁 📅 📊 📈 🖨️ 💻 ⌨️ 🖱️ ☕ 📞 📦 🗂️ 📝 🔖 🧷 ✂️ 🗃️ 💡 🔋 📮 🧮 🔍 ⏰") },
  food: { name: "อาหาร", emojis: list("🍎 🍊 🍋 🍉 🍇 🍓 🍒 🍍 🥭 🥝 🍔 🍕 🌭 🌮 🍣 🍜 🍙 🍤 🍩 🍪 🎂 🍰 🧁 🍫 🍿 🥨 🧀 🥐 🍦 🥟") },
  love: { name: "ความรัก", emojis: list("❤️ 🧡 💛 💚 💙 💜 🤍 🖤 💌 🌹 🌷 🌸 💐 🌺 🌻 🍫 🧸 🎀 💍 🕯️ 🎁 🦢 🐝 🍓 🌈 ⭐ 🌙 🧁 🎵 🦋") },
  money: { name: "เงินทอง", emojis: list("💰 💵 💴 💶 💷 💸 💳 🪙 🏦 💎 📈 📉 🧾 🏧 👛 👜 🛍️ 🛒 🎰 🏷️ ⚖️ 🧮 🔑 🏆 🎁 🐖 👑 ⌚ 🚗 🏠") },
  party: { name: "ปาร์ตี้", emojis: list("🎉 🎈 🎊 🎁 🎂 🎮 🎲 🎯 🎳 🎸 🎤 🎧 🎨 📸 🛹 ⚽ 🏀 🏈 ⚾ 🎾 🏐 🏓 🏸 🥊 🚲 🏄 🎡 🎢 🍕 🥤") },
});

// ตัวสำรองรวมหลายหมวด — ตัวที่ซ้ำกับธีมของห้องจะถูกตัดออกอัตโนมัติ
export const RESERVE_EMOJIS = list(
  "🚀 ✈️ 🚁 🚂 🚢 🚜 🏍️ 🛸 ⛵ 🚒 🌵 🌴 🍀 🍄 ☀️ ⛄ 🔥 💧 🌊 ⚡ 🪐 🗿 🏰 🗼 🎠 🧩 🪁 🎻 🥁 🎺 " +
    "🪀 🔮 🧲 🧭 ⚓ 🎩 👓 🧢 👟 🎒 ☂️ 🧤 🦷 👻 🤖 👽 🎃 🐲 🦕 🦈 🦜 🦩 🦔 🦦 🦥 🐌 🦂 🦚 🐿️ 🦓"
);

export function getThemeEmojis(themeId) {
  return (EMOJI_THEMES[themeId] || EMOJI_THEMES[DEFAULT_EMOJI_THEME]).emojis;
}

// emoji ทั้งหมดที่ห้องนี้ใช้ได้ เรียงตามลำดับที่แสดง (30 ตัวของชุดก่อน แล้วตามด้วยตัวสำรอง)
export function buildEmojiPool(baseEmojis) {
  return [...baseEmojis, ...RESERVE_EMOJIS.filter((e) => !baseEmojis.includes(e))];
}

export function getEmojiPool(themeId) {
  return buildEmojiPool(getThemeEmojis(themeId));
}

// จำนวนตัวที่แสดงให้เลือก: 30 ตัวตามธีม แล้วเพิ่มทีละ 20 เมื่อผู้เล่นเกิน 30 คน
export function visibleEmojiCount(playerCount, poolSize) {
  const extra = Math.max(0, playerCount - THEME_SIZE);
  return Math.min(poolSize, THEME_SIZE + Math.ceil(extra / RESERVE_STEP) * RESERVE_STEP);
}

export function getVisibleEmojis(themeId, playerCount) {
  return getVisibleFromBase(getThemeEmojis(themeId), playerCount);
}

export function getVisibleFromBase(baseEmojis, playerCount) {
  const pool = buildEmojiPool(baseEmojis);
  return pool.slice(0, visibleEmojiCount(playerCount, pool.length));
}

// คลัง emoji ให้ครูเลือกตัวหมากเองในหน้าแก้ชุดคำถาม (หมวด → รายการ)
export const EMOJI_CATALOG = Object.freeze({
  "🐶 สัตว์": list("🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🐛 🦋 🐌 🐞 🐢 🐍 🦎 🦖 🐙 🦑 🦀 🐠 🐬 🐳 🦈 🐊 🦓 🦒 🐘 🦛 🐪 🦘 🐿️ 🦔 🦥 🦦 🦩 🦚 🦜"),
  "🍔 อาหาร": list("🍎 🍊 🍋 🍉 🍇 🍓 🫐 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🌽 🥕 🥦 🍄 🥜 🍞 🥐 🧀 🥚 🍳 🥞 🍔 🍟 🍕 🌭 🌮 🌯 🍣 🍱 🍜 🍙 🍚 🍤 🥟 🍦 🍩 🍪 🎂 🍰 🧁 🍫 🍬 🍭 🍿 🧋 ☕ 🥤"),
  "⚽ กีฬา/เกม": list("⚽ 🏀 🏈 ⚾ 🎾 🏐 🏉 🎱 🏓 🏸 🥊 🥋 ⛳ 🏹 🎣 🛹 ⛸️ 🎿 🏆 🥇 🎯 🎳 🎮 🎲 🧩 ♟️ 🎨 🎭 🎤 🎧 🎸 🎹 🥁 🎺 🎻 🪀 🪁"),
  "🌸 ธรรมชาติ": list("🌸 🌷 🌹 🌺 🌻 🌼 💐 🌱 🌿 🍀 🍁 🍂 🌵 🌴 🌲 🌳 🌈 ☀️ 🌤️ ⛅ 🌧️ ⛈️ ❄️ ☃️ 🔥 💧 🌊 ⭐ 🌟 🌙 🪐 ☄️ 🌍"),
  "🚗 ยานพาหนะ": list("🚗 🚕 🚙 🚌 🏎️ 🚓 🚑 🚒 🚚 🚜 🛵 🏍️ 🚲 🛴 🚂 🚄 🚇 ✈️ 🚁 🚀 🛸 ⛵ 🚤 🛳️ 🚢 🎡 🎢 🗽 🗼 🏰 🏯 ⛺"),
  "🛍️ ช้อปปิ้ง/เงิน": list("🛍️ 🛒 💳 💰 💵 💴 💶 💷 💸 🪙 🏦 🏧 🧾 👛 👜 👝 🎁 🏷️ 💎 👑 💍 ⌚ 👟 👠 👗 👕 🧢 🕶️ 🧸 📦"),
  "💡 ของใช้": list("💼 📎 📌 ✏️ 🖊️ 📏 📐 📁 📅 📊 📈 💻 ⌨️ 🖱️ 📱 ☎️ 📷 🔦 💡 🔋 🔑 🔒 🧲 🔧 🔨 ⚙️ 🧮 🔍 ⏰ ⌛ 📚 📖 🎒 👓 🎈 🎀 🪄"),
  "❤️ หัวใจ/สัญลักษณ์": list("❤️ 🧡 💛 💚 💙 💜 🤍 🖤 💖 💘 💝 💯 ✅ ❌ ❓ ❗ ⚡ 💥 💫 ✨ 🎵 🔔 🏁 🚩 🔴 🟠 🟡 🟢 🔵 🟣"),
});
