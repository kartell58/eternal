# Architecture

Eternal is a Discord bot that registers slash commands, listens to gateway events, and routes interactions to per-feature handlers for server configuration, verification, AutoQuest/HypeSquad utilities, bot profile management, and a visual message builder.

```text
index.js
  -> src/connection.js (connect, intents, REST command registration, login)
       -> src/loader.js (loadCommands, loadEvents)
            -> src/commands/*.js  (slash command modules)
            -> src/events/*.js    (event/interaction handlers)
       -> src/middlewares/messageHandler.js (InteractionCreate -> command dispatch)

Feature modules:
  src/features/verification/*  (CAPTCHA panel/challenge/role, legacy verification helpers)
  src/features/builder/*       (visual builder command, session/UI services, schemas, builders, storage)

Persistence/config:
  settings.js / settings.json (per-guild panel and module configuration)
  data/tokens.db            (user tokens for quest/hypesquad flows, runtime-managed)
  builder-*.json              (builder drafts/templates/published action mappings)
```

## 1. Entry point and connection — `index.js`, `src/connection.js`

`index.js` loads environment variables and calls `connect()` from `src/connection.js`. `connect()` creates the Discord `Client` with the required gateway intents (`Guilds`, `GuildMembers`, `GuildMessages`), loads command modules via `src/loader.js`, registers slash commands globally through Discord REST (`Routes.applicationCommands` using `TOKEN` and `CLIENT_ID`), wires `InteractionCreate` to `src/middlewares/messageHandler.js`, loads event modules, logs readiness on `ClientReady`, and logs in. This keeps process bootstrap separate from command/event implementations.

## 2. Command and event loading — `src/loader.js`, `src/commands/`, `src/events/`

`loadCommands()` reads `src/commands/*.js`, requires modules that export `data` and `execute`, and returns a `Map` keyed by command name. `loadEvents()` reads `src/events/*.js` and registers each module on the client (`once` or `on`) by its exported event `name`. This convention allows features to add commands/events as files without changing the bootstrap logic, except when command registration payloads or interaction routing depend on module exports.

## 3. Interaction dispatch — `src/middlewares/messageHandler.js`

`messageHandler` receives non-bot `InteractionCreate` interactions and dispatches chat input commands by looking up `interaction.commandName` in the loaded command map. Command modules handle their own replies and errors; the middleware provides a single dispatch point for slash-command execution.

## 4. Server configuration and panels — `src/commands/config.js`, `src/utils/configView.js`, `src/events/configPanel.js`, `settings.js`

`/config` replies ephemerally with the centralized configuration panel built by `src/utils/configView.js`. `src/events/configPanel.js` handles panel interactions (selects/buttons/modals) to update per-guild settings and post configured panels/messages (CAPTCHA verification, honeypot notice, rules, AutoQuest, HypeSquad, and legacy verification). Settings are read/written through `settings.js` and persisted to `settings.json`, allowing each guild to configure channels, roles, and module-specific values independently.

## 5. Verification — `src/features/verification/`, `src/events/captchaVerification.js`, `src/events/guildMemberAdd.js`, `src/events/guildVerification.js`, `src/events/honeypot.js`

The CAPTCHA flow uses a public Components V2 verification panel (`src/features/verification/panel.js`) with **Respond** and **Why verify?** actions. `src/events/captchaVerification.js` handles `captcha_respond` (challenge generation and ephemeral challenge UI), `captcha_answer` (validation, attempts/expiry handling, role assignment), and `captcha_why` (ephemeral explanation). `src/features/verification/captcha.js` generates/stores challenge state, and `src/features/verification/role.js` resolves/assigns the configured verification role with permission/hierarchy checks. Legacy verification and honeypot/welcome behaviors are handled by their respective event handlers and configured through the config panel/settings.

## 6. AutoQuest and HypeSquad — `src/commands/quest.js`, `src/events/autoQuest.js`, `src/events/hypeSquad.js`, `src/services/*`

`/quest` opens an ephemeral control panel (configure account, view quests, start farm). `src/events/autoQuest.js` manages account/token configuration and quest actions through service calls; `src/events/hypeSquad.js` provides HypeSquad house management flows. These features depend on user-provided tokens and external Discord API endpoints, so runtime behavior is constrained by token validity, rate limits, and remote responses.

## 7. Bot profile and presence — `src/commands/bot.js`, `src/utils/botPanelView.js`, `src/events/botPanel.js`

`/bot` presents an ephemeral panel for inspecting and configuring bot profile/presence (name, avatar, banner, status, activity/thought, bio). View construction and interaction handling are separated into `src/utils/botPanelView.js` and `src/events/botPanel.js`, with Discord API updates performed by the bot account subject to permissions and platform limits.

## 8. Visual builder — `src/features/builder/`

The builder feature is isolated under `src/features/builder/` with thin shims at `src/commands/builder.js` and `src/events/builder.js`. `/builder` creates an in-memory session and opens an ephemeral selection/editor UI. Interactions are routed by `interactions/router.js` to navigation, component, property, and publishing handlers. State and UI are built from schemas/builders (`schemas/`, `builders/`) and validated by `utils/validator.js`. Draft/template persistence and publish/edit operations are handled by services (`services/draft.service.js`, `template.service.js`, `publisher.service.js`, `session.service.js`, `published-actions.service.js`). Sessions are process-local and subject to lifecycle/TTL behavior.

## 9. What is deliberately not done

- **No web dashboard or public HTTP API:** the bot is operated through Discord interactions.
- **No arbitrary code execution:** user inputs configure messages/panels or drive predefined flows, not runtime code evaluation.
- **No guaranteed delivery across restarts for in-memory state:** builder sessions and transient challenge state are not durable process state.
- **No secret management beyond local runtime files/env:** tokens and settings are expected to be provided/configured by the operator and must not be committed.
- **No assumption of sufficient permissions:** role assignment, message posting/deletion, and profile edits depend on Discord permissions, hierarchy, and channel access at runtime.
