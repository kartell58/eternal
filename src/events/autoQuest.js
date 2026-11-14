import {
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";
import { get } from "../settings.js";
import { get as getToken, set as setToken } from "../utils/userTokens.js";
import {
  runAutoQuest,
  getUserInfo,
  fetchAvailableQuests,
  formatDuration,
  taskLabel
} from "../utils/autoFarm.js";
import { logger } from "../utils/logger.js";

const MODAL_ID = "aq_login_modal";
const runningFarms = new Set();

function truncate(text, max = 3900) {
  const value = String(text || "").trim();
  return value.length > max ? `${value.slice(0, max - 20)}\n... (truncated)` : value;
}

function getFarmChannel(interaction) {
  if (!interaction.guild) return null;
  const channelId = get(interaction.guild.id, "autoQuestChannel");
  return (channelId && interaction.guild.channels.cache.get(channelId)) || interaction.channel;
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
    logger.error("[AUTOQUEST] Failed to send farm log:", err.message);
  }
}

function questSummaryLines(quests) {
  return quests.map((quest, index) => {
    const app = quest.applicationName ? ` | ${quest.applicationName}` : "";
    return `**${index + 1}. ${quest.questName}**\n` +
      `Reward: ${quest.rewardText} | Task: ${taskLabel(quest.taskType)} | Duration: ${formatDuration(quest.target)}${app}`;
  });
}

export default {
  name: Events.InteractionCreate,

  async execute(interaction) {
    const customId = interaction.customId;
    if (!customId) return;

    // Button: Configure account
    if (customId === "aq_config" && interaction.isButton()) {
      const modal = new ModalBuilder()
        .setCustomId(MODAL_ID)
        .setTitle("AutoQuest - Connect Account");

      const input = new TextInputBuilder()
        .setCustomId("token_input")
        .setLabel("Discord user token")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Paste your Discord user token here...")
        .setMinLength(20)
        .setMaxLength(400)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return;
    };
    // Modal: save token
    if (customId === MODAL_ID && interaction.isModalSubmit()) {
      const token = interaction.fields.getTextInputValue("token_input").trim();

      await interaction.deferReply({ flags: 64 });

      try {
        const user = await getUserInfo(token);
        if (!user) {
          await interaction.editReply({
            content: "Invalid or expired token. Please verify the token and try again."
          });
          return;
        }

        setToken(interaction.user.id, token);

        await interaction.editReply({
          content:
            `Account connected: **${user.global_name || user.username}** (@${user.username}).\n` +
            "Use **View quests** to list available quests or **Start farm** to run them."
        });
      } catch (err) {
        logger.error("[AUTOQUEST] Token validation error:", err);
        await interaction.editReply({
          content: `Could not validate token: ${err.message || "unknown error"}`
        });
      }
      return;
    }

    // Button: View quests
    if (customId === "aq_ver" && interaction.isButton()) {
      const token = getToken(interaction.user.id);
      if (!token) {
        await interaction.reply({
          content: "Connect your account first using **Configure account**.",
          flags: 64
        });
        return;
      }

      await interaction.deferReply({ flags: 64 });

      try {
        const quests = await fetchAvailableQuests(token);

        if (!quests.length) {
          await interaction.editReply({ content: "No quests available for this account right now." });
          return;
        }

        const lines = questSummaryLines(quests);
        const embed = new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle("Available Quests")
          .setDescription(truncate(lines.join("\n\n")))
          .setFooter({ text: `${quests.length} quest(s) found` });

        await interaction.editReply({ embeds: [embed] });
      } catch (err) {
        logger.error("[AUTOQUEST] Error fetching quests:", err);
        await interaction.editReply({
          content: `Error fetching quests: ${err.message || "unknown error"}`
        });
      }
      return;
    }

    // Button: Start farm
    if (customId === "aq_farm" && interaction.isButton()) {
      const token = getToken(interaction.user.id);
      if (!token) {
        await interaction.reply({
          content: "Connect your account first using **Configure account**.",
          flags: 64
        });
        return;
      }

      if (runningFarms.has(interaction.user.id)) {
        await interaction.reply({
          content: "You already have a farm running. Please wait for it to finish.",
          flags: 64
        });
        return;
      }

      runningFarms.add(interaction.user.id);

      const user = interaction.user;
      const channel = getFarmChannel(interaction);

      await interaction.reply({
        content: "Farm started. Progress updates will be sent to the configured AutoQuest channel.",
        flags: 64
      });

      await sendFarmLog(
        channel,
        "AutoQuest Farm Started",
        `Requested by: <@${user.id}> (${user.global_name || user.username})\nStarting automated execution...`,
        0x5865f2
      );

      runAutoQuest(
        token,
        async (line, level, message) => {
          // Console logging is handled by autoFarm's logger; keep channel logs meaningful.
          const text = String(message || line || "");
          const isStart = level === "quest" || text.startsWith("Starting:");
          const isDone = level === "ok" && /Quest completed:|Run finished:/i.test(text);
          const isError = level === "error";
          const isWarn = level === "warn";

          if (!isStart && !isDone && !isError && !isWarn) return;

          let title = "AutoQuest Update";
          let color = 0x5865f2;
          if (isStart) {
            title = "Quest Started";
          } else if (isDone) {
            title = "Quest Progress";
            color = 0x57f287;
          } else if (isWarn) {
            title = "AutoQuest Warning";
            color = 0xf1c40f;
          } else if (isError) {
            title = "AutoQuest Error";
            color = 0xed4245;
          }

          await sendFarmLog(channel, title, text || String(line), color);
        },
        user.id
      )
        .then(async result => {
          await sendFarmLog(
            channel,
            "AutoQuest Farm Finished",
            `Account: **${result.user?.global_name || result.user?.username || user.username}**\n` +
              `${result.completed}/${result.total} quest(s) completed.`,
            0x57f287
          );
        })
        .catch(async err => {
          logger.error(`[AUTOQUEST] Farm error for ${user.id}:`, err);

          await sendFarmLog(
            channel,
            "AutoQuest Farm Error",
            `Requested by: <@${user.id}> (${user.global_name || user.username})\n${err.message || "Unknown error"}`,
            0xed4245
          );

          try {
            await interaction.followUp({
              content: `Farm error: ${err.message || "Unknown error"}`,
              flags: 64
            });
          } catch {
            // Interaction may have expired; channel log already records the error.
          }
        })
        .finally(() => {
          runningFarms.delete(user.id);
        });

      return;
    }
  }
};
