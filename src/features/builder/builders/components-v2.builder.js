import {
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ThumbnailBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  FileBuilder,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  MentionableSelectMenuBuilder
} from 'discord.js';

function applyTextDisplay(node) {
  return new TextDisplayBuilder().setContent(String(node.content || '\u200b'));
}

function applySeparator(node) {
  const s = new SeparatorBuilder();
  if (typeof node.divider === 'boolean') s.setDivider(node.divider);
  if (node.spacing != null) s.setSpacing(Number(node.spacing));
  return s;
}

function applyThumbnail(node) {
  const t = new ThumbnailBuilder().setURL(node.url);
  if (node.description) t.setDescription(node.description);
  if (typeof node.spoiler === 'boolean') t.setSpoiler(node.spoiler);
  return t;
}

function applyFile(node) {
  const f = new FileBuilder().setURL(node.file);
  if (typeof node.spoiler === 'boolean') f.setSpoiler(node.spoiler);
  return f;
}

function applyMediaGallery(node) {
  const g = new MediaGalleryBuilder();
  const items = (node.items || []).filter(i => i && i.url).map(i => {
    const mi = new MediaGalleryItemBuilder().setURL(i.url);
    if (i.description) mi.setDescription(i.description);
    if (typeof i.spoiler === 'boolean') mi.setSpoiler(i.spoiler);
    return mi;
  });
  if (items.length) g.addItems(items);
  return g;
}

function safeCustomId(node, prefix) {
  const id = (node.custom_id && String(node.custom_id).trim()) || `bld_${prefix}_${node._id}`;
  return id.slice(0, 100);
}

function styleToEnum(s) {
  const map = { 1: ButtonStyle.Primary, 2: ButtonStyle.Secondary, 3: ButtonStyle.Success, 4: ButtonStyle.Danger, 5: ButtonStyle.Link, primary: ButtonStyle.Primary, secondary: ButtonStyle.Secondary, success: ButtonStyle.Success, danger: ButtonStyle.Danger, link: ButtonStyle.Link };
  return map[s] || ButtonStyle.Primary;
}

function applyButton(node) {
  const label = node.label != null ? String(node.label) : '';
  const b = new ButtonBuilder().setStyle(styleToEnum(node.style));
  if (label || !node.emoji) b.setLabel(String(label || 'Button').slice(0, 80));
  if (b.data.style === ButtonStyle.Link || node.style === 5 || node.style === 'link') {
    b.setStyle(ButtonStyle.Link).setURL(node.url || 'https://discord.com');
  } else {
    b.setCustomId(safeCustomId(node, 'btn'));
  }
  if (node.emoji) b.setEmoji(node.emoji);
  if (node.disabled) b.setDisabled(true);
  return b;
}

function applySelect(node) {
  const cid = safeCustomId(node, 'sel');
  let s;
  switch (node.type) {
    case 'user_select': s = new UserSelectMenuBuilder(); break;
    case 'role_select': s = new RoleSelectMenuBuilder(); break;
    case 'channel_select': s = new ChannelSelectMenuBuilder(); break;
    case 'mentionable_select': s = new MentionableSelectMenuBuilder(); break;
    case 'string_select':
    default:
      s = new StringSelectMenuBuilder();
      const opts = (node.options || []).filter(o => o && o.label && o.value).slice(0, 25).map(o => ({
        label: String(o.label).slice(0, 100),
        value: String(o.value).slice(0, 100),
        description: o.description ? String(o.description).slice(0, 100) : undefined,
        default: !!o.default
      }));
      if (opts.length) s.addOptions(opts);
      break;
  }
  s.setCustomId(cid);
  if (node.placeholder) s.setPlaceholder(String(node.placeholder).slice(0, 150));
  if (node.min_values != null) s.setMinValues(Number(node.min_values));
  if (node.max_values != null) s.setMaxValues(Number(node.max_values));
  if (node.disabled) s.setDisabled(true);
  return s;
}

function applyActionRow(node) {
  const row = new ActionRowBuilder();
  for (const child of (node.components || [])) {
    if (!child) continue;
    if (child.type === 'button') row.addComponents(applyButton(child));
    else if (child.type && child.type.endsWith('_select')) row.addComponents(applySelect(child));
  }
  return row;
}

function applySection(node) {
  const section = new SectionBuilder();
  for (const child of (node.components || [])) {
    if (child && child.type === 'text_display') section.addTextDisplayComponents(applyTextDisplay(child));
  }
  const acc = node.accessory;
  if (acc) {
    if (acc.type === 'thumbnail' && acc.url) section.setThumbnailAccessory(applyThumbnail(acc));
    else if (acc.type === 'button') section.setButtonAccessory(applyButton(acc));
  }
  return section;
}

function applyContainer(node) {
  const c = new ContainerBuilder();
  if (node.accent_color != null) {
    const col = typeof node.accent_color === 'number' ? node.accent_color : parseInt(String(node.accent_color).replace('#', ''), 16);
    if (!Number.isNaN(col)) c.setAccentColor(col);
  }
  if (typeof node.spoiler === 'boolean') c.setSpoiler(node.spoiler);
  for (const child of (node.components || [])) {
    if (!child) continue;
    switch (child.type) {
      case 'action_row': c.addActionRowComponents(applyActionRow(child)); break;
      case 'section': c.addSectionComponents(applySection(child)); break;
      case 'text_display': c.addTextDisplayComponents(applyTextDisplay(child)); break;
      case 'separator': c.addSeparatorComponents(applySeparator(child)); break;
      case 'media_gallery': c.addMediaGalleryComponents(applyMediaGallery(child)); break;
      case 'file': c.addFileComponents(applyFile(child)); break;
      default: break;
    }
  }
  return c;
}

function buildComponentsV2Payload(state) {
  const containers = (state.root || []).filter(n => n && n.type === 'container').map(applyContainer);
  return {
    components: containers
  };
}

export { buildComponentsV2Payload, safeCustomId };

export default { buildComponentsV2Payload, safeCustomId };
