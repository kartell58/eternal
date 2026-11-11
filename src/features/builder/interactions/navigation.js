const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  LabelBuilder,
  FileUploadBuilder
} = require('discord.js');
const { requireSession, saveSession, pushHistory, popHistory } = require('../services/session.service');
const { createDefaultEmbedState } = require('../schemas/embed.schema');
const { createDefaultComponentsV2State, createContainer, COMPONENT_FACTORIES } = require('../schemas/components-v2.schema');
const draftService = require('../services/draft.service');
const templateService = require('../services/template.service');
const { buildEmbedPayload } = require('../builders/embed.builder');
const { buildComponentsV2Payload } = require('../builders/components-v2.builder');
const { toPublishPayload, publishNew, editExisting, canSendToChannel } = require('../services/publisher.service');
const { validateEmbedState, validateComponentsV2State, parseColor } = require('../utils/validator');
const { allowedChildTypes } = require('../utils/component-tree');
const { buildContainerEditor, buildContainerDeleteConfirm, getSelectedContainer } = require('./container-editor');

function sid(session) { return session.id; }

function typeLabel(session) {
  return session.state?.type === 'components_v2' ? 'Components V2' : 'Embed';
}

function editorContext(session) {
  const target = session.editingMessage ? `editing ${session.editingMessage.channelId}/${session.editingMessage.messageId}` : 'new message';
  return `${typeLabel(session)} • ${target}`;
}

function getContainers(session) {
  return (session.state?.root || []).filter(n => n && n.type === 'container');
}

