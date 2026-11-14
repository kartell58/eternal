import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} from "discord.js";

const STATUS_LABELS = {
  online: "Online",
  idle: "Idle",
  dnd: "Do Not Disturb",
  invisible: "Invisible"
};

function getPresence(client) {
  const status = client.user?.presence?.status || "online";
  const activity = client.user?.presence?.activities?.[0];
  const thought = activity?.name ? String(activity.name) : "Not set";
  return { status, thought };
}

async function buildBotPanel(client) {
  let bio = "Not set";
  try {
    if (!client.application) await client.application?.fetch?.();
    // application.description may not be populated unless fetched; try to read
    bio = client.application?.description || "Not set";
  } catch {
    bio = "Not set";
  }

  const { status, thought } = getPresence(client);
  const username = client.user?.username || "Unknown";
  const avatar = client.user?.displayAvatarURL({ size: 256 }) || null;
  const banner = typeof client.user?.bannerURL === "function" ? client.user.bannerURL({ size: 512 }) : null;

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🤖 Bot Configuration")
    .setDescription(
      "Manage the bot profile and presence directly from this panel.\n\n" +
        `**Name:** ${username}\n` +
        `**Status:** ${STATUS_LABELS[status] || status}\n` +
        `**Thought/Activity:** ${thought}\n` +
        `**Bio:** ${bio}\n` +
        `**Avatar:** ${avatar ? "Set" : "Not set"}\n` +
        `**Banner:** ${banner ? "Set" : "Not set"}`
    )
    .setFooter({ text: "Use the controls below to update settings." })
    .setTimestamp();

  if (avatar) embed.setThumbnail(avatar);
  if (banner) embed.setImage(banner);

  const statusSelect = new StringSelectMenuBuilder()
    .setCustomId("bot_status")
    .setPlaceholder("Change status")
    .addOptions(
      { label: "Online", value: "online", emoji: "🟢" },
      { label: "Idle", value: "idle", emoji: "🌙" },
      { label: "Do Not Disturb", value: "dnd", emoji: "⛔" },
      { label: "Invisible", value: "invisible", emoji: "⚫" }
    );

  const row1 = new ActionRowBuilder().addComponents(statusSelect);
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("bot_set_name").setLabel("Name").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("bot_set_avatar").setLabel("Avatar").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("bot_set_banner").setLabel("Banner").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("bot_set_thought").setLabel("Thought").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("bot_set_bio").setLabel("Bio").setStyle(ButtonStyle.Secondary)
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("bot_refresh").setLabel("Refresh").setStyle(ButtonStyle.Success)
  );

  return { embeds: [embed], components: [row1, row2, row3] };
}

export { buildBotPanel, STATUS_LABELS };

export default { buildBotPanel, STATUS_LABELS };
