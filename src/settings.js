const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const DATA_DIR = path.join(__dirname, "..", "data");
const DB_PATH = path.join(DATA_DIR, "settings.db");
const LEGACY_JSON_PATH = path.join(__dirname, "..", "settings.json");

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (guild_id, key)
  )
`);

const stmtGet = db.prepare("SELECT value FROM guild_settings WHERE guild_id = ? AND key = ?");
const stmtSet = db.prepare(
  "INSERT INTO guild_settings (guild_id, key, value) VALUES (?, ?, ?) " +
    "ON CONFLICT(guild_id, key) DO UPDATE SET value = excluded.value"
);
const stmtRemove = db.prepare("DELETE FROM guild_settings WHERE guild_id = ? AND key = ?");
const stmtGetAll = db.prepare("SELECT key, value FROM guild_settings WHERE guild_id = ?");
const stmtCount = db.prepare("SELECT COUNT(*) AS count FROM guild_settings");

function migrateLegacyJson() {
  try {
    if (!fs.existsSync(LEGACY_JSON_PATH)) return;
    const { count } = stmtCount.get();
    if (count > 0) return;

    const raw = fs.readFileSync(LEGACY_JSON_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;

    const insertMany = db.transaction(entries => {
      for (const [guildId, guildData] of entries) {
        if (!guildData || typeof guildData !== "object" || Array.isArray(guildData)) continue;
        for (const [key, value] of Object.entries(guildData)) {
          stmtSet.run(String(guildId), String(key), JSON.stringify(value));
        }
      }
    });

    insertMany(Object.entries(parsed));
    console.log("Migrated legacy settings.json into SQLite database.");
  } catch (err) {
    console.error("Error migrating legacy settings.json:", err);
  }
}

migrateLegacyJson();

// Get setting for a specific guild
function get(guildId, key) {
  try {
    const row = stmtGet.get(String(guildId), String(key));
    if (!row) return undefined;
    return JSON.parse(row.value);
  } catch (err) {
    console.error("Error reading setting:", err);
    return undefined;
  }
}

// Set setting for a specific guild
function set(guildId, key, value) {
  try {
    stmtSet.run(String(guildId), String(key), JSON.stringify(value));
  } catch (err) {
    console.error("Error saving setting:", err);
  }
}

// Remove setting for a specific guild
function remove(guildId, key) {
  try {
    stmtRemove.run(String(guildId), String(key));
  } catch (err) {
    console.error("Error removing setting:", err);
  }
}

// Get all settings for a guild
function getAll(guildId) {
  try {
    const rows = stmtGetAll.all(String(guildId));
    const result = {};
    for (const row of rows) {
      try {
        result[row.key] = JSON.parse(row.value);
      } catch {
        result[row.key] = undefined;
      }
    }
    return result;
  } catch (err) {
    console.error("Error reading guild settings:", err);
    return {};
  }
}

module.exports = { get, set, remove, getAll, _db: db };
