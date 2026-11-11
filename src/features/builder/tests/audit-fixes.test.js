const assert = require('assert');
const fs = require('fs');
const path = require('path');

function cleanup(files) {
  for (const f of files) {
    try { fs.unlinkSync(f); } catch {}
    try { fs.rmSync(f, { force: true }); } catch {}
  }
  // remove corrupt backups created in cwd for these base names
  for (const base of ['builder-drafts.json','builder-templates.json','builder-published-actions.json']) {
    try {
      for (const name of fs.readdirSync(process.cwd())) {
        if (name.startsWith(base + '.corrupt.') || name.endsWith('.lock') || name.includes('.tmp')) {
          try { fs.rmSync(path.join(process.cwd(), name), { force: true }); } catch {}
        }
      }
    } catch {}
  }
}

(async () => {
  const results = [];
  const test = async (name, fn) => { try { await fn(); results.push({name, ok:true}); } catch (e) { results.push({name, ok:false, err:e.message}); } };

  const cwd = process.cwd();
  const draftFile = path.join(cwd, 'builder-drafts.json');
  const tplFile = path.join(cwd, 'builder-templates.json');
  const actFile = path.join(cwd, 'builder-published-actions.json');
  cleanup([draftFile, tplFile, actFile]);

  // fresh requires where needed
  delete require.cache[require.resolve('../services/draft.service')];
  delete require.cache[require.resolve('../services/template.service')];
  delete require.cache[require.resolve('../services/published-actions.service')];
  delete require.cache[require.resolve('../utils/published-runtime')];
  delete require.cache[require.resolve('../interactions/router')];

  const { createDefaultEmbedState } = require('../schemas/embed.schema');
  const { createDefaultComponentsV2State } = require('../schemas/components-v2.schema');
  const draftSvc = require('../services/draft.service');
  const tplSvc = require('../services/template.service');
  const { collectActionsFromState } = require('../utils/published-runtime');
  const { getAction } = require('../services/published-actions.service');
  const router = require('../interactions/router');
  const { buildComponentsV2Payload } = require('../builders/components-v2.builder');
  const { validateComponentsV2State } = require('../utils/validator');
  const sessionSvc = require('../services/session.service');

  await test('unauthorized draft overwrite blocked', () => {
    const d = draftSvc.saveDraft('u1','g1', createDefaultEmbedState(), null, 'Mine');
    let threw = false;
    try { draftSvc.saveDraft('u2','g1', createDefaultEmbedState(), d.id, 'Hack'); } catch (e) { threw = /Not authorized/.test(e.message); }
    assert.ok(threw, 'expected authorization error');
    const still = draftSvc.getDraftFor('u1','g1',d.id);
    assert.ok(still && still.userId === 'u1' && still.name === 'Mine');
    draftSvc.deleteDraft('u1','g1',d.id);
  });

  await test('unauthorized template overwrite blocked', () => {
    const t = tplSvc.saveTemplate('u1','g1', createDefaultEmbedState(), 'T1');
    let threw = false;
    try { tplSvc.saveTemplate('u2','g1', createDefaultEmbedState(), 'Hack', t.id); } catch (e) { threw = /Not authorized/.test(e.message); }
    assert.ok(threw, 'expected authorization error');
    const still = tplSvc.getTemplateFor('u1','g1',t.id);
    assert.ok(still && still.userId === 'u1');
    tplSvc.deleteTemplate('u1','g1',t.id);
  });

  await test('cross-guild draft/template access denied', () => {
    const d = draftSvc.saveDraft('u1','g1', createDefaultEmbedState(), null, 'D');
    const t = tplSvc.saveTemplate('u1','g1', createDefaultEmbedState(), 'T');
    assert.strictEqual(draftSvc.getDraftFor('u1','g2',d.id), null);
    assert.strictEqual(tplSvc.getTemplateFor('u1','g2',t.id), null);
    assert.ok(draftSvc.listDrafts('u1','g2').length === 0);
    assert.ok(tplSvc.listTemplates('u1','g2').length === 0);
    draftSvc.deleteDraft('u1','g1',d.id);
    tplSvc.deleteTemplate('u1','g1',t.id);
  });

  await test('custom component IDs route and execute published action', async () => {
    cleanup([actFile]);
    delete require.cache[require.resolve('../services/published-actions.service')];
    delete require.cache[require.resolve('../utils/published-runtime')];
    delete require.cache[require.resolve('../interactions/router')];
    const pa = require('../services/published-actions.service');
    const rt = require('../utils/published-runtime');
    const rtr = require('../interactions/router');
    const st = createDefaultComponentsV2State();
    st.root[0].components.push({ _id:'ar1', type:'action_row', components:[{_id:'btn1',type:'button',label:'X',style:1,custom_id:'my_custom_id',url:'',action:{type:'ephemeral',value:'ok'}}] });
    const payload = buildComponentsV2Payload(st);
    const sentId = payload.components[0].toJSON().components[1].components[0].custom_id;
    assert.strictEqual(sentId, 'my_custom_id');
    rt.collectActionsFromState(st, 'msg_custom', { ownerId:'owner1', guildId:'g1', channelId:'c1' });
    assert.ok(pa.getAction('msg_custom','my_custom_id'));
    let replied = null;
    const interaction = {
      customId: 'my_custom_id', message: { id: 'msg_custom' }, guildId: 'g1', channelId: 'c1', user: { id: 'u2' },
      isButton: () => true, isStringSelectMenu: () => false, isChatInputCommand: () => false,
      deferred: false, replied: false,
      reply: async (p) => { replied = p; interaction.replied = true; },
      followUp: async (p) => { replied = p; }
    };
    const handled = await rtr.routeBuilderInteraction(interaction);
    assert.ok(handled, 'should handle custom id');
    assert.ok(replied && replied.content === 'ok' && replied.flags === 64);
  });

  await test('unregistered component interactions are not swallowed as handled', async () => {
    delete require.cache[require.resolve('../interactions/router')];
    const rtr = require('../interactions/router');
    const interaction = {
      customId: 'totally_unknown_button', message: { id: 'msg_none' }, guildId: 'g1', channelId: 'c1', user: { id: 'u1' },
      isButton: () => true, isStringSelectMenu: () => false, isChatInputCommand: () => false,
      deferred: false, replied: false,
      reply: async () => { throw new Error('should not reply'); },
      followUp: async () => { throw new Error('should not followUp'); }
    };
    const handled = await rtr.routeBuilderInteraction(interaction);
    assert.strictEqual(handled, false);
  });

  await test('unauthorized update/internal actions blocked and mentions disabled', async () => {
    cleanup([actFile]);
    delete require.cache[require.resolve('../services/published-actions.service')];
    delete require.cache[require.resolve('../utils/published-runtime')];
    delete require.cache[require.resolve('../interactions/router')];
    const pa = require('../services/published-actions.service');
    const rtr = require('../interactions/router');
    pa.setAction('m1', 'act_upd', { type:'update', value:'@everyone hi', kind:'button', ownerId:'owner', guildId:'g1', channelId:'c1' });
    let replied = null;
    const interaction = {
      customId: 'act_upd', message: { id: 'm1' }, guildId: 'g1', channelId: 'c1', user: { id: 'other' },
      isButton: () => true, isStringSelectMenu: () => false, isChatInputCommand: () => false,
      deferred: false, replied: false,
      reply: async (p) => { replied = p; }, followUp: async (p) => { replied = p; }, update: async (p)=>{ replied = p; }
    };
    await rtr.routeBuilderInteraction(interaction);
    assert.ok(replied && /not authorized/i.test(replied.content));
    assert.deepStrictEqual(replied.allowedMentions, { parse: [] });

    pa.setAction('m1', 'act_int', { type:'internal', value:'noop', kind:'button', ownerId:'owner', guildId:'g1', channelId:'c1' });
    replied = null;
    await rtr.routeBuilderInteraction(interaction);
    assert.ok(replied && /not authorized/i.test(replied.content));
  });

  await test('channel action allows others but uses safe mentions', async () => {
    delete require.cache[require.resolve('../interactions/router')];
    const pa = require('../services/published-actions.service');
    const rtr = require('../interactions/router');
    pa.setAction('m2', 'act_chan', { type:'channel', value:'hello @everyone', kind:'button', ownerId:'owner', guildId:'g1', channelId:'c1' });
    let replied = null;
    const interaction = {
      customId: 'act_chan', message: { id: 'm2' }, guildId: 'g1', channelId: 'c1', user: { id: 'other' },
      isButton: () => true, isStringSelectMenu: () => false, isChatInputCommand: () => false,
      deferred: false, replied: false,
      reply: async (p) => { replied = p; }, followUp: async (p) => { replied = p; }
    };
    await rtr.routeBuilderInteraction(interaction);
    assert.ok(replied && replied.content.includes('@everyone'));
    assert.deepStrictEqual(replied.allowedMentions, { parse: [] });
    assert.strictEqual(replied.flags, undefined);
  });

  await test('corrupted persistence quarantined/backed up and does not overwrite with corrupt parse', () => {
    cleanup([draftFile]);
    fs.writeFileSync(draftFile, '{bad json!!!', 'utf8');
    delete require.cache[require.resolve('../services/draft.service')];
    const ds = require('../services/draft.service');
    const status = ds.getLoadStatus();
    assert.ok(status.recovered === true);
    const list = ds.listDrafts('u','g');
    assert.deepStrictEqual(list, []);
    const backups = fs.readdirSync(cwd).filter(n => n.startsWith('builder-drafts.json.corrupt.'));
    assert.ok(backups.length >= 1, 'expected corrupt backup');
  });

  await test('concurrent draft saves are serialized (no lost writes)', async () => {
    cleanup([draftFile]);
    delete require.cache[require.resolve('../services/draft.service')];
    const ds = require('../services/draft.service');
    const ops = [];
    for (let i=0;i<10;i++) ops.push(Promise.resolve().then(()=>ds.saveDraft('u1','g1', createDefaultEmbedState(), null, 'D'+i)));
    const saved = await Promise.all(ops);
    const ids = new Set(saved.map(s=>s.id));
    assert.strictEqual(ids.size, 10);
    const list = ds.listDrafts('u1','g1');
    assert.strictEqual(list.length, 10);
  });

  await test('session expiration and cleanup', () => {
    const s = sessionSvc.createSession('u1','g1','c1','embed');
    s.updatedAt = Date.now() - (sessionSvc.SESSION_TTL_MS + 1000);
    sessionSvc.sessions.set(s.id, s);
    const got = sessionSvc.getSession(s.id);
    assert.strictEqual(got, null);
    const r = sessionSvc.requireSession(s.id, 'u1');
    assert.ok(r.error && /expired/i.test(r.error) && /draft|template|resume/i.test(r.error));
  });

  await test('components v2 payload/validation basics', () => {
    const st = createDefaultComponentsV2State();
    const v = validateComponentsV2State(st);
    assert.ok(v.valid, JSON.stringify(v.errors));
    const p = buildComponentsV2Payload(st);
    const j = p.components[0].toJSON();
    assert.strictEqual(j.type, 17);
  });

  await test('published actions recover after module reload', () => {
    cleanup([actFile]);
    delete require.cache[require.resolve('../services/published-actions.service')];
    const pa1 = require('../services/published-actions.service');
    pa1.setAction('msgR', 'cidR', { type:'ephemeral', value:'persisted', kind:'button', ownerId:'o', guildId:'g', channelId:'c' });
    delete require.cache[require.resolve('../services/published-actions.service')];
    const pa2 = require('../services/published-actions.service');
    const a = pa2.getAction('msgR', 'cidR');
    assert.ok(a && a.value === 'persisted');
  });

  cleanup([draftFile, tplFile, actFile]);
  console.log(JSON.stringify(results, null, 2));
  const failed = results.filter(r=>!r.ok);
  console.log('FAILED=' + failed.length);
  if (failed.length) process.exit(1);
})();
