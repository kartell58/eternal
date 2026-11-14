import fs from "fs";
import path from "path";
import { LEVELS } from "../logger/index.js";

const DEFAULT_WATCH_EXTENSIONS = [".js", ".mjs", ".cjs", ".json", ".env", ".txt"];

const DEFAULT_IGNORED = {
  segments: [
    "node_modules", ".git", "data", "dist", "build", "coverage", "logs",
    "tmp", "temp", ".cache", "out", "__pycache__"
  ],
  suffixes: [
    ".db", ".db-shm", ".db-wal", ".sqlite", ".sqlite3", ".log", ".tmp",
    ".bak", ".corrupt", ".swp", ".lock", ".map", ".mp4", ".zip",
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".ico"
  ],
  names: ["rules.md", "rules.txt", ".ds_store", "thumbs.db"]
};

const DEFAULTS = {
  entry: ".",
  cwd: null, // resolved to process.cwd() in normalize()
  watch: {
    dirs: ["."],
    extensions: DEFAULT_WATCH_EXTENSIONS.slice(),
    ignored: [],
    ignoreDefaults: true
  },
  restart: {
    debounceMs: 250,
    onCrash: "wait",
    restartDelayMs: 1000,
    maxConsecutiveCrashes: 5,
    crashWindowMs: 30000
  },
  shutdown: {
    graceMs: 8000
  },
  log: {
    level: "info"
  }
};

const ENV_MAP = {
  BTD_ENTRY: (cfg, value) => { cfg.entry = value; },
  BTD_GRACE_MS: (cfg, value) => { cfg.shutdown.graceMs = Number(value); },
  BTD_DEBOUNCE_MS: (cfg, value) => { cfg.restart.debounceMs = Number(value); },
  BTD_ON_CRASH: (cfg, value) => { cfg.restart.onCrash = String(value).trim().toLowerCase(); },
  BTD_RESTART_DELAY_MS: (cfg, value) => { cfg.restart.restartDelayMs = Number(value); },
  BTD_MAX_CONSECUTIVE_CRASHES: (cfg, value) => { cfg.restart.maxConsecutiveCrashes = Number(value); },
  BTD_CRASH_WINDOW_MS: (cfg, value) => { cfg.restart.crashWindowMs = Number(value); },
  BTD_LOG_LEVEL: (cfg, value) => { cfg.log.level = String(value).trim().toLowerCase(); },
  BTD_WATCH: (cfg, value) => { cfg.watch.dirs = String(value).split(",").map(s => s.trim()).filter(Boolean); },
  BTD_EXTENSIONS: (cfg, value) => { cfg.watch.extensions = String(value).split(",").map(s => s.trim().toLowerCase()).filter(Boolean); },
  BTD_IGNORE: (cfg, value) => { cfg.watch.ignored = cfg.watch.ignored.concat(String(value).split(",").map(s => s.trim()).filter(Boolean)); }
};

// Config files discovered in cwd when BTD_CONFIG is not set (first match wins).
// Includes nodemon-like names for familiarity alongside the canonical btd file.
const CONFIG_FILES = ["eternal.btd.json", "btd.json", ".btdrc", ".btdrc.json"];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergeDeep(base, override) {
  if (!isPlainObject(override)) return base;
  const out = Object.assign({}, base);
  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = mergeDeep(out[key], value);
    } else if (Array.isArray(value)) {
      out[key] = value.slice();
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

function parseConfigText(raw, file) {
  const text = String(raw).replace(/^\uFEFF/, "").trim();
  if (!text) return {};
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`Cannot parse BetterThanDemons config file ${file}: ${err.message}`);
  }
  if (!isPlainObject(parsed)) {
    throw new Error(`Cannot load BetterThanDemons config file ${file}: expected a JSON object at the top level`);
  }
  return parsed;
}

function readConfigFile(env, cwd) {
  const explicit = env.BTD_CONFIG && String(env.BTD_CONFIG).trim();
  if (explicit) {
    const candidate = path.resolve(cwd, explicit);
    try {
      return { data: parseConfigText(fs.readFileSync(candidate, "utf8"), candidate), file: candidate };
    } catch (err) {
      if (err.code === "ENOENT") throw new Error(`Cannot load BetterThanDemons config file ${candidate}: file not found`);
      throw err;
    }
  }

  for (const name of CONFIG_FILES) {
    const candidate = path.join(cwd, name);
    try {
      return { data: parseConfigText(fs.readFileSync(candidate, "utf8"), candidate), file: candidate };
    } catch (err) {
      if (err.code === "ENOENT") continue;
      throw err;
    }
  }
  return { data: null, file: null };
}

