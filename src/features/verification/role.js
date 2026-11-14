import settings from "../../settings.js";
import { logger } from "../../utils/logger.js";

function readSetting(getSetting) {
  return getSetting || ((guildId, key) => settings.get(guildId, key));
}

function resolveVerificationRole(interaction, getSetting) {
  const read = readSetting(getSetting);
  const guild = interaction.guild;
  if (!guild) return null;
  const roleId = read(guild.id, "verificationRole");
  if (!roleId) return null;
  if (!guild.roles || !guild.roles.cache) return null;
  return guild.roles.cache.get(roleId) || null;
}

/**
 * Assigns the configured verification role to the interacting member.
 * Shared by the legacy `btn_verify` flow and the CAPTCHA verification flow.
 *
 * Returns { status, message? } where status is one of:
 * "assigned" | "already" | "not-configured" | "hierarchy" | "error"
 */
async function assignVerificationRole(interaction, { getSetting } = {}) {
  const read = readSetting(getSetting);
  const guild = interaction.guild;
  const role = resolveVerificationRole(interaction, read);

  if (!role) {
    return {
      status: "not-configured",
      message: "Verification role is not configured. Please notify an administrator."
    };
  }

  if (interaction.member.roles.cache.has(role.id)) {
    return {
      status: "already",
      message: "You already have the verification role!"
    };
  }

  const me = guild.members && guild.members.me;
  if (me && me.roles.highest.position <= role.position) {
    return {
      status: "hierarchy",
      message: "I cannot assign this role due to role hierarchy. Please notify an administrator."
    };
  }

  try {
    await interaction.member.roles.add(role, "Verification completed");
    return {
      status: "assigned",
      message: `Congratulations! You received the ${role} role.`
    };
  } catch (err) {
    logger.error("Error adding verification role:", err);
    return {
      status: "error",
      message: "Error assigning role. Please try again or notify an administrator."
    };
  }
}

export { assignVerificationRole, resolveVerificationRole };

export default { assignVerificationRole, resolveVerificationRole };
