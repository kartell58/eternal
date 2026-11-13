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

### Public vs ephemeral locale resolution

Apply the effective-locale priority (`explicit > user > guild > default`) consistently, but choose the context identifiers by message visibility:

- **Ephemeral responses / per-user interaction UI** (replies, modals, follow-ups, session panels shown only to the invoking user): resolve the **individual user's effective locale**.
  - Example: `await lang.resolve({ userId: interaction.user.id, guildId: interaction.guildId || null })`
- **Public channel messages / shared guild UI** (posted panels, notices, rules, welcome/automated guild messages, guild-channel logs): resolve the **guild locale**.
  - Example: `await lang.resolve({ guildId: guild.id })`
- **Public automated messages:** use the **guild locale**.
- **Messages explicitly directed to an individual:** use the **individual user's effective locale** when appropriate.
- **Never personalize a shared public message** based on whichever user triggered an event.

Builder sessions store `session.locale` (resolved as the session owner's effective locale at `/builder` open time) for ephemeral per-user builder UI. Responses to interactions on **published** runtime components should resolve from the interacting user's context, not from `session.locale`, unless the response is part of the owner's private builder session.

### Runtime vs Discord command localization

- **Runtime localization** is handled by `client.language` and persisted preferences (this system). Use it for all bot-authored runtime text: replies, embeds, components, modals, validation/errors, and posted content.
- **Discord native slash-command localization** (command names/descriptions shown by Discord clients) is a separate registration-time mechanism in discord.js/Discord API (`setDescriptionLocalizations`, etc.). It does not read `data/language.db` preferences and does not replace runtime `t(...)` calls.
- When adding/changing command metadata, keep runtime descriptions/keys consistent and add native localizations only where the command registration architecture supports them without disrupting existing behavior.

### Adding and validating translations during migration

1. Add the key to **every** supported locale (`en-US`, `pt-BR`, `es-ES`) with identical structure.
2. Use `en-US` as the reference locale and avoid empty placeholder values.
3. Prefer feature-scoped namespaces (e.g. `events.verification.*`, `events.config.*`, `commands.quest.*`, `events.builder.*`) over large flat lists.
4. Preserve dynamic placeholders (`{{var}}`), mentions, IDs, and Markdown formatting; do not let user content be interpreted as template keys.
5. After changes, validate YAML syntax and key consistency, run language tests, and run any feature tests affected by translated output.

## Migration status notes

Completed/in-progress migrations in the current integration pass include localized user-facing flows for:
- Verification/CAPTCHA UI and role messages (`events.verification.*`, `assignVerificationRole`), legacy verify button, and config-posted panels.
- Welcome messages (`events.guild_member_add.*`) using guild locale.
- `/config` and `/bot` panels, replies, modals, and posted module panels (`events.config.*`, `events.bot_panel.*`) with guild-locale posting and user-locale ephemeral interaction feedback.
- Commands: `ping`, `clear`, `config`, `bot`, `quest`, `builder` open flow/error (plus existing `/language`).
- AutoQuest and HypeSquad interaction UI/replies and AutoQuest guild-channel logs (`events.autoquest.*`, `events.hypesquad.*`).

**Not yet fully migrated:** the builder feature UI remains largely hardcoded across `src/features/builder/{interactions,builders,services,utils,schemas}` (navigation/components/properties/publishing/container-editor screens, validator and service error strings, default schema seed content, and some published-runtime messages). Core builder session/router/runtime error paths have initial locale keys and partial integration (`events.builder.*`, `session.locale` on open). A follow-up pass should add `events.builder`/`builder` translation keys for all builder chrome, route service/validator errors through localized formatting, and audit remaining literals. Internal logs, diagnostics, developer comments, machine-readable identifiers, and external/user-authored payload content are intentionally not translated.
