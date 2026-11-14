import assert from 'assert';
import { MessageFlags } from 'discord.js';
import { sessions, createSession, getSession } from '../services/session.service.js';
import { handleNavigation, buildContainerEditor } from '../interactions/navigation.js';
import { handleProperties } from '../interactions/properties.js';
import { createContainer } from '../schemas/components-v2.schema.js';

function freshModules() {
  sessions.clear();
}

(async () => {
  const results = [];
  const test = async (name, fn) => { try { freshModules(); await fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: e.message, stack: e.stack }); } };

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
    const s = createSession('u1', 'g1', 'c1', 'components_v2');
    const c = s.state.root[0];
    s.selectedNodeId = c._id;
    s.containerEditorContainerId = c._id;
    const before = c.components.length;
    const i = mockInteraction(s, `bld:${s.id}:nav:ce_add_item`, { isSelect: true, values: ['separator'] });
    await handleNavigation(i, { sid: s.id });
    const session = getSession(s.id);
    const container = session.state.root.find(x => x._id === c._id);
    assert.strictEqual(container.components.length, before + 1);
    assert.strictEqual(container.components[container.components.length - 1].type, 'separator');
    assert.ok(i.updated && hasFlag(i.updated, MessageFlags.Ephemeral), 'ephemeral editor updated');
    assert.ok(!i.repliedPayload, 'no extra reply');
  });

  await test('add text display opens modal and adds edited text on submit', async () => {
    const s = createSession('u1', 'g1', 'c1', 'components_v2');
    const c = s.state.root[0];
    s.selectedNodeId = c._id;
    s.containerEditorContainerId = c._id;
    const before = c.components.length;
    const i = mockInteraction(s, `bld:${s.id}:nav:ce_add_item`, { isSelect: true, values: ['text_display'] });
    await handleNavigation(i, { sid: s.id });
    assert.ok(i.shownModal, 'text display modal shown');
    let session = getSession(s.id);
    let container = session.state.root.find(x => x._id === c._id);
    assert.strictEqual(container.components.length, before, 'not added before submit');
    const submit = mockInteraction(s, `bld:${s.id}:prop:ce_add_text_display`, {
      isModal: true,
      fields: { getTextInputValue: (k) => k === 'content' ? 'Custom text' : '' }
    });
    await handleProperties(submit, { sid: s.id });
    session = getSession(s.id);
    container = session.state.root.find(x => x._id === c._id);
    assert.strictEqual(container.components.length, before + 1, 'added after submit');
    assert.strictEqual(container.components[container.components.length - 1].type, 'text_display');
    assert.strictEqual(container.components[container.components.length - 1].content, 'Custom text');
    assert.ok(submit.updated && hasFlag(submit.updated, MessageFlags.Ephemeral), 'container editor updated');
  });

  await test('edit item select opens existing item modal for correct item', async () => {
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

  await test('select color opens color screen and updates accent color in same message', async () => {
    const s = createSession('u1', 'g1', 'c1', 'components_v2');
    const c = s.state.root[0];
    s.selectedNodeId = c._id; s.containerEditorContainerId = c._id;
    const open = mockInteraction(s, `bld:${s.id}:nav:ce_color`);
    await handleNavigation(open, { sid: s.id });
    assert.ok(open.updated && hasFlag(open.updated, MessageFlags.Ephemeral), 'color screen shown');
    const ids = walkIds(open.updated.components);
    assert.ok(ids.some(id => id.endsWith(':nav:ce_color_select')), 'color select present');
    assert.ok(ids.some(id => id.endsWith(':nav:ce_color_back')), 'back present');
    const pick = mockInteraction(s, `bld:${s.id}:nav:ce_color_select`, { isSelect: true, values: ['discord_blue'] });
    await handleNavigation(pick, { sid: s.id });
    const session = getSession(s.id);
    const container = session.state.root.find(x => x._id === c._id);
    assert.strictEqual(container.accent_color, 0x5865F2);
    assert.ok(pick.updated && hasFlag(pick.updated, MessageFlags.Ephemeral), 'screen updated');
  });

  await test('delete container requires confirmation and preserves other containers then returns to main panel', async () => {
    const s = createSession('u1', 'g1', 'c1', 'components_v2');
    const c1 = s.state.root[0];
    const c2 = createContainer();
    s.state.root.push(c2);
    s.selectedNodeId = c1._id;
    s.containerEditorContainerId = c1._id;
    const ask = mockInteraction(s, `bld:${s.id}:nav:ce_delete`);
    await handleNavigation(ask, { sid: s.id });
    assert.ok(ask.updated && hasFlag(ask.updated, MessageFlags.Ephemeral), 'confirmation shown');
    assert.ok(allText(ask.updated.components).includes('Delete Container'), 'confirmation title');
    let session = getSession(s.id);
    assert.strictEqual(session.state.root.length, 2, 'not deleted before confirm');
    const confirm = mockInteraction(s, `bld:${s.id}:nav:ce_delete_confirm`);
    await handleNavigation(confirm, { sid: s.id });
    session = getSession(s.id);
    assert.strictEqual(session.state.root.length, 1, 'one container removed');
    assert.ok(session.state.root.some(x => x._id === c2._id), 'other container preserved');
    assert.ok(!session.state.root.some(x => x._id === c1._id), 'selected container removed');
    assert.strictEqual(session.view, 'home');
    assert.ok(confirm.updated && allText(confirm.updated.components).includes('Container Creation Panel'), 'returned to main panel');
  });

  await test('delete container is disabled and blocked when only one container exists', async () => {
    const s = createSession('u1', 'g1', 'c1', 'components_v2');
    const c = s.state.root[0];
    s.selectedNodeId = c._id;
    const view = buildContainerEditor(s);
    const ids = walkIds(view.components);
    assert.ok(ids.includes(`bld:${s.id}:nav:ce_delete`), 'delete button present');
    // Find disabled state in json
    let delBtn;
    function walk(node){ if(!node) return; if(Array.isArray(node)) return node.forEach(walk); const j=typeof node.toJSON==='function'?node.toJSON():node; if(j&&j.custom_id===`bld:${s.id}:nav:ce_delete`) delBtn=j; if(j&&Array.isArray(j.components)) j.components.forEach(walk); if(Array.isArray(node.components)) node.components.forEach(walk);} walk(view.components);
    assert.ok(delBtn && delBtn.disabled, 'delete disabled for single container');
    const i = mockInteraction(s, `bld:${s.id}:nav:ce_delete`);
    await handleNavigation(i, { sid: s.id });
    assert.ok(i.repliedPayload && i.repliedPayload.flags === 64, 'blocked with ephemeral reply');
    assert.ok(/mais de um container/i.test(i.repliedPayload.content || ''), 'warning message');
    assert.strictEqual(getSession(s.id).state.root.length, 1, 'container not deleted');
  });

  await test('back returns to main panel in same message without losing changes', async () => {
    const s = createSession('u1', 'g1', 'c1', 'components_v2');
    const c = s.state.root[0];
    c.accent_color = 0x123456;
    c.components[0].content = 'Keep me';
    s.selectedNodeId = c._id; s.containerEditorContainerId = c._id;
    const i = mockInteraction(s, `bld:${s.id}:nav:ce_back`);
    await handleNavigation(i, { sid: s.id });
    const session = getSession(s.id);
    assert.strictEqual(session.view, 'home');
    assert.ok(i.updated && allText(i.updated.components).includes('Container Creation Panel'), 'main panel returned');
    assert.ok(!i.repliedPayload, 'same message update');
    const container = session.state.root.find(x => x._id === c._id);
    assert.strictEqual(container.accent_color, 0x123456);
    assert.strictEqual(container.components[0].content, 'Keep me');
  });

  await test('unauthorized user cannot interact with another user\'s container editor', async () => {
    const s = createSession('owner', 'g1', 'c1', 'components_v2');
    const c = s.state.root[0];
    s.selectedNodeId = c._id; s.containerEditorContainerId = c._id;
    const i = mockInteraction(s, `bld:${s.id}:nav:ce_back`, { userId: 'intruder' });
    await handleNavigation(i, { sid: s.id });
    assert.ok(i.repliedPayload && i.repliedPayload.flags === 64, 'ephemeral rejection');
    assert.ok(/another user/i.test(i.repliedPayload.content || ''), 'ownership message');
    assert.ok(!i.updated, 'no editor update for intruder');
  });

  console.log(JSON.stringify(results, null, 2));
  const failed = results.filter(r => !r.ok);
  console.log('FAILED=' + failed.length);
  if (failed.length) process.exit(1);
})();
