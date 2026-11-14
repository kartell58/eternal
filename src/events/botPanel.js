const {
  Events,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ActivityType
} = require("discord.js");
const axios = require("axios");
const { buildBotPanel } = require("../utils/botPanelView");
const { logger } = require("../utils/logger");

const IDS = {
  status: "bot_status",
  name: "bot_set_name",
  avatar: "bot_set_avatar",
  banner: "bot_set_banner",
  thought: "bot_set_thought",
  bio: "bot_set_bio",
  refresh: "bot_refresh",
  modalName: "bot_modal_name",
  modalAvatar: "bot_modal_avatar",
  modalBanner: "bot_modal_banner",
  modalThought: "bot_modal_thought",
  modalBio: "bot_modal_bio",
  input: "bot_input_value"
};

async function isAuthorized(interaction) {
  try {
    const app = await interaction.client.application.fetch();
    const owner = app.owner;
    if (!owner) return false;
    if (owner.id && owner.id === interaction.user.id) return true;
    // Team owner/members
    if (owner.ownerId && owner.ownerId === interaction.user.id) return true;
    if (owner.members && typeof owner.members.has === "function" && owner.members.has(interaction.user.id)) return true;
  } catch (err) {
    logger.error("Bot panel authorization check failed:", err);
  }
  return false;
}

function textModal(customId, title, label, style = TextInputStyle.Short, required = true, value = "") {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
  const input = new TextInputBuilder()
    .setCustomId(IDS.input)
    .setLabel(label)
    .setStyle(style)
    .setRequired(required);
  if (value) input.setValue(String(value).slice(0, 4000));
  if (style === TextInputStyle.Short) input.setMaxLength(100); else input.setMaxLength(4000);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

async function fetchImage(url) {
  const res = await axios.get(url, { responseType: "arraybuffer", timeout: 15000, validateStatus: () => true });
  if (res.status !== 200 || !res.data) throw new Error(`Could not fetch image (status ${res.status}).`);
  return Buffer.from(res.data);
}

module.exports = {
  name: Events.InteractionCreate,

  async execute(interaction) {
    const customId = interaction.customId;
    if (!customId || !customId.startsWith("bot_")) return;

    // Only handle bot panel components/modals
    const isComponent = interaction.isButton() || interaction.isStringSelectMenu();
    const isModal = interaction.isModalSubmit();
    if (!isComponent && !isModal) return;

    if (!(await isAuthorized(interaction))) {
      await interaction.reply({ content: "❌ Only the application owner can configure the bot.", flags: 64 }).catch(() => {});
      return;
    }

    try {
      // Refresh
      if (customId === IDS.refresh && interaction.isButton()) {
        const panel = await buildBotPanel(interaction.client);
        await interaction.update(panel);
        return;
      }

      // Status select
      if (customId === IDS.status && interaction.isStringSelectMenu()) {
        const status = interaction.values[0];
        await interaction.client.user.setPresence({ status });
        const panel = await buildBotPanel(interaction.client);
        await interaction.update(panel);
        return;
      }

      // Open modals
      if (interaction.isButton()) {
        if (customId === IDS.name) {
          await interaction.showModal(textModal(IDS.modalName, "Set Bot Name", "New username", TextInputStyle.Short, true, interaction.client.user?.username || ""));
          return;
        }
        if (customId === IDS.avatar) {
          await interaction.showModal(textModal(IDS.modalAvatar, "Set Bot Avatar", "Image URL (or leave empty to clear)", TextInputStyle.Short, false));
          return;
        }
        if (customId === IDS.banner) {
          await interaction.showModal(textModal(IDS.modalBanner, "Set Bot Banner", "Image URL (or leave empty to clear)", TextInputStyle.Short, false));
          return;
        }
        if (customId === IDS.thought) {
          const current = interaction.client.user?.presence?.activities?.[0]?.name || "";
          await interaction.showModal(textModal(IDS.modalThought, "Set Bot Thought", "Activity/thought text", TextInputStyle.Short, false, current));
          return;
        }
        if (customId === IDS.bio) {
          let bio = "";
          try { await interaction.client.application.fetch(); bio = interaction.client.application.description || ""; } catch {}
          await interaction.showModal(textModal(IDS.modalBio, "Set Bot Bio", "Application/bot bio", TextInputStyle.Paragraph, false, bio));
          return;
        }
      }

      // Modal submits
      if (interaction.isModalSubmit()) {
        const value = interaction.fields.getTextInputValue(IDS.input).trim();
        await interaction.deferReply({ flags: 64 });

        if (customId === IDS.modalName) {
          if (!value) { await interaction.editReply("❌ Username cannot be empty."); return; }
          await interaction.client.user.setUsername(value);
          await interaction.editReply("✅ Bot username updated.");
          return;
        }
        if (customId === IDS.modalAvatar) {
          if (!value) {
            await interaction.client.user.setAvatar(null);
            await interaction.editReply("✅ Bot avatar cleared.");
            return;
          }
          const img = await fetchImage(value);
          await interaction.client.user.setAvatar(img);
          await interaction.editReply("✅ Bot avatar updated.");
          return;
        }
        if (customId === IDS.modalBanner) {
          if (!value) {
            await interaction.client.user.setBanner(null);
            await interaction.editReply("✅ Bot banner cleared (if supported).");
            return;
          }
          const img = await fetchImage(value);
          await interaction.client.user.setBanner(img);
          await interaction.editReply("✅ Bot banner updated (if supported).");
          return;
        }
        if (customId === IDS.modalThought) {
          if (!value) {
            await interaction.client.user.setPresence({ activities: [] });
            await interaction.editReply("✅ Bot thought/activity cleared.");
            return;
          }
          await interaction.client.user.setPresence({ activities: [{ name: value, type: ActivityType.Playing }] });
          await interaction.editReply("✅ Bot thought/activity updated.");
          return;
        }
        if (customId === IDS.modalBio) {
          await interaction.client.application.fetch();
          await interaction.client.application.edit({ description: value || null });
          await interaction.editReply("✅ Bot bio updated.");
          return;
        }
      }
    } catch (err) {
      logger.error("Bot panel error:", err);
      const msg = `❌ Could not complete the action: ${err.message || "Unknown error"}`;
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(msg).catch(() => {});
      } else {
        await interaction.reply({ content: msg, flags: 64 }).catch(() => {});
      }
    }
  }
};
