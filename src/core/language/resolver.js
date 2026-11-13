class LocaleResolver {
  constructor(options = {}) {
    this.config = options.config;
    this.registry = options.registry;
    this.storage = options.storage; // persistence with getUserLocale/getGuildLocale
    this.logger = options.logger || console;
  }

  /**
   * Resolve effective locale.
   * Priority: explicit override > saved user preference > saved guild preference > bot default.
   * Discord interaction.locale/guildLocale MUST NOT override saved preferences.
   */
  async resolve({ userId, guildId, locale } = {}) {
    const supported = code => this.registry.isSupported(code);
    const defaultLocale = this.config.defaultLocale || "en-US";
    const fallbackLocale = this.config.fallbackLocale || defaultLocale;

    // 1) Explicit override (internal use)
    if (locale) {
      if (supported(locale)) return locale;
      this.logInvalid("explicit", locale);
      // fall through to normal resolution levels
    }

    // 2) User preference
    if (userId && this.storage) {
      const userLocale = await this.storage.getUserLocale(userId);
      if (userLocale) {
        if (supported(userLocale)) return userLocale;
        this.logInvalid("user", userLocale, { userId });
      }
    }

    // 3) Guild preference
    if (guildId && this.storage) {
      const guildLocale = await this.storage.getGuildLocale(guildId);
      if (guildLocale) {
        if (supported(guildLocale)) return guildLocale;
        this.logInvalid("guild", guildLocale, { guildId });
      }
    }

    // 4) Default/fallback
    if (supported(defaultLocale)) return defaultLocale;
    if (supported(fallbackLocale)) return fallbackLocale;

    // Last resort: any supported locale (e.g. if en-US missing in broken env)
    const list = this.registry.list();
    if (list.length) return list[0].code;
    return "en-US";
  }

  logInvalid(source, locale, meta = {}) {
    try {
      const details = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
      this.logger.warn(`[i18n] Unsupported/invalid locale from ${source}: "${locale}"${details} — falling back`);
    } catch (_e) {
      // ignore logging failures
    }
  }
}

module.exports = { LocaleResolver };
