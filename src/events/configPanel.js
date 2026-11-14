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
const { logger } = require("../utils/logger");

async function postVerificationPanel(guild) {
  const channelId = get(guild.id, "verificationChannel");
  const roleId = get(guild.id, "verificationRole");
  const channel = channelId ? guild.channels.cache.get(channelId) : null;
  const role = roleId ? guild.roles.cache.get(roleId) : null;
  if (!channel) return { ok: false, status: "skipped", reason: "verification channel not configured" };
  if (!role) return { ok: false, status: "skipped", reason: "verification role not configured" };

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("✅ Verification")
    .setDescription("Click the button below to receive your verified role.")
    .setFooter({ text: guild.name });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("btn_verify")
      .setLabel("Verify")
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

  await channel.send(buildCaptchaPanel());
  return { ok: true, status: "posted", channel };
}

async function postHoneypotNotice(guild) {
  const channelId = get(guild.id, "honeypotChannel");
  const channel = channelId ? guild.channels.cache.get(channelId) : null;
  if (!channel) return { ok: false, status: "skipped", reason: "honeypot channel not configured" };

  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle("🚫 DO NOT SEND ANY MESSAGES HERE")
    .setDescription(
      "This channel is used to detect **automated accounts**.\n" +
      "Any message sent here will result in an **automatic sanction** (softban)."
    );

  await channel.send({ embeds: [embed] });
  return { ok: true, status: "posted", channel };
}

async function postRulesPanel(guild) {
  const channelId = get(guild.id, "rulesChannel");
  const channel = channelId ? guild.channels.cache.get(channelId) : null;
  if (!channel) return { ok: false, status: "skipped", reason: "rules channel not configured" };

  let rulesContent = "";
  try {
    const rulesPath = path.join(__dirname, "..", "..", "config", "rules.md");
    rulesContent = fs.readFileSync(rulesPath, "utf8");
  } catch (err) {
    rulesContent = "⚠️ Could not read the rules file.";
    logger.error("Error reading rules file:", err);
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📜 Server Rules")
    .setDescription(rulesContent.trim())
    .setFooter({ text: `Posted on ${new Date().toLocaleString()}` });

  await channel.send({ embeds: [embed] });
  return { ok: true, status: "posted", channel };
}

async function postAutoQuestPanel(guild) {
  const channelId = get(guild.id, "autoQuestChannel");
  const channel = channelId ? guild.channels.cache.get(channelId) : null;
  if (!channel) return { ok: false, status: "skipped", reason: "AutoQuest channel not configured" };

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🚀 AutoQuest")
    .setDescription(
      "Connect your account to farm quests automatically.\n" +
      "Click **Configure account**, then **View quests** or **Start farm**."
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("aq_config")
      .setLabel("Configure account")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("aq_ver")
      .setLabel("View quests")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("aq_farm")
      .setLabel("Start farm")
      .setStyle(ButtonStyle.Success)
  );

  await channel.send({ embeds: [embed], components: [row] });
  return { ok: true, status: "posted", channel };
}

async function postHypeSquadPanel(guild) {
  const channelId = get(guild.id, "hypeSquadChannel");
  const channel = channelId ? guild.channels.cache.get(channelId) : null;
  if (!channel) return { ok: false, status: "skipped", reason: "HypeSquad channel not configured" };

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("🏆 HypeSquad")
    .setDescription(
      "Choose your HypeSquad house!\n" +
      "**Configure account** first (token), then **Join Bravery/Brilliance/Balance**.\n" +
      "Use **Leave house** to leave HypeSquad."
    );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("hs_config")
      .setLabel("Configure account")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("hs_bravery")
      .setLabel("Bravery")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("hs_brilliance")
      .setLabel("Brilliance")
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("hs_balance")
      .setLabel("Balance")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("hs_remove")
      .setLabel("Leave house")
      .setStyle(ButtonStyle.Danger)
  );

  await channel.send({ embeds: [embed], components: [row1, row2] });
  return { ok: true, status: "posted", channel };
}

