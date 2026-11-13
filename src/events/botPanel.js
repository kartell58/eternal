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

async function getCtx(interaction) {
  const lang = interaction && interaction.client ? interaction.client.language : null;
  const locale = lang
    ? await lang.resolve({ userId: interaction.user.id, guildId: interaction.guildId || null })
    : "en-US";
  const t = (key, vars) => (lang ? lang.t(key, vars, locale) : key);
  return { lang, locale, t };
}

async function isAuthorized(interaction) {
  try {
    const app = await interaction.client.application.fetch();
    const owner = app.owner;
    if (!owner) return false;
    if (owner.id && owner.id === interaction.user.id) return true;
    if (owner.ownerId && owner.ownerId === interaction.user.id) return true;
    if (owner.members && typeof owner.members.has === "function" && owner.members.has(interaction.user.id)) return true;
  } catch (err) {
    console.error("Bot panel authorization check failed:", err);
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

async function fetchImage(url, t) {
  const res = await axios.get(url, { responseType: "arraybuffer", timeout: 15000, validateStatus: () => true });
  if (res.status !== 200 || !res.data) {
    const err = new Error(t ? t("events.bot_panel.replies.fetch_image_failed", { status: res.status }) : `Could not fetch image (status ${res.status}).`);
    err.status = res.status;
    throw err;
  }
  return Buffer.from(res.data);
}

module.exports = {
  name: Events.InteractionCreate,

  async execute(interaction) {
    const customId = interaction.customId;
    if (!customId || !customId.startsWith("bot_")) return;

    const isComponent = interaction.isButton() || interaction.isStringSelectMenu();
    const isModal = interaction.isModalSubmit();
    if (!isComponent && !isModal) return;

    const { lang, locale, t } = await getCtx(interaction);

    if (!(await isAuthorized(interaction))) {
      await interaction.reply({ content: t("events.bot_panel.replies.not_owner"), flags: 64 }).catch(() => {});
      return;
    }

    try {
      if (customId === IDS.refresh && interaction.isButton()) {
        const panel = await buildBotPanel(interaction.client, { lang, locale, t });
        await interaction.update(panel);
        return;
      }

      if (customId === IDS.status && interaction.isStringSelectMenu()) {
        const status = interaction.values[0];
        await interaction.client.user.setPresence({ status });
        const panel = await buildBotPanel(interaction.client, { lang, locale, t });
        await interaction.update(panel);
        return;
      }

      if (interaction.isButton()) {
        if (customId === IDS.name) {
          await interaction.showModal(textModal(IDS.modalName, t("events.bot_panel.modals.name_title"), t("events.bot_panel.modals.name_label"), TextInputStyle.Short, true, interaction.client.user?.username || ""));
          return;
        }
        if (customId === IDS.avatar) {
          await interaction.showModal(textModal(IDS.modalAvatar, t("events.bot_panel.modals.avatar_title"), t("events.bot_panel.modals.avatar_label"), TextInputStyle.Short, false));
          return;
        }
        if (customId === IDS.banner) {
          await interaction.showModal(textModal(IDS.modalBanner, t("events.bot_panel.modals.banner_title"), t("events.bot_panel.modals.banner_label"), TextInputStyle.Short, false));
          return;
        }
        if (customId === IDS.thought) {
          const current = interaction.client.user?.presence?.activities?.[0]?.name || "";
          await interaction.showModal(textModal(IDS.modalThought, t("events.bot_panel.modals.thought_title"), t("events.bot_panel.modals.thought_label"), TextInputStyle.Short, false, current));
          return;
        }
        if (customId === IDS.bio) {
          let bio = "";
          try { await interaction.client.application.fetch(); bio = interaction.client.application.description || ""; } catch {}
          await interaction.showModal(textModal(IDS.modalBio, t("events.bot_panel.modals.bio_title"), t("events.bot_panel.modals.bio_label"), TextInputStyle.Paragraph, false, bio));
          return;
        }
      }

      if (interaction.isModalSubmit()) {
        const value = interaction.fields.getTextInputValue(IDS.input).trim();
        await interaction.deferReply({ flags: 64 });

        if (customId === IDS.modalName) {
          if (!value) { await interaction.editReply(t("events.bot_panel.replies.username_empty")); return; }
          await interaction.client.user.setUsername(value);
          await interaction.editReply(t("events.bot_panel.replies.username_updated"));
          return;
        }
        if (customId === IDS.modalAvatar) {
          if (!value) {
            await interaction.client.user.setAvatar(null);
            await interaction.editReply(t("events.bot_panel.replies.avatar_cleared"));
            return;
          }
          const img = await fetchImage(value, t);
          await interaction.client.user.setAvatar(img);
          await interaction.editReply(t("events.bot_panel.replies.avatar_updated"));
          return;
        }
        if (customId === IDS.modalBanner) {
          if (!value) {
            await interaction.client.user.setBanner(null);
            await interaction.editReply(t("events.bot_panel.replies.banner_cleared"));
            return;
          }
          const img = await fetchImage(value, t);
          await interaction.client.user.setBanner(img);
          await interaction.editReply(t("events.bot_panel.replies.banner_updated"));
          return;
        }
        if (customId === IDS.modalThought) {
          if (!value) {
            await interaction.client.user.setPresence({ activities: [] });
            await interaction.editReply(t("events.bot_panel.replies.thought_cleared"));
            return;
          }
          await interaction.client.user.setPresence({ activities: [{ name: value, type: ActivityType.Playing }] });
          await interaction.editReply(t("events.bot_panel.replies.thought_updated"));
          return;
        }
        if (customId === IDS.modalBio) {
          await interaction.client.application.fetch();
          await interaction.client.application.edit({ description: value || null });
          await interaction.editReply(t("events.bot_panel.replies.bio_updated"));
          return;
        }
      }
    } catch (err) {
      console.error("Bot panel error:", err);
      const errMsg = (err && err.message) ? err.message : t("common.unknown_error");
      const msg = t("events.bot_panel.replies.action_failed", { error: errMsg });
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(msg).catch(() => {});
      } else {
        await interaction.reply({ content: msg, flags: 64 }).catch(() => {});
      }
    }
  }
};
