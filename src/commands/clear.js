const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Deletes recent messages in the current channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const lang = interaction.client.language;
    const locale = lang
      ? await lang.resolve({ userId: interaction.user.id, guildId: interaction.guildId || null })
      : "en-US";
    const t = (key, vars) => (lang ? lang.t(key, vars, locale) : key);

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      await interaction.reply({
        content: t("commands.clear.no_permission"),
        flags: 64
      });
      return;
    }

    const channel = interaction.channel;

    if (!channel || !channel.isTextBased() || !("bulkDelete" in channel)) {
      await interaction.reply({
        content: t("commands.clear.cannot_delete"),
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
        content: t("commands.clear.deleted", { count: deleted.size })
      }).catch(() => {});
    } catch (err) {
      console.error("Error deleting messages:", err);
      await interaction.editReply({
        content: t("commands.clear.error")
      }).catch(() => {});
    }
  }
};
