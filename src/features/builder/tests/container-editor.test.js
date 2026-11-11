const assert = require('assert');
const { MessageFlags } = require('discord.js');

function freshModules() {
  delete require.cache[require.resolve('../services/session.service')];
  delete require.cache[require.resolve('../interactions/navigation')];
  delete require.cache[require.resolve('../interactions/components')];
  delete require.cache[require.resolve('../interactions/properties')];
  delete require.cache[require.resolve('../interactions/publishing')];
  delete require.cache[require.resolve('../interactions/container-editor')];
}

(async () => {
  const results = [];
  const test = async (name, fn) => { try { await fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: e.message, stack: e.stack }); } };

  function mockInteraction(session, customId, opts = {}) {
    return {
      customId,
      user: { id: opts.userId || session.userId },
      guildId: opts.guildId || session.guildId,
      values: opts.values || [],
      client: opts.client || {},
      fields: opts.fields,
      isButton: () => opts.type ? opts.type === 'button' : !opts.isSelect && !opts.isModal,
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
    let out = [];
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

  await test('selecting a container opens editor in the same ephemeral message', async () => {
    freshModules();
    const { createSession, getSession } = require('../services/session.service');
    const { handleNavigation } = require('../interactions/navigation');
    const s = createSession('u1', 'g1', 'c1', 'components_v2');
    const c = s.state.root[0];
    const i = mockInteraction(s, `bld:${s.id}:nav:container_select`, { isSelect: true, values: [c._id] });
    await handleNavigation(i, { sid: s.id });
    const session = getSession(s.id);
    assert.ok(i.updated, 'same message updated');
    assert.ok(!i.repliedPayload, 'no new reply message');
    assert.ok(hasFlag(i.updated, MessageFlags.Ephemeral), 'ephemeral');
    assert.ok(hasFlag(i.updated, MessageFlags.IsComponentsV2), 'components v2');
    assert.strictEqual(session.selectedNodeId, c._id);
  });

  await test('container editor displays correct preview, title, and controls in order', async () => {
    freshModules();
    const { createSession } = require('../services/session.service');
    const { buildContainerEditor } = require('../interactions/navigation');
    const s = createSession('u1', 'g1', 'c1', 'components_v2');
    const c = s.state.root[0];
    c.accent_color = 0x5865f2;
    c.components[0].content = 'Preview text here';
    s.selectedNodeId = c._id;
    const view = buildContainerEditor(s);
    assert.ok(hasFlag(view, MessageFlags.Ephemeral), 'ephemeral');
    const text = allText(view.components);
    assert.ok(text.includes('Editing Container'), 'title present');
    assert.ok(text.includes('Preview text here'), 'actual preview content present');
    const ids = walkIds(view.components);
    const addIdx = ids.findIndex(id => id.endsWith(':nav:ce_add_item'));
    const editIdx = ids.findIndex(id => id.endsWith(':nav:ce_edit_item'));
    const colorIdx = ids.findIndex(id => id.endsWith(':nav:ce_color'));
    const delIdx = ids.findIndex(id => id.endsWith(':nav:ce_delete'));
    const backIdx = ids.findIndex(id => id.endsWith(':nav:ce_back'));
    assert.ok(addIdx >= 0 && editIdx > addIdx && colorIdx > editIdx && delIdx > colorIdx && backIdx > delIdx, 'controls in expected order');
  });

  await test('add item adds supported item to container and updates same ephemeral editor', async () => {
    freshModules();
    const { createSession, getSession } = require('../services/session.service');
    const { handleNavigation } = require('../interactions/navigation');
    const s = createSession('u1', 'g1', 'c1', 'components_v2');
    const c = s.state.root[0];
    s.selectedNodeId = c._id;
    s.containerEditorContainerId = c._id;
    const before = c.components.length;
    const i = mockInteraction(s, `bld:${s.id}:nav:ce_add_item`, { isSelect: true, values: ['text_display'] });
    await handleNavigation(i, { sid: s.id });
    const session = getSession(s.id);
    const container = session.state.root.find(x => x._id === c._id);
    assert.strictEqual(container.components.length, before + 1);
    assert.strictEqual(container.components[container.components.length - 1].type, 'text_display');
    assert.ok(i.updated && hasFlag(i.updated, MessageFlags.Ephemeral), 'ephemeral editor updated');
    assert.ok(!i.repliedPayload, 'no extra reply');
  });

  await test('edit item select opens existing item modal for correct item', async () => {
    freshModules();
    const { createSession, getSession } = require('../services/session.service');
    const { handleNavigation } = require('../interactions/navigation');
    const s = createSession('u1', 'g1', 'c1', 'components_v2');
    const c = s.state.root[0];
    s.selectedNodeId = c._id;
    s.containerEditorContainerId = c._id;
    const item = c.components[0];
    const i = mockInteraction(s, `bld:${s.id}:nav:ce_edit_item`, { isSelect: true, values: [item._id] });
    await handleNavigation(i, { sid: s.id });
    const session = getSession(s.id);
    assert.ok(i.shownModal, 'modal shown');
    const modalId = i.shownModal.data?.custom_id || i.shownModal.customId;
    assert.ok(String(modalId).includes(':prop:cv2_modal'), 'existing cv2 edit modal');
    assert.strictEqual(session.selectedNodeId, item._id, 'selected item set for edit');
    assert.strictEqual(session.containerEditorContainerId, c._id, 'container context preserved');
  });

  await test('select color opens modal and updates accent color and preview in same message', async () => {
    freshModules();
    const { createSession, getSession } = require('../services/session.service');
    const { handleNavigation } = require('../interactions/navigation');
    const { handleProperties } = require('../interactions/properties');
    const s = createSession('u1', 'g1', 'c1', 'components_v2');
    const c = s.state.root[0];
    s.selectedNodeId = c._id; s.containerEditorContainerId = c._id;
    const open = mockInteraction(s, `bld:${s.id}:nav:ce_color`);
    await handleNavigation(open, { sid: s.id });
    assert.ok(open.shownModal, 'color modal shown');
    const fields = { getTextInputValue: (k) => k === 'accent_color' ? '#5865F2' : '' };
    const submit = mockInteraction(s, `bld:${s.id}:prop:ce_color_modal`, { isModal: true, fields });
    await handleProperties(submit, { sid: s.id });
    const session = getSession(s.id);
    const container = session.state.root.find(x => x._id === c._id);
    assert.strictEqual(container.accent_color, 0x5865F2);
    assert.ok(submit.updated && hasFlag(submit.updated, MessageFlags.Ephemeral), 'editor updated');
  });

  await test('delete container requires confirmation and preserves other containers then returns to main panel', async () => {
    freshModules();
    const { createSession, getSession } = require('../services/session.service');
    const { handleNavigation } = require('../interactions/navigation');
    const { createContainer } = require('../schemas/components-v2.schema');
    const s = createSession('u1', 'g1', 'c1', 'components_v2');
    const c1 = s.state.root[0]; const c2 = createContainer(); s.state.root.push(c2);
    s.selectedNodeId = c1._id; s.containerEditorContainerId = c1._id;
    const del = mockInteraction(s, `bld:${s.id}:nav:ce_delete`);
    await handleNavigation(del, { sid: s.id });
    assert.ok(del.updated, 'confirmation shown');
    const ids = walkIds(del.updated.components);
    assert.ok(ids.some(id => id.endsWith(':nav:ce_delete_confirm')), 'confirm button');
    assert.ok(ids.some(id => id.endsWith(':nav:ce_delete_cancel')), 'cancel button');
    const confirm = mockInteraction(s, `bld:${s.id}:nav:ce_delete_confirm`);
    await handleNavigation(confirm, { sid: s.id });
    const session = getSession(s.id);
    assert.strictEqual(session.state.root.length, 1);
    assert.strictEqual(session.state.root[0]._id, c2._id);
    assert.ok(confirm.updated && hasFlag(confirm.updated, MessageFlags.Ephemeral), 'main panel shown ephemerally');
    assert.ok((confirm.updated.content || '').includes('Container Creation Panel'), 'returned to main panel');
  });

  await test('deleting last container returns to a valid main panel state (no containers)', async () => {
    freshModules();
    const { createSession, getSession } = require('../services/session.service');
    const { handleNavigation } = require('../interactions/navigation');
    const { buildMainPanel } = require('../interactions/navigation');
    const s = createSession('u1', 'g1', 'c1', 'components_v2');
    const c = s.state.root[0];
    s.selectedNodeId = c._id; s.containerEditorContainerId = c._id;
    const confirm = mockInteraction(s, `bld:${s.id}:nav:ce_delete_confirm`);
    await handleNavigation(confirm, { sid: s.id });
    const session = getSession(s.id);
    assert.strictEqual(session.state.root.length, 0);
    assert.strictEqual(session.view, 'home');
    assert.ok(confirm.updated && (confirm.updated.content || '').includes('Container Creation Panel'));
    const main = buildMainPanel(session);
    const select = (main.components[0].components[0].toJSON ? main.components[0].components[0].toJSON() : main.components[0].components[0]);
    assert.strictEqual(select.placeholder, 'Select a container to edit');
    assert.ok(select.disabled === true);
  });

  await test('back returns to main panel in same message without losing changes', async () => {
    freshModules();
    const { createSession, getSession } = require('../services/session.service');
    const { handleNavigation } = require('../interactions/navigation');
    const s = createSession('u1', 'g1', 'c1', 'components_v2');
    const c = s.state.root[0];
    c.accent_color = 123;
    s.selectedNodeId = c._id; s.containerEditorContainerId = c._id;
    const back = mockInteraction(s, `bld:${s.id}:nav:ce_back`);
    await handleNavigation(back, { sid: s.id });
    const session = getSession(s.id);
    assert.strictEqual(session.state.root[0].accent_color, 123, 'changes preserved');
    assert.strictEqual(session.view, 'home');
    assert.ok(back.updated && hasFlag(back.updated, MessageFlags.Ephemeral), 'ephemeral update');
    assert.ok((back.updated.content || '').includes('Container Creation Panel'), 'main panel shown');
  });

  await test('unauthorized user cannot interact with another user\'s container editor', async () => {
    freshModules();
    const { createSession, getSession } = require('../services/session.service');
    const { handleNavigation } = require('../interactions/navigation');
    const s = createSession('owner', 'g1', 'c1', 'components_v2');
    s.selectedNodeId = s.state.root[0]._id; s.containerEditorContainerId = s.state.root[0]._id;
    const i = mockInteraction(s, `bld:${s.id}:nav:ce_delete`, { userId: 'intruder' });
    await handleNavigation(i, { sid: s.id });
    assert.ok(i.repliedPayload && i.repliedPayload.flags === 64);
    assert.ok(/another user/i.test(i.repliedPayload.content || ''));
  });

  console.log(JSON.stringify(results, null, 2));
  const failed = results.filter(r => !r.ok);
  console.log('FAILED=' + failed.length);
  if (failed.length) process.exit(1);
})();
