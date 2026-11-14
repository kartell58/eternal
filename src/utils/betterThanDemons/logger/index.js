const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 99
};

/**
 * Small leveled logger with timestamps. Logs go to stderr so the app's own
 * stdout stays readable when both are attached to the same terminal.
 */
function createLogger({ name = "btd", level = "info", sink = null } = {}) {
  const threshold = LEVELS[level] === undefined ? LEVELS.info : LEVELS[level];
  const out = sink || ((line) => console.error(line));

  function emit(levelName, args) {
    if (LEVELS[levelName] < threshold) return;
    const stamp = new Date().toLocaleTimeString();
    const text = args.map(part => (part instanceof Error ? part.stack || part.message : String(part))).join(" ");
    out(`[${name} ${stamp}] ${text}`);
  }

  return {
    level,
    isDebug: () => LEVELS.debug >= threshold,
    debug: (...args) => emit("debug", args),
    info: (...args) => emit("info", args),
    warn: (...args) => emit("warn", args),
    error: (...args) => emit("error", args)
  };
}

export { createLogger, LEVELS };

export default { createLogger, LEVELS };
