import { logger } from './src/utils/logger.js';
import { connect } from "./src/connection.js";

let shutdownStarted = false;

async function shutdown(signal, clientPromise) {
  if (shutdownStarted) return;
  shutdownStarted = true;
  logger.info(`${signal} received - shutting down gracefully...`);
  try {
    const client = await clientPromise;
    if (client) client.destroy();
  } catch (err) {
    logger.error("Error while destroying the Discord client:", err);
  }
  // Give the websocket a moment to close before exiting.
  setTimeout(() => process.exit(0), 500);
}

const clientPromise = connect();

clientPromise.catch(err => {
  logger.error("Failed to start the bot:", err);
  process.exit(1);
});

process.on("SIGINT", () => shutdown("SIGINT", clientPromise));
process.on("SIGTERM", () => shutdown("SIGTERM", clientPromise));
