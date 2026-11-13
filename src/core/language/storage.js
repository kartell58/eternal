const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

/**
 * Separate persistence for user and guild locale preferences.
 * - Stores preferences only (no translations).
 * - Uses SQLite with inline schema creation and WAL, consistent with project conventions.
 * - No duplicate records (PRIMARY KEY / UNIQUE); upsert on set.
 * - Missing records => null (caller inherits default).
 */
class LocaleStorage {
  constructor(options = {}) {
    this.dataDir = options.dataDir || path.join(__dirname, "..", "..", "..", "data");
    this.dbPath = options.dbPath || path.join(this.dataDir, "language.db");
    this.db = null;
    this.statements = {};
  }

  init() {
    if (this.db) return this;
    fs.mkdirSync(this.dataDir, { recursive: true });
    this.db = new Database(this.dbPath);
    this.db.pragma("journal_mode = WAL");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_locale_preferences (
        user_id TEXT PRIMARY KEY,
        locale TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS guild_locale_preferences (
        guild_id TEXT PRIMARY KEY,
        locale TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    this.statements = {
      getUser: this.db.prepare("SELECT locale FROM user_locale_preferences WHERE user_id = ?"),
      setUser: this.db.prepare(
        "INSERT INTO user_locale_preferences (user_id, locale, updated_at) VALUES (?, ?, datetime('now')) " +
          "ON CONFLICT(user_id) DO UPDATE SET locale = excluded.locale, updated_at = excluded.updated_at"
      ),
      resetUser: this.db.prepare("DELETE FROM user_locale_preferences WHERE user_id = ?"),
      getGuild: this.db.prepare("SELECT locale FROM guild_locale_preferences WHERE guild_id = ?"),
      setGuild: this.db.prepare(
        "INSERT INTO guild_locale_preferences (guild_id, locale, updated_at) VALUES (?, ?, datetime('now')) " +
          "ON CONFLICT(guild_id) DO UPDATE SET locale = excluded.locale, updated_at = excluded.updated_at"
      ),
      resetGuild: this.db.prepare("DELETE FROM guild_locale_preferences WHERE guild_id = ?")
    };

    return this;
  }

  ensure() {
    if (!this.db) this.init();
  }

  async getUserLocale(userId) {
    if (!userId) return null;
    this.ensure();
    try {
      const row = this.statements.getUser.get(String(userId));
      return row ? row.locale : null;
    } catch (_err) {
      return null;
    }
  }

  async setUserLocale(userId, locale) {
    if (!userId) throw new Error("userId is required");
    this.ensure();
    this.statements.setUser.run(String(userId), String(locale));
    return { userId: String(userId), locale: String(locale) };
  }

  async resetUserLocale(userId) {
    if (!userId) throw new Error("userId is required");
    this.ensure();
    const info = this.statements.resetUser.run(String(userId));
    return { userId: String(userId), reset: info.changes > 0 };
  }

  async getGuildLocale(guildId) {
    if (!guildId) return null;
    this.ensure();
    try {
      const row = this.statements.getGuild.get(String(guildId));
      return row ? row.locale : null;
    } catch (_err) {
      return null;
    }
  }

  async setGuildLocale(guildId, locale) {
    if (!guildId) throw new Error("guildId is required");
    this.ensure();
    this.statements.setGuild.run(String(guildId), String(locale));
    return { guildId: String(guildId), locale: String(locale) };
  }

  async resetGuildLocale(guildId) {
    if (!guildId) throw new Error("guildId is required");
    this.ensure();
    const info = this.statements.resetGuild.run(String(guildId));
    return { guildId: String(guildId), reset: info.changes > 0 };
  }

  close() {
    if (this.db) {
      try { this.db.close(); } catch (_e) { /* ignore */ }
      this.db = null;
      this.statements = {};
    }
  }
}

module.exports = { LocaleStorage };
