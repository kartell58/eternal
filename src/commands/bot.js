const { SlashCommandBuilder } = require("discord.js");
const { buildBotPanel } = require("../utils/botPanelView");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("bot")
    .setDescription("Manage and configure the bot profile and presence"),

  async execute(interaction) {
    const lang = interaction.client.language;
    const locale = lang
      ? await lang.resolve({ userId: interaction.user.id, guildId: interaction.guildId || null })
      : "en-US";
    const panel = await buildBotPanel(interaction.client, { lang, locale });
    await interaction.reply({ ...panel, flags: 64 });
  }
};
