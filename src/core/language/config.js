const path = require("path");

const DEFAULT_LOCALE = "en-US";

module.exports = {
  defaultLocale: DEFAULT_LOCALE,
  fallbackLocale: DEFAULT_LOCALE,
  // Locales bundled with the bot. Discovery can extend this, but these are
  // always considered supported when their directories are present.
  supportedLocales: ["en-US", "pt-BR", "es-ES"],
  localesDir: path.join(__dirname, "..", "..", "locales")
};