function readPackageConfig(cwd) {
  const pkgFile = path.join(cwd, "package.json");
  try {
    const raw = fs.readFileSync(pkgFile, "utf8");
    const pkg = JSON.parse(raw);
    if (!isPlainObject(pkg)) return { data: null, file: null };
    const data = pkg.btdConfig || pkg.betterThanDemons;
    if (data === undefined) return { data: null, file: null };
    if (!isPlainObject(data)) {
      throw new Error(`Cannot load BetterThanDemons config from ${pkgFile}: "btdConfig"/"betterThanDemons" must be an object`);
    }
    return { data, file: `${pkgFile}#btdConfig` };
  } catch (err) {
    if (err.code === "ENOENT") return { data: null, file: null };
    throw err;
  }
}

function assertNumber(name, value, { min = 0, integer = false } = {}) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < min || (integer && !Number.isInteger(num))) {
    throw new Error(`Config value "${name}" must be ${integer ? "an integer" : "a number"} >= ${min}, got: ${JSON.stringify(value)}`);
  }
  return num;
}

function toList(value) {
  if (Array.isArray(value)) return value.map(v => String(v));
  if (typeof value === "string") return value.split(",").map(s => s.trim()).filter(Boolean);
  return value;
}

function parseDelayMs(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number" && Number.isFinite(value)) {
    // nodemon's `delay` is in seconds; accept ms when explicitly suffixed.
    return Math.round(value * 1000);
  }
  const str = String(value).trim().toLowerCase();
  const match = str.match(/^([0-9]*\.?[0-9]+)\s*(ms|s)?$/);
  if (!match) return value;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return value;
  const unit = match[2] || "s";
  return Math.round(unit === "ms" ? amount : amount * 1000);
}

function normalizeAliases(input) {
  if (!isPlainObject(input)) return input;
  const out = mergeDeep({}, input);

  // nodemon-like flat keys -> btd nested schema
  if (out.watch !== undefined && !isPlainObject(out.watch)) {
    out.watch = { dirs: toList(out.watch) };
  } else if (isPlainObject(out.watch)) {
    // allow `watch: { watch: [...] }` / `watch: ["src"]`-ish shapes inside object
    if (out.watch.watch !== undefined && out.watch.dirs === undefined) {
      out.watch.dirs = toList(out.watch.watch);
    }
  }

  if (isPlainObject(out.watch)) {
    if (out.watch.ext !== undefined && out.watch.extensions === undefined) out.watch.extensions = out.watch.ext;
    if (out.watch.ignore !== undefined && out.watch.ignored === undefined) out.watch.ignored = out.watch.ignore;
    if (typeof out.watch.extensions === "string" || Array.isArray(out.watch.extensions)) {
      const list = toList(out.watch.extensions);
      out.watch.extensions = list.map(ext => (ext.startsWith(".") ? ext : `.${ext}`).toLowerCase());
    }
    if (out.watch.ignored !== undefined) out.watch.ignored = toList(out.watch.ignored);
    if (out.watch.dirs !== undefined) out.watch.dirs = toList(out.watch.dirs);
  }

  if (out.ext !== undefined) {
    out.watch = out.watch || {};
    if (out.watch.extensions === undefined) {
      const list = toList(out.ext);
      out.watch.extensions = Array.isArray(list) ? list.map(ext => (ext.startsWith(".") ? ext : `.${ext}`).toLowerCase()) : out.ext;
    }
  }
  if (out.ignore !== undefined) {
    out.watch = out.watch || {};
    if (out.watch.ignored === undefined) out.watch.ignored = toList(out.ignore);
  }

  if (out.exec !== undefined && out.entry === undefined) {
    if (Array.isArray(out.exec)) {
      out.entry = out.exec;
    } else if (typeof out.exec === "string") {
      const cmd = out.exec.trim();
      if (cmd.startsWith("node ")) out.entry = cmd.slice(5).trim().split(/\s+/).filter(Boolean);
      else if (cmd) out.entry = cmd.split(/\s+/).filter(Boolean);
    }
  }

  if (out.delay !== undefined) {
    out.restart = out.restart || {};
    if (out.restart.debounceMs === undefined) out.restart.debounceMs = parseDelayMs(out.delay);
  }

  if (out.verbose === true) {
    out.log = out.log || {};
    if (out.log.level === undefined) out.log.level = "debug";
  }
  if (out.quiet === true) {
    out.log = out.log || {};
    if (out.log.level === undefined) out.log.level = "warn";
  }

  return out;
}

