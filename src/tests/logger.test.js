const assert = require('assert');

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (err) {
    results.push({ name, ok: false, err: err && err.message ? err.message : String(err), stack: err && err.stack });
  }
}

function withEnv(key, value, fn) {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
}

async function main() {
  const loggerModule = require('../utils/logger');
  const { LEVELS, createLogger, logger } = loggerModule;

  await test('exports shared logger API', () => {
    assert.ok(LEVELS && typeof LEVELS === 'object');
    assert.strictEqual(typeof createLogger, 'function');
    assert.ok(logger && typeof logger.info === 'function');
    assert.strictEqual(Object.isFrozen(LEVELS), true);
  });

  await test('default logger behavior and format', () => {
    const lines = [];
    const meta = [];
    const l = createLogger({
      name: 'eternal',
      level: 'info',
      sink: (line, m) => { lines.push(line); meta.push(m); }
    });
    l.info('Quest started');
    assert.strictEqual(lines.length, 1);
    assert.match(lines[0], /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[INFO\] \[eternal\] Quest started$/);
    assert.strictEqual(meta[0].level, 'info');
    assert.strictEqual(meta[0].name, 'eternal');
    assert.ok(meta[0].timestamp instanceof Date);
  });

  await test('every severity level emits expected label', () => {
    const lines = [];
    const l = createLogger({ name: 'svc', level: 'debug', sink: (line) => lines.push(line) });
    l.debug('d');
    l.info('i');
    l.warn('w');
    l.error('e');
    assert.strictEqual(lines.length, 4);
    assert.match(lines[0], /\] \[DEBUG\] \[svc\] d$/);
    assert.match(lines[1], /\] \[INFO\] \[svc\] i$/);
    assert.match(lines[2], /\] \[WARN\] \[svc\] w$/);
    assert.match(lines[3], /\] \[ERROR\] \[svc\] e$/);
  });

  await test('level filtering avoids formatting filtered args', () => {
    const lines = [];
    let calls = 0;
    const bomb = { toJSON() { calls++; throw new Error('should not serialize'); } };
    const l = createLogger({ level: 'error', sink: (line) => lines.push(line) });
    l.info('ignored', bomb);
    l.debug(bomb);
    assert.strictEqual(lines.length, 0);
    assert.strictEqual(calls, 0);
    l.error('boom');
    assert.strictEqual(lines.length, 1);
  });

  await test('silent mode suppresses all levels', () => {
    const lines = [];
    const l = createLogger({ level: 'silent', sink: (line) => lines.push(line) });
    l.debug('d'); l.info('i'); l.warn('w'); l.error('e');
    assert.strictEqual(lines.length, 0);
  });

  await test('invalid level fallback is info', () => {
    const lines = [];
    const l = createLogger({ level: 'nope', sink: (line) => lines.push(line) });
    l.debug('d');
    l.info('i');
    assert.strictEqual(lines.length, 1);
    assert.match(lines[0], /\[INFO\] i$/);
  });

  await test('LOG_LEVEL environment configuration', () => {
    withEnv('LOG_LEVEL', 'warn', () => {
      delete require.cache[require.resolve('../utils/logger')];
      const mod = require('../utils/logger');
      const lines = [];
      const l = mod.createLogger({ name: 'env', sink: (line) => lines.push(line) });
      l.info('i');
      l.warn('w');
      assert.strictEqual(lines.length, 1);
      assert.match(lines[0], /\[WARN\] \[env\] w$/);
      delete require.cache[require.resolve('../utils/logger')];
    });
  });

  await test('explicit configuration precedence over environment', () => {
    withEnv('LOG_LEVEL', 'error', () => {
      const lines = [];
      const l = createLogger({ level: 'debug', sink: (line) => lines.push(line) });
      l.debug('d');
      assert.strictEqual(lines.length, 1);
      assert.match(lines[0], /\[DEBUG\] d$/);
    });
  });

  await test('child logger inherits parent effective configuration', () => {
    const lines = [];
    const meta = [];
    const parent = createLogger({ name: 'eternal', level: 'warn', sink: (line, m) => { lines.push(line); meta.push(m); } });
    const child = parent.child('autoquest');
    child.info('hidden');
    child.warn('shown');
    assert.strictEqual(lines.length, 1);
    assert.match(lines[0], /\[WARN\] \[eternal:autoquest\] shown$/);
    assert.strictEqual(meta[0].name, 'eternal:autoquest');
  });

  await test('nested child scopes and overrides', () => {
    const lines = [];
    const base = createLogger({ name: 'eternal', level: 'info', sink: (line) => lines.push(line) });
    const a = base.child('autoquest');
    const b = a.child('execution');
    b.info('Quest started');
    assert.match(lines[0], /\[INFO\] \[eternal:autoquest:execution\] Quest started$/);

    const debugChild = base.child('debuggy', { level: 'debug' });
    debugChild.debug('d');
    assert.match(lines[1], /\[DEBUG\] \[eternal:debuggy\] d$/);
    base.debug('nope');
    assert.strictEqual(lines.length, 2);
  });

  await test('child sink override and invalid child level fallback', () => {
    const a = [];
    const b = [];
    const parent = createLogger({ name: 'p', level: 'info', sink: (line) => a.push(line) });
    const child = parent.child('c', { sink: (line) => b.push(line), level: 'bogus' });
    child.info('x');
    assert.strictEqual(a.length, 0);
    assert.strictEqual(b.length, 1);
    child.debug('y');
    assert.strictEqual(b.length, 1);
  });

  await test('custom sink behavior and log(level, ...)', () => {
    const seen = [];
    const l = createLogger({ sink: (line, meta) => seen.push({ line, meta }) });
    l.log('warn', 'hello', 1);
    l.log('NOT_A_LEVEL', 'fallback');
    assert.strictEqual(seen[0].meta.level, 'warn');
    assert.match(seen[0].line, /\[WARN\] hello 1$/);
    assert.strictEqual(seen[1].meta.level, 'info');
  });

  await test('sink failure handling does not crash and falls back', () => {
    const errs = [];
    const warns = [];
    const logs = [];
    const origErr = console.error;
    const origWarn = console.warn;
    const origLog = console.log;
    console.error = (...args) => errs.push(args.join(' '));
    console.warn = (...args) => warns.push(args.join(' '));
    console.log = (...args) => logs.push(args.join(' '));
    try {
      const l = createLogger({ name: 'svc', sink: () => { throw new Error('sink boom'); } });
      assert.doesNotThrow(() => l.warn('still works'));
      assert.doesNotThrow(() => l.info('info works'));
    } finally {
      console.error = origErr;
      console.warn = origWarn;
      console.log = origLog;
    }
    assert.ok(errs.some(x => x.includes('[LOGGER_SINK_ERROR]') && x.includes('sink boom')));
    assert.ok(warns.some(x => x.includes('[WARN] [svc] still works')));
    assert.ok(logs.some(x => x.includes('[INFO] [svc] info works')));
  });

  await test('error serialization preserves stack traces', () => {
    const lines = [];
    const l = createLogger({ sink: (line) => lines.push(line) });
    const err = new Error('kapow');
    l.error('failed', err);
    assert.ok(lines[0].includes('failed Error: kapow'));
    assert.ok(lines[0].includes('at '));
  });

  await test('safe serialization of special values and multiple args', () => {
    const lines = [];
    const l = createLogger({ sink: (line) => lines.push(line) });
    const circular = { a: 1 };
    circular.self = circular;
    const sym = Symbol('x');
    l.info('values', undefined, null, 123n, sym, circular, { ok: true });
    assert.ok(lines[0].includes('undefined'));
    assert.ok(lines[0].includes('null'));
    assert.ok(lines[0].includes('123n'));
    assert.ok(lines[0].includes('Symbol(x)'));
    assert.ok(lines[0].includes('[Circular]'));
    assert.ok(lines[0].includes('"ok":true'));
  });

  await test('serialization failures are handled safely', () => {
    const lines = [];
    const l = createLogger({ sink: (line) => lines.push(line) });
    const bad = { toJSON() { throw new Error('nope-json'); } };
    l.info('bad', bad);
    assert.ok(lines[0].includes('[Unserializable: nope-json]'));
  });

  await test('empty messages and no-scope logger', () => {
    const lines = [];
    const l = createLogger({ name: null, sink: (line) => lines.push(line) });
    l.info();
    l.warn('');
    assert.match(lines[0], /^\[.*\] \[INFO\]$/);
    assert.match(lines[1], /^\[.*\] \[WARN\]$/);
  });

  await test('logger instances are immutable', () => {
    const l = createLogger({ name: 'x' });
    assert.strictEqual(Object.isFrozen(l), true);
  });

  await test('AutoQuest logger callback compatibility', () => {
    const autoFarm = require('../utils/autoFarm');
    assert.strictEqual(typeof autoFarm._createLogger, 'function');
    const calls = [];
    const emit = autoFarm._createLogger((line, level, message) => calls.push({ line, level, message }));
    emit('quest', 'Starting: Example Quest');
    emit('progress', '50%');
    emit('ok', 'Quest completed: Example Quest');
    emit('warn', 'slow');
    emit('error', 'boom');
    assert.deepStrictEqual(calls.map(c => c.level), ['quest', 'progress', 'ok', 'warn', 'error']);
    assert.strictEqual(calls[0].message, 'Starting: Example Quest');
    assert.strictEqual(calls[0].line, '[QUEST] Starting: Example Quest');
    assert.strictEqual(calls[1].line, '[PROG] 50%');
    assert.strictEqual(calls[2].line, '[ OK ] Quest completed: Example Quest');
  });

  console.log(JSON.stringify(results, null, 2));
  const failed = results.filter(r => !r.ok);
  console.log('FAILED=' + failed.length);
  if (failed.length) process.exit(1);
}

main().catch(err => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
