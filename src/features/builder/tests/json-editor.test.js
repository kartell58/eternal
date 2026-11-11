const assert = require('assert');
const { createSession } = require('../services/session.service');
const { getDefaultJsonTemplateString, isPristineDefaultState, normalizeImportedDocument, DEFAULT_JSON_TEMPLATE } = require('../utils/json-document');
const { createDefaultComponentsV2State } = require('../schemas/components-v2.schema');
const { validateComponentsV2State } = require('../utils/validator');

(async () => {
  const results = [];
  const test = async (name, fn) => { try { await fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: e.message, stack: e.stack }); } };

  await test('default JSON template is valid JSON matching v1 document shape', () => {
    const str = getDefaultJsonTemplateString();
    const parsed = JSON.parse(str);
    assert.strictEqual(parsed.version, '1.0');
    assert.ok(Array.isArray(parsed.containers) && parsed.containers.length === 1);
    assert.strictEqual(parsed.containers[0].type, 'container');
    assert.strictEqual(parsed.containers[0].accent_color, 5793266);
    assert.ok(parsed.containers[0].items[0].content.includes('Criação de Containers'));
  });

  await test('pristine default CV2 session uses default template, modified/draft does not', () => {
    const s = createSession('u1', 'g1', 'c1', 'components_v2');
    assert.strictEqual(isPristineDefaultState(s), true);
    s.draftId = 'draft_1';
    assert.strictEqual(isPristineDefaultState(s), false);
    const s2 = createSession('u1', 'g1', 'c1', 'components_v2');
    s2.state.root[0].components[0].content = 'changed';
    assert.strictEqual(isPristineDefaultState(s2), false);
  });

  await test('normalize imports v1 template into valid components_v2 state', () => {
    const res = normalizeImportedDocument(DEFAULT_JSON_TEMPLATE);
    assert.ok(!res.error, res.error);
    assert.strictEqual(res.state.type, 'components_v2');
    assert.ok(Array.isArray(res.state.root) && res.state.root.length === 1);
    assert.strictEqual(res.state.root[0].accent_color, 5793266);
    assert.strictEqual(res.state.root[0].components[0].type, 'text_display');
    assert.ok(res.state.root[0].components[0].content.includes('Criação de Containers'));
    const v = validateComponentsV2State(res.state);
    assert.ok(v.valid, JSON.stringify(v.errors));
  });

  await test('normalize imports internal state and wrapped state', () => {
    const st = createDefaultComponentsV2State();
    const r1 = normalizeImportedDocument(st);
    assert.ok(!r1.error && r1.state.type === 'components_v2');
    const r2 = normalizeImportedDocument({ state: st });
    assert.ok(!r2.error && r2.state.type === 'components_v2');
  });

  await test('normalize rejects unsupported structures', () => {
    assert.ok(normalizeImportedDocument(null).error);
    assert.ok(normalizeImportedDocument({}).error);
    assert.ok(normalizeImportedDocument({ type: 'nope' }).error);
    assert.ok(normalizeImportedDocument({ type: 'components_v2' }).error);
    assert.ok(normalizeImportedDocument({ version: '1.0', containers: [] }).error);
  });

  console.log(JSON.stringify(results, null, 2));
  const failed = results.filter(r => !r.ok);
  console.log('FAILED=' + failed.length);
  if (failed.length) process.exit(1);
})();
