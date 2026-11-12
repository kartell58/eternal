const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  LabelBuilder,
  FileUploadBuilder
} = require('discord.js');
const { requireSession, saveSession, pushHistory, popHistory } = require('../services/session.service');
const { createDefaultEmbedState, createEmptyEmbed, normalizeEmbedState, getSelectedEmbed } = require('../schemas/embed.schema');
const { createDefaultComponentsV2State, createContainer, COMPONENT_FACTORIES } = require('../schemas/components-v2.schema');
const draftService = require('../services/draft.service');
const templateService = require('../services/template.service');
const { buildEmbedPayload } = require('../builders/embed.builder');
const { buildComponentsV2Payload } = require('../builders/components-v2.builder');
const { toPublishPayload, publishNew, editExisting, canSendToChannel } = require('../services/publisher.service');
const { validateEmbedState, validateComponentsV2State, parseColor } = require('../utils/validator');
const { allowedChildTypes } = require('../utils/component-tree');
const { buildContainerEditor, buildContainerDeleteConfirm, getSelectedContainer } = require('./container-editor');


function cv2Screen(components, accent = 0x5865f2) {
  const { MessageFlags } = require('discord.js');
  return {
    content: null,
    embeds: [],
    components,
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
  };
}

function infoContainer(title, description, fields = [], footer = null, accent = 0x5865f2) {
  const { ContainerBuilder, TextDisplayBuilder } = require('discord.js');
  const c = new ContainerBuilder().setAccentColor(accent);
  if (title) c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}`));
  if (description) c.addTextDisplayComponents(new TextDisplayBuilder().setContent(String(description).slice(0, 4000)));
  if (fields && fields.length) {
    const lines = fields.map(f => `**${f.name}:** ${String(f.value).replace(/\n/g, ' ')}`).join('\n');
    if (lines) c.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.slice(0, 4000)));
  }
  if (footer) c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${footer}`));
  return c;
}

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


function getEmbedOptions(session) {
  normalizeEmbedState(session.state);
  const embeds = session.state.embeds || [];
  if (!embeds.length) return [{ label: 'No embeds available', value: 'none', description: 'Add an embed to get started' }];
  return embeds.slice(0, 25).map((e, i) => ({
    label: `Embed ${i + 1}`.slice(0, 100),
    value: String(i)
  }));
}

