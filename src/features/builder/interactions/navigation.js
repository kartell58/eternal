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
const { buildContainerEditor, buildContainerDeleteConfirm, buildContainerColorScreen, getSelectedContainer } = require('./container-editor');
const { sessionTranslator } = require('../utils/i18n');

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

function getT(session, interaction) {
  const lang = interaction && interaction.client ? interaction.client.language : (session && session.client && session.client.language) || null;
  // Prefer interaction.client.language when available; session stores locale.
  const language = (interaction && interaction.client && interaction.client.language) ? interaction.client.language : (lang || null);
  const { t } = sessionTranslator(session, language);
  return t;
}

function typeLabel(session, t) {
  return session.state?.type === 'components_v2'
    ? t('events.builder.navigation.types.components_v2', {}, 'Components V2')
    : t('events.builder.navigation.types.embed', {}, 'Embed');
}

function editorContext(session, t) {
  const target = session.editingMessage
    ? t('events.builder.navigation.context.editing', { channelId: session.editingMessage.channelId, messageId: session.editingMessage.messageId }, `editing ${session.editingMessage.channelId}/${session.editingMessage.messageId}`)
    : t('events.builder.navigation.context.new', {}, 'new message');
  return t('events.builder.navigation.context.label', { type: typeLabel(session, t), target }, `${typeLabel(session, t)} • ${target}`);
}

function getContainers(session) {
  return (session.state?.root || []).filter(n => n && n.type === 'container');
}

function getEmbedOptions(session, t) {
  normalizeEmbedState(session.state);
  const embeds = session.state.embeds || [];
  if (!embeds.length) return [{ label: t('events.builder.navigation.embed_main.no_embeds', {}, 'No embeds available'), value: 'none', description: t('events.builder.navigation.embed_main.no_embeds_desc', {}, 'Add an embed to get started') }];
  return embeds.slice(0, 25).map((e, i) => ({
    label: t('events.builder.navigation.embed_main.embed_option', { index: i + 1 }, `Embed ${i + 1}`).slice(0, 100),
    value: String(i)
  }));
}

