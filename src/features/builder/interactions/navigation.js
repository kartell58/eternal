const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType
} = require('discord.js');
const { requireSession, createSession, saveSession, pushHistory, popHistory } = require('../services/session.service');
const { createDefaultEmbedState } = require('../schemas/embed.schema');
const { createDefaultComponentsV2State } = require('../schemas/components-v2.schema');
const draftService = require('../services/draft.service');
const templateService = require('../services/template.service');
const { buildEmbedPayload } = require('../builders/embed.builder');
const { buildComponentsV2Payload } = require('../builders/components-v2.builder');
const { toPublishPayload } = require('../services/publisher.service');

function sid(session) { return session.id; }

function buildHome(session) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Eternal Builder')
    .setDescription('Create, edit, preview, save, and publish Discord messages.\n\nChoose what you want to do:')
    .addFields(
      { name: 'Session', value: `Type: ${session.type === 'embed' ? 'Embed' : 'Components V2'}\nView: ${session.view}`, inline: true }
    );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:new_embed`).setLabel('Create Embed').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:new_cv2`).setLabel('Create Components V2').setStyle(ButtonStyle.Primary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:open_drafts`).setLabel('Open Saved Draft').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:open_templates`).setLabel('Open Saved Template').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:edit_existing`).setLabel('Edit Existing Message').setStyle(ButtonStyle.Secondary),
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:continue`).setLabel('Continue Current').setStyle(ButtonStyle.Success),
  );
  return { embeds: [embed], components: [row, row2, row3] };
}

function summarizeEmbed(state) {
  const e = state.embed || {};
  const parts = [];
  if (e.title) parts.push(`Title: ${e.title.slice(0, 40)}`);
  if (e.description) parts.push(`Desc: ${String(e.description).slice(0, 60)}`);
  parts.push(`Fields: ${(e.fields || []).length}`);
  return parts.join('\n') || 'Empty embed';
}

function buildEmbedEditor(session) {
  const e = session.state.embed || {};
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Embed Builder')
    .setDescription(summarizeEmbed(session.state))
    .addFields(
      { name: 'Section', value: session.embedSection || 'basic', inline: true },
      { name: 'Content', value: (session.state.content || '(none)').slice(0, 100), inline: true }
    );

  const nav = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`bld:${sid(session)}:nav:embed_section`)
      .setPlaceholder('Select section to edit')
      .addOptions([
        { label: 'Basic (title, desc, color, url)', value: 'basic' },
        { label: 'Author', value: 'author' },
        { label: 'Footer & Timestamp', value: 'footer' },
        { label: 'Images (thumbnail, image)', value: 'images' },
        { label: 'Fields', value: 'fields' },
        { label: 'Message Content', value: 'content' },
      ])
  );

  const editRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:prop:embed_edit`).setLabel('Edit Section').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:prop:embed_add_field`).setLabel('Add Field').setStyle(ButtonStyle.Secondary).setDisabled(session.embedSection !== 'fields'),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:embed_field_tools`).setLabel('Field Tools').setStyle(ButtonStyle.Secondary).setDisabled(session.embedSection !== 'fields'),
  );

  const actions = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:preview`).setLabel('Preview').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:save_menu`).setLabel('Save').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:publish_menu`).setLabel('Publish').setStyle(ButtonStyle.Primary),
  );
  const back = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:home`).setLabel('Home').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:undo`).setLabel('Back/Undo').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [nav, editRow, actions, back] };
}

function listNodes(nodes, depth = 0, out = []) {
  for (const n of (nodes || [])) {
    const indent = '  '.repeat(depth);
    const label = `${indent}${n.type} [${n._id}]${n.label ? ` (${n.label})` : ''}${n.content ? `: ${String(n.content).slice(0,20)}` : ''}`;
    out.push({ label: label.slice(0, 100), value: n._id });
    if (n.components) listNodes(n.components, depth + 1, out);
  }
  return out;
}

