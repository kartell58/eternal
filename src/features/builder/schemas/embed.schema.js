function createEmptyEmbed() {
  return {
    author: { name: '', icon_url: '', url: '' },
    title: '',
    url: '',
    description: '',
    color: null,
    fields: [],
    thumbnail: { url: '' },
    image: { url: '' },
    footer: { text: '', icon_url: '' },
    timestamp: null
  };
}

function createDefaultEmbedState() {
  return {
    type: 'embed',
    content: '',
    embeds: [createEmptyEmbed()],
    selectedEmbedIndex: 0,
    // legacy compatibility field kept in sync by helpers
    embed: null
  };
}

function normalizeEmbedState(state) {
  if (!state || state.type !== 'embed') return state;
  if (!Array.isArray(state.embeds)) {
    // migrate legacy single embed
    if (state.embed && typeof state.embed === 'object') {
      state.embeds = [JSON.parse(JSON.stringify(state.embed))];
    } else {
      state.embeds = [createEmptyEmbed()];
    }
  }
  if (state.embeds.length === 0) state.embeds.push(createEmptyEmbed());
  if (typeof state.selectedEmbedIndex !== 'number' || state.selectedEmbedIndex < 0 || state.selectedEmbedIndex >= state.embeds.length) {
    state.selectedEmbedIndex = 0;
  }
  state.embed = state.embeds[state.selectedEmbedIndex];
  return state;
}

function getSelectedEmbed(state) {
  normalizeEmbedState(state);
  return state.embeds[state.selectedEmbedIndex];
}

const EMBED_LIMITS = {
  title: 256,
  description: 4096,
  fieldName: 256,
  fieldValue: 1024,
  fields: 25,
  footerText: 2048,
  authorName: 256,
  total: 6000
};

module.exports = { createDefaultEmbedState, createEmptyEmbed, normalizeEmbedState, getSelectedEmbed, EMBED_LIMITS };
