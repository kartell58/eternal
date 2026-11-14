import assert from 'assert';
import { normalizeImportedDocument } from '../utils/json-document.js';
import { buildComponentsV2Payload } from '../builders/components-v2.builder.js';
import { toPublishPayload } from '../services/publisher.service.js';

(async () => {
  const results = [];
  const test = async (name, fn) => { try { await fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: e.message, stack: e.stack }); } };

  await test('reference v1 container is normalized and rendered as native CV2 container component', () => {
    const doc = {
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

    const norm = normalizeImportedDocument(doc);
    assert.ok(!norm.error, norm.error);
    const state = norm.state;
    assert.strictEqual(state.root.length, 1);
    assert.strictEqual(state.root[0].type, 'container');

    const built = buildComponentsV2Payload(state);
    assert.strictEqual(built.components.length, 1, 'single top-level container component');
    const container = built.components[0].toJSON();
    assert.strictEqual(container.type, 17, 'native container type');
    assert.strictEqual(container.accent_color, 5793266, 'accent color preserved');
    assert.ok(Array.isArray(container.components) && container.components.length === 1, 'child nested inside container');
    assert.strictEqual(container.components[0].type, 10, 'text display child');
    assert.ok(container.components[0].content.includes('### Criação de Containers'), 'content preserved');

    const published = toPublishPayload(built, 'components_v2');
    assert.strictEqual(published.flags, 32768, 'IsComponentsV2 flag');
    assert.strictEqual(published.components.length, 1, 'published structure matches built structure');
    const pubContainer = published.components[0].toJSON();
    assert.strictEqual(pubContainer.type, 17);
    assert.strictEqual(pubContainer.components[0].type, 10);
  });

  console.log(JSON.stringify(results, null, 2));
  const failed = results.filter(r => !r.ok);
  console.log('FAILED=' + failed.length);
  if (failed.length) process.exit(1);
})();
