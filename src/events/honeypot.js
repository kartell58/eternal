import { Events } from "discord.js";
import { get } from "../settings.js";
import { logger } from "../utils/logger.js";

export default {
  name: Events.MessageCreate,

  async execute(message) {
    if (message.author.bot) return;

    const guild = message.guild;
    if (!guild) return;

    const honeypotChannelId = get(guild.id, "honeypotChannel");
    if (!honeypotChannelId || message.channel.id !== honeypotChannelId) return;

    const member = message.member;
    if (!member) return;

    // Delete the message that triggered the honeypot
    try {
      await message.delete();
    } catch (err) {
      logger.warn("Honeypot: could not delete the message:", err);
    };
    // Do not try to punish the server owner
    if (member.id === guild.ownerId) return;

    const me = guild.members.me;
    if (!me) return;

    // Check hierarchy: the bot must be above the member to punish them
    if (member.roles.highest.position >= me.roles.highest.position) {
      logger.warn(`Honeypot: could not softban ${member.user.tag} (insufficient role hierarchy).`);
      return;
    }

    // Softban = ban while deleting recent messages, then unban immediately.
    try {
      await member.ban({
        reason: "Honeypot/anti-selfbot: message sent in restricted channel",
        deleteMessageSeconds: 3600
      });
      await guild.members.unban(
        member.id,
        "Automatic honeypot softban"
      );
      logger.info(`Honeypot: softban applied to ${member.user.tag} (${member.id}).`);
    } catch (err) {
      logger.error("Error applying honeypot softban:", err);
    }
  }
};
