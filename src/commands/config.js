const { SlashCommandBuilder } = require("discord.js");
const { buildPanel } = require("../utils/configView");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("config")
    .setDescription("Centralized server configuration panel"),

  async execute(interaction) {
    const lang = interaction.client.language;
    const locale = lang
      ? await lang.resolve({ userId: interaction.user.id, guildId: interaction.guildId || null })
      : "en-US";
    const panel = await buildPanel(interaction.guild, "welcome", { lang, locale });

    await interaction.reply({
      ...panel,
      flags: 64
    });
  }
};
