const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType
} = require("discord.js");
const { get } = require("../settings");

/**
 * Configurable modules displayed in the /config panel.
 * Each module points to a settings key and to the type of value
 * (channel or role) that the second select should list.
 */
const MODULES = {
  welcome: {
    label: "Welcome channel",
    emoji: "👋",
    type: "channel",
    setting: "welcomeChannel"
  },
  verificationChannel: {
    label: "Verification channel",
    emoji: "✅",
    type: "channel",
    setting: "verificationChannel"
  },
  verificationRole: {
    label: "Verification role",
    emoji: "🛡️",
    type: "role",
    setting: "verificationRole"
  },
  honeypot: {
    label: "Honeypot (anti-selfbot)",
    emoji: "🍯",
    type: "channel",
    setting: "honeypotChannel"
  },
  autoQuest: {
    label: "AutoQuest",
    emoji: "🚜",
    type: "channel",
    setting: "autoQuestChannel"
  },
  hypeSquad: {
    label: "HypeSquad",
    emoji: "🏡",
    type: "channel",
    setting: "hypeSquadChannel"
  },
  autoRole: {
    label: "Auto role on join",
    emoji: "🧩",
    type: "role",
    setting: "autoRole"
  },
  rules: {
    label: "Rules channel",
    emoji: "📜",
    type: "channel",
    setting: "rulesChannel"
  }
};

const DEFAULT_MODULE = "welcome";

function getTranslator(ctx = {}) {
  const { t, lang, locale } = ctx || {};
  if (typeof t === "function") return t;
  if (lang) return (key, vars) => lang.t(key, vars, locale);
  return (key, vars) => {
    const map = {
      "common.not_configured": "Not configured",
      "events.config.panel.no_options": "No options available",
      "events.config.panel.select_placeholder": "Select the {{module}}",
      "events.config.panel.title": "⚙️ Configuration Panel",
      "events.config.panel.intro": "Choose what to configure below. Selections are saved automatically.",
      "events.config.panel.editing": "Editing: {{module}}",
      "events.config.panel.footer": "Server: {{guild}} | Today at {{time}}",
      "events.config.panel.modules.welcome": "Welcome channel",
      "events.config.panel.modules.verificationChannel": "Verification channel",
      "events.config.panel.modules.verificationRole": "Verification role",
      "events.config.panel.modules.honeypot": "Honeypot (anti-selfbot)",
      "events.config.panel.modules.autoQuest": "AutoQuest",
      "events.config.panel.modules.hypeSquad": "HypeSquad",
      "events.config.panel.modules.autoRole": "Auto role on join",
      "events.config.panel.modules.rules": "Rules channel",
      "events.config.panel.settings.welcome": "👋 Welcome channel: {{value}}",
      "events.config.panel.settings.verificationChannel": "✅ Verification channel: {{value}}",
      "events.config.panel.settings.verificationRole": "🛡️ Verification role: {{value}}",
      "events.config.panel.settings.honeypot": "🍯 Honeypot (anti-selfbot): {{value}}",
      "events.config.panel.settings.autoQuest": "🚜 AutoQuest channel: {{value}}",
      "events.config.panel.settings.hypeSquad": "🏡 HypeSquad channel: {{value}}",
      "events.config.panel.settings.autoRole": "🧩 Auto role on join: {{value}}",
      "events.config.panel.settings.rules": "📜 Rules channel: {{value}}",
      "events.config.panel.buttons.post_captcha": "Post CAPTCHA panel",
      "events.config.panel.buttons.post_honeypot": "Post honeypot notice",
      "events.config.panel.buttons.post_rules": "Post rules",
      "events.config.panel.buttons.post_autoquest": "Post AutoQuest panel",
      "events.config.panel.buttons.post_hypesquad": "Post HypeSquad panel",
      "events.config.panel.buttons.send_all": "Send all",
      "events.config.panel.buttons.post_verification": "Post verification panel"
    };
    let v = map[key] != null ? map[key] : key;
    if (vars && typeof v === "string") {
      for (const [k, val] of Object.entries(vars)) v = v.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g"), String(val));
    }
    return v;
  };
}

function moduleLabel(key, ctx = {}) {
  const tr = getTranslator(ctx);
  const translated = tr(`events.config.panel.modules.${key}`);
  if (translated && translated !== `events.config.panel.modules.${key}`) return translated;
  return (MODULES[key] || MODULES[DEFAULT_MODULE]).label;
}

function timeNow() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatChannel(guild, id, ctx = {}) {
  const tr = getTranslator(ctx);
  const notConfigured = tr("common.not_configured");
  if (!id) return notConfigured;
  const channel = guild.channels.cache.get(id);
  return channel ? `<#${id}>` : notConfigured;
}

function formatRole(guild, id, ctx = {}) {
  const tr = getTranslator(ctx);
  const notConfigured = tr("common.not_configured");
  if (!id) return notConfigured;
  const role = guild.roles.cache.get(id);
  return role ? `<@&${id}>` : notConfigured;
}

