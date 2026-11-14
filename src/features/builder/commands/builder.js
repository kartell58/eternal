import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { buildSelectionScreen } from '../interactions/navigation.js';
import { createSession } from '../services/session.service.js';

export default {
  data: new SlashCommandBuilder()
    .setName('builder')
    .setDescription('Open the visual message builder to create, edit, preview, and publish messages'),

  async execute(interaction) {
    try {
      const session = createSession(interaction.user.id, interaction.guildId, interaction.channelId, 'components_v2');
      session.view = 'selection';
      const view = buildSelectionScreen(session);
      await interaction.reply({ ...view, flags: (view.flags || 0) | MessageFlags.Ephemeral });
    } catch (e) {
      // Interaction may have expired/been acknowledged elsewhere; avoid crashing the process
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'Could not open the builder. Please try again.', flags: MessageFlags.Ephemeral });
        };
      } catch {}
    }
  }
};
