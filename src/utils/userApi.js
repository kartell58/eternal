const axios = require("axios");

// Defaults for user-token Discord API requests (AutoQuest/HypeSquad helpers).
// Kept in code so the runtime does not depend on a local config.json file.
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0.9217 Chrome/138.0.7204.251 Electron/37.6.0 Safari/537.36";
const DEFAULT_X_SUPER_PROPERTIES =
  "eyJvcyI6IldpbmRvd3MiLCJicm93c2VyIjoiQ2hyb21lIiwiZGV2aWNlIjoiIiwic3lzdGVtX2xvY2FsZSI6InB0LUJSIiwiaGFzX2NsaWVudF9tb2RzIjpmYWxzZSwiYnJvd3Nlcl91c2VyX2FnZW50IjoiTW96aWxsYS81LjAgKFdpbmRvd3MgTlQgMTAuMDsgV2luNjQ7IHg2NCkgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzEyMC4wLjAuMCBTYWZhcmkvNTM3LjM2IiwiYnJvd3Nlcl92ZXJzaW9uIjoiMTIwLjAuMC4wIiwib3NfdmVyc2lvbiI6IjEwIiwicmVmZXJyZXIiOiIiLCJyZWZlcnJpbmdfZG9tYWluIjoiIiwicmVsZWFzZV9jaGFubmVsIjoic3RhYmxlIiwiY2xpZW50X2J1aWxkX251bWJlciI6OTk5OTk5LCJjbGllbnRfZXZlbnRfc291cmNlIjpudWxsfQ==";

const BASE_URL = "https://discord.com/api/v9";
const REQUEST_TIMEOUT_MS = 20000;

function buildHeaders(token, hasBody) {
  const headers = {
    authorization: token,
    "user-agent": DEFAULT_USER_AGENT,
    "accept-language": "en-US,en;q=0.9",
    origin: "https://discord.com",
    referer: "https://discord.com/channels/@me",
    "x-super-properties": DEFAULT_X_SUPER_PROPERTIES
  };

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
