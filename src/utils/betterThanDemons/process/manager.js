const { spawn } = require("child_process");
const path = require("path");
const { EventEmitter } = require("events");

const KILL_TIMEOUT_MS = 2000;

function killGroup(pid, signal) {
  // The child is spawned detached, so it leads its own process group;
  // signalling the group reaches grandchildren too.
  try {
    process.kill(-pid, signal);
    return true;
  } catch {
    try { process.kill(pid, signal); return true; } catch { return false; }
  }
}

/**
 * Owns the lifecycle of the child application: spawning, group management,
 * graceful shutdown (SIGTERM -> wait -> SIGKILL) and exit classification.
 */
class ProcessManager extends EventEmitter {
  constructor({ logger }) {
    super();
    this.logger = logger;
    this.child = null;
    this.status = "stopped"; // stopped | starting | running | stopping
    this.lastStartedAt = 0;
    this.lastExitExpected = false;
  }

  isRunning() {
    return this.status === "running" || this.status === "starting";
  }

  isAlive() {
    return this.child !== null;
  }

  getPid() {
    return this.child ? this.child.pid : null;
  }

  getStartedAt() {
    return this.lastStartedAt;
  }

  /**
   * Starts the application. Refuses to start while a previous instance is
   * starting/running/stopping so we never produce duplicates.
   * Returns true when a new process was spawned.
   */
  start({ cwd, entry }) {
    if (this.isRunning() || this.status === "stopping") {
      this.logger.warn(`refusing to spawn — instance already ${this.status}`);
      return false;
    }

    const entryArgs = Array.isArray(entry) ? entry : [entry];
    this.status = "starting";
    this.lastStartedAt = Date.now();
    this.lastExitExpected = false;

    let child;
    try {
      child = spawn(process.execPath, entryArgs, {
        cwd,
        env: process.env,
        stdio: "inherit",
        detached: true // own process group: Ctrl+C reaches only this runner
      });
    } catch (err) {
      this.status = "stopped";
      this.child = null;
      this.logger.error(`failed to spawn the app: ${err.message}`);
      this.emit("spawnError", err);
      return false;
    }

    this.child = child;
    this.logger.info(`starting: node ${entryArgs.join(" ")} (pid ${child.pid})`);

    child.on("error", err => {
      this.logger.error(`child process error: ${err.message}`);
      this.lastExitExpected = true; // no process existed; nothing to classify as a crash
      this.child = null;
      this.status = "stopped";
      this.emit("spawnError", err);
    });

    child.on("spawn", () => {
      if (this.status === "starting") this.status = "running";
      this.emit("spawn", { pid: child.pid });
    });

    child.on("exit", (code, signal) => {
      const expected = this.lastExitExpected;
      const info = { code, signal, pid: child.pid, expected, runtimeMs: Date.now() - this.lastStartedAt };
      this.child = null;
      this.status = "stopped";
      this.emit("exit", info);
    });

    return true;
  }

  /**
   * Waits for a just-spawned child to reach the spawn event (or die early).
   * SIGTERMing a process that has not started executing can kill it before it
   * installs its cleanup handlers — restarting during a boot would otherwise
   * be indistinguishable from a crash from the app's point of view.
   */
  async waitForSpawn(child, timeoutMs) {
    if (this.status !== "starting") return;
    await new Promise(resolve => {
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(done, timeoutMs);
      child.once("spawn", done);
      child.once("exit", done);
      child.once("error", done);
    });
  }

  /**
   * Stops the child gracefully: SIGTERM to the process group, wait for the
   * exit event up to graceMs, then escalate to SIGKILL.
   * Resolves as soon as the child is gone; never resolves while it lives.
   */
  async stop(signal = "SIGTERM", graceMs = 8000) {
    const child = this.child;
    if (!child) return;

    await this.waitForSpawn(child, Math.min(graceMs, 2000));
    if (!this.child) return; // exited (or failed to spawn) while waiting
    const current = this.child;

    this.lastExitExpected = true;
    this.status = "stopping";
    this.logger.info(`stopping pid ${current.pid} — sending ${signal} (up to ${graceMs}ms for cleanup)`);

    await new Promise(resolve => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        this.logger.warn(`child still running after ${graceMs}ms — sending SIGKILL`);
        killGroup(current.pid, "SIGKILL");
        // Give the kernel a beat to reap the group before giving up on the wait.
        setTimeout(finish, KILL_TIMEOUT_MS).unref();
      }, graceMs);
      current.once("exit", finish);
      killGroup(current.pid, signal);
    });
  }
}

module.exports = { ProcessManager, killGroup };
