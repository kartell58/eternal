const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { requireSession, pushHistory, saveSession } = require('../services/session.service');
const { findParentInfo } = require('../utils/component-tree');
const templateService = require('../services/template.service');
const { buildEmbedEditor, buildCv2Editor } = require('./navigation');
const { parseColor } = require('../utils/validator');

function tid(s, a, extra = '') { return `bld:${s.id}:prop:${a}${extra ? ':' + extra : ''}`; }

function modalField(id, label, style, value, required = false, opts = {}) {
  const input = new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label.slice(0, 45))
    .setStyle(style)
    .setRequired(required);
  if (value != null && value !== '') input.setValue(String(value).slice(0, 4000));
  if (opts.placeholder) input.setPlaceholder(opts.placeholder.slice(0, 100));
  if (opts.min) input.setMinLength(opts.min);
  if (opts.max) input.setMaxLength(opts.max);
  return input;
}

function showEmbedModal(interaction, session) {
  const section = session.embedSection || 'basic';
  const e = session.state.embed || {};
  const modal = new ModalBuilder().setCustomId(tid(session, 'embed_modal', section)).setTitle(`Edit Embed: ${section}`.slice(0, 45));
  if (section === 'basic') {
    modal.addComponents(
      new ActionRowBuilder().addComponents(modalField('title', 'Title', TextInputStyle.Short, e.title || '', false, { max: 256 })),
      new ActionRowBuilder().addComponents(modalField('url', 'Title URL', TextInputStyle.Short, e.url || '', false)),
      new ActionRowBuilder().addComponents(modalField('description', 'Description', TextInputStyle.Paragraph, e.description || '', false, { max: 4000 })),
      new ActionRowBuilder().addComponents(modalField('color', 'Color (hex, e.g. #5865F2)', TextInputStyle.Short, e.color ? (typeof e.color === 'number' ? '#' + e.color.toString(16).padStart(6,'0') : e.color) : '', false)),
    );
  } else if (section === 'author') {
    modal.addComponents(
      new ActionRowBuilder().addComponents(modalField('name', 'Author name', TextInputStyle.Short, e.author?.name || '', false, { max: 256 })),
      new ActionRowBuilder().addComponents(modalField('url', 'Author URL', TextInputStyle.Short, e.author?.url || '', false)),
      new ActionRowBuilder().addComponents(modalField('icon_url', 'Author icon URL', TextInputStyle.Short, e.author?.icon_url || '', false)),
    );
  } else if (section === 'footer') {
    modal.addComponents(
      new ActionRowBuilder().addComponents(modalField('text', 'Footer text', TextInputStyle.Paragraph, e.footer?.text || '', false, { max: 2048 })),
      new ActionRowBuilder().addComponents(modalField('icon_url', 'Footer icon URL', TextInputStyle.Short, e.footer?.icon_url || '', false)),
      new ActionRowBuilder().addComponents(modalField('timestamp', 'Timestamp (ISO or "now" or empty)', TextInputStyle.Short, e.timestamp || '', false)),
    );
  } else if (section === 'images') {
    modal.addComponents(
      new ActionRowBuilder().addComponents(modalField('thumbnail', 'Thumbnail URL', TextInputStyle.Short, e.thumbnail?.url || '', false)),
      new ActionRowBuilder().addComponents(modalField('image', 'Main image URL', TextInputStyle.Short, e.image?.url || '', false)),
    );
  } else if (section === 'content') {
    modal.addComponents(
      new ActionRowBuilder().addComponents(modalField('content', 'Message content', TextInputStyle.Paragraph, session.state.content || '', false, { max: 2000 })),
    );
  } else {
    return interaction.reply({ content: 'No editable modal for this section. Use Field Tools for fields.', flags: 64 });
  }
  return interaction.showModal(modal);
}

