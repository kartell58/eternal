const {
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  AttachmentBuilder
} = require("discord.js");
const settings = require("../settings");
const captcha = require("../features/verification/captcha");
const { assignVerificationRole, resolveVerificationRole } = require("../features/verification/role");

const WHY_VERIFY_TEXT = [
  "**Por que ter uma verificação de conta...**",
  "A verificação de conta é para prevenir que contas indesejadas entre em nosso servidor, assim deixando uma comunidade mais segura e sem SPAM desnecessários em sua DM.",
  "Desenvolvido por kartell (2sj5) • discord.gg/mN4Rh4c35"
].join("\n");

function challengeEmbed(entry, { title = "🛡️ Verification", statusLine = null } = {}) {
  const expiresAt = Math.floor(entry.expiresAt / 1000);
  const lines = statusLine
    ? [statusLine]
    : ["Select the code shown in the image below."];
  lines.push("");
  lines.push(`**Attempts left:** ${entry.attemptsLeft}/${captcha.MAX_ATTEMPTS}`);
  lines.push(`**Time limit:** 2 minutes`);
  lines.push("");
  lines.push(`This challenge expires <t:${expiresAt}:R>.`);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(title)
    .setDescription(lines.join("\n"))
    .setImage("attachment://captcha.png");

  return embed;
}

function challengeComponents(entry) {
  const select = new StringSelectMenuBuilder()
    .setCustomId("captcha_answer")
    .setPlaceholder("Select the code shown in the image")
    .addOptions(entry.options.map(option => ({ label: option, value: option })));

  return [new ActionRowBuilder().addComponents(select)];
}

function challengeFiles(entry) {
  return [new AttachmentBuilder(entry.image, { name: "captcha.png" })];
}

function staticEmbed({ color, title, description }) {
  return new EmbedBuilder().setColor(color).setTitle(title).setDescription(description);
}

async function handleWhy(interaction) {
  await interaction.reply({ content: WHY_VERIFY_TEXT, flags: 64 });
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
    embeds: [challengeEmbed(entry)],
    components: challengeComponents(entry),
    files: challengeFiles(entry),
    flags: 64
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
      embeds: [staticEmbed({
        color: 0xeab308,
        title: "⏱️ Challenge expired",
        description: "This CAPTCHA has expired. Click **Respond** on the verification panel to try again."
      })],
      components: [],
      files: []
    });
    return;
  }

  const selected = interaction.values && interaction.values[0];

  if (selected === entry.displayCode) {
    captcha.deleteChallenge(guildId, userId);
    const result = await assign(interaction);
    const ok = result.status === "assigned" || result.status === "already";
    await interaction.update({
      embeds: [staticEmbed({
        color: ok ? 0x57f287 : 0xed4245,
        title: ok ? "✅ Verified!" : "⚠️ Verification issue",
        description: result.message
      })],
      components: [],
      files: []
    });
    return;
  }

  entry.attemptsLeft -= 1;

  if (entry.attemptsLeft <= 0) {
    captcha.deleteChallenge(guildId, userId);
    await interaction.update({
      embeds: [staticEmbed({
        color: 0xed4245,
        title: "❌ Verification failed",
        description: "You used all 3 attempts. Click **Respond** on the verification panel to get a new code."
      })],
      components: [],
      files: []
    });
    return;
  }

  await interaction.update({
    embeds: [challengeEmbed(entry, { statusLine: "❌ Incorrect code, please try again." })],
    components: challengeComponents(entry),
    files: challengeFiles(entry)
  });
}

module.exports = {
  name: Events.InteractionCreate,
  WHY_VERIFY_TEXT,
  challengeEmbed,
  challengeComponents,
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
