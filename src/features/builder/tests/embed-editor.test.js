import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { MessageFlags } from 'discord.js';
import { sessions, createSession, getSession } from '../services/session.service.js';
import { handleNavigation, buildEmbedEditor, buildMainPanel, buildContainerEditor, buildEmbedMainPanel } from '../interactions/navigation.js';
import { handleProperties } from '../interactions/properties.js';
import draftService from '../services/draft.service.js';
import { createDefaultEmbedState } from '../schemas/embed.schema.js';

function freshModules() {
  try { sessions.clear(); } catch {}
}

function mockInteraction(session, customId, opts = {}) {
  return {
    customId,
    user: { id: opts.userId || session.userId },
    guildId: opts.guildId || session.guildId,
    values: opts.values || [],
    client: opts.client || {},
    fields: opts.fields,
    isButton: () => (opts.type ? opts.type === 'button' : !opts.isSelect && !opts.isModal),
    isStringSelectMenu: () => opts.isSelect === true,
    isModalSubmit: () => opts.isModal === true,
    isChatInputCommand: () => false,
    deferred: false,
    replied: false,
    async update(payload) { this.updated = payload; this.replied = true; return payload; },
    async reply(payload) { this.repliedPayload = payload; this.replied = true; return payload; },
    async followUp(payload) { this.followed = payload; this.replied = true; return payload; },
    async showModal(modal) { this.shownModal = modal; this.replied = true; return modal; },
    async deferUpdate() { this.deferredUpdate = true; return; }
  };
}

function walkIds(components) {
  const ids = [];
  function walk(node) {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(walk);
    const j = typeof node.toJSON === 'function' ? node.toJSON() : node;
    if (j && j.custom_id) ids.push(j.custom_id);
    if (j && Array.isArray(j.components)) j.components.forEach(walk);
    if (Array.isArray(node.components)) node.components.forEach(walk);
  }
  walk(components || []);
  return ids;
}

function allText(components) {
  const out = [];
  function walk(node) {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(walk);
    const j = typeof node.toJSON === 'function' ? node.toJSON() : node;
    if (j && typeof j.content === 'string') out.push(j.content);
    if (j && Array.isArray(j.components)) j.components.forEach(walk);
    if (Array.isArray(node.components)) node.components.forEach(walk);
  }
  walk(components || []);
  return out.join('\n');
}

function hasFlag(payload, bit) {
  const f = payload && payload.flags;
  if (typeof f === 'number') return (f & bit) === bit;
  if (f && typeof f.bitfield === 'number') return (f.bitfield & bit) === bit;
  return false;
}

function findButton(components, suffix) {
  let found = null;
  function walk(node) {
    if (found || !node) return;
    if (Array.isArray(node)) return node.forEach(walk);
    const j = typeof node.toJSON === 'function' ? node.toJSON() : node;
    if (j && j.custom_id && j.custom_id.endsWith(suffix)) found = j;
    if (j && Array.isArray(j.components)) j.components.forEach(walk);
    if (Array.isArray(node.components)) node.components.forEach(walk);
  }
  walk(components || []);
  return found;
}

function fields(values) {
  return {
    getTextInputValue: (key) => values[key] || '',
    getUploadedFiles: undefined
  };
}

