const { handleNavigation } = require('./navigation');
const { handleComponents } = require('./components');
const { handleProperties } = require('./properties');
const { handlePublishing } = require('./publishing');
const { getAction } = require('../services/published-actions.service');

const SAFE_INTERNAL_ACTIONS = new Set(['noop', 'acknowledge', 'builder_info']);

function isBuilderSessionInteraction(id) {
  return typeof id === 'string' && id.startsWith('bld:');
}

function replySafe(interaction, payload) {
  if (interaction.deferred || interaction.replied) return interaction.followUp(payload).catch(() => {});
  return interaction.reply(payload).catch(() => {});
}

async function getInteractionTranslator(interaction) {
  const lang = interaction && interaction.client ? interaction.client.language : null;
  if (!lang) {
    return (key, vars, fallback) => {
      let out = fallback || key;
      if (vars) for (const [k, v] of Object.entries(vars)) out = out.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}}`, 'g'), String(v));
      return out;
    };
  }
  let locale = 'en-US';
  try {
    locale = await lang.resolve({ userId: interaction.user?.id, guildId: interaction.guildId || null });
  } catch {
    locale = lang.getDefaultLocale ? lang.getDefaultLocale() : 'en-US';
  }
  return (key, vars, fallback) => {
    const translated = lang.t(key, vars, locale);
    if (translated === key && fallback != null) {
      let out = fallback;
      if (vars) for (const [k, v] of Object.entries(vars)) out = out.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}}`, 'g'), String(v));
      return out;
    }
    return translated;
  };
}

async function handlePublishedRuntime(interaction) {
  const id = interaction.customId || '';
  const msgId = interaction.message?.id;
  if (!msgId) return false;
  const action = getAction(msgId, id);
  if (!action) return false;

  const t = await getInteractionTranslator(interaction);

  // Context validation
  if (action.guildId && interaction.guildId && action.guildId !== interaction.guildId) {
    await replySafe(interaction, { content: t('events.builder.runtime.invalid_guild', {}, 'This action is not valid in this server.'), flags: 64 });
    return true;
  }
  if (action.channelId && interaction.channelId && action.channelId !== interaction.channelId) {
    await replySafe(interaction, { content: t('events.builder.runtime.invalid_channel', {}, 'This action is not valid in this channel.'), flags: 64 });
    return true;
  }

  const safeAllowedMentions = { parse: [] };

  if (action.kind === 'select') {
    const vals = interaction.values || [];
    const joined = vals.join(', ') || t('events.builder.runtime.selection_none', {}, '(none)');
    await replySafe(interaction, { content: t('events.builder.runtime.selection_received', { values: joined }, `Selection received: ${joined}`).slice(0, 2000), flags: 64, allowedMentions: safeAllowedMentions });
    return true;
  }

  // Authorization policy:
  // - ephemeral: any user may trigger
  // - channel: any user may trigger (posts configured content)
  // - update: restricted to original publisher/owner if known
  // - internal: restricted to original publisher/owner if known
  const type = action.type || 'ephemeral';
  const value = action.value || t('events.builder.runtime.action_executed', {}, 'Action executed.');

  if (type === 'update' || type === 'internal') {
    if (action.ownerId && interaction.user.id !== action.ownerId) {
      await replySafe(interaction, { content: t('events.builder.runtime.unauthorized', {}, 'You are not authorized to use this action.'), flags: 64, allowedMentions: safeAllowedMentions });
      return true;
    }
  }

  if (type === 'ephemeral') {
    await replySafe(interaction, { content: String(value).slice(0, 2000), flags: 64, allowedMentions: safeAllowedMentions });
  } else if (type === 'channel') {
    await replySafe(interaction, { content: String(value).slice(0, 2000), allowedMentions: safeAllowedMentions });
  } else if (type === 'update') {
    // Safe update: update only the message content region we control; do not expose arbitrary component reconfiguration
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: String(value).slice(0, 2000), flags: 64, allowedMentions: safeAllowedMentions }).catch(() => {});
    } else {
      await interaction.update({ content: String(value).slice(0, 2000), allowedMentions: safeAllowedMentions }).catch(async () => {
        await replySafe(interaction, { content: t('events.builder.runtime.update_failed', {}, 'Could not update this message interaction.'), flags: 64, allowedMentions: safeAllowedMentions });
      });
    }
  } else if (type === 'internal') {
    // Safe allowlisted dispatch (no dynamic/arbitrary execution)
    const name = String(value || '').trim();
    if (!SAFE_INTERNAL_ACTIONS.has(name)) {
      const display = name.slice(0, 100) || t('events.builder.runtime.internal_empty', {}, '(empty)');
      await replySafe(interaction, { content: t('events.builder.runtime.internal_not_allowed', { name: display }, `Internal action not allowed: ${display}`), flags: 64, allowedMentions: safeAllowedMentions });
      return true;
    }
    if (name === 'noop') {
      await replySafe(interaction, { content: t('events.builder.runtime.internal_noop', {}, 'Internal action executed (noop).'), flags: 64, allowedMentions: safeAllowedMentions });
    } else if (name === 'acknowledge') {
      await replySafe(interaction, { content: t('events.builder.runtime.acknowledged', {}, 'Acknowledged.'), flags: 64, allowedMentions: safeAllowedMentions });
    } else if (name === 'builder_info') {
      await replySafe(interaction, { content: t('events.builder.runtime.builder_info', {}, 'This message was published with Eternal Builder. No privileged internal action was executed.'), flags: 64, allowedMentions: safeAllowedMentions });
    } else {
      await replySafe(interaction, { content: t('events.builder.runtime.internal_unavailable', {}, 'Internal action is not available.'), flags: 64, allowedMentions: safeAllowedMentions });
    }
  } else {
    await replySafe(interaction, { content: String(value).slice(0, 2000), flags: 64, allowedMentions: safeAllowedMentions });
  }
  return true;
}

async function routeBuilderInteraction(interaction) {
  if (interaction.isChatInputCommand()) return false;
  const id = interaction.customId;
  if (!id) return false;

  // 1) Builder session interactions (always bld:<sid>:...)
  if (isBuilderSessionInteraction(id)) {
    const parts = id.split(':');
    const sid = parts[1];
    const domain = parts[2];
    const ctx = { sid, parts };
    if (domain === 'nav') { await handleNavigation(interaction, ctx); return true; }
    if (domain === 'cmp') { await handleComponents(interaction, ctx); return true; }
    if (domain === 'prop') { await handleProperties(interaction, ctx); return true; }
    if (domain === 'pub') { await handlePublishing(interaction, ctx); return true; }
    const t = await getInteractionTranslator(interaction);
    await replySafe(interaction, { content: t('events.builder.errors.unknown_interaction', {}, 'Unknown builder interaction.'), flags: 64 });
    return true;
  }

  // 2) Published runtime actions (lookup by message+customId, regardless of prefix)
  if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isUserSelectMenu?.() || interaction.isRoleSelectMenu?.() || interaction.isMentionableSelectMenu?.() || interaction.isChannelSelectMenu?.()) {
    const handled = await handlePublishedRuntime(interaction);
    if (handled) return true;
  }

  return false;
}

module.exports = { routeBuilderInteraction, isBuilderSessionInteraction, handlePublishedRuntime, SAFE_INTERNAL_ACTIONS };
