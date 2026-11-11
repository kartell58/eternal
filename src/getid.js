const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("getid")
    .setDescription("Displays server IDs for categories, channels, members, and roles."),

  async execute(interaction) {
    const { guild } = interaction;

    const categories = guild.channels.cache
      .filter(c => c.type === 4) // Category
      .map(c => `• ${c.name} - \`${c.id}\``)
      .join("\n") || "None";

    const channels = guild.channels.cache
      .filter(c => c.type !== 4)
      .map(c => `• ${c.name} - \`${c.id}\``)
      .join("\n") || "None";

    const members = guild.members.cache
      .filter(m => !m.user.bot)
      .first(10)
      .map(m => `• @${m.user.username} - \`${m.id}\``)
      .join("\n") || "None";

    const roles = guild.roles.cache
      .filter(r => r.name !== "@everyone")
      .sort((a, b) => b.position - a.position)
      .map(r => `• @${r.name} - \`${r.id}\``)
      .join("\n") || "None";

    const embed = new EmbedBuilder()
      .setColor(0x2B2D31)
      .setTitle("📋 Server ID Directory")
      .setDescription("Here are the IDs for your server structure.")
      .addFields(
        {
          name: "📁 Categories",
          value: categories.slice(0, 1024)
        },
        {
          name: "💬 Channels",
          value: channels.slice(0, 1024)
        },
        {
          name: "👤 Members (sample)",
          value: members
        },
        {
          name: "🛡️ Roles",
          value: roles.slice(0, 1024)
        }
      )
      .setFooter({
        text: `Requested by ${interaction.user.username}`,
        iconURL: interaction.user.displayAvatarURL()
      })
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  }
};
