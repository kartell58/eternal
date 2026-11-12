const { createDefaultComponentsV2State, createContainer, createTextDisplay } = require('../schemas/components-v2.schema');
const { createDefaultEmbedState, normalizeEmbedState } = require('../schemas/embed.schema');

const DEFAULT_JSON_TEMPLATE = {
  version: '1.0',
  containers: [
    {
      type: 'container',
      accent_color: 5793266,
      items: [
        {
          type: 'text_display',
          content: '### Criação de Containers\nLembre-se de usar [formatações de texto](<https://www.youtube.com/watch?v=Nb6xLq8CsKE>)!\n-# Vídeo do Canal Dune de guia de formatação'
        }
      ]
    }
  ]
};

function getDefaultJsonTemplateString() {
  return JSON.stringify(DEFAULT_JSON_TEMPLATE, null, 2);
}

function isPristineDefaultState(session) {
  if (!session || !session.state) return true;
  if (session.draftId || session.templateId || session.editingMessage) return false;
  if (session.state.type !== 'components_v2') return false;
  const root = session.state.root || [];
  if (root.length !== 1) return false;
  const c = root[0];
  if (!c || c.type !== 'container') return false;
  const defaultAccent = 0x5865F2;
  if (c.accent_color !== defaultAccent || c.spoiler) return false;
  const comps = c.components || [];
  if (comps.length !== 1) return false;
  const t = comps[0];
  const defaultContent = '### Criação de Containers\nLembre-se de usar [formatações de texto](<https://www.youtube.com/watch?v=Nb6xLq8CsKE>)!\n-# Vídeo do Canal Dune de guia de formatação';
  return t && t.type === 'text_display' && t.content === defaultContent;
}

function convertV1ToState(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { error: 'Document must be an object.' };
  if (!Array.isArray(doc.containers)) return { error: 'v1 document must include a `containers` array.' };
  const state = createDefaultComponentsV2State();
  state.root = [];
  state.content = typeof doc.content === 'string' ? doc.content : '';
  for (const c of doc.containers) {
    if (!c || typeof c !== 'object') return { error: 'Each container must be an object.' };
    if (c.type && c.type !== 'container') return { error: 'Only container items are supported at top level in v1 documents.' };
    const container = createContainer();
    container.components = [];
    if (c.accent_color != null) container.accent_color = c.accent_color;
    if (typeof c.spoiler === 'boolean') container.spoiler = c.spoiler;
    const items = Array.isArray(c.items) ? c.items : Array.isArray(c.components) ? c.components : [];
    for (const item of items) {
      if (!item || typeof item !== 'object') return { error: 'Container items must be objects.' };
      if (item.type === 'text_display') {
        container.components.push({ ...createTextDisplay(typeof item.content === 'string' ? item.content : ''), content: typeof item.content === 'string' ? item.content : '' });
      } else {
        // Preserve unknown-but-structured items as-is (with _id if missing) for best-effort import; validator will catch issues
        const { uid } = require('../schemas/components-v2.schema');
        container.components.push({ _id: item._id || uid(), ...item });
      }
    }
    if (container.components.length === 0) container.components.push(createTextDisplay('New text'));
    state.root.push(container);
  }
  if (state.root.length === 0) return { error: 'v1 document must include at least one container.' };
  return { state };
}

function normalizeImportedDocument(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { error: 'Unsupported JSON structure: expected a builder document/state object.' };
  }
  let candidate = parsed;
  if (parsed.state && typeof parsed.state === 'object' && !Array.isArray(parsed.state)) {
    candidate = parsed.state;
  }
  // v1 document format
  if (candidate.version === '1.0' || (Array.isArray(candidate.containers) && !candidate.type)) {
    return convertV1ToState(candidate);
  }
  if (candidate.type !== 'embed' && candidate.type !== 'components_v2') {
    return { error: 'Unsupported JSON structure: missing or invalid `type` (expected `embed` or `components_v2`).' };
  }
  if (candidate.type === 'components_v2' && !Array.isArray(candidate.root)) {
    return { error: 'Unsupported Components V2 document: `root` must be an array.' };
  }
  if (candidate.type === 'embed') {
    const hasEmbeds = Array.isArray(candidate.embeds);
    const hasEmbed = typeof candidate.embed === 'object' && candidate.embed != null && !Array.isArray(candidate.embed);
    if (!hasEmbeds && !hasEmbed) {
      return { error: 'Unsupported embed document: `embed` or `embeds` is required.' };
    }
    const state = JSON.parse(JSON.stringify(candidate));
    normalizeEmbedState(state);
    return { state };
  }
  return { state: JSON.parse(JSON.stringify(candidate)) };
}

module.exports = {
  DEFAULT_JSON_TEMPLATE,
  getDefaultJsonTemplateString,
  isPristineDefaultState,
  normalizeImportedDocument
};
