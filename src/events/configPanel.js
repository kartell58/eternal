const {
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const { get, set } = require("../settings");
const { MODULES, buildPanel } = require("../utils/configView");
const { buildCaptchaPanel } = require("../features/verification/panel");

async function getGuildCtx(guild) {
  const lang = guild && guild.client ? guild.client.language : null;
  const locale = lang ? await lang.resolve({ guildId: guild.id }) : "en-US";
  const t = (key, vars) => (lang ? lang.t(key, vars, locale) : key);
  return { lang, locale, t };
}

async function getUserCtx(interaction) {
  const lang = interaction && interaction.client ? interaction.client.language : null;
  const locale = lang
    ? await lang.resolve({ userId: interaction.user.id, guildId: interaction.guildId || null })
    : "en-US";
  const t = (key, vars) => (lang ? lang.t(key, vars, locale) : key);
  return { lang, locale, t };
}

async function postVerificationPanel(guild) {
  const channelId = get(guild.id, "verificationChannel");
  const roleId = get(guild.id, "verificationRole");
  const channel = channelId ? guild.channels.cache.get(channelId) : null;
  const role = roleId ? guild.roles.cache.get(roleId) : null;
  if (!channel) return { ok: false, status: "skipped", reason: "verification channel not configured" };
  if (!role) return { ok: false, status: "skipped", reason: "verification role not configured" };

  const { t } = await getGuildCtx(guild);

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(t("events.verification.legacy_panel.title"))
    .setDescription(t("events.verification.legacy_panel.description"))
    .setFooter({ text: guild.name });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("btn_verify")
      .setLabel(t("events.verification.legacy_panel.button"))
      .setStyle(ButtonStyle.Success)
      .setEmoji("✅")
  );

  await channel.send({ embeds: [embed], components: [row] });
  return { ok: true, status: "posted", channel };
}

async function postCaptchaPanel(guild) {
  const channelId = get(guild.id, "verificationChannel");
  const roleId = get(guild.id, "verificationRole");
  const channel = channelId ? guild.channels.cache.get(channelId) : null;
  const role = roleId ? guild.roles.cache.get(roleId) : null;
  if (!channel) return { ok: false, status: "skipped", reason: "verification channel not configured" };
  if (!role) return { ok: false, status: "skipped", reason: "verification role not configured" };

  const { lang, locale } = await getGuildCtx(guild);
  await channel.send(buildCaptchaPanel({ lang, locale }));
  return { ok: true, status: "posted", channel };
}

async function postHoneypotNotice(guild) {
  const channelId = get(guild.id, "honeypotChannel");
  const channel = channelId ? guild.channels.cache.get(channelId) : null;
  if (!channel) return { ok: false, status: "skipped", reason: "honeypot channel not configured" };

  const { t } = await getGuildCtx(guild);
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle(t("events.config.posted.honeypot_title"))
    .setDescription(t("events.config.posted.honeypot_description"));

  await channel.send({ embeds: [embed] });
  return { ok: true, status: "posted", channel };
}

async function postRulesPanel(guild) {
  const channelId = get(guild.id, "rulesChannel");
  const channel = channelId ? guild.channels.cache.get(channelId) : null;
  if (!channel) return { ok: false, status: "skipped", reason: "rules channel not configured" };

  const { t } = await getGuildCtx(guild);

  let rulesContent = "";
  let readFailed = false;
  try {
    const rulesPath = path.join(__dirname, "..", "..", "rules.txt");
    rulesContent = fs.readFileSync(rulesPath, "utf8");
  } catch (err) {
    readFailed = true;
    rulesContent = t("events.config.posted.rules_fallback");
    console.error("Error reading rules.txt:", err);
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(t("events.config.posted.rules_title"))
    .setDescription((readFailed ? rulesContent : String(rulesContent).trim()) || t("events.config.posted.rules_fallback"))
    .setFooter({ text: t("events.config.posted.rules_footer", { date: new Date().toLocaleString() }) });

  await channel.send({ embeds: [embed] });
  return { ok: true, status: "posted", channel };
}

async function postAutoQuestPanel(guild) {
  const channelId = get(guild.id, "autoQuestChannel");
  const channel = channelId ? guild.channels.cache.get(channelId) : null;
  if (!channel) return { ok: false, status: "skipped", reason: "AutoQuest channel not configured" };

  const { t } = await getGuildCtx(guild);
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(t("events.config.posted.autoquest_title"))
    .setDescription(t("events.config.posted.autoquest_description"));

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("aq_config").setLabel(t("events.config.posted.autoquest_configure")).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("aq_ver").setLabel(t("events.config.posted.autoquest_view")).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("aq_farm").setLabel(t("events.config.posted.autoquest_farm")).setStyle(ButtonStyle.Success)
  );

  await channel.send({ embeds: [embed], components: [row] });
  return { ok: true, status: "posted", channel };
}

