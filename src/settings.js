const fs = require("fs");
const path = require("path");

const FILE_PATH = path.join(__dirname, "..", "settings.json");

// Load settings from file
function loadSettings() {
  if (!fs.existsSync(FILE_PATH)) {
    return {};
  }
  try {
    const data = fs.readFileSync(FILE_PATH, "utf8");
    return JSON.parse(data);
  } catch (err) {
    console.error("Error loading settings:", err);
    return {};
  }
}

// Save settings to file
function saveSettings() {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error("Error saving settings:", err);
  }
}

// In-memory cache
let settings = loadSettings();

// Get setting for a specific guild
function get(guildId, key) {
  const guildData = settings[guildId];
  if (!guildData) return undefined;
  return guildData[key];
}

// Set setting for a specific guild
function set(guildId, key, value) {
  if (!settings[guildId]) {
    settings[guildId] = {};
  }
  settings[guildId][key] = value;
  saveSettings();
}

// Remove setting for a specific guild
function remove(guildId, key) {
  const guildData = settings[guildId];
  if (!guildData) return;
  delete guildData[key];
  saveSettings();
}

// Get all settings for a guild
function getAll(guildId) {
  return settings[guildId] || {};
}

module.exports = { get, set, remove, getAll };
