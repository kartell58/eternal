const {
  Events,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  AttachmentBuilder,
  MessageFlags
} = require("discord.js");
const settings = require("../settings");
const captcha = require("../features/verification/captcha");
const { assignVerificationRole, resolveVerificationRole } = require("../features/verification/role");

const DEFAULTS = {
  why_title: "Why have account verification?",
  why_body: "Account verification helps prevent unwanted accounts from joining our server, keeping the community safer and reducing unwanted spam in your DMs.",
  why_credit: "Developed by kartell (2sj5) • discord.gg/mN4Rh4c35",
  challenge_title: "Verification — CAPTCHA Challenge",
  challenge_instruction: "Carefully analyze the image below and select the menu option matching the displayed code.",
  challenge_placeholder: "Select the option matching the code...",
  challenge_image_alt: "CAPTCHA code",
  challenge_attempts_time: "Attempts left: {{attemptsLeft}}/{{maxAttempts}} • Time limit: 2 minutes",
  challenge_expires: "This challenge expires {{expires}}.",
  challenge_incorrect: "❌ Incorrect code, please try again.",
  expired_title: "Challenge expired",
  expired_body: "This CAPTCHA has expired. Click **Respond** on the verification panel to try again.",
  failed_title: "Verification failed",
  failed_body: "You used all {{maxAttempts}} attempts. Click **Respond** on the verification panel to get a new code.",
  success_title: "Verified!",
  issue_title: "Verification issue",
  errors_guild_only: "This action can only be used inside a server.",
  errors_role_not_configured: "Verification role is not configured. Please notify an administrator.",
  errors_already_verified: "You already have the verification role!"
};

const CV2_FLAGS = MessageFlags.IsComponentsV2;
const EPHEMERAL_CV2_FLAGS = MessageFlags.Ephemeral | MessageFlags.IsComponentsV2;

function translator(lang, locale) {
  if (!lang) {
    return (key, vars) => {
      const short = key.replace(/^events\.verification\./, "").replace(/\./g, "_");
      let value = DEFAULTS[short] != null ? DEFAULTS[short] : key;
      if (vars && typeof value === "string") {
        for (const [k, v] of Object.entries(vars)) {
          value = value.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g"), String(v));
        }
      }
      return value;
    };
  }
  return (key, vars) => lang.t(key, vars, locale);
}

async function resolveInteractionContext(interaction, localeOverride) {
  const lang = interaction && interaction.client ? interaction.client.language : null;
  if (localeOverride) return { lang, locale: localeOverride };
  if (!lang) return { lang: null, locale: "en-US" };
  const locale = await lang.resolve({
    userId: interaction.user ? interaction.user.id : undefined,
    guildId: interaction.guildId || (interaction.guild ? interaction.guild.id : undefined)
  });
  return { lang, locale };
}

function getWhyVerifyContent(t) {
  const title = t("events.verification.why.title");
  const body = t("events.verification.why.body");
  const credit = t("events.verification.why.credit");
  return {
    title,
    titleMd: `**${title}**`,
    body,
    credit,
    text: [`**${title}**`, body, credit].join("\n")
  };
}

function buildWhyVerifyContainer({ lang = null, locale = undefined } = {}) {
  const t = translator(lang, locale);
  const why = getWhyVerifyContent(t);
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(why.titleMd),
      new TextDisplayBuilder().setContent(why.body)
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ${why.credit}`)
    );
}

function challengeSelectRow(entry, { t } = {}) {
  const tr = t || translator(null, "en-US");
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("captcha_answer")
      .setPlaceholder(tr("events.verification.challenge.placeholder"))
      .addOptions(entry.options.map(option => ({ label: option, value: option })))
  );
}

function buildChallengeContainer(entry, { statusLine = null, lang = null, locale = undefined } = {}) {
  const t = translator(lang, locale);
  const expiresAt = Math.floor(entry.expiresAt / 1000);
  const instruction = statusLine || t("events.verification.challenge.instruction");

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**${t("events.verification.challenge.title")}**`),
      new TextDisplayBuilder().setContent(instruction)
    )
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder()
          .setURL("attachment://captcha.png")
          .setDescription(t("events.verification.challenge.image_alt"))
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# ${t("events.verification.challenge.attempts_time", { attemptsLeft: entry.attemptsLeft, maxAttempts: captcha.MAX_ATTEMPTS })}\n` +
        `-# ${t("events.verification.challenge.expires", { expires: `<t:${expiresAt}:R>` })}`
      )
    )
    .addActionRowComponents(challengeSelectRow(entry, { t }));
}

function challengeFiles(entry) {
  return [new AttachmentBuilder(entry.image, { name: "captcha.png" })];
}

