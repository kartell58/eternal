const config = require("./config");
const { LanguageManager } = require("./manager");
const { LocaleRegistry } = require("./registry");
const { TranslationLoader } = require("./loader");
const { LocaleResolver } = require("./resolver");
const { format } = require("./formatter");
const { TranslationValidator } = require("./validator");
const { LocaleStorage } = require("./storage");

/**
 * Create and initialize the language system.
 * Usage:
 *   const language = await createLanguageManager();
 *   client.language = language;
 */
async function createLanguageManager(options = {}) {
  const manager = new LanguageManager(options);
  await manager.init();
  return manager;
}

module.exports = {
  config,
  createLanguageManager,
  LanguageManager,
  LocaleRegistry,
  TranslationLoader,
  LocaleResolver,
  TranslationValidator,
  LocaleStorage,
  format
};
