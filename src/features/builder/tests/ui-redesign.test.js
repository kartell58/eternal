const assert = require('assert');
const { createSession } = require('../services/session.service');
const { buildHome, buildEmbedEditor, buildCv2Editor } = require('../interactions/navigation');
const { buildPublishMenu } = require('../interactions/publishing');
const { createDefaultEmbedState } = require('../schemas/embed.schema');
const { createDefaultComponentsV2State } = require('../schemas/components-v2.schema');

(async () => {
  const results = [];
  const test = async (name, fn) => { try { await fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: e.message }); } };

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

  await test('home view exposes core navigation actions', () => {
    const s = createSession('u1', 'g1', 'c1', 'embed');
    const view = buildHome(s);
    assert.ok(view.embeds && view.embeds.length === 1, 'home embed');
    const ids = customIds(view).join(' ');
    assert.ok(ids.includes(':nav:new_embed'));
    assert.ok(ids.includes(':nav:new_cv2'));
    assert.ok(ids.includes(':nav:continue'));
    assert.ok(ids.includes(':nav:open_drafts'));
    assert.ok(ids.includes(':nav:open_templates'));
    assert.ok(ids.includes(':nav:edit_existing'));
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
