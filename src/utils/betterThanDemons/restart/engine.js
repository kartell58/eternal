const { EventEmitter } = require("events");

/**
 * Serializes restarts, coalesces change bursts, and applies the crash policy.
 *
 * Restarts are chained through a single promise so they never overlap: while
 * one restart is in flight, additional file changes only mark a pending
 * restart (merged with the earliest pending reason). A restart is never
 * scheduled after the runtime shuts down.
 */
class RestartEngine extends EventEmitter {
  constructor({
    logger,
    debounceMs = 250,
    restartDelayMs = 1000,
    maxConsecutiveCrashes = 5,
    crashWindowMs = 30000,
    onCrash = "wait", // "wait": wait for a file change | "restart": auto-restart with limits
    performRestart,
    isShuttingDown = () => false
  }) {
    super();
    if (typeof performRestart !== "function") {
      throw new Error("RestartEngine requires a performRestart(reason) function");
    }
    this.logger = logger;
    this.debounceMs = debounceMs;
    this.restartDelayMs = restartDelayMs;
    this.maxConsecutiveCrashes = maxConsecutiveCrashes;
    this.crashWindowMs = crashWindowMs;
    this.onCrash = onCrash;
    this.performRestart = performRestart;
    this.isShuttingDown = isShuttingDown;

    this.debounceTimer = null;
    this.pendingReason = null;
    this.chain = Promise.resolve();
    this.running = false;   // a restart is executing right now
    this.queued = false;    // another restart was requested while one is in flight
    this.queuedReason = null;
    this.consecutiveCrashes = 0;
    this.stopped = false;
  }

  /** Called by the watcher for every relevant change. */
  requestRestart(reason) {
    if (this.stopped || this.isShuttingDown()) {
      this.logger.debug(`ignoring restart request (${reason}) — runtime is stopping`);
      return false;
    }
    if (this.debounceTimer) {
      // Coalesce the burst: keep the first pending reason.
      clearTimeout(this.debounceTimer);
      this.pendingReason = this.pendingReason ? `${this.pendingReason}, ${reason}` : reason;
    } else {
      this.pendingReason = reason;
    }
    this.debounceTimer = setTimeout(() => this.flush(), this.debounceMs);
    return true;
  }

  /** Crash policy for unexpected exits. */
  handleCrash(info) {
    this.logger.warn(`app crashed (code ${info.code === null ? "null" : info.code}, signal ${info.signal === null ? "null" : info.signal}) after ${info.runtimeMs}ms`);
    this.emit("crash", info);

    if (info.runtimeMs >= this.crashWindowMs) this.consecutiveCrashes = 0;
    this.consecutiveCrashes += 1;

    if (this.onCrash === "wait") {
      this.logger.info("waiting for a file change to restart (restart.onCrash=wait)");
      return;
    }

    if (this.consecutiveCrashes > this.maxConsecutiveCrashes) {
      this.logger.error(`crash limit reached (${this.consecutiveCrashes}/${this.maxConsecutiveCrashes}) — giving up; restart manually or fix the error`);
      this.emit("crashLimit", { count: this.consecutiveCrashes });
      return;
    }

    this.logger.info(`auto-restarting in ${this.restartDelayMs}ms (crash ${this.consecutiveCrashes}/${this.maxConsecutiveCrashes})`);
    this.scheduleCrash(this.restartDelayMs);
  }

  /** Reset crash counter — the app stayed up long enough to be healthy. */
  noteStable() {
    this.consecutiveCrashes = 0;
  }

  reset() {
    this.consecutiveCrashes = 0;
  }

  /** Flush the debounce and enqueue the restart. */
  flush() {
    this.debounceTimer = null;
    if (this.stopped || this.isShuttingDown()) return;
    const reason = this.pendingReason;
    this.pendingReason = null;
    if (!reason) return;
    this.enqueue(reason);
  }

  /**
   * Adds the restart to the serialized chain. If a restart is already
   * running, remember that one more is needed and coalesce reasons.
   */
  enqueue(reason) {
    if (this.running) {
      this.queued = true;
      this.queuedReason = this.queuedReason ? `${this.queuedReason}, ${reason}` : reason;
      this.logger.debug(`restart already in flight — queuing (${reason})`);
      return;
    }
    this.running = true;
    this.chain = this.chain.then(() => this.execute(reason)).catch(err => {
      this.logger.error("restart failed:", err);
      this.emit("restartError", err);
    });
  }

  async execute(reason) {
    if (this.stopped || this.isShuttingDown()) {
      this.running = false;
      return;
    }
    this.emit("restart", { reason });
    try {
      await this.performRestart(reason);
    } finally {
      this.running = false;
      if (this.queued && !this.stopped && !this.isShuttingDown()) {
        const queuedReason = this.queuedReason || "queued change";
        this.queued = false;
        this.queuedReason = null;
        this.logger.info(`processing restart queued during the previous one (${queuedReason})`);
        this.chain = this.chain.then(() => this.execute(queuedReason)).catch(err => {
          this.logger.error("restart failed:", err);
          this.emit("restartError", err);
        });
      }
    }
  }

  scheduleCrash(delayMs) {
    if (this.stopped || this.isShuttingDown()) return;
    // Scheduled crash restarts also go through the chain so they never
    // overlap a file-triggered restart.
    setTimeout(() => {
      if (this.stopped || this.isShuttingDown()) return;
      this.enqueue("crash");
    }, delayMs).unref();
  }

  /** Stop everything: clear debounce/queue. In-flight restarts are not interrupted. */
  stop() {
    this.stopped = true;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
    this.pendingReason = null;
    this.queued = false;
    this.queuedReason = null;
  }
}

module.exports = { RestartEngine };
