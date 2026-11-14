import fs from "fs";
import path from "path";
import { normalizeRelative } from "./filters.js";

/**
 * Watches directories one level at a time instead of relying on
 * fs.watch({ recursive: true }), which is unavailable on several Node/platform
 * combinations and gives no hook for discovering directories created later.
 * New directories are detected from events and watched on the fly.
 */
class WatchEngine {
  /**
   * @param {object} options
   * @param {string} options.root        absolute root the watcher works against
   * @param {string[]} options.dirs      absolute directories to watch
   * @param {(relPath: string) => boolean} options.isWatchableFile
   * @param {(relPath: string) => boolean} options.isIgnored      directory pruning
   * @param {(relPath: string) => void}   options.onFileChange
   * @param {{ debug: Function, info: Function, warn: Function }} options.logger
   */
  constructor({ root, dirs, isWatchableFile, isIgnored, onFileChange, logger }) {
    this.root = root;
    this.dirs = dirs;
    this.isWatchableFile = isWatchableFile;
    this.isIgnored = isIgnored;
    this.onFileChange = onFileChange;
    this.logger = logger;
    this.watchers = new Map(); // absolute dir path -> fs.FSWatcher
    this.started = false;
  }

  key(dir) {
    return path.normalize(dir);
  }

  start() {
    if (this.started) return;
    this.started = true;
    for (const dir of this.dirs) {
      this.watchTree(dir);
    }
    this.logger.info(`watching ${this.dirs.length} root(s), ${this.watchers.size} director${this.watchers.size === 1 ? "y" : "ies"}`);
  }

  stop() {
    this.started = false;
    for (const [dir, watcher] of this.watchers) {
      try { watcher.close(); } catch { /* already closed */ }
      this.watchers.delete(dir);
    }
  }

  watchCount() {
    return this.watchers.size;
  }

  relOf(absolutePath) {
    return normalizeRelative(path.relative(this.root, absolutePath)) || ".";
  }

  watchTree(dir) {
    const absolute = path.resolve(dir);
    if (this.isIgnored(this.relOf(absolute))) return;
    let entries;
    try {
      entries = fs.readdirSync(absolute, { withFileTypes: true });
    } catch (err) {
      this.logger.warn(`cannot read directory ${absolute}: ${err.message}`);
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const sub = path.join(absolute, entry.name);
      if (this.isIgnored(normalizeRelative(path.relative(this.root, sub)))) continue;
      this.watchTree(sub);
    }
    this.addWatcher(absolute);
  }

  addWatcher(dir) {
    const key = this.key(path.resolve(dir));
    if (this.watchers.has(key)) return;
    let watcher;
    try {
      watcher = fs.watch(key, { persistent: true }, (eventType, filename) => this.onEvent(key, eventType, filename));
    } catch (err) {
      this.logger.warn(`cannot watch ${key}: ${err.message}`);
      return;
    }
    watcher.on("error", err => {
      this.logger.warn(`watcher error on ${key}: ${err.message}`);
      this.unwatch(key);
    });
    watcher.on("close", () => this.watchers.delete(key));
    this.watchers.set(key, watcher);
  }

  unwatch(dir) {
    const key = this.key(dir);
    const watcher = this.watchers.get(key);
    if (!watcher) return;
    try { watcher.close(); } catch { /* already closed */ }
    this.watchers.delete(key);
    // Release child directories too, otherwise they leak after a parent delete.
    for (const child of [...this.watchers.keys()]) {
      if (child !== key && (child.startsWith(key + path.sep) || child.startsWith(key + "/"))) {
        this.unwatch(child);
      }
    }
  }

  onEvent(dir, eventType, filename) {
    if (!this.started) return;
    const name = filename === null || filename === undefined ? "" : String(filename);
    const absolute = name ? path.join(dir, name) : dir;
    const rel = normalizeRelative(path.relative(this.root, absolute));

    if (rel && this.isIgnored(rel)) return;

    // A directory appeared (or was renamed into place): watch it immediately.
    let stat = null;
    try { stat = fs.statSync(absolute); } catch { stat = null; }

    if (stat && stat.isDirectory()) {
      this.watchTree(absolute);
      this.onFileChange(rel || ".");
      return;
    }

    if (stat === null) {
      // Deleted or renamed away. If it was a directory, drop its watchers.
      this.unwatch(absolute);
      if (rel) this.onFileChange(rel);
      return;
    }

    if (stat.isFile() && this.isWatchableFile(rel)) {
      this.onFileChange(rel);
    }
  }
}

export { WatchEngine };

export default { WatchEngine };
