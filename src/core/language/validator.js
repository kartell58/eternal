const { isPlainObject } = require("./loader");

function collectLeafPaths(obj, prefix = "") {
  const paths = [];
  if (!isPlainObject(obj)) {
    if (prefix) paths.push(prefix);
    return paths;
  }
  const keys = Object.keys(obj);
  if (keys.length === 0) {
    if (prefix) paths.push(prefix);
    return paths;
  }
  for (const key of keys) {
    const next = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];
    if (isPlainObject(value)) {
      paths.push(...collectLeafPaths(value, next));
    } else {
      paths.push(next);
    }
  }
  return paths;
}

function getByPath(obj, dotted) {
  const parts = dotted.split(".");
  let current = obj;
  for (const part of parts) {
    if (!isPlainObject(current) && !Array.isArray(current)) return { found: false };
    if (!Object.prototype.hasOwnProperty.call(current, part)) return { found: false };
    current = current[part];
  }
  return { found: true, value: current };
}

/**
 * Validates translation structures across locales.
 * - compares against a reference locale (default)
 * - detects missing/unexpected keys
 * - detects invalid values and empty translations
 */
class TranslationValidator {
  constructor(options = {}) {
    this.referenceLocale = options.referenceLocale || "en-US";
  }

  validate(translations) {
    const report = {
      ok: true,
      referenceLocale: this.referenceLocale,
      locales: {},
      issues: []
    };

    const locales = Object.keys(translations || {});
    if (!locales.length) {
      report.ok = false;
      report.issues.push({ type: "no_locales", message: "No locales loaded" });
      return report;
    }

    const ref = translations[this.referenceLocale] || translations[locales[0]];
    const refLocaleName = translations[this.referenceLocale] ? this.referenceLocale : locales[0];
    report.referenceLocale = refLocaleName;
    const refPaths = collectLeafPaths(ref);

    // Validate reference locale values too
    report.locales[refLocaleName] = this.validateLocaleValues(refLocaleName, ref, refPaths);
    if (report.locales[refLocaleName].issues.length) report.ok = false;

    for (const locale of locales) {
      if (locale === refLocaleName) continue;
      const data = translations[locale];
      const paths = collectLeafPaths(data);
      const missing = refPaths.filter(p => !paths.includes(p));
      const unexpected = paths.filter(p => !refPaths.includes(p));
      const valueIssues = this.validateLocaleValues(locale, data, paths).issues;

      const localeReport = { missing, unexpected, issues: valueIssues };
      report.locales[locale] = localeReport;

      for (const key of missing) {
        report.issues.push({ type: "missing_key", locale, key, message: `Missing key "${key}" in ${locale}` });
      }
      for (const key of unexpected) {
        report.issues.push({ type: "unexpected_key", locale, key, message: `Unexpected key "${key}" in ${locale} (not in ${refLocaleName})` });
      }
      for (const issue of valueIssues) {
        report.issues.push(issue);
      }
      if (missing.length || unexpected.length || valueIssues.length) report.ok = false;
    }

    return report;
  }

  validateLocaleValues(locale, data, paths) {
    const issues = [];
    for (const key of paths) {
      const { value } = getByPath(data, key);
      if (value === null) {
        issues.push({ type: "invalid_value", locale, key, message: `Null value at "${key}" in ${locale}` });
        continue;
      }
      if (isPlainObject(value)) {
        // empty object leaf
        if (Object.keys(value).length === 0) {
          issues.push({ type: "empty_translation", locale, key, message: `Empty object at "${key}" in ${locale}` });
        }
        continue;
      }
      if (Array.isArray(value)) {
        issues.push({ type: "invalid_value", locale, key, message: `Array value not supported at "${key}" in ${locale}` });
        continue;
      }
      if (typeof value === "string" && value.trim() === "") {
        issues.push({ type: "empty_translation", locale, key, message: `Empty translation at "${key}" in ${locale}` });
      }
      if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
        issues.push({ type: "invalid_value", locale, key, message: `Invalid value type at "${key}" in ${locale}` });
      }
    }
    return { locale, issues };
  }

  formatReport(report) {
    if (!report || report.ok) return "i18n validation: OK";
    const lines = ["i18n validation: issues found"];
    for (const issue of report.issues || []) {
      lines.push(`- [${issue.type}] ${issue.message}`);
    }
    return lines.join("\n");
  }
}

module.exports = { TranslationValidator, collectLeafPaths, getByPath };
