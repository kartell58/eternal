const assert = require("assert");
const { Collection, ChannelType, MessageFlags } = require("discord.js");

(async () => {
  const results = [];
  const test = async (name, fn) => {
    try {
      await fn();
      results.push({ name, ok: true });
    } catch (e) {
      results.push({ name, ok: false, err: e.message, stack: e.stack });
    }
  };

  const captcha = require("./captcha");
  const { buildCaptchaPanel } = require("./panel");
  const { assignVerificationRole, resolveVerificationRole } = require("./role");
  const { WHY_VERIFY_TEXT, handleRespond, handleAnswer, handleWhy, execute } = require("../../events/captchaVerification");
  const { buildPanel } = require("../../utils/configView");
  const { SEND_ALL_PANELS, postCaptchaPanel } = require("../../events/configPanel");

  const fakeRole = { id: "r1", name: "Verified", position: 5, managed: false, toString() { return `<@&${this.id}>`; } };

  function mockGuild() {
    const channels = new Collection([
      ["c1", { id: "c1", name: "verification", type: ChannelType.GuildText, position: 1 }]
    ]);
    const roles = new Collection([["r1", fakeRole]]);
    return {
      id: "g1",
      name: "Test Guild",
      channels: { cache: channels },
      roles: { cache: roles },
      members: { me: { roles: { highest: { position: 10 } } } }
    };
  }

  function mockMember({ hasRole = false } = {}) {
    const added = [];
    return {
      added,
      roles: {
        cache: { has: () => hasRole },
        add: async (role, reason) => { added.push({ role, reason }); }
      }
    };
  }

  function mockButtonInteraction(customId, { guild, member, userId = "u1" } = {}) {
    return {
      customId,
      isButton: () => true,
      isStringSelectMenu: () => false,
      isChatInputCommand: () => false,
      guild: guild === undefined ? mockGuild() : guild,
      member: member || mockMember(),
      user: { id: userId },
      async reply(payload) { this.repliedPayload = payload; return payload; },
      async update(payload) { this.updated = payload; return payload; }
    };
  }

  function mockSelectInteraction(customId, { guild, member, userId = "u1", values = [] } = {}) {
    return {
      customId,
      isButton: () => false,
      isStringSelectMenu: () => true,
      isChatInputCommand: () => false,
      guild: guild === undefined ? mockGuild() : guild,
      member: member || mockMember(),
      user: { id: userId },
      values,
      async reply(payload) { this.repliedPayload = payload; return payload; },
      async update(payload) { this.updated = payload; return payload; }
    };
  }

  function buttonIds(row) {
    return row.toJSON().components.map(c => c.custom_id);
  }

  const EPH_CV2 = MessageFlags.Ephemeral | MessageFlags.IsComponentsV2;

  function flattenNodes(components) {
    const out = [];
    function walk(n) {
      if (!n) return;
      if (Array.isArray(n)) return n.forEach(walk);
      const j = typeof n.toJSON === "function" ? n.toJSON() : n;
      if (!j) return;
      out.push(j);
      if (Array.isArray(j.components)) j.components.forEach(walk);
    }
    walk(components || []);
    return out;
  }
  function textContents(components) {
    return flattenNodes(components).filter(n => n.type === 10).map(n => n.content);
  }
  function buttonNodes(components) {
    return flattenNodes(components).filter(n => n.type === 2);
  }
  function selectNodes(components) {
    return flattenNodes(components).filter(n => n.type === 3);
  }
  function mediaItems(components) {
    return flattenNodes(components).filter(n => n.type === 12).flatMap(g => g.items || []);
  }
  function separatorCount(components) {
    return flattenNodes(components).filter(n => n.type === 14).length;
  }

  await test("generateCode returns 6 alphabet characters", async () => {
    for (let i = 0; i < 100; i += 1) {
      const code = captcha.generateCode();
      assert.strictEqual(code.length, 6);
      assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    }
  });

  await test("formatCode renders the 3+3 layout", async () => {
    assert.strictEqual(captcha.formatCode("P899MT"), "P89 9MT");
    assert.strictEqual(captcha.formatCode("p89 9mt"), "P89 9MT");
  });

  await test("generateOptions returns 6 unique options including the code", async () => {
    for (let i = 0; i < 50; i += 1) {
      const code = captcha.generateCode();
      const options = captcha.generateOptions(code);
      assert.strictEqual(options.length, 6);
      assert.strictEqual(new Set(options).size, 6);
      assert.ok(options.includes(captcha.formatCode(code)));
      for (const option of options) assert.match(option, /^[A-Z2-9]{3} [A-Z2-9]{3}$/);
    }
  });

  await test("renderCaptcha returns a PNG buffer", async () => {
    const png = captcha.renderCaptcha("P899MT");
    assert.ok(Buffer.isBuffer(png));
    assert.deepStrictEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.ok(png.length > 500, "image should have content");
  });

  await test("createChallenge stores attempts, expiry and a fresh image", async () => {
    captcha.clearChallenges();
    const entry = captcha.createChallenge("g1", "u1");
    assert.strictEqual(entry.attemptsLeft, 3);
    assert.ok(entry.expiresAt - Date.now() > 100 * 1000, "expires in ~2 minutes");
    assert.ok(entry.image.length > 500);
    const fetched = captcha.getChallenge("g1", "u1");
    assert.ok(fetched);
    assert.strictEqual(fetched.code, entry.code);
    assert.strictEqual(fetched.options.length, 6);
    captcha.clearChallenges();
  });

  await test("creating a second challenge replaces the first", async () => {
    captcha.clearChallenges();
    const first = captcha.createChallenge("g1", "u1");
    const second = captcha.createChallenge("g1", "u1");
    assert.notStrictEqual(first.code, second.code) || assert.notStrictEqual(first.image, second.image);
    const attemptsBefore = second.attemptsLeft;
    assert.strictEqual(attemptsBefore, 3);
    captcha.clearChallenges();
  });

  await test("expired challenges are pruned and invisible", async () => {
    captcha.clearChallenges();
    const entry = captcha.createChallenge("g1", "u1");
    entry.expiresAt = Date.now() - 1000;
    assert.strictEqual(captcha.getChallenge("g1", "u1"), null);
    captcha.clearChallenges();
  });

  await test("buildCaptchaPanel exposes a cv2 container with Respond and Why verify? buttons", async () => {
    const payload = buildCaptchaPanel();
    assert.strictEqual(payload.embeds, undefined);
    assert.strictEqual(payload.components.length, 1);
    assert.strictEqual(payload.components[0].toJSON().type, 17);
    assert.strictEqual(payload.components[0].toJSON().accent_color, undefined, "container renders without an accent color");
    assert.strictEqual(payload.flags & MessageFlags.IsComponentsV2, MessageFlags.IsComponentsV2);
    assert.deepStrictEqual(payload.allowedMentions, { parse: [] });
    const texts = textContents(payload.components).join("\n");
    assert.match(texts, /Verification/);
    assert.match(texts, /\*\*`CAPTCHA`\*\*/);
    const buttons = buttonNodes(payload.components);
    assert.deepStrictEqual(buttons.map(b => b.custom_id), ["captcha_respond", "captcha_why"]);
    assert.deepStrictEqual(buttons.map(b => b.label), ["Respond", "Why verify?"]);
    assert.deepStrictEqual(buttons.map(b => b.style), [1, 2]); // Primary, Secondary
  });

  await test("handleRespond replies ephemeral cv2 with image and six options", async () => {
    captcha.clearChallenges();
    const guild = mockGuild();
    const member = mockMember();
    const interaction = mockButtonInteraction("captcha_respond", { guild, member });
    await handleRespond(interaction, { getSetting: () => "r1" });
    assert.ok(interaction.repliedPayload, "reply sent");
    assert.strictEqual(interaction.repliedPayload.flags, EPH_CV2);
    assert.strictEqual(interaction.repliedPayload.embeds, undefined);
    assert.strictEqual(interaction.repliedPayload.components[0].toJSON().accent_color, undefined, "challenge container renders without an accent color");
    assert.strictEqual(interaction.repliedPayload.files.length, 1);
    assert.strictEqual(interaction.repliedPayload.files[0].name, "captcha.png");
    const media = mediaItems(interaction.repliedPayload.components);
    assert.strictEqual(media.length, 1);
    assert.strictEqual(media[0].media.url, "attachment://captcha.png");
    assert.ok(media[0].description, "media item carries a description (ALT badge)");
    const texts = textContents(interaction.repliedPayload.components).join("\n");
    assert.match(texts, /Verification — CAPTCHA Challenge/);
    assert.match(texts, /Attempts left: 3\/3/);
    assert.match(texts, /Time limit: 2 minutes/);
    const select = selectNodes(interaction.repliedPayload.components)[0];
    assert.strictEqual(select.custom_id, "captcha_answer");
    assert.strictEqual(select.options.length, 6);
    assert.strictEqual(new Set(select.options.map(o => o.value)).size, 6);
    captcha.clearChallenges();
  });

  await test("handleRespond rejects when verification role is not configured", async () => {
    captcha.clearChallenges();
    const interaction = mockButtonInteraction("captcha_respond", {});
    await handleRespond(interaction, { getSetting: () => undefined });
    assert.strictEqual(interaction.repliedPayload.flags, MessageFlags.Ephemeral);
    assert.match(interaction.repliedPayload.content, /not configured/i);
    assert.strictEqual(interaction.repliedPayload.files, undefined);
    captcha.clearChallenges();
  });

  await test("handleRespond short-circuits when member already has the role", async () => {
    captcha.clearChallenges();
    const member = mockMember({ hasRole: true });
    const interaction = mockButtonInteraction("captcha_respond", { member });
    await handleRespond(interaction, { getSetting: () => "r1" });
    assert.match(interaction.repliedPayload.content, /already have/i);
    captcha.clearChallenges();
  });

  await test("handleAnswer correct option grants the role and clears the challenge", async () => {
    captcha.clearChallenges();
    captcha.createChallenge("g1", "u1");
    const entry = captcha.getChallenge("g1", "u1");
    const member = mockMember();
    const interaction = mockSelectInteraction("captcha_answer", { member, values: [entry.displayCode] });
    const assignCalls = [];
    await handleAnswer(interaction, {
      assignRole: async () => { assignCalls.push(true); return { status: "assigned", message: "Congratulations! You received the <@&r1> role." }; }
    });
    assert.strictEqual(assignCalls.length, 1);
    const texts = textContents(interaction.updated.components).join("\n");
    assert.match(texts, /✅ Verified!/);
    assert.match(texts, /Congratulations!/);
    assert.strictEqual(selectNodes(interaction.updated.components).length, 0, "select removed after success");
    assert.strictEqual(captcha.getChallenge("g1", "u1"), null);
  });

  await test("handleAnswer wrong option decrements attempts and keeps the challenge", async () => {
    captcha.clearChallenges();
    captcha.createChallenge("g1", "u1");
    const member = mockMember();
    const wrong = captcha.getChallenge("g1", "u1").options.find(o => o !== captcha.getChallenge("g1", "u1").displayCode);
    const interaction = mockSelectInteraction("captcha_answer", { member, values: [wrong] });
    await handleAnswer(interaction, { assignRole: async () => { throw new Error("assignRole must not be called"); } });
    const entry = captcha.getChallenge("g1", "u1");
    assert.ok(entry, "challenge kept");
    assert.strictEqual(entry.attemptsLeft, 2);
    const texts = textContents(interaction.updated.components).join("\n");
    assert.match(texts, /2\/3/);
    assert.match(texts, /❌ Incorrect code/);
    assert.strictEqual(selectNodes(interaction.updated.components).length, 1, "select kept for another attempt");
    assert.ok(mediaItems(interaction.updated.components).length === 1, "image kept");
    captcha.clearChallenges();
  });

  await test("handleAnswer third wrong option invalidates the challenge", async () => {
    captcha.clearChallenges();
    captcha.createChallenge("g1", "u1");
    const member = mockMember();
    for (let i = 0; i < 3; i += 1) {
      const current = captcha.getChallenge("g1", "u1");
      const wrong = current.options.find(o => o !== current.displayCode);
      const interaction = mockSelectInteraction("captcha_answer", { member, values: [wrong] });
      await handleAnswer(interaction, { assignRole: async () => { throw new Error("assignRole must not be called"); } });
      if (i < 2) continue;
      const texts = textContents(interaction.updated.components).join("\n");
      assert.match(texts, /❌ Verification failed/);
      assert.strictEqual(selectNodes(interaction.updated.components).length, 0);
    }
    assert.strictEqual(captcha.getChallenge("g1", "u1"), null);
    captcha.clearChallenges();
  });

  await test("handleAnswer after expiry reports expiration without granting a role", async () => {
    captcha.clearChallenges();
    const entry = captcha.createChallenge("g1", "u1");
    entry.expiresAt = Date.now() - 1000;
    const member = mockMember();
    const interaction = mockSelectInteraction("captcha_answer", { member, values: [entry.displayCode] });
    await handleAnswer(interaction, { assignRole: async () => { throw new Error("assignRole must not be called"); } });
    const texts = textContents(interaction.updated.components).join("\n");
    assert.match(texts, /⏱️ Challenge expired/);
    assert.strictEqual(interaction.updated.components[0].toJSON().accent_color, undefined, "result container renders without an accent color");
    assert.strictEqual(captcha.getChallenge("g1", "u1"), null);
  });

  await test("handleAnswer surfaces role assignment failures", async () => {
    captcha.clearChallenges();
    captcha.createChallenge("g1", "u1");
    const entry = captcha.getChallenge("g1", "u1");
    const member = mockMember();
    const interaction = mockSelectInteraction("captcha_answer", { member, values: [entry.displayCode] });
    await handleAnswer(interaction, {
      assignRole: async () => ({ status: "hierarchy", message: "I cannot assign this role due to role hierarchy." })
    });
    const texts = textContents(interaction.updated.components).join("\n");
    assert.match(texts, /⚠️ Verification issue/);
    captcha.clearChallenges();
  });

  await test("handleWhy answers with the TOOLS-style cv2 container and exact text", async () => {
    const interaction = mockButtonInteraction("captcha_why", {});
    await handleWhy(interaction);
    assert.strictEqual(interaction.repliedPayload.flags, EPH_CV2);
    assert.strictEqual(interaction.repliedPayload.content, undefined);
    assert.strictEqual(interaction.repliedPayload.embeds, undefined);
    const texts = textContents(interaction.repliedPayload.components);
    assert.strictEqual(interaction.repliedPayload.components[0].toJSON().accent_color, undefined, "why verify container renders without an accent color");
    assert.strictEqual(texts[0], "**Why verify your account?**");
    assert.strictEqual(texts[1], "Account verification helps prevent unwanted accounts from joining our server, keeping the community safer and reducing unnecessary spam in your DMs.");
    assert.strictEqual(texts[texts.length - 1], "-# Developed by kartell (2sj5) • discord.gg/mN4Rh4c35");
    assert.strictEqual(separatorCount(interaction.repliedPayload.components), 1, "separator between body and credit");
    assert.strictEqual(
      WHY_VERIFY_TEXT,
      "**Why verify your account?**\n" +
      "Account verification helps prevent unwanted accounts from joining our server, keeping the community safer and reducing unnecessary spam in your DMs.\n" +
      "Developed by kartell (2sj5) • discord.gg/mN4Rh4c35"
    );
  });

  await test("execute routes captcha buttons and the answer select", async () => {
    const why = mockButtonInteraction("captcha_why", {});
    await execute(why);
    assert.ok(textContents(why.repliedPayload.components)[0].startsWith("**Why verify your account?**"));

    const unrelated = mockButtonInteraction("btn_verify", {});
    await execute(unrelated);
    assert.strictEqual(unrelated.repliedPayload, undefined);
  });

  await test("assignVerificationRole assigns, respects configured role and hierarchy", async () => {
    const member = mockMember();
    const interaction = {
      guild: mockGuild(),
      member,
      user: { id: "u1" }
    };

    const ok = await assignVerificationRole(interaction, { getSetting: () => "r1" });
    assert.strictEqual(ok.status, "assigned");
    assert.strictEqual(member.added.length, 1);
    assert.strictEqual(member.added[0].reason, "Verification completed");

    const missing = await assignVerificationRole(interaction, { getSetting: () => undefined });
    assert.strictEqual(missing.status, "not-configured");

    const hasIt = await assignVerificationRole(
      { ...interaction, member: mockMember({ hasRole: true }) },
      { getSetting: () => "r1" }
    );
    assert.strictEqual(hasIt.status, "already");

    const lowBot = await assignVerificationRole(
      { ...interaction, guild: { ...mockGuild(), members: { me: { roles: { highest: { position: 5 } } } } } },
      { getSetting: () => "r1" }
    );
    assert.strictEqual(lowBot.status, "hierarchy");

    const failing = await assignVerificationRole(
      { ...interaction, member: { roles: { cache: { has: () => false }, add: async () => { throw new Error("boom"); } } } },
      { getSetting: () => "r1" }
    );
    assert.strictEqual(failing.status, "error");
  });

  await test("resolveVerificationRole returns the configured role or null", async () => {
    const interaction = { guild: mockGuild() };
    assert.strictEqual(resolveVerificationRole(interaction, () => "r1").id, "r1");
    assert.strictEqual(resolveVerificationRole(interaction, () => undefined), null);
    assert.strictEqual(resolveVerificationRole(interaction, () => "unknown"), null);
  });

  await test("config panel lays out CAPTCHA first, legacy verification last", async () => {
    const panel = buildPanel(mockGuild());
    assert.strictEqual(panel.components.length, 5);
    assert.deepStrictEqual(buttonIds(panel.components[2]), ["btn_post_captcha", "btn_post_honeypot", "btn_post_regras"]);
    assert.deepStrictEqual(buttonIds(panel.components[3]), ["btn_post_autoquest", "btn_post_hypesquad", "btn_post_all"]);
    assert.deepStrictEqual(buttonIds(panel.components[4]), ["btn_post_verification"]);
    const labels = panel.components[2].toJSON().components.map(b => b.label);
    assert.deepStrictEqual(labels, ["Post CAPTCHA panel", "Post honeypot notice", "Post rules"]);
  });

  await test("Send all posts the CAPTCHA panel as the primary verification panel", async () => {
    const names = SEND_ALL_PANELS.map(([name]) => name);
    assert.deepStrictEqual(names, ["CAPTCHA Verification", "Honeypot", "Rules", "AutoQuest", "HypeSquad"]);
    assert.strictEqual(SEND_ALL_PANELS[0][1], postCaptchaPanel);
    assert.ok(!names.some(n => n === "Verification"), "legacy panel is not part of Send all");
  });

  console.log(JSON.stringify(results, null, 2));
  const failed = results.filter(r => !r.ok);
  console.log("FAILED=" + failed.length);
  if (failed.length) process.exit(1);
})();
