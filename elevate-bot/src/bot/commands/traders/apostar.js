const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('apostar')
    .setDescription('Apuesta ELO a quién ganará el torneo activo')
    .addStringOption(o => o
      .setName('trader')
      .setDescription('Trader al que apuestas como ganador')
      .setRequired(true)
      .setAutocomplete(true))
    .addIntegerOption(o => o
      .setName('cantidad')
      .setDescription('ELO a apostar (10-100)')
      .setRequired(true)
      .setMinValue(10)
      .setMaxValue(100)),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const torneo = db.prepare("SELECT id FROM tournaments WHERE status = 'active' ORDER BY id DESC LIMIT 1").get();
    if (!torneo) return interaction.respond([]);
    const snaps = db.prepare(`
      SELECT ls.discord_id, ls.username, ls.current_rank, ls.current_pnl_pct
      FROM leaderboard_snapshots ls
      WHERE ls.tournament_id = ? AND ls.discord_id IS NOT NULL
        AND (LOWER(ls.username) LIKE ? OR CAST(ls.current_rank AS TEXT) LIKE ?)
      ORDER BY ls.current_rank ASC LIMIT 8
    `).all(torneo.id, `%${focused}%`, `%${focused}%`);
    const choices = snaps
      .filter(s => s.discord_id !== interaction.user.id)
      .map(s => ({
        name: `#${s.current_rank} ${s.username} (${s.current_pnl_pct >= 0 ? '+' : ''}${s.current_pnl_pct?.toFixed(1)}%)`,
        value: s.discord_id,
      }));
    await interaction.respond(choices);
  },

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const discord_id = interaction.user.id;

    const torneo = db.prepare("SELECT * FROM tournaments WHERE status = 'active' ORDER BY id DESC LIMIT 1").get();
    if (!torneo) return interaction.editReply('❌ No hay torneo activo en este momento.');

    const player = db.prepare('SELECT * FROM players WHERE discord_id = ?').get(discord_id);
    if (!player) return interaction.editReply('❌ No estás registrado. Usa `/vincular` primero.');
    if (player.elo < 1300) return interaction.editReply('❌ Necesitas al menos 1300 ELO (nivel Trader) para apostar.');

    const targetId = interaction.options.getString('trader');
    if (targetId === discord_id) return interaction.editReply('❌ No puedes apostar por ti mismo.');

    const targetSnap = db.prepare('SELECT * FROM leaderboard_snapshots WHERE tournament_id = ? AND discord_id = ?').get(torneo.id, targetId);
    if (!targetSnap) return interaction.editReply('❌ Ese trader no está en el torneo activo.');

    const targetPlayer = db.prepare('SELECT * FROM players WHERE discord_id = ?').get(targetId);
    const cantidad = interaction.options.getInteger('cantidad');

    db.prepare(`
      INSERT OR REPLACE INTO elo_bets (tournament_id, bettor_discord_id, target_discord_id, elo_amount, status, placed_at)
      VALUES (?, ?, ?, ?, 'pending', datetime('now'))
    `).run(torneo.id, discord_id, targetId, cantidad);

    const targetName = targetPlayer?.display_name || targetPlayer?.username || targetSnap.username;
    const embed = new EmbedBuilder()
      .setColor(0xF59E0B)
      .setTitle('🎰 Apuesta registrada')
      .setDescription(`Apostaste **${cantidad} ELO** a que **${targetName}** gana el torneo`)
      .addFields(
        { name: 'Si gana 🏆', value: `+${cantidad} ELO`, inline: true },
        { name: 'Si pierde ❌', value: `-${cantidad} ELO`, inline: true },
        { name: 'Posición actual', value: `#${targetSnap.current_rank}`, inline: true },
      )
      .setFooter({ text: 'Puedes cambiar tu apuesta antes del cierre usando /apostar de nuevo' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
