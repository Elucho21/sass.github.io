const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../../database/db');
const { getLevelEmoji } = require('../../../utils/elo');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('servidor-stats')
    .setDescription('Estadísticas globales de la comunidad Elevate'),

  async execute(interaction) {
    await interaction.deferReply();

    const totalTraders = db.prepare('SELECT COUNT(*) as c FROM players').get().c;
    const activeTraders = db.prepare("SELECT COUNT(*) as c FROM players WHERE last_active_date > datetime('now', '-30 days')").get().c;
    const totalTorneos = db.prepare("SELECT COUNT(*) as c FROM tournaments WHERE status = 'closed'").get().c;
    const avgElo = db.prepare('SELECT AVG(elo) as avg FROM players').get().avg;
    const topEloPlayer = db.prepare("SELECT COALESCE(display_name, username) as name, elo, level FROM players ORDER BY elo DESC LIMIT 1").get();
    const topTop10Player = db.prepare("SELECT COALESCE(display_name, username) as name, top10_count FROM players ORDER BY top10_count DESC LIMIT 1").get();
    const totalParticipaciones = db.prepare('SELECT SUM(tournaments_played) as total FROM players').get().total || 0;
    const levelDist = db.prepare('SELECT level, COUNT(*) as cnt FROM players GROUP BY level ORDER BY cnt DESC').all();
    const levelText = levelDist.map(r => `${getLevelEmoji(r.level)} ${r.level}: **${r.cnt}**`).join(' · ') || '—';
    const activeTorneo = db.prepare("SELECT name, edition FROM tournaments WHERE status = 'active' LIMIT 1").get();

    const embed = new EmbedBuilder()
      .setColor(0x0EA5E9)
      .setTitle('🌐 Comunidad Elevate — Estadísticas Globales')
      .addFields(
        { name: '👥 Traders', value: `**${totalTraders}** registrados · **${activeTraders}** activos (30d)`, inline: false },
        { name: '🏟️ Torneos cerrados', value: `**${totalTorneos}**`, inline: true },
        { name: '🎯 Participaciones', value: `**${totalParticipaciones}**`, inline: true },
        { name: '📊 ELO promedio', value: `**${Math.round(avgElo || 1200)}**`, inline: true },
        { name: '🔝 Top ELO', value: topEloPlayer ? `${getLevelEmoji(topEloPlayer.level)} **${topEloPlayer.name}** — ${topEloPlayer.elo}` : '—', inline: true },
        { name: '🏆 Más Top 10', value: topTop10Player ? `**${topTop10Player.name}** — ${topTop10Player.top10_count} veces` : '—', inline: true },
        { name: '​', value: '​', inline: true },
        { name: '🎖️ Distribución de niveles', value: levelText, inline: false },
        activeTorneo
          ? { name: '⚡ Torneo activo', value: `**${activeTorneo.name} #${activeTorneo.edition}**`, inline: false }
          : { name: '⏳ Estado', value: 'Sin torneo activo actualmente', inline: false },
      )
      .setTimestamp()
      .setFooter({ text: '/servidor-stats' });

    await interaction.editReply({ embeds: [embed] });
  },
};
