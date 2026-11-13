const { Events, PermissionFlagsBits } = require("discord.js");
const { buildLanguagePanel } = require("../commands/language");

async function getLang(interaction) {
  const lang = interaction.client && interaction.client.language;
  if (!lang) throw new Error("Language system is not initialized");
  return lang;
}

async function resolveLocale(interaction) {
  const lang = await getLang(interaction);
  return lang.resolve({ userId: interaction.user.id, guildId: interaction.guildId || null });
}

async function replyEphemeral(interaction, content) {
  if (interaction.deferred || interaction.replied) {
    return interaction.followUp({ content, flags: 64 });
  }
  return interaction.reply({ content, flags: 64 });
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    const isLanguageComponent =
      (interaction.isStringSelectMenu() || interaction.isButton()) &&
      typeof interaction.customId === "string" &&
      interaction.customId.startsWith("language:");

    if (!isLanguageComponent) return;

    const lang = await getLang(interaction);
    const locale = await resolveLocale(interaction);
    const t = (key, vars) => lang.t(key, vars, locale);

    try {
      if (interaction.customId === "language:set_user" && interaction.isStringSelectMenu()) {
        const selected = interaction.values && interaction.values[0];
        if (!selected) return replyEphemeral(interaction, t("commands.language.invalid_locale"));
        try {
          await lang.setUserLocale(interaction.user.id, selected);
        } catch (err) {
          if (err && err.code === "UNSUPPORTED_LOCALE") {
            return replyEphemeral(interaction, t("commands.language.invalid_locale"));
          }
          throw err;
        }
        const newLocale = await lang.resolve({ userId: interaction.user.id, guildId: interaction.guildId || null });
        const name = lang.t(`locale.name.${selected}`, {}, newLocale);
        await interaction.update(await buildLanguagePanel(interaction));
        await interaction.followUp({ content: lang.t("commands.language.set_user_success", { language: name, code: selected }, newLocale), flags: 64 });
        return;
      }

      if (interaction.customId === "language:reset_user" && interaction.isButton()) {
        await lang.resetUserLocale(interaction.user.id);
        const newLocale = await lang.resolve({ userId: interaction.user.id, guildId: interaction.guildId || null });
        await interaction.update(await buildLanguagePanel(interaction));
        await interaction.followUp({ content: lang.t("commands.language.reset_user_success", {}, newLocale), flags: 64 });
        return;
      }

      if (interaction.customId === "language:set_guild" && interaction.isStringSelectMenu()) {
        if (!interaction.guildId) {
          return replyEphemeral(interaction, t("commands.language.guild_only"));
        }
        const canManageGuild = interaction.memberPermissions && interaction.memberPermissions.has(PermissionFlagsBits.Administrator);
        if (!canManageGuild) {
          return replyEphemeral(interaction, t("commands.language.no_permission_guild"));
        }
        const selected = interaction.values && interaction.values[0];
        if (!selected) return replyEphemeral(interaction, t("commands.language.invalid_locale"));
        try {
          await lang.setGuildLocale(interaction.guildId, selected);
        } catch (err) {
          if (err && err.code === "UNSUPPORTED_LOCALE") {
            return replyEphemeral(interaction, t("commands.language.invalid_locale"));
          }
          throw err;
        }
        const newLocale = await lang.resolve({ userId: interaction.user.id, guildId: interaction.guildId });
        const name = lang.t(`locale.name.${selected}`, {}, newLocale);
        await interaction.update(await buildLanguagePanel(interaction));
        await interaction.followUp({ content: lang.t("commands.language.set_guild_success", { language: name, code: selected }, newLocale), flags: 64 });
        return;
      }

      if (interaction.customId === "language:reset_guild" && interaction.isButton()) {
        if (!interaction.guildId) {
          return replyEphemeral(interaction, t("commands.language.guild_only"));
        }
        const canManageGuild = interaction.memberPermissions && interaction.memberPermissions.has(PermissionFlagsBits.Administrator);
        if (!canManageGuild) {
          return replyEphemeral(interaction, t("commands.language.no_permission_guild"));
        }
        await lang.resetGuildLocale(interaction.guildId);
        const newLocale = await lang.resolve({ userId: interaction.user.id, guildId: interaction.guildId });
        const defName = lang.t(`locale.name.${lang.getDefaultLocale()}`, {}, newLocale);
        await interaction.update(await buildLanguagePanel(interaction));
        await interaction.followUp({ content: lang.t("commands.language.reset_guild_success", { language: defName }, newLocale), flags: 64 });
        return;
      }
    } catch (err) {
      console.error("[language] interaction error:", err);
      return replyEphemeral(interaction, t("errors.generic"));
    }
  }
};
