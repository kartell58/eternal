const config = require("./config");
const { LocaleRegistry } = require("./registry");
const { TranslationLoader, isPlainObject } = require("./loader");
const { LocaleResolver } = require("./resolver");
const { format } = require("./formatter");
const { TranslationValidator, getByPath } = require("./validator");
const { LocaleStorage } = require("./storage");

function isPlain(obj) {
  return isPlainObject(obj);
}

class LanguageManager {
  constructor(options = {}) {
    this.config = options.config || config;
    this.logger = options.logger || console;
    this.registry = options.registry || new LocaleRegistry({ config: this.config, localesDir: this.config.localesDir });
    this.loader = options.loader || new TranslationLoader({ localesDir: this.config.localesDir, logger: this.logger });
    this.storage = options.storage || new LocaleStorage(options.storageOptions || {});
    this.resolver = options.resolver || new LocaleResolver({ config: this.config, registry: this.registry, storage: this.storage, logger: this.logger });
    this.validator = options.validator || new TranslationValidator({ referenceLocale: this.config.defaultLocale });
    this.translations = {};
    this.initialized = false;
    this.diagnostics = { loadErrors: [], validation: null, missingKeyWarnings: new Set() };
  }

  async init() {
    this.registry.discover();
    this.storage.init();

    const supported = this.registry.list().map(l => l.code);
    const { translations, errors } = this.loader.loadAll(supported);
    this.translations = translations || {};
    this.diagnostics.loadErrors = errors || [];

    for (const err of this.diagnostics.loadErrors) {
      this.logger.error(`[i18n] ${err.message}`);
    }

    this.diagnostics.validation = this.validator.validate(this.translations);
    if (!this.diagnostics.validation.ok) {
      this.logger.warn(`[i18n] ${this.validator.formatReport(this.diagnostics.validation)}`);
    } else {
      this.logger.log(`[i18n] Loaded locales: ${supported.join(", ")}`);
    }

    // Ensure default locale data exists in memory (may be empty but must not crash)
    if (!this.translations[this.config.defaultLocale]) {
      this.translations[this.config.defaultLocale] = this.translations[this.config.defaultLocale] || {};
    }

    this.initialized = true;
    return this;
  }

  /** Resolve effective locale (async). */
  async resolve(context = {}) {
    if (!this.initialized) await this.init();
    return this.resolver.resolve(context);
  }

  /**
   * Translate a key. Signature: t(key, variables?, locale?)
   * - Never throws for missing keys/translations; returns fallback/default string and logs diagnostics.
   * - variables can be omitted: t(key, localeString)
   */
  t(key, variables = {}, locale = undefined) {
    let vars = variables;
    let loc = locale;

    if (typeof variables === "string" && locale === undefined) {
      loc = variables;
      vars = {};
    }
    if (!isPlain(vars)) vars = {};
    if (typeof key !== "string" || !key) return "";

    const effectiveLocale = this.pickLocale(loc);
    const result = this.lookup(key, effectiveLocale);

    let value = result.value;
    if (result.missing) {
      // Try default/fallback locale before giving up
      const fallbackLocale = this.pickLocale(this.config.fallbackLocale);
      if (fallbackLocale !== effectiveLocale) {
        const fb = this.lookup(key, fallbackLocale);
        if (!fb.missing) {
          value = fb.value;
          this.logMissingKey(key, effectiveLocale, `used fallback locale ${fallbackLocale}`);
        } else {
          this.logMissingKey(key, effectiveLocale, "missing in effective and fallback locales");
        }
      } else {
        this.logMissingKey(key, effectiveLocale, "missing translation key");
      }
    }

    if (typeof value !== "string") {
      // Non-string leaf (unexpected) - do not crash
      if (value === undefined || value === null) return key;
      if (typeof value === "number" || typeof value === "boolean") return String(value);
      return key;
    }

    const formatted = format(value, vars);
    if (formatted.missing.length) {
      this.logMissingVars(key, effectiveLocale, formatted.missing);
    }
    return formatted.value;
  }

  /** Alias for t */
  translate(key, variables, locale) {
    return this.t(key, variables, locale);
  }

  lookup(key, locale) {
    const dict = this.translations[locale] || {};
    const res = getByPath(dict, key);
    if (!res.found) return { missing: true, value: undefined };
    return { missing: false, value: res.value };
  }

  has(key, locale) {
    const loc = this.pickLocale(locale);
    return !this.lookup(key, loc).missing;
  }

  pickLocale(locale) {
    if (locale && this.registry.isSupported(locale)) return locale;
    if (locale) this.logger.warn(`[i18n] Unsupported locale "${locale}" passed to t(); using default`);
    const def = this.config.defaultLocale || "en-US";
    if (this.registry.isSupported(def)) return def;
    const list = this.registry.list();
    return list.length ? list[0].code : def;
  }

  logMissingKey(key, locale, reason) {
    const id = `${locale}::${key}`;
    if (this.diagnostics.missingKeyWarnings.has(id)) return;
    this.diagnostics.missingKeyWarnings.add(id);
    this.logger.warn(`[i18n] Missing translation key "${key}" for locale "${locale}" (${reason})`);
  }

  logMissingVars(key, locale, vars) {
    const id = `${locale}::${key}::${vars.join(",")}`;
    if (this.diagnostics.missingKeyWarnings.has(id)) return;
    this.diagnostics.missingKeyWarnings.add(id);
    this.logger.warn(`[i18n] Missing variable(s) [${vars.join(", ")}] for "${key}" in "${locale}"`);
  }

  async setUserLocale(userId, locale) {
    this.assertSupported(locale);
    if (!this.initialized) await this.init();
    return this.storage.setUserLocale(userId, locale);
  }

  async setGuildLocale(guildId, locale) {
    this.assertSupported(locale);
    if (!this.initialized) await this.init();
    return this.storage.setGuildLocale(guildId, locale);
  }

  async resetUserLocale(userId) {
    if (!this.initialized) await this.init();
    return this.storage.resetUserLocale(userId);
  }

  async resetGuildLocale(guildId) {
    if (!this.initialized) await this.init();
    return this.storage.resetGuildLocale(guildId);
  }

  assertSupported(locale) {
    if (!this.registry.isSupported(locale)) {
      const err = new Error(`Unsupported locale: ${locale}`);
      err.code = "UNSUPPORTED_LOCALE";
      err.locale = locale;
      throw err;
    }
  }

  getSupportedLocales() {
    return this.registry.list();
  }

  getDefaultLocale() {
    return this.config.defaultLocale;
  }

  getDiagnostics() {
    return {
      loadErrors: this.diagnostics.loadErrors.slice(),
      validation: this.diagnostics.validation,
      missingKeyWarnings: Array.from(this.diagnostics.missingKeyWarnings)
    };
  }

  async reload() {
    this.registry.discover();
    const supported = this.registry.list().map(l => l.code);
    const { translations, errors } = this.loader.reload(supported);
    this.translations = translations || {};
    this.diagnostics.loadErrors = errors || [];
    this.diagnostics.missingKeyWarnings.clear();
    this.diagnostics.validation = this.validator.validate(this.translations);
    for (const err of this.diagnostics.loadErrors) this.logger.error(`[i18n] ${err.message}`);
    if (!this.diagnostics.validation.ok) {
      this.logger.warn(`[i18n] ${this.validator.formatReport(this.diagnostics.validation)}`);
    }
    return this.getDiagnostics();
  }

  close() {
    if (this.storage) this.storage.close();
  }
}

module.exports = { LanguageManager };
