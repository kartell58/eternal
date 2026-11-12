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

const WHY_TITLE = "Por que ter uma verificação de conta...";
const WHY_TITLE_MD = `**${WHY_TITLE}**`;
const WHY_BODY = "A verificação de conta é para prevenir que contas indesejadas entre em nosso servidor, assim deixando uma comunidade mais segura e sem SPAM desnecessários em sua DM.";
const WHY_CREDIT = "Desenvolvido por kartell (2sj5) • discord.gg/mN4Rh4c35";
const WHY_VERIFY_TEXT = [WHY_TITLE_MD, WHY_BODY, WHY_CREDIT].join("\n");

const CV2_FLAGS = MessageFlags.IsComponentsV2;
const EPHEMERAL_CV2_FLAGS = MessageFlags.Ephemeral | MessageFlags.IsComponentsV2;

function buildWhyVerifyContainer() {
  return new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(WHY_TITLE_MD),
      new TextDisplayBuilder().setContent(WHY_BODY)
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ${WHY_CREDIT}`)
    );
}

function challengeSelectRow(entry) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("captcha_answer")
      .setPlaceholder("Select the option matching the code...")
      .addOptions(entry.options.map(option => ({ label: option, value: option })))
  );
}

function buildChallengeContainer(entry, { statusLine = null } = {}) {
  const expiresAt = Math.floor(entry.expiresAt / 1000);
  const instruction = statusLine
    ? statusLine
    : "Carefully analyze the image below and select the menu option matching the displayed code.";

  const container = new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("**Verification — CAPTCHA Challenge**"),
      new TextDisplayBuilder().setContent(instruction)
    )
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder()
          .setURL("attachment://captcha.png")
          .setDescription("CAPTCHA code")
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# Attempts left: ${entry.attemptsLeft}/${captcha.MAX_ATTEMPTS} • Time limit: 2 minutes\n` +
        `-# This challenge expires <t:${expiresAt}:R>.`
      )
    )
    .addActionRowComponents(challengeSelectRow(entry));

  return container;
}

function challengeFiles(entry) {
  return [new AttachmentBuilder(entry.image, { name: "captcha.png" })];
}

function staticContainer({ accent, title, body }) {
  return new ContainerBuilder()
    .setAccentColor(accent)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**${title}**`),
      new TextDisplayBuilder().setContent(body)
    );
}

async function handleWhy(interaction) {
  await interaction.reply({
    components: [buildWhyVerifyContainer()],
    flags: EPHEMERAL_CV2_FLAGS,
    allowedMentions: { parse: [] }
  });
}

async function handleRespond(interaction, { getSetting } = {}) {
  if (!interaction.guild) {
    await interaction.reply({ content: "This action can only be used inside a server.", flags: 64 });
    return;
  }

  const read = getSetting || ((guildId, key) => settings.get(guildId, key));
  const role = resolveVerificationRole(interaction, read);
  if (!role) {
    await interaction.reply({
      content: "Verification role is not configured. Please notify an administrator.",
      flags: 64
    });
    return;
  }

  if (interaction.member && interaction.member.roles.cache.has(role.id)) {
    await interaction.reply({ content: "You already have the verification role!", flags: 64 });
    return;
  }

  const entry = captcha.createChallenge(interaction.guild.id, interaction.user.id);

  await interaction.reply({
    components: [buildChallengeContainer(entry)],
    files: challengeFiles(entry),
    flags: EPHEMERAL_CV2_FLAGS,
    allowedMentions: { parse: [] }
  });
}

async function handleAnswer(interaction, { assignRole } = {}) {
  if (!interaction.guild) {
    await interaction.reply({ content: "This action can only be used inside a server.", flags: 64 });
    return;
  }

  const assign = assignRole || assignVerificationRole;
  const guildId = interaction.guild.id;
  const userId = interaction.user.id;
  const entry = captcha.getChallenge(guildId, userId);

  if (!entry) {
    await interaction.update({
      components: [staticContainer({
        accent: 0xeab308,
        title: "⏱️ Challenge expired",
        body: "This CAPTCHA has expired. Click **Respond** on the verification panel to try again."
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
        accent: ok ? 0x57f287 : 0xed4245,
        title: ok ? "✅ Verified!" : "⚠️ Verification issue",
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
        accent: 0xed4245,
        title: "❌ Verification failed",
        body: "You used all 3 attempts. Click **Respond** on the verification panel to get a new code."
      })],
      flags: CV2_FLAGS,
      allowedMentions: { parse: [] }
    });
    return;
  }

  await interaction.update({
    components: [buildChallengeContainer(entry, { statusLine: "❌ Incorrect code, please try again." })],
    files: challengeFiles(entry),
    flags: CV2_FLAGS,
    allowedMentions: { parse: [] }
  });
}

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
