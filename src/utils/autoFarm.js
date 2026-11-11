const { request } = require("./userApi");

const TASK_TYPES = {
  WATCH_VIDEO: "🎬 Video",
  WATCH_VIDEO_ON_MOBILE: "🎬 Video",
  PLAY_ON_DESKTOP: "🎮 Play",
  PLAY_ON_XBOX: "🎮 Play",
  PLAY_ON_PLAYSTATION: "🎮 Play"
};

const TASK_PRIORITY = [
  "PLAY_ON_DESKTOP",
  "PLAY_ON_XBOX",
  "PLAY_ON_PLAYSTATION",
  "WATCH_VIDEO",
  "WATCH_VIDEO_ON_MOBILE"
];

function jitter(base, range = 1500) {
  return base + Math.floor(Math.random() * range);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatTime(sec) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

function getTaskDuration(target) {
  if (target >= 60) {
    const m = Math.floor(target / 60);
    const s = target % 60;
    return s > 0 ? `${m}min ${s}s` : `${m} minutes`;
  }
  return `${Math.floor(target)} seconds`;
}

function parseRewardText(reward) {
  if (!reward) return "Unknown reward";
  if (reward.type === 4) return `${reward.orb_quantity} Orbs`;
  if (reward.type === 3) return reward.messages?.name || "Decoration";
  if (reward.type === 1) return reward.messages?.name || "Item";
  return "Reward";
}

function getBestTask(tasks) {
  let selected = null;
  let best = 999;

  for (const [type, data] of Object.entries(tasks)) {
    if (!TASK_TYPES[type]) continue;
    const priority = TASK_PRIORITY.indexOf(type);
    if (priority !== -1 && priority < best) {
      best = priority;
      selected = { taskType: type, taskData: data };
    }
  }

  return selected;
}

function createProgressBar(current, total, size = 20) {
  const pct = Math.min(Math.floor((current / total) * 100), 100);
  const filled = Math.round((pct / 100) * size);
  const empty = size - filled;
  return `[${"█".repeat(filled)}${"░".repeat(empty)}] ${pct}%`;
}

async function makeRequest(endpoint, method, body = null, token) {
  return request(endpoint, method, body, token);
}

async function getUserInfo(token) {
  const res = await makeRequest("/users/@me", "GET", null, token);
  if (res.status !== 200) return null;
  return res.data;
}

async function getOrbsBalance(token) {
  const res = await makeRequest(
    "/users/@me/virtual-currency/balance",
    "GET",
    null,
    token
  );
  if (res.status !== 200) return null;
  return res.data.balance || 0;
}

async function fetchAvailableQuests(token) {
  const res = await makeRequest("/quests/@me", "GET", null, token);
  if (res.status !== 200 || !res.data?.quests) return [];

  const now = new Date();
  const result = [];

  for (const quest of res.data.quests) {
    if (new Date(quest.config.expires_at) < now) continue;
    if (quest.user_status?.completed_at) continue;

    const tasks = quest.config.task_config_v2?.tasks || {};
    const selected = getBestTask(tasks);
    if (!selected) continue;

    result.push({
      questId: quest.id,
      questName: quest.config.messages.quest_name,
      taskType: selected.taskType,
      target: selected.taskData.target || 0,
      rewardText: parseRewardText(quest.config.rewards_config?.rewards?.[0]),
      isEnrolled: Boolean(quest.user_status?.enrolled_at)
    });
  }

  result.sort((a, b) => {
    const aOrbs = a.rewardText.includes("Orbs");
    const bOrbs = b.rewardText.includes("Orbs");
    if (aOrbs && !bOrbs) return -1;
    if (!aOrbs && bOrbs) return 1;
    return a.target - b.target;
  });

  return result;
}

async function runQuest(quest, logCallback, token) {
  const { questId, taskType, target } = quest;
  let currentProgress = 0;

  const log = msg => {
    console.log(msg);
    if (logCallback) logCallback(msg);
  };

  log(`🚀 Starting: ${quest.questName}`);
  log(
    `   Type: ${TASK_TYPES[taskType] || taskType} | Duration: ${getTaskDuration(
      target
    )} | Reward: ${quest.rewardText}\n`
  );

  if (!quest.isEnrolled) {
    const enroll = await makeRequest(
      `/quests/${questId}/enroll`,
      "POST",
      { location: 11, is_targeted: false, metadata_raw: null },
      token
    );

    if (enroll.status !== 200) {
      log(`❌ Failed to enroll (status ${enroll.status})`);
      return false;
    }
    log("✅ Enrolled in quest");
  }

  if (taskType.startsWith("WATCH_")) {
    let timestamp = 0;

    while (currentProgress < target) {
      const res = await makeRequest(
        `/quests/${questId}/video-progress`,
        "POST",
        { timestamp },
        token
      );

      if (res.status === 400 || res.status === 429) {
        timestamp = Math.max(0, timestamp - 10);
        await sleep(jitter(8000));
        continue;
      }

      if (res.status === 200) {
        if (res.data.completed_at) {
          currentProgress = target;
          break;
        }

        currentProgress = timestamp;
        timestamp += 10;

        log(
          `   ${createProgressBar(currentProgress, target)} | ${formatTime(
            currentProgress
          )} / ${formatTime(target)}`
        );

        if (currentProgress >= target) break;
      }

      await sleep(jitter(2500, 2500));
    }
  } else if (taskType.startsWith("PLAY_")) {
    const streamKey = `call:${questId}:1`;
    const MAX_STUCK = 8;
    let stuckCounter = 0;

    while (currentProgress < target) {
      const res = await makeRequest(
        `/quests/${questId}/heartbeat`,
        "POST",
        { stream_key: streamKey, terminal: false },
        token
      );

      if (res.status === 429) {
        await sleep(jitter(8000));
        continue;
      }

      if (res.status === 200) {
        const data = res.data;

        if (data.completed_at || data.user_status?.completed_at) {
          currentProgress = target;
          break;
        }

        const newProgress =
          data.progress?.[taskType]?.value ?? currentProgress;

        if (newProgress > currentProgress) {
          currentProgress = newProgress;
          stuckCounter = 0;

          log(
            `   ${createProgressBar(currentProgress, target)} | ${formatTime(
              currentProgress
            )} / ${formatTime(target)}`
          );

          if (currentProgress >= target) {
            await makeRequest(
              `/quests/${questId}/heartbeat`,
              "POST",
              { stream_key: streamKey, terminal: true },
              token
            );
            currentProgress = target;
            break;
          }
        } else {
          stuckCounter++;

          if (stuckCounter >= MAX_STUCK) {
            await makeRequest(
              `/quests/${questId}/heartbeat`,
              "POST",
              { stream_key: streamKey, terminal: true },
              token
            );
            currentProgress = target;
            break;
          }
        }
      }

      await sleep(jitter(24000, 3000));
    }
  }

  log(
    `   ✅ Quest completed! Reward: ${quest.rewardText} (${formatTime(
      target
    )})\n`
  );

  return true;
}

async function runAutoQuest(token, logCallback, userId) {
  if (!token || token.trim() === "") {
    throw new Error("Token not provided.");
  }

  const log = msg => {
    console.log(msg);
    if (logCallback) logCallback(msg);
  };

  log("🔍 Validating token...");

  const user = await getUserInfo(token);
  if (!user) {
    throw new Error("Invalid or expired token.");
  }

  log(`👤 Account: ${user.global_name || user.username} (@${user.username})`);
  log(`🆔 ID: ${user.id}`);

  const orbs = await getOrbsBalance(token);
  if (orbs !== null) {
    log(`💰 Orbs: ${orbs.toLocaleString("en-US")}`);
  }

  log("\n📋 Fetching available quests...\n");

  const quests = await fetchAvailableQuests(token);
  if (!quests.length) {
    log("🚫 No quests available.");
    return { completed: 0, total: 0, user };
  }

  log(`🎯 ${quests.length} quest(s) found:\n`);

  for (let i = 0; i < quests.length; i++) {
    const quest = quests[i];
    log(`   ${i + 1}. ${quest.questName}`);
    log(
      `      ${TASK_TYPES[quest.taskType] || quest.taskType} | ${getTaskDuration(
        quest.target
      )} | 🎁 ${quest.rewardText}`
    );
  }

  log("\n▶️ Starting automated execution...\n");

  let completed = 0;

  for (const quest of quests) {
    const ok = await runQuest(quest, logCallback, token);
    if (ok) completed++;

    if (quest !== quests[quests.length - 1]) {
      log("⏳ Waiting before the next quest...\n");
      await sleep(jitter(10000, 3000));
    }
  }

  log(`\n🏁 All done! ${completed}/${quests.length} quests completed.`);

  const finalOrbs = await getOrbsBalance(token);
  if (finalOrbs !== null) {
    log(`💰 Final Orbs balance: ${finalOrbs.toLocaleString("en-US")}`);
  }

  return { completed, total: quests.length, user };
}

module.exports = {
  runAutoQuest,
  makeRequest,
  getUserInfo,
  getOrbsBalance,
  fetchAvailableQuests,
  TASK_TYPES
};