const SEND_ALL_PANELS = [
  ["CAPTCHA Verification", postCaptchaPanel],
  ["Honeypot", postHoneypotNotice],
  ["Rules", postRulesPanel],
  ["AutoQuest", postAutoQuestPanel],
  ["HypeSquad", postHypeSquadPanel]
];

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

    // ---------- Select 1: choose module ----------
    if (customId === "config_module") {
      const moduleKey = interaction.values[0];
      await interaction.update(buildPanel(interaction.guild, moduleKey));
      return;
    }

    // ---------- Select 2: save channel/role ----------
    if (customId.startsWith("config_value:")) {
      const moduleKey = customId.split(":")[1];
      const module = MODULES[moduleKey];

      if (!module) {
        await interaction.reply({ content: "Invalid module.", flags: 64 });
        return;
      }

      const value = interaction.values[0];
      if (value === "none") {
        await interaction.reply({ content: "No available option to configure.", flags: 64 });
        return;
      }

      set(interaction.guild.id, module.setting, value);
      await interaction.update(buildPanel(interaction.guild, moduleKey));
      return;
    }

    // ---------- Button: Post CAPTCHA panel ----------
    if (customId === "btn_post_captcha") {
      try {
        const result = await postCaptchaPanel(interaction.guild);
        if (!result.ok) {
          const msg = result.reason === "verification role not configured"
            ? "Verification role is not configured. Select it in the panel before posting."
            : "Verification channel is not configured. Select it in the panel before posting.";
          await interaction.reply({ content: msg, flags: 64 });
          return;
        }
        await interaction.reply({ content: `CAPTCHA panel posted in ${result.channel}.`, flags: 64 });
      } catch (err) {
        logger.error("Error posting CAPTCHA panel:", err);
        await interaction.reply({
          content: "Could not post the CAPTCHA panel. Check the bot's permissions.",
          flags: 64
        });
      }
      return;
    }

    // ---------- Button: Post verification panel ----------
    if (customId === "btn_post_verification") {
      try {
        const result = await postVerificationPanel(interaction.guild);
        if (!result.ok) {
          const msg = result.reason === "verification role not configured"
            ? "Verification role is not configured. Select it in the panel before posting."
            : "Verification channel is not configured. Select it in the panel before posting.";
          await interaction.reply({ content: msg, flags: 64 });
          return;
        }
        await interaction.reply({ content: `Verification panel posted in ${result.channel}.`, flags: 64 });
      } catch (err) {
        logger.error("Error posting verification panel:", err);
        await interaction.reply({
          content: "Could not post the verification panel. Check the bot's permissions.",
          flags: 64
        });
      }
      return;
    }

    // ---------- Button: Post honeypot notice ----------
    if (customId === "btn_post_honeypot") {
      try {
        const result = await postHoneypotNotice(interaction.guild);
        if (!result.ok) {
          await interaction.reply({
            content: "Honeypot channel is not configured. Select it in the panel before posting.",
            flags: 64
          });
          return;
        }
        await interaction.reply({ content: `Honeypot notice posted in ${result.channel}.`, flags: 64 });
      } catch (err) {
        logger.error("Error posting honeypot notice:", err);
        await interaction.reply({
          content: "Could not post the honeypot notice. Check the bot's permissions.",
          flags: 64
        });
      }
      return;
    }

    // ---------- Button: Post AutoQuest panel ----------
    if (customId === "btn_post_autoquest") {
      try {
        const result = await postAutoQuestPanel(interaction.guild);
        if (!result.ok) {
          await interaction.reply({
            content: "AutoQuest channel is not configured. Select it in the panel before posting.",
            flags: 64
          });
          return;
        }
        await interaction.reply({ content: `AutoQuest panel posted in ${result.channel}.`, flags: 64 });
      } catch (err) {
        logger.error("Error posting AutoQuest panel:", err);
        await interaction.reply({
          content: "Could not post the AutoQuest panel. Check the bot's permissions.",
          flags: 64
        });
      }
      return;
    }

    // ---------- Button: Post HypeSquad panel ----------
    if (customId === "btn_post_hypesquad") {
      try {
        const result = await postHypeSquadPanel(interaction.guild);
        if (!result.ok) {
          await interaction.reply({
            content: "HypeSquad channel is not configured. Select it in the panel before posting.",
            flags: 64
          });
          return;
        }
        await interaction.reply({ content: `HypeSquad panel posted in ${result.channel}.`, flags: 64 });
      } catch (err) {
        logger.error("Error posting HypeSquad panel:", err);
        await interaction.reply({
          content: "Could not post the HypeSquad panel. Check the bot's permissions.",
          flags: 64
        });
      }
      return;
    }

    // ---------- Button: Post rules ----------
    if (customId === "btn_post_regras") {
      try {
        const result = await postRulesPanel(interaction.guild);
        if (!result.ok) {
          await interaction.reply({
            content: "Rules channel is not configured. Select it in the panel before posting.",
            flags: 64
          });
          return;
        }
        await interaction.reply({ content: `Rules posted in ${result.channel}.`, flags: 64 });
      } catch (err) {
        logger.error("Error posting rules:", err);
        await interaction.reply({
          content: "Could not post the rules. Check the bot's permissions.",
          flags: 64
        });
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

      for (const [name, fn] of tasks) {
        try {
          const result = await fn(interaction.guild);
          if (result.ok) {
            posted.push(`${name} → ${result.channel}`);
          } else if (result.status === "skipped") {
            skipped.push(`${name}: ${result.reason}`);
          } else {
            failed.push(`${name}: ${result.reason || "unknown error"}`);
          }
        } catch (err) {
          logger.error(`Error posting ${name} panel:`, err);
          failed.push(`${name}: ${err.message || "failed to post"}`);
        }
      }

      const lines = [];
      if (posted.length) {
        lines.push(`**Posted:**\n${posted.map(item => `- ${item}`).join("\n")}`);
      }
      if (skipped.length) {
        lines.push(`**Skipped:**\n${skipped.map(item => `- ${item}`).join("\n")}`);
      }
      if (failed.length) {
        lines.push(`**Failed:**\n${failed.map(item => `- ${item}`).join("\n")}`);
      }
      if (!lines.length) {
        lines.push("No panels were posted.");
      }

      await interaction.editReply({ content: lines.join("\n\n") });
      return;
    }

  }
};
