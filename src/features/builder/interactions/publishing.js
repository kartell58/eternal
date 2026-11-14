const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ChannelSelectMenuBuilder, ChannelType } = require('discord.js');
const { requireSession, saveSession } = require('../services/session.service');
const { buildEmbedPayload } = require('../builders/embed.builder');
const { buildComponentsV2Payload } = require('../builders/components-v2.builder');
const { validateEmbedState, validateComponentsV2State } = require('../utils/validator');
const { toPublishPayload, publishNew, editExisting, canSendToChannel } = require('../services/publisher.service');
const { sessionTranslator } = require('../utils/i18n');

function sid(session) { return session.id; }

function getT(session, interaction) {
  const lang = interaction && interaction.client ? interaction.client.language : null;
  return sessionTranslator(session, lang).t;
}

function buildPublishMenu(session, t) {
  t = t || ((k, v, f) => f || k);
  const validation = session.state.type === 'embed' ? validateEmbedState(session.state, t) : validateComponentsV2State(session.state, t);
  const mode = session.editingMessage
    ? t('events.builder.publishing.menu.mode_edit', { channelId: session.editingMessage.channelId, messageId: session.editingMessage.messageId }, `Edit existing message (${session.editingMessage.channelId}/${session.editingMessage.messageId})`)
    : t('events.builder.publishing.menu.mode_new', {}, 'Publish new message');
  const type = session.state.type === 'components_v2'
    ? t('events.builder.publishing.menu.type_cv2', {}, 'Components V2')
    : t('events.builder.publishing.menu.type_embed', {}, 'Embed');
  const status = validation.valid
    ? t('events.builder.publishing.menu.ready', {}, '✅ Ready')
    : t('events.builder.publishing.menu.issues', {}, '❌ Issues found');
  const lines = [
    t('events.builder.publishing.menu.mode_line', { value: mode }, `**Mode:** ${mode}`),
    t('events.builder.publishing.menu.type_line', { value: type }, `**Type:** ${type}`),
    t('events.builder.publishing.menu.validation_line', { value: status }, `**Validation:** ${status}`),
  ];
  if (!validation.valid) {
    lines.push('');
    lines.push(...validation.errors.slice(0, 6).map(e => `- ${e}`));
    if (validation.errors.length > 6) lines.push(t('events.builder.publishing.menu.and_more', { count: validation.errors.length - 6 }, `- …and ${validation.errors.length - 6} more`));
  }
  if (!session.editingMessage) {
    lines.push('');
    const dest = session.publishChannelId ? `<#${session.publishChannelId}>` : t('events.builder.publishing.menu.destination', {}, 'Not selected');
    lines.push(t('events.builder.publishing.menu.destination_line', { value: dest }, `**Destination:** ${dest}`));
  }

  const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
  const info = new ContainerBuilder()
    .setAccentColor(validation.valid ? 0x57f287 : 0xed4245)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(t('events.builder.publishing.menu.title', {}, '## Publish')),
      new TextDisplayBuilder().setContent(lines.join('\n').slice(0, 4000)),
      new TextDisplayBuilder().setContent(t('events.builder.publishing.menu.footer', {}, '-# Publishing uses safe defaults (mentions disabled). Review preview before confirming.'))
    );

  const components = [info];
  if (!session.editingMessage) {
    const channelTypes = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
    if (ChannelType.PublicThread) channelTypes.push(ChannelType.PublicThread);
    if (ChannelType.PrivateThread) channelTypes.push(ChannelType.PrivateThread);
    if (ChannelType.AnnouncementThread) channelTypes.push(ChannelType.AnnouncementThread);
    components.push(new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder().setCustomId(`bld:${sid(session)}:pub:channel`).setPlaceholder(t('events.builder.publishing.menu.channel_placeholder', {}, 'Select destination channel')).addChannelTypes(...channelTypes)
    ));
  }
  components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:pub:confirm`).setLabel(session.editingMessage ? t('events.builder.publishing.menu.confirm_edit', {}, 'Confirm Edit') : t('events.builder.publishing.menu.confirm_publish', {}, 'Confirm Publish')).setStyle(ButtonStyle.Success).setDisabled(!validation.valid || (!session.editingMessage && !session.publishChannelId)),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:pub:preview`).setLabel(t('events.builder.publishing.menu.final_preview', {}, 'Final Preview')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:back_editor`).setLabel(t('events.builder.publishing.menu.back', {}, 'Back')).setStyle(ButtonStyle.Secondary),
  ));
  if (session.editingMessage) {
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`bld:${sid(session)}:pub:clear_target`).setLabel(t('events.builder.publishing.menu.switch_new', {}, 'Switch to New Message')).setStyle(ButtonStyle.Danger)
    ));
  }
  return { content: null, embeds: [], components, flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 };
}

async function handlePublishing(interaction, { sid }) {
  const { session, error } = requireSession(sid, interaction.user.id, interaction.guildId, { interaction });
  if (error) return interaction.reply({ content: error, flags: 64 });
  const t = getT(session, interaction);
  const action = interaction.customId.split(':')[3];

  if (interaction.isChannelSelectMenu() && action === 'channel') {
    session.publishChannelId = interaction.values[0];
    saveSession(session);
    return interaction.update(buildPublishMenu(session, t));
  }

  if (!interaction.isButton()) return;

  if (action === 'preview') {
    try {
      let payload;
      if (session.state.type === 'embed') payload = toPublishPayload(buildEmbedPayload(session.state), 'embed');
      else payload = toPublishPayload(buildComponentsV2Payload(session.state), 'components_v2');
      await interaction.reply({ content: t('events.builder.publishing.replies.final_preview_content', {}, 'Final preview (how it will be published):'), ...payload, flags: 64 });
    } catch (e) {
      await interaction.reply({ content: t('events.builder.publishing.replies.preview_failed', { error: e.message }, `Preview failed: ${e.message}`), flags: 64 });
    }
    return;
  }

  if (action === 'clear_target') {
    session.editingMessage = null;
    saveSession(session);
    return interaction.update(buildPublishMenu(session, t));
  }

  if (action === 'confirm') {
    const validation = session.state.type === 'embed' ? validateEmbedState(session.state, t) : validateComponentsV2State(session.state, t);
    if (!validation.valid) return interaction.reply({ content: t('events.builder.publishing.replies.cannot_publish', { errors: validation.errors.join('\n') }, `Cannot publish:\n${validation.errors.join('\n')}`).slice(0, 2000), flags: 64 });
    try {
      const built = session.state.type === 'embed' ? buildEmbedPayload(session.state) : buildComponentsV2Payload(session.state);
      const payload = toPublishPayload(built, session.state.type);
      let msg;
      if (session.editingMessage) {
        const channel = await interaction.client.channels.fetch(session.editingMessage.channelId);
        const target = await channel.messages.fetch(session.editingMessage.messageId);
        const permErr = canSendToChannel(channel, interaction.client.user);
        if (permErr) return interaction.reply({ content: t('events.builder.publishing.replies.cannot_edit_channel', { error: permErr }, `Cannot edit in target channel: ${permErr}`), flags: 64 });
        msg = await editExisting(target, payload);
        if (session.state.type === 'components_v2') {
          try { require('../utils/published-runtime').collectActionsFromState(session.state, msg.id, { ownerId: interaction.user.id, guildId: interaction.guildId, channelId: channel.id }); } catch {}
        }
        await interaction.reply({ content: t('events.builder.publishing.replies.edited', { url: msg.url }, `✅ Message edited successfully: ${msg.url}`), flags: 64 });
      } else {
        const channel = await interaction.client.channels.fetch(session.publishChannelId);
        const permErr = canSendToChannel(channel, interaction.client.user);
        if (permErr) return interaction.reply({ content: t('events.builder.publishing.replies.cannot_publish_perm', { error: permErr }, `Cannot publish: ${permErr}`), flags: 64 });
        msg = await publishNew(channel, payload);
        if (session.state.type === 'components_v2') {
          try { require('../utils/published-runtime').collectActionsFromState(session.state, msg.id, { ownerId: interaction.user.id, guildId: interaction.guildId, channelId: channel.id }); } catch {}
        }
        await interaction.reply({ content: t('events.builder.publishing.replies.published', { url: msg.url }, `✅ Published successfully: ${msg.url}`), flags: 64 });
      }
    } catch (e) {
      const m = e?.message || String(e);
      if (interaction.deferred || interaction.replied) await interaction.followUp({ content: t('events.builder.publishing.replies.failed', { error: m }, `Publish failed: ${m}`), flags: 64 });
      else await interaction.reply({ content: t('events.builder.publishing.replies.failed', { error: m }, `Publish failed: ${m}`), flags: 64 });
    }
    return;
  }

  return interaction.reply({ content: t('events.builder.publishing.replies.unhandled', {}, 'Unhandled publish action.'), flags: 64 });
}

module.exports = { handlePublishing, buildPublishMenu };
