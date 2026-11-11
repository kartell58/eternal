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

function timeNow() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatChannel(guild, id) {
  if (!id) return "Not configured";
  const channel = guild.channels.cache.get(id);
  return channel ? `<#${id}>` : "Not configured";
}

function formatRole(guild, id) {
  if (!id) return "Not configured";
  const role = guild.roles.cache.get(id);
  return role ? `<@&${id}>` : "Not configured";
}

/**
 * Builds the select with the available channels or roles for the module.
 */
function buildValueSelect(guild, moduleKey) {
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
    options = [{ label: "No options available", value: "none" }];
  }

  const lowerLabel = module.label.charAt(0).toLowerCase() + module.label.slice(1);

  return new StringSelectMenuBuilder()
    .setCustomId(`config_value:${moduleKey}`)
    .setPlaceholder(`Select the ${lowerLabel}`)
    .addOptions(options);
}

/**
 * Builds the full configuration panel (embed + selects + buttons).
 */
function buildPanel(guild, editingKey = DEFAULT_MODULE) {
  const key = MODULES[editingKey] ? editingKey : DEFAULT_MODULE;
  const module = MODULES[key];

  const settingsLines = [
    `👋 Welcome channel: ${formatChannel(guild, get(guild.id, "welcomeChannel"))}`,
    `✅ Verification channel: ${formatChannel(guild, get(guild.id, "verificationChannel"))}`,
    `🛡️ Verification role: ${formatRole(guild, get(guild.id, "verificationRole"))}`,
    `🍯 Honeypot (anti-selfbot): ${formatChannel(guild, get(guild.id, "honeypotChannel"))}`,
    `🚜 AutoQuest channel: ${formatChannel(guild, get(guild.id, "autoQuestChannel"))}`,
    `🏡 HypeSquad channel: ${formatChannel(guild, get(guild.id, "hypeSquadChannel"))}`,
    `🧩 Auto role on join: ${formatRole(guild, get(guild.id, "autoRole"))}`,
    `📜 Rules channel: ${formatChannel(guild, get(guild.id, "rulesChannel"))}`
  ];

  const description =
    "Choose what to configure below. Selections are saved automatically.\n\n" +
    settingsLines.join("\n") +
    `\n\nEditing: ${module.emoji} ${module.label}`;

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("⚙️ Configuration Panel")
    .setDescription(description)
    .setFooter({ text: `Server: ${guild.name} | Today at ${timeNow()}` });

  const moduleSelect = new StringSelectMenuBuilder()
    .setCustomId("config_module")
    .setPlaceholder(module.label)
    .addOptions(
      Object.entries(MODULES).map(([value, item]) => ({
        label: item.label,
        value,
        emoji: item.emoji
      }))
    );

  const valueSelect = buildValueSelect(guild, key);

  const moduleRow = new ActionRowBuilder().addComponents(moduleSelect);
  const valueRow = new ActionRowBuilder().addComponents(valueSelect);

  const postRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("btn_post_verification")
      .setLabel("Post verification panel")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("btn_post_honeypot")
      .setLabel("Post honeypot notice")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("btn_post_regras")
      .setLabel("Post rules")
      .setStyle(ButtonStyle.Secondary)
  );

  const modulePostRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("btn_post_autoquest")
      .setLabel("Post AutoQuest panel")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("btn_post_hypesquad")
      .setLabel("Post HypeSquad panel")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("btn_post_all")
      .setLabel("Send all")
      .setStyle(ButtonStyle.Success)
  );

  return {
    embeds: [embed],
    components: [moduleRow, valueRow, postRow, modulePostRow]
  };
}

module.exports = {
  MODULES,
  DEFAULT_MODULE,
  buildPanel,
  buildValueSelect,
  formatChannel,
  formatRole
};
