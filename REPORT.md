# Eternal — Project Recovery and Update

## Status: recovery completed

## 1. Initial diagnosis

The project had regressed to its first version:

- Only `/ping` was implemented.
- Welcome event with hardcoded IDs and old text (reference to Loritta).
- No persistent per-server configuration.
- Configuration, verification, honeypot, AutoQuest, and HypeSquad panels were missing.
- No Git history available.

## 2. Current state

### 2.1. Commands

| Command | File | Status |
|---------|------|--------|
| `/ping` | `src/commands/ping.js` | Preserved |
| `/config` | `src/commands/config.js` | Rebuilt according to screenshots |
| `/quest` | `src/commands/quest.js` | New - AutoQuest control panel (login, view quests, start farm) |

The `/regras` command was removed at the owner's request (files deleted).

### 2.2. Events

| Event | File | Status |
|-------|------|--------|
| `guildMemberAdd` | `src/events/guildMemberAdd.js` | Welcome + auto role |
| `InteractionCreate` | `src/events/configPanel.js` | `/config` selects and buttons |
| `InteractionCreate` | `src/events/guildVerification.js` | Verification button |
| `MessageCreate` | `src/events/honeypot.js` | Honeypot/anti-selfbot |

## 3. `/config` panel (faithful to screenshots)

Structure reproduced from the original screenshots (assets removed):

- Title: `⚙️ Configuration Panel`.
- Description listing settings with real mentions:
  - 👋 Welcome channel
  - ✅ Verification channel
  - 🛡️ Verification role
  - 🍯 Honeypot (anti-selfbot)
  - 🚀 AutoQuest channel
  - 🏆 HypeSquad channel
  - 🧩 Auto role on join
  - 📜 Rules channel
- Line `Editing: <current module>`.
- Footer `Server: <name> | Today at HH:MM`.
- Select 1: chooses the module (placeholder with current module).
- Select 2: chooses the channel/role (options filtered by type).
- Buttons:
  - `Post verification panel` (Success)
  - `Post honeypot notice` (Danger)
  - `Post AutoQuest panel` (Primary)
  - `Post HypeSquad panel` (Secondary)

Selections are saved automatically to `settings.json` and the panel is updated immediately.

### 3.1. Posted panels

- **Verification**: green embed, title `✅ Verification`, description "Click the button below to receive your verified role.", footer with server name, button `✅ Verify`.
- **Honeypot**: red embed, title `🚫 DO NOT SEND ANY MESSAGES HERE`, warning about automated accounts and softban.
- **Rules**: embed with title `📜 Server Rules`, content read from `config/rules.txt`, posted to the configured channel.
- **AutoQuest**: embed, title `🚀 AutoQuest`, buttons `Configure account` and `Start farm`.
- **HypeSquad**: embed, title `🏆 HypeSquad`, buttons `Configure account`, `Bravery`, `Brilliance`, `Balance`, `Leave house`.

## 4. Features

### 4.1. Welcome

- Configurable channel per server.
- Configurable auto role.
- Embed as in screenshot: author `@username`, title `👋 Welcome!`, description `Hello {mention}, welcome to **{server}**! 🎉`, thumbnail, footer `User ID: ... | dd/mm/yyyy HH:MM`.

### 4.2. Verification

- Button `btn_verify`.
- Checks whether the member already has the role before assigning it.
- Checks bot role hierarchy before attempting assignment.
- Configurable role per server.

### 4.3. Honeypot / anti-selfbot

- Detects messages in the configured channel.
- Deletes the message.
- Applies softban (ban + unban, removing recent messages).
- Respects role hierarchy and the server owner.

### 4.4. AutoQuest and HypeSquad

- Panels can be posted in configured channels, with layout as in screenshots.
- **Internal mechanisms not implemented** (code ported from the owner's Discord client — panel views are available).
- Internal buttons (`Configure account`, `Start farm`, `Bravery`, `Brilliance`, `Balance`, `Leave house`) explicitly respond that the module is pending; no action is simulated.
- Panels are posted in channels configured via the `/config` panel.

### 4.5. Rules

- Content read from `config/rules.txt` and displayed in an embed.
- Publication channel configurable via the `/config` panel.
- "Post rules" button in the panel posts the embed to the configured channel.
- Rules are isolated per server and persistent.

## 5. Architecture

- `src/settings.js`: per-server JSON persistence (`get`, `set`, `remove`, `getAll`).
- `src/utils/configView.js`: builds the `/config` panel (embed, selects, and buttons) and centralizes modules.
- `src/loader.js`: loads commands and events automatically.
- Traditional embeds only; no Components V2.

## 6. Bugs fixed

1. Deprecated `SelectMenuBuilder` → `StringSelectMenuBuilder`.
2. Deprecated `ephemeral: true` → `flags: 64`.
3. Crash `interaction.customId.startsWith` on slash command interactions → `isButton`/`isStringSelectMenu` guards.
4. `guildVerification.js` used non-existent `guild.settings.get` → `get(guild.id, ...)`.
5. Honeypot used non-existent `guild.members.add` → real softban via ban + unban.
6. `/regras` caused crash (undefined `subcommand`) → command removed.

## 7. Tests performed

- `node -c` on all `.js` files: OK.
- Panel builder with mock guild: title, description, footer, 2 selects, and 4 buttons verified.
- Bot startup: `Logged in as eternal#3694`, no warnings/crashes.

## 8. Pending items

| Item | Status |
|------|--------|
| AutoQuest mechanism | Awaiting code from owner |
| HypeSquad mechanism | Awaiting code from owner |
| Components V2 | Separate stage, not started |
| Git | Not available in the environment |

## 9. Notes

- No credentials are exposed in logs or public files.
- Screenshots were used as visual reference, not as definitive specification.
- Settings are isolated per server and persist across restarts.
