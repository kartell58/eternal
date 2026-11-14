import {
  ContainerBuilder,
  TextDisplayBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} from "discord.js";

/**
 * Builds the public CAPTCHA verification panel payload.
 * Pure builder so it can be unit-tested without a live guild.
 */
function buildCaptchaPanel() {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("🛡️ **Verification**"),
      new TextDisplayBuilder().setContent(
        "Before you can access the server, you need to verify that you are not a bot.\n\n" +
        "Click **Respond** below to complete the **`CAPTCHA`** and receive your verified role."
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("captcha_respond")
          .setLabel("Respond")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("☁️")
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("captcha_why")
          .setLabel("Why verify?")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("❓")
      )
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] }
  };
}

export { buildCaptchaPanel };

export default { buildCaptchaPanel };
