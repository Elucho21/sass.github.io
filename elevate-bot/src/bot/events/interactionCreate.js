module.exports = {
  name: 'interactionCreate',
  once: false,
  async execute(interaction, client) {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction, client);
      } catch (err) {
        console.error(`[Error] /${interaction.commandName}:`, err);
        const msg = { content: '❌ Ocurrió un error al ejecutar el comando.', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(msg).catch(() => {});
        } else {
          await interaction.reply(msg).catch(() => {});
        }
      }
      return;
    }

    if (interaction.isButton()) {
      // Manejar botones del comando /ayuda
      if (interaction.customId.startsWith('ayuda_')) {
        const ayudaCmd = client.commands.get('ayuda');
        if (ayudaCmd?.handleButton) {
          await ayudaCmd.handleButton(interaction).catch(console.error);
        }
      }
    }
  },
};
