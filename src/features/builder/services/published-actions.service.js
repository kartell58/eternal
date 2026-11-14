import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { readJsonSafe, writeJsonAtomic, withFileLock } from '../utils/safe-fs.js';

const FILE_PATH = path.join(__dirname, '..', '..', '..', '..', 'builder-published-actions.json');
const LOCK_PATH = FILE_PATH + '.lock';

function loadAll() {
  const res = readJsonSafe(FILE_PATH, {});
  if (res.recovered) return {};
  const data = res.data;
  return (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
}

function saveAll(data) {
  withFileLock(LOCK_PATH, () => writeJsonAtomic(FILE_PATH, data));
}

function key(messageId, customId) {
  return `${messageId}:${customId}`;
}

function setAction(messageId, customId, action) {
  withFileLock(LOCK_PATH, () => {
    const all = loadAll();
    all[key(messageId, customId)] = action;
    writeJsonAtomic(FILE_PATH, all);
  });
}

function getAction(messageId, customId) {
  const all = loadAll();
  return all[key(messageId, customId)] || null;
}

function removeActionsForMessage(messageId) {
  withFileLock(LOCK_PATH, () => {
    const all = loadAll();
    const prefix = `${messageId}:`;
    let changed = false;
    for (const k of Object.keys(all)) { if (k.startsWith(prefix)) { delete all[k]; changed = true; } }
    if (changed) writeJsonAtomic(FILE_PATH, all);
  });
}

function getLoadStatus() { return readJsonSafe(FILE_PATH, {}); }

export { setAction, getAction, removeActionsForMessage, getLoadStatus };

export default { setAction, getAction, removeActionsForMessage, getLoadStatus };
