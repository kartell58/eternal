import { fileURLToPath, pathToFileURL } from 'url';
import fs from 'fs';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function unwrapModule(mod) {
  return mod && mod.default ? mod.default : mod;
}

export async function loadCommands() {
  const commands = new Map();

  const files = fs
    .readdirSync(path.join(__dirname, 'commands'))
    .filter(file => file.endsWith('.js'));

  for (const file of files) {
    const fullPath = path.join(__dirname, 'commands', file);
    const mod = await import(pathToFileURL(fullPath).href);
    const command = unwrapModule(mod);
    commands.set(command.data.name, command);
  }

  return commands;
}

export async function loadEvents(client) {
  const files = fs
    .readdirSync(path.join(__dirname, 'events'))
    .filter(file => file.endsWith('.js'));

  for (const file of files) {
    const fullPath = path.join(__dirname, 'events', file);
    const mod = await import(pathToFileURL(fullPath).href);
    const event = unwrapModule(mod);

    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }
  }
}