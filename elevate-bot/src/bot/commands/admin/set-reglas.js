const { SlashCommandBuilder } = require('discord.js');
const db = require('../../../database/db');
const { isAuthorized } = require('../../../utils/auth');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set-reglas')
    .setDescription('[Admin] Configurá las reglas del torneo activo o abierto')
    .addStringOption(o => o.setName('texto').setDescription('Texto de las reglas').setRequired(true)),

  async execute(interaction) {
    if (!isAuthorized(interaction)) {
      return interaction.reply({ content: '❌ No tenés permisos para ejecutar este comando.', ephemeral: true });
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