function buildMainPanel(session) {
  const containers = getContainers(session);

  const info = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Container Information')
    .setDescription(
      'Manage the containers in your current Builder message. Select a container to edit, add new ones, import JSON, load templates, or publish.'
    )
    .addFields(
      { name: 'Containers', value: containers.length ? `${containers.length} available` : 'None yet', inline: true },
      { name: 'Session Owner', value: `<@${session.userId}>`, inline: true },
      { name: 'Draft', value: session.draftId ? session.draftId : 'Not saved', inline: true }
    )
    .setFooter({ text: 'Only the session owner can use this panel.' });

  const options = containers.length
    ? containers.slice(0, 25).map((c, i) => {
        const textChild = (c.components || []).find(x => x && x.type === 'text_display' && x.content);
        const hint = textChild ? String(textChild.content).slice(0, 40) : `ID ${c._id}`;
        return {
          label: `Container ${i + 1}`.slice(0, 100),
          value: c._id,
          description: hint.slice(0, 100)
        };
      })
    : [{ label: 'No containers available', value: 'none', description: 'Add a container to get started' }];

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`bld:${sid(session)}:nav:container_select`)
      .setPlaceholder('Select a container to edit')
      .setDisabled(!containers.length)
      .addOptions(options)
  );

  const actionsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:add_container_main`).setLabel('Add Container').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:open_templates`).setLabel('Templates').setStyle(ButtonStyle.Secondary),
  );

  const jsonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:json_editor`).setLabel('JSON Editor').setStyle(ButtonStyle.Secondary),
  );

  const publishRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:send_custom`).setLabel('Custom Send').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:quick_send`).setLabel('Quick Send').setStyle(ButtonStyle.Success),
  );

  return {
    content: '**Container Creation Panel**',
    embeds: [info],
    components: [selectRow, actionsRow, jsonRow, publishRow],
    flags: 64
  };
}

// Backwards-compatible alias for existing callers
function buildHome(session) {
  return buildMainPanel(session);
}

function summarizeEmbed(state) {
  const e = state.embed || {};
  const lines = [];
  lines.push(`Title: ${e.title ? String(e.title).slice(0, 60) : '—'}`);
  lines.push(`Description: ${e.description ? String(e.description).slice(0, 80) : '—'}`);
  lines.push(`Fields: ${(e.fields || []).length}/25`);
  if (state.content) lines.push(`Content: ${String(state.content).slice(0, 60)}`);
  return lines.join('\n').slice(0, 1024);
}

function sectionLabel(key) {
  const map = {
    basic: 'Title & description',
    author: 'Author',
    footer: 'Footer & timestamp',
    images: 'Images',
    fields: 'Fields',
    content: 'Message content'
  };
  return map[key] || key;
}

function buildEmbedEditor(session) {
  const section = session.embedSection || 'basic';
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Embed Editor')
    .setDescription(`**Editing:** ${editorContext(session)}\n**Section:** ${sectionLabel(section)}`)
    .addFields({ name: 'Summary', value: summarizeEmbed(session.state), inline: false })
    .setFooter({ text: 'Select a section, edit it, then preview or publish.' });

  const nav = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`bld:${sid(session)}:nav:embed_section`)
      .setPlaceholder('Choose section')
      .addOptions([
        { label: 'Title & description', value: 'basic', description: 'Title, URL, description, color', default: section === 'basic' },
        { label: 'Message content', value: 'content', description: 'Text above the embed', default: section === 'content' },
        { label: 'Author', value: 'author', description: 'Author name, URL, icon', default: section === 'author' },
        { label: 'Images', value: 'images', description: 'Thumbnail and main image', default: section === 'images' },
        { label: 'Footer & timestamp', value: 'footer', description: 'Footer text, icon, timestamp', default: section === 'footer' },
        { label: 'Fields', value: 'fields', description: 'Add, edit, reorder fields', default: section === 'fields' },
      ])
  );

  const isFields = section === 'fields';
  const editRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:prop:embed_edit`).setLabel('Edit Section').setStyle(ButtonStyle.Primary).setDisabled(isFields),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:prop:embed_add_field`).setLabel('Add Field').setStyle(ButtonStyle.Secondary).setDisabled(!isFields),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:embed_field_tools`).setLabel('Field Tools').setStyle(ButtonStyle.Secondary).setDisabled(!isFields),
  );

  const actions = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:preview`).setLabel('Preview').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:save_menu`).setLabel('Save').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:publish_menu`).setLabel('Publish').setStyle(ButtonStyle.Primary),
  );
  const back = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:home`).setLabel('Home').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:undo`).setLabel('Undo').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [nav, editRow, actions, back], flags: 64 };
}

function listNodes(nodes, depth = 0, out = []) {
  for (const n of (nodes || [])) {
    const indent = '  '.repeat(Math.min(depth, 3));
    let label = `${indent}${n.type} [${n._id}]`;
    if (n.label) label += ` "${String(n.label).slice(0, 18)}"`;
    else if (n.content) label += `: ${String(n.content).slice(0, 18)}`;
    else if (n.type && n.type.endsWith('_select')) label += ` (${n.placeholder || 'select'})`;
    out.push({ label: label.slice(0, 100), value: n._id, description: n.type.slice(0, 50) });
    if (n.components) listNodes(n.components, depth + 1, out);
  }
  return out;
}

function buildCv2Editor(session) {
  const options = listNodes(session.state.root).slice(0, 25);
  if (options.length === 0) options.push({ label: 'No components yet', value: 'none' });
  const selected = session.selectedNodeId || '(none)';
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Components V2 Editor')
    .setDescription(`**Editing:** ${editorContext(session)}\nBuild with containers, sections, text, buttons, selects, media, and more.`)
    .addFields(
      { name: 'Selected node', value: String(selected).slice(0, 1024), inline: true },
      { name: 'Top-level', value: `${(session.state.root || []).length} container(s)`, inline: true }
    )
    .setFooter({ text: 'Select a node to add children, edit, move, duplicate, or remove.' });

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(`bld:${sid(session)}:nav:cv2_select`).setPlaceholder('Select component node').addOptions(options)
  );
  const ops = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:cmp:add`).setLabel('Add Child').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:prop:cv2_edit`).setLabel('Edit').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:cmp:remove`).setLabel('Remove').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:cmp:dup`).setLabel('Duplicate').setStyle(ButtonStyle.Secondary),
  );
  const ops2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:cmp:up`).setLabel('Move Up').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:cmp:down`).setLabel('Move Down').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:cmp:add_root`).setLabel('Add Container').setStyle(ButtonStyle.Secondary),
  );
  const actions = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:preview`).setLabel('Preview').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:save_menu`).setLabel('Save').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:publish_menu`).setLabel('Publish').setStyle(ButtonStyle.Primary),
  );
  const back = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:home`).setLabel('Home').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:undo`).setLabel('Undo').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [selectRow, ops, ops2, actions, back], flags: 64 };
}

function buildSaveMenu(session) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Save')
    .setDescription(`Save your current **${typeLabel(session)}** message as a draft or reusable template.\n\nDrafts and templates are private to you in this server.`);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:save_draft`).setLabel('Save Draft').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:save_template`).setLabel('Save Template').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:back_editor`).setLabel('Back to Editor').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row], flags: 64 };
}

