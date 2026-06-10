const { SlashCommandBuilder } = require('discord.js');
const db = require('../../../database/db');
const { generateLeaderboardText, formatLastUpdated } = require('../../../utils/leaderboard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tabla')
    .setDescription('Mostrá la tabla de posiciones del torneo activo'),

  async execute(interaction) {
    const torneo = db.prepare("SELECT * FROM tournaments WHERE status = 'active' ORDER BY id DESC LIMIT 1").get();
    if (!torneo) {
      return interaction.reply({ content: 'No hay torneo activo en este momento.', ephemeral: true });
    }

    const snapshots = db.prepare(`
      SELECT * FROM leaderboard_snapshots
      WHERE tournament_id = ?
      ORDER BY current_rank ASC
    `).all(torneo.id);

    if (!snapshots.length) {
      return interaction.reply({ content: 'Todavía no hay datos cargados para el torneo activo.', ephemeral: true });
    }

    const lastUpdated = formatLastUpdated(snapshots[0]?.last_updated);
    const text = generateLeaderboardText(
      snapshots,
      torneo.name,
      torneo.edition,
      lastUpdated,
      torneo.total_participants,
    );

    return interaction.reply({ content: text, ephemeral: true });
  },
};
