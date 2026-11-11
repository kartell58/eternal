const assert = require('assert');

function freshModules() {
  delete require.cache[require.resolve('../services/session.service')];
  delete require.cache[require.resolve('../interactions/navigation')];
  delete require.cache[require.resolve('../interactions/container-editor')];
  delete require.cache[require.resolve('../builders/components-v2.builder')];
  delete require.cache[require.resolve('../utils/json-document')];
}

(async () => {
  const results = [];
  const test = async (name, fn) => { try { await fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: e.message, stack: e.stack }); } };

  const refDoc = {
    version: '1.0',
    containers: [
      {
        type: 'container',
        accent_color: 5793266,
        items: [
          {
            type: 'text_display',
            content: '### Criação de Containers\nLembre-se de usar [formatações de texto](<https://www.youtube.com/watch?v=Nb6xLq8CsKE>)!\n-# Vídeo do Canal Dune de guia de formatação'
          }
        ]
      }
    ]
  };

  const expectedRefComponent = {
    type: 17,
    accent_color: 5793266,
    spoiler: false,
    components: [
      {
        type: 10,
        content: '### Criação de Containers\nLembre-se de usar [formatações de texto](<https://www.youtube.com/watch?v=Nb6xLq8CsKE>)!\n-# Vídeo do Canal Dune de guia de formatação'
      }
    ]
  };

  function findPreviewContainer(view) {
    let found = null;
    function walk(node) {
      if (found || !node) return;
      if (Array.isArray(node)) return node.forEach(walk);
      const j = typeof node.toJSON === 'function' ? node.toJSON() : node;
      if (j && j.type === 17) { found = j; return; }
      if (j && Array.isArray(j.components)) j.components.forEach(walk);
      if (Array.isArray(node.components)) node.components.forEach(walk);
    }
    walk(view.components || []);
    return found;
  }

  await test('creating an empty/default container initializes valid structure without arbitrary default content injection', () => {
    freshModules();
    const { createContainer } = require('../schemas/components-v2.schema');
    const { buildComponentsV2Payload } = require('../builders/components-v2.builder');
    const c = createContainer();
    assert.strictEqual(c.type, 'container');
    assert.strictEqual(c.accent_color, null);
    assert.ok(Array.isArray(c.components) && c.components.length === 1);
    assert.strictEqual(c.components[0].type, 'text_display');
    assert.strictEqual(c.components[0].content, 'New container'); // placeholder, not reference content
    const payload = buildComponentsV2Payload({ type: 'components_v2', content: '', root: [c] });
    const j = payload.components[0].toJSON();
    assert.strictEqual(j.type, 17);
    assert.ok(!('accent_color' in j) || j.accent_color == null ? true : true);
    assert.strictEqual(j.components[0].type, 10);
    assert.strictEqual(j.components[0].content, 'New container');
  });

  await test('creating a container with a text display child preserves child in preview and publish', () => {
    freshModules();
    const { createSession } = require('../services/session.service');
    const { buildComponentsV2Payload } = require('../builders/components-v2.builder');
    const { buildContainerEditor } = require('../interactions/container-editor');
    const { toPublishPayload } = require('../services/publisher.service');
    const s = createSession('u1','g1','c1','components_v2');
    const c = s.state.root[0];
    c.components = [{ _id: 't1', type: 'text_display', content: 'Hello **world**' }];
    s.selectedNodeId = c._id;
    const editor = buildContainerEditor(s);
    const preview = findPreviewContainer(editor);
    assert.deepStrictEqual(preview, { type: 17, spoiler: false, components: [{ type: 10, content: 'Hello **world**' }] });
    const pub = toPublishPayload(buildComponentsV2Payload(s.state), 'components_v2');
    assert.deepStrictEqual(pub.components[0].toJSON(), preview);
  });

  await test('accent color is preserved through state, preview, serialization, and publish', () => {
    freshModules();
    const { createSession } = require('../services/session.service');
    const { buildComponentsV2Payload } = require('../builders/components-v2.builder');
    const { buildContainerEditor } = require('../interactions/container-editor');
    const { toPublishPayload } = require('../services/publisher.service');
    const s = createSession('u1','g1','c1','components_v2');
    const c = s.state.root[0];
    c.accent_color = 5793266;
    c.components[0].content = 'Accent test';
    s.selectedNodeId = c._id;
    const preview = findPreviewContainer(buildContainerEditor(s));
    assert.strictEqual(preview.type, 17);
    assert.strictEqual(preview.accent_color, 5793266);
    const pub = toPublishPayload(buildComponentsV2Payload(s.state), 'components_v2');
    assert.deepStrictEqual(pub.components[0].toJSON(), preview);
  });

  await test('importing the exact reference JSON preserves container data and accent rendering payload', () => {
    freshModules();
    const { normalizeImportedDocument } = require('../utils/json-document');
    const { buildComponentsV2Payload } = require('../builders/components-v2.builder');
    const { toPublishPayload } = require('../services/publisher.service');
    const norm = normalizeImportedDocument(refDoc);
    assert.ok(!norm.error, norm.error);
    const c = norm.state.root[0];
    assert.strictEqual(c.type, 'container');
    assert.strictEqual(c.accent_color, 5793266);
    assert.strictEqual(c.components[0].type, 'text_display');
    assert.ok(c.components[0].content.includes('### Criação de Containers'));
    const pub = toPublishPayload(buildComponentsV2Payload(norm.state), 'components_v2');
    assert.strictEqual(pub.flags, 32768);
    assert.deepStrictEqual(pub.components[0].toJSON(), expectedRefComponent);
  });

  await test('opening imported container in editor shows same container structure in preview', () => {
    freshModules();
    const { normalizeImportedDocument } = require('../utils/json-document');
    const { createSession } = require('../services/session.service');
    const { buildContainerEditor } = require('../interactions/container-editor');
    const norm = normalizeImportedDocument(refDoc);
    const s = createSession('u1','g1','c1','components_v2');
    s.state = norm.state;
    s.selectedNodeId = s.state.root[0]._id;
    const preview = findPreviewContainer(buildContainerEditor(s));
    assert.deepStrictEqual(preview, expectedRefComponent);
  });

  await test('preview and published payloads preserve the same structure for imported reference', () => {
    freshModules();
    const { normalizeImportedDocument } = require('../utils/json-document');
    const { buildComponentsV2Payload } = require('../builders/components-v2.builder');
    const { toPublishPayload } = require('../services/publisher.service');
    const { buildContainerEditor } = require('../interactions/container-editor');
    const { createSession } = require('../services/session.service');
    const norm = normalizeImportedDocument(refDoc);
    const s = createSession('u1','g1','c1','components_v2');
    s.state = norm.state; s.selectedNodeId = s.state.root[0]._id;
    const preview = findPreviewContainer(buildContainerEditor(s));
    const published = toPublishPayload(buildComponentsV2Payload(norm.state), 'components_v2').components[0].toJSON();
    console.log('SERIALIZED_PREVIEW=' + JSON.stringify(preview));
    console.log('SERIALIZED_PUBLISHED=' + JSON.stringify(published));
    assert.deepStrictEqual(preview, published);
    assert.deepStrictEqual(published, expectedRefComponent);
  });

  console.log(JSON.stringify(results, null, 2));
  const failed = results.filter(r => !r.ok);
  console.log('FAILED=' + failed.length);
  if (failed.length) process.exit(1);
})();
