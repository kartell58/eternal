const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

/**
 * Builds the public CAPTCHA verification panel payload.
 * Pure builder so it can be unit-tested without a live guild.
 */
function buildCaptchaPanel(guildName) {
  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("🛡️ Verification")
    .setDescription(
      "Before you can access the server, you need to verify that you are not a bot.\n\n" +
      "Click **Respond** below to complete the **`CAPTCHA`** and receive your verified role."
    )
    .setFooter({ text: guildName ? String(guildName).slice(0, 100) : "Verification" });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("captcha_respond")
      .setLabel("Respond")
      .setStyle(ButtonStyle.Success)
      .setEmoji("🛡️"),
    new ButtonBuilder()
      .setCustomId("captcha_why")
      .setLabel("Why verify?")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("❓")
  );

  return { embeds: [embed], components: [row] };
}

module.exports = { buildCaptchaPanel };
