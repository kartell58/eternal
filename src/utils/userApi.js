const axios = require("axios");
const fs = require("fs");
const path = require("path");

let botConfig = {};
try {
  botConfig = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "..", "config.json"), "utf8")
  );
} catch (err) {
  console.error("Could not read config.json:", err.message);
}

const BASE_URL = "https://discord.com/api/v9";
const REQUEST_TIMEOUT_MS = Number(botConfig.requestTimeoutMs) || 20000;

function buildHeaders(token, hasBody) {
  const headers = {
    authorization: token,
    "user-agent": botConfig.userAgent || "Mozilla/5.0",
    "accept-language": "en-US,en;q=0.9",
    origin: "https://discord.com",
    referer: "https://discord.com/channels/@me"
  };

  if (botConfig.xSuperProperties) {
    headers["x-super-properties"] = botConfig.xSuperProperties;
  }
  if (hasBody) {
    headers["content-type"] = "application/json";
  }

  return headers;
}

/**
 * Makes an authenticated request using a Discord user token.
 * Always returns an object in the format { status, data } for easier handling.
 */
async function request(endpoint, method, body, token) {
  try {
    return await axios({
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: buildHeaders(token, body !== null && body !== undefined),
      data: body,
      timeout: REQUEST_TIMEOUT_MS,
      validateStatus: () => true
    });
  } catch (error) {
    console.error(
      `Request failed ${method} ${endpoint}:`,
      error.code || error.message
    );
    return { status: 500, data: null, error };
  }
}

async function getUser(token) {
  const res = await request("/users/@me", "GET", null, token);
  if (res.status !== 200) return null;
  return res.data;
}

module.exports = { request, getUser, buildHeaders };
