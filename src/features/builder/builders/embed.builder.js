import { EmbedBuilder } from 'discord.js';
import { parseColor } from '../utils/validator.js';
import { normalizeEmbedState } from '../schemas/embed.schema.js';

function buildSingleEmbed(e) {
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

  return embed;
}

function hasEmbedContent(e) {
  if (!e) return false;
  if (e.title || e.description || e.url || e.timestamp) return true;
  if (e.color != null && e.color !== '') return true;
  if (e.author?.name || e.author?.url || e.author?.icon_url) return true;
  if (e.footer?.text || e.footer?.icon_url) return true;
  if (e.thumbnail?.url || e.image?.url) return true;
  if (Array.isArray(e.fields) && e.fields.some(f => f && (f.name || f.value))) return true;
  return false;
}

function buildEmbedPayload(state) {
  normalizeEmbedState(state);
  const embeds = (state.embeds || []).filter(hasEmbedContent).map(buildSingleEmbed);
  return {
    content: state.content || undefined,
    embeds,
    components: []
  };
}

export { buildEmbedPayload, buildSingleEmbed, hasEmbedContent };

export default { buildEmbedPayload, buildSingleEmbed, hasEmbedContent };
