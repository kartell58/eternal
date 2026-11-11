const { Events } = require('discord.js');
const { routeBuilderInteraction } = require('../features/builder/interactions/router');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    try {
      await routeBuilderInteraction(interaction);
    } catch (err) {
      console.error('Builder interaction error:', err);
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({ content: `Builder error: ${err.message}`, flags: 64 });
        } else if (interaction.isRepliable && interaction.isRepliable()) {
          await interaction.reply({ content: `Builder error: ${err.message}`, flags: 64 });
        }
      } catch {}
    }
  }
};
