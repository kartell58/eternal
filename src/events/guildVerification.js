const { Events } = require("discord.js");
const { assignVerificationRole } = require("../features/verification/role");

module.exports = {
  name: Events.InteractionCreate,

  async execute(interaction) {
    if (!interaction.isButton()) return;
    if (interaction.customId !== "btn_verify") return;

    // Ephemeral response: use the individual user's effective locale.
    const result = await assignVerificationRole(interaction);
    await interaction.reply({ content: result.message, flags: 64 });
  }
};
