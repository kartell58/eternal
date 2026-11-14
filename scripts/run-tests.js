#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');

const tests = [
  'src/tests/connection.test.js',
  'src/tests/logger.test.js',
  'src/features/verification/captcha.test.js',
  'src/features/builder/tests/audit-fixes.test.js',
  'src/features/builder/tests/container-creation-flow.test.js',
  'src/features/builder/tests/container-data-preservation.test.js',
  'src/features/builder/tests/container-editor.test.js',
  'src/features/builder/tests/embed-editor.test.js',
  'src/features/builder/tests/json-editor.test.js',
  'src/features/builder/tests/native-container-presentation.test.js',
  'src/features/builder/tests/ui-redesign.test.js'
];

for (const rel of tests) {
  const file = path.join(root, rel);
  console.log(`==> ${rel}`);
  const result = spawnSync(process.execPath, [file], {
    cwd: root,
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    process.exit(result.status == null ? 1 : result.status);
  }
}
