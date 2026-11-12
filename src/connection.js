const {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes
} = require("discord.js");

require("dotenv").config();

const { loadCommands, loadEvents } = require("./loader");

const { messageHandler } = require("./middlewares/messageHandler");

const INTENTS = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers, // required for welcome
  GatewayIntentBits.GuildMessages // required for messageCreate (honeypot)
];

async function connect() {
  const client = new Client({
    intents: INTENTS
  });

  const commands = loadCommands();

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
  loadEvents(client);

  client.once(Events.ClientReady, () => {
    console.log(`Logged in as ${client.user.tag}`);
  });

  await client.login(process.env.TOKEN);

  return client;
}

module.exports = { connect, INTENTS };
