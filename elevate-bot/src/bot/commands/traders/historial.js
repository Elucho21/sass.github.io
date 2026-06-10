const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('historial')
    .setDescription('Mostrá tu historial de torneos'),

  async execute(interaction) {
    const discordId = interaction.user.id;
    const results = db.prepare(`
      SELECT r.*, t.name as torneo_name, t.edition, t.modalidad
      FROM results r
      JOIN tournaments t ON t.id = r.tournament_id
      WHERE r.discord_id = ?
      ORDER BY r.uploaded_at DESC LIMIT 5
    `).all(discordId);

    if (!results.length) {
      return interaction.reply({ content: '❌ No tenés historial de torneos todavía.', ephemeral: true });
    }

    const rows = results.map(r => {
      const sign = r.pnl_pct >= 0 ? '+' : '';
      const eloSign = r.elo_change >= 0 ? '+' : '';
      return `**${r.torneo_name} #${r.edition}** | Pos: #${r.rank_final} | PnL: ${sign}${r.pnl_pct?.toFixed(1)}% | ELO: ${r.elo_before}→${r.elo_after} (${eloSign}${r.elo_change})`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x7C3AED)
      .setTitle('📋 Tu historial de torneos')
      .setDescription(rows.join('\n'))
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
