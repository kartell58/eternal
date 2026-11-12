const assert = require('assert');
const { MessageFlags } = require('discord.js');
const { createSession } = require('../services/session.service');
const { buildHome, buildMainPanel, buildEmbedEditor, buildCv2Editor } = require('../interactions/navigation');
const { buildPublishMenu } = require('../interactions/publishing');
const { createDefaultEmbedState } = require('../schemas/embed.schema');
const { createDefaultComponentsV2State, createContainer } = require('../schemas/components-v2.schema');

(async () => {
  const results = [];
  const test = async (name, fn) => { try { await fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: e.message, stack: e.stack }); } };

  function customIds(view) {
    const ids = [];
    function walk(node) {
      if (!node) return;
      if (Array.isArray(node)) return node.forEach(walk);
      const j = typeof node.toJSON === 'function' ? node.toJSON() : node;
      if (j && j.custom_id) ids.push(j.custom_id);
      if (j && Array.isArray(j.components)) j.components.forEach(walk);
      if (Array.isArray(node.components)) node.components.forEach(walk);
    }
    walk(view.components || []);
    return ids;
  }

  function allText(view) {
    const out = [];
    function walk(node) {
      if (!node) return;
      if (Array.isArray(node)) return node.forEach(walk);
      const j = typeof node.toJSON === 'function' ? node.toJSON() : node;
      if (j && typeof j.content === 'string') out.push(j.content);
      if (j && Array.isArray(j.components)) j.components.forEach(walk);
      if (Array.isArray(node.components)) node.components.forEach(walk);
    }
    walk(view.components || []);
    if (typeof view.content === 'string') out.push(view.content);
    return out.join('\n');
  }

  function hasFlag(view, bit) {
    const f = view && view.flags;
    if (typeof f === 'number') return (f & bit) === bit;
    if (f && typeof f.bitfield === 'number') return (f.bitfield & bit) === bit;
    return false;
  }

  function findSelect(view, customIdEndsWith) {
    let found = null;
    function walk(node) {
      if (found || !node) return;
      if (Array.isArray(node)) return node.forEach(walk);
      const j = typeof node.toJSON === 'function' ? node.toJSON() : node;
      if (j && j.custom_id && (!customIdEndsWith || j.custom_id.endsWith(customIdEndsWith))) found = j;
      if (j && Array.isArray(j.components)) j.components.forEach(walk);
      if (Array.isArray(node.components)) node.components.forEach(walk);
    }
    walk(view.components || []);
    return found;
  }

  await test('main panel (home) exposes container controls in English', () => {
    const s = createSession('u1', 'g1', 'c1', 'components_v2');
    s.state = createDefaultComponentsV2State();
    const view = buildHome(s);
    assert.ok(allText(view).includes('Container Creation Panel'), 'title content');
    assert.ok(hasFlag(view, MessageFlags.Ephemeral), 'ephemeral');
    const ids = customIds(view).join(' ');
    assert.ok(ids.includes(':nav:container_select'), 'container select');
    assert.ok(ids.includes(':nav:add_container_main'), 'add container');
    assert.ok(ids.includes(':nav:open_templates'), 'templates');
    assert.ok(ids.includes(':nav:json_editor'), 'json editor');
    assert.ok(ids.includes(':nav:send_custom'), 'custom send');
    assert.ok(ids.includes(':nav:quick_send'), 'quick send');
    const all = [];
    function walk(node){ if(!node) return; if(Array.isArray(node)) return node.forEach(walk); const j=typeof node.toJSON==='function'?node.toJSON():node; if(j&&j.label) all.push(j.label); if(j&&Array.isArray(j.components)) j.components.forEach(walk); if(Array.isArray(node.components)) node.components.forEach(walk);} walk(view.components||[]);
    const labels = all.join('|');
    assert.ok(labels.includes('Add Container'));
    assert.ok(labels.includes('JSON Editor'));
    assert.ok(labels.includes('Custom Send'));
    assert.ok(labels.includes('Quick Send'));
  });

  await test('main panel shows placeholder and empty container state with no default selection', () => {
    const s = createSession('u1', 'g1', 'c1', 'components_v2');
    s.state = createDefaultComponentsV2State();
    s.state.root = [];
    const view = buildMainPanel(s);
    const j = findSelect(view, ':nav:container_select');
    assert.ok(j, 'select found');
    assert.strictEqual(j.placeholder, 'Select a container to edit', 'placeholder');
    assert.ok(j.disabled === true, 'select disabled when empty');
    assert.ok((j.options || [])[0].value === 'none', 'empty option');
    assert.ok(!(j.options || []).some(o => o.default), 'no default option');
  });

  await test('main panel with containers always shows placeholder and no default selection', () => {
    const s = createSession('u1', 'g1', 'c1', 'components_v2');
    s.state = createDefaultComponentsV2State(); // 1 container
    const view1 = buildMainPanel(s);
    const j1 = findSelect(view1, ':nav:container_select');
    assert.strictEqual(j1.placeholder, 'Select a container to edit');
    assert.ok(!(j1.options || []).some(o => o.default), 'no default with one container');

    s.state.root.push(createContainer());
    const view2 = buildMainPanel(s);
    const j2 = findSelect(view2, ':nav:container_select');
    assert.strictEqual(j2.placeholder, 'Select a container to edit');
    assert.ok(!(j2.options || []).some(o => o.default), 'no default with multiple containers');
  });

  await test('returning to main panel restores placeholder without default selection', () => {
    const s = createSession('u1', 'g1', 'c1', 'components_v2');
    s.state = createDefaultComponentsV2State();
    s.selectedNodeId = s.state.root[0]._id;
    const view = buildMainPanel(s);
    const j = findSelect(view, ':nav:container_select');
    assert.strictEqual(j.placeholder, 'Select a container to edit');
    assert.ok(!(j.options || []).some(o => o.default), 'no default after selection in session');
  });

  await test('CV2 main panel and embed editor provide a way back to builder selection', () => {
    const s = createSession('u1', 'g1', 'c1', 'components_v2');
    s.state = createDefaultComponentsV2State();
    const cv2 = buildMainPanel(s);
    assert.ok(customIds(cv2).includes(`bld:${s.id}:nav:back_selection`), 'cv2 back to selection');
    const e = createSession('u1', 'g1', 'c1', 'embed');
    e.state = createDefaultEmbedState();
    const embed = buildEmbedEditor(e);
    assert.ok(customIds(embed).includes(`bld:${e.id}:nav:back_selection`), 'embed back to selection');
  });

  await test('embed editor has section navigation, actions, and back controls', () => {
    const s = createSession('u1', 'g1', 'c1', 'embed');
    s.state = createDefaultEmbedState();
    s.embedSection = 'basic';
    const view = buildEmbedEditor(s);
    const ids = customIds(view);
    assert.ok(ids.some(id => id.endsWith(':nav:embed_section')), 'section select');
    assert.ok(ids.includes(`bld:${s.id}:prop:embed_edit`));
    assert.ok(ids.includes(`bld:${s.id}:nav:preview`));
    assert.ok(ids.includes(`bld:${s.id}:nav:save_menu`));
    assert.ok(ids.includes(`bld:${s.id}:nav:publish_menu`));
    assert.ok(ids.includes(`bld:${s.id}:nav:home`));
    assert.ok(ids.includes(`bld:${s.id}:nav:undo`));
  });

  await test('embed editor field section enables field tools', () => {
    const s = createSession('u1', 'g1', 'c1', 'embed');
    s.state = createDefaultEmbedState();
    s.embedSection = 'fields';
    const view = buildEmbedEditor(s);
    const all = [];
    function walk(node){ if(!node) return; if(Array.isArray(node)) return node.forEach(walk); const j=typeof node.toJSON==='function'?node.toJSON():node; if(j&&j.custom_id) all.push(j); if(j&&Array.isArray(j.components)) j.components.forEach(walk); if(Array.isArray(node.components)) node.components.forEach(walk);} walk(view.components||[]);
    const add = all.find(c => c.custom_id === `bld:${s.id}:prop:embed_add_field`);
    const tools = all.find(c => c.custom_id === `bld:${s.id}:nav:embed_field_tools`);
    const edit = all.find(c => c.custom_id === `bld:${s.id}:prop:embed_edit`);
    assert.ok(add && !add.disabled, 'add field enabled');
    assert.ok(tools && !tools.disabled, 'field tools enabled');
    assert.ok(edit && edit.disabled, 'edit section disabled for fields');
  });

  await test('components v2 editor has node selection and management controls', () => {
    const s = createSession('u1', 'g1', 'c1', 'components_v2');
    s.state = createDefaultComponentsV2State();
    s.selectedNodeId = s.state.root[0]._id;
    const view = buildCv2Editor(s);
    const ids = customIds(view);
    assert.ok(ids.some(id => id.endsWith(':nav:cv2_select')));
    assert.ok(ids.includes(`bld:${s.id}:cmp:add`));
    assert.ok(ids.includes(`bld:${s.id}:cmp:remove`));
    assert.ok(ids.includes(`bld:${s.id}:cmp:dup`));
    assert.ok(ids.includes(`bld:${s.id}:cmp:up`));
    assert.ok(ids.includes(`bld:${s.id}:cmp:down`));
    assert.ok(ids.includes(`bld:${s.id}:prop:cv2_edit`));
    assert.ok(ids.includes(`bld:${s.id}:cmp:add_root`));
    assert.ok(ids.includes(`bld:${s.id}:nav:preview`));
    assert.ok(ids.includes(`bld:${s.id}:nav:publish_menu`));
  });

  await test('publish menu reflects validation and destination state', () => {
    const s = createSession('u1', 'g1', 'c1', 'embed');
    s.state = createDefaultEmbedState();
    s.state.embed.title = 'Hello';
    s.state.embed.description = 'World';
    const view = buildPublishMenu(s);
    const ids = customIds(view).join(' ');
    assert.ok(ids.includes(':pub:channel'), 'channel select for new message');
    assert.ok(ids.includes(':pub:confirm'));
    assert.ok(ids.includes(':pub:preview'));
    const all = [];
    function walk(node){ if(!node) return; if(Array.isArray(node)) return node.forEach(walk); const j=typeof node.toJSON==='function'?node.toJSON():node; if(j&&j.custom_id) all.push(j); if(j&&Array.isArray(j.components)) j.components.forEach(walk); if(Array.isArray(node.components)) node.components.forEach(walk);} walk(view.components||[]);
    const confirm = all.find(c => c.custom_id === `bld:${s.id}:pub:confirm`);
    assert.ok(confirm && confirm.disabled, 'confirm disabled without destination');

    s.publishChannelId = '123';
    const view2 = buildPublishMenu(s);
    const all2 = [];
    walk = function(node){ if(!node) return; if(Array.isArray(node)) return node.forEach(walk); const j=typeof node.toJSON==='function'?node.toJSON():node; if(j&&j.custom_id) all2.push(j); if(j&&Array.isArray(j.components)) j.components.forEach(walk); if(Array.isArray(node.components)) node.components.forEach(walk);} ; walk(view2.components||[]);
    const confirm2 = all2.find(c => c.custom_id === `bld:${s.id}:pub:confirm`);
    assert.ok(confirm2 && !confirm2.disabled, 'confirm enabled when valid and destination set');
  });

  console.log(JSON.stringify(results, null, 2));
  const failed = results.filter(r => !r.ok);
  console.log('FAILED=' + failed.length);
  if (failed.length) process.exit(1);
})();