/**
 * Builds the select with the available channels or roles for the module.
 */
function buildValueSelect(guild, moduleKey, ctx = {}) {
  const tr = getTranslator(ctx);
  const module = MODULES[moduleKey] || MODULES[DEFAULT_MODULE];

  let options;

  if (module.type === "role") {
    options = guild.roles.cache
      .filter(role => role.id !== guild.id && !role.managed)
      .sort((a, b) => b.position - a.position)
      .map(role => ({
        label: role.name.slice(0, 100),
        value: role.id
      }))
      .slice(0, 25);
  } else {
    options = guild.channels.cache
      .filter(channel => channel.type === ChannelType.GuildText)
      .sort((a, b) => a.position - b.position)
      .map(channel => ({
        label: channel.name.slice(0, 100),
        value: channel.id
      }))
      .slice(0, 25);
  }

  if (options.length === 0) {
    options = [{ label: tr("events.config.panel.no_options"), value: "none" }];
  }

  const label = moduleLabel(moduleKey, ctx);
  const lowerLabel = label.charAt(0).toLowerCase() + label.slice(1);

  return new StringSelectMenuBuilder()
    .setCustomId(`config_value:${moduleKey}`)
    .setPlaceholder(tr("events.config.panel.select_placeholder", { module: lowerLabel }))
    .addOptions(options);
}

/**
 * Builds the full configuration panel (embed + selects + buttons).
 */
async function buildPanel(guild, editingKey = DEFAULT_MODULE, ctx = {}) {
  const tr = getTranslator(ctx);
  const key = MODULES[editingKey] ? editingKey : DEFAULT_MODULE;
  const module = MODULES[key];
  const label = moduleLabel(key, ctx);

  const settingsLines = [
    tr("events.config.panel.settings.welcome", { value: formatChannel(guild, get(guild.id, "welcomeChannel"), ctx) }),
    tr("events.config.panel.settings.verificationChannel", { value: formatChannel(guild, get(guild.id, "verificationChannel"), ctx) }),
    tr("events.config.panel.settings.verificationRole", { value: formatRole(guild, get(guild.id, "verificationRole"), ctx) }),
    tr("events.config.panel.settings.honeypot", { value: formatChannel(guild, get(guild.id, "honeypotChannel"), ctx) }),
    tr("events.config.panel.settings.autoQuest", { value: formatChannel(guild, get(guild.id, "autoQuestChannel"), ctx) }),
    tr("events.config.panel.settings.hypeSquad", { value: formatChannel(guild, get(guild.id, "hypeSquadChannel"), ctx) }),
    tr("events.config.panel.settings.autoRole", { value: formatRole(guild, get(guild.id, "autoRole"), ctx) }),
    tr("events.config.panel.settings.rules", { value: formatChannel(guild, get(guild.id, "rulesChannel"), ctx) })
  ];

  const description =
    tr("events.config.panel.intro") + "\n\n" +
    settingsLines.join("\n") +
    "\n\n" +
    tr("events.config.panel.editing", { module: `${module.emoji} ${label}` });

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(tr("events.config.panel.title"))
    .setDescription(description)
    .setFooter({ text: tr("events.config.panel.footer", { guild: guild.name, time: timeNow() }) });

  const moduleSelect = new StringSelectMenuBuilder()
    .setCustomId("config_module")
    .setPlaceholder(label)
    .addOptions(
      Object.entries(MODULES).map(([value, item]) => ({
        label: moduleLabel(value, ctx),
        value,
        emoji: item.emoji
      }))
    );

  const valueSelect = buildValueSelect(guild, key, ctx);

  const moduleRow = new ActionRowBuilder().addComponents(moduleSelect);
  const valueRow = new ActionRowBuilder().addComponents(valueSelect);

  const postRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("btn_post_captcha").setLabel(tr("events.config.panel.buttons.post_captcha")).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("btn_post_honeypot").setLabel(tr("events.config.panel.buttons.post_honeypot")).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("btn_post_regras").setLabel(tr("events.config.panel.buttons.post_rules")).setStyle(ButtonStyle.Secondary)
  );

  const modulePostRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("btn_post_autoquest").setLabel(tr("events.config.panel.buttons.post_autoquest")).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("btn_post_hypesquad").setLabel(tr("events.config.panel.buttons.post_hypesquad")).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("btn_post_all").setLabel(tr("events.config.panel.buttons.send_all")).setStyle(ButtonStyle.Success)
  );

  const legacyRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("btn_post_verification").setLabel(tr("events.config.panel.buttons.post_verification")).setStyle(ButtonStyle.Secondary)
  );

  return {
    embeds: [embed],
    components: [moduleRow, valueRow, postRow, modulePostRow, legacyRow]
  };
}

module.exports = {
  MODULES,
  DEFAULT_MODULE,
  buildPanel,
  buildValueSelect,
  formatChannel,
  formatRole,
  moduleLabel
};
