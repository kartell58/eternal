const { SlashCommandBuilder } = require("discord.js");
const { buildPanel } = require("../utils/configView");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("config")
    .setDescription("Centralized server configuration panel"),

  async execute(interaction) {
    const panel = buildPanel(interaction.guild, "welcome");

    await interaction.reply({
      ...panel,
      flags: 64
    });
  }
};
