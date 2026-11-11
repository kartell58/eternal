const fs = require("fs");
const path = require("path");

const FILE_PATH = path.join(__dirname, "..", "..", "data", "tokens.json");

let tokens = load();

function load() {
  try {
    if (!fs.existsSync(FILE_PATH)) return {};
    const data = JSON.parse(fs.readFileSync(FILE_PATH, "utf8"));
    return data && typeof data === "object" ? data : {};
  } catch (err) {
    console.error("Error loading tokens:", err.message);
    return {};
  }
}

function save() {
  try {
    fs.mkdirSync(path.dirname(FILE_PATH), { recursive: true });
    fs.writeFileSync(FILE_PATH, JSON.stringify(tokens, null, 2), { mode: 0o600 });
    fs.chmodSync(FILE_PATH, 0o600);
  } catch (err) {
    console.error("Error saving tokens:", err.message);
  }
}

function get(userId) {
  return tokens[userId] || null;
}

function set(userId, token) {
  tokens[userId] = String(token).trim();
  save();
}

function remove(userId) {
  if (!tokens[userId]) return;
  delete tokens[userId];
  save();
}

module.exports = { get, set, remove };
