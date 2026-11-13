const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { buildSelectionScreen } = require('../interactions/navigation');
const { createSession } = require('../services/session.service');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('builder')
    .setDescription('Open the visual message builder to create, edit, preview, and publish messages'),

  async execute(interaction) {
    const lang = interaction.client.language;
    const locale = lang
      ? await lang.resolve({ userId: interaction.user.id, guildId: interaction.guildId || null })
      : 'en-US';

    try {
      const session = createSession(interaction.user.id, interaction.guildId, interaction.channelId, 'components_v2');
      session.view = 'selection';
      session.locale = locale; // store user effective locale for this ephemeral session
      const view = buildSelectionScreen(session);
      await interaction.reply({ ...view, flags: (view.flags || 0) | MessageFlags.Ephemeral });
    } catch (e) {
      // Interaction may have expired/been acknowledged elsewhere; avoid crashing the process
      try {
        if (!interaction.replied && !interaction.deferred) {
          const msg = lang ? lang.t('commands.builder.open_error', {}, locale) : 'Could not open the builder. Please try again.';
          await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
        }
      } catch {}
    }
  }
};