function buildEmbedMainPanel(session, t) {
  t = t || ((k, v, f) => f || k);
  normalizeEmbedState(session.state);
  const embeds = session.state.embeds || [];
  const options = getEmbedOptions(session, t);

  const info = infoContainer(
    t('events.builder.navigation.embed_main.title', {}, 'Embed Builder'),
    t('events.builder.navigation.embed_main.description', {}, 'Create and edit embed messages for this builder draft. Select an embed to edit, add a new embed, or publish your message.')
  );

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`bld:${sid(session)}:nav:embed_select`)
      .setPlaceholder(t('events.builder.navigation.embed_main.select_placeholder', {}, 'Select an Embed to edit'))
      .setDisabled(embeds.length === 0)
      .addOptions(options)
  );

  const addRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:add_embed_main`).setLabel(t('events.builder.navigation.embed_main.add_embed', {}, 'Add Embed')).setStyle(ButtonStyle.Secondary)
  );

  const actionsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:embed_add_button`).setLabel(t('events.builder.navigation.embed_main.add_button', {}, 'Add Button')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:send_custom`).setLabel(t('events.builder.navigation.embed_main.send_custom', {}, 'Send Custom')).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:quick_send`).setLabel(t('events.builder.navigation.embed_main.quick_send', {}, 'Quick Send')).setStyle(ButtonStyle.Success),
  );

  const backRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:back_selection`).setLabel(t('events.builder.navigation.embed_main.back_selection', {}, 'Builder Selection')).setStyle(ButtonStyle.Secondary)
  );

  return cv2Screen([info, selectRow, addRow, actionsRow, backRow]);
}

function buildSelectionScreen(session, t) {
  t = t || ((k, v, f) => f || k);
  const info = infoContainer(
    t('events.builder.navigation.selection.title', {}, 'Visual Builder'),
    t('events.builder.navigation.selection.description', {}, 'Choose which builder you want to use for this session.\n\n**Embed Builder** — Create and edit Discord embed messages.\n**Components V2 Builder** — Create and edit messages using Components V2 containers and components.'),
    [],
    t('events.builder.navigation.selection.footer', {}, 'Only the session owner can use this builder.')
  );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:select_embed`).setLabel(t('events.builder.navigation.selection.embed_button', {}, 'Embed Builder')).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:select_cv2`).setLabel(t('events.builder.navigation.selection.cv2_button', {}, 'Components V2 Builder')).setStyle(ButtonStyle.Primary),
  );
  return cv2Screen([info, row]);
}

function buildMainPanel(session, t) {
  t = t || ((k, v, f) => f || k);
  const containers = getContainers(session);
  const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');

  const options = containers.length
    ? containers.slice(0, 25).map((c, i) => ({
        label: t('events.builder.navigation.cv2_main.container_option', { index: i + 1 }, `Container ${i + 1}`).slice(0, 100),
        value: c._id
      }))
    : [{ label: t('events.builder.navigation.cv2_main.no_containers', {}, 'No containers available'), value: 'none', description: t('events.builder.navigation.cv2_main.no_containers_desc', {}, 'Add a container to get started') }];

  const countValue = containers.length
    ? t('events.builder.navigation.cv2_main.containers_count', { count: containers.length }, `${containers.length} available`)
    : t('events.builder.navigation.cv2_main.containers_none', {}, 'None yet');
  const draftValue = session.draftId ? session.draftId : t('events.builder.navigation.cv2_main.draft_not_saved', {}, 'Not saved');

  const info = new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(t('events.builder.navigation.cv2_main.info_title', {}, '## Container Information').startsWith('##') ? t('events.builder.navigation.cv2_main.info_title', {}, '## Container Information') : '## ' + t('events.builder.navigation.cv2_main.info_title', {}, 'Container Information')),
      new TextDisplayBuilder().setContent(t('events.builder.navigation.cv2_main.info_description', {}, 'Manage the containers in your current Builder message. Select a container to edit, add new ones, import JSON, load templates, or publish.')),
      new TextDisplayBuilder().setContent(
        t('events.builder.navigation.cv2_main.containers_label', { value: countValue }, `**Containers:** ${countValue}`) + '\n' +
        t('events.builder.navigation.cv2_main.owner_label', { userId: session.userId }, `**Session Owner:** <@${session.userId}>`) + '\n' +
        t('events.builder.navigation.cv2_main.draft_label', { value: draftValue }, `**Draft:** ${draftValue}`)
      ),
      new TextDisplayBuilder().setContent(t('events.builder.navigation.cv2_main.footer', {}, '-# Only the session owner can use this panel.'))
    );

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`bld:${sid(session)}:nav:container_select`)
      .setPlaceholder(t('events.builder.navigation.cv2_main.select_placeholder', {}, 'Select a container to edit'))
      .setDisabled(!containers.length)
      .addOptions(options)
  );

  const actionsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:add_container_main`).setLabel(t('events.builder.navigation.cv2_main.add_container', {}, 'Add Container')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:open_templates`).setLabel(t('events.builder.navigation.cv2_main.templates', {}, 'Templates')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:back_selection`).setLabel(t('events.builder.navigation.cv2_main.builder_selection', {}, 'Builder Selection')).setStyle(ButtonStyle.Secondary),
  );

  const jsonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:json_editor`).setLabel(t('events.builder.navigation.cv2_main.json_editor', {}, 'JSON Editor')).setStyle(ButtonStyle.Secondary),
  );

  const publishRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:send_custom`).setLabel(t('events.builder.navigation.cv2_main.custom_send', {}, 'Custom Send')).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:quick_send`).setLabel(t('events.builder.navigation.cv2_main.quick_send', {}, 'Quick Send')).setStyle(ButtonStyle.Success),
  );

  return {
    content: null,
    embeds: [],
    components: [
      new TextDisplayBuilder().setContent(t('events.builder.navigation.cv2_main.heading', {}, '## Container Creation Panel')),
      info,
      selectRow,
      actionsRow,
      jsonRow,
      publishRow
    ],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
  };
}

function buildHome(session, t) {
  return buildMainPanel(session, t);
}

function buildEmbedEditor(session, t) {
  t = t || ((k, v, f) => f || k);
  normalizeEmbedState(session.state);
  const e = getSelectedEmbed(session.state) || {};
  const idx = session.state.selectedEmbedIndex || 0;
  const total = session.state.embeds.length;
  const accent = parseColor(e.color);
  const { ContainerBuilder, TextDisplayBuilder } = require('discord.js');

  const preview = new ContainerBuilder()
    .setAccentColor(accent != null ? accent : 0x5865f2)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${e.title || t('events.builder.navigation.embed_editor.preview_title_fallback', {}, 'Embed Title')}`),
      new TextDisplayBuilder().setContent(String(e.description || t('events.builder.navigation.embed_editor.preview_desc_fallback', {}, '*No description yet*')).slice(0, 4000)),
      new TextDisplayBuilder().setContent(t('events.builder.navigation.embed_editor.preview_footer', { index: idx + 1, total, context: editorContext(session, t) }, `-# Embed ${idx + 1} of ${total} • ${editorContext(session, t)}`))
    );

  const sectionRow1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:prop:embed_title`).setLabel(t('events.builder.navigation.embed_editor.btn_title', {}, 'Title')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:prop:embed_description`).setLabel(t('events.builder.navigation.embed_editor.btn_description', {}, 'Description')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:prop:embed_color`).setLabel(t('events.builder.navigation.embed_editor.btn_color', {}, 'Color')).setStyle(ButtonStyle.Secondary),
  );
  const sectionRow2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:prop:embed_author`).setLabel(t('events.builder.navigation.embed_editor.btn_author', {}, 'Author')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:prop:embed_content`).setLabel(t('events.builder.navigation.embed_editor.btn_content', {}, 'Message Content')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:prop:embed_footer`).setLabel(t('events.builder.navigation.embed_editor.btn_footer', {}, 'Footer')).setStyle(ButtonStyle.Secondary),
  );
  const sectionRow3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:embed_field_tools`).setLabel(t('events.builder.navigation.embed_editor.btn_fields', {}, 'Edit Fields')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:prop:embed_add_field`).setLabel(t('events.builder.navigation.embed_editor.btn_add_field', {}, 'Add Field')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:prop:embed_images`).setLabel(t('events.builder.navigation.embed_editor.btn_images', {}, 'Image & Thumbnail')).setStyle(ButtonStyle.Secondary),
  );
  const actions = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:preview`).setLabel(t('events.builder.navigation.embed_editor.btn_preview', {}, 'Preview')).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:save_menu`).setLabel(t('events.builder.navigation.embed_editor.btn_save', {}, 'Save')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:publish_menu`).setLabel(t('events.builder.navigation.embed_editor.btn_publish', {}, 'Publish')).setStyle(ButtonStyle.Primary),
  );
  const back = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:embed_back_panel`).setLabel(t('events.builder.navigation.embed_editor.btn_back', {}, 'Back')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:undo`).setLabel(t('events.builder.navigation.embed_editor.btn_undo', {}, 'Undo')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:back_selection`).setLabel(t('events.builder.navigation.embed_editor.btn_builder_selection', {}, 'Builder Selection')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:json_editor`).setLabel(t('events.builder.navigation.embed_editor.btn_import_json', {}, 'Import JSON')).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:export_json`).setLabel(t('events.builder.navigation.embed_editor.btn_export_json', {}, 'Export JSON')).setStyle(ButtonStyle.Primary),
  );
  const heading = new TextDisplayBuilder().setContent(t('events.builder.navigation.embed_editor.heading', {}, '## Embed Editor'));
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

function buildCv2Editor(session, t) {
  t = t || ((k, v, f) => f || k);
  const options = listNodes(session.state.root).slice(0, 25);
  if (options.length === 0) options.push({ label: t('events.builder.navigation.cv2_editor.no_components', {}, 'No components yet'), value: 'none' });
  const selected = session.selectedNodeId || t('events.builder.navigation.cv2_editor.none', {}, '(none)');
  const info = infoContainer(
    t('events.builder.navigation.cv2_editor.title', {}, 'Components V2 Editor'),
    t('events.builder.navigation.cv2_editor.description', { context: editorContext(session, t) }, `**Editing:** ${editorContext(session, t)}\nBuild with containers, sections, text, buttons, selects, media, and more.`),
    [
      { name: t('events.builder.navigation.cv2_editor.selected_node', {}, 'Selected node'), value: String(selected).slice(0, 200) },
      { name: t('events.builder.navigation.cv2_editor.top_level', {}, 'Top-level'), value: t('events.builder.navigation.cv2_editor.containers_count', { count: (session.state.root || []).length }, `${(session.state.root || []).length} container(s)`) }
    ],
    t('events.builder.navigation.cv2_editor.footer', {}, 'Select a node to add children, edit, move, duplicate, or remove.')
  );

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(`bld:${sid(session)}:nav:cv2_select`).setPlaceholder(t('events.builder.navigation.cv2_editor.select_placeholder', {}, 'Select component node')).addOptions(options)
  );
  const ops = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:cmp:add`).setLabel(t('events.builder.navigation.cv2_editor.add_child', {}, 'Add Child')).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:prop:cv2_edit`).setLabel(t('events.builder.navigation.cv2_editor.edit', {}, 'Edit')).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:cmp:remove`).setLabel(t('events.builder.navigation.cv2_editor.remove', {}, 'Remove')).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:cmp:dup`).setLabel(t('events.builder.navigation.cv2_editor.duplicate', {}, 'Duplicate')).setStyle(ButtonStyle.Secondary),
  );
  const ops2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:cmp:up`).setLabel(t('events.builder.navigation.cv2_editor.move_up', {}, 'Move Up')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:cmp:down`).setLabel(t('events.builder.navigation.cv2_editor.move_down', {}, 'Move Down')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:cmp:add_root`).setLabel(t('events.builder.navigation.cv2_editor.add_container', {}, 'Add Container')).setStyle(ButtonStyle.Secondary),
  );
  const actions = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:preview`).setLabel(t('events.builder.navigation.cv2_editor.preview', {}, 'Preview')).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:save_menu`).setLabel(t('events.builder.navigation.cv2_editor.save', {}, 'Save')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:publish_menu`).setLabel(t('events.builder.navigation.cv2_editor.publish', {}, 'Publish')).setStyle(ButtonStyle.Primary),
  );
  const back = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:home`).setLabel(t('events.builder.navigation.cv2_editor.home', {}, 'Home')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:undo`).setLabel(t('events.builder.navigation.cv2_editor.undo', {}, 'Undo')).setStyle(ButtonStyle.Secondary),
  );
  return cv2Screen([info, selectRow, ops, ops2, actions, back]);
}

function buildSaveMenu(session, t) {
  t = t || ((k, v, f) => f || k);
  const info = infoContainer(
    t('events.builder.navigation.save_menu.title', {}, 'Save'),
    t('events.builder.navigation.save_menu.description', { type: typeLabel(session, t) }, `Save your current **${typeLabel(session, t)}** message as a draft or reusable template.\n\nDrafts and templates are private to you in this server.`)
  );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:save_draft`).setLabel(t('events.builder.navigation.save_menu.save_draft', {}, 'Save Draft')).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:save_template`).setLabel(t('events.builder.navigation.save_menu.save_template', {}, 'Save Template')).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:back_editor`).setLabel(t('events.builder.navigation.save_menu.back', {}, 'Back to Editor')).setStyle(ButtonStyle.Secondary),
  );
  return cv2Screen([info, row]);
}

