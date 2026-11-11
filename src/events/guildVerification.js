const { Events } = require("discord.js");
const { get } = require("../settings");

module.exports = {
  name: Events.InteractionCreate,

  async execute(interaction) {
    if (!interaction.isButton()) return;
    if (interaction.customId !== "btn_verify") return;

    const guild = interaction.guild;
    const roleId = get(guild.id, "verificationRole");
    const role = roleId ? guild.roles.cache.get(roleId) : null;

    if (!role) {
      await interaction.reply({
        content: "Verification role is not configured. Please notify an administrator.",
        flags: 64
      });
      return;
    }

    // Check if the member already has the role before trying to assign it
    if (interaction.member.roles.cache.has(role.id)) {
      await interaction.reply({
        content: "You already have the verification role!",
        flags: 64
      });
      return;
    }

    const me = guild.members.me;
    if (me && me.roles.highest.position <= role.position) {
      await interaction.reply({
        content: "I cannot assign this role due to role hierarchy. Please notify an administrator.",
        flags: 64
      });
      return;
    }

    try {
      await interaction.member.roles.add(role, "Verification completed");
      await interaction.reply({
        content: `Congratulations! You received the ${role} role.`,
        flags: 64
      });
    } catch (err) {
      console.error("Error adding verification role:", err);
      await interaction.reply({
        content: "Error assigning role. Please try again or notify an administrator.",
        flags: 64
      });
    }
  }
};
