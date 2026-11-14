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

function tr(t, key, vars, fallback) { return t ? t(key, vars, fallback) : (fallback != null ? fallback : key); }

function getContainers(session) {
  return (session.state?.root || []).filter(n => n && n.type === 'container');
}

function getSelectedContainer(session) {
  const containers = getContainers(session);
  if (!containers.length) return null;
  const found = containers.find(c => c._id === session.selectedNodeId);
  return found || null;
}

const CHILD_TYPE_KEYS = {
  text_display: 'text_display',
  button: 'button',
  separator: 'separator',
  action_row: 'action_row',
  section: 'section',
  thumbnail: 'thumbnail',
  media_gallery: 'media_gallery',
  file: 'file',
  string_select: 'string_select',
  user_select: 'user_select',
  role_select: 'role_select',
  channel_select: 'channel_select',
  mentionable_select: 'mentionable_select'
};

function childTypeLabel(node, index, t) {
  if (!node) return tr(t, 'events.builder.container_editor.item_fallback', { index: index + 1 }, `Item ${index + 1}`);
  const key = CHILD_TYPE_KEYS[node.type];
  const type = key
    ? tr(t, `events.builder.container_editor.types.${key}`, {}, String(node.type || 'Item').replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase()))
    : String(node.type || 'Item').replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
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

function buildContainerPreviewComponent(container, t) {
  try {
    const payload = buildComponentsV2Payload({ type: 'components_v2', content: '', root: [container] });
    if (payload.components && payload.components[0]) return payload.components[0];
  } catch (e) {
    // fall through
  }
  return new TextDisplayBuilder().setContent(tr(t, 'events.builder.container_editor.preview_error', {}, 'Unable to render container preview.'));
}

function buildContainerEditor(session, t) {
  const container = getSelectedContainer(session);
  if (!container) {
    return {
      content: null,
      embeds: [],
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      components: [
        new TextDisplayBuilder().setContent(tr(t, 'events.builder.container_editor.not_found', {}, '## Editing Container\nThe selected container could not be found.')),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`bld:${session.id}:nav:ce_back`).setLabel(tr(t, 'events.builder.container_editor.back', {}, 'Back')).setStyle(ButtonStyle.Secondary)
        )
      ]
    };
  }

  const children = Array.isArray(container.components) ? container.components : [];
  const editOptions = children.length
    ? children.slice(0, 25).map((child, i) => ({
        label: childTypeLabel(child, i, t),
        value: child._id,
        description: childDescription(child) || undefined
      }))
    : [{ label: tr(t, 'events.builder.container_editor.no_items', {}, 'No items available'), value: 'none', description: tr(t, 'events.builder.container_editor.no_items_desc', {}, 'Add an item to edit it') }];

  const addOptions = allowedChildTypes('container').map(type => {
    const typeLabel = tr(t, `events.builder.container_editor.types.${type}`, {}, type.replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase()));
    return {
      label: typeLabel,
      value: type,
      description: tr(t, 'events.builder.container_editor.add_item_desc', { type: typeLabel.toLowerCase() }, `Add a ${type.replace(/_/g, ' ')} to this container`).slice(0, 100)
    };
  });

  const canDelete = getContainers(session).length > 1;

  const components = [
    new TextDisplayBuilder().setContent(tr(t, 'events.builder.container_editor.title', {}, '## Editing Container')),
    buildContainerPreviewComponent(container, t),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`bld:${session.id}:nav:ce_add_item`)
        .setPlaceholder(tr(t, 'events.builder.container_editor.add_item_placeholder', {}, 'Add Item'))
        .addOptions(addOptions.slice(0, 25))
    ),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`bld:${session.id}:nav:ce_edit_item`)
        .setPlaceholder(tr(t, 'events.builder.container_editor.edit_item_placeholder', {}, 'Edit Item'))
        .setDisabled(children.length === 0)
        .addOptions(editOptions)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`bld:${session.id}:nav:ce_color`).setLabel(tr(t, 'events.builder.container_editor.select_color', {}, 'Select Color')).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`bld:${session.id}:nav:ce_delete`).setLabel(tr(t, 'events.builder.container_editor.delete_container', {}, 'Delete Container')).setStyle(ButtonStyle.Danger).setDisabled(!canDelete),
      new ButtonBuilder().setCustomId(`bld:${session.id}:nav:ce_back`).setLabel(tr(t, 'events.builder.container_editor.back', {}, 'Back')).setStyle(ButtonStyle.Secondary)
    )
  ];

  return {
    content: null,
    embeds: [],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    components
  };
}

