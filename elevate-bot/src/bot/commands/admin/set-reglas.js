const { SlashCommandBuilder } = require('discord.js');
const db = require('../../../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set-reglas')
    .setDescription('[Admin] Configurá las reglas del torneo activo o abierto')
    .addStringOption(o => o.setName('texto').setDescription('Texto de las reglas').setRequired(true)),

  async execute(interaction) {
    if (!interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID)) {
      return interaction.reply({ content: '❌ No tenés permisos de administrador.', ephemeral: true });
    }
    const texto = interaction.options.getString('texto');
    const torneo = db.prepare("SELECT id FROM tournaments WHERE status IN ('open','active') ORDER BY id DESC LIMIT 1").get();
    if (!torneo) {
      return interaction.reply({ content: '❌ No hay torneo abierto o activo.', ephemeral: true });
    }
    db.prepare('UPDATE tournaments SET reglas = ? WHERE id = ?').run(texto, torneo.id);
    return interaction.reply({ content: '✅ Reglas del torneo actualizadas.', ephemeral: true });
  },
};