function buildEmbedMainPanel(session) {
  const { TextDisplayBuilder } = require('discord.js');
  normalizeEmbedState(session.state);
  const embeds = session.state.embeds || [];
  const options = getEmbedOptions(session);

  const info = infoContainer(
    'Embed Builder',
    'Create and edit embed messages for this builder draft. Select an embed to edit, add a new embed, or publish your message.'
  );

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`bld:${sid(session)}:nav:embed_select`)
      .setPlaceholder('Select an Embed to edit')
      .setDisabled(embeds.length === 0)
      .addOptions(options)
  );

  const addRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:add_embed_main`).setLabel('Add Embed').setStyle(ButtonStyle.Secondary)
  );

  const actionsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:embed_add_button`).setLabel('Add Button').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:send_custom`).setLabel('Send Custom').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:quick_send`).setLabel('Quick Send').setStyle(ButtonStyle.Success),
  );

  const backRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:back_selection`).setLabel('Builder Selection').setStyle(ButtonStyle.Secondary)
  );

  return cv2Screen([info, selectRow, addRow, actionsRow, backRow]);
}

function buildSelectionScreen(session) {
  const { TextDisplayBuilder } = require('discord.js');
  const info = infoContainer(
    'Visual Builder',
    'Choose which builder you want to use for this session.\n\n**Embed Builder** — Create and edit Discord embed messages.\n**Components V2 Builder** — Create and edit messages using Components V2 containers and components.',
    [],
    'Only the session owner can use this builder.'
  );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:select_embed`).setLabel('Embed Builder').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:select_cv2`).setLabel('Components V2 Builder').setStyle(ButtonStyle.Primary),
  );
  return cv2Screen([info, row]);
}

function buildMainPanel(session) {
  const containers = getContainers(session);
  const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags } = require('discord.js');

  const options = containers.length
    ? containers.slice(0, 25).map((c, i) => ({
        label: `Container ${i + 1}`.slice(0, 100),
        value: c._id
      }))
    : [{ label: 'No containers available', value: 'none', description: 'Add a container to get started' }];

  const infoContainer = new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## Container Information'),
      new TextDisplayBuilder().setContent('Manage the containers in your current Builder message. Select a container to edit, add new ones, import JSON, load templates, or publish.'),
      new TextDisplayBuilder().setContent(
        `**Containers:** ${containers.length ? `${containers.length} available` : 'None yet'}\n` +
        `**Session Owner:** <@${session.userId}>\n` +
        `**Draft:** ${session.draftId ? session.draftId : 'Not saved'}`
      ),
      new TextDisplayBuilder().setContent('-# Only the session owner can use this panel.')
    );

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
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:back_selection`).setLabel('Builder Selection').setStyle(ButtonStyle.Secondary),
  );

  const jsonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:json_editor`).setLabel('JSON Editor').setStyle(ButtonStyle.Secondary),
  );

  const publishRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:send_custom`).setLabel('Custom Send').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:quick_send`).setLabel('Quick Send').setStyle(ButtonStyle.Success),
  );

  return {
    content: null,
    embeds: [],
    components: [
      new TextDisplayBuilder().setContent('## Container Creation Panel'),
      infoContainer,
      selectRow,
      actionsRow,
      jsonRow,
      publishRow
    ],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
  };
}

// Backwards-compatible alias for existing callers
function buildHome(session) {
  return buildMainPanel(session);
}

function buildEmbedEditor(session) {
  normalizeEmbedState(session.state);
  const e = getSelectedEmbed(session.state) || {};
  const idx = session.state.selectedEmbedIndex || 0;
  const total = session.state.embeds.length;
  const accent = parseColor(e.color);
  const { ContainerBuilder, TextDisplayBuilder } = require('discord.js');

  const preview = new ContainerBuilder()
    .setAccentColor(accent != null ? accent : 0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${e.title || 'Embed Title'}`),
      new TextDisplayBuilder().setContent(String(e.description || '*No description yet*').slice(0, 4000)),
      new TextDisplayBuilder().setContent(`-# Embed ${idx + 1} of ${total} • ${editorContext(session)}`)
    );

  const sectionRow1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:prop:embed_title`).setLabel('Title').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:prop:embed_description`).setLabel('Description').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:prop:embed_color`).setLabel('Color').setStyle(ButtonStyle.Secondary),
  );
  const sectionRow2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:prop:embed_author`).setLabel('Author').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:prop:embed_content`).setLabel('Message Content').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:prop:embed_footer`).setLabel('Footer').setStyle(ButtonStyle.Secondary),
  );
  const sectionRow3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:embed_field_tools`).setLabel('Edit Fields').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:prop:embed_add_field`).setLabel('Add Field').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:prop:embed_images`).setLabel('Image & Thumbnail').setStyle(ButtonStyle.Secondary),
  );
  const actions = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:preview`).setLabel('Preview').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:save_menu`).setLabel('Save').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:publish_menu`).setLabel('Publish').setStyle(ButtonStyle.Primary),
  );
  const back = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:embed_back_panel`).setLabel('Back').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:undo`).setLabel('Undo').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:back_selection`).setLabel('Builder Selection').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:json_editor`).setLabel('Import JSON').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:export_json`).setLabel('Export JSON').setStyle(ButtonStyle.Primary),
  );
  const heading = new TextDisplayBuilder().setContent('## Embed Editor');
  return cv2Screen([heading, preview, sectionRow1, sectionRow2, sectionRow3, actions, back]);
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
  const info = infoContainer('Components V2 Editor', `**Editing:** ${editorContext(session)}\nBuild with containers, sections, text, buttons, selects, media, and more.`, [
    { name: 'Selected node', value: String(selected).slice(0, 200) },
    { name: 'Top-level', value: `${(session.state.root || []).length} container(s)` }
  ], 'Select a node to add children, edit, move, duplicate, or remove.');

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
  return cv2Screen([info, selectRow, ops, ops2, actions, back]);
}

function buildSaveMenu(session) {
  const info = infoContainer('Save', `Save your current **${typeLabel(session)}** message as a draft or reusable template.\n\nDrafts and templates are private to you in this server.`);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:save_draft`).setLabel('Save Draft').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:save_template`).setLabel('Save Template').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:back_editor`).setLabel('Back to Editor').setStyle(ButtonStyle.Secondary),
  );
  return cv2Screen([info, row]);
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
  const info = infoContainer('Saved Drafts', desc.slice(0, 4000));
  const components = [info];
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
  return cv2Screen(components);
}

