const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { parseColor, isHexColor } = require('../utils/validator');

const DATA_DIR = path.join(__dirname, '..', '..', '..', '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'colors.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS container_colors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(guild_id, user_id, name COLLATE NOCASE)
  )
`);

const stmtList = db.prepare('SELECT id, name, color FROM container_colors WHERE guild_id = ? AND user_id = ? ORDER BY name COLLATE NOCASE ASC, id ASC');
const stmtUpsert = db.prepare(`
  INSERT INTO container_colors (guild_id, user_id, name, color)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(guild_id, user_id, name COLLATE NOCASE) DO UPDATE SET color = excluded.color
`);
const stmtGetById = db.prepare('SELECT id, name, color FROM container_colors WHERE guild_id = ? AND user_id = ? AND id = ?');

function toHex(color) {
  return '#' + Number(color).toString(16).padStart(6, '0').toUpperCase();
}

function listColors(guildId, userId) {
  try {
    return stmtList.all(String(guildId), String(userId)).map(r => ({ ...r, hex: toHex(r.color) }));
  } catch {
    return [];
  }
}

function saveColor(guildId, userId, name, hexOrColor) {
  const cleanName = String(name || '').trim().slice(0, 50);
  if (!cleanName) throw new Error('Color name is required.');
  if (!isHexColor(hexOrColor)) throw new Error('Color must be a valid hex color (e.g. #5865F2).');
  const color = parseColor(hexOrColor);
  if (color == null) throw new Error('Color must be a valid hex color (e.g. #5865F2).');
  stmtUpsert.run(String(guildId), String(userId), cleanName, color);
  const row = db.prepare('SELECT id, name, color FROM container_colors WHERE guild_id = ? AND user_id = ? AND name = ? COLLATE NOCASE').get(String(guildId), String(userId), cleanName);
  return row ? { ...row, hex: toHex(row.color) } : { name: cleanName, color, hex: toHex(color) };
}

function getColorById(guildId, userId, id) {
  try {
    const row = stmtGetById.get(String(guildId), String(userId), Number(id));
    return row ? { ...row, hex: toHex(row.color) } : null;
  } catch {
    return null;
  }
}

module.exports = { listColors, saveColor, getColorById, toHex, DB_PATH, _db: db };
