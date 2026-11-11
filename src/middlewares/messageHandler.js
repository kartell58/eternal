async function messageHandler(interaction, commands) {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);

  if (!command) return;

  await command.execute(interaction);
}

module.exports = { messageHandler };
