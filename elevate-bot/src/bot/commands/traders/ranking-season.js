const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../../database/db');
const { getLevelEmoji } = require('../../../utils/elo');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ranking-season')
    .setDescription('Ver el ranking final de una season')
    .addIntegerOption(o => o
      .setName('season')
      .setDescription('ID de la season (deja vacío para la más reciente)')
      .setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();

    const seasonId = interaction.options.getInteger('season');
    const season = seasonId
      ? db.prepare('SELECT * FROM seasons WHERE id = ?').get(seasonId)
      : db.prepare("SELECT * FROM seasons WHERE status = 'closed' ORDER BY id DESC LIMIT 1").get();

    if (!season) {
      // Check if there's an active season
      const active = db.prepare("SELECT * FROM seasons WHERE status = 'active' LIMIT 1").get();
      if (active) return interaction.editReply(`⏳ La season **${active.name}** está en curso. El ranking final estará disponible al cerrarla.`);
      return interaction.editReply('❌ No hay seasons registradas. Un admin puede iniciar una con `/nueva-season`.');
    }

    const rankings = db.prepare(`
      SELECT sr.rank_position, sr.final_elo, sr.final_level,
             COALESCE(p.display_name, p.username) as name
      FROM season_rankings sr
      LEFT JOIN players p ON p.discord_id = sr.discord_id
      WHERE sr.season_id = ?
      ORDER BY sr.rank_position ASC
      LIMIT 25
    `).all(season.id);

    if (!rankings.length) {
      return interaction.editReply('❌ No hay datos para esta season.');
    }

    const lines = rankings.map(r => {
      const pos = r.rank_position <= 3
        ? ['🥇', '🥈', '🥉'][r.rank_position - 1]
        : `#${r.rank_position}`;
      return `${pos} **${r.name}** — ${r.final_elo} ELO ${getLevelEmoji(r.final_level)}`;
    });

    // List all seasons in footer
    const allSeasons = db.prepare("SELECT id, name, status FROM seasons ORDER BY id DESC LIMIT 5").all();
    const seasonsText = allSeasons.map(s => `${s.id}: ${s.name} ${s.status === 'active' ? '🟢' : '✅'}`).join(' · ');

    const embed = new EmbedBuilder()
      .setColor(0xEAB308)
      .setTitle(`🏆 Ranking Final — ${season.name}`)
      .setDescription(lines.join('\n'))
      .addFields({ name: 'Cerrada el', value: season.ended_at ? season.ended_at.split('T')[0] : '—', inline: true })
      .setTimestamp()
      .setFooter({ text: `Seasons: ${seasonsText}` });

    await interaction.editReply({ embeds: [embed] });
  },
};
