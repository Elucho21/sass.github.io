const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../../database/db');

const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };
function posEmoji(rank) {
  return MEDALS[rank] || (rank <= 10 ? '🏅' : '📊');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('historial')
    .setDescription('Mostrá tu historial de torneos')
    .addIntegerOption(o =>
      o.setName('pagina').setDescription('Página (10 torneos por página)').setRequired(false).setMinValue(1)
    ),

  async execute(interaction) {
    const discordId = interaction.user.id;
    const pagina = (interaction.options.getInteger('pagina') || 1) - 1;
    const offset = pagina * 10;

    const total = db.prepare('SELECT COUNT(*) as c FROM results WHERE discord_id = ?').get(discordId).c;
    const results = db.prepare(`
      SELECT r.*, t.name as torneo_name, t.edition, t.modalidad, t.end_date
      FROM results r
      JOIN tournaments t ON t.id = r.tournament_id
      WHERE r.discord_id = ?
      ORDER BY t.id ASC
      LIMIT 10 OFFSET ?
    `).all(discordId, offset);

    // Participación actual (torneo activo/open)
    const activeSnap = db.prepare(`
      SELECT ls.*, t.name as torneo_name, t.edition, t.modalidad
      FROM leaderboard_snapshots ls
      JOIN tournaments t ON t.id = ls.tournament_id
      WHERE ls.discord_id = ? AND t.status IN ('active','open')
      LIMIT 1
    `).get(discordId);

    if (!results.length && !activeSnap) {
      return interaction.reply({ content: '❌ No tenés historial de torneos todavía. Cuando se cierre un torneo en el que participaste, tu historial aparecerá aquí.', ephemeral: true });
    }

    const fields = results.map(r => {
      const sign = r.pnl_pct >= 0 ? '+' : '';
      const eloSign = r.elo_change >= 0 ? '+' : '';
      const eloStr = r.elo_before && r.elo_after
        ? `ELO: ${r.elo_before} → **${r.elo_after}** (${eloSign}${r.elo_change})`
        : '';
      return {
        name: `${posEmoji(r.rank_final)}  ${r.torneo_name} #${r.edition}  ·  ${r.modalidad}`,
        value: `Posición: **#${r.rank_final}**  ·  PnL: **${sign}${r.pnl_pct?.toFixed(2)}%**${eloStr ? `\n${eloStr}` : ''}`,
        inline: false,
      };
    });

    if (activeSnap) {
      const sign = activeSnap.current_pnl_pct >= 0 ? '+' : '';
      fields.unshift({
        name: `🔴  ${activeSnap.torneo_name} #${activeSnap.edition}  ·  ${activeSnap.modalidad}  [EN VIVO]`,
        value: `Posición actual: **#${activeSnap.current_rank}**  ·  PnL: **${sign}${activeSnap.current_pnl_pct?.toFixed(2)}%**`,
        inline: false,
      });
    }

    const totalPages = Math.max(1, Math.ceil(total / 10));
    const embed = new EmbedBuilder()
      .setColor(0x7C3AED)
      .setTitle('📋 Tu historial de torneos')
      .setDescription(total > 0 ? `${total} torneos jugados  ·  Página ${pagina + 1}/${totalPages}` : 'En vivo — sin torneos cerrados aún')
      .addFields(fields)
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
