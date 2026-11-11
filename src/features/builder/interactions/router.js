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

async function handlePublishedRuntime(interaction) {
  const id = interaction.customId || '';
  const msgId = interaction.message?.id;
  if (!msgId) return false;
  const action = getAction(msgId, id);
  if (!action) return false;

  // Context validation
  if (action.guildId && interaction.guildId && action.guildId !== interaction.guildId) {
    await replySafe(interaction, { content: 'This action is not valid in this server.', flags: 64 });
    return true;
  }
  if (action.channelId && interaction.channelId && action.channelId !== interaction.channelId) {
    await replySafe(interaction, { content: 'This action is not valid in this channel.', flags: 64 });
    return true;
  }

  const safeAllowedMentions = { parse: [] };

  if (action.kind === 'select') {
    const vals = interaction.values || [];
    await replySafe(interaction, { content: `Selection received: ${vals.join(', ') || '(none)'}`.slice(0, 2000), flags: 64, allowedMentions: safeAllowedMentions });
    return true;
  }

  // Authorization policy:
  // - ephemeral: any user may trigger
  // - channel: any user may trigger (posts configured content)
  // - update: restricted to original publisher/owner if known
  // - internal: restricted to original publisher/owner if known
  const type = action.type || 'ephemeral';
  const value = action.value || 'Action executed.';

  if (type === 'update' || type === 'internal') {
    if (action.ownerId && interaction.user.id !== action.ownerId) {
      await replySafe(interaction, { content: 'You are not authorized to use this action.', flags: 64, allowedMentions: safeAllowedMentions });
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
        await replySafe(interaction, { content: 'Could not update this message interaction.', flags: 64, allowedMentions: safeAllowedMentions });
      });
    }
  } else if (type === 'internal') {
    // Safe allowlisted dispatch (no dynamic/arbitrary execution)
    const name = String(value || '').trim();
    if (!SAFE_INTERNAL_ACTIONS.has(name)) {
      await replySafe(interaction, { content: `Internal action not allowed: ${name.slice(0, 100) || '(empty)'}`, flags: 64, allowedMentions: safeAllowedMentions });
      return true;
    }
    if (name === 'noop') {
      await replySafe(interaction, { content: 'Internal action executed (noop).', flags: 64, allowedMentions: safeAllowedMentions });
    } else if (name === 'acknowledge') {
      await replySafe(interaction, { content: 'Acknowledged.', flags: 64, allowedMentions: safeAllowedMentions });
    } else if (name === 'builder_info') {
      await replySafe(interaction, { content: 'This message was published with Eternal Builder. No privileged internal action was executed.', flags: 64, allowedMentions: safeAllowedMentions });
    } else {
      await replySafe(interaction, { content: 'Internal action is not available.', flags: 64, allowedMentions: safeAllowedMentions });
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
    if (domain === 'nav') return handleNavigation(interaction, ctx), true;
    if (domain === 'cmp') return handleComponents(interaction, ctx), true;
    if (domain === 'prop') return handleProperties(interaction, ctx), true;
    if (domain === 'pub') return handlePublishing(interaction, ctx), true;
    await replySafe(interaction, { content: 'Unknown builder interaction.', flags: 64 });
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
