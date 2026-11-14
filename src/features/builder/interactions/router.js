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

function makeFallbackTranslator() {
  return (key, vars, fallback) => {
    let out = fallback != null ? fallback : key;
    if (vars && typeof out === 'string') {
      for (const [k, v] of Object.entries(vars)) {
        out = out.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}}`, 'g'), String(v));
      }
    }
    return out;
  };
}

async function resolveLocale(interaction, { publicResponse = false } = {}) {
  const lang = interaction && interaction.client ? interaction.client.language : null;
  if (!lang) return { lang: null, locale: 'en-US' };
  try {
    const locale = publicResponse
      ? await lang.resolve({ guildId: interaction.guildId || (interaction.guild ? interaction.guild.id : null) })
      : await lang.resolve({ userId: interaction.user?.id, guildId: interaction.guildId || null });
    return { lang, locale };
  } catch {
    return { lang, locale: lang.getDefaultLocale ? lang.getDefaultLocale() : 'en-US' };
  }
}

function makeTranslator(lang, locale) {
  if (!lang) return makeFallbackTranslator();
  return (key, vars, fallback) => {
    const translated = lang.t(key, vars, locale);
    if (translated === key && fallback != null) {
      let out = fallback;
      if (vars && typeof out === 'string') {
        for (const [k, v] of Object.entries(vars)) out = out.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}}`, 'g'), String(v));
      }
      return out;
    }
    return translated;
  };
}

/**
 * Resolve translator for interaction responses.
 * - Ephemeral responses: individual user's effective locale.
 * - Public responses: guild locale.
 * - Public messages published by the Builder must use guild locale (handled at publish/build time).
 */
async function getInteractionTranslator(interaction, options = {}) {
  const { lang, locale } = await resolveLocale(interaction, options);
  return makeTranslator(lang, locale);
}

async function handlePublishedRuntime(interaction) {
  const id = interaction.customId || '';
  const msgId = interaction.message?.id;
  if (!msgId) return false;
  const action = getAction(msgId, id);
  if (!action) return false;

  // Context validation (ephemeral feedback to interacting user)
  const tUser = await getInteractionTranslator(interaction, { publicResponse: false });

  if (action.guildId && interaction.guildId && action.guildId !== interaction.guildId) {
    await replySafe(interaction, { content: tUser('events.builder.runtime.invalid_guild', {}, 'This action is not valid in this server.'), flags: 64 });
    return true;
  }
  if (action.channelId && interaction.channelId && action.channelId !== interaction.channelId) {
    await replySafe(interaction, { content: tUser('events.builder.runtime.invalid_channel', {}, 'This action is not valid in this channel.'), flags: 64 });
    return true;
  }

  const safeAllowedMentions = { parse: [] };

  if (action.kind === 'select') {
    const vals = interaction.values || [];
    const joined = vals.join(', ') || tUser('events.builder.runtime.selection_none', {}, '(none)');
    await replySafe(interaction, { content: tUser('events.builder.runtime.selection_received', { values: joined }, `Selection received: ${joined}`).slice(0, 2000), flags: 64, allowedMentions: safeAllowedMentions });
    return true;
  }

  // Authorization policy:
  // - ephemeral: any user may trigger
  // - channel: any user may trigger (posts configured content, public response)
  // - update: restricted to original publisher/owner if known (shared message update)
  // - internal: restricted to original publisher/owner if known (ephemeral feedback)
  const type = action.type || 'ephemeral';
  const isPublicAction = type === 'channel' || type === 'update';
  const t = isPublicAction
    ? await getInteractionTranslator(interaction, { publicResponse: true })
    : tUser;
  const value = action.value || t('events.builder.runtime.action_executed', {}, 'Action executed.');

  if (type === 'update' || type === 'internal') {
    if (action.ownerId && interaction.user.id !== action.ownerId) {
      await replySafe(interaction, { content: tUser('events.builder.runtime.unauthorized', {}, 'You are not authorized to use this action.'), flags: 64, allowedMentions: safeAllowedMentions });
      return true;
    }
  }

  if (type === 'ephemeral') {
    await replySafe(interaction, { content: String(value).slice(0, 2000), flags: 64, allowedMentions: safeAllowedMentions });
  } else if (type === 'channel') {
    // Public response: guild locale.
    await replySafe(interaction, { content: String(value).slice(0, 2000), allowedMentions: safeAllowedMentions });
  } else if (type === 'update') {
    // Shared message update: treat as public/guild-locale response context.
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: String(value).slice(0, 2000), flags: 64, allowedMentions: safeAllowedMentions }).catch(() => {});
    } else {
      await interaction.update({ content: String(value).slice(0, 2000), allowedMentions: safeAllowedMentions }).catch(async () => {
        await replySafe(interaction, { content: tUser('events.builder.runtime.update_failed', {}, 'Could not update this message interaction.'), flags: 64, allowedMentions: safeAllowedMentions });
      });
    }
  } else if (type === 'internal') {
    // Safe allowlisted dispatch (ephemeral feedback)
    const name = String(value || '').trim();
    if (!SAFE_INTERNAL_ACTIONS.has(name)) {
      const display = name.slice(0, 100) || tUser('events.builder.runtime.internal_empty', {}, '(empty)');
      await replySafe(interaction, { content: tUser('events.builder.runtime.internal_not_allowed', { name: display }, `Internal action not allowed: ${display}`), flags: 64, allowedMentions: safeAllowedMentions });
      return true;
    }
    if (name === 'noop') {
      await replySafe(interaction, { content: tUser('events.builder.runtime.internal_noop', {}, 'Internal action executed (noop).'), flags: 64, allowedMentions: safeAllowedMentions });
    } else if (name === 'acknowledge') {
      await replySafe(interaction, { content: tUser('events.builder.runtime.acknowledged', {}, 'Acknowledged.'), flags: 64, allowedMentions: safeAllowedMentions });
    } else if (name === 'builder_info') {
      await replySafe(interaction, { content: tUser('events.builder.runtime.builder_info', {}, 'This message was published with Eternal Builder. No privileged internal action was executed.'), flags: 64, allowedMentions: safeAllowedMentions });
    } else {
      await replySafe(interaction, { content: tUser('events.builder.runtime.internal_unavailable', {}, 'Internal action is not available.'), flags: 64, allowedMentions: safeAllowedMentions });
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

  // 1) Builder session interactions (always bld:<sid>:...) - ephemeral session UI
  if (isBuilderSessionInteraction(id)) {
    const parts = id.split(':');
    const sid = parts[1];
    const domain = parts[2];
    const ctx = { sid, parts };
    if (domain === 'nav') { await handleNavigation(interaction, ctx); return true; }
    if (domain === 'cmp') { await handleComponents(interaction, ctx); return true; }
    if (domain === 'prop') { await handleProperties(interaction, ctx); return true; }
    if (domain === 'pub') { await handlePublishing(interaction, ctx); return true; }
    const t = await getInteractionTranslator(interaction, { publicResponse: false });
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

module.exports = { routeBuilderInteraction, isBuilderSessionInteraction, handlePublishedRuntime, getInteractionTranslator, SAFE_INTERNAL_ACTIONS };
