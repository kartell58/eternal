const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { logger } = require("./logger");

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const DB_PATH = path.join(DATA_DIR, "tokens.db");
const LEGACY_JSON_PATH = path.join(DATA_DIR, "tokens.json");

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS user_tokens (
    user_id TEXT PRIMARY KEY,
    token TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

const stmtGet = db.prepare("SELECT token FROM user_tokens WHERE user_id = ?");
const stmtSet = db.prepare(`
  INSERT INTO user_tokens (user_id, token, updated_at)
  VALUES (?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(user_id) DO UPDATE SET
    token = excluded.token,
    updated_at = CURRENT_TIMESTAMP
`);
const stmtRemove = db.prepare("DELETE FROM user_tokens WHERE user_id = ?");
const stmtCount = db.prepare("SELECT COUNT(*) AS count FROM user_tokens");

function migrateFromLegacyJsonIfNeeded() {
  try {
    const { count } = stmtCount.get();
    if (count > 0) return;
    if (!fs.existsSync(LEGACY_JSON_PATH)) return;

    const raw = fs.readFileSync(LEGACY_JSON_PATH, "utf8");
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) return;

    const insert = db.transaction(entries => {
      for (const [userId, token] of entries) {
        if (!userId || token == null || String(token).trim() === "") continue;
        stmtSet.run(String(userId), String(token).trim());
      }
    });

    insert(Object.entries(data));
  } catch (err) {
    logger.error("Error migrating legacy tokens:", err.message);
  }
}

migrateFromLegacyJsonIfNeeded();

function get(userId) {
  if (!userId) return null;
  try {
    const row = stmtGet.get(String(userId));
    return row ? row.token : null;
  } catch (err) {
    logger.error("Error reading token:", err.message);
    return null;
  }
}

function set(userId, token) {
  if (!userId) return;
  try {
    stmtSet.run(String(userId), String(token).trim());
  } catch (err) {
    logger.error("Error saving token:", err.message);
  }
}

function remove(userId) {
  if (!userId) return;
  try {
    stmtRemove.run(String(userId));
  } catch (err) {
    logger.error("Error removing token:", err.message);
  }
}

module.exports = { get, set, remove, DB_PATH };