function buildCv2Editor(session) {
  const options = listNodes(session.state.root).slice(0, 25);
  if (options.length === 0) options.push({ label: 'No components', value: 'none' });
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Components V2 Builder')
    .setDescription('Select a node to edit, add children, remove, duplicate, or reorder. Top-level items are Containers.')
    .addFields({ name: 'Selected', value: session.selectedNodeId || '(none)', inline: true });

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(`bld:${sid(session)}:nav:cv2_select`).setPlaceholder('Select component node').addOptions(options)
  );
  const ops = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:cmp:add`).setLabel('Add Child').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:cmp:remove`).setLabel('Remove').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:cmp:dup`).setLabel('Duplicate').setStyle(ButtonStyle.Secondary),
  );
  const ops2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:cmp:up`).setLabel('Move Up').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:cmp:down`).setLabel('Move Down').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:prop:cv2_edit`).setLabel('Edit Props').setStyle(ButtonStyle.Primary),
  );
  const actions = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:preview`).setLabel('Preview').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:save_menu`).setLabel('Save').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:publish_menu`).setLabel('Publish').setStyle(ButtonStyle.Primary),
  );
  const back = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:home`).setLabel('Home').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:undo`).setLabel('Back/Undo').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:cmp:add_root`).setLabel('Add Container').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [selectRow, ops, ops2, actions, back] };
}

function buildSaveMenu(session) {
  const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('Save').setDescription('Save your current work as a draft or template.');
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:save_draft`).setLabel('Save Draft').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:save_template`).setLabel('Save Template').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:back_editor`).setLabel('Back').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row] };
}

function buildDraftsList(session) {
  const drafts = draftService.listDrafts(session.userId, session.guildId).slice(0, 25);
  const status = draftService.getLoadStatus ? draftService.getLoadStatus() : null;
  let desc = drafts.length ? 'Select a draft to open.' : 'No drafts saved.';
  if (status && status.recovered) desc += `

Warning: previous draft storage was corrupted and backed up${status.backup ? ` to ${status.backup}` : ''}.`;
  const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('Saved Drafts').setDescription(desc.slice(0, 4000));
  const components = [];
  if (drafts.length) {
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(`bld:${sid(session)}:nav:load_draft`).setPlaceholder('Select draft').addOptions(
        drafts.map(d => ({ label: d.name.slice(0, 100), value: d.id, description: `${d.state.type} - ${new Date(d.updatedAt).toLocaleString()}`.slice(0, 100) }))
      )
    ));
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(`bld:${sid(session)}:nav:delete_draft`).setPlaceholder('Delete draft...').addOptions(
        drafts.map(d => ({ label: `Delete: ${d.name}`.slice(0, 100), value: d.id }))
      )
    ));
  }
  components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:home`).setLabel('Back').setStyle(ButtonStyle.Secondary)));
  return { embeds: [embed], components };
}

