import {
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
} from "discord.js";
import settings from "../settings.js";
import * as captcha from "../features/verification/captcha.js";
import { assignVerificationRole, resolveVerificationRole } from "../features/verification/role.js";

export const WHY_TITLE = "Why verify your account?";
export const WHY_TITLE_MD = `**${WHY_TITLE}**`;
export const WHY_BODY = "Account verification helps prevent unwanted accounts from joining our server, keeping the community safer and reducing unnecessary spam in your DMs.";
export const WHY_CREDIT = "Developed by kartell (2sj5) • discord.gg/mN4Rh4c35";
export const WHY_VERIFY_TEXT = [WHY_TITLE_MD, WHY_BODY, WHY_CREDIT].join("\n");

const CV2_FLAGS = MessageFlags.IsComponentsV2;
const EPHEMERAL_CV2_FLAGS = MessageFlags.Ephemeral | MessageFlags.IsComponentsV2;

export function buildWhyVerifyContainer() {
  return new ContainerBuilder()
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

export function buildChallengeContainer(entry, { statusLine = null } = {}) {
  const expiresAt = Math.floor(entry.expiresAt / 1000);
  const instruction = statusLine
    ? statusLine
    : "Carefully analyze the image below and select the menu option matching the displayed code.";

  const container = new ContainerBuilder()
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

function staticContainer({ title, body }) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**${title}**`),
      new TextDisplayBuilder().setContent(body)
    );
}

export async function handleWhy(interaction) {
  await interaction.reply({
    components: [buildWhyVerifyContainer()],
    flags: EPHEMERAL_CV2_FLAGS,
    allowedMentions: { parse: [] }
  });
}

export async function handleRespond(interaction, { getSetting } = {}) {
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

export async function handleAnswer(interaction, { assignRole } = {}) {
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

export async function execute(interaction) {
  if (interaction.isButton()) {
    if (interaction.customId === "captcha_respond") return handleRespond(interaction);
    if (interaction.customId === "captcha_why") return handleWhy(interaction);
    return;
  }
  if (interaction.isStringSelectMenu() && interaction.customId === "captcha_answer") {
    return handleAnswer(interaction);
  }
}

export default {
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
  execute
};