(async () => {
  const results = [];
  const test = async (name, fn) => {
    try { await fn(); results.push({ name, ok: true }); }
    catch (e) { results.push({ name, ok: false, err: e.message, stack: e.stack }); }
  };

  await test('embed editor uses Rio-style preview card, section buttons, actions, and navigation', () => {
    freshModules();
    const s = createSession('u1', 'g1', 'c1', 'embed');
    s.state.embeds[0].title = 'Hello';
    s.state.embeds[0].description = 'World';
    s.state.embeds[0].color = 0x5865f2;
    const view = buildEmbedEditor(s);
    assert.ok(hasFlag(view, MessageFlags.Ephemeral), 'ephemeral');
    assert.ok(hasFlag(view, MessageFlags.IsComponentsV2), 'components v2');
    const text = allText(view.components);
    assert.ok(text.includes('Hello') && text.includes('World'), 'preview card shows selected embed');
    assert.ok(/Embed 1 of 1/.test(text), 'selected embed index shown');
    const ids = walkIds(view.components);
    assert.ok(!ids.some(id => id.endsWith(':nav:embed_section')), 'no legacy section select');
    for (const action of ['embed_title', 'embed_description', 'embed_color', 'embed_author', 'embed_content', 'embed_footer', 'embed_images', 'embed_add_field']) {
      assert.ok(ids.includes(`bld:${s.id}:prop:${action}`), `section button ${action}`);
    }
    assert.ok(ids.includes(`bld:${s.id}:nav:embed_field_tools`), 'edit fields button');
    assert.ok(ids.includes(`bld:${s.id}:nav:preview`), 'preview');
    assert.ok(ids.includes(`bld:${s.id}:nav:save_menu`), 'save');
    assert.ok(ids.includes(`bld:${s.id}:nav:publish_menu`), 'publish');
    assert.ok(ids.includes(`bld:${s.id}:nav:embed_back_panel`), 'back to main panel');
    assert.ok(ids.includes(`bld:${s.id}:nav:undo`), 'undo');
    assert.ok(ids.includes(`bld:${s.id}:nav:back_selection`), 'builder selection');
    assert.ok(ids.includes(`bld:${s.id}:nav:json_editor`), 'import json');
    assert.ok(ids.includes(`bld:${s.id}:nav:export_json`), 'export json');
  });

  await test('switching selected embed updates preview and editor state', async () => {
    freshModules();
    const s = createSession('u1', 'g1', 'c1', 'embed');
    s.state.embeds[0].title = 'First';
    s.state.embeds.push(JSON.parse(JSON.stringify(s.state.embeds[0])));
    s.state.embeds[1].title = 'Second';
    s.state.selectedEmbedIndex = 1;
    const view = buildEmbedEditor(s);
    assert.ok(allText(view.components).includes('Second'), 'second embed preview');
    assert.ok(!allText(view.components).includes('First'), 'first embed not previewed');

    const i = mockInteraction(s, `bld:${s.id}:nav:embed_select`, { isSelect: true, values: ['0'] });
    await handleNavigation(i, { sid: s.id });
    const session = getSession(s.id);
    assert.strictEqual(session.state.selectedEmbedIndex, 0, 'selection switched');
    assert.ok(i.updated && !i.repliedPayload, 'same ephemeral message updated');
    assert.ok(allText(i.updated.components).includes('First'), 'editor now shows first embed');
    assert.ok(!allText(i.updated.components).includes('Second'), 'second embed no longer previewed');
  });

  await test('add embed opens editor and preserves existing embeds', async () => {
    freshModules();
    const s = createSession('u1', 'g1', 'c1', 'embed');
    s.state.embeds[0].title = 'First';
    const i = mockInteraction(s, `bld:${s.id}:nav:add_embed_main`);
    await handleNavigation(i, { sid: s.id });
    const session = getSession(s.id);
    assert.strictEqual(session.state.embeds.length, 2, 'existing embed preserved');
    assert.strictEqual(session.state.embeds[0].title, 'First', 'first embed unchanged');
    assert.strictEqual(session.state.selectedEmbedIndex, 1, 'new embed selected');
    assert.strictEqual(session.view, 'editor', 'editor opened');
    assert.ok(i.updated && !i.repliedPayload, 'same ephemeral message updated');
    assert.ok(/Embed 2 of 2/.test(allText(i.updated.components)), 'editor shows new embed');
  });

  await test('property editing targets only the selected embed', async () => {
    freshModules();
    const s = createSession('u1', 'g1', 'c1', 'embed');
    s.state.embeds[0].title = 'First';
    s.state.embeds.push(JSON.parse(JSON.stringify(s.state.embeds[0])));
    s.state.embeds[1].title = 'Second';
    s.state.selectedEmbedIndex = 1;
    s.view = 'editor';

    const titleOpen = mockInteraction(s, `bld:${s.id}:prop:embed_title`);
    await handleProperties(titleOpen, { sid: s.id });
    assert.ok(titleOpen.shownModal, 'title modal shown');
    assert.ok(String(titleOpen.shownModal.data?.custom_id || titleOpen.shownModal.customId).endsWith(':prop:embed_modal:title'), 'title modal id');

    const titleSubmit = mockInteraction(s, `bld:${s.id}:prop:embed_modal:title`, {
      isModal: true,
      fields: fields({ title: 'Second updated', url: 'https://example.com' })
    });
    await handleProperties(titleSubmit, { sid: s.id });
    let session = getSession(s.id);
    assert.strictEqual(session.state.embeds[1].title, 'Second updated', 'selected embed title updated');
    assert.strictEqual(session.state.embeds[1].url, 'https://example.com', 'selected embed url updated');
    assert.strictEqual(session.state.embeds[0].title, 'First', 'other embed untouched');

    const colorSubmit = mockInteraction(s, `bld:${s.id}:prop:embed_modal:color`, {
      isModal: true,
      fields: fields({ color: '#5865F2' })
    });
    await handleProperties(colorSubmit, { sid: s.id });
    session = getSession(s.id);
    assert.strictEqual(session.state.embeds[1].color, 0x5865F2, 'selected embed color updated');
    assert.notStrictEqual(session.state.embeds[0].color, 0x5865F2, 'other embed color untouched');

    const authorSubmit = mockInteraction(s, `bld:${s.id}:prop:embed_modal:author`, {
      isModal: true,
      fields: fields({ name: 'Author', url: 'https://example.com', icon_url: 'https://example.com/icon.png' })
    });
    await handleProperties(authorSubmit, { sid: s.id });
    session = getSession(s.id);
    assert.strictEqual(session.state.embeds[1].author.name, 'Author', 'selected embed author updated');
    assert.notStrictEqual(session.state.embeds[0].author.name, 'Author', 'other embed author untouched');

    const contentSubmit = mockInteraction(s, `bld:${s.id}:prop:embed_modal:content`, {
      isModal: true,
      fields: fields({ content: 'Message content' })
    });
    await handleProperties(contentSubmit, { sid: s.id });
    session = getSession(s.id);
    assert.strictEqual(session.state.content, 'Message content', 'message content updated');
  });

  await test('field creation, editing, and deletion operate on selected embed', async () => {
    freshModules();
    const s = createSession('u1', 'g1', 'c1', 'embed');
    s.state.embeds[0].fields = [{ name: 'First field', value: 'First value', inline: false }];
    s.state.embeds.push(JSON.parse(JSON.stringify(s.state.embeds[0])));
    s.state.embeds[1].fields = [{ name: 'Second field', value: 'Second value', inline: false }];
    s.state.selectedEmbedIndex = 1;
    s.view = 'editor';

    const addOpen = mockInteraction(s, `bld:${s.id}:prop:embed_add_field`);
    await handleProperties(addOpen, { sid: s.id });
    assert.ok(addOpen.shownModal, 'add field modal shown');

    const addSubmit = mockInteraction(s, `bld:${s.id}:prop:field_add`, {
      isModal: true,
      fields: fields({ name: 'New field', value: 'New value', inline: 'yes' })
    });
    await handleProperties(addSubmit, { sid: s.id });
    let session = getSession(s.id);
    assert.strictEqual(session.state.embeds[1].fields.length, 2, 'field added to selected embed');
    assert.strictEqual(session.state.embeds[1].fields[1].name, 'New field', 'new field name');
    assert.strictEqual(session.state.embeds[0].fields.length, 1, 'other embed fields untouched');

    const select = mockInteraction(s, `bld:${s.id}:prop:field_select`, { isSelect: true, values: ['1'] });
    await handleProperties(select, { sid: s.id });
    session = getSession(s.id);
    assert.strictEqual(session.selectedFieldIndex, 1, 'field selected');

    const editOpen = mockInteraction(s, `bld:${s.id}:prop:field_edit`);
    await handleProperties(editOpen, { sid: s.id });
    assert.ok(editOpen.shownModal, 'field edit modal shown');

    const editSubmit = mockInteraction(s, `bld:${s.id}:prop:field_edit_modal:1`, {
      isModal: true,
      fields: fields({ name: 'Edited field', value: 'Edited value', inline: 'no' })
    });
    await handleProperties(editSubmit, { sid: s.id });
    session = getSession(s.id);
    assert.strictEqual(session.state.embeds[1].fields[1].name, 'Edited field', 'field edited');
    assert.strictEqual(session.state.embeds[0].fields[0].name, 'First field', 'other embed field untouched');

    const remove = mockInteraction(s, `bld:${s.id}:prop:field_remove`);
    await handleProperties(remove, { sid: s.id });
    session = getSession(s.id);
    assert.strictEqual(session.state.embeds[1].fields.length, 1, 'field removed from selected embed');
    assert.strictEqual(session.state.embeds[0].fields.length, 1, 'other embed fields untouched');
  });

  await test('field tools view uses selected embed and includes add field', async () => {
    freshModules();
    const s = createSession('u1', 'g1', 'c1', 'embed');
    s.state.embeds[0].fields = [{ name: 'First field', value: 'First value', inline: false }];
    s.state.embeds.push(JSON.parse(JSON.stringify(s.state.embeds[0])));
    s.state.embeds[1].fields = [{ name: 'Second field', value: 'Second value', inline: false }];
    s.state.selectedEmbedIndex = 1;
    s.view = 'editor';
    const i = mockInteraction(s, `bld:${s.id}:nav:embed_field_tools`);
    await handleNavigation(i, { sid: s.id });
    const session = getSession(s.id);
    assert.ok(i.updated && !i.repliedPayload, 'same ephemeral message updated');
    const text = allText(i.updated.components);
    assert.ok(text.includes('Second field'), 'selected embed field shown');
    assert.ok(!text.includes('First field'), 'other embed field not shown');
    assert.ok(walkIds(i.updated.components).includes(`bld:${s.id}:prop:embed_add_field`), 'add field available in field tools');
  });

  await test('editor navigation returns to embed panel and builder selection in same message', async () => {
    freshModules();
    const s = createSession('u1', 'g1', 'c1', 'embed');
    s.view = 'editor';

    const back = mockInteraction(s, `bld:${s.id}:nav:embed_back_panel`);
    await handleNavigation(back, { sid: s.id });
    let session = getSession(s.id);
    assert.strictEqual(session.view, 'embed_home', 'back to embed main panel');
    assert.ok(back.updated && !back.repliedPayload, 'same message updated');
    assert.ok(allText(back.updated.components).includes('Embed Builder'), 'embed main panel shown');

    const selection = mockInteraction(s, `bld:${s.id}:nav:back_selection`);
    await handleNavigation(selection, { sid: s.id });
    session = getSession(s.id);
    assert.strictEqual(session.view, 'selection', 'back to builder selection');
    assert.ok(selection.updated && !selection.repliedPayload, 'same message updated');
    assert.ok(allText(selection.updated.components).includes('Visual Builder'), 'selection screen shown');
  });

  await test('undo restores previous embed state', async () => {
    freshModules();
    const s = createSession('u1', 'g1', 'c1', 'embed');
    s.state.embeds[0].title = 'Before';
    s.view = 'editor';

    const submit = mockInteraction(s, `bld:${s.id}:prop:embed_modal:title`, {
      isModal: true,
      fields: fields({ title: 'After', url: '' })
    });
    await handleProperties(submit, { sid: s.id });
    let session = getSession(s.id);
    assert.strictEqual(session.state.embeds[0].title, 'After', 'title changed');

    const undo = mockInteraction(s, `bld:${s.id}:nav:undo`);
    await handleNavigation(undo, { sid: s.id });
    session = getSession(s.id);
    assert.strictEqual(session.state.embeds[0].title, 'Before', 'undo restored title');
    assert.ok(undo.updated && !undo.repliedPayload, 'same message updated');
  });

  await test('export json returns current builder state as a file', async () => {
    freshModules();
    const s = createSession('u1', 'g1', 'c1', 'embed');
    s.state.embeds[0].title = 'Export me';
    const i = mockInteraction(s, `bld:${s.id}:nav:export_json`);
    await handleNavigation(i, { sid: s.id });
    assert.ok(i.repliedPayload, 'reply sent');
    assert.ok(Array.isArray(i.repliedPayload.files) && i.repliedPayload.files.length === 1, 'file attached');
    assert.strictEqual(i.repliedPayload.files[0].name, 'builder-state.json', 'json file name');
    const parsed = JSON.parse(i.repliedPayload.files[0].attachment.toString('utf8'));
    assert.strictEqual(parsed.type, 'embed', 'embed state exported');
    assert.strictEqual(parsed.embeds[0].title, 'Export me', 'embed content exported');
  });

  await test('import json from embed editor returns to editor with imported multi-embed state', async () => {
    freshModules();
    const s = createSession('u1', 'g1', 'c1', 'embed');
    s.view = 'editor';
    const candidate = {
      type: 'embed',
      content: 'Imported',
      embeds: [
        { title: 'Imported first', description: '', color: null, fields: [], author: { name: '', icon_url: '', url: '' }, thumbnail: { url: '' }, image: { url: '' }, footer: { text: '', icon_url: '' }, timestamp: null },
        { title: 'Imported second', description: '', color: null, fields: [], author: { name: '', icon_url: '', url: '' }, thumbnail: { url: '' }, image: { url: '' }, footer: { text: '', icon_url: '' }, timestamp: null }
      ],
      selectedEmbedIndex: 1
    };
    const i = mockInteraction(s, `bld:${s.id}:prop:json_import`, {
      isModal: true,
      fields: fields({ json: JSON.stringify(candidate) })
    });
    await handleProperties(i, { sid: s.id });
    const session = getSession(s.id);
    assert.strictEqual(session.state.type, 'embed', 'embed state imported');
    assert.strictEqual(session.state.embeds.length, 2, 'multi-embed imported');
    assert.strictEqual(session.state.selectedEmbedIndex, 1, 'selected embed preserved');
    assert.ok(i.updated && !i.repliedPayload, 'same message updated');
    assert.ok(allText(i.updated.components).includes('Imported second'), 'editor shows imported selected embed');
  });

  await test('draft persistence stores and reloads multi-embed state', () => {
    freshModules();
    const cwd = process.cwd();
    const draftFile = path.join(cwd, 'builder-drafts.json');
    try { fs.rmSync(draftFile, { force: true }); } catch {}
    const state = createDefaultEmbedState();
    state.embeds[0].title = 'Draft first';
    state.embeds.push(JSON.parse(JSON.stringify(state.embeds[0])));
    state.embeds[1].title = 'Draft second';
    state.selectedEmbedIndex = 1;
    const draft = draftService.saveDraft('u-draft', 'g-draft', state, null, 'Multi embed');
    const loaded = draftService.getDraftFor('u-draft', 'g-draft', draft.id);
    assert.ok(loaded, 'draft loaded');
    assert.strictEqual(loaded.state.embeds.length, 2, 'multi-embed persisted');
    assert.strictEqual(loaded.state.embeds[1].title, 'Draft second', 'selected embed persisted');
    draftService.deleteDraft('u-draft', 'g-draft', draft.id);
    try { fs.rmSync(draftFile, { force: true }); } catch {}
  });

  await test('components v2 regression: main panel and container editor remain intact', () => {
    freshModules();
    const s = createSession('u1', 'g1', 'c1', 'components_v2');
    const main = buildMainPanel(s);
    assert.ok(allText(main.components).includes('Container Creation Panel'), 'CV2 main panel intact');
    s.selectedNodeId = s.state.root[0]._id;
    const editor = buildContainerEditor(s);
    assert.ok(allText(editor.components).includes('Editing Container'), 'CV2 container editor intact');
  });

  console.log(JSON.stringify(results, null, 2));
  const failed = results.filter(r => !r.ok);
  console.log('FAILED=' + failed.length);
  if (failed.length) process.exit(1);
})();
