const {
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const { get, set } = require("../settings");
const { MODULES, buildPanel } = require("../utils/configView");

module.exports = {
  name: Events.InteractionCreate,

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

    // ---------- Button: Post verification panel ----------
    if (customId === "btn_post_verification") {
      const guild = interaction.guild;
      const channelId = get(guild.id, "verificationChannel");
      const roleId = get(guild.id, "verificationRole");
      const channel = guild.channels.cache.get(channelId);
      const role = guild.roles.cache.get(roleId);

      if (!channel) {
        await interaction.reply({
          content: "Verification channel is not configured. Select it in the panel before posting.",
          flags: 64
        });
        return;
      }

      if (!role) {
        await interaction.reply({
          content: "Verification role is not configured. Select it in the panel before posting.",
          flags: 64
        });
        return;
      }

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

      try {
        await channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: `Verification panel posted in ${channel}.`, flags: 64 });
      } catch (err) {
        console.error("Error posting verification panel:", err);
        await interaction.reply({
          content: "Could not post the verification panel. Check the bot's permissions.",
          flags: 64
        });
      }
      return;
    }

    // ---------- Button: Post honeypot notice ----------
    if (customId === "btn_post_honeypot") {
      const guild = interaction.guild;
      const channelId = get(guild.id, "honeypotChannel");
      const channel = guild.channels.cache.get(channelId);

      if (!channel) {
        await interaction.reply({
          content: "Honeypot channel is not configured. Select it in the panel before posting.",
          flags: 64
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("🚫 DO NOT SEND ANY MESSAGES HERE")
        .setDescription(
          "This channel is used to detect **automated accounts**.\n" +
          "Any message sent here will result in an **automatic sanction** (softban)."
        );

      try {
        await channel.send({ embeds: [embed] });
        await interaction.reply({ content: `Honeypot notice posted in ${channel}.`, flags: 64 });
      } catch (err) {
        console.error("Error posting honeypot notice:", err);
        await interaction.reply({
          content: "Could not post the honeypot notice. Check the bot's permissions.",
          flags: 64
        });
      }
      return;
    }

    // ---------- Button: Post AutoQuest panel ----------
    if (customId === "btn_post_autoquest") {
      const guild = interaction.guild;
      const channelId = get(guild.id, "autoQuestChannel");
      const channel = guild.channels.cache.get(channelId);

      if (!channel) {
        await interaction.reply({
          content: "AutoQuest channel is not configured. Select it in the panel before posting.",
          flags: 64
        });
        return;
      }

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

      try {
        await channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: `AutoQuest panel posted in ${channel}.`, flags: 64 });
      } catch (err) {
        console.error("Error posting AutoQuest panel:", err);
        await interaction.reply({
          content: "Could not post the AutoQuest panel. Check the bot's permissions.",
          flags: 64
        });
      }
      return;
    }

    // ---------- Button: Post HypeSquad panel ----------
    if (customId === "btn_post_hypesquad") {
      const guild = interaction.guild;
      const channelId = get(guild.id, "hypeSquadChannel");
      const channel = guild.channels.cache.get(channelId);

      if (!channel) {
        await interaction.reply({
          content: "HypeSquad channel is not configured. Select it in the panel before posting.",
          flags: 64
        });
        return;
      }

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

      try {
        await channel.send({ embeds: [embed], components: [row1, row2] });
        await interaction.reply({ content: `HypeSquad panel posted in ${channel}.`, flags: 64 });
      } catch (err) {
        console.error("Error posting HypeSquad panel:", err);
        await interaction.reply({
          content: "Could not post the HypeSquad panel. Check the bot's permissions.",
          flags: 64
        });
      }
      return;
    }

    // ---------- Button: Post rules ----------
    if (customId === "btn_post_regras") {
      const guild = interaction.guild;
      const channelId = get(guild.id, "rulesChannel");
      const channel = guild.channels.cache.get(channelId);

      // Read rules from file
      let rulesContent = "";
      try {
        const fs = require("fs");
        const path = require("path");
        const rulesPath = path.join(__dirname, "..", "..", "rules.txt");
        rulesContent = fs.readFileSync(rulesPath, "utf8");
      } catch (err) {
        rulesContent = "⚠️ Could not read the rules file.";
        console.error("Error reading rules.txt:", err);
      }

      if (!channel) {
        await interaction.reply({
          content: "Rules channel is not configured. Select it in the panel before posting.",
          flags: 64
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("📜 Server Rules")
        .setDescription(rulesContent.trim())
        .setFooter({ text: `Posted on ${new Date().toLocaleString()}` });

      try {
        await channel.send({ embeds: [embed] });
        await interaction.reply({ content: `Rules posted in ${channel}.`, flags: 64 });
      } catch (err) {
        console.error("Error posting rules:", err);
        await interaction.reply({
          content: "Could not post the rules. Check the bot's permissions.",
          flags: 64
        });
      }
      return;
    }

  }
};
