function createDefaultEmbedState() {
  return {
    type: 'embed',
    content: '',
    embed: {
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
    }
  };
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

module.exports = { createDefaultEmbedState, EMBED_LIMITS };
