import { Events } from "discord.js";
import { assignVerificationRole } from "../features/verification/role.js";

export default {
  name: Events.InteractionCreate,

  async execute(interaction) {
    if (!interaction.isButton()) return;
    if (interaction.customId !== "btn_verify") return;

    const result = await assignVerificationRole(interaction);
    await interaction.reply({ content: result.message, flags: 64 });
  }
};