function storageWarning(status, t) {
  if (status && status.recovered) {
    const backup = status.backup ? t('events.builder.navigation.drafts.backup_suffix', { backup: status.backup }, ` (${status.backup})`) : '';
    return t('events.builder.navigation.drafts.storage_warning', { backup }, `\n\n⚠️ Previous storage was corrupted and backed up${backup}.`);
  }
  return '';
}

function buildDraftsList(session, t) {
  t = t || ((k, v, f) => f || k);
  const drafts = draftService.listDrafts(session.userId, session.guildId).slice(0, 25);
  const status = draftService.getLoadStatus ? draftService.getLoadStatus() : null;
  let desc = drafts.length
    ? t('events.builder.navigation.drafts.description', {}, 'Select a draft to open, or choose one to delete.')
    : t('events.builder.navigation.drafts.empty', {}, 'No drafts saved for you in this server.');
  desc += storageWarning(status, t);
  const info = infoContainer(t('events.builder.navigation.drafts.title', {}, 'Saved Drafts'), desc.slice(0, 4000));
  const components = [info];
  if (drafts.length) {
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(`bld:${sid(session)}:nav:load_draft`).setPlaceholder(t('events.builder.navigation.drafts.open_placeholder', {}, 'Open draft')).addOptions(
        drafts.map(d => ({ label: d.name.slice(0, 100), value: d.id, description: `${d.state.type} • ${new Date(d.updatedAt).toLocaleString()}`.slice(0, 100) }))
      )
    ));
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(`bld:${sid(session)}:nav:delete_draft`).setPlaceholder(t('events.builder.navigation.drafts.delete_placeholder', {}, 'Delete draft')).addOptions(
        drafts.map(d => ({ label: t('events.builder.navigation.drafts.delete_label', { name: d.name }, `Delete: ${d.name}`).slice(0, 100), value: d.id, description: d.id.slice(0, 100) }))
      )
    ));
  }
  components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:home`).setLabel(t('events.builder.navigation.drafts.back', {}, 'Back')).setStyle(ButtonStyle.Secondary)));
  return cv2Screen(components);
}

function buildTemplatesList(session, t) {
  t = t || ((k, v, f) => f || k);
  const templates = templateService.listTemplates(session.userId, session.guildId).slice(0, 25);
  const status = templateService.getLoadStatus ? templateService.getLoadStatus() : null;
  let desc = templates.length
    ? t('events.builder.navigation.templates.description', {}, 'Open, duplicate, or delete your templates.')
    : t('events.builder.navigation.templates.empty', {}, 'No templates saved for you in this server.');
  if (status && status.recovered) {
    const backup = status.backup ? t('events.builder.navigation.templates.backup_suffix', { backup: status.backup }, ` (${status.backup})`) : '';
    desc += t('events.builder.navigation.templates.storage_warning', { backup }, `\n\n⚠️ Previous storage was corrupted and backed up${backup}.`);
  }
  const info = infoContainer(t('events.builder.navigation.templates.title', {}, 'Saved Templates'), desc.slice(0, 4000));
  const components = [info];
  if (templates.length) {
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(`bld:${sid(session)}:nav:load_template`).setPlaceholder(t('events.builder.navigation.templates.open_placeholder', {}, 'Open template')).addOptions(
        templates.map(x => ({ label: x.name.slice(0, 100), value: x.id, description: `${x.state.type}`.slice(0, 100) }))
      )
    ));
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(`bld:${sid(session)}:nav:dup_template`).setPlaceholder(t('events.builder.navigation.templates.duplicate_placeholder', {}, 'Duplicate template')).addOptions(
        templates.map(x => ({ label: t('events.builder.navigation.templates.duplicate_label', { name: x.name }, `Duplicate: ${x.name}`).slice(0, 100), value: x.id }))
      )
    ));
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(`bld:${sid(session)}:nav:delete_template`).setPlaceholder(t('events.builder.navigation.templates.delete_placeholder', {}, 'Delete template')).addOptions(
        templates.map(x => ({ label: t('events.builder.navigation.templates.delete_label', { name: x.name }, `Delete: ${x.name}`).slice(0, 100), value: x.id }))
      )
    ));
  }
  components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:home`).setLabel(t('events.builder.navigation.templates.back', {}, 'Back')).setStyle(ButtonStyle.Secondary)));
  return cv2Screen(components);
}

