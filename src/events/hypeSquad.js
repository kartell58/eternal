const {
  Events,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");
const { request, getUser } = require("../utils/userApi");
const {
  get: getToken,
  set: setToken,
  remove: removeToken
} = require("../utils/userTokens");

const MODAL_ID = "hs_login_modal";

const HOUSES = {
  hs_bravery: { id: 1, name: "Bravery", emoji: "🦁" },
  hs_brilliance: { id: 2, name: "Brilliance", emoji: "🦉" },
  hs_balance: { id: 3, name: "Balance", emoji: "⚖️" }
};

function errorMessage(res, t) {
  if (res.status === 401 || res.status === 403) {
    return t("events.hypesquad.replies.invalid_token_configure");
  }
  if (res.status === 429) {
    return t("events.hypesquad.replies.rate_limited");
  }
  return t("events.hypesquad.replies.action_failed", { status: res.status });
}

async function getUserCtx(interaction) {
  const lang = interaction && interaction.client ? interaction.client.language : null;
  const locale = lang
    ? await lang.resolve({ userId: interaction.user.id, guildId: interaction.guildId || null })
    : "en-US";
  const t = (key, vars) => (lang ? lang.t(key, vars, locale) : key);
  return { lang, locale, t };
}

module.exports = {
  name: Events.InteractionCreate,

  async execute(interaction) {
    const customId = interaction.customId;
    if (!customId) return;

    // ---------- Button: Configure account ----------
    if (customId === "hs_config" && interaction.isButton()) {
      const { t } = await getUserCtx(interaction);
      const modal = new ModalBuilder()
        .setCustomId(MODAL_ID)
        .setTitle(t("events.hypesquad.modal.title"));

      const input = new TextInputBuilder()
        .setCustomId("token_input")
        .setLabel(t("events.hypesquad.modal.token_label"))
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder(t("events.hypesquad.modal.token_placeholder"))
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

      const user = await getUser(token);
      if (!user) {
        await interaction.editReply({
          content: t("events.hypesquad.replies.invalid_token")
        });
        return;
      }

      setToken(interaction.user.id, token);

      await interaction.editReply({
        content: t("events.hypesquad.replies.connected", {
          name: user.global_name || user.username,
          username: user.username
        })
      });
      return;
    }

    // ---------- Buttons: join a house ----------
    if (HOUSES[customId] && interaction.isButton()) {
      const { t } = await getUserCtx(interaction);
      const token = getToken(interaction.user.id);
      if (!token) {
        await interaction.reply({
          content: t("events.hypesquad.replies.connect_first"),
          flags: 64
        });
        return;
      }

      const house = HOUSES[customId];
      await interaction.deferReply({ flags: 64 });

      const res = await request(
        "/hypesquad/online",
        "POST",
        { house_id: house.id },
        token
      );

      if (res.status === 200 || res.status === 204) {
        await interaction.editReply({
          content: t("events.hypesquad.replies.house_updated", { emoji: house.emoji, house: house.name })
        });
      } else {
        if (res.status === 401 || res.status === 403) {
          removeToken(interaction.user.id);
        }
        await interaction.editReply({ content: errorMessage(res, t) });
      }
      return;
    }

    // ---------- Button: leave HypeSquad ----------
    if (customId === "hs_remove" && interaction.isButton()) {
      const { t } = await getUserCtx(interaction);
      const token = getToken(interaction.user.id);
      if (!token) {
        await interaction.reply({
          content: t("events.hypesquad.replies.connect_first"),
          flags: 64
        });
        return;
      }

      await interaction.deferReply({ flags: 64 });

      const res = await request("/hypesquad/online", "DELETE", null, token);

      if (res.status === 200 || res.status === 204) {
        await interaction.editReply({
          content: t("events.hypesquad.replies.left")
        });
      } else {
        if (res.status === 401 || res.status === 403) {
          removeToken(interaction.user.id);
        }
        await interaction.editReply({ content: errorMessage(res, t) });
      }
      return;
    }
  }
};