function validate(config) {
  if (typeof config.entry !== "string" && !Array.isArray(config.entry)) {
    throw new Error('Config value "entry" must be a string or an array of strings');
  }
  const entryList = Array.isArray(config.entry) ? config.entry : [config.entry];
  if (entryList.length === 0 || entryList.some(part => typeof part !== "string" || !part.trim())) {
    throw new Error('Config value "entry" must contain at least one non-empty path');
  }

  if (!Array.isArray(config.watch.dirs) || config.watch.dirs.length === 0 || config.watch.dirs.some(dir => typeof dir !== "string" || !dir.trim())) {
    throw new Error('Config value "watch.dirs" must be a non-empty array of directory paths');
  }

  if (!Array.isArray(config.watch.extensions)) {
    throw new Error('Config value "watch.extensions" must be an array of extensions like ".js"');
  }
  for (const ext of config.watch.extensions) {
    if (typeof ext !== "string" || !ext.startsWith(".")) {
      throw new Error(`Config value "watch.extensions" entries must start with ".", got: ${JSON.stringify(ext)}`);
    }
  }

  if (!Array.isArray(config.watch.ignored) || config.watch.ignored.some(pattern => typeof pattern !== "string" || !pattern.trim())) {
    throw new Error('Config value "watch.ignored" must be an array of non-empty patterns');
  }

  config.restart.debounceMs = assertNumber("restart.debounceMs", config.restart.debounceMs, { min: 0, integer: true });
  config.restart.restartDelayMs = assertNumber("restart.restartDelayMs", config.restart.restartDelayMs, { min: 0, integer: true });
  config.restart.maxConsecutiveCrashes = assertNumber("restart.maxConsecutiveCrashes", config.restart.maxConsecutiveCrashes, { min: 1, integer: true });
  config.restart.crashWindowMs = assertNumber("restart.crashWindowMs", config.restart.crashWindowMs, { min: 0, integer: true });
  config.shutdown.graceMs = assertNumber("shutdown.graceMs", config.shutdown.graceMs, { min: 0, integer: true });

  if (!["wait", "restart"].includes(config.restart.onCrash)) {
    throw new Error(`Config value "restart.onCrash" must be "wait" or "restart", got: ${JSON.stringify(config.restart.onCrash)}`);
  }

  if (!Object.prototype.hasOwnProperty.call(LEVELS, config.log.level)) {
    throw new Error(`Config value "log.level" must be one of ${Object.keys(LEVELS).join(", ")}, got: ${JSON.stringify(config.log.level)}`);
  }
}

function normalize(config, cwd) {
  const root = path.resolve(cwd);
  config.cwd = root;
  config.entry = Array.isArray(config.entry) ? config.entry.map(e => String(e)) : [String(config.entry)];
  config.watch.dirs = config.watch.dirs.map(dir => path.resolve(root, String(dir)));
  config.watch.extensions = [...new Set(config.watch.extensions.map(ext => ext.toLowerCase()))];
  config.watch.ignored = [...new Set(config.watch.ignored.map(pattern => String(pattern).trim()))];
  return config;
}

/**
 * Resolves the effective configuration.
 * Order (lowest to highest precedence):
 *   built-in defaults → package.json btdConfig/betterThanDemons → config file
 *   (BTD_CONFIG, or first of eternal.btd.json/btd.json/.btdrc/.btdrc.json)
 *   → constructor options → BTD_* env vars
 *
 * Config files accept btd's nested schema and nodemon-like aliases:
 *   watch/ext/ignore (flat), exec -> entry, delay -> restart.debounceMs,
 *   verbose/quiet -> log.level.
 */
function loadConfig(userConfig = {}, env = process.env) {
  if (!isPlainObject(userConfig)) {
    throw new Error("BetterThanDemons options must be a plain object");
  }

  const cwd = typeof userConfig.cwd === "string" && userConfig.cwd.trim() ? userConfig.cwd : process.cwd();
  const root = path.resolve(cwd);
  const { data: pkgConfig, file: pkgFile } = readPackageConfig(root);
  const { data: fileConfig, file } = readConfigFile(env, root);

  let config = clone(DEFAULTS);
  if (pkgConfig) {
    config = mergeDeep(config, normalizeAliases(pkgConfig));
    config._configFile = pkgFile;
  }
  if (fileConfig) {
    config = mergeDeep(config, normalizeAliases(fileConfig));
    config._configFile = file;
  }
  config = mergeDeep(config, normalizeAliases(userConfig));

  for (const [key, apply] of Object.entries(ENV_MAP)) {
    if (env[key] !== undefined && env[key] !== "") apply(config, env[key]);
  }

  validate(config);
  return normalize(config, cwd);
}

export { loadConfig, normalizeAliases, parseDelayMs, readConfigFile, readPackageConfig, CONFIG_FILES, DEFAULT_IGNORED, DEFAULT_WATCH_EXTENSIONS };

export default { loadConfig, normalizeAliases, parseDelayMs, readConfigFile, readPackageConfig, CONFIG_FILES, DEFAULT_IGNORED, DEFAULT_WATCH_EXTENSIONS };
