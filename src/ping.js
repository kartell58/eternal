const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Shows the bot's latency"),

  async execute(interaction) {
    const interactionLatency =
      Date.now() - interaction.createdTimestamp;

    const wsPing = interaction.client.ws.ping;

    const uptimeMs = interaction.client.uptime;
    const seconds = Math.floor((uptimeMs / 1000) % 60);
    const minutes = Math.floor((uptimeMs / 1000 / 60) % 60);
    const hours = Math.floor((uptimeMs / 1000 / 60 / 60) % 24);
    const days = Math.floor(uptimeMs / 1000 / 60 / 60 / 24);

    const uptime = `${days}d ${hours}h ${minutes}m ${seconds}s`;

    await interaction.reply(
      `🏓 Pong!\n` +
      `Interaction: ${interactionLatency}ms\n` +
      `WS: ${wsPing}ms\n` +
      `Uptime: ${uptime}`
    );
  }
};
