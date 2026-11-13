/**
 * betterThanDemons — internal experimental development runner for Eternal.
 *
 * NOT a public package. Replaces the old root-level betterThanDemons.js with
 * a modular implementation (watcher / process / restart / config / logger).
 *
 * Usage (module):
 *   const BetterThanDemons = require("./utils/betterThanDemons");
 *   const runtime = new BetterThanDemons({ entry: "index.js" });
 *   runtime.start();
 *
 * CLI (root betterThanDemons.js shim):
 *   node betterThanDemons.js [entry]
 *
 * Configuration (lowest to highest precedence):
 *   defaults → package.json "btdConfig"/"betterThanDemons"
 *            → config file (BTD_CONFIG, or first found: eternal.btd.json, btd.json, .btdrc, .btdrc.json)
 *            → constructor options → BTD_* env vars
 *
 * Config files accept btd's nested schema and nodemon-like aliases:
 *   watch (array/string) / ext / ignore, exec -> entry, delay -> restart.debounceMs (s or ms),
 *   verbose/quiet -> log.level.
 *
 * Constructor options:
 *   entry     string | string[]   app entry point(s) for `node <entry>`
 *   cwd       string              project root to watch/run in (default: process.cwd())
 *   watch     { dirs, extensions, ignored, ignoreDefaults }
 *   restart   { debounceMs, onCrash, restartDelayMs, maxConsecutiveCrashes, crashWindowMs }
 *   shutdown  { graceMs }
 *   log       { level }           debug | info | warn | error | silent
 *
 * Environment variables:
 *   BTD_ENTRY, BTD_WATCH, BTD_EXTENSIONS, BTD_IGNORE, BTD_GRACE_MS,
 *   BTD_DEBOUNCE_MS, BTD_ON_CRASH, BTD_RESTART_DELAY_MS,
 *   BTD_MAX_CONSECUTIVE_CRASHES, BTD_CRASH_WINDOW_MS, BTD_LOG_LEVEL, BTD_CONFIG
 */
const BetterThanDemons = require("./core/runtime");
const EVENTS = require("./core/events");
const { loadConfig } = require("./config/loader");

module.exports = BetterThanDemons;
module.exports.EVENTS = EVENTS;
module.exports.loadConfig = loadConfig;