function showAddFieldModal(interaction, session) {
  const modal = new ModalBuilder().setCustomId(tid(session, 'field_add')).setTitle('Add Field');
  modal.addComponents(
    new ActionRowBuilder().addComponents(modalField('name', 'Field name', TextInputStyle.Short, '', true, { max: 256 })),
    new ActionRowBuilder().addComponents(modalField('value', 'Field value', TextInputStyle.Paragraph, '', true, { max: 1024 })),
    new ActionRowBuilder().addComponents(modalField('inline', 'Inline? (yes/no)', TextInputStyle.Short, 'no', false)),
  );
  return interaction.showModal(modal);
}

function showCv2EditModal(interaction, session) {
  const id = session.selectedNodeId;
  if (!id) return interaction.reply({ content: 'Select a component first.', flags: 64 });
  const info = findParentInfo(session.state.root, id);
  if (!info) return interaction.reply({ content: 'Selected node not found.', flags: 64 });
  const node = info.node;
  const modal = new ModalBuilder().setCustomId(tid(session, 'cv2_modal', node.type)).setTitle(`Edit ${node.type}`.slice(0, 45));

  if (node.type === 'text_display') {
    modal.addComponents(new ActionRowBuilder().addComponents(modalField('content', 'Content', TextInputStyle.Paragraph, node.content || '', true, { max: 4000 })));
  } else if (node.type === 'container') {
    modal.addComponents(
      new ActionRowBuilder().addComponents(modalField('accent_color', 'Accent color (hex or empty)', TextInputStyle.Short, node.accent_color != null ? '#' + Number(node.accent_color).toString(16).padStart(6,'0') : '', false)),
      new ActionRowBuilder().addComponents(modalField('spoiler', 'Spoiler? (yes/no)', TextInputStyle.Short, node.spoiler ? 'yes' : 'no', false)),
    );
  } else if (node.type === 'button') {
    modal.addComponents(
      new ActionRowBuilder().addComponents(modalField('label', 'Label', TextInputStyle.Short, node.label || '', false, { max: 80 })),
      new ActionRowBuilder().addComponents(modalField('style', 'Style (1-5 or primary/secondary/success/danger/link)', TextInputStyle.Short, String(node.style || 1), true)),
      new ActionRowBuilder().addComponents(modalField('url_or_id', 'URL (link) or custom_id', TextInputStyle.Short, node.style == 5 || node.style === 'link' ? (node.url||'') : (node.custom_id||''), false)),
      new ActionRowBuilder().addComponents(modalField('emoji_disabled', 'Emoji,Disabled (e.g. 🔥,no or <:n:1>,yes)', TextInputStyle.Short, `${node.emoji||''},${node.disabled?'yes':'no'}`, false)),
      new ActionRowBuilder().addComponents(modalField('action_resp', 'Action type|response for non-link (ephemeral/channel/update/internal)', TextInputStyle.Paragraph, `${node.action?.type || 'ephemeral'}|${node.action?.value || ''}`, false, { max: 1000 })),
    );
  } else if (node.type === 'separator') {
    modal.addComponents(
      new ActionRowBuilder().addComponents(modalField('divider', 'Divider? (yes/no)', TextInputStyle.Short, node.divider !== false ? 'yes' : 'no', false)),
      new ActionRowBuilder().addComponents(modalField('spacing', 'Spacing (1=small, 2=large)', TextInputStyle.Short, String(node.spacing ?? 1), false)),
    );
  } else if (node.type === 'thumbnail') {
    modal.addComponents(
      new ActionRowBuilder().addComponents(modalField('url', 'Thumbnail URL', TextInputStyle.Short, node.url || '', true)),
      new ActionRowBuilder().addComponents(modalField('description', 'Description', TextInputStyle.Short, node.description || '', false)),
      new ActionRowBuilder().addComponents(modalField('spoiler', 'Spoiler? (yes/no)', TextInputStyle.Short, node.spoiler ? 'yes' : 'no', false)),
    );
  } else if (node.type === 'media_gallery') {
    const itemsText = (node.items || []).map(i => `${i.url}|${i.description||''}|${i.spoiler?'yes':'no'}`).join('\n');
    modal.addComponents(
      new ActionRowBuilder().addComponents(modalField('items', 'Items (one per line: url|description|spoiler yes/no)', TextInputStyle.Paragraph, itemsText, true, { max: 4000 })),
    );
  } else if (node.type === 'file') {
    modal.addComponents(
      new ActionRowBuilder().addComponents(modalField('file', 'File URL or attachment://name', TextInputStyle.Short, node.file || '', true)),
      new ActionRowBuilder().addComponents(modalField('spoiler', 'Spoiler? (yes/no)', TextInputStyle.Short, node.spoiler ? 'yes' : 'no', false)),
    );
  } else if (node.type === 'section') {
    const texts = (node.components || []).map(t => t.content || '').join('\n---\n');
    const acc = node.accessory || {};
    let accInfo = '';
    if (acc.type === 'button') {
      accInfo = `button|${acc.label||''}|${acc.style||1}|${acc.url||''}|${acc.custom_id||''}|${acc.emoji||''}|${acc.disabled?'yes':'no'}|${acc.action?.type||'ephemeral'}|${acc.action?.value||''}`;
    } else {
      accInfo = `thumbnail|${acc.url||''}|${acc.description||''}|${acc.spoiler?'yes':'no'}`;
    }
    modal.addComponents(
      new ActionRowBuilder().addComponents(modalField('texts', 'Text displays separated by a line with --- (1-3)', TextInputStyle.Paragraph, texts, true, { max: 4000 })),
      new ActionRowBuilder().addComponents(modalField('acc', 'Accessory: thumbnail|url|desc|spoiler OR button|label|style|url|custom_id|emoji|disabled|actionType|response', TextInputStyle.Paragraph, accInfo, true, { max: 1000 })),
    );
  } else if (node.type && node.type.endsWith('_select')) {
    const optsText = node.type === 'string_select' ? (node.options || []).map(o => `${o.label}|${o.value}|${o.description||''}`).join('\n') : '';
    modal.addComponents(
      new ActionRowBuilder().addComponents(modalField('placeholder', 'Placeholder/custom_id: placeholder||custom_id', TextInputStyle.Short, `${node.placeholder || ''}||${node.custom_id || ''}`, false)),
      new ActionRowBuilder().addComponents(modalField('minmax', 'Min,Max values (e.g. 1,1)', TextInputStyle.Short, `${node.min_values ?? 1},${node.max_values ?? 1}`, false)),
      new ActionRowBuilder().addComponents(modalField('options', 'String options: label|value|description per line', TextInputStyle.Paragraph, optsText, false, { max: 4000 })),
      new ActionRowBuilder().addComponents(modalField('disabled', 'Disabled? (yes/no)', TextInputStyle.Short, node.disabled ? 'yes' : 'no', false)),
    );
  } else {
    return interaction.reply({ content: `Editing not supported for ${node.type} via modal.`, flags: 64 });
  }
  return interaction.showModal(modal);
}