async function postHypeSquadPanel(guild) {
  const channelId = get(guild.id, "hypeSquadChannel");
  const channel = channelId ? guild.channels.cache.get(channelId) : null;
  if (!channel) return { ok: false, status: "skipped", reason: "HypeSquad channel not configured" };

  const { t } = await getGuildCtx(guild);
  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle(t("events.config.posted.hypesquad_title"))
    .setDescription(t("events.config.posted.hypesquad_description"));

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("hs_config").setLabel(t("events.config.posted.hypesquad_configure")).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("hs_bravery").setLabel(t("events.config.posted.hypesquad_bravery")).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("hs_brilliance").setLabel(t("events.config.posted.hypesquad_brilliance")).setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("hs_balance").setLabel(t("events.config.posted.hypesquad_balance")).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("hs_remove").setLabel(t("events.config.posted.hypesquad_leave")).setStyle(ButtonStyle.Danger)
  );

  await channel.send({ embeds: [embed], components: [row1, row2] });
  return { ok: true, status: "posted", channel };
}

const SEND_ALL_PANELS = [
  ["events.config.replies.task_captcha", postCaptchaPanel],
  ["events.config.replies.task_honeypot", postHoneypotNotice],
  ["events.config.replies.task_rules", postRulesPanel],
  ["events.config.replies.task_autoquest", postAutoQuestPanel],
  ["events.config.replies.task_hypesquad", postHypeSquadPanel]
];

function skipMessage(t, reason) {
  if (reason === "verification role not configured") return t("events.config.replies.verification_role_not_configured");
  if (reason === "verification channel not configured") return t("events.config.replies.verification_channel_not_configured");
  if (reason === "honeypot channel not configured") return t("events.config.replies.honeypot_not_configured");
  if (reason === "rules channel not configured") return t("events.config.replies.rules_not_configured");
  if (reason === "AutoQuest channel not configured") return t("events.config.replies.autoquest_not_configured");
  if (reason === "HypeSquad channel not configured") return t("events.config.replies.hypesquad_not_configured");
  return reason || t("events.config.replies.send_all_unknown_error");
}

