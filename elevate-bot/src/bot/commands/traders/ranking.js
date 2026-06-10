const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../../database/db');
const { getLevelEmoji } = require('../../../utils/elo');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('Mostrá el top 25 de traders por ELO histórico'),

  async execute(interaction) {
    const players = db.prepare(`
      SELECT * FROM players ORDER BY elo DESC LIMIT 25
    `).all();

    if (!players.length) {
      return interaction.reply({ content: 'Todavía no hay traders registrados.', ephemeral: false });
    }

    const rows = players.map((p, i) => {
      const emoji = getLevelEmoji(p.level);
      return `\`#${String(i + 1).padStart(2)}\` ${emoji} **${p.display_name || p.username}** — ${p.elo} ELO | ${p.tournaments_played} torneos`;
    });

    const embed = new EmbedBuilder()
      .setColor(0xEAB308)
      .setTitle('🏆 Ranking Global — Top 25 Traders')
      .setDescription(rows.join('\n'))
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: false });
  },
};
