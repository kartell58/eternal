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

function truncate(text, max = 3900, suffix = "\n… (truncated)") {
  const value = String(text || "").trim();
  if (value.length <= max) return value;
  const cut = Math.max(0, max - suffix.length);
  return `${value.slice(0, cut)}${suffix}`;
}

function getFarmChannel(interaction) {
  if (!interaction.guild) return null;
  const channelId = get(interaction.guild.id, "autoQuestChannel");
  return interaction.guild.channels.cache.get(channelId) || interaction.channel;
}

async function sendFarmLog(channel, title, description, color, options = {}) {
  if (!channel) return;
  const suffix = options.suffix || "\n… (truncated)";
  try {
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(truncate(description, 3900, suffix))
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error("Error sending AutoQuest log:", err.message);
  }
}

async function getUserCtx(interaction) {
  const lang = interaction && interaction.client ? interaction.client.language : null;
  const locale = lang
    ? await lang.resolve({ userId: interaction.user.id, guildId: interaction.guildId || null })
    : "en-US";
  const t = (key, vars) => (lang ? lang.t(key, vars, locale) : key);
  return { lang, locale, t };
}

async function getGuildCtx(guild) {
  const lang = guild && guild.client ? guild.client.language : null;
  const locale = lang ? await lang.resolve({ guildId: guild.id }) : "en-US";
  const t = (key, vars) => (lang ? lang.t(key, vars, locale) : key);
  return { lang, locale, t };
}

module.exports = {
  name: Events.InteractionCreate,

  async execute(interaction) {
    const customId = interaction.customId;
    if (!customId) return;

    // ---------- Button: Configure account ----------
    if (customId === "aq_config" && interaction.isButton()) {
      const { t } = await getUserCtx(interaction);
      const modal = new ModalBuilder()
        .setCustomId(MODAL_ID)
        .setTitle(t("events.autoquest.modal.title"));

      const input = new TextInputBuilder()
        .setCustomId("token_input")
        .setLabel(t("events.autoquest.modal.token_label"))
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder(t("events.autoquest.modal.token_placeholder"))
        .setMinLength(20)
        .setMaxLength(200)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return;
    }

    // ---------- Modal: save token ----------
    if (customId === MODAL_ID && interaction.isModalSubmit()) {
      const { t } = await getUserCtx(interaction);
      const token = interaction.fields.getTextInputValue("token_input").trim();

      await interaction.deferReply({ flags: 64 });

      const user = await getUserInfo(token);
      if (!user) {
        await interaction.editReply({
          content: t("events.autoquest.replies.invalid_token")
        });
        return;
      }

      setToken(interaction.user.id, token);

      await interaction.editReply({
        content: t("events.autoquest.replies.connected", {
          name: user.global_name || user.username,
          username: user.username
        })
      });
      return;
    }

    // ---------- Button: View quests ----------
    if (customId === "aq_ver" && interaction.isButton()) {
      const { t } = await getUserCtx(interaction);
      const token = getToken(interaction.user.id);
      if (!token) {
        await interaction.reply({
          content: t("events.autoquest.replies.connect_first"),
          flags: 64
        });
        return;
      }

      await interaction.deferReply({ flags: 64 });

      try {
        const quests = await fetchAvailableQuests(token);

        if (!quests.length) {
          await interaction.editReply({ content: t("events.autoquest.replies.no_quests") });
          return;
        }

        const lines = quests.map((quest, index) =>
          t("events.autoquest.replies.quest_line", {
            index: index + 1,
            name: quest.questName,
            reward: quest.rewardText,
            type: quest.taskType,
            minutes: Math.floor(quest.target / 60)
          })
        );

        const embed = new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle(t("events.autoquest.replies.quests_title"))
          .setDescription(truncate(lines.join("\n\n"), 3900, t("events.autoquest.replies.truncated")));

        await interaction.editReply({ embeds: [embed] });
      } catch (err) {
        console.error("Error fetching AutoQuest quests:", err);
        await interaction.editReply({
          content: t("events.autoquest.replies.fetch_error", { error: err.message })
        });
      }
      return;
    }

    // ---------- Button: Start farm ----------
    if (customId === "aq_farm" && interaction.isButton()) {
      const { t } = await getUserCtx(interaction);
      const token = getToken(interaction.user.id);
      if (!token) {
        await interaction.reply({
          content: t("events.autoquest.replies.connect_first"),
          flags: 64
        });
        return;
      }

      if (runningFarms.has(interaction.user.id)) {
        await interaction.reply({
          content: t("events.autoquest.replies.already_running"),
          flags: 64
        });
        return;
      }

      runningFarms.add(interaction.user.id);

      const user = interaction.user;
      const channel = getFarmChannel(interaction);
      const guildCtx = interaction.guild ? await getGuildCtx(interaction.guild) : { t: (k) => k };
      const guildT = guildCtx.t;
      const guildSuffix = guildT("events.autoquest.replies.truncated");

      await interaction.reply({
        content: t("events.autoquest.replies.farm_started_reply"),
        flags: 64
      });

      await sendFarmLog(
        channel,
        guildT("events.autoquest.logs.started_title"),
        guildT("events.autoquest.logs.started_body", {
          name: user.global_name || user.username,
          username: user.username
        }),
        0x5865f2,
        { suffix: guildSuffix }
      );

      runAutoQuest(
        token,
        async message => {
          console.log(`[AutoQuest][${user.id}] ${message}`);

          const isStart = message.includes("🚀 Starting:");
          const isDone = message.includes("✅ Quest completed");
          const isError = message.includes("❌") || message.includes("🚫");

          if (!isStart && !isDone && !isError) return;

          let title = guildT("events.autoquest.logs.info_title");
          let color = 0x5865f2;

          if (isStart) {
            title = guildT("events.autoquest.logs.quest_started_title");
          } else if (isDone) {
            title = guildT("events.autoquest.logs.quest_completed_title");
            color = 0x57f287;
          } else if (isError) {
            title = guildT("events.autoquest.logs.warning_title");
            color = 0xed4245;
          }

          // Progress message content is produced by runAutoQuest (external); post as-is to guild channel.
          await sendFarmLog(channel, title, message, color, { suffix: guildSuffix });
        },
        user.id
      )
        .then(async result => {
          await sendFarmLog(
            channel,
            guildT("events.autoquest.logs.finished_title"),
            guildT("events.autoquest.logs.finished_body", {
              name: result.user?.global_name || user.username,
              completed: result.completed,
              total: result.total
            }),
            0x57f287,
            { suffix: guildSuffix }
          );
        })
        .catch(async err => {
          console.error(`Error in farm for ${user.id}:`, err);

          await sendFarmLog(
            channel,
            guildT("events.autoquest.logs.error_title"),
            guildT("events.autoquest.logs.error_body", {
              name: user.global_name || user.username,
              error: err.message
            }),
            0xed4245,
            { suffix: guildSuffix }
          );

          try {
            // Ephemeral follow-up to the initiating user: use user effective locale.
            await interaction.followUp({
              content: t("events.autoquest.replies.farm_error_reply", { error: err.message }),
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
