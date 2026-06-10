const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sin-vincular')
    .setDescription('[Admin] Mostrá los correos del último CSV sin cuenta de Discord vinculada'),

  async execute(interaction) {
    if (!interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID)) {
      return interaction.reply({ content: '❌ No tenés permisos de administrador.', ephemeral: true });
    }

    const config = db.prepare("SELECT value FROM server_config WHERE key = 'last_csv_unlinked'").get();
    if (!config) {
      return interaction.reply({ content: '✅ No hay correos sin vincular del último CSV.', ephemeral: true });
    }

    let correos;
    try {
      correos = JSON.parse(config.value);
    } catch {
      return interaction.reply({ content: '❌ Error al leer la lista de sin vincular.', ephemeral: true });
    }

    if (!correos.length) {
      return interaction.reply({ content: '✅ Todos los correos del último CSV están vinculados.', ephemeral: true });
    }

    const chunks = [];
    for (let i = 0; i < correos.length; i += 20) {
      chunks.push(correos.slice(i, i + 20));
    }

    const embed = new EmbedBuilder()
      .setColor(0xEF4444)
      .setTitle(`❓ ${correos.length} correos sin vincular`)
      .setDescription(chunks[0].join('\n'))
      .setFooter({ text: 'Pediles a los traders que usen /vincular con su correo.' })
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
