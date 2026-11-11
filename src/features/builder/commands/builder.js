const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { buildHome } = require('../interactions/navigation');
const { createSession } = require('../services/session.service');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('builder')
    .setDescription('Open the visual message builder to create, edit, preview, and publish messages'),

  async execute(interaction) {
    try {
      const session = createSession(interaction.user.id, interaction.guildId, interaction.channelId, 'components_v2');
      session.view = 'home';
      session.selectedNodeId = session.state.root?.[0]?._id || null;
      const view = buildHome(session);
      await interaction.reply({ ...view, flags: (view.flags || 0) | MessageFlags.Ephemeral });
    } catch (e) {
      // Interaction may have expired/been acknowledged elsewhere; avoid crashing the process
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'Could not open the builder. Please try again.', flags: MessageFlags.Ephemeral });
        }
      } catch {}
    }
  }
};
