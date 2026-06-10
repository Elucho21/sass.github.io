const { SlashCommandBuilder } = require('discord.js');
const db = require('../../../database/db');
const { isAuthorized } = require('../../../utils/auth');
const { closeTournamentWithElo } = require('../../../utils/tournament-close');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cerrar-torneo')
    .setDescription('[Admin] Cerrá un torneo y calculá ELO final')
    .addIntegerOption(o =>
      o.setName('torneo_id').setDescription('ID del torneo (solo para torneos históricos; omitir para el torneo activo)').setRequired(false)
    ),

  async execute(interaction) {
    if (!isAuthorized(interaction)) {
      return interaction.reply({ content: '❌ No tenés permisos para ejecutar este comando.', ephemeral: true });
    }

    const torneoId = interaction.options.getInteger('torneo_id');
    const torneo = torneoId
      ? db.prepare("SELECT * FROM tournaments WHERE id = ? AND status != 'closed'").get(torneoId)
      : db.prepare("SELECT * FROM tournaments WHERE status IN ('active','open') ORDER BY id DESC LIMIT 1").get();

    if (!torneo) {
      return interaction.reply({
        content: torneoId ? `❌ No se encontró el torneo con ID ${torneoId} (o ya está cerrado).` : '❌ No hay torneo activo.',
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const { procesados } = await closeTournamentWithElo(torneo.id, {
        guild: interaction.guild,
        client: interaction.client,
      });
      return interaction.editReply(`✅ Torneo cerrado. ELO calculado para **${procesados}** traders.`);
    } catch (err) {
      return interaction.editReply(`❌ ${err.message}`);
    }
  },
};