function storageWarning(status) {
  if (status && status.recovered) {
    return `\n\n⚠️ Previous storage was corrupted and backed up${status.backup ? ` (${status.backup})` : ''}.`;
  }
  return '';
}

function buildDraftsList(session) {
  const drafts = draftService.listDrafts(session.userId, session.guildId).slice(0, 25);
  const status = draftService.getLoadStatus ? draftService.getLoadStatus() : null;
  let desc = drafts.length ? 'Select a draft to open, or choose one to delete.' : 'No drafts saved for you in this server.';
  desc += storageWarning(status);
  const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('Saved Drafts').setDescription(desc.slice(0, 4000));
  const components = [];
  if (drafts.length) {
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(`bld:${sid(session)}:nav:load_draft`).setPlaceholder('Open draft').addOptions(
        drafts.map(d => ({ label: d.name.slice(0, 100), value: d.id, description: `${d.state.type} • ${new Date(d.updatedAt).toLocaleString()}`.slice(0, 100) }))
      )
    ));
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(`bld:${sid(session)}:nav:delete_draft`).setPlaceholder('Delete draft').addOptions(
        drafts.map(d => ({ label: `Delete: ${d.name}`.slice(0, 100), value: d.id, description: d.id.slice(0, 100) }))
      )
    ));
  }
  components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:home`).setLabel('Back').setStyle(ButtonStyle.Secondary)));
  return { embeds: [embed], components, flags: 64 };
}

function buildTemplatesList(session) {
  const templates = templateService.listTemplates(session.userId, session.guildId).slice(0, 25);
  const status = templateService.getLoadStatus ? templateService.getLoadStatus() : null;
  let desc = templates.length ? 'Open, duplicate, or delete your templates.' : 'No templates saved for you in this server.';
  desc += storageWarning(status);
  const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('Saved Templates').setDescription(desc.slice(0, 4000));
  const components = [];
  if (templates.length) {
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(`bld:${sid(session)}:nav:load_template`).setPlaceholder('Open template').addOptions(
        templates.map(t => ({ label: t.name.slice(0, 100), value: t.id, description: `${t.state.type}`.slice(0, 100) }))
      )
    ));
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(`bld:${sid(session)}:nav:dup_template`).setPlaceholder('Duplicate template').addOptions(
        templates.map(t => ({ label: `Duplicate: ${t.name}`.slice(0, 100), value: t.id }))
      )
    ));
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(`bld:${sid(session)}:nav:delete_template`).setPlaceholder('Delete template').addOptions(
        templates.map(t => ({ label: `Delete: ${t.name}`.slice(0, 100), value: t.id }))
      )
    ));
  }
  components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:home`).setLabel('Back').setStyle(ButtonStyle.Secondary)));
  return { embeds: [embed], components, flags: 64 };
}

function buildEditExisting(session) {
  const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('Edit Existing Message')
    .setDescription(
      'Load a message sent by this bot to edit and republish it.\n\n' +
      '- Only bot-authored messages can be edited.\n' +
      '- Embeds can be imported into the editor.\n' +
      '- Existing Components V2 messages cannot be fully reconstructed visually; loading one sets it as the edit target and starts a new Components V2 draft to replace it on publish.\n\n' +
      'Provide the channel and message IDs below.'
    );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:prop:edit_existing`).setLabel('Enter Message Info').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:home`).setLabel('Back').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row], flags: 64 };
}

function currentEditor(session) {
  return session.state.type === 'embed' ? buildEmbedEditor(session) : buildCv2Editor(session);
}

function buildPayloadForSession(session) {
  if (session.state.type === 'embed') return toPublishPayload(buildEmbedPayload(session.state), 'embed');
  return toPublishPayload(buildComponentsV2Payload(session.state), 'components_v2');
}

function openContainerEditorResponse(session) {
  session.view = 'editor';
  session.containerEditorContainerId = session.selectedNodeId;
  saveSession(session);
  return buildContainerEditor(session);
}

