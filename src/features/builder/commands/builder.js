const { SlashCommandBuilder } = require('discord.js');
const { buildHome } = require('../interactions/navigation');
const { createSession } = require('../services/session.service');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('builder')
    .setDescription('Open the visual message builder to create, edit, preview, and publish messages'),

  async execute(interaction) {
    const session = createSession(interaction.user.id, interaction.guildId, interaction.channelId, 'embed');
    session.view = 'home';
    const view = buildHome(session);
    await interaction.reply({ ...view, flags: 64 });
  }
};
