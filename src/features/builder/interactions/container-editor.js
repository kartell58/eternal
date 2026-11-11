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

function childLabel(node, index) {
  if (!node) return `Item ${index + 1}`;
  const type = String(node.type || 'item').replace(/_/g, ' ');
  let detail = '';
  if (node.type === 'text_display' && node.content) detail = String(node.content).slice(0, 30).replace(/\s+/g, ' ').trim();
  else if (node.type === 'button' && node.label) detail = String(node.label).slice(0, 30);
  else if (node.type && node.type.endsWith('_select') && node.placeholder) detail = String(node.placeholder).slice(0, 30);
  else if (node.type === 'section') detail = `${(node.components || []).length} text(s)`;
  else if (node.type === 'action_row') detail = `${(node.components || []).length} component(s)`;
  const label = detail ? `${type}: ${detail}` : type;
  return label.slice(0, 100) || `Item ${index + 1}`;
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
        label: childLabel(child, i),
        value: child._id,
        description: String(child.type || 'item').replace(/_/g, ' ').slice(0, 100)
      }))
    : [{ label: 'No items available', value: 'none', description: 'Add an item to edit it' }];

  const addOptions = allowedChildTypes('container').map(type => ({
    label: type.replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase()),
    value: type,
    description: `Add a ${type.replace(/_/g, ' ')} to this container`.slice(0, 100)
  }));

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
      new ButtonBuilder().setCustomId(`bld:${session.id}:nav:ce_delete`).setLabel('Delete Container').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`bld:${session.id}:nav:ce_back`).setLabel('Back').setStyle(ButtonStyle.Secondary)
    )
  ];

  return {
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    components
  };
}

function buildContainerDeleteConfirm(session) {
  const container = getSelectedContainer(session);
  const name = container ? `this container` : 'this container';
  return {
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
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    components: [new TextDisplayBuilder().setContent('Container editor closed. Use the main Builder panel to continue.')]
  };
}

module.exports = { buildContainerEditor, buildContainerDeleteConfirm, buildContainerEditorClosed, getSelectedContainer, getContainers };
