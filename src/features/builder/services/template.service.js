const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { readJsonSafe, writeJsonAtomic, withFileLock } = require('../utils/safe-fs');

const FILE_PATH = path.join(__dirname, '..', '..', '..', '..', 'builder-templates.json');
const LOCK_PATH = FILE_PATH + '.lock';

function loadAll() {
  const res = readJsonSafe(FILE_PATH, {});
  if (res.recovered) return {};
  const data = res.data;
  return (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
}

function loadAllRaw() { return readJsonSafe(FILE_PATH, {}); }

function listTemplates(userId, guildId) {
  const all = loadAll();
  return Object.values(all).filter(t => t && t.userId === userId && t.guildId === guildId);
}

function getTemplate(id) {
  const all = loadAll();
  return all[id] || null;
}

function getTemplateFor(userId, guildId, id) {
  const t = getTemplate(id);
  if (!t) return null;
  if (t.userId !== userId || t.guildId !== guildId) return null;
  return t;
}

function saveTemplate(userId, guildId, state, name, existingId = null) {
  return withFileLock(LOCK_PATH, () => {
    const all = loadAll();
    let id = existingId || `tpl_${randomUUID().slice(0, 8)}`;
    if (existingId) {
      const prev = all[existingId];
      if (prev && (prev.userId !== userId || prev.guildId !== guildId)) {
        throw new Error('Not authorized to overwrite this template.');
      }
      id = existingId;
    }
    const now = new Date().toISOString();
    const prev = all[id] || {};
    all[id] = {
      id,
      userId,
      guildId,
      name: name || prev.name || 'Untitled Template',
      state: JSON.parse(JSON.stringify(state)),
      createdAt: prev.createdAt || now,
      updatedAt: now
    };
    writeJsonAtomic(FILE_PATH, all);
    return all[id];
  });
}

function deleteTemplate(userId, guildId, id) {
  return withFileLock(LOCK_PATH, () => {
    const all = loadAll();
    const t = all[id];
    if (!t) return false;
    if (t.userId !== userId || t.guildId !== guildId) throw new Error('Not authorized to delete this template.');
    delete all[id];
    writeJsonAtomic(FILE_PATH, all);
    return true;
  });
}

function duplicateTemplate(userId, guildId, id) {
  return withFileLock(LOCK_PATH, () => {
    const all = loadAll();
    const t = all[id];
    if (!t) return null;
    if (t.userId !== userId || t.guildId !== guildId) throw new Error('Not authorized to duplicate this template.');
    const newId = `tpl_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    all[newId] = {
      id: newId,
      userId,
      guildId,
      name: `${t.name} (copy)`,
      state: JSON.parse(JSON.stringify(t.state)),
      createdAt: now,
      updatedAt: now
    };
    writeJsonAtomic(FILE_PATH, all);
    return all[newId];
  });
}

function getLoadStatus() { return loadAllRaw(); }

module.exports = { listTemplates, getTemplate, getTemplateFor, saveTemplate, deleteTemplate, duplicateTemplate, getLoadStatus };
