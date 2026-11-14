import { Events } from 'discord.js';
import { routeBuilderInteraction } from '../features/builder/interactions/router.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.InteractionCreate,
  async execute(interaction) {
    try {
      await routeBuilderInteraction(interaction);
    } catch (err) {
      logger.error('Builder interaction error:', err);
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({ content: `Builder error: ${err.message}`, flags: 64 });
        } else if (interaction.isRepliable && interaction.isRepliable()) {
          await interaction.reply({ content: `Builder error: ${err.message}`, flags: 64 });
        };
      } catch {}
    }
  }
};
