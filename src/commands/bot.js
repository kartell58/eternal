import { SlashCommandBuilder } from "discord.js";
import { buildBotPanel } from "../utils/botPanelView.js";

export default {
  data: new SlashCommandBuilder()
    .setName("bot")
    .setDescription("Manage and configure the bot profile and presence"),

  async execute(interaction) {
    const panel = await buildBotPanel(interaction.client);
    await interaction.reply({ ...panel, flags: 64 });
  }
};