function buildTemplatesList(session) {
  const templates = templateService.listTemplates(session.userId, session.guildId).slice(0, 25);
  const status = templateService.getLoadStatus ? templateService.getLoadStatus() : null;
  let desc = templates.length ? 'Open, duplicate, or delete templates.' : 'No templates saved.';
  if (status && status.recovered) desc += `

Warning: previous template storage was corrupted and backed up${status.backup ? ` to ${status.backup}` : ''}.`;
  const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('Saved Templates').setDescription(desc.slice(0, 4000));
  const components = [];
  if (templates.length) {
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(`bld:${sid(session)}:nav:load_template`).setPlaceholder('Open template').addOptions(
        templates.map(t => ({ label: t.name.slice(0, 100), value: t.id, description: `${t.state.type}` }))
      )
    ));
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(`bld:${sid(session)}:nav:dup_template`).setPlaceholder('Duplicate template...').addOptions(
        templates.map(t => ({ label: `Duplicate: ${t.name}`.slice(0, 100), value: t.id }))
      )
    ));
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(`bld:${sid(session)}:nav:delete_template`).setPlaceholder('Delete template...').addOptions(
        templates.map(t => ({ label: `Delete: ${t.name}`.slice(0, 100), value: t.id }))
      )
    ));
  }
  components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:home`).setLabel('Back').setStyle(ButtonStyle.Secondary)));
  return { embeds: [embed], components };
}

function buildEditExisting(session) {
  const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('Edit Existing Message')
    .setDescription('Provide a message ID and channel to load a bot-authored message for editing.\n\nNote: Only messages sent by this bot can be edited. Complex Components V2 messages may not be fully reconstructable into the visual editor; in that case you can replace them by building a new message and publishing as an edit.');
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:prop:edit_existing`).setLabel('Enter Message Info').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:home`).setLabel('Back').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row] };
}

function currentEditor(session) {
  return session.state.type === 'embed' ? buildEmbedEditor(session) : buildCv2Editor(session);
}

async function handleNavigation(interaction, { sid }) {
  const { session, error } = requireSession(sid, interaction.user.id);
  if (error) {
    const payload = { content: error, flags: 64 };
    if (interaction.deferred || interaction.replied) return interaction.followUp(payload);
    return interaction.reply(payload);
  }

  const action = interaction.customId.split(':')[3];

  if (interaction.isStringSelectMenu()) {
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
      return interaction.update(buildHome(session));
    case 'new_embed':
      pushHistory(session);
      session.state = createDefaultEmbedState();
      session.type = 'embed';
      session.draftId = null;
      session.view = 'editor';
      saveSession(session);
      return interaction.update(buildEmbedEditor(session));
    case 'new_cv2':
      pushHistory(session);
      session.state = createDefaultComponentsV2State();
      session.type = 'components_v2';
      session.selectedNodeId = session.state.root[0]?._id || null;
      session.draftId = null;
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
    case 'publish_menu':
      // delegate to publishing view via update from publishing module
      const { buildPublishMenu } = require('./publishing');
      return interaction.update(buildPublishMenu(session));
    case 'back_editor':
      return interaction.update(currentEditor(session));
    case 'undo':
      if (!popHistory(session)) return interaction.reply({ content: 'Nothing to undo.', flags: 64 });
      saveSession(session);
      return interaction.update(currentEditor(session));
    case 'preview':
      try {
        let payload;
        if (session.state.type === 'embed') payload = toPublishPayload(buildEmbedPayload(session.state), 'embed');
        else payload = toPublishPayload(buildComponentsV2Payload(session.state), 'components_v2');
        // show preview as ephemeral follow-up (cannot always perfectly mirror inside editor)
        if (session.state.type === 'components_v2') {
          await interaction.reply({ content: 'Preview (Components V2):', ...payload, flags: 64 });
        } else {
          await interaction.reply({ content: session.state.content ? `Content: ${session.state.content.slice(0,200)}` : 'Preview:', embeds: payload.embeds, components: [], flags: 64 });
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
        if (status && status.recovered) note = `
Warning: previous draft storage was corrupted and backed up${status.backup ? ` to ${status.backup}` : ''}.`;
        return interaction.reply({ content: `Draft saved: **${draft.name}** (${draft.id})${note}`, flags: 64 });
      } catch (e) {
        return interaction.reply({ content: `Failed to save draft: ${e.message}`, flags: 64 });
      }
    }
    case 'save_template': {
      // ask for name via modal
      const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
      const modal = new ModalBuilder().setCustomId(`bld:${session.id}:prop:tpl_name`).setTitle('Save Template');
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('name').setLabel('Template name').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80)
      ));
      return interaction.showModal(modal);
    }
    case 'embed_field_tools': {
      const fields = session.state.embed.fields || [];
      const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('Field Tools').setDescription(fields.length ? fields.map((f,i)=>`${i+1}. ${f.name}`).join('\n').slice(0, 4000) : 'No fields.');
      const opts = fields.map((f, i) => ({ label: `${i+1}. ${String(f.name).slice(0,90)}`.slice(0,100), value: String(i) })).slice(0,25);
      if (!opts.length) opts.push({ label: 'No fields', value: 'none' });
      const components = [
        new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`bld:${sid}:prop:field_select`).setPlaceholder('Select field').addOptions(opts)),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`bld:${sid}:prop:field_edit`).setLabel('Edit').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`bld:${sid}:prop:field_remove`).setLabel('Remove').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`bld:${sid}:prop:field_dup`).setLabel('Duplicate').setStyle(ButtonStyle.Secondary),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`bld:${sid}:prop:field_up`).setLabel('Move Up').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`bld:${sid}:prop:field_down`).setLabel('Move Down').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`bld:${sid}:nav:back_editor`).setLabel('Back').setStyle(ButtonStyle.Secondary),
        )
      ];
      return interaction.update({ embeds: [embed], components });
    }
    default:
      return interaction.reply({ content: 'Unhandled navigation action.', flags: 64 });
  }
}

module.exports = { handleNavigation, buildHome, buildEmbedEditor, buildCv2Editor, currentEditor };
