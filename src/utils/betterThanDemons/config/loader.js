const fs = require("fs");
const path = require("path");
const { LEVELS } = require("../logger");

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
  names: ["rules.txt", ".ds_store", "thumbs.db"]
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

function readConfigFile(env, cwd) {
  const explicit = env.BTD_CONFIG && String(env.BTD_CONFIG).trim();
  const candidate = explicit ? path.resolve(cwd, explicit) : path.join(cwd, "eternal.btd.json");
  try {
    const raw = fs.readFileSync(candidate, "utf8");
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed)) {
      throw new Error("expected a JSON object at the top level");
    }
    return { data: parsed, file: candidate };
  } catch (err) {
    if (err.code === "ENOENT") return { data: null, file: null };
    throw new Error(`Cannot load BetterThanDemons config file ${candidate}: ${err.message}`);
  }
}

function assertNumber(name, value, { min = 0, integer = false } = {}) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < min || (integer && !Number.isInteger(num))) {
    throw new Error(`Config value "${name}" must be ${integer ? "an integer" : "a number"} >= ${min}, got: ${JSON.stringify(value)}`);
  }
  return num;
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
 *   built-in defaults → eternal.btd.json (or $BTD_CONFIG) → userConfig → BTD_* env vars
 */
function loadConfig(userConfig = {}, env = process.env) {
  if (!isPlainObject(userConfig)) {
    throw new Error("BetterThanDemons options must be a plain object");
  }

  const cwd = typeof userConfig.cwd === "string" && userConfig.cwd.trim() ? userConfig.cwd : process.cwd();
  const { data: fileConfig, file } = readConfigFile(env, path.resolve(cwd));

  let config = clone(DEFAULTS);
  if (fileConfig) {
    config = mergeDeep(config, fileConfig);
    config._configFile = file;
  }
  config = mergeDeep(config, userConfig);

  for (const [key, apply] of Object.entries(ENV_MAP)) {
    if (env[key] !== undefined && env[key] !== "") apply(config, env[key]);
  }

  validate(config);
  return normalize(config, cwd);
}

module.exports = { loadConfig, DEFAULT_IGNORED, DEFAULT_WATCH_EXTENSIONS };
