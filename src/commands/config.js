import { SlashCommandBuilder } from "discord.js";
import { buildPanel } from "../utils/configView.js";

export default {
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
