import { randomUUID } from 'crypto';
import { createDefaultEmbedState } from '../schemas/embed.schema.js';
import { createDefaultComponentsV2State } from '../schemas/components-v2.schema.js';

const sessions = new Map();
const SESSION_TTL_MS = 1000 * 60 * 30; // 30 minutes of inactivity

function createSession(userId, guildId, channelId, type) {
  const id = randomUUID().slice(0, 10);
  const state = type === 'components_v2' ? createDefaultComponentsV2State() : createDefaultEmbedState();
  const session = {
    id,
    userId,
    guildId,
    channelId,
    type,
    state,
    selectedNodeId: null,
    draftId: null,
    templateId: null,
    editingMessage: null, // { channelId, messageId }
    view: 'home',
    embedSection: 'basic',
    history: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  sessions.set(id, session);
  return session;
}

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [id, s] of sessions.entries()) {
    if (!s || (now - (s.updatedAt || s.createdAt || 0)) > SESSION_TTL_MS) sessions.delete(id);
  }
}

function getSession(id) {
  cleanupExpiredSessions();
  return sessions.get(id) || null;
}

function saveSession(session) {
  session.updatedAt = Date.now();
  sessions.set(session.id, session);
  cleanupExpiredSessions();
  return session;
}

function deleteSession(id) {
  sessions.delete(id);
}

function requireSession(sessionId, userId, guildId) {
  const s = getSession(sessionId);
  if (!s) return { error: 'This builder session has expired. Use /builder to start a new session. If you saved a draft or template, open it from the builder home to resume your work.' };
  if (s.userId !== userId) return { error: 'This builder session belongs to another user.' };
  if (guildId && s.guildId && s.guildId !== guildId) return { error: 'This builder session is not valid in this server.' };
  return { session: s };
}

function pushHistory(session) {
  session.history = session.history || [];
  session.history.push(JSON.stringify({ state: session.state, selectedNodeId: session.selectedNodeId, view: session.view, embedSection: session.embedSection }));
  if (session.history.length > 25) session.history.shift();
}

function popHistory(session) {
  if (!session.history || session.history.length === 0) return false;
  const prev = JSON.parse(session.history.pop());
  session.state = prev.state;
  session.selectedNodeId = prev.selectedNodeId;
  session.view = prev.view;
  session.embedSection = prev.embedSection;
  return true;
}

export { createSession, getSession, saveSession, deleteSession, requireSession, pushHistory, popHistory, cleanupExpiredSessions, sessions, SESSION_TTL_MS };

export default { createSession, getSession, saveSession, deleteSession, requireSession, pushHistory, popHistory, cleanupExpiredSessions, sessions, SESSION_TTL_MS };
