const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("quest")
    .setDescription("AutoQuest control panel"),

  async execute(interaction) {
    const lang = interaction.client.language;
    const locale = lang
      ? await lang.resolve({ userId: interaction.user.id, guildId: interaction.guildId || null })
      : "en-US";
    const t = (key, vars) => (lang ? lang.t(key, vars, locale) : key);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(t("commands.quest.title"))
      .setDescription(t("commands.quest.panel_description"));

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("aq_config")
        .setLabel(t("commands.quest.configure"))
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("aq_ver")
        .setLabel(t("commands.quest.view"))
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("aq_farm")
        .setLabel(t("commands.quest.farm"))
        .setStyle(ButtonStyle.Success)
    );

    await interaction.reply({ embeds: [embed], components: [row], flags: 64 });
  }
};