function buildContainerColorScreen(session, t) {
  const container = getSelectedContainer(session);
  if (!container) {
    return {
      content: null,
      embeds: [],
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      components: [
        new TextDisplayBuilder().setContent(tr(t, 'events.builder.container_editor.color_not_found', {}, '## Select Color\nThe selected container could not be found.')),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`bld:${session.id}:nav:ce_color_back`).setLabel(tr(t, 'events.builder.container_editor.back', {}, 'Back')).setStyle(ButtonStyle.Secondary)
        )
      ]
    };
  }

  const { listColors } = require('../services/colors.service');
  const saved = listColors(session.guildId, session.userId);
  const options = [
    { label: tr(t, 'events.builder.container_editor.color_new', {}, 'New color'), value: 'new', description: tr(t, 'events.builder.container_editor.color_new_desc', {}, 'Save a color with name and HEX code') },
    { label: tr(t, 'events.builder.container_editor.color_none', {}, 'No color'), value: 'none', description: tr(t, 'events.builder.container_editor.color_none_desc', {}, 'Container without accent color') },
    { label: tr(t, 'events.builder.container_editor.color_discord_blue', {}, 'Discord Blue'), value: 'discord_blue', description: '#5865F2' }
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
    new TextDisplayBuilder().setContent(tr(t, 'events.builder.container_editor.color_title', {}, '## Select Color')),
    buildContainerPreviewComponent(container, t),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`bld:${session.id}:nav:ce_color_select`)
        .setPlaceholder(tr(t, 'events.builder.container_editor.color_placeholder', {}, 'Select a color'))
        .addOptions(options)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`bld:${session.id}:nav:ce_color_back`).setLabel(tr(t, 'events.builder.container_editor.back', {}, 'Back')).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setLabel(tr(t, 'events.builder.container_editor.html_color_codes', {}, 'HTML Color Codes')).setStyle(ButtonStyle.Link).setURL('https://htmlcolorcodes.com/')
    )
  ];

  return {
    content: null,
    embeds: [],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    components
  };
}

function buildContainerDeleteConfirm(session, t) {
  const container = getSelectedContainer(session);
  const name = tr(t, 'events.builder.container_editor.this_container', {}, 'this container');
  return {
    content: null,
    embeds: [],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    components: [
      new TextDisplayBuilder().setContent(tr(t, 'events.builder.container_editor.delete_title', { name }, `## Delete Container\nAre you sure you want to delete ${name}? This cannot be undone.`)),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`bld:${session.id}:nav:ce_delete_confirm`).setLabel(tr(t, 'events.builder.container_editor.confirm_delete', {}, 'Confirm Delete')).setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`bld:${session.id}:nav:ce_delete_cancel`).setLabel(tr(t, 'events.builder.container_editor.cancel', {}, 'Cancel')).setStyle(ButtonStyle.Secondary)
      )
    ]
  };
}

function buildContainerEditorClosed(t) {
  return {
    content: null,
    embeds: [],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    components: [new TextDisplayBuilder().setContent(tr(t, 'events.builder.container_editor.closed', {}, 'Container editor closed. Use the main Builder panel to continue.'))]
  };
}

module.exports = { buildContainerEditor, buildContainerDeleteConfirm, buildContainerEditorClosed, buildContainerColorScreen, getSelectedContainer, getContainers };
