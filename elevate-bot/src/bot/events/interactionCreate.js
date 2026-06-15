const commandCooldowns = new Map();

module.exports = {
  name: 'interactionCreate',
  once: false,
  async execute(interaction, client) {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      const now = Date.now();
      const lastUsed = commandCooldowns.get(interaction.user.id) || 0;
      if (now - lastUsed < 2000) {
        return interaction.reply({ content: '⏳ Espera un momento antes de usar otro comando.', ephemeral: true }).catch(() => {});
      }
      commandCooldowns.set(interaction.user.id, now);

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

    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (command?.autocomplete) {
        await command.autocomplete(interaction).catch(console.error);
      }
      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId.startsWith('ayuda_')) {
        const ayudaCmd = client.commands.get('ayuda');
        if (ayudaCmd?.handleButton) {
          await ayudaCmd.handleButton(interaction).catch(console.error);
        }
      }
      if (interaction.customId.startsWith('votar_abrir_')) {
        const votarCmd = client.commands.get('votar');
        if (votarCmd?.handleButton) {
          await votarCmd.handleButton(interaction).catch(console.error);
        }
      }
      return;
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId.startsWith('votar_select_')) {
        const votarCmd = client.commands.get('votar');
        if (votarCmd?.handleSelectMenu) {
          await votarCmd.handleSelectMenu(interaction).catch(console.error);
        }
      }
      return;
    }
  },
};
