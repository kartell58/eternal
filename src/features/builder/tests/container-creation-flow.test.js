const assert = require('assert');

function freshModules() {
  delete require.cache[require.resolve('../services/session.service')];
  delete require.cache[require.resolve('../interactions/navigation')];
  delete require.cache[require.resolve('../interactions/components')];
  delete require.cache[require.resolve('../interactions/properties')];
  delete require.cache[require.resolve('../interactions/publishing')];
}

(async () => {
  const results = [];
  const test = async (name, fn) => { try { await fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: e.message, stack: e.stack }); } };

  function mockInteraction(session, customId, opts = {}) {
    return {
      customId,
      user: { id: session.userId },
      guildId: session.guildId,
      values: opts.values || [],
      isButton: () => opts.isButton !== false,
      isStringSelectMenu: () => !!opts.isSelect,
      isChatInputCommand: () => false,
      deferred: false,
      replied: false,
      async update(payload) { this.updated = payload; this.replied = true; return payload; },
      async reply(payload) { this.repliedPayload = payload; this.replied = true; return payload; },
      async followUp(payload) { this.followed = payload; return payload; },
      async deferUpdate() { this.deferredUpdate = true; return; }
    };
  }

  function idsFromView(view) {
    const ids = [];
    for (const row of (view.components || [])) {
      for (const c of (row.components || [])) {
        const j = typeof c.toJSON === 'function' ? c.toJSON() : c;
        if (j.custom_id) ids.push(j.custom_id);
      }
    }
    return ids;
  }

  await test('creating the first container opens its editor immediately', async () => {
    freshModules();
    const { createSession, getSession } = require('../services/session.service');
    const { handleNavigation } = require('../interactions/navigation');
    const s = createSession('u1', 'g1', 'c1', 'components_v2');
    s.state.root = []; // no containers
    s.selectedNodeId = null;
    const i = mockInteraction(s, `bld:${s.id}:nav:add_container_main`);
    await handleNavigation(i, { sid: s.id });
    const session = getSession(s.id);
    assert.strictEqual(session.state.root.length, 1, 'one container created');
    assert.strictEqual(session.selectedNodeId, session.state.root[0]._id, 'selected is created container');
    assert.strictEqual(session.view, 'editor');
    assert.ok(i.updated, 'view updated');
    const ids = idsFromView(i.updated).join(' ');
    assert.ok(ids.includes(':nav:cv2_select') || ids.includes(':cmp:add'), 'cv2 editor shown');
  });

  await test('creating a subsequent container preserves existing containers and selection', async () => {
    freshModules();
    const { createSession, getSession } = require('../services/session.service');
    const { handleNavigation } = require('../interactions/navigation');
    const s = createSession('u1', 'g1', 'c1', 'components_v2');
    const first = s.state.root[0];
    const firstId = first._id;
    s.selectedNodeId = firstId;
    s.view = 'home';
    const i = mockInteraction(s, `bld:${s.id}:nav:add_container_main`);
    await handleNavigation(i, { sid: s.id });
    const session = getSession(s.id);
    assert.strictEqual(session.state.root.length, 2, 'two containers total');
    assert.ok(session.state.root.some(c => c._id === firstId), 'first container preserved');
    assert.strictEqual(session.selectedNodeId, firstId, 'existing selection preserved');
    assert.strictEqual(session.view, 'home');
    assert.ok(i.updated && i.updated.content && i.updated.content.includes('Painel de Criação de Container'), 'main panel shown');
  });

  await test('selecting an existing container opens its editor with correct ID preserved', async () => {
    freshModules();
    const { createSession, getSession } = require('../services/session.service');
    const { handleNavigation } = require('../interactions/navigation');
    const s = createSession('u1', 'g1', 'c1', 'components_v2');
    const c1 = s.state.root[0];
    const c2 = { ...require('../schemas/components-v2.schema').createContainer(), _id: 'contB000' };
    s.state.root.push(c2);
    s.selectedNodeId = c1._id;
    const i = mockInteraction(s, `bld:${s.id}:nav:container_select`, { isButton: false, isSelect: true, values: [c2._id] });
    await handleNavigation(i, { sid: s.id });
    const session = getSession(s.id);
    assert.strictEqual(session.selectedNodeId, c2._id, 'selected container ID preserved/set');
    assert.strictEqual(session.view, 'editor');
    assert.ok(i.updated, 'editor opened');
    const ids = idsFromView(i.updated).join(' ');
    assert.ok(ids.includes(':nav:cv2_select'), 'cv2 editor shown');
  });

  await test('unauthorized user cannot manipulate another user\'s container session', async () => {
    freshModules();
    const { createSession, getSession } = require('../services/session.service');
    const { handleNavigation } = require('../interactions/navigation');
    const s = createSession('owner', 'g1', 'c1', 'components_v2');
    s.state.root = [];
    const i = mockInteraction(s, `bld:${s.id}:nav:add_container_main`);
    i.user = { id: 'intruder' };
    await handleNavigation(i, { sid: s.id });
    const session = getSession(s.id);
    assert.strictEqual(session.state.root.length, 0, 'state unchanged');
    assert.ok(i.repliedPayload && i.repliedPayload.flags === 64, 'ephemeral rejection');
    assert.ok(/another user/i.test(i.repliedPayload.content || ''), 'ownership message');
  });

  await test('wrong guild cannot manipulate session', async () => {
    freshModules();
    const { createSession, getSession } = require('../services/session.service');
    const { handleNavigation } = require('../interactions/navigation');
    const s = createSession('u1', 'g1', 'c1', 'components_v2');
    s.state.root = [];
    const i = mockInteraction(s, `bld:${s.id}:nav:add_container_main`);
    i.guildId = 'g2';
    await handleNavigation(i, { sid: s.id });
    const session = getSession(s.id);
    assert.strictEqual(session.state.root.length, 0, 'state unchanged');
    assert.ok(i.repliedPayload && i.repliedPayload.flags === 64, 'ephemeral rejection');
  });

  console.log(JSON.stringify(results, null, 2));
  const failed = results.filter(r => !r.ok);
  console.log('FAILED=' + failed.length);
  if (failed.length) process.exit(1);
})();