function buildEditExisting(session, t) {
  t = t || ((k, v, f) => f || k);
  const info = infoContainer(
    t('events.builder.navigation.edit_existing.title', {}, 'Edit Existing Message'),
    t('events.builder.navigation.edit_existing.description', {}, 'Load a message sent by this bot to edit and republish it.\n\n- Only bot-authored messages can be edited.\n- Embeds can be imported into the editor.\n- Existing Components V2 messages cannot be fully reconstructed visually; loading one sets it as the edit target and starts a new Components V2 draft to replace it on publish.\n\nProvide the channel and message IDs below.')
  );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:prop:edit_existing`).setLabel(t('events.builder.navigation.edit_existing.enter_info', {}, 'Enter Message Info')).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:home`).setLabel(t('events.builder.navigation.edit_existing.back', {}, 'Back')).setStyle(ButtonStyle.Secondary),
  );
  return cv2Screen([info, row]);
}

function currentEditor(session, t) {
  if (session.state && session.state.type === 'embed') {
    normalizeEmbedState(session.state);
    if (session.view === 'embed_home') return buildEmbedMainPanel(session, t);
    return buildEmbedEditor(session, t);
  }
  return buildCv2Editor(session, t);
}

function buildPayloadForSession(session) {
  if (session.state.type === 'embed') return toPublishPayload(buildEmbedPayload(session.state), 'embed');
  return toPublishPayload(buildComponentsV2Payload(session.state), 'components_v2');
}

function openContainerEditorResponse(session, t) {
  session.view = 'editor';
  session.containerEditorContainerId = session.selectedNodeId;
  saveSession(session);
  return buildContainerEditor(session, t);
}

