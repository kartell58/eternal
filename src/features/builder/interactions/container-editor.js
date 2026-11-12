const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  MessageFlags
} = require('discord.js');
const { buildComponentsV2Payload } = require('../builders/components-v2.builder');
const { allowedChildTypes } = require('../utils/component-tree');

function getContainers(session) {
  return (session.state?.root || []).filter(n => n && n.type === 'container');
}

function getSelectedContainer(session) {
  const containers = getContainers(session);
  if (!containers.length) return null;
  const found = containers.find(c => c._id === session.selectedNodeId);
  return found || null;
}

const CHILD_TYPE_LABELS = {
  text_display: 'Text',
  button: 'Button',
  separator: 'Separator',
  action_row: 'Action Row',
  section: 'Section',
  thumbnail: 'Thumbnail',
  media_gallery: 'Media Gallery',
  file: 'File',
  string_select: 'String Select',
  user_select: 'User Select',
  role_select: 'Role Select',
  channel_select: 'Channel Select',
  mentionable_select: 'Mentionable Select'
};

function childTypeLabel(node, index) {
  if (!node) return `Item ${index + 1}`;
  const type = CHILD_TYPE_LABELS[node.type] || String(node.type || 'Item').replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
  return `${type} ${index + 1}`;
}

function childDescription(node) {
  if (!node) return '';
  if (node.type === 'text_display') {
    const text = String(node.content || '').replace(/\s+/g, ' ').trim();
    return text.length > 30 ? `${text.slice(0, 30)}...` : text;
  }
  if (node.type === 'button') return String(node.label || node.custom_id || '').slice(0, 100).trim();
  if (node.type && node.type.endsWith('_select')) return String(node.placeholder || '').slice(0, 100).trim();
  if (node.type === 'section') return `${(node.components || []).length} text(s)`;
  if (node.type === 'action_row') return `${(node.components || []).length} component(s)`;
  if (node.type === 'media_gallery') return `${(node.items || []).length} item(s)`;
  if (node.type === 'thumbnail') return String(node.description || node.url || '').slice(0, 100).trim();
  if (node.type === 'file') return String(node.file || '').slice(0, 100).trim();
  return '';
}

function buildContainerPreviewComponent(container) {
  try {
    const payload = buildComponentsV2Payload({ type: 'components_v2', content: '', root: [container] });
    if (payload.components && payload.components[0]) return payload.components[0];
  } catch (e) {
    // fall through
  }
  return new TextDisplayBuilder().setContent('Unable to render container preview.');
}

function buildContainerEditor(session) {
  const container = getSelectedContainer(session);
  if (!container) {
    return {
      content: null,
      embeds: [],
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      components: [
        new TextDisplayBuilder().setContent('## Editing Container\nThe selected container could not be found.'),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`bld:${session.id}:nav:ce_back`).setLabel('Back').setStyle(ButtonStyle.Secondary)
        )
      ]
    };
  }

  const children = Array.isArray(container.components) ? container.components : [];
  const editOptions = children.length
    ? children.slice(0, 25).map((child, i) => ({
        label: childTypeLabel(child, i),
        value: child._id,
        description: childDescription(child) || undefined
      }))
    : [{ label: 'No items available', value: 'none', description: 'Add an item to edit it' }];

  const addOptions = allowedChildTypes('container').map(type => ({
    label: type.replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase()),
    value: type,
    description: `Add a ${type.replace(/_/g, ' ')} to this container`.slice(0, 100)
  }));

  const canDelete = getContainers(session).length > 1;

  const components = [
    new TextDisplayBuilder().setContent('## Editing Container'),
    buildContainerPreviewComponent(container),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`bld:${session.id}:nav:ce_add_item`)
        .setPlaceholder('Add Item')
        .addOptions(addOptions.slice(0, 25))
    ),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`bld:${session.id}:nav:ce_edit_item`)
        .setPlaceholder('Edit Item')
        .setDisabled(children.length === 0)
        .addOptions(editOptions)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`bld:${session.id}:nav:ce_color`).setLabel('Select Color').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`bld:${session.id}:nav:ce_delete`).setLabel('Delete Container').setStyle(ButtonStyle.Danger).setDisabled(!canDelete),
      new ButtonBuilder().setCustomId(`bld:${session.id}:nav:ce_back`).setLabel('Back').setStyle(ButtonStyle.Secondary)
    )
  ];

  return {
    content: null,
    embeds: [],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    components
  };
}

function buildContainerColorScreen(session) {
  const container = getSelectedContainer(session);
  if (!container) {
    return {
      content: null,
      embeds: [],
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      components: [
        new TextDisplayBuilder().setContent('## Select Color\nThe selected container could not be found.'),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`bld:${session.id}:nav:ce_color_back`).setLabel('Back').setStyle(ButtonStyle.Secondary)
        )
      ]
    };
  }

  const { listColors } = require('../services/colors.service');
  const saved = listColors(session.guildId, session.userId);
  const options = [
    { label: 'Nova cor', value: 'new', description: 'Salve uma cor com nome e codigo HEX' },
    { label: 'Sem cor', value: 'none', description: 'Container sem accent color' },
    { label: 'Azul Discord', value: 'discord_blue', description: '#5865F2' }
  ];
  for (const c of saved) {
    if (options.length >= 25) break;
    options.push({
      label: String(c.name).slice(0, 100),
      value: `saved:${c.id}`,
      description: c.hex.slice(0, 100)
    });
  }

  const components = [
    new TextDisplayBuilder().setContent('## Select Color'),
    buildContainerPreviewComponent(container),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`bld:${session.id}:nav:ce_color_select`)
        .setPlaceholder('Selecionar uma cor')
        .addOptions(options)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`bld:${session.id}:nav:ce_color_back`).setLabel('Back').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setLabel('HTML Color Codes').setStyle(ButtonStyle.Link).setURL('https://htmlcolorcodes.com/')
    )
  ];

  return {
    content: null,
    embeds: [],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    components
  };
}

function buildContainerDeleteConfirm(session) {
  const container = getSelectedContainer(session);
  const name = container ? `this container` : 'this container';
  return {
    content: null,
    embeds: [],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    components: [
      new TextDisplayBuilder().setContent(`## Delete Container\nAre you sure you want to delete ${name}? This cannot be undone.`),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`bld:${session.id}:nav:ce_delete_confirm`).setLabel('Confirm Delete').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`bld:${session.id}:nav:ce_delete_cancel`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
      )
    ]
  };
}

function buildContainerEditorClosed() {
  return {
    content: null,
    embeds: [],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    components: [new TextDisplayBuilder().setContent('Container editor closed. Use the main Builder panel to continue.')]
  };
}

module.exports = { buildContainerEditor, buildContainerDeleteConfirm, buildContainerEditorClosed, buildContainerColorScreen, getSelectedContainer, getContainers };