async function handleNavigation(interaction, { sid }) {
  const { session, error } = requireSession(sid, interaction.user.id, interaction.guildId);
  if (error) {
    const payload = { content: error, flags: 64 };
    if (interaction.deferred || interaction.replied) return interaction.followUp(payload);
    return interaction.reply(payload);
  }

  const action = interaction.customId.split(':')[3];

  if (interaction.isStringSelectMenu()) {
    if (action === 'container_select') {
      const val = interaction.values[0];
      if (val === 'none') return interaction.deferUpdate();
      const containers = getContainers(session);
      const target = containers.find(c => c._id === val);
      if (!target) return interaction.reply({ content: 'The selected container could not be found.', flags: 64 });
      session.selectedNodeId = target._id;
      session.containerEditorContainerId = target._id;
      return interaction.update(openContainerEditorResponse(session));
    }
    if (action === 'embed_section') {
      session.embedSection = interaction.values[0];
      saveSession(session);
      return interaction.update(buildEmbedEditor(session));
    }
    if (action === 'cv2_select') {
      session.selectedNodeId = interaction.values[0] === 'none' ? null : interaction.values[0];
      saveSession(session);
      return interaction.update(buildCv2Editor(session));
    }
    if (action === 'ce_edit_item') {
      const val = interaction.values[0];
      if (val === 'none') return interaction.reply({ content: 'There are no items to edit in this container.', flags: 64 });
      const container = getSelectedContainer(session);
      if (!container) return interaction.update(buildContainerEditorClosed());
      const item = (container.components || []).find(c => c && c._id === val);
      if (!item) return interaction.reply({ content: 'The selected item could not be found in this container.', flags: 64 });
      session.containerEditorContainerId = container._id;
      session.selectedNodeId = item._id;
      saveSession(session);
      const { showCv2EditModal } = require('./properties');
      try {
        return await showCv2EditModal(interaction, session);
      } catch (e) {
        // restore container selection on failure to open modal
        session.selectedNodeId = container._id;
        saveSession(session);
        if (interaction.deferred || interaction.replied) return interaction.followUp({ content: `Could not open item editor: ${e.message}`, flags: 64 });
        return interaction.reply({ content: `Could not open item editor: ${e.message}`, flags: 64 });
      }
    }
    if (action === 'ce_add_item') {
      const type = interaction.values[0];
      const container = getSelectedContainer(session);
      if (!container) return interaction.reply({ content: 'The selected container could not be found.', flags: 64 });
      const allowed = allowedChildTypes('container');
      if (!allowed.includes(type)) return interaction.reply({ content: `Cannot add ${type.replace(/_/g, ' ')} to a container.`, flags: 64 });
      const factory = COMPONENT_FACTORIES[type];
      if (!factory) return interaction.reply({ content: 'Unknown component type.', flags: 64 });
      pushHistory(session);
      const node = factory();
      container.components = container.components || [];
      container.components.push(node);
      session.selectedNodeId = container._id;
      session.containerEditorContainerId = container._id;
      saveSession(session);
      return interaction.update(buildContainerEditor(session));
    }
    if (action === 'load_draft') {
      try {
        const draft = (draftService.getDraftFor ? draftService.getDraftFor(session.userId, session.guildId, interaction.values[0]) : draftService.getDraft(interaction.values[0]));
        if (!draft || draft.userId !== session.userId || draft.guildId !== session.guildId) return interaction.reply({ content: 'Draft not found or not accessible in this server.', flags: 64 });
        pushHistory(session);
        session.state = JSON.parse(JSON.stringify(draft.state));
        session.type = draft.state.type;
        session.draftId = draft.id;
        session.view = 'editor';
        saveSession(session);
        return interaction.update(currentEditor(session));
      } catch (e) {
        return interaction.reply({ content: `Failed to load draft: ${e.message}`, flags: 64 });
      }
    }
    if (action === 'delete_draft') {
      try { draftService.deleteDraft(session.userId, session.guildId, interaction.values[0]); }
      catch (e) { return interaction.reply({ content: `Failed to delete draft: ${e.message}`, flags: 64 }); }
      return interaction.update(buildDraftsList(session));
    }
    if (action === 'load_template') {
      try {
        const tpl = (templateService.getTemplateFor ? templateService.getTemplateFor(session.userId, session.guildId, interaction.values[0]) : templateService.getTemplate(interaction.values[0]));
        if (!tpl || tpl.userId !== session.userId || tpl.guildId !== session.guildId) return interaction.reply({ content: 'Template not found or not accessible in this server.', flags: 64 });
        pushHistory(session);
        session.state = JSON.parse(JSON.stringify(tpl.state));
        session.type = tpl.state.type;
        session.templateId = tpl.id;
        session.view = 'editor';
        saveSession(session);
        return interaction.update(currentEditor(session));
      } catch (e) {
        return interaction.reply({ content: `Failed to load template: ${e.message}`, flags: 64 });
      }
    }
    if (action === 'dup_template') {
      try { templateService.duplicateTemplate(session.userId, session.guildId, interaction.values[0]); }
      catch (e) { return interaction.reply({ content: `Failed to duplicate template: ${e.message}`, flags: 64 }); }
      return interaction.update(buildTemplatesList(session));
    }
    if (action === 'delete_template') {
      try { templateService.deleteTemplate(session.userId, session.guildId, interaction.values[0]); }
      catch (e) { return interaction.reply({ content: `Failed to delete template: ${e.message}`, flags: 64 }); }
      return interaction.update(buildTemplatesList(session));
    }
  }

  if (!interaction.isButton()) return;

  switch (action) {
    case 'home':
      session.view = 'home';
      saveSession(session);
      return interaction.update(buildMainPanel(session));
    case 'add_container_main': {
      const existingContainers = getContainers(session);
      const isFirst = existingContainers.length === 0;
      pushHistory(session);
      if (!session.state || session.state.type !== 'components_v2' || !Array.isArray(session.state.root)) {
        session.state = createDefaultComponentsV2State();
        session.state.root = [];
        session.type = 'components_v2';
      }
      const c = createContainer();
      session.state.root.push(c);
      if (isFirst) {
        session.selectedNodeId = c._id;
        session.containerEditorContainerId = c._id;
        session.view = 'editor';
        saveSession(session);
        return interaction.update(buildContainerEditor(session));
      }
      // subsequent: preserve existing selection if still valid, do not auto-replace
      const containersNow = getContainers(session);
      if (!containersNow.find(x => x._id === session.selectedNodeId)) {
        const prev = existingContainers.find(x => containersNow.some(y => y._id === x._id));
        if (prev) session.selectedNodeId = prev._id;
      }
      session.view = 'home';
      session.containerEditorContainerId = null;
      saveSession(session);
      return interaction.update(buildMainPanel(session));
    }
    case 'ce_back': {
      session.view = 'home';
      session.containerEditorContainerId = null;
      saveSession(session);
      return interaction.update(buildMainPanel(session));
    }
    case 'ce_color': {
      const container = getSelectedContainer(session);
      if (!container) return interaction.reply({ content: 'The selected container could not be found.', flags: 64 });
      session.containerEditorContainerId = container._id;
      session.selectedNodeId = container._id;
      saveSession(session);
      const modal = new ModalBuilder().setCustomId(`bld:${session.id}:prop:ce_color_modal`).setTitle('Select Color');
      const current = container.accent_color != null ? '#' + Number(container.accent_color).toString(16).padStart(6, '0') : '';
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('accent_color')
          .setLabel('Accent color (hex, e.g. #5865F2)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(current)
          .setPlaceholder('Leave empty to remove the accent color')
      ));
      return interaction.showModal(modal);
    }
    case 'ce_delete': {
      const container = getSelectedContainer(session);
      if (!container) return interaction.reply({ content: 'The selected container could not be found.', flags: 64 });
      return interaction.update(buildContainerDeleteConfirm(session));
    }
    case 'ce_delete_cancel': {
      const container = getSelectedContainer(session);
      if (!container) return interaction.update(buildContainerEditorClosed());
      return interaction.update(buildContainerEditor(session));
    }
    case 'ce_delete_confirm': {
      const container = getSelectedContainer(session);
      if (!container) return interaction.reply({ content: 'The selected container could not be found.', flags: 64 });
      pushHistory(session);
      session.state.root = (session.state.root || []).filter(c => c._id !== container._id);
      const remaining = getContainers(session);
      session.selectedNodeId = remaining[0]?._id || null;
      session.containerEditorContainerId = null;
      session.view = 'home';
      saveSession(session);
      return interaction.update(buildMainPanel(session));
    }
    case 'json_editor': {
      const { getDefaultJsonTemplateString, isPristineDefaultState } = require('../utils/json-document');
      let defaultValue = getDefaultJsonTemplateString();
      if (!isPristineDefaultState(session)) {
        try {
          defaultValue = JSON.stringify(session.state, null, 2);
        } catch {
          defaultValue = getDefaultJsonTemplateString();
        }
      }
      if (defaultValue.length > 4000) defaultValue = defaultValue.slice(0, 4000);

      const modal = new ModalBuilder().setCustomId(`bld:${session.id}:prop:json_import`).setTitle('JSON Editor');
      const text = new TextInputBuilder()
        .setCustomId('json')
        .setLabel('Builder JSON document')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(4000)
        .setValue(defaultValue)
        .setPlaceholder('Paste a complete Builder document JSON');
      const fileUpload = new FileUploadBuilder()
        .setCustomId('json_file')
        .setRequired(false)
        .setMinValues(0)
        .setMaxValues(1);
      const fileLabel = new LabelBuilder()
        .setLabel('File (optional)')
        .setDescription('A .txt or .json file with the JSON. If attached, it replaces the text field.')
        .setFileUploadComponent(fileUpload);

      modal.addComponents(new ActionRowBuilder().addComponents(text));
      modal.addLabelComponents(fileLabel);
      return interaction.showModal(modal);
    }
    case 'send_custom': {
      const { buildPublishMenu } = require('./publishing');
      session.view = 'publish';
      saveSession(session);
      return interaction.update(buildPublishMenu(session));
    }
    case 'quick_send': {
      const validation = session.state.type === 'embed' ? validateEmbedState(session.state) : validateComponentsV2State(session.state);
      if (!validation.valid) {
        return interaction.reply({ content: `Cannot quick send: validation failed.\n${validation.errors.slice(0, 5).map(e => `- ${e}`).join('\n')}`.slice(0, 2000), flags: 64 });
      }
      try {
        const payload = buildPayloadForSession(session);
        if (session.editingMessage) {
          const channel = await interaction.client.channels.fetch(session.editingMessage.channelId);
          const target = await channel.messages.fetch(session.editingMessage.messageId);
          const permErr = canSendToChannel(channel, interaction.client.user);
          if (permErr) return interaction.reply({ content: `Cannot quick send (edit): ${permErr}`, flags: 64 });
          const msg = await editExisting(target, payload);
          if (session.state.type === 'components_v2') {
            try { require('../utils/published-runtime').collectActionsFromState(session.state, msg.id, { ownerId: interaction.user.id, guildId: interaction.guildId, channelId: channel.id }); } catch {}
          }
          return interaction.reply({ content: `✅ Message edited (quick send): ${msg.url}`, flags: 64 });
        }
        if (!session.publishChannelId) {
          return interaction.reply({ content: 'Quick send needs a destination. Use **Custom Send** to select a channel (or set an edit target) first.', flags: 64 });
        }
        const channel = await interaction.client.channels.fetch(session.publishChannelId);
        const permErr = canSendToChannel(channel, interaction.client.user);
        if (permErr) return interaction.reply({ content: `Cannot quick send: ${permErr}`, flags: 64 });
        const msg = await publishNew(channel, payload);
        if (session.state.type === 'components_v2') {
          try { require('../utils/published-runtime').collectActionsFromState(session.state, msg.id, { ownerId: interaction.user.id, guildId: interaction.guildId, channelId: channel.id }); } catch {}
        }
        return interaction.reply({ content: `✅ Published (quick send): ${msg.url}`, flags: 64 });
      } catch (e) {
        return interaction.reply({ content: `Quick send failed: ${e.message || 'Unknown error'}`, flags: 64 });
      }
    }
    case 'new_embed':
      pushHistory(session);
      session.state = createDefaultEmbedState();
      session.type = 'embed';
      session.draftId = null;
      session.templateId = null;
      session.editingMessage = null;
      session.view = 'editor';
      session.embedSection = 'basic';
      saveSession(session);
      return interaction.update(buildEmbedEditor(session));
    case 'new_cv2':
      pushHistory(session);
      session.state = createDefaultComponentsV2State();
      session.type = 'components_v2';
      session.selectedNodeId = session.state.root[0]?._id || null;
      session.draftId = null;
      session.templateId = null;
      session.editingMessage = null;
      session.view = 'editor';
      saveSession(session);
      return interaction.update(buildCv2Editor(session));
    case 'continue':
      session.view = 'editor';
      saveSession(session);
      return interaction.update(currentEditor(session));
    case 'open_drafts':
      return interaction.update(buildDraftsList(session));
    case 'open_templates':
      return interaction.update(buildTemplatesList(session));
    case 'edit_existing':
      return interaction.update(buildEditExisting(session));
    case 'save_menu':
      return interaction.update(buildSaveMenu(session));
    case 'publish_menu': {
      const { buildPublishMenu } = require('./publishing');
      session.view = 'publish';
      saveSession(session);
      return interaction.update(buildPublishMenu(session));
    }
    case 'back_editor':
      // If coming from within ephemeral container editor context, close it; else update current view
      return interaction.update(currentEditor(session));
    case 'undo':
      if (!popHistory(session)) return interaction.reply({ content: 'Nothing to undo.', flags: 64 });
      saveSession(session);
      return interaction.update(session.view === 'home' ? buildMainPanel(session) : currentEditor(session));
    case 'preview':
      try {
        let payload;
        if (session.state.type === 'embed') payload = toPublishPayload(buildEmbedPayload(session.state), 'embed');
        else payload = toPublishPayload(buildComponentsV2Payload(session.state), 'components_v2');
        if (session.state.type === 'components_v2') {
          await interaction.reply({ content: 'Preview (Components V2) — editing controls remain in the builder message.', ...payload, flags: 64 });
        } else {
          await interaction.reply({ content: session.state.content ? `Content preview: ${session.state.content.slice(0, 200)}` : 'Preview — editing controls remain in the builder message.', embeds: payload.embeds, components: [], flags: 64 });
        }
      } catch (e) {
        return interaction.reply({ content: `Preview failed: ${e.message}`, flags: 64 });
      }
      return;
    case 'save_draft': {
      try {
        const draft = draftService.saveDraft(session.userId, session.guildId, session.state, session.draftId);
        session.draftId = draft.id;
        saveSession(session);
        let note = '';
        const status = draftService.getLoadStatus ? draftService.getLoadStatus() : null;
        if (status && status.recovered) note = `\nWarning: previous draft storage was corrupted and backed up${status.backup ? ` to ${status.backup}` : ''}.`;
        return interaction.reply({ content: `✅ Draft saved: **${draft.name}** (${draft.id})${note}`, flags: 64 });
      } catch (e) {
        return interaction.reply({ content: `Failed to save draft: ${e.message}`, flags: 64 });
      }
    }
    case 'save_template': {
      const modal = new ModalBuilder().setCustomId(`bld:${session.id}:prop:tpl_name`).setTitle('Save Template');
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('name').setLabel('Template name').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80)
      ));
      return interaction.showModal(modal);
    }
    case 'embed_field_tools': {
      const fields = session.state.embed.fields || [];
      const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('Field Tools')
        .setDescription(fields.length ? fields.map((f, i) => `${i + 1}. ${String(f.name || '(unnamed)').slice(0, 80)}`).join('\n').slice(0, 4000) : 'No fields yet. Go back and use "Add Field" first.');
      const opts = fields.map((f, i) => ({ label: `${i + 1}. ${String(f.name || 'Field').slice(0, 90)}`.slice(0, 100), value: String(i) })).slice(0, 25);
      if (!opts.length) opts.push({ label: 'No fields', value: 'none' });
      const components = [
        new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`bld:${session.id}:prop:field_select`).setPlaceholder('Select field').addOptions(opts)),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`bld:${session.id}:prop:field_edit`).setLabel('Edit').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`bld:${session.id}:prop:field_remove`).setLabel('Remove').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`bld:${session.id}:prop:field_dup`).setLabel('Duplicate').setStyle(ButtonStyle.Secondary),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`bld:${session.id}:prop:field_up`).setLabel('Move Up').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`bld:${session.id}:prop:field_down`).setLabel('Move Down').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`bld:${session.id}:nav:back_editor`).setLabel('Back').setStyle(ButtonStyle.Secondary),
        )
      ];
      return interaction.update({ embeds: [embed], components });
    }
    default:
      return interaction.reply({ content: 'Unhandled navigation action.', flags: 64 });
  }
}

module.exports = { handleNavigation, buildHome, buildMainPanel, buildEmbedEditor, buildCv2Editor, currentEditor, buildContainerEditor };
