const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { readJsonSafe, writeJsonAtomic, withFileLock } = require('../utils/safe-fs');

const FILE_PATH = path.join(__dirname, '..', '..', '..', '..', 'builder-drafts.json');
const LOCK_PATH = FILE_PATH + '.lock';

function loadAll() {
  const res = readJsonSafe(FILE_PATH, {});
  if (res.recovered) {
    // preserve corrupted content already backed up; start fresh to avoid overwrite loop
    return {};
  }
  const data = res.data;
  return (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
}

function loadAllRaw() {
  return readJsonSafe(FILE_PATH, {});
}

function listDrafts(userId, guildId) {
  const all = loadAll();
  return Object.values(all).filter(d => d && d.userId === userId && d.guildId === guildId);
}

function getDraft(id) {
  const all = loadAll();
  return all[id] || null;
}

function getDraftFor(userId, guildId, id) {
  const d = getDraft(id);
  if (!d) return null;
  if (d.userId !== userId || d.guildId !== guildId) return null;
  return d;
}

function saveDraft(userId, guildId, state, existingId = null, name = '') {
  return withFileLock(LOCK_PATH, () => {
    const all = loadAll();
    let id = existingId || `draft_${randomUUID().slice(0, 8)}`;
    if (existingId) {
      const prev = all[existingId];
      if (prev && (prev.userId !== userId || prev.guildId !== guildId)) {
        throw new Error('Not authorized to overwrite this draft.');
      }
      id = existingId;
    }
    const now = new Date().toISOString();
    const prev = all[id] || {};
    all[id] = {
      id,
      userId,
      guildId,
      name: name || prev.name || (state.type === 'embed' ? 'Embed Draft' : 'Components V2 Draft'),
      state: JSON.parse(JSON.stringify(state)),
      createdAt: prev.createdAt || now,
      updatedAt: now
    };
    writeJsonAtomic(FILE_PATH, all);
    return all[id];
  });
}

function deleteDraft(userId, guildId, id) {
  return withFileLock(LOCK_PATH, () => {
    const all = loadAll();
    const d = all[id];
    if (!d) return false;
    if (d.userId !== userId || d.guildId !== guildId) throw new Error('Not authorized to delete this draft.');
    delete all[id];
    writeJsonAtomic(FILE_PATH, all);
    return true;
  });
}

function getLoadStatus() {
  return loadAllRaw();
}

module.exports = { listDrafts, getDraft, getDraftFor, saveDraft, deleteDraft, getLoadStatus };
