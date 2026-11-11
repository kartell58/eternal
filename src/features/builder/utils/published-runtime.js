const { safeCustomId } = require('../builders/components-v2.builder');
const { setAction } = require('../services/published-actions.service');

function collectActionsFromState(state, messageId, meta = {}) {
  if (!state || state.type !== 'components_v2') return;
  const baseMeta = {
    ownerId: meta.ownerId || null,
    guildId: meta.guildId || null,
    channelId: meta.channelId || null
  };
  function visit(node) {
    if (!node) return;
    if (node.type === 'button' && node.style !== 5 && node.style !== 'link') {
      const cid = (node.custom_id && String(node.custom_id).trim()) || safeCustomId(node, 'btn');
      if (node.action) setAction(messageId, cid, { ...node.action, kind: 'button', ...baseMeta });
    }
    if (node.type && node.type.endsWith('_select')) {
      const cid = (node.custom_id && String(node.custom_id).trim()) || safeCustomId(node, 'sel');
      setAction(messageId, cid, { type: 'select', options: node.options || [], kind: 'select', ...baseMeta });
    }
    if (Array.isArray(node.components)) node.components.forEach(visit);
    if (node.accessory) visit(node.accessory);
  }
  (state.root || []).forEach(visit);
}

module.exports = { collectActionsFromState };
