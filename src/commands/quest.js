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
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🚀 AutoQuest")
      .setDescription(
        "Connect your account to farm quests automatically.\n" +
        "Click **Configure account**, then **View quests** or **Start farm**."
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("aq_config")
        .setLabel("Configure account")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("aq_ver")
        .setLabel("View quests")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("aq_farm")
        .setLabel("Start farm")
        .setStyle(ButtonStyle.Success)
    );

    await interaction.reply({ embeds: [embed], components: [row], flags: 64 });
  }
};
