const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} = require("discord.js");

const STATUS_LABELS = {
  online: "Online",
  idle: "Idle",
  dnd: "Do Not Disturb",
  invisible: "Invisible"
};

function getTranslator(ctx = {}) {
  const { t, lang, locale } = ctx || {};
  if (typeof t === "function") return t;
  if (lang) return (key, vars) => lang.t(key, vars, locale);
  return (key, vars) => {
    const map = {
      "common.not_set": "Not set",
      "common.set": "Set",
      "common.unknown": "Unknown",
      "events.bot_panel.title": "🤖 Bot Configuration",
      "events.bot_panel.description": "Manage the bot profile and presence directly from this panel.\n\n**Name:** {{name}}\n**Status:** {{status}}\n**Thought/Activity:** {{thought}}\n**Bio:** {{bio}}\n**Avatar:** {{avatar}}\n**Banner:** {{banner}}",
      "events.bot_panel.footer": "Use the controls below to update settings.",
      "events.bot_panel.status_placeholder": "Change status",
      "events.bot_panel.status.online": "Online",
      "events.bot_panel.status.idle": "Idle",
      "events.bot_panel.status.dnd": "Do Not Disturb",
      "events.bot_panel.status.invisible": "Invisible",
      "events.bot_panel.buttons.name": "Name",
      "events.bot_panel.buttons.avatar": "Avatar",
      "events.bot_panel.buttons.banner": "Banner",
      "events.bot_panel.buttons.thought": "Thought",
      "events.bot_panel.buttons.bio": "Bio",
      "events.bot_panel.buttons.refresh": "Refresh"
    };
    let v = map[key] != null ? map[key] : key;
    if (vars && typeof v === "string") {
      for (const [k, val] of Object.entries(vars)) v = v.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g"), String(val));
    }
    return v;
  };
}

function getPresence(client, t) {
  const status = client.user?.presence?.status || "online";
  const activity = client.user?.presence?.activities?.[0];
  const thought = activity?.name ? String(activity.name) : t("common.not_set");
  return { status, thought };
}

async function buildBotPanel(client, ctx = {}) {
  const t = getTranslator(ctx);
  let bio = t("common.not_set");
  try {
    if (!client.application) await client.application?.fetch?.();
    bio = client.application?.description || t("common.not_set");
  } catch {
    bio = t("common.not_set");
  }

  const { status, thought } = getPresence(client, t);
  const username = client.user?.username || t("common.unknown");
  const avatar = client.user?.displayAvatarURL({ size: 256 }) || null;
  const banner = typeof client.user?.bannerURL === "function" ? client.user.bannerURL({ size: 512 }) : null;

  const statusLabel = t(`events.bot_panel.status.${status}`) || STATUS_LABELS[status] || status;

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(t("events.bot_panel.title"))
    .setDescription(t("events.bot_panel.description", {
      name: username,
      status: statusLabel,
      thought,
      bio,
      avatar: avatar ? t("common.set") : t("common.not_set"),
      banner: banner ? t("common.set") : t("common.not_set")
    }))
    .setFooter({ text: t("events.bot_panel.footer") })
    .setTimestamp();

  if (avatar) embed.setThumbnail(avatar);
  if (banner) embed.setImage(banner);

  const statusSelect = new StringSelectMenuBuilder()
    .setCustomId("bot_status")
    .setPlaceholder(t("events.bot_panel.status_placeholder"))
    .addOptions(
      { label: t("events.bot_panel.status.online"), value: "online", emoji: "🟢" },
      { label: t("events.bot_panel.status.idle"), value: "idle", emoji: "🌙" },
      { label: t("events.bot_panel.status.dnd"), value: "dnd", emoji: "⛔" },
      { label: t("events.bot_panel.status.invisible"), value: "invisible", emoji: "⚫" }
    );

  const row1 = new ActionRowBuilder().addComponents(statusSelect);
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("bot_set_name").setLabel(t("events.bot_panel.buttons.name")).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("bot_set_avatar").setLabel(t("events.bot_panel.buttons.avatar")).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("bot_set_banner").setLabel(t("events.bot_panel.buttons.banner")).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("bot_set_thought").setLabel(t("events.bot_panel.buttons.thought")).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("bot_set_bio").setLabel(t("events.bot_panel.buttons.bio")).setStyle(ButtonStyle.Secondary)
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("bot_refresh").setLabel(t("events.bot_panel.buttons.refresh")).setStyle(ButtonStyle.Success)
  );

  return { embeds: [embed], components: [row1, row2, row3] };
}

module.exports = { buildBotPanel, STATUS_LABELS };
