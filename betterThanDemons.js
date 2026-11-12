#!/usr/bin/env node
/**
 * betterThanDemons.js — experimental dev-runner (nodemon replacement).
 *
 * Spawns the app as a child process, restarts it when watched files change,
 * and shuts it down gracefully on Ctrl+C.
 *
 * Why this exists:
 *  - nodemon attaches to the terminal's foreground process group, so Ctrl+C
 *    delivers SIGINT to BOTH the watcher and the child at the same time. The
 *    child's own handlers then race the watcher, which often kills the child
 *    before its cleanup routines run. Here the child is spawned in its own
 *    process group (`detached: true`), so the terminal only reaches this
 *    process; we forward the signal ourselves and WAIT for the child to
 *    finish its cleanup before exiting (up to GRACE_MS, then SIGKILL).
 *  - File watching debounces bursts (editors writing tmp+rename) so a single
 *    save does not trigger several restarts, and common volatile paths
 *    (node_modules, data/, logs, databases, images) never trigger one.
 *  - If the app crashes, we do NOT hot-loop respawn: we log the exit and wait
 *    for a file change, like nodemon does.
 *
 * Usage:
 *   node betterThanDemons.js          # runs `node .` (package.json "main")
 *   node betterThanDemons.js src/main.js
 *
 * Env:
 *   BETTER_THAN_DEMONS_GRACE_MS  max ms to wait for child cleanup (default 8000)
 */
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = process.cwd();
const GRACE_MS = Math.max(0, Number(process.env.BETTER_THAN_DEMONS_GRACE_MS || 8000));
const DEBOUNCE_MS = 250;

const IGNORE_PATH_FRAGMENTS = [
  "node_modules", ".git", "data", "dist", "build", "out", "coverage",
  ".cache", ".tmp", "tmp", "temp", "logs", "__pycache__"
];
const IGNORE_FILE_SUFFIXES = [
  ".db", ".db-shm", ".db-wal", ".sqlite", ".sqlite3", ".log", ".tmp",
  ".bak", ".corrupt", ".swp", ".lock", "~", ".map",
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".ico", ".zip", ".mp4"
];
const IGNORE_FILE_NAMES = new Set(["rules.txt", ".ds_store", "thumbs.db"]);

const WATCH_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".json", ".env", ".txt"]);

function isIgnored(filename) {
  const rel = String(filename || "").replace(/\\/g, "/").toLowerCase();
  const base = path.posix.basename(rel);
  if (IGNORE_FILE_NAMES.has(base)) return true;
  for (const fragment of IGNORE_PATH_FRAGMENTS) {
    if (rel === fragment || rel.startsWith(fragment + "/") || rel.includes("/" + fragment + "/")) return true;
  }
  for (const suffix of IGNORE_FILE_SUFFIXES) {
    if (rel.endsWith(suffix)) return true;
  }
  return false;
}

function shouldWatch(filename) {
  if (!filename) return true; // directory event without a name: refresh conservatively
  const rel = String(filename);
  if (isIgnored(rel)) return false;
  if (path.posix.basename(rel) === ".env") return true;
  return WATCH_EXTENSIONS.has(path.extname(rel).toLowerCase());
}

function log(message) {
  const stamp = new Date().toLocaleTimeString();
  console.error(`[btd ${stamp}] ${message}`);
}

// ---------------------------------------------------------------- child app
let child = null;
let intentionalStop = false;
let shuttingDown = false;

function startChild() {
  const args = process.argv.slice(2);
  const entry = args.length ? args : ["."];

  const resolvedEntry = path.resolve(ROOT, entry[0]);
  if (path.basename(resolvedEntry) === path.basename(__filename)) {
    log("refusing to run the watcher inside itself — pass the app entry point explicitly");
    process.exit(1);
  }

  log(`starting: node ${entry.join(" ")}`);
  child = spawn(process.execPath, entry, {
    stdio: "inherit",
    env: process.env,
    detached: true // own process group: Ctrl+C reaches only this runner
  });

  child.on("error", err => {
    log(`failed to spawn the app: ${err.message}`);
    child = null;
  });

  child.on("exit", (code, signal) => {
    const expected = intentionalStop || shuttingDown;
    intentionalStop = false;
    if (!expected) {
      log(`app exited (code ${code === null ? "null" : code}, signal ${signal === null ? "null" : signal})`);
      log("waiting for a file change to start it again...");
    }
    child = null;
  });
}

async function stopChild() {
  return new Promise(resolve => {
    if (!child) return resolve();
    intentionalStop = true;
    const target = child;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      log(`child still running after ${GRACE_MS}ms — sending SIGKILL`);
      try { process.kill(-target.pid, "SIGKILL"); } catch { /* already gone */ }
      finish();
    }, GRACE_MS);
    target.once("exit", finish);
    // SIGTERM is the graceful-shutdown signal the app is expected to handle
    // (Docker/Kubernetes semantics), regardless of which signal we received.
    try {
      process.kill(-target.pid, "SIGTERM"); // whole group (child and its children)
    } catch {
      try { target.kill("SIGTERM"); } catch { /* already gone */ }
    }
  });
}

async function restartApp(changedFile) {
  log(`change detected in ${changedFile} — restarting...`);
  await stopChild();
  startChild();
}

// --------------------------------------------------------------- watching
let restartTimer = null;
function onPossibleChange(filename) {
  if (shuttingDown) return;
  if (!shouldWatch(filename)) return;
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => restartApp(filename), DEBOUNCE_MS);
}

function watchRoot(dir) {
  try {
    return [fs.watch(dir, { recursive: true }, (_event, filename) => onPossibleChange(filename || ""))];
  } catch (err) {
    // Node on Linux < 19.1 has no recursive watch; fall back to per-directory watchers.
    log(`recursive watch not available (${err.message}) — watching directories individually`);
    const watchers = [];
    const walk = current => {
      let entries;
      try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const sub = path.join(current, entry.name);
        if (isIgnored(path.relative(dir, sub))) continue;
        walk(sub);
      }
      if (isIgnored(path.relative(dir, current) || ".")) return;
      watchers.push(fs.watch(current, (_event, filename) => onPossibleChange(filename ? path.join(current, filename) : current)));
    };
    walk(dir);
    return watchers;
  }
}

// ---------------------------------------------------------------- signals
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearTimeout(restartTimer);
    log(`${sig} received — sending SIGTERM to the app (up to ${GRACE_MS}ms for cleanup)...`);
    await stopChild();
    process.exit(sig === "SIGINT" ? 130 : 143);
  });
}

// -------------------------------------------------------------------- main
const watchers = watchRoot(ROOT);
process.on("exit", () => watchers.forEach(w => { try { w.close(); } catch {} }));

log(`watching ${ROOT}`);
startChild();
