const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../../database/db');
const { getLevelEmoji } = require('../../../utils/elo');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mi-posicion')
    .setDescription('Mostrá tu posición en el torneo activo con los traders vecinos'),

  async execute(interaction) {
    const torneo = db.prepare("SELECT * FROM tournaments WHERE status IN ('active','open') ORDER BY id DESC LIMIT 1").get();
    if (!torneo) {
      return interaction.reply({ content: '❌ No hay torneo activo actualmente.', ephemeral: true });
    }

    const mySnap = db.prepare(`
      SELECT ls.*, p.display_name, p.username AS pname, p.level
      FROM leaderboard_snapshots ls
      LEFT JOIN players p ON p.discord_id = ls.discord_id
      WHERE ls.tournament_id = ? AND ls.discord_id = ?
    `).get(torneo.id, interaction.user.id);

    if (!mySnap) {
      return interaction.reply({
        content: `❌ No aparecés en el torneo **${torneo.name} #${torneo.edition}** todavía. Esperá que el admin cargue los resultados.`,
        ephemeral: true,
      });
    }

    const allSnaps = db.prepare(`
      SELECT ls.*, p.display_name, p.username AS pname, p.level
      FROM leaderboard_snapshots ls
      LEFT JOIN players p ON p.discord_id = ls.discord_id
      WHERE ls.tournament_id = ?
      ORDER BY ls.current_rank ASC
    `).all(torneo.id);

    const myIdx = allSnaps.findIndex(s => s.discord_id === interaction.user.id);
    const window = allSnaps.slice(Math.max(0, myIdx - 2), myIdx + 3);

    const rows = window.map(snap => {
      const name = snap.display_name || snap.pname || snap.username || '?';
      const emoji = snap.level ? getLevelEmoji(snap.level) : snap.level_emoji || '🟤';
      const sign = snap.current_pnl_pct >= 0 ? '+' : '';
      const pnl = `${sign}${snap.current_pnl_pct?.toFixed(2) ?? '?'}%`;
      const change = snap.pos_change > 0 ? ` ▲${snap.pos_change}` : snap.pos_change < 0 ? ` ▼${Math.abs(snap.pos_change)}` : '';
      const rank = `#${String(snap.current_rank).padStart(2)}`;
      const isMe = snap.discord_id === interaction.user.id;
      return isMe
        ? `**→ ${rank} ${emoji} ${name} ${pnl}${change}**`
        : `${rank} ${emoji} ${name} ${pnl}${change}`;
    });

    const totalCount = db.prepare('SELECT COUNT(*) as c FROM leaderboard_snapshots WHERE tournament_id = ?').get(torneo.id).c;

    const embed = new EmbedBuilder()
      .setColor(0x3B82F6)
      .setTitle(`📍 Tu posición — ${torneo.name} #${torneo.edition}`)
      .setDescription(rows.join('\n'))
      .setFooter({ text: `Posición ${mySnap.current_rank} de ${totalCount} traders` })
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
