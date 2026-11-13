# Internationalization (i18n)

Eternal includes a centralized, modular internationalization system under `src/core/language/`. It provides locale-aware translations, per-user and per-guild language preferences, YAML locale files, automatic locale resolution, and validation/diagnostics.

## Architecture

```
src/core/language/
  index.js       Public API (createLanguageManager, exports)
  manager.js     Central coordinator (init, resolve, t, preferences, reload, diagnostics)
  loader.js      Discovers/loads/parses YAML locale files (safe parsing, per-file isolation)
  resolver.js    Effective locale resolution (priority + fallback)
  formatter.js   {{variable}} interpolation (preserves/reports unresolved placeholders)
  validator.js   Cross-locale structure/value validation and diagnostic reports
  registry.js    Supported locale registry and metadata (codes, display names)
  config.js      Default/fallback locale and locales directory
  storage.js     SQLite persistence for user/guild locale preferences

src/locales/
  en-US/  common.yml  commands.yml  errors.yml  events.yml
  pt-BR/  common.yml  commands.yml  errors.yml  events.yml
  es-ES/  common.yml  commands.yml  errors.yml  events.yml

src/commands/language.js  /language slash command (view/change/reset preferences)
src/events/language.js    Component interaction handler for /language UI
```

Responsibilities are separated: YAML parsing stays in `loader.js`, interpolation in `formatter.js`, resolution rules in `resolver.js`, preference persistence in `storage.js`, and public orchestration in `manager.js`.

## Supported locales

Bundled locales:
- `en-US` — English (US) (**default**)
- `pt-BR` — Português (Brasil)
- `es-ES` — Español (España)

Default and fallback are configured in `src/core/language/config.js`:

```js
{
  defaultLocale: "en-US",
  fallbackLocale: "en-US"
}
```

New users and guilds inherit the configured language without requiring database records.

## Locale resolution priority

1. Explicit locale override (internal use, e.g. `resolve({ locale: "pt-BR" })`)
2. Saved **user** language preference
3. Saved **guild** language preference
4. Bot default locale (`en-US`)

Notes:
- `interaction.locale` / `interaction.guildLocale` from Discord are **not** used to automatically set or override saved preferences.
- Unsupported or missing saved locales fall back safely to the next valid level (with diagnostics logged).

## Translation files (YAML)

- Format: `.yml`, UTF-8, two-space indentation.
- Nested keys are supported and addressed with dot notation (e.g. `commands.ping.response`).
- Key structures must be consistent across locales; no duplicate keys.
- Values should be non-empty strings (numbers/booleans are supported by the formatter/validator as leaf values).
- YAML parsing is isolated in `loader.js` (uses the `yaml` package). Malformed files are reported and must not corrupt other locales.

Interpolation uses `{{variable}}` placeholders:

```yml
commands:
  ping:
    response: "Pong! Latency: {{latency}}ms."
```

## Public API

The manager is initialized during client startup and exposed as `client.language` (`src/connection.js`).

```js
const language = interaction.client.language;

// Resolve the effective locale for a user in a guild
const locale = await language.resolve({
  userId: interaction.user.id,
  guildId: interaction.guildId
});

// Translate a key (never throws for missing keys; falls back and logs diagnostics)
const message = language.t(
  "commands.ping.response",
  { latency: 42 },
  locale
);
// Variables can be omitted: language.t("commands.ping.title", locale)
```

Preference management (validates locale codes before saving):

```js
await language.setUserLocale(userId, "pt-BR");
await language.setGuildLocale(guildId, "es-ES");
await language.resetUserLocale(userId);
await language.resetGuildLocale(guildId);
```

Other useful methods:
- `getSupportedLocales()` — list registered locales/metadata.
- `getDefaultLocale()` — configured default (`en-US`).
- `has(key, locale)` — check if a key exists.
- `getDiagnostics()` — load/validation/missing-key diagnostics.
- `reload()` — reload locale files and revalidate.

`language.t(...)` is safe at runtime: missing keys fall back to the fallback locale when possible, otherwise return the key and emit a diagnostic (rate-limited per key/locale). Unresolved placeholders are preserved and reported.

## Database persistence

Preferences are stored in SQLite at `data/language.db` (created automatically, WAL mode), separate from translations:

- `user_locale_preferences` (`user_id` PRIMARY KEY, `locale`, `updated_at`) — per-user preference.
- `guild_locale_preferences` (`guild_id` PRIMARY KEY, `locale`, `updated_at`) — per-guild preference.

Behavior: upsert on set (no duplicates), delete on reset, missing records return no preference (inherit default). Locale codes are validated against supported locales before saving. Translations are never stored in the database.

## `/language` command

`/language` (ephemeral) lets users:
- View effective, personal, server, and default language.
- Set/reset their **personal** language (any user).
- Set/reset the **server** language (Administrators only, in a guild).

It uses Discord select menus/buttons and responds using the i18n system (`src/commands/language.js`, `src/events/language.js`).

## Adding a new language

1. Create `src/locales/<code>/` (e.g. `fr-FR`) with `common.yml`, `commands.yml`, `errors.yml`, `events.yml`.
2. Copy the key structure from `en-US` and translate values (keep placeholders/keys identical).
3. Add the locale code to `supportedLocales` and metadata in `src/core/language/config.js` / `src/core/language/registry.js` if you want an explicit display name.
4. Run validation/tests to ensure structural consistency and no empty translations.

## Adding translation keys

1. Add the key to **every** supported locale with the same nested path.
2. Use `{{placeholders}}` for dynamic values and document expected variables near usage.
3. Run the language tests/validation; the validator reports missing/unexpected keys and invalid/empty values.

## Validation and diagnostics

- **Load diagnostics:** YAML parse/read errors are logged with file (and line/column when available). A malformed file does not corrupt other locales.
- **Structure validation:** `TranslationValidator` compares locales against the reference (`en-US`) and reports missing/unexpected keys, empty translations, and invalid values. Results are available via `language.getDiagnostics()` and logged on init/reload.
- **Runtime diagnostics:** missing keys and missing interpolation variables are logged (deduplicated) without crashing the bot.
- **Reload:** `await client.language.reload()` reloads locale files and revalidates.

## Consuming the API in features

- Resolve once per interaction/response context when possible: `const locale = await client.language.resolve({ userId, guildId });`
- Pass `locale` to `t(...)` for consistent output: `client.language.t("namespace.key", vars, locale)`.
- Do not persist or infer preferences from `interaction.locale` / `interaction.guildLocale`.
- Handle `UNSUPPORTED_LOCALE` errors from `setUserLocale`/`setGuildLocale` when accepting external input.
