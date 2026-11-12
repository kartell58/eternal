const { EventEmitter } = require("events");
const path = require("path");

const EVENTS = require("./events");
const { createLogger } = require("../logger");
const { loadConfig } = require("../config/loader");
const { createFilter } = require("../watcher/filters");
const { WatchEngine } = require("../watcher/engine");
const { ProcessManager } = require("../process/manager");
const { RestartEngine } = require("../restart/engine");

const MAX_LOG_ARG = 1000;

/**
 * BetterThanDemons — internal experimental dev-runner for Eternal.
 * Not a public package; see the root `betterThanDemons.js` CLI wrapper.
 *
 * const runtime = new BetterThanDemons({ entry: "index.js" });
 * runtime.start();
 * runtime.on(EVENTS.RESTART, ({ reason }) => ...);
 * await runtime.stop();
 */
class BetterThanDemons extends EventEmitter {
  constructor(userConfig = {}, env = process.env) {
    super();

    const config = loadConfig(userConfig, env);
    this.config = config;

    this.logger = createLogger({ name: "btd", level: config.log.level, sink: config.log.sink || null });
    config.logger = this.logger; // keep internal references consistent

    this.filter = createFilter(config.watch);
    this.restartCount = 0;
    this.status = "stopped"; // stopped | starting | running | stopping
    this.stopping = false;

    this.processManager = new ProcessManager({ logger: this.logger });
    this.processManager.on("exit", info => this.handleChildExit(info));
    this.processManager.on("spawn", info => {
      this.status = "running";
      this.emit(EVENTS.SPAWN, info);
    });
    this.processManager.on("spawnError", err => {
      this.status = "stopped";
      this.emit(EVENTS.SPAWN_ERROR, err);
      this.emit(EVENTS.ERROR, err);
    });

    this.watcher = new WatchEngine({
      root: config.cwd,
      dirs: config.watch.dirs,
      isWatchableFile: rel => this.filter.isWatchableFile(rel),
      isIgnored: rel => this.filter.isIgnored(rel),
      onFileChange: rel => {
        this.logger.debug(`change detected: ${rel}`);
        this.emit(EVENTS.FILE_CHANGE, { path: rel });
        this.restartEngine.requestRestart(rel);
      },
      logger: this.logger
    });

    this.restartEngine = new RestartEngine({
      logger: this.logger,
      debounceMs: config.restart.debounceMs,
      restartDelayMs: config.restart.restartDelayMs,
      maxConsecutiveCrashes: config.restart.maxConsecutiveCrashes,
      crashWindowMs: config.restart.crashWindowMs,
      onCrash: config.restart.onCrash,
      performRestart: reason => this.performRestart(reason),
      isShuttingDown: () => this.stopping
    });
    this.restartEngine.on("crash", info => this.emit(EVENTS.CRASH, info));
    this.restartEngine.on("crashLimit", info => this.emit(EVENTS.CRASH_LIMIT, info));
    this.restartEngine.on("restart", info => this.emit(EVENTS.RESTART, info));
    this.restartEngine.on("restartError", err => this.emit(EVENTS.RESTART_ERROR, err));
  }

  isRunning() {
    return this.status === "running" || this.status === "starting";
  }

  getStatus() {
    return {
      status: this.status,
      pid: this.processManager.getPid(),
      restarts: this.restartCount,
      crashCount: this.restartEngine.consecutiveCrashes,
      config: {
        entry: this.config.entry,
        cwd: this.config.cwd,
        configFile: this.config._configFile || null,
        graceMs: this.config.shutdown.graceMs,
        debounceMs: this.config.restart.debounceMs,
        onCrash: this.config.restart.onCrash
      }
    };
  }

  entryArgs() {
    return this.config.entry.slice();
  }

  start() {
    if (this.status !== "stopped") {
      this.logger.warn(`refusing to start — runtime is already ${this.status}`);
      return false;
    }
    this.status = "starting";
    this.logger.info(`BetterThanDemons starting (cwd: ${this.config.cwd})`);

    this.watcher.start();

    const started = this.processManager.start({ cwd: this.config.cwd, entry: this.entryArgs() });
    this.status = started ? "starting" : "stopped";
    if (started) {
      this.emit(EVENTS.START, { pid: this.processManager.getPid() });
      this.emit(EVENTS.READY, this.getStatus());
    } else {
      this.watcher.stop();
      this.status = "stopped";
      this.emit(EVENTS.ERROR, new Error("Failed to spawn the application"));
    }
    return started;
  }

  /** Request a restart (used by the watcher through RestartEngine). */
  requestRestart(reason) {
    return this.restartEngine.requestRestart(reason);
  }

  async performRestart(reason) {
    this.logger.info(`restart triggered (${reason})`);
    this.restartCount += 1;
    await this.processManager.stop("SIGTERM", this.config.shutdown.graceMs);
    const started = this.processManager.start({ cwd: this.config.cwd, entry: this.entryArgs() });
    if (!started) {
      this.logger.error("failed to restart the application — leaving runtime stopped");
      return false;
    }
    return true;
  }

  handleChildExit(info) {
    this.emit(EVENTS.EXIT, info);
    if (info.expected) {
      // Intentional stop — nothing to do here.
      if (!this.stopping) this.status = "stopped";
      return;
    }
    this.status = "stopped";
    this.restartEngine.handleCrash(info);
  }

  /**
   * Stops everything: watcher, timers, and the child (SIGTERM, then SIGKILL
   * after the configured grace period). Safe to call multiple times.
   */
  async stop() {
    if (this.stopping) return;
    this.stopping = true;
    this.status = "stopping";
    this.restartEngine.stop();
    this.watcher.stop();
    await this.processManager.stop("SIGTERM", this.config.shutdown.graceMs);
    this.status = "stopped";
    this.logger.info("runtime stopped");
    this.emit(EVENTS.STOP);
  }
}

module.exports = BetterThanDemons;
