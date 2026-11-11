# Eternal

Eternal is a Discord bot built with Node.js and discord.js.

## Scope

### What it does
- Registers and handles the `/ping` slash command to show bot latency and uptime.
- Handles `guildMemberAdd` to assign a configured auto role and post a welcome embed in a configured channel (as implemented in the initial version).
- Includes a `/getid` command utility for listing server IDs.
- Provides a basic command/event loader and Discord gateway connection bootstrap.

### What it is not
- Not a fully configurable multi-guild management bot in this version.
- Does not include persistent per-guild configuration, moderation panels, or a visual message builder.

## Requirements
- Node.js (CommonJS)
- `discord.js` v14
- A Discord application/bot token and client ID

## Configuration
Create a `.env` file with:
- `TOKEN` — Discord bot token
- `CLIENT_ID` — Discord application client ID

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

The bot logs in, registers application commands, and loads events on startup.

## Limitations
- Some behavior (such as welcome/role channel and role IDs) is hardcoded in this initial snapshot.
- No automated test suite is included in this version.

## License
See [LICENSE](LICENSE) if present in this repository.
