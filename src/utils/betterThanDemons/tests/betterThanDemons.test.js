const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const BetterThanDemons = require("..");
const EVENTS = require("../core/events");
const { createFilter } = require("../watcher/filters");

(async () => {
  const results = [];
  const test = async (name, fn) => {
    try {
      await fn();
      results.push({ name, ok: true });
    } catch (e) {
      results.push({ name, ok: false, err: e.message, stack: e.stack });
    }
  };

  function makeOptions(fixture, overrides = {}) {
    return Object.assign({
      cwd: fixture,
      restart: { debounceMs: 20, onCrash: "wait", restartDelayMs: 50, maxConsecutiveCrashes: 2, crashWindowMs: 60000 },
      shutdown: { graceMs: 800 },
      log: { level: "silent" }
    }, overrides);
  }

  async function makeFixture(files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "btd-fixture-"));
    fs.writeFileSync(path.join(dir, "fixture.testseed"), dir);
    for (const [name, content] of Object.entries(files)) {
      const target = path.join(dir, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
    return dir;
  }

  function fixtureApp(cleanupMs) {
    return `
const fs = require('fs');
const log = process.env.FIXTURE_LOG;
fs.appendFileSync(log, 'start ' + process.pid + '\\n');
setInterval(() => {}, 1000);
process.on('SIGTERM', async () => {
  const ms = Number(${cleanupMs} || process.env.FIXTURE_CLEANUP_MS || 100);
  await new Promise(r => setTimeout(r, ms));
  fs.appendFileSync(log, 'cleanup ' + process.pid + '\\n');
  process.exit(0);
});
`;
  }

  function crashApp() {
    return `const fs = require('fs'); fs.appendFileSync(process.env.FIXTURE_LOG, 'start ' + process.pid + '\\n'); console.log('crashing'); process.exit(1);\n`;
  }

  function readLog(logFile) {
    try { return fs.readFileSync(logFile, "utf8"); } catch { return ""; }
  }

  async function waitFor(cond, { timeout = 5000, interval = 25 } = {}) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (cond()) return true;
      await new Promise(r => setTimeout(r, interval));
    }
    return false;
  }

  const watchLog = dir => path.join(dir, "fixture.log");

  // ---------------------------------------------------------------- filters
  await test("filter ignores volatile paths (node_modules, data, databases, assets, rules.txt)", () => {
    const filter = createFilter({
      extensions: [".js"],
      ignored: [],
      ignoreDefaults: true
    });
    for (const rel of ["node_modules/pkg/index.js", ".git/config", "data/settings.db", "data/settings.db-wal", "dist/app.js", "logs/out.log", "src/app.db", "assets/logo.png", "rules.txt"]) {
      assert.strictEqual(filter.isIgnored(rel), true, `expected ignored: ${rel}`);
    }
    for (const rel of ["src/index.js", "index.js", "lib/tool.js"]) {
      assert.strictEqual(filter.isIgnored(rel), false, `expected watched: ${rel}`);
    }
  });

  await test("filter does not ignore source files whose path contains an ignored substring", () => {
    const filter = createFilter({ extensions: [".js"], ignored: [], ignoreDefaults: true });
    for (const rel of ["src/data-utils.js", "database/engine.js", "lib/builder/index.js", "src/logs-parser.js", "src/temp-utils.js"]) {
      assert.strictEqual(filter.isIgnored(rel), false, `must not be ignored: ${rel}`);
      assert.strictEqual(filter.isWatchableFile(rel), true, `must be watchable: ${rel}`);
    }
  });

  await test("filter watches .env, .env.local and honors custom extensions", () => {
    const filter = createFilter({ extensions: [".js", ".py"], ignored: [], ignoreDefaults: true });
    assert.strictEqual(filter.isWatchableFile(".env"), true);
    assert.strictEqual(filter.isWatchableFile(".env.local"), true);
    assert.strictEqual(filter.isWatchableFile("config/.env.production"), true);
    assert.strictEqual(filter.isWatchableFile("readme.md"), false);
    assert.strictEqual(filter.isWatchableFile("script.py"), true);
    assert.strictEqual(filter.isWatchableFile("script.js"), true);
    assert.strictEqual(filter.isWatchableFile("image.PNG"), false);
  });

  await test("custom ignore patterns support segment, suffix and glob matching", () => {
    const filter = createFilter({ extensions: [".js"], ignored: ["fixtures", "*.secret", "secret/**"], ignoreDefaults: false });
    assert.strictEqual(filter.isIgnored("fixtures/app.js"), true);
    assert.strictEqual(filter.isIgnored("src/fixtures/app.js"), true);
    assert.strictEqual(filter.isIgnored("src/app.secret"), true);
    assert.strictEqual(filter.isIgnored("secret/key.js"), true);
    assert.strictEqual(filter.isIgnored("secret/nested/key.js"), true);
    assert.strictEqual(filter.isIgnored("src/secret-valid.js"), false);
    assert.strictEqual(filter.isIgnored("src/app.js"), false);
  });

  // ------------------------------------------------------- runtime process
  await test("runtime spawns the app and restarts it when a watched file changes", async () => {
    const fixture = await makeFixture({ "app.js": fixtureApp(100) });
    const logFile = watchLog(fixture);
    const runtime = new BetterThanDemons(Object.assign(makeOptions(fixture, { entry: "app.js" }), { log: { level: "silent" } }));
    process.env.FIXTURE_LOG = logFile;
    try {
      assert.strictEqual(runtime.start(), true);
      assert.ok(await waitFor(() => (readLog(logFile).match(/start /g) || []).length === 1), "first start recorded");
      fs.appendFileSync(path.join(fixture, "app.js"), "\n// change one\n");
      assert.ok(await waitFor(() => (readLog(logFile).match(/start /g) || []).length === 2), "restart after change");
      await runtime.stop();
      const log = readLog(logFile);
      assert.ok(log.includes("cleanup"), "child cleanup ran during stop");
    } finally {
      delete process.env.FIXTURE_LOG;
      await runtime.stop();
    }
  });

  await test("newly created directory and files inside it trigger a restart", async () => {
    const fixture = await makeFixture({ "app.js": fixtureApp(60) });
    const logFile = watchLog(fixture);
    process.env.FIXTURE_LOG = logFile;
    const runtime = new BetterThanDemons(makeOptions(fixture, { entry: "app.js" }));
    try {
      runtime.start();
      assert.ok(await waitFor(() => (readLog(logFile).match(/start /g) || []).length === 1), "first start");
      fs.mkdirSync(path.join(fixture, "newdir"));
      assert.ok(await waitFor(() => (readLog(logFile).match(/start /g) || []).length >= 2), "start after directory creation");
      fs.writeFileSync(path.join(fixture, "newdir", "fresh.js"), "module.exports = 1;\n");
      assert.ok(await waitFor(() => (readLog(logFile).match(/start /g) || []).length >= 3), "start after new file creation");
      await runtime.stop();
    } finally {
      delete process.env.FIXTURE_LOG;
      await runtime.stop();
    }
  });

  await test("debounce coalesces a burst of changes into a single restart", async () => {
    const fixture = await makeFixture({ "app.js": fixtureApp(50) });
    const logFile = watchLog(fixture);
    process.env.FIXTURE_LOG = logFile;
    const options = makeOptions(fixture, { entry: "app.js", restart: { debounceMs: 120, onCrash: "wait", restartDelayMs: 10, maxConsecutiveCrashes: 2, crashWindowMs: 60000 } });
    const runtime = new BetterThanDemons(options);
    let restartCount = 0;
    runtime.on(EVENTS.RESTART, () => { restartCount += 1; });
    try {
      runtime.start();
      assert.ok(await waitFor(() => (readLog(logFile).match(/start /g) || []).length === 1), "first start");
      for (let i = 0; i < 5; i += 1) {
        fs.appendFileSync(path.join(fixture, "app.js"), `\n// burst ${i}\n`);
        await new Promise(r => setTimeout(r, 15));
      }
      assert.ok(await waitFor(() => restartCount >= 1 && (readLog(logFile).match(/start /g) || []).length === 2), "exactly one restart for the burst");
      await new Promise(r => setTimeout(r, 300));
      assert.strictEqual(restartCount, 1, "burst produced exactly one restart");
      assert.strictEqual((readLog(logFile).match(/start /g) || []).length, 2);
      await runtime.stop();
    } finally {
      delete process.env.FIXTURE_LOG;
      await runtime.stop();
    }
  });

  await test("changes arriving during a restart are queued, never overlapping processes", async () => {
    const fixture = await makeFixture({ "app.js": fixtureApp(350) });
    const logFile = watchLog(fixture);
    process.env.FIXTURE_LOG = logFile;
    const options = makeOptions(fixture, {
      entry: "app.js",
      restart: { debounceMs: 20, onCrash: "wait", restartDelayMs: 10, maxConsecutiveCrashes: 2, crashWindowMs: 60000 },
      shutdown: { graceMs: 1000 }
    });
    const runtime = new BetterThanDemons(options);
    const order = [];
    runtime.on(EVENTS.SPAWN, ({ pid }) => order.push(["spawn", pid]));
    runtime.on(EVENTS.EXIT, info => order.push([info.expected ? "stop" : "crash", info.pid]));
    try {
      runtime.start();
      assert.ok(await waitFor(() => order.filter(([kind]) => kind === "spawn").length === 1), "first child spawned");

      fs.appendFileSync(path.join(fixture, "app.js"), "\n// change one\n");
      await new Promise(r => setTimeout(r, 120)); // inside the first restart's cleanup window
      fs.appendFileSync(path.join(fixture, "app.js"), "\n// change two\n");

      assert.ok(await waitFor(() => order.filter(([kind]) => kind === "spawn").length === 3, { timeout: 6000 }), "queued restart executed");
      const kinds = order.map(([kind]) => kind);
      assert.deepStrictEqual(kinds.slice(0, 5), ["spawn", "stop", "spawn", "stop", "spawn"], `processes must not overlap: ${kinds.join(",")}`);
      assert.strictEqual(order[1][1], order[0][1], "first stop targets the first child");
      assert.strictEqual(order[3][1], order[2][1], "second stop targets the second child");
      await runtime.stop();
      const spawns = order.filter(([kind]) => kind === "spawn").length;
      const stops = order.filter(([kind, pid], i) => kind === "stop").length;
      assert.strictEqual(spawns, 3);
      assert.ok(stops >= 2, "both restarts stopped a child");
    } finally {
      delete process.env.FIXTURE_LOG;
      await runtime.stop();
    }
  });

  await test("stop() waits for the child cleanup (SIGTERM) before resolving", async () => {
    const fixture = await makeFixture({ "app.js": fixtureApp(300) });
    const logFile = watchLog(fixture);
    process.env.FIXTURE_LOG = logFile;
    const runtime = new BetterThanDemons(makeOptions(fixture, { entry: "app.js", shutdown: { graceMs: 2000 } }));
    try {
      runtime.start();
      assert.ok(await waitFor(() => (readLog(logFile).match(/start /g) || []).length === 1), "first start");
      await runtime.stop();
      const log = readLog(logFile);
      assert.ok(log.includes("cleanup"), "cleanup completed before stop() resolved");
      const secondStop = await runtime.stop(); // idempotent
      assert.strictEqual(secondStop, undefined);
    } finally {
      delete process.env.FIXTURE_LOG;
      await runtime.stop();
    }
  });

  await test("SIGKILL escalates when the child does not exit within the grace period", async () => {
    const fixture = await makeFixture({ "app.js": fixtureApp(10000) });
    const logFile = watchLog(fixture);
    process.env.FIXTURE_LOG = logFile;
    const runtime = new BetterThanDemons(makeOptions(fixture, { entry: "app.js", shutdown: { graceMs: 400 } }));
    let childPid = null;
    runtime.on(EVENTS.SPAWN, ({ pid }) => { childPid = pid; });
    try {
      runtime.start();
      assert.ok(await waitFor(() => childPid !== null, { timeout: 3000 }), "child spawned");
      await runtime.stop();
      assert.ok(await waitFor(() => {
        try { process.kill(childPid, 0); return false; } catch { return true; }
      }, { timeout: 3000 }), "child was killed after grace period");
    } finally {
      delete process.env.FIXTURE_LOG;
      await runtime.stop();
    }
  });

  await test("crash policy 'wait': no automatic restart, file change restarts", async () => {
    const fixture = await makeFixture({ "crashing.js": crashApp() });
    const logFile = watchLog(fixture);
    process.env.FIXTURE_LOG = logFile;
    const runtime = new BetterThanDemons(makeOptions(fixture, { entry: "crashing.js", restart: { debounceMs: 20, onCrash: "wait", restartDelayMs: 30, maxConsecutiveCrashes: 2, crashWindowMs: 60000 } }));
    try {
      runtime.start();
      assert.ok(await waitFor(() => (readLog(logFile).match(/start /g) || []).length >= 1), "crash app ran at least once");
      const startsBefore = (readLog(logFile).match(/start /g) || []).length;
      await new Promise(r => setTimeout(r, 700));
      assert.strictEqual((readLog(logFile).match(/start /g) || []).length, startsBefore, "no auto-restart in wait mode");
      fs.appendFileSync(path.join(fixture, "crashing.js"), "\n// kick\n");
      assert.ok(await waitFor(() => (readLog(logFile).match(/start /g) || []).length > startsBefore), "file change restarts the app");
      await runtime.stop();
    } finally {
      delete process.env.FIXTURE_LOG;
      await runtime.stop();
    }
  });

  await test("crash policy 'restart': bounded consecutive crashes, then gives up", async () => {
    const fixture = await makeFixture({ "crashing.js": crashApp() });
    const logFile = watchLog(fixture);
    process.env.FIXTURE_LOG = logFile;
    const runtime = new BetterThanDemons(makeOptions(fixture, {
      entry: "crashing.js",
      restart: { debounceMs: 10, onCrash: "restart", restartDelayMs: 30, maxConsecutiveCrashes: 2, crashWindowMs: 60000 },
      log: { level: "silent" }
    }));
    let crashEvents = 0;
    runtime.on(EVENTS.CRASH, () => { crashEvents += 1; });
    try {
      runtime.start();
      // poll the fixture log until the crash limit is exhausted
      const ok = await waitFor(() => crashEvents >= 2 && (readLog(logFile).match(/start /g) || []).length >= 3, { timeout: 8000 });
      assert.ok(ok, "crash-limit restarts happened");
      const starts = (readLog(logFile).match(/start /g) || []).length;
      assert.strictEqual(starts, 3, "initial + maxConsecutiveCrashes attempts");
      await new Promise(r => setTimeout(r, 400));
      assert.strictEqual((readLog(logFile).match(/start /g) || []).length, 3, "no endless crash loop");
      await runtime.stop();
    } finally {
      delete process.env.FIXTURE_LOG;
      await runtime.stop();
    }
  });

  await test("spawn failure (bad cwd) does not leave the runtime in an inconsistent state", async () => {
    const runtime = new BetterThanDemons({ entry: "app.js", cwd: path.join(os.tmpdir(), "btd-nonexistent-dir-xyz"), log: { level: "silent" } });
    let errorSeen = null;
    runtime.on(EVENTS.ERROR, err => { errorSeen = err; });
    // Node emits spawn failures asynchronously, so start() may return true;
    // the invariant is the runtime ends up stopped with an error surfaced.
    runtime.start();
    const ok = await waitFor(() => errorSeen instanceof Error && runtime.getStatus().status === "stopped", { timeout: 3000 });
    assert.ok(ok, "runtime reported stopped with an error event");
    assert.strictEqual(runtime.getStatus().status, "stopped");
    // The runtime stays usable: a valid entry still starts.
    const fixture = await makeFixture({ "app.js": fixtureApp(50) });
    const logFile = watchLog(fixture);
    process.env.FIXTURE_LOG = logFile;
    const runtime2 = new BetterThanDemons(makeOptions(fixture, { entry: "app.js" }));
    try {
      assert.strictEqual(runtime2.start(), true);
      assert.ok(await waitFor(() => (readLog(logFile).match(/start /g) || []).length === 1), "runtime reusable after failure");
      await runtime2.stop();
    } finally {
      delete process.env.FIXTURE_LOG;
      await runtime2.stop();
    }
  });

  await test("start() while running does not spawn a duplicate child", async () => {
    const fixture = await makeFixture({ "app.js": fixtureApp(80) });
    const logFile = watchLog(fixture);
    process.env.FIXTURE_LOG = logFile;
    const runtime = new BetterThanDemons(makeOptions(fixture, { entry: "app.js" }));
    try {
      assert.strictEqual(runtime.start(), true);
      assert.strictEqual(runtime.start(), false, "second start rejected");
      assert.ok(await waitFor(() => (readLog(logFile).match(/start /g) || []).length === 1), "exactly one child");
      await runtime.stop();
    } finally {
      delete process.env.FIXTURE_LOG;
      await runtime.stop();
    }
  });

  await test("watcher ignores data/, images and rules.txt", async () => {
    const fixture = await makeFixture({ "app.js": fixtureApp(50), "data/settings.db": "db", "image.png": "png", "rules.txt": "rules" });
    const logFile = watchLog(fixture);
    process.env.FIXTURE_LOG = logFile;
    const runtime = new BetterThanDemons(makeOptions(fixture, { entry: "app.js" }));
    try {
      runtime.start();
      assert.ok(await waitFor(() => (readLog(logFile).match(/start /g) || []).length === 1), "first start");
      fs.appendFileSync(path.join(fixture, "data/settings.db"), "x");
      fs.appendFileSync(path.join(fixture, "image.png"), "x");
      fs.appendFileSync(path.join(fixture, "rules.txt"), "x");
      await new Promise(r => setTimeout(r, 500));
      assert.strictEqual((readLog(logFile).match(/start /g) || []).length, 1, "ignored paths triggered no restart");
      await runtime.stop();
    } finally {
      delete process.env.FIXTURE_LOG;
      await runtime.stop();
    }
  });

  await test("cli shim: SIGINT to the runner shuts the app down gracefully and exits 130", async () => {
    const fixture = await makeFixture({ "app.js": fixtureApp(200) });
    const logFile = watchLog(fixture);
    const shim = path.join(__dirname, "..", "..", "..", "..", "betterThanDemons.js");
    const child = spawn(process.execPath, [shim, "app.js"], {
      cwd: fixture,
      env: Object.assign({}, process.env, { FIXTURE_LOG: logFile }),
      stdio: "ignore"
    });
    try {
      assert.ok(await waitFor(() => (readLog(logFile).match(/start /g) || []).length === 1, { timeout: 4000 }), "shim started the app");
      child.kill("SIGINT");
      const exitCode = await new Promise(resolve => child.on("exit", (code, signal) => resolve(code === null ? signal : code)));
      assert.strictEqual(exitCode, 130, `runner exited 130, got ${exitCode}`);
      assert.ok(readLog(logFile).includes("cleanup"), "child cleanup ran on runner shutdown");
    } finally {
      try { child.kill("SIGKILL"); } catch { /* already gone */ }
    }
  });

  console.log(JSON.stringify(results, null, 2));
  const failed = results.filter(r => !r.ok);
  console.log("FAILED=" + failed.length);
  if (failed.length) process.exit(1);
})();
