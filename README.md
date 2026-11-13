# Eternal

Eternal is a Discord bot built with Node.js and discord.js, providing per-server configuration panels and a visual message builder.

## Scope

### What it does
- Registers slash commands and handles Discord gateway events.
- Provides `/ping`, `/config`, `/quest`, `/clear`, `/builder`, and `/bot` for server/bot management features.
- Supports configurable per-guild settings (persisted in `settings.json`) for welcome, verification, honeypot (anti-selfbot), rules, AutoQuest, and HypeSquad panels/channels/roles.
- Includes `/builder`: a visual message editor for creating/editing/previewing/publishing messages with Embeds and Components V2, with drafts/templates and validation (implemented under `src/features/builder/`).
- Provides `/bot` to manage and configure bot profile and presence (name, avatar, banner, status, activity/thought, bio) via an embed panel.
- Includes AutoQuest/HypeSquad utilities and supporting services.

### What it is not
- Not a general-purpose website/dashboard; interaction is via Discord commands and components.
- Does not execute arbitrary user-provided code.
- Not a substitute for Discord's native safety/moderation controls.

## Requirements
- Node.js (CommonJS)
- `discord.js` v14
- Dependencies as declared in `package.json` (e.g. `dotenv`, `axios`)

## Configuration
- `.env`: `TOKEN` (bot token), `CLIENT_ID` (application client ID)
- Runtime data (gitignored as configured): `settings.json`, `data/tokens.json`, and builder storage such as `builder-drafts.json`, `builder-templates.json`, `builder-published-actions.json`.

## Build and test
```bash
npm install
node --check index.js
node src/features/builder/tests/audit-fixes.test.js
```

## Usage
```bash
npm start
# or
node .
```
- Use `/config` to configure server modules and post panels.
- Use `/builder` to create, edit, preview, save, and publish messages.

## Architecture
Core entry: `index.js` -> `src/connection.js`; commands/events are loaded from `src/commands` and `src/events`. The builder feature is isolated under `src/features/builder/` with command/event shims at `src/commands/builder.js` and `src/events/builder.js`. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) when available.

## Limitations
- Builder sessions are in-memory and subject to session lifecycle/TTL behavior.
- Feature behavior depends on bot permissions, role hierarchy, and correct channel configuration.
- AutoQuest/HypeSquad flows rely on user-provided tokens and external Discord endpoints; secrets must never be committed.

## License
See [LICENSE](LICENSE) if present in this repository.
