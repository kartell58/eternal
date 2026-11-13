const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { createLanguageManager, LanguageManager, config } = require("../core/language");
const { format } = require("../core/language/formatter");
const { TranslationValidator } = require("../core/language/validator");
const { TranslationLoader } = require("../core/language/loader");

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

  function tmpDir(prefix = "i18n-") {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  }

  function writeLocale(root, locale, files) {
    const dir = path.join(root, locale);
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), content, "utf8");
    }
  }

  async function makeManager(overrides = {}) {
    const dir = tmpDir("langdb-");
    const mgr = new LanguageManager(Object.assign({
      storageOptions: { dataDir: dir, dbPath: path.join(dir, "language.db") },
      logger: { log: () => {}, warn: () => {}, error: () => {} }
    }, overrides));
    await mgr.init();
    return { mgr, dir };
  }

  // ------------------------------------------------------------------ loader
  await test("YAML loading: loads nested translation files per locale", async () => {
    const { mgr } = await makeManager();
    assert.ok(mgr.translations["en-US"], "en-US loaded");
    assert.ok(mgr.translations["pt-BR"], "pt-BR loaded");
    assert.ok(mgr.translations["es-ES"], "es-ES loaded");
    assert.strictEqual(typeof mgr.translations["en-US"].commands.ping.description, "string");
    mgr.close();
  });

  await test("Nested translation lookup: resolves dotted keys", async () => {
    const { mgr } = await makeManager();
    const value = mgr.t("commands.ping.title", {}, "en-US");
    assert.strictEqual(value, "Pong!");
    const nested = mgr.t("locale.name.pt-BR", {}, "pt-BR");
    assert.strictEqual(nested, "Português (Brasil)");
    mgr.close();
  });

  // ------------------------------------------------------------ interpolation
  await test("Variable interpolation: replaces {{variable}} placeholders", () => {
    const res = format("Pong! Latency: {{latency}}ms.", { latency: 42 });
    assert.strictEqual(res.value, "Pong! Latency: 42ms.");
    assert.deepStrictEqual(res.missing, []);
    assert.strictEqual(res.ok, true);
  });

  await test("Missing variables are preserved and reported safely", () => {
    const res = format("Hello {{name}}, {{missing}}", { name: "Ada" });
    assert.strictEqual(res.value, "Hello Ada, {{missing}}");
    assert.deepStrictEqual(res.missing, ["missing"]);
  });

  // -------------------------------------------------------------- missing key
  await test("Missing keys: t() returns key/fallback safely without throwing", async () => {
    const { mgr } = await makeManager();
    const en = mgr.t("commands.ping.title", {}, "en-US");
    assert.strictEqual(en, "Pong!");
    // key missing in all locales -> returns key string, no throw
    const missing = mgr.t("this.key.does.not.exist", {}, "en-US");
    assert.strictEqual(missing, "this.key.does.not.exist");
    mgr.close();
  });

  // ----------------------------------------------------------------- fallback
  await test("Fallback behavior: missing key in locale falls back to fallback/default locale", async () => {
    const root = tmpDir("locales-");
    writeLocale(root, "en-US", { "common.yml": "a:\n  b: \"Hello {{x}}\"\n" });
    writeLocale(root, "pt-BR", { "common.yml": "a:\n  other: \"Oi\"\n" });
    const dir = tmpDir("langdb-");
    const mgr = new LanguageManager({
      config: Object.assign({}, config, { localesDir: root, supportedLocales: ["en-US", "pt-BR"] }),
      storageOptions: { dataDir: dir, dbPath: path.join(dir, "language.db") },
      logger: { log: () => {}, warn: () => {}, error: () => {} }
    });
    await mgr.init();
    const val = mgr.t("a.b", { x: "world" }, "pt-BR");
    assert.strictEqual(val, "Hello world");
    mgr.close();
  });

  // ------------------------------------------------------- locale resolution
  await test("Locale resolution priority: user > guild > default", async () => {
    const { mgr } = await makeManager();
    const userId = "u1";
    const guildId = "g1";
    // default
    assert.strictEqual(await mgr.resolve({ userId, guildId }), "en-US");
    // guild set
    await mgr.setGuildLocale(guildId, "pt-BR");
    assert.strictEqual(await mgr.resolve({ userId, guildId }), "pt-BR");
    // user overrides guild
    await mgr.setUserLocale(userId, "es-ES");
    assert.strictEqual(await mgr.resolve({ userId, guildId }), "es-ES");
    mgr.close();
  });

  await test("Locale resolution: explicit override works when supported, invalid falls through safely", async () => {
    const { mgr } = await makeManager();
    assert.strictEqual(await mgr.resolve({ locale: "pt-BR" }), "pt-BR");
    // unsupported explicit override should not throw and should resolve to default path
    const resolved = await mgr.resolve({ locale: "xx-YY" });
    assert.strictEqual(resolved, "en-US");
    mgr.close();
  });

  await test("New users/guilds inherit configured language without DB records", async () => {
    const { mgr } = await makeManager();
    assert.strictEqual(await mgr.storage.getUserLocale("nope"), null);
    assert.strictEqual(await mgr.storage.getGuildLocale("nope"), null);
    assert.strictEqual(await mgr.resolve({ userId: "nope", guildId: "nope" }), "en-US");
    mgr.close();
  });

  // ------------------------------------------------------------ persistence
  await test("User preference persistence: set/get/reset", async () => {
    const { mgr } = await makeManager();
    const userId = "user-123";
    assert.strictEqual(await mgr.storage.getUserLocale(userId), null);
    await mgr.setUserLocale(userId, "pt-BR");
    assert.strictEqual(await mgr.storage.getUserLocale(userId), "pt-BR");
    const reset = await mgr.resetUserLocale(userId);
    assert.strictEqual(reset.reset, true);
    assert.strictEqual(await mgr.storage.getUserLocale(userId), null);
    mgr.close();
  });

  await test("Guild preference persistence: set/get/reset", async () => {
    const { mgr } = await makeManager();
    const guildId = "guild-123";
    assert.strictEqual(await mgr.storage.getGuildLocale(guildId), null);
    await mgr.setGuildLocale(guildId, "es-ES");
    assert.strictEqual(await mgr.storage.getGuildLocale(guildId), "es-ES");
    const reset = await mgr.resetGuildLocale(guildId);
    assert.strictEqual(reset.reset, true);
    assert.strictEqual(await mgr.storage.getGuildLocale(guildId), null);
    mgr.close();
  });

  await test("Preference persistence: no duplicate records on repeated set (upsert)", async () => {
    const { mgr } = await makeManager();
    await mgr.setUserLocale("u", "pt-BR");
    await mgr.setUserLocale("u", "es-ES");
    assert.strictEqual(await mgr.storage.getUserLocale("u"), "es-ES");
    const count = mgr.storage.db.prepare("SELECT COUNT(*) AS c FROM user_locale_preferences WHERE user_id = ?").get("u").c;
    assert.strictEqual(count, 1);
    mgr.close();
  });

  // ------------------------------------------------------- invalid locale
  await test("Invalid locale rejection on save", async () => {
    const { mgr } = await makeManager();
    let threw = false;
    try {
      await mgr.setUserLocale("u", "xx-YY");
    } catch (err) {
      threw = true;
      assert.strictEqual(err.code, "UNSUPPORTED_LOCALE");
    }
    assert.strictEqual(threw, true, "expected UNSUPPORTED_LOCALE");
    threw = false;
    try {
      await mgr.setGuildLocale("g", "not-a-locale");
    } catch (err) {
      threw = true;
      assert.strictEqual(err.code, "UNSUPPORTED_LOCALE");
    }
    assert.strictEqual(threw, true, "expected UNSUPPORTED_LOCALE for guild");
    mgr.close();
  });

  await test("Resetting preferences: missing record handled gracefully", async () => {
    const { mgr } = await makeManager();
    const ru = await mgr.resetUserLocale("nobody");
    assert.strictEqual(ru.reset, false);
    const rg = await mgr.resetGuildLocale("noguild");
    assert.strictEqual(rg.reset, false);
    mgr.close();
  });

  // ------------------------------------------------------------ validation
  await test("Translation validation: detects missing/unexpected keys and empty translations", () => {
    const validator = new TranslationValidator({ referenceLocale: "en-US" });
    const translations = {
      "en-US": { a: { b: "hi", c: "ok" } },
      "pt-BR": { a: { b: "oi", d: "extra", c: "" } }
    };
    const report = validator.validate(translations);
    assert.strictEqual(report.ok, false);
    assert.ok(report.issues.some(i => i.type === "unexpected_key" && i.key === "a.d"));
    assert.ok(report.issues.some(i => i.type === "empty_translation" && i.key === "a.c"));
  });

  await test("Loader: malformed YAML is reported and does not corrupt other locales", () => {
    const root = tmpDir("locales-");
    writeLocale(root, "en-US", { "a.yml": "ok:\n  key: \"value\"\n" });
    writeLocale(root, "pt-BR", { "a.yml": "ok: [unterminated\n" });
    const loader = new TranslationLoader({ localesDir: root, logger: { error: () => {} } });
    const result = loader.loadAll(["en-US", "pt-BR"]);
    assert.ok(result.translations["en-US"], "en-US still loaded");
    assert.strictEqual(result.translations["en-US"].ok.key, "value");
    // pt-BR may be partially empty due to file error but en-US unaffected
    assert.ok(result.errors.length > 0, "parse error reported");
  });

  await test("Validator: bundled locales are structurally consistent", async () => {
    const { mgr } = await makeManager();
    const report = mgr.diagnostics.validation;
    assert.ok(report, "validation report exists");
    assert.strictEqual(report.ok, true, `Bundled locale validation issues: ${JSON.stringify(report.issues)}`);
    mgr.close();
  });

  console.log(JSON.stringify(results, null, 2));
  const failed = results.filter(r => !r.ok);
  console.log("FAILED=" + failed.length);
  if (failed.length) process.exit(1);
})();
