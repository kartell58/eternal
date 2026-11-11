const fs = require("fs");
const path = require("path");

function loadCommands() {
  const commands = new Map();

  const files = fs
    .readdirSync(path.join(__dirname, "commands"))
    .filter(file => file.endsWith(".js"));

  for (const file of files) {
    const command = require(path.join(__dirname, "commands", file));
    commands.set(command.data.name, command);
  }

  return commands;
}

function loadEvents(client) {
  const files = fs
    .readdirSync(path.join(__dirname, "events"))
    .filter(file => file.endsWith(".js"));

  for (const file of files) {
    const event = require(path.join(__dirname, "events", file));

    if (event.once) {
      client.once(event.name, (...args) =>
        event.execute(...args, client)
      );
    } else {
      client.on(event.name, (...args) =>
        event.execute(...args, client)
      );
    }
  }
}

module.exports = { loadCommands, loadEvents };
