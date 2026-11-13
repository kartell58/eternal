const settings = require("../../settings");

const DEFAULTS = {
  "events.verification.role.not_configured": "Verification role is not configured. Please notify an administrator.",
  "events.verification.role.already": "You already have the verification role!",
  "events.verification.role.hierarchy": "I cannot assign this role due to role hierarchy. Please notify an administrator.",
  "events.verification.role.assigned": "Congratulations! You received the {{role}} role.",
  "events.verification.role.error": "Error assigning role. Please try again or notify an administrator."
};

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

function fallbackTranslate(key, vars = {}) {
  let value = DEFAULTS[key] != null ? DEFAULTS[key] : key;
  if (vars && typeof value === "string") {
    for (const [k, v] of Object.entries(vars)) {
      value = value.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g"), String(v));
    }
  }
  return value;
}

async function resolveTranslator(interaction, { lang = null, locale = undefined, t = null } = {}) {
  if (typeof t === "function") return t;
  const language = lang || (interaction && interaction.client ? interaction.client.language : null);
  if (!language) return (key, vars) => fallbackTranslate(key, vars);
  let loc = locale;
  if (!loc) {
    try {
      loc = await language.resolve({
        userId: interaction && interaction.user ? interaction.user.id : undefined,
        guildId: interaction && interaction.guildId ? interaction.guildId : (interaction && interaction.guild ? interaction.guild.id : undefined)
      });
    } catch {
      loc = language.getDefaultLocale ? language.getDefaultLocale() : "en-US";
    }
  }
  return (key, vars) => language.t(key, vars, loc);
}

/**
 * Assigns the configured verification role to the interacting member.
 * Shared by the legacy `btn_verify` flow and the CAPTCHA verification flow.
 *
 * Ephemeral responses use the user's effective locale when language context is available.
 * Returns { status, message } where status is one of:
 * "assigned" | "already" | "not-configured" | "hierarchy" | "error"
 */
async function assignVerificationRole(interaction, options = {}) {
  const { getSetting } = options || {};
  const t = await resolveTranslator(interaction, options || {});
  const guild = interaction.guild;
  const role = resolveVerificationRole(interaction, getSetting);

  if (!role) {
    return {
      status: "not-configured",
      message: t("events.verification.role.not_configured")
    };
  }

  if (interaction.member && interaction.member.roles && interaction.member.roles.cache && interaction.member.roles.cache.has(role.id)) {
    return {
      status: "already",
      message: t("events.verification.role.already")
    };
  }

  const me = guild && guild.members ? guild.members.me : null;
  if (me && me.roles && me.roles.highest && me.roles.highest.position <= role.position) {
    return {
      status: "hierarchy",
      message: t("events.verification.role.hierarchy")
    };
  }

  try {
    await interaction.member.roles.add(role, "Verification completed");
    return {
      status: "assigned",
      message: t("events.verification.role.assigned", { role: String(role) })
    };
  } catch (err) {
    console.error("Error adding verification role:", err);
    return {
      status: "error",
      message: t("events.verification.role.error")
    };
  }
}

module.exports = { assignVerificationRole, resolveVerificationRole, DEFAULTS };
