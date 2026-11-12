const assert = require("assert");
const { GatewayIntentBits } = require("discord.js");
const { INTENTS } = require("../connection");

const results = [];
const test = (name, fn) => {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, err: e.message, stack: e.stack });
  }
};

test("client requests GuildMessages so messageCreate events (honeypot) are delivered", () => {
  assert.ok(INTENTS.includes(GatewayIntentBits.GuildMessages), "GuildMessages intent missing");
});

test("client keeps Guilds and GuildMembers intents", () => {
  assert.ok(INTENTS.includes(GatewayIntentBits.Guilds), "Guilds intent missing");
  assert.ok(INTENTS.includes(GatewayIntentBits.GuildMembers), "GuildMembers intent missing");
});

test("client does not request MessageContent (not needed by current events)", () => {
  assert.ok(!INTENTS.includes(GatewayIntentBits.MessageContent), "MessageContent intent should not be requested");
});

console.log(JSON.stringify(results, null, 2));
const failed = results.filter(r => !r.ok);
console.log("FAILED=" + failed.length);
if (failed.length) process.exit(1);