async function handleNavigation(interaction, { sid }) {
  const { session: session0, error } = requireSession(sid, interaction.user.id, interaction.guildId, { interaction });
  if (error) {
    const payload = { content: error, flags: 64 };
    if (interaction.deferred || interaction.replied) return interaction.followUp(payload);
    return interaction.reply(payload);
  }
  const session = session0;
  // Ensure session.locale fallback resolution consistency for UI rendering.
  if (!session.locale && interaction.client && interaction.client.language) {
    try { session.locale = await interaction.client.language.resolve({ userId: interaction.user.id, guildId: interaction.guildId || null }); } catch {}
  }
  const t = getT(session, interaction);
  const tr = (key, vars, fallback) => t(key, vars, fallback);

  const action = interaction.customId.split(':')[3];

  if (interaction.isStringSelectMenu()) {
    if (action === 'embed_select') {
      if (session.state?.type !== 'embed') session.state = createDefaultEmbedState();
      normalizeEmbedState(session.state);
      const idx = parseInt(interaction.values[0], 10);
      if (Number.isNaN(idx) || idx < 0 || idx >= session.state.embeds.length) {
        return interaction.reply({ content: tr('events.builder.navigation.replies.embed_not_found', {}, 'The selected embed could not be found.'), flags: 64 });
      }
      session.state.selectedEmbedIndex = idx;
      session.state.embed = session.state.embeds[idx];
      session.type = 'embed';
      session.view = 'editor';
      saveSession(session);
      return interaction.update(buildEmbedEditor(session, tr));
    }
    if (action === 'container_select') {
      const val = interaction.values[0];
      if (val === 'none') return interaction.deferUpdate();
      const containers = getContainers(session);
      const target = containers.find(c => c._id === val);
      if (!target) return interaction.reply({ content: tr('events.builder.navigation.replies.container_not_found', {}, 'The selected container could not be found.'), flags: 64 });
      session.selectedNodeId = target._id;
      session.containerEditorContainerId = target._id;
      return interaction.update(openContainerEditorResponse(session, tr));
    }
    if (action === 'embed_section') {
      session.embedSection = interaction.values[0];
      saveSession(session);
      return interaction.update(buildEmbedEditor(session, tr));
    }
    if (action === 'cv2_select') {
      session.selectedNodeId = interaction.values[0] === 'none' ? null : interaction.values[0];
      saveSession(session);
      return interaction.update(buildCv2Editor(session, tr));
    }
    if (action === 'ce_edit_item') {
      const val = interaction.values[0];
      if (val === 'none') return interaction.reply({ content: tr('events.builder.navigation.replies.no_items_to_edit', {}, 'There are no items to edit in this container.'), flags: 64 });
      const container = getSelectedContainer(session);
      if (!container) return interaction.update(require('./container-editor').buildContainerEditorClosed(tr));
      const item = (container.components || []).find(c => c && c._id === val);
      if (!item) return interaction.reply({ content: tr('events.builder.navigation.replies.item_not_found', {}, 'The selected item could not be found in this container.'), flags: 64 });
      session.containerEditorContainerId = container._id;
      session.selectedNodeId = item._id;
      saveSession(session);
      const { showCv2EditModal } = require('./properties');
      try {
        return await showCv2EditModal(interaction, session);
      } catch (e) {
        session.selectedNodeId = container._id;
        saveSession(session);
        const msg = tr('events.builder.navigation.replies.could_not_open_item_editor', { error: e.message }, `Could not open item editor: ${e.message}`);
        if (interaction.deferred || interaction.replied) return interaction.followUp({ content: msg, flags: 64 });
        return interaction.reply({ content: msg, flags: 64 });
      }
    }
    if (action === 'ce_color_select') {
      const container = getSelectedContainer(session);
      if (!container) return interaction.reply({ content: tr('events.builder.navigation.replies.container_not_found', {}, 'The selected container could not be found.'), flags: 64 });
      const val = interaction.values[0];
      if (val === 'new') {
        session.selectedNodeId = container._id;
        session.containerEditorContainerId = container._id;
        saveSession(session);
        const modal = new ModalBuilder()
          .setCustomId(`bld:${session.id}:prop:ce_color_save`)
          .setTitle(tr('events.builder.navigation.modals.add_color_title', {}, 'New color'));
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('name')
              .setLabel(tr('events.builder.navigation.modals.color_name_label', {}, 'Color name'))
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(50)
              .setPlaceholder(tr('events.builder.navigation.modals.color_name_placeholder', {}, 'E.g. Eternal Purple'))
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('hex')
              .setLabel(tr('events.builder.navigation.modals.color_hex_label', {}, 'HEX code'))
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(7)
              .setPlaceholder(tr('events.builder.navigation.modals.color_hex_placeholder', {}, '#5865F2'))
          )
        );
        return interaction.showModal(modal);
      }
      if (val === 'discord_blue') {
        pushHistory(session);
        container.accent_color = 0x5865F2;
        session.selectedNodeId = container._id;
        session.containerEditorContainerId = container._id;
        saveSession(session);
        return interaction.update(buildContainerColorScreen(session, tr));
      }
      if (val === 'none') {
        pushHistory(session);
        container.accent_color = null;
        session.selectedNodeId = container._id;
        session.containerEditorContainerId = container._id;
        saveSession(session);
        return interaction.update(buildContainerColorScreen(session, tr));
      }
      if (val.startsWith('saved:')) {
        const id = val.slice('saved:'.length);
        const { getColorById } = require('../services/colors.service');
        const saved = getColorById(session.guildId, session.userId, id);
        if (!saved) return interaction.reply({ content: tr('events.builder.navigation.replies.color_not_found', {}, 'The saved color was not found.'), flags: 64 });
        pushHistory(session);
        container.accent_color = saved.color;
        session.selectedNodeId = container._id;
        session.containerEditorContainerId = container._id;
        saveSession(session);
        return interaction.update(buildContainerColorScreen(session, tr));
      }
      return interaction.reply({ content: tr('events.builder.navigation.replies.invalid_color_option', {}, 'Invalid color option.'), flags: 64 });
    }
    if (action === 'ce_add_item') {
      const type = interaction.values[0];
      const container = getSelectedContainer(session);
      if (!container) return interaction.reply({ content: tr('events.builder.navigation.replies.container_not_found', {}, 'The selected container could not be found.'), flags: 64 });
      const allowed = allowedChildTypes('container');
      if (!allowed.includes(type)) return interaction.reply({ content: tr('events.builder.navigation.replies.cannot_add_type', { type: type.replace(/_/g, ' ') }, `Cannot add ${type.replace(/_/g, ' ')} to a container.`), flags: 64 });
      const factory = COMPONENT_FACTORIES[type];
      if (!factory) return interaction.reply({ content: tr('events.builder.navigation.replies.unknown_component_type', {}, 'Unknown component type.'), flags: 64 });
      if (type === 'text_display') {
        session.selectedNodeId = container._id;
        session.containerEditorContainerId = container._id;
        saveSession(session);
        const modal = new ModalBuilder()
          .setCustomId(`bld:${session.id}:prop:ce_add_text_display`)
          .setTitle(tr('events.builder.navigation.modals.add_text_title', {}, 'Add Text Display'));
        modal.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('content')
            .setLabel(tr('events.builder.navigation.modals.text_label', {}, 'Text content'))
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(4000)
            .setPlaceholder(tr('events.builder.navigation.modals.text_placeholder', {}, 'Enter the text to add'))
        ));
        return interaction.showModal(modal);
      }
      pushHistory(session);
      const node = factory();
      container.components = container.components || [];
      container.components.push(node);
      session.selectedNodeId = container._id;
      session.containerEditorContainerId = container._id;
      saveSession(session);
      return interaction.update(buildContainerEditor(session, tr));
    }
    if (action === 'load_draft') {
      try {
        const draft = (draftService.getDraftFor ? draftService.getDraftFor(session.userId, session.guildId, interaction.values[0]) : draftService.getDraft(interaction.values[0]));
        if (!draft || draft.userId !== session.userId || draft.guildId !== session.guildId) return interaction.reply({ content: tr('events.builder.navigation.replies.draft_not_found', {}, 'Draft not found or not accessible in this server.'), flags: 64 });
        pushHistory(session);
        session.state = JSON.parse(JSON.stringify(draft.state));
        session.type = draft.state.type;
        session.draftId = draft.id;
        session.view = 'editor';
        saveSession(session);
        return interaction.update(currentEditor(session, tr));
      } catch (e) {
        return interaction.reply({ content: tr('events.builder.navigation.replies.failed_load_draft', { error: e.message }, `Failed to load draft: ${e.message}`), flags: 64 });
      }
    }
    if (action === 'delete_draft') {
      try { draftService.deleteDraft(session.userId, session.guildId, interaction.values[0]); }
      catch (e) { return interaction.reply({ content: tr('events.builder.navigation.replies.failed_delete_draft', { error: e.message }, `Failed to delete draft: ${e.message}`), flags: 64 }); }
      return interaction.update(buildDraftsList(session, tr));
    }
    if (action === 'load_template') {
      try {
        const tpl = (templateService.getTemplateFor ? templateService.getTemplateFor(session.userId, session.guildId, interaction.values[0]) : templateService.getTemplate(interaction.values[0]));
        if (!tpl || tpl.userId !== session.userId || tpl.guildId !== session.guildId) return interaction.reply({ content: tr('events.builder.navigation.replies.template_not_found', {}, 'Template not found or not accessible in this server.'), flags: 64 });
        pushHistory(session);
        session.state = JSON.parse(JSON.stringify(tpl.state));
        session.type = tpl.state.type;
        session.templateId = tpl.id;
        session.view = 'editor';
        saveSession(session);
        return interaction.update(currentEditor(session, tr));
      } catch (e) {
        return interaction.reply({ content: tr('events.builder.navigation.replies.failed_load_template', { error: e.message }, `Failed to load template: ${e.message}`), flags: 64 });
      }
    }
    if (action === 'dup_template') {
      try { templateService.duplicateTemplate(session.userId, session.guildId, interaction.values[0]); }
      catch (e) { return interaction.reply({ content: tr('events.builder.navigation.replies.failed_duplicate_template', { error: e.message }, `Failed to duplicate template: ${e.message}`), flags: 64 }); }
      return interaction.update(buildTemplatesList(session, tr));
    }
    if (action === 'delete_template') {
      try { templateService.deleteTemplate(session.userId, session.guildId, interaction.values[0]); }
      catch (e) { return interaction.reply({ content: tr('events.builder.navigation.replies.failed_delete_template', { error: e.message }, `Failed to delete template: ${e.message}`), flags: 64 }); }
      return interaction.update(buildTemplatesList(session, tr));
    }
  }

  if (!interaction.isButton()) return;

  switch (action) {
    case 'select_embed': {
      if (!session.state || session.state.type !== 'embed') session.state = createDefaultEmbedState();
      else normalizeEmbedState(session.state);
      session.type = 'embed';
      session.view = 'embed_home';
      session.embedSection = session.embedSection || 'basic';
      session.containerEditorContainerId = null;
      saveSession(session);
      return interaction.update(buildEmbedMainPanel(session, tr));
    }
    case 'embed_select': {
      if (session.state?.type !== 'embed') session.state = createDefaultEmbedState();
      normalizeEmbedState(session.state);
      const idx = parseInt(interaction.values[0], 10);
      if (Number.isNaN(idx) || idx < 0 || idx >= session.state.embeds.length) {
        return interaction.reply({ content: tr('events.builder.navigation.replies.embed_not_found', {}, 'The selected embed could not be found.'), flags: 64 });
      }
      session.state.selectedEmbedIndex = idx;
      session.state.embed = session.state.embeds[idx];
      session.type = 'embed';
      session.view = 'editor';
      saveSession(session);
      return interaction.update(buildEmbedEditor(session, tr));
    }
    case 'add_embed_main': {
      if (session.state?.type !== 'embed') session.state = createDefaultEmbedState();
      normalizeEmbedState(session.state);
      if (session.state.embeds.length >= 10) {
        return interaction.reply({ content: tr('events.builder.navigation.replies.max_embeds', {}, 'A message can have at most 10 embeds.'), flags: 64 });
      }
      pushHistory(session);
      const e = createEmptyEmbed();
      session.state.embeds.push(e);
      session.state.selectedEmbedIndex = session.state.embeds.length - 1;
      session.state.embed = e;
      session.type = 'embed';
      session.view = 'editor';
      saveSession(session);
      return interaction.update(buildEmbedEditor(session, tr));
    }
    case 'embed_back_panel': {
      if (session.state?.type !== 'embed') session.state = createDefaultEmbedState();
      normalizeEmbedState(session.state);
      session.view = 'embed_home';
      saveSession(session);
      return interaction.update(buildEmbedMainPanel(session, tr));
    }
    case 'embed_add_button': {
      return interaction.reply({ content: tr('events.builder.navigation.replies.embed_buttons_unavailable', {}, 'Adding message buttons is not available in the Embed Builder. Use the Components V2 Builder for button components.'), flags: 64 });
    }
    case 'select_cv2': {
      if (!session.state || session.state.type !== 'components_v2' || !Array.isArray(session.state.root)) {
        session.state = createDefaultComponentsV2State();
      }
      session.type = 'components_v2';
      session.view = 'home';
      session.containerEditorContainerId = null;
      if (!getContainers(session).length) session.state.root = [createContainer()];
      session.selectedNodeId = session.selectedNodeId && getContainers(session).some(c => c._id === session.selectedNodeId)
        ? session.selectedNodeId
        : (getContainers(session)[0]?._id || null);
      saveSession(session);
      return interaction.update(buildMainPanel(session, tr));
    }
    case 'back_selection': {
      session.view = 'selection';
      session.containerEditorContainerId = null;
      saveSession(session);
      return interaction.update(buildSelectionScreen(session, tr));
    }
    case 'home':
      session.containerEditorContainerId = null;
      if (session.state && session.state.type === 'embed') {
        session.view = 'embed_home';
        normalizeEmbedState(session.state);
        saveSession(session);
        return interaction.update(buildEmbedMainPanel(session, tr));
      }
      session.view = 'home';
      saveSession(session);
      return interaction.update(buildMainPanel(session, tr));
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
        return interaction.update(buildContainerEditor(session, tr));
      }
      const containersNow = getContainers(session);
      if (!containersNow.find(x => x._id === session.selectedNodeId)) {
        const prev = existingContainers.find(x => containersNow.some(y => y._id === x._id));
        if (prev) session.selectedNodeId = prev._id;
      }
      session.view = 'home';
      session.containerEditorContainerId = null;
      saveSession(session);
      return interaction.update(buildMainPanel(session, tr));
    }
    case 'ce_back': {
      session.view = 'home';
      session.containerEditorContainerId = null;
      saveSession(session);
      return interaction.update(buildMainPanel(session, tr));
    }
    case 'ce_color': {
      const container = getSelectedContainer(session);
      if (!container) return interaction.reply({ content: tr('events.builder.navigation.replies.container_not_found', {}, 'The selected container could not be found.'), flags: 64 });
      session.containerEditorContainerId = container._id;
      session.selectedNodeId = container._id;
      saveSession(session);
      return interaction.update(buildContainerColorScreen(session, tr));
    }
    case 'ce_color_back': {
      const container = getSelectedContainer(session);
      if (!container) return interaction.update(buildMainPanel(session, tr));
      session.containerEditorContainerId = container._id;
      session.selectedNodeId = container._id;
      saveSession(session);
      return interaction.update(buildContainerEditor(session, tr));
    }
    case 'ce_delete': {
      const container = getSelectedContainer(session);
      if (!container) return interaction.reply({ content: tr('events.builder.navigation.replies.container_not_found', {}, 'The selected container could not be found.'), flags: 64 });
      if (getContainers(session).length <= 1) {
        return interaction.reply({ content: tr('events.builder.navigation.replies.delete_container_need_more', {}, 'You need more than one container to delete.'), flags: 64 });
      }
      return interaction.update(buildContainerDeleteConfirm(session, tr));
    }
    case 'ce_delete_cancel': {
      const container = getSelectedContainer(session);
      if (!container) return interaction.update(require('./container-editor').buildContainerEditorClosed(tr));
      return interaction.update(buildContainerEditor(session, tr));
    }
    case 'ce_delete_confirm': {
      const container = getSelectedContainer(session);
      if (!container) return interaction.reply({ content: tr('events.builder.navigation.replies.container_not_found', {}, 'The selected container could not be found.'), flags: 64 });
      if (getContainers(session).length <= 1) {
        session.selectedNodeId = container._id;
        session.containerEditorContainerId = container._id;
        saveSession(session);
        return interaction.update(buildContainerEditor(session, tr));
      }
      pushHistory(session);
      session.state.root = (session.state.root || []).filter(c => c._id !== container._id);
      const remaining = getContainers(session);
      session.selectedNodeId = remaining[0]?._id || null;
      session.containerEditorContainerId = null;
      session.view = 'home';
      saveSession(session);
      return interaction.update(buildMainPanel(session, tr));
    }
    case 'json_editor': {
      const { getDefaultJsonTemplateString, isPristineDefaultState } = require('../utils/json-document');
      let defaultValue = getDefaultJsonTemplateString();
      if (!isPristineDefaultState(session)) {
        try { defaultValue = JSON.stringify(session.state, null, 2); } catch { defaultValue = getDefaultJsonTemplateString(); }
      }
      if (defaultValue.length > 4000) defaultValue = defaultValue.slice(0, 4000);

      const modal = new ModalBuilder().setCustomId(`bld:${session.id}:prop:json_import`).setTitle(tr('events.builder.navigation.json.modal_title', {}, 'JSON Editor'));
      const text = new TextInputBuilder()
        .setCustomId('json')
        .setLabel(tr('events.builder.navigation.json.label', {}, 'Builder JSON document'))
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(4000)
        .setValue(defaultValue)
        .setPlaceholder(tr('events.builder.navigation.json.placeholder', {}, 'Paste a complete Builder document JSON'));
      const fileUpload = new FileUploadBuilder().setCustomId('json_file').setRequired(false).setMinValues(0).setMaxValues(1);
      const fileLabel = new LabelBuilder()
        .setLabel(tr('events.builder.navigation.json.file_label', {}, 'File (optional)'))
        .setDescription(tr('events.builder.navigation.json.file_description', {}, 'A .txt or .json file with the JSON. If attached, it replaces the text field.'))
        .setFileUploadComponent(fileUpload);
      modal.addComponents(new ActionRowBuilder().addComponents(text));
      modal.addLabelComponents(fileLabel);
      return interaction.showModal(modal);
    }
    case 'send_custom': {
      const { buildPublishMenu } = require('./publishing');
      session.view = 'publish';
      saveSession(session);
      return interaction.update(buildPublishMenu(session, tr));
    }
    case 'quick_send': {
      const validation = session.state.type === 'embed' ? validateEmbedState(session.state, tr) : validateComponentsV2State(session.state, tr);
      if (!validation.valid) {
        const errs = validation.errors.slice(0, 5).map(e => `- ${e}`).join('\n');
        return interaction.reply({ content: tr('events.builder.navigation.replies.quick_send_validation', { errors: errs }, `Cannot quick send: validation failed.\n${errs}`).slice(0, 2000), flags: 64 });
      }
      try {
        const payload = buildPayloadForSession(session);
        if (session.editingMessage) {
          const channel = await interaction.client.channels.fetch(session.editingMessage.channelId);
          const target = await channel.messages.fetch(session.editingMessage.messageId);
          const permErr = canSendToChannel(channel, interaction.client.user);
          if (permErr) return interaction.reply({ content: tr('events.builder.navigation.replies.quick_send_edit_perm', { error: permErr }, `Cannot quick send (edit): ${permErr}`), flags: 64 });
          const msg = await editExisting(target, payload);
          if (session.state.type === 'components_v2') { try { require('../utils/published-runtime').collectActionsFromState(session.state, msg.id, { ownerId: interaction.user.id, guildId: interaction.guildId, channelId: channel.id }); } catch {} }
          return interaction.reply({ content: tr('events.builder.navigation.replies.quick_send_edited', { url: msg.url }, `✅ Message edited (quick send): ${msg.url}`), flags: 64 });
        }
        const targetChannelId = session.channelId || interaction.channelId;
        if (!targetChannelId) return interaction.reply({ content: tr('events.builder.navigation.replies.quick_send_no_channel', {}, 'Quick send could not determine the target channel for this session.'), flags: 64 });
        const channel = await interaction.client.channels.fetch(targetChannelId);
        const permErr = canSendToChannel(channel, interaction.client.user);
        if (permErr) return interaction.reply({ content: tr('events.builder.navigation.replies.quick_send_perm', { error: permErr }, `Cannot quick send: ${permErr}`), flags: 64 });
        const msg = await publishNew(channel, payload);
        if (session.state.type === 'components_v2') { try { require('../utils/published-runtime').collectActionsFromState(session.state, msg.id, { ownerId: interaction.user.id, guildId: interaction.guildId, channelId: channel.id }); } catch {} }
        return interaction.reply({ content: tr('events.builder.navigation.replies.quick_send_published', { url: msg.url }, `✅ Published (quick send): ${msg.url}`), flags: 64 });
      } catch (e) {
        return interaction.reply({ content: tr('events.builder.navigation.replies.quick_send_failed', { error: e.message || tr('events.builder.navigation.replies.unknown_error', {}, 'Unknown error') }, `Quick send failed: ${e.message || 'Unknown error'}`), flags: 64 });
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
      return interaction.update(buildEmbedEditor(session, tr));
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
      return interaction.update(buildCv2Editor(session, tr));
    case 'continue':
      session.view = 'editor';
      saveSession(session);
      return interaction.update(currentEditor(session, tr));
    case 'open_drafts':
      return interaction.update(buildDraftsList(session, tr));
    case 'open_templates':
      return interaction.update(buildTemplatesList(session, tr));
    case 'edit_existing':
      return interaction.update(buildEditExisting(session, tr));
    case 'save_menu':
      return interaction.update(buildSaveMenu(session, tr));
    case 'publish_menu': {
      const { buildPublishMenu } = require('./publishing');
      session.view = 'publish';
      saveSession(session);
      return interaction.update(buildPublishMenu(session, tr));
    }
    case 'back_editor':
      return interaction.update(currentEditor(session, tr));
    case 'undo':
      if (!popHistory(session)) return interaction.reply({ content: tr('events.builder.navigation.replies.nothing_to_undo', {}, 'Nothing to undo.'), flags: 64 });
      saveSession(session);
      if (session.view === 'selection') return interaction.update(buildSelectionScreen(session, tr));
      if (session.view === 'embed_home') return interaction.update(buildEmbedMainPanel(session, tr));
      return interaction.update(session.view === 'home' ? buildMainPanel(session, tr) : currentEditor(session, tr));
    case 'preview':
      try {
        let payload;
        if (session.state.type === 'embed') payload = toPublishPayload(buildEmbedPayload(session.state), 'embed');
        else payload = toPublishPayload(buildComponentsV2Payload(session.state), 'components_v2');
        if (session.state.type === 'components_v2') {
          await interaction.reply({ content: tr('events.builder.navigation.replies.preview_cv2', {}, 'Preview (Components V2) — editing controls remain in the builder message.'), ...payload, flags: 64 });
        } else {
          await interaction.reply({ content: session.state.content ? tr('events.builder.navigation.replies.preview_content_prefix', { content: session.state.content.slice(0, 200) }, `Content preview: ${session.state.content.slice(0, 200)}`) : tr('events.builder.navigation.replies.preview_embed_note', {}, 'Preview — editing controls remain in the builder message.'), embeds: payload.embeds, components: [], flags: 64 });
        }
      } catch (e) {
        return interaction.reply({ content: tr('events.builder.navigation.replies.preview_failed', { error: e.message }, `Preview failed: ${e.message}`), flags: 64 });
      }
      return;
    case 'save_draft': {
      try {
        const draft = draftService.saveDraft(session.userId, session.guildId, session.state, session.draftId);
        session.draftId = draft.id;
        saveSession(session);
        let note = '';
        const status = draftService.getLoadStatus ? draftService.getLoadStatus() : null;
        if (status && status.recovered) {
          const backup = status.backup ? tr('events.builder.navigation.replies.draft_storage_backup_to', { backup: status.backup }, ` to ${status.backup}`) : '';
          note = tr('events.builder.navigation.replies.draft_storage_warning', { backup }, `\nWarning: previous draft storage was corrupted and backed up${backup}.`);
        }
        return interaction.reply({ content: tr('events.builder.navigation.replies.draft_saved', { name: draft.name, id: draft.id, note }, `✅ Draft saved: **${draft.name}** (${draft.id})${note}`), flags: 64 });
      } catch (e) {
        return interaction.reply({ content: tr('events.builder.navigation.replies.failed_save_draft', { error: e.message }, `Failed to save draft: ${e.message}`), flags: 64 });
      }
    }
    case 'save_template': {
      const modal = new ModalBuilder().setCustomId(`bld:${session.id}:prop:tpl_name`).setTitle(tr('events.builder.navigation.modals.save_template_title', {}, 'Save Template'));
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('name').setLabel(tr('events.builder.navigation.modals.template_name_label', {}, 'Template name')).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80)
      ));
      return interaction.showModal(modal);
    }
    case 'embed_field_tools': {
      if (session.state?.type === 'embed') normalizeEmbedState(session.state);
      const e = session.state?.type === 'embed' ? getSelectedEmbed(session.state) : (session.state.embed || {});
      const fields = (e && e.fields) || [];
      const desc = fields.length ? fields.map((f, i) => `${i + 1}. ${String(f.name || tr('events.builder.navigation.field_tools.unnamed', {}, '(unnamed)')).slice(0, 80)}`).join('\n').slice(0, 4000) : tr('events.builder.navigation.field_tools.empty', {}, 'No fields yet. Use "Add Field" to create one.');
      const info = infoContainer(tr('events.builder.navigation.field_tools.title', {}, 'Field Tools'), desc);
      const opts = fields.map((f, i) => ({ label: `${i + 1}. ${String(f.name || tr('events.builder.navigation.field_tools.field_fallback', {}, 'Field')).slice(0, 90)}`.slice(0, 100), value: String(i) })).slice(0, 25);
      if (!opts.length) opts.push({ label: tr('events.builder.navigation.field_tools.no_fields_option', {}, 'No fields'), value: 'none' });
      const components = [
        info,
        new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`bld:${session.id}:prop:field_select`).setPlaceholder(tr('events.builder.navigation.field_tools.select_placeholder', {}, 'Select field')).addOptions(opts)),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`bld:${session.id}:prop:field_edit`).setLabel(tr('events.builder.navigation.field_tools.edit', {}, 'Edit')).setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`bld:${session.id}:prop:field_remove`).setLabel(tr('events.builder.navigation.field_tools.remove', {}, 'Remove')).setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`bld:${session.id}:prop:field_dup`).setLabel(tr('events.builder.navigation.field_tools.duplicate', {}, 'Duplicate')).setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`bld:${session.id}:prop:embed_add_field`).setLabel(tr('events.builder.navigation.field_tools.add_field', {}, 'Add Field')).setStyle(ButtonStyle.Secondary),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`bld:${session.id}:prop:field_up`).setLabel(tr('events.builder.navigation.field_tools.move_up', {}, 'Move Up')).setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`bld:${session.id}:prop:field_down`).setLabel(tr('events.builder.navigation.field_tools.move_down', {}, 'Move Down')).setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`bld:${session.id}:nav:back_editor`).setLabel(tr('events.builder.navigation.field_tools.back', {}, 'Back')).setStyle(ButtonStyle.Secondary),
        )
      ];
      return interaction.update(cv2Screen(components));
    }
    case 'export_json': {
      try {
        const json = JSON.stringify(session.state, null, 2);
        const buffer = Buffer.from(json, 'utf8');
        return interaction.reply({
          content: tr('events.builder.navigation.replies.export_success', {}, 'Exported the current builder state as JSON.'),
          files: [{ attachment: buffer, name: 'builder-state.json' }],
          flags: 64
        });
      } catch (e) {
        return interaction.reply({ content: tr('events.builder.navigation.replies.export_failed', { error: e.message }, `Export failed: ${e.message}`), flags: 64 });
      }
    }
    default:
      return interaction.reply({ content: tr('events.builder.navigation.replies.unhandled_navigation', {}, 'Unhandled navigation action.'), flags: 64 });
  }
}

module.exports = { handleNavigation, buildHome, buildMainPanel, buildEmbedEditor, buildCv2Editor, currentEditor, buildContainerEditor, buildSelectionScreen, buildEmbedMainPanel, buildSaveMenu, buildDraftsList, buildTemplatesList, buildEditExisting };
