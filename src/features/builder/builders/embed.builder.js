const { EmbedBuilder } = require('discord.js');
const { parseColor } = require('../utils/validator');

function buildEmbedPayload(state) {
  const e = state.embed || {};
  const embed = new EmbedBuilder();

  if (e.title) embed.setTitle(e.title);
  if (e.url) embed.setURL(e.url);
  if (e.description) embed.setDescription(e.description);

  const color = parseColor(e.color);
  if (color != null) embed.setColor(color);

  if (e.author?.name) {
    embed.setAuthor({
      name: e.author.name,
      url: e.author.url || undefined,
      iconURL: e.author.icon_url || undefined
    });
  }

  if (e.footer?.text) {
    embed.setFooter({ text: e.footer.text, iconURL: e.footer.icon_url || undefined });
  }

  if (e.thumbnail?.url) embed.setThumbnail(e.thumbnail.url);
  if (e.image?.url) embed.setImage(e.image.url);
  if (e.timestamp) embed.setTimestamp(new Date(e.timestamp));

  const fields = (e.fields || []).filter(f => f && f.name && f.value).map(f => ({
    name: f.name,
    value: f.value,
    inline: !!f.inline
  }));
  if (fields.length) embed.addFields(fields);

  return {
    content: state.content || undefined,
    embeds: [embed],
    components: []
  };
}

module.exports = { buildEmbedPayload };
