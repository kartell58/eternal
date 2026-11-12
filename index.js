const { connect } = require("./src/connection");

let shutdownStarted = false;

async function shutdown(signal, clientPromise) {
  if (shutdownStarted) return;
  shutdownStarted = true;
  console.error(`${signal} received — shutting down gracefully...`);
  try {
    const client = await clientPromise;
    if (client) client.destroy();
  } catch (err) {
    console.error("Error while destroying the Discord client:", err);
  }
  // Give the websocket a moment to close before exiting.
  setTimeout(() => process.exit(0), 500);
}

const clientPromise = connect();

clientPromise.catch(err => {
  console.error("Failed to start the bot:", err);
  process.exit(1);
});

process.on("SIGINT", () => shutdown("SIGINT", clientPromise));
process.on("SIGTERM", () => shutdown("SIGTERM", clientPromise));
