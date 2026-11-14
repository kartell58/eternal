import { MessageFlags, ChannelType, PermissionFlagsBits } from 'discord.js';

function canSendToChannel(channel, clientUser) {
  if (!channel) return 'Channel not found.';
  if (typeof channel.isTextBased !== 'function' || !channel.isTextBased()) return 'Selected channel is not text-based.';
  const perms = channel.permissionsFor ? channel.permissionsFor(clientUser) : null;
  if (!perms) return 'Unable to resolve permissions for that channel.';
  if (!perms.has(PermissionFlagsBits.ViewChannel)) return 'Missing View Channel permission.';
  // threads may require SendMessagesInThreads
  const isThread = typeof channel.isThread === 'function' ? channel.isThread() : false;
  if (isThread) {
    if (perms.has(PermissionFlagsBits.SendMessagesInThreads)) return null;
    if (perms.has(PermissionFlagsBits.SendMessages)) return null;
    return 'Missing Send Messages permission for this thread.';
  }
  if (!perms.has(PermissionFlagsBits.SendMessages)) return 'Missing Send Messages permission.';
  return null;
}

async function publishNew(channel, payload) {
  const err = canSendToChannel(channel, channel.client.user);
  if (err) throw new Error(err);
  return channel.send(payload);
}

async function editExisting(message, payload) {
  if (!message) throw new Error('Message not found.');
  if (message.author?.id !== message.client.user.id) {
    throw new Error('I can only edit messages sent by this bot.');
  }
  return message.edit(payload);
}

function toPublishPayload(built, stateType) {
  if (stateType === 'components_v2') {
    return {
      components: built.components,
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] }
    };
  }
  return {
    content: built.content || undefined,
    embeds: built.embeds || [],
    components: built.components || [],
    allowedMentions: { parse: [] }
  };
}

export { publishNew, editExisting, toPublishPayload, canSendToChannel };

export default { publishNew, editExisting, toPublishPayload, canSendToChannel };
