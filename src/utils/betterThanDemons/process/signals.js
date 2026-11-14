/**
 * Traps SIGINT/SIGTERM in the runner process and performs a graceful stop:
 * SIGTERM to the child, wait for its cleanup, then exit 130/143.
 * The child runs in its own process group, so terminal Ctrl+C never reaches
 * it directly — this forwarding path is the only one, and it is patient.
 */
function installSignalHandlers(runtime, { exitProcess = code => process.exit(code) } = {}) {
  let handled = false;

  const handler = async signal => {
    if (handled) return;
    handled = true;
    runtime.logger.info(`${signal} received — sending SIGTERM to the app (up to ${runtime.config.shutdown.graceMs}ms for cleanup)...`);
    try {
      await runtime.stop();
    } catch (err) {
      runtime.logger.error("error while stopping the runtime:", err);
    }
    exitProcess(signal === "SIGINT" ? 130 : 143);
  };

  const onSigint = () => handler("SIGINT");
  const onSigterm = () => handler("SIGTERM");

  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);

  return function uninstall() {
    process.removeListener("SIGINT", onSigint);
    process.removeListener("SIGTERM", onSigterm);
    handled = false;
  };
}

export { installSignalHandlers };

export default { installSignalHandlers };
