const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../../database/db');
const { getLevelEmoji } = require('../../../utils/elo');

function getPlayerStats(player) {
  const bestPnlRow = db.prepare('SELECT MAX(pnl_pct) as best FROM results WHERE discord_id = ?').get(player.discord_id);
  const logrosCount = db.prepare('SELECT COUNT(*) as c FROM achievements WHERE discord_id = ?').get(player.discord_id).c;
  const avgPnl = player.tournaments_played > 0 ? player.total_pnl_sum / player.tournaments_played : 0;
  const winRate = player.tournaments_played > 0 ? (player.tournaments_won / player.tournaments_played) * 100 : 0;
  const rachaStr = player.racha_actual > 0 ? `🔥+${player.racha_actual}` : player.racha_actual < 0 ? `❄️${player.racha_actual}` : '—';
  return { bestPnl: bestPnlRow?.best ?? 0, logrosCount, avgPnl, winRate, rachaStr };
}

function statsLines(player, stats) {
  const emoji = getLevelEmoji(player.level);
  const sign = v => (v >= 0 ? `+${v.toFixed(1)}` : v.toFixed(1));
  return [
    `${player.elo}`,
    `${emoji} ${player.level}`,
    `${player.tournaments_played}`,
    `${stats.winRate.toFixed(1)}%`,
    `${player.top10_count}`,
    player.best_finish ? `#${player.best_finish}` : '—',
    `${sign(stats.avgPnl)}%`,
    `${sign(stats.bestPnl)}%`,
    stats.rachaStr,
    `${stats.logrosCount}`,
  ].join('\n');
}

const LABEL_LINES = 'ELO\nNivel\nTorneos\nWin rate\nTop 10\nMejor pos.\nPnL prom.\nMejor PnL\nRacha\nLogros';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('comparar')
    .setDescription('Comparate cara a cara con otro trader')
    .addStringOption(o =>
      o.setName('usuario')
        .setDescription('Nombre del trader a comparar (opcional — por defecto compara con el #1)')
        .setAutocomplete(true)
        .setRequired(false)
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const results = db.prepare(`
      SELECT discord_id, display_name, username FROM players
      WHERE LOWER(display_name) LIKE ? OR LOWER(username) LIKE ?
      LIMIT 6
    `).all(`%${focused}%`, `%${focused}%`);
    await interaction.respond(
      results.map(p => ({ name: p.display_name || p.username, value: p.discord_id }))
    );
  },

  async execute(interaction) {
    const me = db.prepare('SELECT * FROM players WHERE discord_id = ?').get(interaction.user.id);
    if (!me) {
      return interaction.reply({ content: '❌ No estás registrado. Usá `/vincular` primero.', ephemeral: true });
    }

    const targetId = interaction.options.getString('usuario');
    const rival = targetId
      ? db.prepare('SELECT * FROM players WHERE discord_id = ?').get(targetId)
      : db.prepare('SELECT * FROM players ORDER BY elo DESC LIMIT 1').get();

    if (!rival) {
      return interaction.reply({ content: '❌ No se encontró ese trader.', ephemeral: true });
    }
    if (rival.discord_id === me.discord_id) {
      return interaction.reply({ content: '❌ No podés compararte con vos mismo.', ephemeral: true });
    }

    const myStats  = getPlayerStats(me);
    const rivStats = getPlayerStats(rival);

    const meName  = me.display_name  || me.username;
    const rivName = rival.display_name || rival.username;

    const embed = new EmbedBuilder()
      .setColor(0xEAB308)
      .setTitle(`⚔️ ${meName} vs ${rivName}`)
      .addFields(
        { name: `${getLevelEmoji(me.level)} ${meName}`,    value: statsLines(me, myStats),    inline: true },
        { name: 'Estadística',                              value: LABEL_LINES,                inline: true },
        { name: `${getLevelEmoji(rival.level)} ${rivName}`, value: statsLines(rival, rivStats), inline: true },
      )
      .setFooter({ text: `${meName} vs ${rivName}` })
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: false });
  },
};
