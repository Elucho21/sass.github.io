const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../../database/db');
const { getLevelEmoji, LEVELS } = require('../../../utils/elo');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('carta')
    .setDescription('Muestra la carta de trader de un jugador (compartible)')
    .addStringOption(o => o
      .setName('usuario')
      .setDescription('Trader a consultar (vacío = la tuya)')
      .setAutocomplete(true)
      .setRequired(false)),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const players = db.prepare(`
      SELECT discord_id, COALESCE(display_name, username) as name, level
      FROM players WHERE LOWER(COALESCE(display_name, username)) LIKE ? LIMIT 8
    `).all(`%${focused}%`);
    await interaction.respond(players.map(p => ({
      name: `${getLevelEmoji(p.level)} ${p.name}`,
      value: p.discord_id,
    })));
  },

  async execute(interaction) {
    await interaction.deferReply();
    const targetId = interaction.options.getString('usuario') || interaction.user.id;
    const player = db.prepare('SELECT * FROM players WHERE discord_id = ?').get(targetId);
    if (!player) return interaction.editReply('❌ Trader no encontrado.');

    const emoji = getLevelEmoji(player.level);
    const winRate = player.tournaments_played > 0
      ? ((player.tournaments_won / player.tournaments_played) * 100).toFixed(1)
      : '0.0';
    const avgPnl = player.tournaments_played > 0
      ? (player.total_pnl_sum / player.tournaments_played).toFixed(2)
      : '0.00';
    const bestPnl = db.prepare('SELECT MAX(pnl_pct) as best FROM results WHERE discord_id = ?').get(targetId)?.best;

    const achList = db.prepare('SELECT logro_id FROM achievements WHERE discord_id = ? ORDER BY unlocked_at DESC LIMIT 4').all(targetId);
    const achText = achList.length ? achList.map(a => `\`${a.logro_id}\``).join(' ') : 'Sin logros aún';

    const levelOrder = ['Rookie', 'Trader', 'Pro', 'Elite', 'Master', 'Legend'];
    const idx = levelOrder.indexOf(player.level);
    const nextInfo = idx < levelOrder.length - 1
      ? `→ ${levelOrder[idx + 1]} en ${LEVELS[levelOrder[idx + 1]].min - player.elo} ELO`
      : '(Nivel máximo)';

    const levelColors = { Rookie: 0x92400E, Trader: 0x22C55E, Pro: 0x3B82F6, Elite: 0xA855F7, Master: 0xEAB308, Legend: 0xEF4444 };
    const color = levelColors[player.level] || 0x7C3AED;
    const name = player.display_name || player.username;
    const rachaStr = player.racha_actual > 0 ? `🔥 +${player.racha_actual}` : player.racha_actual < 0 ? `❄️ ${player.racha_actual}` : '—';

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`${emoji} ${name}`)
      .setDescription(`**${player.level}** · ${player.elo} ELO · ${nextInfo}`)
      .addFields(
        { name: '🏆 Victorias', value: `${player.tournaments_won}`, inline: true },
        { name: '📊 Top 10', value: `${player.top10_count}`, inline: true },
        { name: '🎯 Win rate', value: `${winRate}%`, inline: true },
        { name: '📈 PnL prom.', value: `${Number(avgPnl) >= 0 ? '+' : ''}${avgPnl}%`, inline: true },
        { name: '🚀 Mejor PnL', value: bestPnl != null ? `+${bestPnl.toFixed(1)}%` : '—', inline: true },
        { name: '🔥 Racha', value: rachaStr, inline: true },
        { name: '🎖️ Logros', value: achText, inline: false },
      )
      .setTimestamp()
      .setFooter({ text: `Torneos: ${player.tournaments_played} · /carta` });

    if (targetId === interaction.user.id) {
      embed.setThumbnail(interaction.user.displayAvatarURL());
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
