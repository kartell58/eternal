const fs = require("fs");
const path = require("path");
const config = require("./config");

const METADATA = {
  "en-US": { code: "en-US", name: "English (US)", nativeName: "English (US)" },
  "pt-BR": { code: "pt-BR", name: "Portuguese (Brazil)", nativeName: "Português (Brasil)" },
  "es-ES": { code: "es-ES", name: "Spanish (Spain)", nativeName: "Español (España)" }
};

class LocaleRegistry {
  constructor(options = {}) {
    this.config = options.config || config;
    this.localesDir = options.localesDir || this.config.localesDir;
    this.supported = new Set();
    this.metadata = new Map();
  }

  /** Discover locale directories and register supported locales. */
  discover() {
    this.supported.clear();
    this.metadata.clear();

    const candidates = new Set(this.config.supportedLocales || []);
    try {
      if (fs.existsSync(this.localesDir)) {
        for (const entry of fs.readdirSync(this.localesDir, { withFileTypes: true })) {
          if (entry.isDirectory()) candidates.add(entry.name);
        }
      }
    } catch (_err) {
      // Directory unreadable: fall back to configured locales only.
    }

    for (const code of candidates) {
      if (!this.isValidLocaleCode(code)) continue;
      const dir = path.join(this.localesDir, code);
      if (!fs.existsSync(dir)) continue;
      this.supported.add(code);
      this.metadata.set(code, this.buildMetadata(code));
    }

    // Always ensure default/fallback are registered if present.
    for (const required of [this.config.defaultLocale, this.config.fallbackLocale]) {
      if (required && fs.existsSync(path.join(this.localesDir, required))) {
        this.supported.add(required);
        if (!this.metadata.has(required)) this.metadata.set(required, this.buildMetadata(required));
      }
    }

    return this;
  }

  isValidLocaleCode(code) {
    return typeof code === "string" && /^[a-z]{2}(?:-[A-Z]{2})?$/.test(code);
  }

  isSupported(code) {
    return this.supported.has(code);
  }

  get(code) {
    return this.metadata.get(code) || null;
  }

  list() {
    return Array.from(this.supported.values())
      .map(code => this.metadata.get(code))
      .filter(Boolean)
      .sort((a, b) => a.code.localeCompare(b.code));
  }

  buildMetadata(code) {
    if (METADATA[code]) return { ...METADATA[code] };
    return { code, name: code, nativeName: code };
  }
}

module.exports = { LocaleRegistry, METADATA };
