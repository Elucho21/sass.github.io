const { SlashCommandBuilder } = require('discord.js');
const db = require('../../../database/db');
const { isAuthorized } = require('../../../utils/auth');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set-canal-ascensos')
    .setDescription('[Admin] Configurá el canal de ascensos y logros')
    .addChannelOption(o => o.setName('canal').setDescription('Canal de ascensos').setRequired(true)),

  async execute(interaction) {
    if (!isAuthorized(interaction)) {
      return interaction.reply({ content: '❌ No tenés permisos para ejecutar este comando.', ephemeral: true });
    }
    const channel = interaction.options.getChannel('canal');
    db.prepare("INSERT OR REPLACE INTO server_config (key, value) VALUES ('canal_ascensos', ?)").run(channel.id);
    return interaction.reply({ content: `✅ Canal de ascensos configurado: <#${channel.id}>`, ephemeral: true });
  },
};
