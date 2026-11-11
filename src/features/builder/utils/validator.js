const { EMBED_LIMITS } = require('../schemas/embed.schema');

function isValidUrl(str) {
  if (!str) return true;
  try {
    const u = new URL(str);
    return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'attachment:';
  } catch {
    return false;
  }
}

function isHexColor(str) {
  if (str == null || str === '') return true;
  if (typeof str === 'number') return str >= 0 && str <= 0xffffff;
  return /^#?[0-9a-fA-F]{6}$/.test(str);
}

function parseColor(str) {
  if (str == null || str === '') return null;
  if (typeof str === 'number') return str;
  const s = str.replace('#', '');
  const n = parseInt(s, 16);
  return Number.isNaN(n) ? null : n;
}

function validateEmbedState(state) {
  const errors = [];
  const e = state.embed || {};
  const totalLen = (s) => (s ? String(s).length : 0);
  if (totalLen(e.title) > EMBED_LIMITS.title) errors.push(`Title exceeds ${EMBED_LIMITS.title} chars.`);
  if (totalLen(e.description) > EMBED_LIMITS.description) errors.push(`Description exceeds ${EMBED_LIMITS.description} chars.`);
  if (totalLen(e.footer?.text) > EMBED_LIMITS.footerText) errors.push(`Footer text exceeds ${EMBED_LIMITS.footerText} chars.`);
  if (totalLen(e.author?.name) > EMBED_LIMITS.authorName) errors.push(`Author name exceeds ${EMBED_LIMITS.authorName} chars.`);
  const fields = e.fields || [];
  if (fields.length > EMBED_LIMITS.fields) errors.push(`Too many fields (max ${EMBED_LIMITS.fields}).`);
  fields.forEach((f, i) => {
    if (totalLen(f.name) > EMBED_LIMITS.fieldName) errors.push(`Field ${i + 1} name exceeds ${EMBED_LIMITS.fieldName} chars.`);
    if (totalLen(f.value) > EMBED_LIMITS.fieldValue) errors.push(`Field ${i + 1} value exceeds ${EMBED_LIMITS.fieldValue} chars.`);
    if (!f.name || !String(f.name).trim()) errors.push(`Field ${i + 1} requires a name.`);
    if (!f.value || !String(f.value).trim()) errors.push(`Field ${i + 1} requires a value.`);
  });
  const urls = [
    ['Author URL', e.author?.url],
    ['Author icon', e.author?.icon_url],
    ['Title URL', e.url],
    ['Thumbnail URL', e.thumbnail?.url],
    ['Image URL', e.image?.url],
    ['Footer icon', e.footer?.icon_url]
  ];
  for (const [label, u] of urls) {
    if (u && !isValidUrl(u)) errors.push(`${label} is not a valid URL.`);
  }
  if (e.color != null && e.color !== '' && !isHexColor(e.color)) errors.push('Embed color must be a valid hex color.');
  let total = 0;
  total += totalLen(e.title) + totalLen(e.description) + totalLen(e.footer?.text) + totalLen(e.author?.name);
  fields.forEach(f => { total += totalLen(f.name) + totalLen(f.value); });
  if (total > EMBED_LIMITS.total) errors.push(`Total embed length exceeds ${EMBED_LIMITS.total} chars.`);
  return { valid: errors.length === 0, errors };
}

function countComponents(nodes, acc = { total: 0 }) {
  if (!Array.isArray(nodes)) return acc;
  for (const n of nodes) {
    acc.total++;
    if (n.components) countComponents(n.components, acc);
    if (n.accessory) { acc.total++; }
  }
  return acc;
}

function validateComponentsV2State(state) {
  const errors = [];
  const root = state.root || [];
  if (root.length === 0) errors.push('Components V2 message must have at least one top-level component.');
  for (const top of root) {
    if (top.type !== 'container') errors.push('Top-level Components V2 items must be Containers in this builder.');
  }
  const counts = countComponents(root);
  if (counts.total > 40) errors.push('Too many components (max 40).');
  // basic recursive checks
  function checkNode(node, parentType) {
    if (!node) return;
    if (node.type === 'text_display' && (!node.content || !String(node.content).trim())) {
      errors.push('Text Display components must have content.');
    }
    if (node.type === 'button') {
      if (!node.label && !node.emoji) errors.push('Buttons must have a label or emoji.');
      if (node.style === 5 || node.style === '5') {
        if (!node.url) errors.push('Link buttons require a URL.');
      } else {
        // ensure custom_id exists for non-link
      }
    }
    if (node.type === 'action_row') {
      const hasSelect = (node.components || []).some(c => c.type && c.type.endsWith('_select'));
      const hasButtons = (node.components || []).some(c => c.type === 'button');
      if (hasSelect && node.components.length > 1) errors.push('An action row with a select menu can only contain that select.');
      if (hasButtons && node.components.length > 5) errors.push('An action row can contain at most 5 buttons.');
    }
    if (node.type === 'section') {
      const texts = node.components || [];
      if (texts.length < 1 || texts.length > 3) errors.push('A section must have 1-3 text displays.');
      if (!node.accessory) errors.push('A section must have an accessory (thumbnail or button).');
    }
    if (node.type === 'media_gallery') {
      if (!node.items || node.items.length === 0) errors.push('Media gallery must have at least one item.');
      node.items.forEach((it, i) => { if (!it.url) errors.push(`Media gallery item ${i + 1} requires a URL.`); });
    }
    if (node.type === 'file') {
      if (!node.file) errors.push('File component requires a file reference (attachment name or URL).');
    }
    if (Array.isArray(node.components)) node.components.forEach(c => checkNode(c, node.type));
    if (node.accessory) checkNode(node.accessory, node.type);
  }
  root.forEach(n => checkNode(n, 'root'));
  return { valid: errors.length === 0, errors };
}

module.exports = { isValidUrl, isHexColor, parseColor, validateEmbedState, validateComponentsV2State };
