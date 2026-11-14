import { EmbedBuilder } from "discord.js";
import { get } from "../settings.js";
import { logger } from "../utils/logger.js";

function formatDateTime(date) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

export default {
  name: "guildMemberAdd",

  async execute(member) {
    const guild = member.guild;

    // Auto role on join
    const autoRoleId = get(guild.id, "autoRole");
    const autoRole = autoRoleId ? guild.roles.cache.get(autoRoleId) : null;

    if (autoRole) {
      try {
        await member.roles.add(autoRole);
      } catch (err) {
        logger.error("Error adding auto role:", err);
      };
    }

    // Welcome message
    const welcomeChannelId = get(guild.id, "welcomeChannel");
    const welcomeChannel = welcomeChannelId
      ? guild.channels.cache.get(welcomeChannelId)
      : null;

    const welcomeEnabled = get(guild.id, "welcomeEnabled") !== false;

    if (!welcomeChannel || !welcomeEnabled) return;

    const avatar = member.user.displayAvatarURL({ dynamic: true });

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({
        name: `@${member.user.username}`,
        iconURL: avatar
      })
      .setTitle("👋 Welcome!")
      .setDescription(`Hello ${member}, welcome to **${guild.name}**! 🎉`)
      .setThumbnail(avatar)
      .setFooter({
        text: `User ID: ${member.user.id} | ${formatDateTime(new Date())}`
      });

    try {
      await welcomeChannel.send({
        content: `${member}`,
        embeds: [embed]
      });
    } catch (err) {
      logger.error("Error sending welcome message:", err);
    }
  }
};
