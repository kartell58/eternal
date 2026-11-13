const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");

function getLanguage(interaction) {
  const lang = interaction.client && interaction.client.language;
  if (!lang) throw new Error("Language system is not initialized (client.language missing)");
  return lang;
}

function localeDisplay(lang, code, tLocale) {
  // Prefer translated locale names, fall back to registry metadata.
  const translated = lang.t(`locale.name.${code}`, {}, tLocale);
  if (translated && translated !== `locale.name.${code}`) return translated;
  const meta = lang.registry.get(code);
  return meta ? (meta.nativeName || meta.name || code) : code;
}

async function buildLanguagePanel(interaction) {
  const lang = getLanguage(interaction);
  const userId = interaction.user.id;
  const guildId = interaction.guildId || null;

  const effective = await lang.resolve({ userId, guildId });
  const userPref = await lang.storage.getUserLocale(userId);
  const guildPref = guildId ? await lang.storage.getGuildLocale(guildId) : null;
  const defaultLocale = lang.getDefaultLocale();
  const supported = lang.getSupportedLocales();

  const t = (key, vars) => lang.t(key, vars, effective);
  const notSet = t("commands.language.not_set");

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle(t("commands.language.title"))
    .setDescription(t("commands.language.help"))
    .addFields(
      { name: t("commands.language.current_effective"), value: `**${localeDisplay(lang, effective, effective)}** (${effective})`, inline: true },
      { name: t("commands.language.current_user"), value: userPref ? `**${localeDisplay(lang, userPref, effective)}** (${userPref})` : notSet, inline: true },
      { name: t("commands.language.current_guild"), value: guildId ? (guildPref ? `**${localeDisplay(lang, guildPref, effective)}** (${guildPref})` : notSet) : t("commands.language.guild_only"), inline: true },
      { name: t("commands.language.default_locale"), value: `**${localeDisplay(lang, defaultLocale, effective)}** (${defaultLocale})`, inline: true }
    );

  const userSelect = new StringSelectMenuBuilder()
    .setCustomId("language:set_user")
    .setPlaceholder(t("commands.language.select_user_placeholder"))
    .addOptions(supported.map(loc => ({
      label: `${loc.nativeName} (${loc.code})`,
      value: loc.code,
      description: loc.name,
      default: userPref === loc.code
    })));

  const rows = [new ActionRowBuilder().addComponents(userSelect)];

  if (guildId) {
    const member = interaction.member;
    const canManageGuild = member && member.permissions && typeof member.permissions.has === "function"
      ? member.permissions.has(PermissionFlagsBits.Administrator)
      : false;

    const guildSelect = new StringSelectMenuBuilder()
      .setCustomId("language:set_guild")
      .setPlaceholder(t("commands.language.select_guild_placeholder"))
      .setDisabled(!canManageGuild)
      .addOptions(supported.map(loc => ({
        label: `${loc.nativeName} (${loc.code})`,
        value: loc.code,
        description: loc.name,
        default: guildPref === loc.code
      })));
    rows.push(new ActionRowBuilder().addComponents(guildSelect));
  }

  const resetUser = new ButtonBuilder()
    .setCustomId("language:reset_user")
    .setLabel(t("commands.language.reset_user_button"))
    .setStyle(ButtonStyle.Secondary);

  const buttonRow = new ActionRowBuilder().addComponents(resetUser);

  if (guildId) {
    const member = interaction.member;
    const canManageGuild = member && member.permissions && typeof member.permissions.has === "function"
      ? member.permissions.has(PermissionFlagsBits.Administrator)
      : false;
    const resetGuild = new ButtonBuilder()
      .setCustomId("language:reset_guild")
      .setLabel(t("commands.language.reset_guild_button"))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!canManageGuild);
    buttonRow.addComponents(resetGuild);
  }

  rows.push(buttonRow);

  return { embeds: [embed], components: rows, flags: 64 };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("language")
    .setDescription("Manage your language and this server's language."),
  async execute(interaction) {
    const panel = await buildLanguagePanel(interaction);
    await interaction.reply(panel);
  },
  buildLanguagePanel
};
