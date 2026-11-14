const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 99
};

const TAGS = {
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR'
};

function normalizeLevel(level) {
  if (!level) return 'info';
  const key = String(level).toLowerCase();
  return Object.prototype.hasOwnProperty.call(LEVELS, key) ? key : 'info';
}

function formatArg(arg) {
  if (arg instanceof Error) return arg.stack || arg.message;
  if (typeof arg === 'string') return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function timestamp() {
  return new Date().toISOString();
}

function createLogger(options = {}) {
  const name = options.name ? String(options.name) : null;
  const level = normalizeLevel(options.level || process.env.LOG_LEVEL || 'info');
  const threshold = LEVELS[level];
  const sink = typeof options.sink === 'function' ? options.sink : null;

  function shouldLog(levelName) {
    return LEVELS[levelName] >= threshold && threshold < LEVELS.silent;
  }

  function emit(levelName, args) {
    if (!shouldLog(levelName)) return;
    const tag = TAGS[levelName] || String(levelName).toUpperCase();
    const prefix = name ? `[${timestamp()}] [${tag}] [${name}]` : `[${timestamp()}] [${tag}]`;
    const message = args.map(formatArg).join(' ');
    const line = message ? `${prefix} ${message}` : prefix;

    if (sink) {
      sink(line, { level: levelName, name, timestamp: new Date(), args });
      return;
    }

    if (levelName === 'error') console.error(line);
    else if (levelName === 'warn') console.warn(line);
    else console.log(line);
  }

  const logger = {
    name,
    level,
    child(childName, childOptions = {}) {
      const nextName = name ? `${name}:${childName}` : String(childName);
      return createLogger(Object.assign({}, options, childOptions, { name: nextName, level: childOptions.level || level }));
    },
    debug(...args) { emit('debug', args); },
    info(...args) { emit('info', args); },
    warn(...args) { emit('warn', args); },
    error(...args) { emit('error', args); },
    log(levelName, ...args) { emit(normalizeLevel(levelName), args); }
  };

  return logger;
}

const logger = createLogger({ name: 'eternal' });

module.exports = {
  LEVELS,
  createLogger,
  logger
};
