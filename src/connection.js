import {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes
} from "discord.js";

import dotenv from "dotenv";

dotenv.config();

import { loadCommands, loadEvents } from "./loader.js";
import { logger } from "./utils/logger.js";

import { messageHandler } from "./middlewares/messageHandler.js";

const INTENTS = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers, // required for welcome
  GatewayIntentBits.GuildMessages // required for messageCreate (honeypot)
];

async function connect() {
  const client = new Client({
    intents: INTENTS
  });

  const commands = await loadCommands();

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    {
      body: [...commands.values()].map(cmd =>
        cmd.data.toJSON()
      )
    }
  );

  // Slash commands
  client.on(Events.InteractionCreate, interaction =>
    messageHandler(interaction, commands)
  );

  // Events loader (WELCOME, etc)
  await loadEvents(client);

  client.once(Events.ClientReady, () => {
    logger.info(`Logged in as ${client.user.tag}`);
  });

  await client.login(process.env.TOKEN);

  return client;
}

export { connect, INTENTS };

export default { connect, INTENTS };
