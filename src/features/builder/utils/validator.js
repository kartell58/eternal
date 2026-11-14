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
  const s = String(str).replace('#', '');
  const n = parseInt(s, 16);
  return Number.isNaN(n) ? null : n;
}

function tr(t, key, vars, fallback) {
  if (typeof t !== 'function') {
    let out = fallback != null ? String(fallback) : key;
    if (vars) for (const [k, v] of Object.entries(vars)) out = out.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}}`, 'g'), String(v));
    return out;
  }
  return t(key, vars, fallback);
}

function validateSingleEmbed(e, prefix = '', t = null) {
  const errors = [];
  const p = prefix ? `${prefix}: ` : '';
  const totalLen = (s) => (s ? String(s).length : 0);
  if (totalLen(e.title) > EMBED_LIMITS.title) errors.push(p + tr(t, 'events.builder.validator.embed.title_exceeds', { limit: EMBED_LIMITS.title }, `Title exceeds ${EMBED_LIMITS.title} chars.`));
  if (totalLen(e.description) > EMBED_LIMITS.description) errors.push(p + tr(t, 'events.builder.validator.embed.description_exceeds', { limit: EMBED_LIMITS.description }, `Description exceeds ${EMBED_LIMITS.description} chars.`));
  if (totalLen(e.footer?.text) > EMBED_LIMITS.footerText) errors.push(p + tr(t, 'events.builder.validator.embed.footer_exceeds', { limit: EMBED_LIMITS.footerText }, `Footer text exceeds ${EMBED_LIMITS.footerText} chars.`));
  if (totalLen(e.author?.name) > EMBED_LIMITS.authorName) errors.push(p + tr(t, 'events.builder.validator.embed.author_exceeds', { limit: EMBED_LIMITS.authorName }, `Author name exceeds ${EMBED_LIMITS.authorName} chars.`));
  const fields = e.fields || [];
  if (fields.length > EMBED_LIMITS.fields) errors.push(p + tr(t, 'events.builder.validator.embed.too_many_fields', { limit: EMBED_LIMITS.fields }, `Too many fields (max ${EMBED_LIMITS.fields}).`));
  fields.forEach((f, i) => {
    const index = i + 1;
    if (totalLen(f.name) > EMBED_LIMITS.fieldName) errors.push(p + tr(t, 'events.builder.validator.embed.field_name_exceeds', { index, limit: EMBED_LIMITS.fieldName }, `Field ${index} name exceeds ${EMBED_LIMITS.fieldName} chars.`));
    if (totalLen(f.value) > EMBED_LIMITS.fieldValue) errors.push(p + tr(t, 'events.builder.validator.embed.field_value_exceeds', { index, limit: EMBED_LIMITS.fieldValue }, `Field ${index} value exceeds ${EMBED_LIMITS.fieldValue} chars.`));
    if (!f.name || !String(f.name).trim()) errors.push(p + tr(t, 'events.builder.validator.embed.field_name_required', { index }, `Field ${index} requires a name.`));
    if (!f.value || !String(f.value).trim()) errors.push(p + tr(t, 'events.builder.validator.embed.field_value_required', { index }, `Field ${index} requires a value.`));
  });
  const urls = [
    ['author_url', e.author?.url, 'Author URL'],
    ['author_icon', e.author?.icon_url, 'Author icon'],
    ['title_url', e.url, 'Title URL'],
    ['thumbnail_url', e.thumbnail?.url, 'Thumbnail URL'],
    ['image_url', e.image?.url, 'Image URL'],
    ['footer_icon', e.footer?.icon_url, 'Footer icon']
  ];
  for (const [key, u, fallbackLabel] of urls) {
    if (u && !isValidUrl(u)) {
      const label = tr(t, `events.builder.validator.embed.url_labels.${key}`, {}, fallbackLabel);
      errors.push(p + tr(t, 'events.builder.validator.embed.invalid_url', { label }, `${label} is not a valid URL.`));
    }
  }
  if (e.color != null && e.color !== '' && !isHexColor(e.color)) errors.push(p + tr(t, 'events.builder.validator.embed.invalid_color', {}, 'Embed color must be a valid hex color.'));
  let total = 0;
  total += totalLen(e.title) + totalLen(e.description) + totalLen(e.footer?.text) + totalLen(e.author?.name);
  fields.forEach(f => { total += totalLen(f.name) + totalLen(f.value); });
  if (total > EMBED_LIMITS.total) errors.push(p + tr(t, 'events.builder.validator.embed.total_exceeds', { limit: EMBED_LIMITS.total }, `Total embed length exceeds ${EMBED_LIMITS.total} chars.`));
  return errors;
}

function hasAnyEmbedContent(e) {
  if (!e) return false;
  if (e.title || e.description || e.url || e.timestamp) return true;
  if (e.color != null && e.color !== '') return true;
  if (e.author?.name || e.author?.url || e.author?.icon_url) return true;
  if (e.footer?.text || e.footer?.icon_url) return true;
  if (e.thumbnail?.url || e.image?.url) return true;
  if (Array.isArray(e.fields) && e.fields.some(f => f && (f.name || f.value))) return true;
  return false;
}

function validateEmbedState(state, t = null) {
  const { normalizeEmbedState } = require('../schemas/embed.schema');
  normalizeEmbedState(state);
  const errors = [];
  const embeds = Array.isArray(state.embeds) ? state.embeds : (state.embed ? [state.embed] : []);
  if (embeds.length > 10) errors.push(tr(t, 'events.builder.validator.embed.max_embeds', {}, 'A message can have at most 10 embeds.'));
  const toValidate = embeds.filter((e, i) => hasAnyEmbedContent(e) || embeds.length === 1 || i === (state.selectedEmbedIndex || 0));
  if (embeds.length > 1) {
    toValidate.forEach((e) => {
      const idx = embeds.indexOf(e);
      const prefix = tr(t, 'events.builder.validator.embed.embed_prefix', { index: idx + 1 }, `Embed ${idx + 1}`);
      errors.push(...validateSingleEmbed(e || {}, prefix, t));
    });
  } else {
    errors.push(...validateSingleEmbed(embeds[0] || {}, '', t));
  }
  if (state.content && String(state.content).length > 2000) errors.push(tr(t, 'events.builder.validator.embed.content_exceeds', {}, 'Message content exceeds 2000 chars.'));
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

function validateComponentsV2State(state, t = null) {
  const errors = [];
  const root = state.root || [];
  if (root.length === 0) errors.push(tr(t, 'events.builder.validator.cv2.no_root', {}, 'Components V2 message must have at least one top-level component.'));
  for (const top of root) {
    if (top.type !== 'container') errors.push(tr(t, 'events.builder.validator.cv2.root_must_be_container', {}, 'Top-level Components V2 items must be Containers in this builder.'));
  }
  const counts = countComponents(root);
  if (counts.total > 40) errors.push(tr(t, 'events.builder.validator.cv2.too_many', {}, 'Too many components (max 40).'));
  function checkNode(node) {
    if (!node) return;
    if (node.type === 'text_display' && (!node.content || !String(node.content).trim())) {
      errors.push(tr(t, 'events.builder.validator.cv2.text_required', {}, 'Text Display components must have content.'));
    }
    if (node.type === 'button') {
      if (!node.label && !node.emoji) errors.push(tr(t, 'events.builder.validator.cv2.button_label_emoji', {}, 'Buttons must have a label or emoji.'));
      if (node.style === 5 || node.style === '5') {
        if (!node.url) errors.push(tr(t, 'events.builder.validator.cv2.link_url', {}, 'Link buttons require a URL.'));
      }
    }
    if (node.type === 'action_row') {
      const hasSelect = (node.components || []).some(c => c.type && c.type.endsWith('_select'));
      const hasButtons = (node.components || []).some(c => c.type === 'button');
      if (hasSelect && node.components.length > 1) errors.push(tr(t, 'events.builder.validator.cv2.action_row_select_alone', {}, 'An action row with a select menu can only contain that select.'));
      if (hasButtons && node.components.length > 5) errors.push(tr(t, 'events.builder.validator.cv2.action_row_max_buttons', {}, 'An action row can contain at most 5 buttons.'));
    }
    if (node.type === 'section') {
      const texts = node.components || [];
      if (texts.length < 1 || texts.length > 3) errors.push(tr(t, 'events.builder.validator.cv2.section_texts', {}, 'A section must have 1-3 text displays.'));
      if (!node.accessory) errors.push(tr(t, 'events.builder.validator.cv2.section_accessory', {}, 'A section must have an accessory (thumbnail or button).'));
    }
    if (node.type === 'media_gallery') {
      if (!node.items || node.items.length === 0) errors.push(tr(t, 'events.builder.validator.cv2.gallery_items', {}, 'Media gallery must have at least one item.'));
      (node.items || []).forEach((it, i) => { if (!it.url) errors.push(tr(t, 'events.builder.validator.cv2.gallery_url', { index: i + 1 }, `Media gallery item ${i + 1} requires a URL.`)); });
    }
    if (node.type === 'file') {
      if (!node.file) errors.push(tr(t, 'events.builder.validator.cv2.file_required', {}, 'File component requires a file reference (attachment name or URL).'));
    }
    if (Array.isArray(node.components)) node.components.forEach(c => checkNode(c));
    if (node.accessory) checkNode(node.accessory);
  }
  root.forEach(n => checkNode(n));
  return { valid: errors.length === 0, errors };
}

module.exports = { isValidUrl, isHexColor, parseColor, validateEmbedState, validateComponentsV2State };
