const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Shows the bot's latency"),

  async execute(interaction) {
    const lang = interaction.client.language;
    // Public reply in a guild context: use guild locale; in DMs fall back to user effective.
    const locale = lang
      ? await lang.resolve({ guildId: interaction.guildId || null, userId: interaction.guildId ? null : interaction.user.id })
      : "en-US";
    const t = (key, vars) => (lang ? lang.t(key, vars, locale) : key);

    const interactionLatency = Date.now() - interaction.createdTimestamp;
    const wsPing = interaction.client.ws.ping;

    const uptimeMs = interaction.client.uptime || 0;
    const seconds = Math.floor((uptimeMs / 1000) % 60);
    const minutes = Math.floor((uptimeMs / 1000 / 60) % 60);
    const hours = Math.floor((uptimeMs / 1000 / 60 / 60) % 24);
    const days = Math.floor(uptimeMs / 1000 / 60 / 60 / 24);
    const uptime = `${days}d ${hours}h ${minutes}m ${seconds}s`;

    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle(t("commands.ping.title"))
      .addFields(
        { name: t("commands.ping.interaction"), value: `${interactionLatency}ms`, inline: true },
        { name: t("commands.ping.websocket"), value: `${wsPing}ms`, inline: true },
        { name: t("commands.ping.uptime"), value: uptime, inline: false }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};
