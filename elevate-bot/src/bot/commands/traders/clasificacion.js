const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../../database/db');
const { LEVELS, getLevelEmoji } = require('../../../utils/elo');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clasificacion')
    .setDescription('Mostrá todos los traders agrupados por nivel'),

  async execute(interaction) {
    const players = db.prepare('SELECT * FROM players ORDER BY elo DESC').all();
    if (!players.length) {
      return interaction.reply({ content: 'Todavía no hay traders registrados.', ephemeral: false });
    }

    // Assign global rank position
    const ranked = players.map((p, i) => ({ ...p, globalRank: i + 1 }));

    // Group by level in descending order (Legend first)
    const levelOrder = Object.keys(LEVELS).sort((a, b) => LEVELS[b].min - LEVELS[a].min);
    const groups = {};
    for (const level of levelOrder) {
      groups[level] = ranked.filter(p => p.level === level);
    }

    const fields = [];
    for (const level of levelOrder) {
      const group = groups[level];
      if (!group.length) continue;

      const emoji = getLevelEmoji(level);
      const nextLevel = levelOrder[levelOrder.indexOf(level) - 1];
      const nextMin = nextLevel ? LEVELS[nextLevel].min : null;

      const lines = group.slice(0, 5).map(p => {
        const name = p.display_name || p.username;
        const gap = nextMin ? ` (→ ${nextLevel} en ${nextMin - p.elo} ELO)` : '';
        return `\`#${String(p.globalRank).padStart(2)}\` **${name}** — ${p.elo} ELO${gap}`;
      });

      if (group.length > 5) {
        lines.push(`_...y ${group.length - 5} más_`);
      }

      fields.push({ name: `${emoji} ${level} (${group.length})`, value: lines.join('\n'), inline: false });
    }

    const embed = new EmbedBuilder()
      .setColor(0xEAB308)
      .setTitle('🗂️ Clasificación por Nivel')
      .addFields(fields)
      .setFooter({ text: `${players.length} traders en total` })
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: false });
  },
};
