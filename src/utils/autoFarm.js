import { request } from "./userApi.js";

const TASK_TYPES = {
  WATCH_VIDEO: "Video",
  WATCH_VIDEO_ON_MOBILE: "Video (mobile)",
  PLAY_ON_DESKTOP: "Play (desktop)",
  PLAY_ON_XBOX: "Play (Xbox)",
  PLAY_ON_PLAYSTATION: "Play (PlayStation)",
  PLAY_ACTIVITY: "Activity",
  STREAM_ON_DESKTOP: "Stream"
};

const TASK_PRIORITY = [
  "PLAY_ON_DESKTOP",
  "PLAY_ACTIVITY",
  "STREAM_ON_DESKTOP",
  "PLAY_ON_XBOX",
  "PLAY_ON_PLAYSTATION",
  "WATCH_VIDEO",
  "WATCH_VIDEO_ON_MOBILE"
];

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function jitter(base, range = 1500) {
  return base + Math.floor(Math.random() * Math.max(0, range));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
}

function formatDuration(totalSeconds) {
  const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

function formatClock(totalSeconds) {
  const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function createProgressBar(current, total, size = 20) {
  const safeTotal = Math.max(1, Number(total) || 1);
  const pct = clamp(Math.floor((Math.max(0, current) / safeTotal) * 100), 0, 100);
  const filled = Math.round((pct / 100) * size);
  const empty = size - filled;
  return `[${"#".repeat(filled)}${"-".repeat(empty)}] ${String(pct).padStart(3, " ")}%`;
}

function taskLabel(taskType) {
  return TASK_TYPES[taskType] || String(taskType || "Unknown task");
}

function parseRewardText(reward) {
  if (!reward) return "Unknown reward";
  const msg = reward.messages || {};
  if (reward.type === 4) return `${reward.orb_quantity || 0} Orbs`;
  if (reward.type === 3) return msg.name || msg.name_with_article || "Decoration";
  if (reward.type === 2) return msg.name || msg.name_with_article || "In-game item";
  if (reward.type === 1) return msg.name || msg.name_with_article || "Reward";
  return msg.name || msg.name_with_article || "Reward";
}

function getQuestApplication(quest) {
  const app = quest?.config?.application || quest?.config?.application_info || null;
  if (!app) return null;
  return {
    id: app.id || null,
    name: app.name || null
  };
}

function getTaskEntries(quest) {
  const taskConfig = quest?.config?.task_config_v2 || quest?.config?.task_config || {};
  const tasks = (taskConfig && taskConfig.tasks) || {};
  return Object.entries(tasks);
}

function getBestTask(tasks) {
  let selected = null;
  let best = Number.POSITIVE_INFINITY;

  for (const [type, data] of Object.entries(tasks || {})) {
    if (!TASK_TYPES[type]) continue;
    const priority = TASK_PRIORITY.indexOf(type);
    const rank = priority === -1 ? 999 : priority;
    if (rank < best) {
      best = rank;
      selected = { taskType: type, taskData: data || {} };
    }
  }

  return selected;
}

function extractProgressValue(progressPayload, taskType) {
  if (!progressPayload) return null;
  if (progressPayload.progress && progressPayload.progress[taskType] && typeof progressPayload.progress[taskType].value === "number") {
    return progressPayload.progress[taskType].value;
  }
  if (progressPayload.user_status?.progress && progressPayload.user_status.progress[taskType] && typeof progressPayload.user_status.progress[taskType].value === "number") {
    return progressPayload.user_status.progress[taskType].value;
  }
  if (typeof progressPayload.stream_progress_seconds === "number") return progressPayload.stream_progress_seconds;
  return null;
}

function isCompletedPayload(payload) {
  return Boolean(payload?.completed_at || payload?.user_status?.completed_at);
}

function normalizeQuest(quest) {
  const tasks = {};
  for (const [k, v] of getTaskEntries(quest)) tasks[k] = v;
  const selected = getBestTask(tasks);
  if (!selected) return null;

  const target = Math.max(0, Number(selected.taskData?.target || 0));
  const reward = quest?.config?.rewards_config?.rewards?.[0] || null;
  const app = getQuestApplication(quest);
  const userStatus = quest?.user_status || {};

  return {
    questId: quest.id,
    questName: quest?.config?.messages?.quest_name || quest?.config?.messages?.game_title || "Unknown quest",
    taskType: selected.taskType,
    target,
    rewardText: parseRewardText(reward),
    isEnrolled: Boolean(userStatus.enrolled_at),
    expiresAt: quest?.config?.expires_at || null,
    applicationId: app?.id || null,
    applicationName: app?.name || null,
    progress: userStatus.progress || {}
  };
}

function sortQuests(quests) {
  return [...quests].sort((a, b) => {
    const aOrbs = /orbs/i.test(a.rewardText);
    const bOrbs = /orbs/i.test(b.rewardText);
    if (aOrbs && !bOrbs) return -1;
    if (!aOrbs && bOrbs) return 1;
    if (a.target !== b.target) return a.target - b.target;
    return String(a.questName).localeCompare(String(b.questName));
  });
}

async function makeRequest(endpoint, method, body = null, token) {
  return request(endpoint, method, body, token);
}

async function getUserInfo(token) {
  const res = await makeRequest("/users/@me", "GET", null, token);
  if (res.status !== 200) return null;
  return res.data || null;
}

async function getOrbsBalance(token) {
  const res = await makeRequest("/users/@me/virtual-currency/balance", "GET", null, token);
  if (res.status !== 200) return null;
  if (res.data && typeof res.data.balance === "number") return res.data.balance;
  return 0;
}

async function fetchAvailableQuests(token) {
  const res = await makeRequest("/quests/@me", "GET", null, token);
  if (res.status !== 200 || !res.data || !Array.isArray(res.data.quests)) return [];

  const now = Date.now();
  const result = [];

  for (const quest of res.data.quests) {
    const expiresAt = quest?.config?.expires_at ? Date.parse(quest.config.expires_at) : null;
    if (expiresAt && expiresAt < now) continue;
    if (quest?.user_status?.completed_at) continue;

    const normalized = normalizeQuest(quest);
    if (!normalized) continue;
    if (normalized.target <= 0) continue;
    result.push(normalized);
  }

  return sortQuests(result);
}

import { logger } from "./logger.js";
const farmLogger = logger.child("autoquest");

function toLoggerLevel(level) {
  if (level === "error") return "error";
  if (level === "warn") return "warn";
  if (level === "progress") return "debug";
  return "info";
}

function levelTag(level) {
  return {
    info: "[INFO]",
    ok: "[ OK ]",
    warn: "[WARN]",
    error: "[ERR ]",
    progress: "[PROG]",
    step: "[STEP]",
    quest: "[QUEST]"
  }[level] || "[INFO]";
}

function createLogger(logCallback) {
  return (level, message) => {
    const text = message == null ? "" : String(message);
    const tag = levelTag(level);
    const callbackLine = `${tag} ${text}`;

    // Shared logger output uses its own severity label/scope/timestamp.
    // AutoQuest semantic tags remain available via callbackLine/message.
    farmLogger.log(toLoggerLevel(level), text);

    if (typeof logCallback === "function") {
      try { logCallback(callbackLine, level, text); } catch {}
    }
  };
}

async function enrollQuest(questId, token) {
  return makeRequest(
    `/quests/${questId}/enroll`,
    "POST",
    { location: 11, is_targeted: false, metadata_raw: null },
    token
  );
}

function getExistingProgress(quest) {
  const byTask = quest?.progress?.[quest.taskType];
  if (byTask && typeof byTask.value === "number") return byTask.value;
  return 0;
}

async function completePlayQuestWithHeartbeats(quest, token, emit, startedAtProgress) {
  const { questId, taskType, target } = quest;
  let currentProgress = Math.max(0, startedAtProgress || 0);
  let stuckCounter = 0;
  let requestFailures = 0;
  const MAX_STUCK = 8;
  const MAX_REQUEST_FAILURES = 5;
  const streamKey = `call:${questId}:1`;
  const application = quest.applicationId ? { application_id: String(quest.applicationId) } : {};

  while (currentProgress < target) {
    const body = Object.assign({ stream_key: streamKey, terminal: false }, application);
    const res = await makeRequest(`/quests/${questId}/heartbeat`, "POST", body, token);

    if (res.status === 429) {
      const retryAfter = Number(res.data?.retry_after || 0);
      emit("warn", `Rate limited during heartbeat, waiting ${retryAfter ? `${retryAfter}s` : "~8s"}...`);
      await sleep(retryAfter > 0 ? (retryAfter * 1000) + 250 : jitter(8000, 1500));
      continue;
    }

    if (res.status < 200 || res.status >= 300) {
      requestFailures += 1;
      emit("warn", `Heartbeat failed (status ${res.status || "network"}), retry ${requestFailures}/${MAX_REQUEST_FAILURES}`);
      if (requestFailures >= MAX_REQUEST_FAILURES) return false;
      await sleep(jitter(5000, 2000));
      continue;
    }

    requestFailures = 0;
    const data = res.data || {};

    if (isCompletedPayload(data)) {
      currentProgress = target;
      break;
    }

    const newProgressRaw = extractProgressValue(data, taskType);
    const newProgress = typeof newProgressRaw === "number" ? newProgressRaw : currentProgress;

    if (newProgress > currentProgress) {
      currentProgress = newProgress;
      stuckCounter = 0;
      emit("progress", `${createProgressBar(currentProgress, target)} | ${formatClock(currentProgress)} / ${formatClock(target)}`);
      if (currentProgress >= target) {
        await makeRequest(`/quests/${questId}/heartbeat`, "POST", Object.assign({ stream_key: streamKey, terminal: true }, application), token).catch(() => {});
        currentProgress = target;
        break;
      }
    } else {
      stuckCounter += 1;
      if (stuckCounter >= MAX_STUCK) {
        emit("warn", "Progress appears stalled; sending terminal heartbeat and checking completion state.");
        await makeRequest(`/quests/${questId}/heartbeat`, "POST", Object.assign({ stream_key: streamKey, terminal: true }, application), token).catch(() => {});
        currentProgress = target;
        break;
      }
    }

    await sleep(jitter(24000, 3000));
  }

  return currentProgress >= target;
}

async function completeWatchQuest(quest, token, emit, startedAtProgress) {
  const { questId, target } = quest;
  let timestamp = Math.max(0, Math.floor(startedAtProgress || 0));
  let currentProgress = timestamp;
  let requestFailures = 0;
  const MAX_REQUEST_FAILURES = 6;

  while (currentProgress < target) {
    const res = await makeRequest(`/quests/${questId}/video-progress`, "POST", { timestamp }, token);

    if (res.status === 429) {
      const retryAfter = Number(res.data?.retry_after || 0);
      emit("warn", `Rate limited during video progress, waiting ${retryAfter ? `${retryAfter}s` : "~8s"}...`);
      await sleep(retryAfter > 0 ? (retryAfter * 1000) + 250 : jitter(8000, 1500));
      continue;
    }

    if (res.status === 400) {
      requestFailures += 1;
      timestamp = Math.max(0, timestamp - 10);
      emit("warn", `Video progress rejected (400), rewinding timestamp and retrying (${requestFailures}/${MAX_REQUEST_FAILURES}).`);
      if (requestFailures >= MAX_REQUEST_FAILURES) return false;
      await sleep(jitter(4000, 1500));
      continue;
    }

    if (res.status < 200 || res.status >= 300) {
      requestFailures += 1;
      emit("warn", `Video progress failed (status ${res.status || "network"}), retry ${requestFailures}/${MAX_REQUEST_FAILURES}`);
      if (requestFailures >= MAX_REQUEST_FAILURES) return false;
      await sleep(jitter(5000, 2000));
      continue;
    }

    requestFailures = 0;
    const data = res.data || {};
    if (isCompletedPayload(data)) {
      currentProgress = target;
      emit("progress", `${createProgressBar(currentProgress, target)} | ${formatClock(currentProgress)} / ${formatClock(target)}`);
      break;
    }

    const reported = extractProgressValue(data, quest.taskType);
    currentProgress = typeof reported === "number" ? reported : Math.min(target, Math.max(currentProgress, timestamp));
    emit("progress", `${createProgressBar(currentProgress, target)} | ${formatClock(currentProgress)} / ${formatClock(target)}`);

    if (currentProgress >= target) break;
    timestamp = Math.min(target, Math.max(timestamp + 10, Math.floor(currentProgress) + 10));
    await sleep(jitter(2500, 2500));
  }

  return currentProgress >= target;
}

async function runQuest(quest, logCallback, token) {
  const emit = createLogger(logCallback);
  const appInfo = quest.applicationName ? ` | App: ${quest.applicationName}` : "";

  emit("quest", `Starting: ${quest.questName}`);
  emit("info", `Task: ${taskLabel(quest.taskType)} | Duration: ${formatDuration(quest.target)} | Reward: ${quest.rewardText}${appInfo}`);

  if (!quest.isEnrolled) {
    const enroll = await enrollQuest(quest.questId, token);
    if (enroll.status !== 200 && enroll.status !== 201 && enroll.status !== 204) {
      emit("error", `Failed to enroll (status ${enroll.status || "network"})`);
      return false;
    }
    emit("ok", "Enrolled in quest");
  } else {
    emit("info", "Quest already enrolled");
  }

  const startedAtProgress = Math.min(getExistingProgress(quest), quest.target);
  if (startedAtProgress > 0) {
    emit("info", `Resuming from ${formatClock(startedAtProgress)} / ${formatClock(quest.target)}`);
  }

  let success = false;
  if (String(quest.taskType).startsWith("WATCH_")) {
    success = await completeWatchQuest(quest, token, emit, startedAtProgress);
  } else if (String(quest.taskType).startsWith("PLAY_") || quest.taskType === "PLAY_ACTIVITY" || quest.taskType === "STREAM_ON_DESKTOP") {
    success = await completePlayQuestWithHeartbeats(quest, token, emit, startedAtProgress);
  } else {
    emit("error", `Unsupported task type: ${quest.taskType}`);
    return false;
  }

  if (!success) {
    emit("error", `Quest did not complete: ${quest.questName}`);
    return false;
  }

  emit("ok", `Quest completed: ${quest.questName} | Reward: ${quest.rewardText}`);
  return true;
}

async function runAutoQuest(token, logCallback, userId) {
  void userId;
  const emit = createLogger(logCallback);

  if (!token || String(token).trim() === "") {
    throw new Error("Token not provided.");
  }

  emit("info", "Validating token...");
  const user = await getUserInfo(token);
  if (!user) {
    throw new Error("Invalid or expired token.");
  }

  const displayName = user.global_name || user.username || "Unknown user";
  emit("ok", `Account: ${displayName} (@${user.username || "unknown"})`);
  emit("info", `User ID: ${user.id}`);

  try {
    const orbs = await getOrbsBalance(token);
    if (orbs !== null) emit("info", `Orbs balance: ${orbs.toLocaleString("en-US")}`);
  } catch {}

  emit("info", "Fetching available quests...");
  const quests = await fetchAvailableQuests(token);
  if (!quests.length) {
    emit("warn", "No quests available.");
    return { completed: 0, total: 0, user };
  }

  emit("ok", `${quests.length} quest(s) found.`);
  for (let i = 0; i < quests.length; i++) {
    const q = quests[i];
    const appInfo = q.applicationName ? ` | ${q.applicationName}` : "";
    emit("info", `${i + 1}. ${q.questName} | ${taskLabel(q.taskType)} | ${formatDuration(q.target)} | ${q.rewardText}${appInfo}`);
  }

  emit("step", "Starting automated quest execution...");
  let completed = 0;

  for (let i = 0; i < quests.length; i++) {
    const quest = quests[i];
    let ok = false;
    try {
      ok = await runQuest(quest, logCallback, token);
    } catch (err) {
      emit("error", `Quest execution error (${quest.questName}): ${err?.message || err}`);
      ok = false;
    }
    if (ok) completed++;

    if (i < quests.length - 1) {
      emit("info", "Waiting before next quest...");
      await sleep(jitter(10000, 3000));
    }
  }

  emit("ok", `Run finished: ${completed}/${quests.length} quest(s) completed.`);
  try {
    const finalOrbs = await getOrbsBalance(token);
    if (finalOrbs !== null) emit("info", `Final Orbs balance: ${finalOrbs.toLocaleString("en-US")}`);
  } catch {}

  return { completed, total: quests.length, user };
}

export {
  runAutoQuest,
  runQuest,
  makeRequest,
  getUserInfo,
  getOrbsBalance,
  fetchAvailableQuests,
  TASK_TYPES,
  formatDuration,
  taskLabel,
  createLogger as _createLogger
};

export default {
  runAutoQuest,
  runQuest,
  makeRequest,
  getUserInfo,
  getOrbsBalance,
  fetchAvailableQuests,
  TASK_TYPES,
  formatDuration,
  taskLabel,
  _createLogger: createLogger
};
