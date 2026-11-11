const {
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");
const { get } = require("../settings");
const { get: getToken, set: setToken } = require("../utils/userTokens");
const {
  runAutoQuest,
  getUserInfo,
  fetchAvailableQuests
} = require("../utils/autoFarm");

const MODAL_ID = "aq_login_modal";
const runningFarms = new Set();

function truncate(text, max = 3900) {
  const value = String(text || "").trim();
  return value.length > max ? `${value.slice(0, max - 20)}\n… (truncated)` : value;
}

function getFarmChannel(interaction) {
  if (!interaction.guild) return null;
  const channelId = get(interaction.guild.id, "autoQuestChannel");
  return interaction.guild.channels.cache.get(channelId) || interaction.channel;
}

async function sendFarmLog(channel, title, description, color) {
  if (!channel) return;
  try {
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(truncate(description))
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error("Error sending AutoQuest log:", err.message);
  }
}

module.exports = {
  name: Events.InteractionCreate,

  async execute(interaction) {
    const customId = interaction.customId;
    if (!customId) return;

    // ---------- Button: Configure account ----------
    if (customId === "aq_config" && interaction.isButton()) {
      const modal = new ModalBuilder()
        .setCustomId(MODAL_ID)
        .setTitle("Login - AutoQuest");

      const input = new TextInputBuilder()
        .setCustomId("token_input")
        .setLabel("Discord user token")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Paste your token here...")
        .setMinLength(20)
        .setMaxLength(200)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return;
    }

    // ---------- Modal: save token ----------
    if (customId === MODAL_ID && interaction.isModalSubmit()) {
      const token = interaction.fields.getTextInputValue("token_input").trim();

      await interaction.deferReply({ flags: 64 });

      const user = await getUserInfo(token);
      if (!user) {
        await interaction.editReply({
          content: "❌ Invalid or expired token. Please check it and try again."
        });
        return;
      }

      setToken(interaction.user.id, token);

      await interaction.editReply({
        content:
          `✅ Account connected: **${user.global_name || user.username}** (@${user.username}).\n` +
          "Use **View quests** to list quests or **Start farm** to automate them."
      });
      return;
    }

    // ---------- Button: View quests ----------
    if (customId === "aq_ver" && interaction.isButton()) {
      const token = getToken(interaction.user.id);
      if (!token) {
        await interaction.reply({
          content: "❌ Connect your account first using **Configure account**.",
          flags: 64
        });
        return;
      }

      await interaction.deferReply({ flags: 64 });

      try {
        const quests = await fetchAvailableQuests(token);

        if (!quests.length) {
          await interaction.editReply({ content: "📭 No quests available." });
          return;
        }

        const lines = quests.map((quest, index) =>
          `**${index + 1}. ${quest.questName}**\n` +
          `🎁 ${quest.rewardText} • ${quest.taskType} • ${Math.floor(quest.target / 60)}min`
        );

        const embed = new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle("📋 Available quests")
          .setDescription(truncate(lines.join("\n\n")));

        await interaction.editReply({ embeds: [embed] });
      } catch (err) {
        console.error("Error fetching AutoQuest quests:", err);
        await interaction.editReply({
          content: `❌ Error fetching quests: ${err.message}`
        });
      }
      return;
    }

    // ---------- Button: Start farm ----------
    if (customId === "aq_farm" && interaction.isButton()) {
      const token = getToken(interaction.user.id);
      if (!token) {
        await interaction.reply({
          content: "❌ Connect your account first using **Configure account**.",
          flags: 64
        });
        return;
      }

      if (runningFarms.has(interaction.user.id)) {
        await interaction.reply({
          content: "⏳ You already have a farm running. Please wait for it to finish.",
          flags: 64
        });
        return;
      }

      runningFarms.add(interaction.user.id);

      const user = interaction.user;
      const channel = getFarmChannel(interaction);

      await interaction.reply({
        content: "🔄 Farm started. Progress will be sent to the AutoQuest channel.",
        flags: 64
      });

      await sendFarmLog(
        channel,
        "🚀 Farm started",
        `Account: **${user.global_name || user.username}** (@${user.username})\nStarting automated execution...`,
        0x5865f2
      );

      runAutoQuest(
        token,
        async message => {
          console.log(`[AutoQuest][${user.id}] ${message}`);

          const isStart = message.includes("🚀 Starting:");
          const isDone = message.includes("✅ Quest completed");
          const isError = message.includes("❌") || message.includes("🚫");

          if (!isStart && !isDone && !isError) return;

          let title = "ℹ️ AutoQuest";
          let color = 0x5865f2;

          if (isStart) {
            title = "🎯 Quest started";
          } else if (isDone) {
            title = "✅ Quest completed";
            color = 0x57f287;
          } else if (isError) {
            title = "⚠️ AutoQuest";
            color = 0xed4245;
          }

          await sendFarmLog(channel, title, message, color);
        },
        user.id
      )
        .then(async result => {
          await sendFarmLog(
            channel,
            "🏁 Farm finished",
            `Account: **${result.user?.global_name || user.username}**\n` +
              `${result.completed}/${result.total} quests completed.`,
            0x57f287
          );
        })
        .catch(async err => {
          console.error(`Error in farm for ${user.id}:`, err);

          await sendFarmLog(
            channel,
            "❌ Farm error",
            `Account: **${user.global_name || user.username}**\n${err.message}`,
            0xed4245
          );

          try {
            await interaction.followUp({
              content: `❌ Farm error: ${err.message}`,
              flags: 64
            });
          } catch {
            // The interaction may have expired; the channel log already records the error.
          }
        })
        .finally(() => {
          runningFarms.delete(user.id);
        });

      return;
    }
  }
};
