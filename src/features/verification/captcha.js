const crypto = require("crypto");
const { createCanvas } = require("@napi-rs/canvas");

const CODE_LENGTH = 6;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I, O, 0, 1 to avoid ambiguity
const OPTION_COUNT = 6;
const MAX_ATTEMPTS = 3;
const CHALLENGE_TTL_MS = 2 * 60 * 1000;

// key: `${guildId}:${userId}`
const challenges = new Map();

function randomChar() {
  return CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
}

function generateCode() {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) code += randomChar();
  return code;
}

function formatCode(code) {
  const raw = String(code || "").toUpperCase().replace(/\s+/g, "");
  if (raw.length !== CODE_LENGTH) return raw;
  return `${raw.slice(0, 3)} ${raw.slice(3)}`;
}

function shuffle(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function mutateCode(code) {
  const chars = String(code).split("");
  const changes = crypto.randomInt(1, 3); // mutate 1-2 characters
  for (let n = 0; n < changes; n += 1) {
    const index = crypto.randomInt(0, chars.length);
    let next = randomChar();
    while (next === chars[index]) next = randomChar();
    chars[index] = next;
  }
  return chars.join("");
}

function generateOptions(code) {
  const options = new Set([formatCode(code)]);
  let guard = 0;
  while (options.size < OPTION_COUNT && guard < 200) {
    guard += 1;
    options.add(formatCode(mutateCode(code)));
  }
  return shuffle([...options]);
}

const IMAGE_WIDTH = 340;
const IMAGE_HEIGHT = 120;
const DARK_PALETTE = ["#1f2937", "#111827", "#3b0764", "#0c4a6e", "#4c1d95", "#7c2d12", "#134e4a"];

function renderCaptcha(code) {
  const canvas = createCanvas(IMAGE_WIDTH, IMAGE_HEIGHT);
  const ctx = canvas.getContext("2d");

  // Background: soft gradient + grid noise
  const gradient = ctx.createLinearGradient(0, 0, IMAGE_WIDTH, IMAGE_HEIGHT);
  gradient.addColorStop(0, "#f4f6fb");
  gradient.addColorStop(1, "#dde3ef");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, IMAGE_WIDTH, IMAGE_HEIGHT);

  for (let i = 0; i < 400; i += 1) {
    ctx.fillStyle = `rgba(30, 41, 59, ${(crypto.randomInt(0, 100) / 100) * 0.12})`;
    ctx.fillRect(crypto.randomInt(0, IMAGE_WIDTH), crypto.randomInt(0, IMAGE_HEIGHT), 1.5, 1.5);
  }

  // Distractor strokes behind the text
  for (let i = 0; i < 5; i += 1) {
    ctx.strokeStyle = `rgba(${crypto.randomInt(60, 160)}, ${crypto.randomInt(60, 160)}, ${crypto.randomInt(60, 160)}, 0.55)`;
    ctx.lineWidth = crypto.randomInt(1, 3);
    ctx.beginPath();
    ctx.moveTo(crypto.randomInt(0, IMAGE_WIDTH), crypto.randomInt(0, IMAGE_HEIGHT));
    ctx.bezierCurveTo(
      crypto.randomInt(0, IMAGE_WIDTH), crypto.randomInt(0, IMAGE_HEIGHT),
      crypto.randomInt(0, IMAGE_WIDTH), crypto.randomInt(0, IMAGE_HEIGHT),
      crypto.randomInt(0, IMAGE_WIDTH), crypto.randomInt(0, IMAGE_HEIGHT)
    );
    ctx.stroke();
  }

  // Faint ghost characters
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < 8; i += 1) {
    ctx.fillStyle = `rgba(30, 41, 59, 0.10)`;
    ctx.font = `bold ${crypto.randomInt(22, 34)}px sans-serif`;
    ctx.save();
    ctx.translate(crypto.randomInt(0, IMAGE_WIDTH), crypto.randomInt(0, IMAGE_HEIGHT));
    ctx.rotate((crypto.randomInt(0, 200) - 100) / 100 * 0.6);
    ctx.fillText(randomChar(), 0, 0);
    ctx.restore();
  }

  // Main characters with per-char rotation, offset and color
  const raw = String(code);
  const cellWidth = IMAGE_WIDTH / (raw.length + 1);
  for (let i = 0; i < raw.length; i += 1) {
    const x = cellWidth * (i + 1) + (crypto.randomInt(0, 14) - 7);
    const y = IMAGE_HEIGHT / 2 + (crypto.randomInt(0, 26) - 13);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(((crypto.randomInt(0, 200) - 100) / 100) * 0.35);
    ctx.font = `bold ${crypto.randomInt(34, 46)}px sans-serif`;
    ctx.fillStyle = DARK_PALETTE[crypto.randomInt(0, DARK_PALETTE.length)];
    ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
    ctx.lineWidth = 2.5;
    ctx.strokeText(raw[i], 0, 0);
    ctx.fillText(raw[i], 0, 0);
    ctx.restore();
  }

  // Foreground scribbles over the text
  for (let i = 0; i < 3; i += 1) {
    ctx.strokeStyle = `rgba(${crypto.randomInt(20, 120)}, ${crypto.randomInt(20, 120)}, ${crypto.randomInt(20, 120)}, 0.35)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(crypto.randomInt(0, IMAGE_WIDTH), crypto.randomInt(0, IMAGE_HEIGHT));
    ctx.lineTo(crypto.randomInt(0, IMAGE_WIDTH), crypto.randomInt(0, IMAGE_HEIGHT));
    ctx.stroke();
  }

  return canvas.toBuffer("image/png");
}

function challengeKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function createChallenge(guildId, userId) {
  const code = generateCode();
  const entry = {
    guildId: String(guildId),
    userId: String(userId),
    code,
    displayCode: formatCode(code),
    options: generateOptions(code),
    attemptsLeft: MAX_ATTEMPTS,
    createdAt: Date.now(),
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
    image: renderCaptcha(code)
  };
  challenges.set(challengeKey(guildId, userId), entry);
  return entry;
}

function isExpired(entry) {
  return !entry || Date.now() >= entry.expiresAt;
}

function getChallenge(guildId, userId) {
  const entry = challenges.get(challengeKey(guildId, userId));
  if (!entry) return null;
  if (isExpired(entry)) {
    challenges.delete(challengeKey(guildId, userId));
    return null;
  }
  return entry;
}

function deleteChallenge(guildId, userId) {
  return challenges.delete(challengeKey(guildId, userId));
}

function clearChallenges() {
  challenges.clear();
}

function pruneExpired() {
  const now = Date.now();
  for (const [key, entry] of challenges) {
    if (now >= entry.expiresAt) challenges.delete(key);
  }
}

const cleanupInterval = setInterval(pruneExpired, 60 * 1000);
if (typeof cleanupInterval.unref === "function") cleanupInterval.unref();

module.exports = {
  CODE_LENGTH,
  OPTION_COUNT,
  MAX_ATTEMPTS,
  CHALLENGE_TTL_MS,
  generateCode,
  formatCode,
  generateOptions,
  renderCaptcha,
  createChallenge,
  getChallenge,
  isExpired,
  deleteChallenge,
  clearChallenges,
  pruneExpired
};
