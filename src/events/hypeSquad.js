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

function errorMessage(res) {
  if (res.status === 401 || res.status === 403) {
    return "❌ Invalid or expired token. Use **Configure account** to update it.";
  }
  if (res.status === 429) {
    return "⏳ Too many requests. Please wait a few seconds and try again.";
  }
  return `❌ Could not complete the action (status ${res.status}).`;
}

module.exports = {
  name: Events.InteractionCreate,

  async execute(interaction) {
    const customId = interaction.customId;
    if (!customId) return;

    // ---------- Button: Configure account ----------
    if (customId === "hs_config" && interaction.isButton()) {
      const modal = new ModalBuilder()
        .setCustomId(MODAL_ID)
        .setTitle("Login - HypeSquad");

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

      const user = await getUser(token);
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
          "Now choose **Bravery**, **Brilliance**, or **Balance**."
      });
      return;
    }

    // ---------- Buttons: join a house ----------
    if (HOUSES[customId] && interaction.isButton()) {
      const token = getToken(interaction.user.id);
      if (!token) {
        await interaction.reply({
          content: "❌ Connect your account first using **Configure account**.",
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
          content: `${house.emoji} HypeSquad updated! You are now in **${house.name}**.`
        });
      } else {
        if (res.status === 401 || res.status === 403) {
          removeToken(interaction.user.id);
        }
        await interaction.editReply({ content: errorMessage(res) });
      }
      return;
    }

    // ---------- Button: leave HypeSquad ----------
    if (customId === "hs_remove" && interaction.isButton()) {
      const token = getToken(interaction.user.id);
      if (!token) {
        await interaction.reply({
          content: "❌ Connect your account first using **Configure account**.",
          flags: 64
        });
        return;
      }

      await interaction.deferReply({ flags: 64 });

      const res = await request("/hypesquad/online", "DELETE", null, token);

      if (res.status === 200 || res.status === 204) {
        await interaction.editReply({
          content: "✅ You have left HypeSquad."
        });
      } else {
        if (res.status === 401 || res.status === 403) {
          removeToken(interaction.user.id);
        }
        await interaction.editReply({ content: errorMessage(res) });
      }
      return;
    }
  }
};
