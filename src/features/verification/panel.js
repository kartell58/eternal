const {
  ContainerBuilder,
  TextDisplayBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require("discord.js");

const DEFAULT_PANEL = {
  title: "Verification",
  description:
    "Before you can access the server, you need to verify that you are not a bot.\n\n" +
    "Click **Respond** below to complete the **`CAPTCHA`** and receive your verified role.",
  respond_button: "Respond",
  why_button: "Why verify?"
};

function translator(lang, locale) {
  if (!lang) {
    return (key, vars) => {
      const map = {
        "events.verification.panel.title": DEFAULT_PANEL.title,
        "events.verification.panel.description": DEFAULT_PANEL.description,
        "events.verification.panel.respond_button": DEFAULT_PANEL.respond_button,
        "events.verification.panel.why_button": DEFAULT_PANEL.why_button
      };
      let value = map[key];
      if (value == null) return key;
      if (vars && typeof value === "string") {
        for (const [k, v] of Object.entries(vars)) value = value.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g"), String(v));
      }
      return value;
    };
  }
  return (key, vars) => lang.t(key, vars, locale);
}

/**
 * Builds the public CAPTCHA verification panel payload.
 * When lang/locale are provided, text is resolved through the i18n system.
 */
function buildCaptchaPanel({ lang = null, locale = undefined } = {}) {
  const t = translator(lang, locale);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`🛡️ **${t("events.verification.panel.title")}**`),
      new TextDisplayBuilder().setContent(t("events.verification.panel.description"))
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("captcha_respond")
          .setLabel(t("events.verification.panel.respond_button"))
          .setStyle(ButtonStyle.Primary)
          .setEmoji("☁️")
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("captcha_why")
          .setLabel(t("events.verification.panel.why_button"))
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

module.exports = { buildCaptchaPanel, DEFAULT_PANEL };
