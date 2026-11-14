# Eternal

Eternal is a Discord bot written in Node.js (CommonJS) using discord.js. It provides per-guild configuration panels, CAPTCHA-based and legacy verification flows, AutoQuest and HypeSquad utilities, bot profile/presence management, and a visual message builder.

## Scope

### What it does
- Registers slash commands globally on startup and handles Discord gateway events (`src/connection.js`, `src/loader.js`).
- Provides slash commands: `/ping` (latency/uptime), `/config` (ephemeral server configuration panel), `/clear` (bulk delete recent messages, requires Manage Messages), `/quest` (AutoQuest control panel), `/bot` (bot profile/presence panel), and `/builder` (visual message builder).
- Supports per-guild configuration and panel posting for welcome, CAPTCHA verification, honeypot notice, rules, AutoQuest, and HypeSquad, with legacy verification support (`settings.js`, `src/utils/configView.js`, `src/events/configPanel.js`).
- Implements a CAPTCHA verification flow: public Components V2 panel with **Respond** and **Why verify?**, ephemeral image/code challenge with attempts and expiry, and configured verification role assignment (`src/features/verification/`, `src/events/captchaVerification.js`).
- Includes AutoQuest and HypeSquad interaction flows backed by service modules and user-provided tokens stored in runtime data (`src/events/autoQuest.js`, `src/events/hypeSquad.js`, `data/tokens.json`).
- Provides `/builder` for creating, editing, previewing, saving, and publishing Embed and Components V2 messages, with drafts/templates and validation (`src/features/builder/`).

### What it is not
- Not a web dashboard or public HTTP API; operation happens through Discord commands and component interactions.
- Not an arbitrary code execution environment; user inputs drive predefined bot behavior only.
- Not a replacement for Discord permissions, role hierarchy, or platform safety/moderation controls.
- Not a guaranteed durable workflow engine: in-memory sessions/challenges and runtime JSON/SQLite files are local operational state, not a managed backup system.

## Capabilities

| Capability | Status | Notes |
| --- | --- | --- |
| Slash command registration and event loading | Supported | Commands registered via REST on startup; commands/events loaded from `src/commands` and `src/events`. |
| `/ping` latency and uptime embed | Supported | Returns interaction latency, WebSocket ping, and process uptime. |
| `/config` per-guild configuration panel | Supported | Ephemeral panel for channels/roles/modules and posting configured panels. |
| `/clear` bulk message deletion | Supported | Requires Manage Messages; deletes up to 100 recent messages (Discord 14-day limit applies). |
| CAPTCHA verification panel and challenge | Supported | Public CV2 panel, ephemeral challenge with image/select options, attempts/expiry, role assignment on success. |
| Legacy verification and honeypot/rules/welcome flows | Supported | Available/configurable through existing handlers and settings. |
| `/quest` AutoQuest panel and farm actions | Supported (external dependency) | Depends on user-provided tokens, Discord endpoints, and account/quest availability. |
| HypeSquad configuration/actions | Supported (external dependency) | Depends on user-provided tokens and Discord endpoints. |
| `/bot` profile and presence management | Supported (permission-limited) | Subject to bot account/platform permissions and API constraints. |
| `/builder` visual Embed/Components V2 editor | Supported | Ephemeral session UI with preview, validation, drafts/templates, publish/edit flows; sessions are in-memory. |

## Requirements

- **Node.js:** a current Node.js runtime compatible with the repository dependencies (tested in this workspace with Node.js 22.x).
- **npm:** for installing dependencies from `package.json`/`package-lock.json`.
- **Discord application/bot:** a bot token and application client ID with required intents and permissions enabled.
- **System/build prerequisites:** `better-sqlite3` and `@napi-rs/canvas` may require native build tooling supported by your platform/Node version.
- **Dependencies:** declared in `package.json` (runtime: `discord.js`, `dotenv`, `axios`, `better-sqlite3`, `@napi-rs/canvas`).

## Build and test

```bash
npm install
node --check index.js
node src/features/verification/captcha.test.js
node src/features/builder/tests/audit-fixes.test.js
node src/features/builder/tests/container-creation-flow.test.js
node src/features/builder/tests/container-data-preservation.test.js
node src/features/builder/tests/container-editor.test.js
node src/features/builder/tests/embed-editor.test.js
node src/features/builder/tests/json-editor.test.js
node src/features/builder/tests/native-container-presentation.test.js
node src/features/builder/tests/ui-redesign.test.js
```

## Usage

Create a `.env` file with the required credentials:

```env
TOKEN=your_discord_bot_token
CLIENT_ID=your_application_client_id
```

Start the bot:

```bash
npm start
# or
node .
# development (watch mode)
npm run dev
```

On startup, Eternal loads commands/events, registers slash commands via Discord REST, and connects to the gateway (`index.js`, `src/connection.js`).

| Command | Options | Effect |
| --- | --- | --- |
| `/ping` | None | Replies with an embed showing interaction latency, WebSocket ping, and bot uptime. |
| `/config` | None | Opens an ephemeral server configuration panel for module settings and posting panels/messages. |
| `/clear` | None | Deletes up to 100 recent messages in the current text-based channel (requires Manage Messages; messages older than 14 days cannot be bulk-deleted). |
| `/quest` | None | Opens an ephemeral AutoQuest control panel (configure account, view quests, start farm). |
| `/bot` | None | Opens an ephemeral panel to view/configure bot profile and presence settings. |
| `/builder` | None | Opens an ephemeral visual builder session to create/edit/preview/save/publish Embed or Components V2 messages. |

## Worked example

**Input** (Discord slash command):

```text
/ping
```

**Real output** (embed structure produced by `src/commands/ping.js`; values are runtime-dependent and shown here as representative):

```text
Title: 🏓 Pong!
Fields:
  Interaction: 42ms
  WS: 38ms
  Uptime: 0d 1h 12m 4s
Timestamp: 2026-11-14T01:20:55.000Z
```

This example approximates a real `/ping` response: latency and uptime values vary by network conditions, gateway state, and process lifetime.

## Architecture

The entry point (`index.js`) initializes the environment and calls `src/connection.js`, which creates the Discord client, registers commands, loads commands/events, and logs in. Slash-command execution is dispatched from `InteractionCreate` via `src/middlewares/messageHandler.js`. Feature logic is organized under `src/events/`, `src/utils/`, `src/services/`, and `src/features/` (including `verification` and `builder`).

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the runtime flow, stage responsibilities, and design boundaries.

## Limitations

- **Runtime dependencies:** command registration and all Discord interactions require a valid `TOKEN`/`CLIENT_ID`, gateway connectivity, and appropriate bot intents/permissions.
- **Permission and hierarchy constraints:** message deletion, panel posting, role assignment, and bot profile updates can fail when permissions, role hierarchy, or channel access are insufficient.
- **Ephemeral/in-memory state:** builder sessions and CAPTCHA challenge state are process-local and can be lost on restart or expiration.
- **External service reliance:** AutoQuest and HypeSquad flows depend on user-provided tokens and external Discord API behavior, including rate limits and token validity.
- **Local runtime data:** `settings.json`, `data/tokens.json`, and builder JSON storage files are operational data; they are not committed and are not automatically backed up by the bot.
- **No live end-to-end verification in this change:** documentation was updated to reflect repository behavior and available tests; full runtime behavior depends on a correctly configured Discord environment.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
