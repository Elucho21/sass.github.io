const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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

    // Resumen de predicciones (top 3 más votados)
    const votoTop = db.prepare(`
      SELECT ls.username, COUNT(*) as votos
      FROM tournament_votes v
      JOIN leaderboard_snapshots ls
        ON ls.discord_id = v.voted_for_discord_id AND ls.tournament_id = v.tournament_id
      WHERE v.tournament_id = ?
      GROUP BY v.voted_for_discord_id
      ORDER BY votos DESC
      LIMIT 3
    `).all(torneo.id);

    const votoLine = votoTop.length
      ? `\n📊 Predicciones: ${votoTop.map((v, i) => `${i + 1}. ${v.username} (${v.votos})`).join(' · ')}`
      : '';

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`votar_abrir_${torneo.id}`)
        .setLabel('🗳️ Votar por el ganador')
        .setStyle(ButtonStyle.Secondary)
    );

    return interaction.reply({ content: text + votoLine, components: [row], ephemeral: true });
  },
};
