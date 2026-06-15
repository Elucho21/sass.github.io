const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../../database/db');
const { getLevelEmoji } = require('../../../utils/elo');

const FILTROS = {
  elo:   { label: 'ELO global',          emoji: '🏆' },
  top10: { label: 'Más Top 10s',         emoji: '🥇' },
  wins:  { label: 'Más victorias',       emoji: '🏅' },
  pnl:   { label: 'Mejor PnL histórico', emoji: '📈' },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('Mostrá el top 25 de traders')
    .addStringOption(o =>
      o.setName('filtro')
        .setDescription('Criterio de clasificación (por defecto: ELO global)')
        .setRequired(false)
        .addChoices(
          { name: '🏆 ELO global',          value: 'elo'   },
          { name: '🥇 Más veces en Top 10', value: 'top10' },
          { name: '🏅 Más victorias',        value: 'wins'  },
          { name: '📈 Mejor PnL histórico',  value: 'pnl'   },
        )
    ),

  async execute(interaction) {
    const filtro = interaction.options.getString('filtro') || 'elo';

    let players;
    let rows;

    if (filtro === 'pnl') {
      players = db.prepare(`
        SELECT p.*, MAX(r.pnl_pct) as best_pnl, t.name as torneo_nombre, t.edition as torneo_edicion
        FROM players p
        JOIN results r ON r.discord_id = p.discord_id
        JOIN tournaments t ON t.id = r.tournament_id
          AND r.pnl_pct = (SELECT MAX(r2.pnl_pct) FROM results r2 WHERE r2.discord_id = p.discord_id)
        GROUP BY p.discord_id
        ORDER BY best_pnl DESC
        LIMIT 25
      `).all();

      if (!players.length) {
        return interaction.reply({ content: 'No hay resultados registrados aún.', ephemeral: false });
      }

      rows = players.map((p, i) => {
        const emoji = getLevelEmoji(p.level);
        const sign = p.best_pnl >= 0 ? '+' : '';
        return `\`#${String(i + 1).padStart(2)}\` ${emoji} **${p.display_name || p.username}** — ${sign}${p.best_pnl.toFixed(2)}% (${p.torneo_nombre} #${p.torneo_edicion})`;
      });
    } else {
      const orderBy = filtro === 'top10' ? 'top10_count DESC' : filtro === 'wins' ? 'tournaments_won DESC' : 'elo DESC';
      players = db.prepare(`SELECT * FROM players ORDER BY ${orderBy} LIMIT 25`).all();

      if (!players.length) {
        return interaction.reply({ content: 'Todavía no hay traders registrados.', ephemeral: false });
      }

      rows = players.map((p, i) => {
        const emoji = getLevelEmoji(p.level);
        const extra = filtro === 'top10'
          ? `${p.top10_count} top10s`
          : filtro === 'wins'
            ? `${p.tournaments_won} victorias`
            : `${p.elo} ELO`;
        return `\`#${String(i + 1).padStart(2)}\` ${emoji} **${p.display_name || p.username}** — ${extra} | ${p.tournaments_played} torneos`;
      });
    }

    const { emoji, label } = FILTROS[filtro];
    const embed = new EmbedBuilder()
      .setColor(0xEAB308)
      .setTitle(`${emoji} Top 25 — ${label}`)
      .setDescription(rows.join('\n'))
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: false });
  },
};
