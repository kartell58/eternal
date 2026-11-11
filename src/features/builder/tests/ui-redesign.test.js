const assert = require('assert');
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
    for (const row of (view.components || [])) {
      const comps = row.components || row.toJSON?.().components || [];
      for (const c of comps) {
        const j = typeof c.toJSON === 'function' ? c.toJSON() : c;
        if (j.custom_id) ids.push(j.custom_id);
      }
    }
    return ids;
  }

  await test('main panel (home) exposes container controls in English', () => {
    const s = createSession('u1', 'g1', 'c1', 'components_v2');
    s.state = createDefaultComponentsV2State();
    const view = buildHome(s);
    assert.ok(view.content && view.content.includes('Container Creation Panel'), 'title content');
    assert.ok(view.embeds && view.embeds.length === 1, 'info card');
    const ids = customIds(view).join(' ');
    assert.ok(ids.includes(':nav:container_select'), 'container select');
    assert.ok(ids.includes(':nav:add_container_main'), 'add container');
    assert.ok(ids.includes(':nav:open_templates'), 'templates');
    assert.ok(ids.includes(':nav:json_editor'), 'json editor');
    assert.ok(ids.includes(':nav:send_custom'), 'custom send');
    assert.ok(ids.includes(':nav:quick_send'), 'quick send');
    // labels
    const all = (view.components || []).flatMap(r => (r.components || []));
    const labels = all.map(c => (c.toJSON?.().label || c.data?.label)).filter(Boolean).join('|');
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
    const selectRow = (view.components || [])[0];
    const select = (selectRow.components || [])[0];
    const j = select.toJSON ? select.toJSON() : select;
    assert.strictEqual(j.placeholder, 'Select a container to edit', 'placeholder');
    assert.ok(j.disabled === true, 'select disabled when empty');
    assert.ok((j.options || [])[0].value === 'none', 'empty option');
    assert.ok(!(j.options || []).some(o => o.default), 'no default option');
  });

  await test('main panel with containers always shows placeholder and no default selection', () => {
    const s = createSession('u1', 'g1', 'c1', 'components_v2');
    s.state = createDefaultComponentsV2State(); // 1 container
    const view1 = buildMainPanel(s);
    const j1 = ((view1.components || [])[0].components || [])[0].toJSON();
    assert.strictEqual(j1.placeholder, 'Select a container to edit');
    assert.ok(!(j1.options || []).some(o => o.default), 'no default with one container');

    s.state.root.push(createContainer());
    const view2 = buildMainPanel(s);
    const j2 = ((view2.components || [])[0].components || [])[0].toJSON();
    assert.strictEqual(j2.placeholder, 'Select a container to edit');
    assert.ok(!(j2.options || []).some(o => o.default), 'no default with multiple containers');
  });

  await test('returning to main panel restores placeholder without default selection', () => {
    const s = createSession('u1', 'g1', 'c1', 'components_v2');
    s.state = createDefaultComponentsV2State();
    s.selectedNodeId = s.state.root[0]._id;
    const view = buildMainPanel(s); // render as if returned to main panel
    const j = ((view.components || [])[0].components || [])[0].toJSON();
    assert.strictEqual(j.placeholder, 'Select a container to edit');
    assert.ok(!(j.options || []).some(o => o.default), 'no default after selection in session');
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
    const all = (view.components || []).flatMap(r => (r.components || []));
    const add = all.find(c => (c.toJSON?.().custom_id || c.data?.custom_id) === `bld:${s.id}:prop:embed_add_field`);
    const tools = all.find(c => (c.toJSON?.().custom_id || c.data?.custom_id) === `bld:${s.id}:nav:embed_field_tools`);
    const edit = all.find(c => (c.toJSON?.().custom_id || c.data?.custom_id) === `bld:${s.id}:prop:embed_edit`);
    assert.ok(add && !(add.toJSON?.().disabled || add.data?.disabled), 'add field enabled');
    assert.ok(tools && !(tools.toJSON?.().disabled || tools.data?.disabled), 'field tools enabled');
    assert.ok(edit && (edit.toJSON?.().disabled || edit.data?.disabled), 'edit section disabled for fields');
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
    const all = (view.components || []).flatMap(r => (r.components || []));
    const confirm = all.find(c => (c.toJSON?.().custom_id || c.data?.custom_id) === `bld:${s.id}:pub:confirm`);
    assert.ok(confirm && (confirm.toJSON?.().disabled || confirm.data?.disabled), 'confirm disabled without destination');

    s.publishChannelId = '123';
    const view2 = buildPublishMenu(s);
    const all2 = (view2.components || []).flatMap(r => (r.components || []));
    const confirm2 = all2.find(c => (c.toJSON?.().custom_id || c.data?.custom_id) === `bld:${s.id}:pub:confirm`);
    assert.ok(confirm2 && !(confirm2.toJSON?.().disabled || confirm2.data?.disabled), 'confirm enabled when valid and destination set');
  });

  console.log(JSON.stringify(results, null, 2));
  const failed = results.filter(r => !r.ok);
  console.log('FAILED=' + failed.length);
  if (failed.length) process.exit(1);
})();
