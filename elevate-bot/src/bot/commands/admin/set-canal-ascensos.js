const { SlashCommandBuilder } = require('discord.js');
const db = require('../../../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set-canal-ascensos')
    .setDescription('[Admin] Configurá el canal de ascensos y logros')
    .addChannelOption(o => o.setName('canal').setDescription('Canal de ascensos').setRequired(true)),

  async execute(interaction) {
    if (!interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID)) {
      return interaction.reply({ content: '❌ No tenés permisos de administrador.', ephemeral: true });
    }
    const channel = interaction.options.getChannel('canal');
    db.prepare("INSERT OR REPLACE INTO server_config (key, value) VALUES ('canal_ascensos', ?)").run(channel.id);
    return interaction.reply({ content: `✅ Canal de ascensos configurado: <#${channel.id}>`, ephemeral: true });
  },
};
