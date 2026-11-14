import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ChannelSelectMenuBuilder, ChannelType } from 'discord.js';
import { requireSession, saveSession } from '../services/session.service.js';
import { buildEmbedPayload } from '../builders/embed.builder.js';
import { buildComponentsV2Payload } from '../builders/components-v2.builder.js';
import { validateEmbedState, validateComponentsV2State } from '../utils/validator.js';
import { toPublishPayload, publishNew, editExisting, canSendToChannel } from '../services/publisher.service.js';
import { ContainerBuilder, TextDisplayBuilder, MessageFlags } from 'discord.js';

function sid(session) { return session.id; }

function buildPublishMenu(session) {
  const validation = session.state.type === 'embed' ? validateEmbedState(session.state) : validateComponentsV2State(session.state);
  const lines = [
    `**Mode:** ${session.editingMessage ? `Edit existing message (${session.editingMessage.channelId}/${session.editingMessage.messageId})` : 'Publish new message'}`,
    `**Type:** ${session.state.type === 'components_v2' ? 'Components V2' : 'Embed'}`,
    `**Validation:** ${validation.valid ? '✅ Ready' : '❌ Issues found'}`,
  ];
  if (!validation.valid) {
    lines.push('');
    lines.push(...validation.errors.slice(0, 6).map(e => `- ${e}`));
    if (validation.errors.length > 6) lines.push(`- …and ${validation.errors.length - 6} more`);
  }
  if (!session.editingMessage) {
    lines.push('');
    lines.push(`**Destination:** ${session.publishChannelId ? `<#${session.publishChannelId}>` : 'Not selected'}`);
  }

  const info = new ContainerBuilder()
    .setAccentColor(validation.valid ? 0x57f287 : 0xed4245)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## Publish'),
      new TextDisplayBuilder().setContent(lines.join('\n').slice(0, 4000)),
      new TextDisplayBuilder().setContent('-# Publishing uses safe defaults (mentions disabled). Review preview before confirming.')
    );

  const components = [info];
  if (!session.editingMessage) {
    const channelTypes = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
    if (ChannelType.PublicThread) channelTypes.push(ChannelType.PublicThread);
    if (ChannelType.PrivateThread) channelTypes.push(ChannelType.PrivateThread);
    if (ChannelType.AnnouncementThread) channelTypes.push(ChannelType.AnnouncementThread);
    components.push(new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder().setCustomId(`bld:${sid(session)}:pub:channel`).setPlaceholder('Select destination channel').addChannelTypes(...channelTypes)
    ));
  }
  components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:pub:confirm`).setLabel(session.editingMessage ? 'Confirm Edit' : 'Confirm Publish').setStyle(ButtonStyle.Success).setDisabled(!validation.valid || (!session.editingMessage && !session.publishChannelId)),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:pub:preview`).setLabel('Final Preview').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bld:${sid(session)}:nav:back_editor`).setLabel('Back').setStyle(ButtonStyle.Secondary),
  ));
  if (session.editingMessage) {
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`bld:${sid(session)}:pub:clear_target`).setLabel('Switch to New Message').setStyle(ButtonStyle.Danger)
    ));
  }
  return { content: null, embeds: [], components, flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 };
}

async function handlePublishing(interaction, { sid }) {
  const { session, error } = requireSession(sid, interaction.user.id, interaction.guildId);
  if (error) return interaction.reply({ content: error, flags: 64 });
  const action = interaction.customId.split(':')[3];

  if (interaction.isChannelSelectMenu() && action === 'channel') {
    session.publishChannelId = interaction.values[0];
    saveSession(session);
    return interaction.update(buildPublishMenu(session));
  }

  if (!interaction.isButton()) return;

  if (action === 'preview') {
    try {
      let payload;
      if (session.state.type === 'embed') payload = toPublishPayload(buildEmbedPayload(session.state), 'embed');
      else payload = toPublishPayload(buildComponentsV2Payload(session.state), 'components_v2');
      await interaction.reply({ content: 'Final preview (how it will be published):', ...payload, flags: 64 });
    } catch (e) {
      await interaction.reply({ content: `Preview failed: ${e.message}`, flags: 64 });
    }
    return;
  }

  if (action === 'clear_target') {
    session.editingMessage = null;
    saveSession(session);
    return interaction.update(buildPublishMenu(session));
  }

  if (action === 'confirm') {
    const validation = session.state.type === 'embed' ? validateEmbedState(session.state) : validateComponentsV2State(session.state);
    if (!validation.valid) return interaction.reply({ content: `Cannot publish:\n${validation.errors.join('\n')}`.slice(0, 2000), flags: 64 });
    try {
      const built = session.state.type === 'embed' ? buildEmbedPayload(session.state) : buildComponentsV2Payload(session.state);
      const payload = toPublishPayload(built, session.state.type);
      let msg;
      if (session.editingMessage) {
        const channel = await interaction.client.channels.fetch(session.editingMessage.channelId);
        const target = await channel.messages.fetch(session.editingMessage.messageId);
        const permErr = canSendToChannel(channel, interaction.client.user);
        if (permErr) return interaction.reply({ content: `Cannot edit in target channel: ${permErr}`, flags: 64 });
        msg = await editExisting(target, payload);
        if (session.state.type === 'components_v2') {
          try { (await import('../utils/published-runtime.js')).collectActionsFromState(session.state, msg.id, { ownerId: interaction.user.id, guildId: interaction.guildId, channelId: channel.id }); } catch {}
        }
        await interaction.reply({ content: `✅ Message edited successfully: ${msg.url}`, flags: 64 });
      } else {
        const channel = await interaction.client.channels.fetch(session.publishChannelId);
        const permErr = canSendToChannel(channel, interaction.client.user);
        if (permErr) return interaction.reply({ content: `Cannot publish: ${permErr}`, flags: 64 });
        msg = await publishNew(channel, payload);
        if (session.state.type === 'components_v2') {
          try { (await import('../utils/published-runtime.js')).collectActionsFromState(session.state, msg.id, { ownerId: interaction.user.id, guildId: interaction.guildId, channelId: channel.id }); } catch {}
        }
        await interaction.reply({ content: `✅ Published successfully: ${msg.url}`, flags: 64 });
      }
    } catch (e) {
      const msg = e?.message || String(e);
      if (interaction.deferred || interaction.replied) await interaction.followUp({ content: `Publish failed: ${msg}`, flags: 64 });
      else await interaction.reply({ content: `Publish failed: ${msg}`, flags: 64 });
    }
    return;
  }

  return interaction.reply({ content: 'Unhandled publish action.', flags: 64 });
}

export { handlePublishing, buildPublishMenu };

export default { handlePublishing, buildPublishMenu };