async function handleProperties(interaction, { sid }) {
  const { session, error } = requireSession(sid, interaction.user.id);
  if (error) return interaction.reply({ content: error, flags: 64 });
  const action = interaction.customId.split(':')[3];

  // Modal submits
  if (interaction.isModalSubmit()) {
    const sub = interaction.customId.split(':')[4];
    if (action === 'embed_modal') {
      pushHistory(session);
      const e = session.state.embed;
      if (sub === 'basic') {
        e.title = interaction.fields.getTextInputValue('title');
        e.url = interaction.fields.getTextInputValue('url');
        e.description = interaction.fields.getTextInputValue('description');
        const c = interaction.fields.getTextInputValue('color');
        e.color = c ? parseColor(c) : null;
      } else if (sub === 'author') {
        e.author = e.author || {};
        e.author.name = interaction.fields.getTextInputValue('name');
        e.author.url = interaction.fields.getTextInputValue('url');
        e.author.icon_url = interaction.fields.getTextInputValue('icon_url');
      } else if (sub === 'footer') {
        e.footer = e.footer || {};
        e.footer.text = interaction.fields.getTextInputValue('text');
        e.footer.icon_url = interaction.fields.getTextInputValue('icon_url');
        const ts = interaction.fields.getTextInputValue('timestamp').trim();
        if (!ts) e.timestamp = null;
        else if (ts.toLowerCase() === 'now') e.timestamp = new Date().toISOString();
        else e.timestamp = ts;
      } else if (sub === 'images') {
        e.thumbnail = { url: interaction.fields.getTextInputValue('thumbnail') };
        e.image = { url: interaction.fields.getTextInputValue('image') };
      } else if (sub === 'content') {
        session.state.content = interaction.fields.getTextInputValue('content');
      }
      saveSession(session);
      return interaction.update(buildEmbedEditor(session));
    }
    if (action === 'field_add') {
      pushHistory(session);
      const fields = session.state.embed.fields || (session.state.embed.fields = []);
      if (fields.length >= 25) return interaction.reply({ content: 'Maximum 25 fields.', flags: 64 });
      fields.push({
        name: interaction.fields.getTextInputValue('name'),
        value: interaction.fields.getTextInputValue('value'),
        inline: /^y(es)?|true|1$/i.test(interaction.fields.getTextInputValue('inline').trim())
      });
      saveSession(session);
      return interaction.update(buildEmbedEditor(session));
    }
    if (action === 'field_edit_modal') {
      const idx = Number(interaction.customId.split(':')[4]);
      const fields = session.state.embed.fields || [];
      if (!fields[idx]) return interaction.reply({ content: 'Field not found.', flags: 64 });
      pushHistory(session);
      fields[idx] = {
        name: interaction.fields.getTextInputValue('name'),
        value: interaction.fields.getTextInputValue('value'),
        inline: /^y(es)?|true|1$/i.test(interaction.fields.getTextInputValue('inline').trim())
      };
      saveSession(session);
      return interaction.update(buildEmbedEditor(session));
    }
    if (action === 'cv2_modal') {
      const id = session.selectedNodeId;
      const info = findParentInfo(session.state.root, id);
      if (!info) return interaction.reply({ content: 'Node not found.', flags: 64 });
      pushHistory(session);
      const node = info.node;
      const type = node.type;
      try {
        if (type === 'text_display') {
          node.content = interaction.fields.getTextInputValue('content');
        } else if (type === 'container') {
          const c = interaction.fields.getTextInputValue('accent_color').trim();
          node.accent_color = c ? parseColor(c) : null;
          node.spoiler = /^y(es)?|true|1$/i.test(interaction.fields.getTextInputValue('spoiler').trim());
        } else if (type === 'button') {
          node.label = interaction.fields.getTextInputValue('label');
          const styleRaw = interaction.fields.getTextInputValue('style').trim().toLowerCase();
          const styleMap = { '1':'1','primary':'1','2':'2','secondary':'2','3':'3','success':'3','4':'4','danger':'4','5':'5','link':'5' };
          node.style = Number(styleMap[styleRaw] || styleRaw || 1);
          const val = interaction.fields.getTextInputValue('url_or_id').trim();
          if (node.style === 5) { node.url = val || 'https://discord.com'; node.custom_id = ''; }
          else { node.custom_id = val; node.url = ''; }
          const ed = interaction.fields.getTextInputValue('emoji_disabled');
          const [emojiPart='', disabledPart='no'] = ed.split(',');
          node.emoji = (emojiPart || '').trim();
          node.disabled = /^y(es)?|true|1$/i.test((disabledPart || '').trim());
          const ar = interaction.fields.getTextInputValue('action_resp');
          const sepIdx = ar.indexOf('|');
          const aType = (sepIdx >= 0 ? ar.slice(0, sepIdx) : ar).trim() || 'ephemeral';
          const aVal = (sepIdx >= 0 ? ar.slice(sepIdx + 1) : '').toString();
          node.action = { type: aType, value: aVal };
        } else if (type === 'separator') {
          node.divider = /^y(es)?|true|1$/i.test(interaction.fields.getTextInputValue('divider').trim());
          node.spacing = Number(interaction.fields.getTextInputValue('spacing').trim() || 1);
        } else if (type === 'thumbnail') {
          node.url = interaction.fields.getTextInputValue('url').trim();
          node.description = interaction.fields.getTextInputValue('description');
          node.spoiler = /^y(es)?|true|1$/i.test(interaction.fields.getTextInputValue('spoiler').trim());
        } else if (type === 'media_gallery') {
          const lines = interaction.fields.getTextInputValue('items').split('\n').map(l => l.trim()).filter(Boolean);
          node.items = lines.map(l => {
            const [url, description='', spoiler='no'] = l.split('|');
            return { url: (url||'').trim(), description: (description||'').trim(), spoiler: /^y(es)?|true|1$/i.test((spoiler||'').trim()) };
          }).filter(i => i.url).slice(0, 10);
        } else if (type === 'file') {
          node.file = interaction.fields.getTextInputValue('file').trim();
          node.spoiler = /^y(es)?|true|1$/i.test(interaction.fields.getTextInputValue('spoiler').trim());
        } else if (type === 'section') {
          const texts = interaction.fields.getTextInputValue('texts').split(/\n---\n/).map(s => s.trim()).filter(Boolean).slice(0,3);
          // preserve existing text node ids where possible
          const prevTexts = (node.components || []).filter(c => c && c.type === 'text_display');
          node.components = texts.map((t, i) => ({ _id: (prevTexts[i] && prevTexts[i]._id) || Math.random().toString(36).slice(2,10), type: 'text_display', content: t }));
          const accRaw = interaction.fields.getTextInputValue('acc');
          const parts = accRaw.split('|');
          const accType = (parts[0] || 'thumbnail').trim().toLowerCase();
          const prevAcc = node.accessory || {};
          if (accType === 'button') {
            const [, label='', style='1', url='', custom_id='', emoji='', disabled='no', aType='ephemeral', ...rest] = parts;
            const aVal = rest.join('|');
            const styleMap = { '1':1,'primary':1,'2':2,'secondary':2,'3':3,'success':3,'4':4,'danger':4,'5':5,'link':5 };
            const stNum = Number(styleMap[String(style).trim().toLowerCase()] || style || 1);
            node.accessory = {
              _id: prevAcc._id || Math.random().toString(36).slice(2,10),
              type: 'button',
              label: (label || prevAcc.label || 'Button').trim(),
              style: stNum,
              url: stNum === 5 ? (url || '').trim() : '',
              custom_id: stNum === 5 ? '' : (custom_id || '').trim(),
              emoji: (emoji || '').trim(),
              disabled: /^y(es)?|true|1$/i.test((disabled || '').trim()),
              action: { type: (aType || 'ephemeral').trim(), value: aVal || '' }
            };
          } else {
            const [, url='', description='', spoiler='no'] = parts;
            node.accessory = {
              _id: prevAcc._id || Math.random().toString(36).slice(2,10),
              type: 'thumbnail',
              url: (url || '').trim(),
              description: (description || '').trim(),
              spoiler: /^y(es)?|true|1$/i.test((spoiler || '').trim())
            };
          }
        } else if (type.endsWith('_select')) {
          const phRaw = interaction.fields.getTextInputValue('placeholder');
          const phSep = phRaw.indexOf('||');
          node.placeholder = (phSep >= 0 ? phRaw.slice(0, phSep) : phRaw).trim();
          node.custom_id = (phSep >= 0 ? phRaw.slice(phSep + 2) : '').trim();
          const mm = interaction.fields.getTextInputValue('minmax').split(',').map(x => parseInt(x.trim(),10));
          if (!Number.isNaN(mm[0])) node.min_values = mm[0];
          if (!Number.isNaN(mm[1])) node.max_values = mm[1];
          node.disabled = /^y(es)?|true|1$/i.test(interaction.fields.getTextInputValue('disabled').trim());
          if (type === 'string_select') {
            const lines = interaction.fields.getTextInputValue('options').split('\n').map(l => l.trim()).filter(Boolean).slice(0,25);
            node.options = lines.map((l, i) => {
              const [label, value, description=''] = l.split('|');
              return { label: (label||`Option ${i+1}`).trim(), value: (value||label||`opt_${i+1}`).trim(), description: (description||'').trim(), default: false };
            });
          }
        }
      } catch (e) { /* keep partial */ }
      saveSession(session);
      return interaction.update(buildCv2Editor(session));
    }
    if (action === 'tpl_name') {
      const name = interaction.fields.getTextInputValue('name').trim();
      const tpl = templateService.saveTemplate(session.userId, session.guildId, session.state, name);
      session.templateId = tpl.id;
      saveSession(session);
      return interaction.reply({ content: `Template saved: **${tpl.name}** (${tpl.id})`, flags: 64 });
    }
    if (action === 'edit_existing_modal') {
      const channelId = interaction.fields.getTextInputValue('channel_id').trim();
      const messageId = interaction.fields.getTextInputValue('message_id').trim();
      try {
        const channel = await interaction.client.channels.fetch(channelId);
        const msg = await channel.messages.fetch(messageId);
        if (msg.author?.id !== interaction.client.user.id) {
          return interaction.reply({ content: 'I can only edit messages authored by this bot.', flags: 64 });
        }
        session.editingMessage = { channelId, messageId };
        // attempt basic import for embeds; CV2 import is limited
        if (msg.flags?.has?.(1 << 15) || msg.flags?.bitfield === 32768) {
          // cannot reliably reconstruct full CV2 tree; start fresh but set edit target
          session.state = require('../schemas/components-v2.schema').createDefaultComponentsV2State();
          session.type = 'components_v2';
          saveSession(session);
          return interaction.update({ content: 'Loaded Components V2 message as edit target. Full visual reconstruction of existing CV2 messages is not supported; the editor started a new CV2 draft that will replace the target message when you publish edit. You can now build the replacement.', embeds: buildCv2Editor(session).embeds, components: buildCv2Editor(session).components });
        } else if (msg.embeds && msg.embeds.length) {
          const em = msg.embeds[0];
          const st = require('../schemas/embed.schema').createDefaultEmbedState();
          st.content = msg.content || '';
          st.embed = {
            author: { name: em.author?.name || '', icon_url: em.author?.iconURL || '', url: em.author?.url || '' },
            title: em.title || '',
            url: em.url || '',
            description: em.description || '',
            color: em.color ?? null,
            fields: (em.fields || []).map(f => ({ name: f.name, value: f.value, inline: !!f.inline })),
            thumbnail: { url: em.thumbnail?.url || '' },
            image: { url: em.image?.url || '' },
            footer: { text: em.footer?.text || '', icon_url: em.footer?.iconURL || '' },
            timestamp: em.timestamp ? new Date(em.timestamp).toISOString() : null
          };
          session.state = st; session.type = 'embed';
        } else {
          session.state = require('../schemas/embed.schema').createDefaultEmbedState();
          session.state.content = msg.content || '';
          session.type = 'embed';
        }
        saveSession(session);
        return interaction.update(buildEmbedEditor(session));
      } catch (e) {
        return interaction.reply({ content: `Failed to load message: ${e.message}`, flags: 64 });
      }
    }
    return;
  }

  // Buttons / selects
  if (action === 'embed_edit') {
    if (session.state.type !== 'embed') return interaction.reply({ content: 'Not in embed mode.', flags: 64 });
    if (session.embedSection === 'fields') return interaction.reply({ content: 'Use Field Tools to edit fields.', flags: 64 });
    return showEmbedModal(interaction, session);
  }
  if (action === 'embed_add_field') {
    if (session.state.type !== 'embed') return interaction.reply({ content: 'Not in embed mode.', flags: 64 });
    return showAddFieldModal(interaction, session);
  }
  if (action === 'cv2_edit') {
    return showCv2EditModal(interaction, session);
  }
  if (action === 'tpl_name_btn') { /* unused */ }
  if (action === 'edit_existing') {
    const modal = new ModalBuilder().setCustomId(tid(session, 'edit_existing_modal')).setTitle('Edit Existing Message');
    modal.addComponents(
      new ActionRowBuilder().addComponents(modalField('channel_id', 'Channel ID', TextInputStyle.Short, session.editingMessage?.channelId || '', true)),
      new ActionRowBuilder().addComponents(modalField('message_id', 'Message ID', TextInputStyle.Short, session.editingMessage?.messageId || '', true)),
    );
    return interaction.showModal(modal);
  }

  // Field tools (require selected field index stored in session.selectedFieldIndex)
  if (interaction.isStringSelectMenu() && action === 'field_select') {
    session.selectedFieldIndex = interaction.values[0] === 'none' ? null : Number(interaction.values[0]);
    saveSession(session);
    return interaction.deferUpdate();
  }
  if (['field_edit','field_remove','field_dup','field_up','field_down'].includes(action)) {
    const idx = session.selectedFieldIndex;
    const fields = session.state.embed.fields || [];
    if (idx == null || !fields[idx]) return interaction.reply({ content: 'Select a field first.', flags: 64 });
    if (action === 'field_edit') {
      const f = fields[idx];
      const modal = new ModalBuilder().setCustomId(`bld:${session.id}:prop:field_edit_modal:${idx}`).setTitle(`Edit Field ${idx+1}`.slice(0,45));
      modal.addComponents(
        new ActionRowBuilder().addComponents(modalField('name', 'Field name', TextInputStyle.Short, f.name, true, { max: 256 })),
        new ActionRowBuilder().addComponents(modalField('value', 'Field value', TextInputStyle.Paragraph, f.value, true, { max: 1024 })),
        new ActionRowBuilder().addComponents(modalField('inline', 'Inline? (yes/no)', TextInputStyle.Short, f.inline ? 'yes' : 'no', false)),
      );
      return interaction.showModal(modal);
    }
    pushHistory(session);
    if (action === 'field_remove') fields.splice(idx, 1);
    if (action === 'field_dup') { fields.splice(idx+1, 0, JSON.parse(JSON.stringify(fields[idx]))); }
    if (action === 'field_up' && idx > 0) { const [it]=fields.splice(idx,1); fields.splice(idx-1,0,it); session.selectedFieldIndex = idx-1; }
    if (action === 'field_down' && idx < fields.length-1) { const [it]=fields.splice(idx,1); fields.splice(idx+1,0,it); session.selectedFieldIndex = idx+1; }
    saveSession(session);
    // rebuild field tools view
    const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('Field Tools').setDescription(fields.length ? fields.map((f,i)=>`${i+1}. ${f.name}`).join('\n').slice(0, 4000) : 'No fields.');
    const opts = fields.map((f, i) => ({ label: `${i+1}. ${String(f.name).slice(0,90)}`.slice(0,100), value: String(i) })).slice(0,25);
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

  return interaction.reply({ content: 'Unhandled property action.', flags: 64 });
}

module.exports = { handleProperties };
