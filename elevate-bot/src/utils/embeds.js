const { EmbedBuilder } = require('discord.js');
const { LEVELS, getLevelEmoji } = require('./elo');
const { TIER_COLORS } = require('./achievements');

function buildAscensoEmbed(username, levelBefore, levelAfter, eloBefore, eloAfter, torneoName) {
  const emoji = getLevelEmoji(levelAfter);
  return new EmbedBuilder()
    .setColor(0x7C3AED)
    .setTitle(`${emoji} ¡Ascenso de nivel!`)
    .setDescription(`**${username}** subió de **${levelBefore}** a **${levelAfter}**`)
    .addFields(
      { name: 'ELO anterior', value: `${eloBefore}`, inline: true },
      { name: 'ELO nuevo',    value: `${eloAfter}`,  inline: true },
      { name: 'Torneo',       value: torneoName,      inline: true },
    )
    .setTimestamp();
}

function buildLogroEmbed(username, logro, eloTotal, torneoName) {
  const color = TIER_COLORS[logro.tier] || 0x7C3AED;
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`${logro.nombre}`)
    .setDescription(`**${username}** desbloqueó un nuevo logro`)
    .addFields(
      { name: 'ELO ganado',  value: `+${logro.elo}`,  inline: true },
      { name: 'ELO total',   value: `${eloTotal}`,     inline: true },
      { name: 'Torneo',      value: torneoName,         inline: true },
    )
    .setTimestamp();
}

function buildResultadosFinalesEmbed(torneoName, edicion, modalidad, top3, totalParticipants, totalVinculados) {
  const podium = top3.map((p, i) => {
    const medals = ['🥇', '🥈', '🥉'];
    const sign = p.pnl_pct >= 0 ? '+' : '';
    return `${medals[i]} **${p.username || p.correo || '?'}** — ${sign}${p.pnl_pct?.toFixed(2) ?? '?'}%`;
  }).join('\n');

  return new EmbedBuilder()
    .setColor(0xEAB308)
    .setTitle(`🏆 ${torneoName} #${edicion} — Resultados Finales`)
    .setDescription(`Modalidad: **${modalidad}**\n\n${podium}`)
    .addFields(
      { name: 'Total participantes', value: `${totalParticipants}`, inline: true },
      { name: 'Vinculados',          value: `${totalVinculados}`,   inline: true },
    )
    .setTimestamp();
}

function buildStatsEmbed(player, recentAchievements, lastTournaments) {
  const emoji = getLevelEmoji(player.level);
  const rachaStr = player.racha_actual > 0
    ? `🔥 +${player.racha_actual} racha positiva`
    : player.racha_actual < 0
      ? `❄️ ${player.racha_actual} racha negativa`
      : `— Sin racha`;

  const logrosList = recentAchievements.length
    ? recentAchievements.map(a => `• ${a.logro_id}`).join('\n')
    : 'Sin logros recientes';

  const historialList = lastTournaments.length
    ? lastTournaments.map(r =>
        `#${r.rank_final} | ${r.pnl_pct >= 0 ? '+' : ''}${r.pnl_pct?.toFixed(1)}% | ELO: ${r.elo_before}→${r.elo_after}`
      ).join('\n')
    : 'Sin historial';

  const winRate = player.tournaments_played > 0
    ? ((player.tournaments_won / player.tournaments_played) * 100).toFixed(1)
    : '0.0';

  const pnlPromedio = player.tournaments_played > 0
    ? (player.total_pnl_sum / player.tournaments_played).toFixed(2)
    : '0.00';

  return new EmbedBuilder()
    .setColor(0x7C3AED)
    .setTitle(`${emoji} Stats de ${player.display_name || player.username}`)
    .addFields(
      { name: 'ELO',              value: `${player.elo}`,              inline: true },
      { name: 'Nivel',            value: `${emoji} ${player.level}`,   inline: true },
      { name: 'Racha',            value: rachaStr,                      inline: true },
      { name: 'Torneos jugados',  value: `${player.tournaments_played}`, inline: true },
      { name: 'Win rate (1ro)',   value: `${winRate}%`,                 inline: true },
      { name: 'Top 10 total',     value: `${player.top10_count}`,       inline: true },
      { name: 'Mejor posición',   value: player.best_finish ? `#${player.best_finish}` : '—', inline: true },
      { name: 'PnL promedio',     value: `${pnlPromedio}%`,             inline: true },
      { name: 'Últimos logros',   value: logrosList,                    inline: false },
      { name: 'Últimos torneos',  value: historialList,                  inline: false },
    )
    .setTimestamp();
}

function buildRachaCalienteEmbed(username, racha, eloBefore, eloAfter, torneoName, rank) {
  const eloChange = eloAfter - eloBefore;
  const changeStr = eloChange >= 0 ? `+${eloChange}` : `${eloChange}`;
  return new EmbedBuilder()
    .setColor(0xFF4500)
    .setTitle('🔥 ¡Racha Caliente!')
    .setDescription(`**${username}** lleva **${racha}** torneos consecutivos en Top 10`)
    .addFields(
      { name: 'Posición',  value: `#${rank}`,                                 inline: true },
      { name: 'ELO',       value: `${eloBefore} → ${eloAfter} (${changeStr})`, inline: true },
      { name: 'Torneo',    value: torneoName,                                   inline: true },
    )
    .setTimestamp();
}

module.exports = { buildAscensoEmbed, buildLogroEmbed, buildResultadosFinalesEmbed, buildStatsEmbed, buildRachaCalienteEmbed };
