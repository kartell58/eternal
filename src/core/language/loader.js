const fs = require("fs");
const path = require("path");
const YAML = require("yaml");

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepMerge(target, source, filePath) {
  for (const [key, value] of Object.entries(source)) {
    if (Object.prototype.hasOwnProperty.call(target, key)) {
      const existing = target[key];
      if (isPlainObject(existing) && isPlainObject(value)) {
        deepMerge(existing, value, filePath);
      } else {
        const err = new Error(`Duplicate translation key "${key}" while loading ${filePath}`);
        err.code = "DUPLICATE_KEY";
        err.file = filePath;
        err.key = key;
        throw err;
      }
    } else {
      target[key] = isPlainObject(value) ? clone(value) : value;
    }
  }
  return target;
}

/**
 * Loads and parses YAML locale resources. Parsing is isolated here.
 */
class TranslationLoader {
  constructor(options = {}) {
    this.localesDir = options.localesDir;
    this.logger = options.logger || console;
  }

  /** Load all supported locales. Returns { translations, errors, loadedFiles } */
  loadAll(supportedLocales) {
    const translations = {};
    const errors = [];
    const loadedFiles = [];

    for (const locale of supportedLocales) {
      const result = this.loadLocale(locale);
      if (result.ok) {
        translations[locale] = result.data;
        loadedFiles.push(...result.files);
      } else {
        errors.push(...result.errors);
      }
      if (result.errors.length && result.ok) {
        // Non-fatal file issues collected but locale still usable: keep them.
        errors.push(...result.errors);
      }
    }

    return { translations, errors, loadedFiles };
  }

  /**
   * Load a single locale directory. A malformed/invalid file fails that file
   * (and is reported) but does not corrupt other locales or other files.
   */
  loadLocale(locale) {
    const localeDir = path.join(this.localesDir, locale);
    const data = {};
    const errors = [];
    const files = [];

    let entries;
    try {
      entries = fs.readdirSync(localeDir, { withFileTypes: true });
    } catch (err) {
      errors.push({ locale, file: localeDir, message: `Cannot read locale directory: ${err.message}`, error: err });
      return { ok: false, data, errors, files };
    }

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".yml")) continue;
      const filePath = path.join(localeDir, entry.name);
      files.push(filePath);
      try {
        const raw = fs.readFileSync(filePath, "utf8");
        const parsed = this.parseYaml(raw, filePath);
        if (parsed === null || parsed === undefined) {
          // Empty file: treat as empty object.
          continue;
        }
        if (!isPlainObject(parsed)) {
          throw new Error(`Top-level value must be a mapping/object in ${filePath}`);
        }
        deepMerge(data, parsed, filePath);
      } catch (err) {
        errors.push({ locale, file: filePath, message: err.message, error: err });
      }
    }

    return { ok: true, data, errors, files };
  }

  parseYaml(raw, filePath) {
    try {
      // yaml library: strict parsing, reports line/col on errors.
      return YAML.parse(raw, { prettyErrors: true, strict: true, uniqueKeys: true });
    } catch (err) {
      const detail = err && err.linePos
        ? ` (line ${err.linePos[0]?.line || "?"}, col ${err.linePos[0]?.col || "?"})`
        : "";
      const e = new Error(`YAML parse error in ${filePath}${detail}: ${err.message}`);
      e.code = "YAML_PARSE_ERROR";
      e.file = filePath;
      e.cause = err;
      throw e;
    }
  }

  reload(supportedLocales) {
    return this.loadAll(supportedLocales);
  }
}

module.exports = { TranslationLoader, isPlainObject, deepMerge };
