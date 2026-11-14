const { ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { requireSession, pushHistory, saveSession } = require('../services/session.service');
const { findParentInfo, removeNode, duplicateNode, moveNode, allowedChildTypes } = require('../utils/component-tree');
const { COMPONENT_FACTORIES, createContainer } = require('../schemas/components-v2.schema');
const { buildCv2Editor } = require('./navigation');
const { sessionTranslator } = require('../utils/i18n');

function getT(session, interaction) {
  const lang = interaction && interaction.client ? interaction.client.language : null;
  const { t } = sessionTranslator(session, lang);
  return t;
}

async function handleComponents(interaction, { sid }) {
  const { session, error } = requireSession(sid, interaction.user.id, interaction.guildId, { interaction });
  if (error) return interaction.reply({ content: error, flags: 64 });
  const t = getT(session, interaction);
  if (session.state.type !== 'components_v2') return interaction.reply({ content: t('events.builder.components.not_cv2', {}, 'Not in Components V2 mode.'), flags: 64 });

  const action = interaction.customId.split(':')[3];
  const root = session.state.root;

  if (interaction.isStringSelectMenu() && action === 'add_type') {
    const type = interaction.values[0];
    const targetId = interaction.customId.split(':')[4] || 'root';
    const factory = COMPONENT_FACTORIES[type];
    if (!factory) return interaction.reply({ content: t('events.builder.components.unknown_type', {}, 'Unknown component type.'), flags: 64 });
    pushHistory(session);
    const newNode = factory();
    if (targetId === 'root') {
      if (type !== 'container') return interaction.reply({ content: t('events.builder.components.only_containers_top', {}, 'Only containers can be added at the top level.'), flags: 64 });
      root.push(newNode);
    } else {
      const info = findParentInfo(root, targetId);
      if (!info) return interaction.reply({ content: t('events.builder.components.target_not_found', {}, 'Target node not found. Select a node and try again.'), flags: 64 });
      const parentNode = info.node;
      const pType = parentNode.type === 'action_row' ? 'action_row' : parentNode.type === 'section' ? 'section' : parentNode.type === 'container' ? 'container' : null;
      const allowed = allowedChildTypes(pType);
      if (!allowed.includes(type)) return interaction.reply({ content: t('events.builder.components.cannot_add_inside', { type, parent: parentNode.type, allowed: allowed.join(', ') || t('events.builder.components.none', {}, 'none') }, `Cannot add ${type} inside ${parentNode.type}. Allowed: ${allowed.join(', ') || 'none'}.`), flags: 64 });
      if (parentNode.type === 'action_row') {
        const hasSelect = parentNode.components.some(c => c.type.endsWith('_select'));
        if (hasSelect) return interaction.reply({ content: t('events.builder.components.action_row_has_select', {}, 'This action row already has a select menu.'), flags: 64 });
        if (type.endsWith('_select') && parentNode.components.length > 0) return interaction.reply({ content: t('events.builder.components.select_must_be_alone', {}, 'A select menu must be alone in its action row.'), flags: 64 });
        if (type === 'button' && parentNode.components.length >= 5) return interaction.reply({ content: t('events.builder.components.max_buttons', {}, 'Max 5 buttons per action row.'), flags: 64 });
      }
      if (parentNode.type === 'section' && parentNode.components.length >= 3) return interaction.reply({ content: t('events.builder.components.max_section_texts', {}, 'A section can have at most 3 text displays.'), flags: 64 });
      parentNode.components.push(newNode);
    }
    session.selectedNodeId = newNode._id;
    saveSession(session);
    return interaction.update(buildCv2Editor(session, t));
  }

  if (!interaction.isButton()) return;

  if (action === 'add_root') {
    pushHistory(session);
    const c = createContainer();
    root.push(c);
    session.selectedNodeId = c._id;
    saveSession(session);
    return interaction.update(buildCv2Editor(session, t));
  }

  if (action === 'add') {
    const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
    const targetId = session.selectedNodeId;
    if (!targetId) {
      const info = new ContainerBuilder().setAccentColor(0x5865f2).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(t('events.builder.components.add_component_title', {}, '## Add Component')),
        new TextDisplayBuilder().setContent(t('events.builder.components.add_component_desc', {}, 'No node selected. Add a top-level container, or go back and select a container, section, or action row to add a child inside it.'))
      );
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId(`bld:${sid}:cmp:add_type:root`).setPlaceholder(t('events.builder.components.add_top_level_placeholder', {}, 'Add top-level component')).addOptions([{ label: t('events.builder.components.container_label', {}, 'Container'), value: 'container', description: t('events.builder.components.container_desc', {}, 'Top-level Components V2 container') }])
      );
      const back = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`bld:${sid}:nav:back_editor`).setLabel(t('events.builder.components.back', {}, 'Back')).setStyle(ButtonStyle.Secondary));
      return interaction.update({ content: null, embeds: [], components: [info, row, back], flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
    }
    const infoNode = findParentInfo(root, targetId);
    if (!infoNode) return interaction.reply({ content: t('events.builder.components.selected_not_found', {}, 'Selected node not found.'), flags: 64 });
    const parentNode = infoNode.node;
    const pType = parentNode.type === 'action_row' ? 'action_row' : parentNode.type === 'section' ? 'section' : parentNode.type === 'container' ? 'container' : null;
    let allowed = allowedChildTypes(pType);
    if (!allowed.length) {
      return interaction.reply({ content: t('events.builder.components.cannot_add_children', { type: parentNode.type }, `Cannot add children to **${parentNode.type}**. Select a container, section, or action row instead.`), flags: 64 });
    }
    const options = allowed.map(x => ({ label: x.replace(/_/g, ' '), value: x })).slice(0, 25);
    const info = new ContainerBuilder().setAccentColor(0x5865f2).addTextDisplayComponents(
      new TextDisplayBuilder().setContent(t('events.builder.components.add_child_title', {}, '## Add Child Component')),
      new TextDisplayBuilder().setContent(t('events.builder.components.add_child_desc', { type: parentNode.type }, `Adding inside **${parentNode.type}**. Choose a component type:`)),
      new TextDisplayBuilder().setContent(t('events.builder.components.allowed_types', { types: allowed.join(', ') }, `**Allowed types:** ${allowed.join(', ')}`).slice(0, 4000))
    );
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(`bld:${sid}:cmp:add_type:${targetId}`).setPlaceholder(t('events.builder.components.choose_type', {}, 'Choose component type')).addOptions(options)
    );
    const back = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`bld:${sid}:nav:back_editor`).setLabel(t('events.builder.components.back', {}, 'Back')).setStyle(ButtonStyle.Secondary));
    return interaction.update({ content: null, embeds: [], components: [info, row, back], flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
  }

  if (action === 'remove') {
    if (!session.selectedNodeId) return interaction.reply({ content: t('events.builder.components.no_node_selected', {}, 'No node selected.'), flags: 64 });
    pushHistory(session);
    const ok = removeNode(root, session.selectedNodeId);
    if (!ok) return interaction.reply({ content: t('events.builder.components.cannot_remove', {}, 'Could not remove this node. Accessories are replaced via Edit (or by editing the parent section).'), flags: 64 });
    session.selectedNodeId = null;
    saveSession(session);
    return interaction.update(buildCv2Editor(session, t));
  }
  if (action === 'dup') {
    if (!session.selectedNodeId) return interaction.reply({ content: t('events.builder.components.no_node_selected', {}, 'No node selected.'), flags: 64 });
    pushHistory(session);
    const clone = duplicateNode(root, session.selectedNodeId);
    if (!clone) return interaction.reply({ content: t('events.builder.components.cannot_duplicate', {}, 'Could not duplicate this node (accessories cannot be duplicated directly).'), flags: 64 });
    session.selectedNodeId = clone._id;
    saveSession(session);
    return interaction.update(buildCv2Editor(session, t));
  }
  if (action === 'up' || action === 'down') {
    if (!session.selectedNodeId) return interaction.reply({ content: t('events.builder.components.no_node_selected', {}, 'No node selected.'), flags: 64 });
    pushHistory(session);
    const ok = moveNode(root, session.selectedNodeId, action === 'up' ? -1 : 1);
    if (!ok) return interaction.reply({ content: t('events.builder.components.cannot_move', {}, 'Cannot move further in that direction.'), flags: 64 });
    saveSession(session);
    return interaction.update(buildCv2Editor(session, t));
  }

  return interaction.reply({ content: t('events.builder.components.unhandled', {}, 'Unhandled component action.'), flags: 64 });
}

module.exports = { handleComponents };
