const { SlashCommandBuilder } = require('discord.js');
const db = require('../../../database/db');
const { isAuthorized } = require('../../../utils/auth');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set-canal-tabla')
    .setDescription('[Admin] Configurá el canal donde se publica la tabla')
    .addChannelOption(o => o.setName('canal').setDescription('Canal de tabla').setRequired(true)),

  async execute(interaction) {
    if (!isAuthorized(interaction)) {
      return interaction.reply({ content: '❌ No tenés permisos para ejecutar este comando.', ephemeral: true });
    }
    const channel = interaction.options.getChannel('canal');
    db.prepare("INSERT OR REPLACE INTO server_config (key, value) VALUES ('canal_tabla', ?)").run(channel.id);
    return interaction.reply({ content: `✅ Canal de tabla configurado: <#${channel.id}>`, ephemeral: true });
  },
};