function staticContainer({ title, body }) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**${title}**`),
      new TextDisplayBuilder().setContent(body)
    );
}

async function handleWhy(interaction, { lang = null, locale = undefined } = {}) {
  const ctx = (lang || locale !== undefined)
    ? { lang, locale: locale || "en-US" }
    : await resolveInteractionContext(interaction);
  await interaction.reply({
    components: [buildWhyVerifyContainer(ctx)],
    flags: EPHEMERAL_CV2_FLAGS,
    allowedMentions: { parse: [] }
  });
}

async function handleRespond(interaction, { getSetting, lang = null, locale = undefined } = {}) {
  const ctx = (lang || locale !== undefined)
    ? { lang, locale: locale || "en-US" }
    : await resolveInteractionContext(interaction);
  const t = translator(ctx.lang, ctx.locale);

  if (!interaction.guild) {
    await interaction.reply({ content: t("events.verification.errors.guild_only"), flags: 64 });
    return;
  }

  const read = getSetting || ((guildId, key) => settings.get(guildId, key));
  const role = resolveVerificationRole(interaction, read);
  if (!role) {
    await interaction.reply({
      content: t("events.verification.errors.role_not_configured"),
      flags: 64
    });
    return;
  }

  if (interaction.member && interaction.member.roles.cache.has(role.id)) {
    await interaction.reply({ content: t("events.verification.errors.already_verified"), flags: 64 });
    return;
  }

  const entry = captcha.createChallenge(interaction.guild.id, interaction.user.id);

  await interaction.reply({
    components: [buildChallengeContainer(entry, ctx)],
    files: challengeFiles(entry),
    flags: EPHEMERAL_CV2_FLAGS,
    allowedMentions: { parse: [] }
  });
}

async function handleAnswer(interaction, { assignRole, lang = null, locale = undefined } = {}) {
  const ctx = (lang || locale !== undefined)
    ? { lang, locale: locale || "en-US" }
    : await resolveInteractionContext(interaction);
  const t = translator(ctx.lang, ctx.locale);

  if (!interaction.guild) {
    await interaction.reply({ content: t("events.verification.errors.guild_only"), flags: 64 });
    return;
  }

  const assign = assignRole || assignVerificationRole;
  const guildId = interaction.guild.id;
  const userId = interaction.user.id;
  const entry = captcha.getChallenge(guildId, userId);

  if (!entry) {
    await interaction.update({
      components: [staticContainer({
        title: `⏱️ ${t("events.verification.expired.title")}`,
        body: t("events.verification.expired.body")
      })],
      flags: CV2_FLAGS,
      allowedMentions: { parse: [] }
    });
    return;
  }

  const selected = interaction.values && interaction.values[0];

  if (selected === entry.displayCode) {
    captcha.deleteChallenge(guildId, userId);
    const result = await assign(interaction);
    const ok = result.status === "assigned" || result.status === "already";
    await interaction.update({
      components: [staticContainer({
        title: ok ? `✅ ${t("events.verification.success.title")}` : `⚠️ ${t("events.verification.issue.title")}`,
        body: result.message
      })],
      flags: CV2_FLAGS,
      allowedMentions: { parse: [] }
    });
    return;
  }

  entry.attemptsLeft -= 1;

  if (entry.attemptsLeft <= 0) {
    captcha.deleteChallenge(guildId, userId);
    await interaction.update({
      components: [staticContainer({
        title: `❌ ${t("events.verification.failed.title")}`,
        body: t("events.verification.failed.body", { maxAttempts: captcha.MAX_ATTEMPTS })
      })],
      flags: CV2_FLAGS,
      allowedMentions: { parse: [] }
    });
    return;
  }

  await interaction.update({
    components: [buildChallengeContainer(entry, { ...ctx, statusLine: t("events.verification.challenge.incorrect") })],
    files: challengeFiles(entry),
    flags: CV2_FLAGS,
    allowedMentions: { parse: [] }
  });
}

// Compatibility exports: English defaults (translations live in locale files).
const _defaultWhy = getWhyVerifyContent(translator(null, "en-US"));
const WHY_TITLE = _defaultWhy.title;
const WHY_TITLE_MD = _defaultWhy.titleMd;
const WHY_BODY = _defaultWhy.body;
const WHY_CREDIT = _defaultWhy.credit;
const WHY_VERIFY_TEXT = _defaultWhy.text;

module.exports = {
  name: Events.InteractionCreate,
  WHY_VERIFY_TEXT,
  WHY_TITLE,
  WHY_TITLE_MD,
  WHY_BODY,
  WHY_CREDIT,
  buildWhyVerifyContainer,
  buildChallengeContainer,
  handleWhy,
  handleRespond,
  handleAnswer,
  resolveInteractionContext,

  async execute(interaction) {
    if (interaction.isButton()) {
      if (interaction.customId === "captcha_respond") return handleRespond(interaction);
      if (interaction.customId === "captcha_why") return handleWhy(interaction);
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === "captcha_answer") {
      return handleAnswer(interaction);
    }
  }
};