module.exports = {
  name: Events.InteractionCreate,
  SEND_ALL_PANELS,
  postCaptchaPanel,
  postVerificationPanel,
  postHoneypotNotice,
  postRulesPanel,
  postAutoQuestPanel,
  postHypeSquadPanel,

  async execute(interaction) {
    if (interaction.isChatInputCommand()) return;
    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

    const customId = interaction.customId;
    if (!customId) return;

    const { lang, locale, t } = await getUserCtx(interaction);

    // ---------- Select 1: choose module ----------
    if (customId === "config_module") {
      const moduleKey = interaction.values[0];
      await interaction.update(await buildPanel(interaction.guild, moduleKey, { lang, locale, t }));
      return;
    }

    // ---------- Select 2: save channel/role ----------
    if (customId.startsWith("config_value:")) {
      const moduleKey = customId.split(":")[1];
      const module = MODULES[moduleKey];

      if (!module) {
        await interaction.reply({ content: t("events.config.replies.invalid_module"), flags: 64 });
        return;
      }

      const value = interaction.values[0];
      if (value === "none") {
        await interaction.reply({ content: t("events.config.replies.no_available_option"), flags: 64 });
        return;
      }

      set(interaction.guild.id, module.setting, value);
      await interaction.update(await buildPanel(interaction.guild, moduleKey, { lang, locale, t }));
      return;
    }

    // ---------- Button: Post CAPTCHA panel ----------
    if (customId === "btn_post_captcha") {
      try {
        const result = await postCaptchaPanel(interaction.guild);
        if (!result.ok) {
          await interaction.reply({ content: skipMessage(t, result.reason), flags: 64 });
          return;
        }
        await interaction.reply({ content: t("events.config.replies.posted_captcha", { channel: `${result.channel}` }), flags: 64 });
      } catch (err) {
        console.error("Error posting CAPTCHA panel:", err);
        await interaction.reply({ content: t("events.config.replies.post_captcha_failed"), flags: 64 });
      }
      return;
    }

    // ---------- Button: Post verification panel ----------
    if (customId === "btn_post_verification") {
      try {
        const result = await postVerificationPanel(interaction.guild);
        if (!result.ok) {
          await interaction.reply({ content: skipMessage(t, result.reason), flags: 64 });
          return;
        }
        await interaction.reply({ content: t("events.config.replies.posted_verification", { channel: `${result.channel}` }), flags: 64 });
      } catch (err) {
        console.error("Error posting verification panel:", err);
        await interaction.reply({ content: t("events.config.replies.post_verification_failed"), flags: 64 });
      }
      return;
    }

    // ---------- Button: Post honeypot notice ----------
    if (customId === "btn_post_honeypot") {
      try {
        const result = await postHoneypotNotice(interaction.guild);
        if (!result.ok) {
          await interaction.reply({ content: t("events.config.replies.honeypot_not_configured"), flags: 64 });
          return;
        }
        await interaction.reply({ content: t("events.config.replies.posted_honeypot", { channel: `${result.channel}` }), flags: 64 });
      } catch (err) {
        console.error("Error posting honeypot notice:", err);
        await interaction.reply({ content: t("events.config.replies.post_honeypot_failed"), flags: 64 });
      }
      return;
    }

    // ---------- Button: Post AutoQuest panel ----------
    if (customId === "btn_post_autoquest") {
      try {
        const result = await postAutoQuestPanel(interaction.guild);
        if (!result.ok) {
          await interaction.reply({ content: t("events.config.replies.autoquest_not_configured"), flags: 64 });
          return;
        }
        await interaction.reply({ content: t("events.config.replies.posted_autoquest", { channel: `${result.channel}` }), flags: 64 });
      } catch (err) {
        console.error("Error posting AutoQuest panel:", err);
        await interaction.reply({ content: t("events.config.replies.post_autoquest_failed"), flags: 64 });
      }
      return;
    }

    // ---------- Button: Post HypeSquad panel ----------
    if (customId === "btn_post_hypesquad") {
      try {
        const result = await postHypeSquadPanel(interaction.guild);
        if (!result.ok) {
          await interaction.reply({ content: t("events.config.replies.hypesquad_not_configured"), flags: 64 });
          return;
        }
        await interaction.reply({ content: t("events.config.replies.posted_hypesquad", { channel: `${result.channel}` }), flags: 64 });
      } catch (err) {
        console.error("Error posting HypeSquad panel:", err);
        await interaction.reply({ content: t("events.config.replies.post_hypesquad_failed"), flags: 64 });
      }
      return;
    }

    // ---------- Button: Post rules ----------
    if (customId === "btn_post_regras") {
      try {
        const result = await postRulesPanel(interaction.guild);
        if (!result.ok) {
          await interaction.reply({ content: t("events.config.replies.rules_not_configured"), flags: 64 });
          return;
        }
        await interaction.reply({ content: t("events.config.replies.posted_rules", { channel: `${result.channel}` }), flags: 64 });
      } catch (err) {
        console.error("Error posting rules:", err);
        await interaction.reply({ content: t("events.config.replies.post_rules_failed"), flags: 64 });
      }
      return;
    }

    // ---------- Button: Post all ----------
    if (customId === "btn_post_all") {
      await interaction.deferReply({ flags: 64 });

      const tasks = SEND_ALL_PANELS;
      const posted = [];
      const skipped = [];
      const failed = [];

      for (const [nameKey, fn] of tasks) {
        const name = t(nameKey);
        try {
          const result = await fn(interaction.guild);
          if (result.ok) {
            posted.push(`${name} → ${result.channel}`);
          } else if (result.status === "skipped") {
            skipped.push(`${name}: ${skipMessage(t, result.reason)}`);
          } else {
            failed.push(`${name}: ${result.reason || t("events.config.replies.send_all_unknown_error")}`);
          }
        } catch (err) {
          console.error(`Error posting ${nameKey} panel:`, err);
          failed.push(`${name}: ${err.message || t("events.config.replies.send_all_failed_to_post")}`);
        }
      }

      const lines = [];
      if (posted.length) lines.push(`${t("events.config.replies.send_all_posted")}\n${posted.map(item => `- ${item}`).join("\n")}`);
      if (skipped.length) lines.push(`${t("events.config.replies.send_all_skipped")}\n${skipped.map(item => `- ${item}`).join("\n")}`);
      if (failed.length) lines.push(`${t("events.config.replies.send_all_failed")}\n${failed.map(item => `- ${item}`).join("\n")}`);
      if (!lines.length) lines.push(t("events.config.replies.send_all_none"));

      await interaction.editReply({ content: lines.join("\n\n") });
      return;
    }

  }
};
