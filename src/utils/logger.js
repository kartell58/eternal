const LEVELS = Object.freeze({
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 99
});

const TAGS = Object.freeze({
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR'
});

/**
 * Resolve a level name to a known level or fallback to "info".
 * Used for configured levels and for dynamic logger.log(level, ...) calls.
 */
function normalizeLevel(level, fallback) {
  const fb = Object.prototype.hasOwnProperty.call(LEVELS, fallback) ? fallback : 'info';
  if (typeof level !== 'string') return fb;
  const key = level.toLowerCase();
  return Object.prototype.hasOwnProperty.call(LEVELS, key) ? key : fb;
}

function resolveConfiguredLevel(explicitLevel, inheritedLevel) {
  if (typeof explicitLevel === 'string') return normalizeLevel(explicitLevel, 'info');
  if (typeof inheritedLevel === 'string') return normalizeLevel(inheritedLevel, 'info');
  return normalizeLevel(process.env.LOG_LEVEL, 'info');
}

function safeStringify(value) {
  const seen = new WeakSet();
  try {
    return JSON.stringify(value, (key, val) => {
      if (typeof val === 'bigint') return `${val.toString()}n`;
      if (typeof val === 'symbol') return val.toString();
      if (typeof val === 'function') return `[Function ${val.name || 'anonymous'}]`;
      if (val && typeof val === 'object') {
        if (seen.has(val)) return '[Circular]';
        seen.add(val);
      }
      return val;
    });
  } catch (err) {
    return `[Unserializable: ${err && err.message ? err.message : String(err)}]`;
  }
}

function formatArg(arg) {
  if (arg instanceof Error) return arg.stack || arg.message || String(arg);
  if (typeof arg === 'string') return arg;
  if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
  if (typeof arg === 'bigint') return `${arg.toString()}n`;
  if (typeof arg === 'symbol') return arg.toString();
  if (typeof arg === 'undefined') return 'undefined';
  if (arg === null) return 'null';
  return safeStringify(arg);
}

function formatMessage(args) {
  if (!args || args.length === 0) return '';
  let out = '';
  for (let i = 0; i < args.length; i++) {
    const part = formatArg(args[i]);
    out += i === 0 ? part : ` ${part}`;
  }
  return out;
}

function defaultConsoleSink(line, levelName) {
  if (levelName === 'error') console.error(line);
  else if (levelName === 'warn') console.warn(line);
  else console.log(line);
}

function joinScope(parentName, childName) {
  const child = typeof childName === 'string' ? childName.trim() : String(childName == null ? '' : childName).trim();
  const segments = [];
  if (parentName) segments.push(parentName);
  if (child) segments.push(child);
  return segments.length ? segments.join(':') : null;
}

function createLogger(options = {}) {
  const name = options.name == null || options.name === '' ? null : String(options.name);
  const level = resolveConfiguredLevel(options.level, options._inheritedLevel);
  const threshold = LEVELS[level];
  const sink = typeof options.sink === 'function' ? options.sink : null;

  function write(levelName, line, args) {
    if (sink) {
      try {
        sink(line, { level: levelName, name, timestamp: new Date(), args });
        return;
      } catch (sinkErr) {
        try {
          const detail = sinkErr && sinkErr.stack ? sinkErr.stack : String(sinkErr);
          defaultConsoleSink(`[LOGGER_SINK_ERROR] ${detail}`, 'error');
          defaultConsoleSink(line, levelName);
        } catch {
          // Final fallback: never let sink failures crash unrelated operations.
        }
      }
      return;
    }
    defaultConsoleSink(line, levelName);
  }

  function emit(levelName, args) {
    if (threshold >= LEVELS.silent) return;
    if (LEVELS[levelName] < threshold) return;

    const tag = TAGS[levelName] || String(levelName).toUpperCase();
    const iso = new Date().toISOString();
    const message = formatMessage(args);
    const prefix = name ? `[${iso}] [${tag}] [${name}]` : `[${iso}] [${tag}]`;
    const line = message ? `${prefix} ${message}` : prefix;
    write(levelName, line, args);
  }

  const api = {
    name,
    level,
    child(childName, childOptions = {}) {
      const nextName = joinScope(name, childName);
      const nextLevel = Object.prototype.hasOwnProperty.call(childOptions, 'level')
        ? childOptions.level
        : level;
      const nextSink = Object.prototype.hasOwnProperty.call(childOptions, 'sink')
        ? childOptions.sink
        : sink;
      return createLogger({
        name: nextName,
        level: nextLevel,
        sink: nextSink,
        _inheritedLevel: level
      });
    },
    debug(...args) { emit('debug', args); },
    info(...args) { emit('info', args); },
    warn(...args) { emit('warn', args); },
    error(...args) { emit('error', args); },
    log(levelName, ...args) { emit(normalizeLevel(levelName, 'info'), args); }
  };

  return Object.freeze(api);
}

const logger = createLogger({ name: 'eternal' });

export { LEVELS, createLogger, logger };

export default { LEVELS, createLogger, logger };
