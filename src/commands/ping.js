import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export default {
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

    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle("🏓 Pong!")
      .addFields(
        { name: "Interaction", value: `${interactionLatency}ms`, inline: true },
        { name: "WS", value: `${wsPing}ms`, inline: true },
        { name: "Uptime", value: uptime, inline: false }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};
