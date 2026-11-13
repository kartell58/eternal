const { Events } = require('discord.js');
const { routeBuilderInteraction } = require('../features/builder/interactions/router');

function fallbackT(lang, locale, key, vars, fallback) {
  if (lang) return lang.t(key, vars, locale);
  let out = fallback || key;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}}`, 'g'), String(v));
  return out;
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    try {
      await routeBuilderInteraction(interaction);
    } catch (err) {
      console.error('Builder interaction error:', err);
      try {
        const lang = interaction.client ? interaction.client.language : null;
        let locale = 'en-US';
        if (lang) {
          try { locale = await lang.resolve({ userId: interaction.user?.id, guildId: interaction.guildId || null }); } catch {}
        }
        const content = fallbackT(lang, locale, 'events.builder.errors.generic', { error: err.message }, `Builder error: ${err.message}`);
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({ content, flags: 64 });
        } else if (interaction.isRepliable && interaction.isRepliable()) {
          await interaction.reply({ content, flags: 64 });
        }
      } catch {}
    }
  }
};