function buildTemplatesList(session) {
  const templates = templateService.listTemplates(session.userId, session.guildId).slice(0, 25);
  const status = templateService.getLoadStatus ? templateService.getLoadStatus() : null;
  let desc = templates.length ? 'Open, duplicate, or delete your templates.' : 'No templates saved for you in this server.';
  desc += storageWarning(status);
  const info = infoContainer('Saved Templates', desc.slice(0, 4000));
  const components = [info];
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
  return cv2Screen(components);
}

function buildEditExisting(session) {
  const info = infoContainer('Edit Existing Message',
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
  return cv2Screen([info, row]);
}

function currentEditor(session) {
  if (session.state && session.state.type === 'embed') {
    normalizeEmbedState(session.state);
    if (session.view === 'embed_home') return buildEmbedMainPanel(session);
    return buildEmbedEditor(session);
  }
  return buildCv2Editor(session);
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
    if (action === 'embed_select') {
      if (session.state?.type !== 'embed') session.state = createDefaultEmbedState();
      normalizeEmbedState(session.state);
      const idx = parseInt(interaction.values[0], 10);
      if (Number.isNaN(idx) || idx < 0 || idx >= session.state.embeds.length) {
        return interaction.reply({ content: 'The selected embed could not be found.', flags: 64 });
      }
      session.state.selectedEmbedIndex = idx;
      session.state.embed = session.state.embeds[idx];
      session.type = 'embed';
      session.view = 'editor';
      saveSession(session);
      return interaction.update(buildEmbedEditor(session));
    }
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
    case 'select_embed': {
      // Switch to embed builder main panel in the same session/message
      if (!session.state || session.state.type !== 'embed') {
        session.state = createDefaultEmbedState();
      } else {
        normalizeEmbedState(session.state);
      }
      session.type = 'embed';
      session.view = 'embed_home';
      session.embedSection = session.embedSection || 'basic';
      session.containerEditorContainerId = null;
      saveSession(session);
      return interaction.update(buildEmbedMainPanel(session));
    }
    case 'embed_select': {
      if (session.state?.type !== 'embed') session.state = createDefaultEmbedState();
      normalizeEmbedState(session.state);
      const idx = parseInt(interaction.values[0], 10);
      if (Number.isNaN(idx) || idx < 0 || idx >= session.state.embeds.length) {
        return interaction.reply({ content: 'The selected embed could not be found.', flags: 64 });
      }
      session.state.selectedEmbedIndex = idx;
      session.state.embed = session.state.embeds[idx];
      session.type = 'embed';
      session.view = 'editor';
      saveSession(session);
      return interaction.update(buildEmbedEditor(session));
    }
    case 'add_embed_main': {
      if (session.state?.type !== 'embed') session.state = createDefaultEmbedState();
      normalizeEmbedState(session.state);
      if (session.state.embeds.length >= 10) {
        return interaction.reply({ content: 'A message can have at most 10 embeds.', flags: 64 });
      }
      pushHistory(session);
      const e = createEmptyEmbed();
      session.state.embeds.push(e);
      session.state.selectedEmbedIndex = session.state.embeds.length - 1;
      session.state.embed = e;
      session.type = 'embed';
      session.view = 'editor';
      saveSession(session);
      return interaction.update(buildEmbedEditor(session));
    }
    case 'embed_back_panel': {
      if (session.state?.type !== 'embed') session.state = createDefaultEmbedState();
      normalizeEmbedState(session.state);
      session.view = 'embed_home';
      saveSession(session);
      return interaction.update(buildEmbedMainPanel(session));
    }
    case 'embed_add_button': {
      return interaction.reply({ content: 'Adding message buttons is not available in the Embed Builder. Use the Components V2 Builder for button components.', flags: 64 });
    }
    case 'select_cv2': {
      // Switch to Components V2 workflow (container selection/main panel)
      if (!session.state || session.state.type !== 'components_v2' || !Array.isArray(session.state.root)) {
        session.state = createDefaultComponentsV2State();
      }
      session.type = 'components_v2';
      session.view = 'home';
      session.containerEditorContainerId = null;
      if (!getContainers(session).length) {
        // ensure valid CV2 state has at least a container
        session.state.root = [createContainer()];
      }
      session.selectedNodeId = session.selectedNodeId && getContainers(session).some(c => c._id === session.selectedNodeId)
        ? session.selectedNodeId
        : (getContainers(session)[0]?._id || null);
      saveSession(session);
      return interaction.update(buildMainPanel(session));
    }
    case 'back_selection': {
      session.view = 'selection';
      session.containerEditorContainerId = null;
      saveSession(session);
      return interaction.update(buildSelectionScreen(session));
    }
    case 'home':
      session.containerEditorContainerId = null;
      if (session.state && session.state.type === 'embed') {
        session.view = 'embed_home';
        normalizeEmbedState(session.state);
        saveSession(session);
        return interaction.update(buildEmbedMainPanel(session));
      }
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
      if (session.view === 'selection') return interaction.update(buildSelectionScreen(session));
      if (session.view === 'embed_home') return interaction.update(buildEmbedMainPanel(session));
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
      if (session.state?.type === 'embed') normalizeEmbedState(session.state);
      const e = session.state?.type === 'embed' ? getSelectedEmbed(session.state) : (session.state.embed || {});
      const fields = (e && e.fields) || [];
      const info = infoContainer('Field Tools', fields.length ? fields.map((f, i) => `${i + 1}. ${String(f.name || '(unnamed)').slice(0, 80)}`).join('\n').slice(0, 4000) : 'No fields yet. Use "Add Field" to create one.');
      const opts = fields.map((f, i) => ({ label: `${i + 1}. ${String(f.name || 'Field').slice(0, 90)}`.slice(0, 100), value: String(i) })).slice(0, 25);
      if (!opts.length) opts.push({ label: 'No fields', value: 'none' });
      const components = [
        info,
        new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`bld:${session.id}:prop:field_select`).setPlaceholder('Select field').addOptions(opts)),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`bld:${session.id}:prop:field_edit`).setLabel('Edit').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`bld:${session.id}:prop:field_remove`).setLabel('Remove').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`bld:${session.id}:prop:field_dup`).setLabel('Duplicate').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`bld:${session.id}:prop:embed_add_field`).setLabel('Add Field').setStyle(ButtonStyle.Secondary),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`bld:${session.id}:prop:field_up`).setLabel('Move Up').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`bld:${session.id}:prop:field_down`).setLabel('Move Down').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`bld:${session.id}:nav:back_editor`).setLabel('Back').setStyle(ButtonStyle.Secondary),
        )
      ];
      return interaction.update(cv2Screen(components));
    }
    case 'export_json': {
      try {
        const json = JSON.stringify(session.state, null, 2);
        const buffer = Buffer.from(json, 'utf8');
        return interaction.reply({
          content: 'Exported the current builder state as JSON.',
          files: [{ attachment: buffer, name: 'builder-state.json' }],
          flags: 64
        });
      } catch (e) {
        return interaction.reply({ content: `Export failed: ${e.message}`, flags: 64 });
      }
    }
    default:
      return interaction.reply({ content: 'Unhandled navigation action.', flags: 64 });
  }
}

module.exports = { handleNavigation, buildHome, buildMainPanel, buildEmbedEditor, buildCv2Editor, currentEditor, buildContainerEditor, buildSelectionScreen, buildEmbedMainPanel };
