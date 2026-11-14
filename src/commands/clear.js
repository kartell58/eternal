const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { logger } = require("../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Deletes recent messages in the current channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      await interaction.reply({
        content: "❌ You do not have permission to manage messages.",
        flags: 64
      });
      return;
    }

    const channel = interaction.channel;

    if (!channel || !channel.isTextBased() || !("bulkDelete" in channel)) {
      await interaction.reply({
        content: "❌ Cannot delete messages in this channel.",
        flags: 64
      });
      return;
    }

    try {
      await interaction.deferReply({ flags: 64 });
    } catch {
      return;
    }

    try {
      const deleted = await channel.bulkDelete(100, true);
      await interaction.editReply({
        content: `🧹 Deleted ${deleted.size} message(s).`
      }).catch(() => {});
    } catch (err) {
      logger.error("Error deleting messages:", err);
      await interaction.editReply({
        content:
          "❌ Could not delete messages. Check my permissions and ensure messages are less than 14 days old."
      }).catch(() => {});
    }
  }
};
