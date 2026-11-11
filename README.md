# Eternal

Eternal is a Discord bot built with Node.js and discord.js, providing per-server configuration and utility panels.

## Scope

### What it does
- Registers slash commands and handles Discord gateway events.
- Provides `/ping` for latency/uptime and `/config` for a centralized server configuration panel.
- Supports configurable per-guild settings (stored in `settings.json`) for welcome channel, verification channel/role, honeypot channel, AutoQuest channel, HypeSquad channel, auto role, and rules channel.
- Posts and handles panels/features for welcome/auto role, member verification, honeypot (anti-selfbot) moderation, rules posting (`rules.txt`), AutoQuest, and HypeSquad.
- Includes utilities for user-token-backed AutoQuest/HypeSquad interactions and supporting services.

### What it is not
- Not a complete moderation suite or a replacement for dedicated security bots.
- Does not include the visual `/builder` message editor in this snapshot.

## Requirements
- Node.js (CommonJS)
- `discord.js` v14
- Dependencies as declared in `package.json` (e.g. `dotenv`, `axios`)

## Configuration
- `.env`: `TOKEN` (bot token), `CLIENT_ID` (application client ID)
- `config.json` may be used by user API utilities where applicable.
- Runtime per-guild settings are persisted to `settings.json` (gitignored).

## Build and test
```bash
npm install
node --check index.js
```

## Usage
```bash
npm start
# or
node .
```
Use `/config` in a server to configure modules and post panels.

## Architecture
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) when available; core entry is `index.js` -> `src/connection.js`, with commands/events loaded from `src/commands` and `src/events`.

## Limitations
- Feature behavior depends on correct bot permissions and role/channel configuration.
- Some integrations rely on user-provided tokens and external Discord endpoints; handle secrets carefully.

## License
See [LICENSE](LICENSE) if present in this repository.
