const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../../database/db');

const MAX_BETS_PER_TRADER = 3;
const COOLDOWN_MINUTES = 20;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('apostar')
    .setDescription('Apuesta ELO a quién ganará el torneo activo (máx. 3 veces por trader, 20 min entre apuestas)')
    .addStringOption(o => o
      .setName('trader')
      .setDescription('Trader al que apostás como ganador')
      .setRequired(true)
      .setAutocomplete(true))
    .addIntegerOption(o => o
      .setName('cantidad')
      .setDescription('ELO a apostar')
      .setRequired(true)
      .addChoices(
        { name: '10 ELO', value: 10 },
        { name: '25 ELO', value: 25 },
        { name: '50 ELO', value: 50 },
        { name: '100 ELO', value: 100 },
      )),

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

    // Mostrar cuántas apuestas ya tiene el usuario en cada trader
    const myBetCounts = {};
    try {
      const myBets = db.prepare(
        "SELECT target_discord_id, COUNT(*) as cnt FROM elo_bets WHERE tournament_id = ? AND bettor_discord_id = ? AND status = 'pending' GROUP BY target_discord_id"
      ).all(torneo.id, interaction.user.id);
      for (const b of myBets) myBetCounts[b.target_discord_id] = b.cnt;
    } catch (e) { /* ok */ }

    const choices = snaps
      .filter(s => s.discord_id !== interaction.user.id)
      .map(s => {
        const count = myBetCounts[s.discord_id] || 0;
        const countStr = count > 0 ? ` [${count}/3]` : '';
        const full = count >= MAX_BETS_PER_TRADER ? ' ⛔ LLENO' : '';
        return {
          name: `#${s.current_rank} ${s.username} (${s.current_pnl_pct >= 0 ? '+' : ''}${s.current_pnl_pct?.toFixed(1)}%)${countStr}${full}`,
          value: s.discord_id,
        };
      });
    await interaction.respond(choices);
  },

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const discord_id = interaction.user.id;

    const torneo = db.prepare("SELECT * FROM tournaments WHERE status = 'active' ORDER BY id DESC LIMIT 1").get();
    if (!torneo) return interaction.editReply('❌ No hay torneo activo en este momento.');

    const player = db.prepare('SELECT * FROM players WHERE discord_id = ?').get(discord_id);
    if (!player) return interaction.editReply('❌ No estás registrado. Usa `/vincular` primero.');
    if (player.elo < 1300) return interaction.editReply('❌ Necesitás al menos **1300 ELO** (nivel Trader) para apostar.');

    const targetId = interaction.options.getString('trader');
    if (targetId === discord_id) return interaction.editReply('❌ No podés apostar por vos mismo.');

    const targetSnap = db.prepare('SELECT * FROM leaderboard_snapshots WHERE tournament_id = ? AND discord_id = ?').get(torneo.id, targetId);
    if (!targetSnap) return interaction.editReply('❌ Ese trader no está en el torneo activo.');

    const cantidad = interaction.options.getInteger('cantidad');

    // Apuestas existentes en este trader en este torneo
    const existingBets = db.prepare(`
      SELECT * FROM elo_bets
      WHERE tournament_id = ? AND bettor_discord_id = ? AND target_discord_id = ?
      ORDER BY placed_at DESC
    `).all(torneo.id, discord_id, targetId);

    // Límite de 3 apuestas por trader
    if (existingBets.length >= MAX_BETS_PER_TRADER) {
      return interaction.editReply(`❌ Ya pusiste **${MAX_BETS_PER_TRADER} apuestas** en este trader. Ese es el máximo por torneo.`);
    }

    // Cooldown de 20 minutos entre apuestas al mismo trader
    if (existingBets.length > 0) {
      const lastBet = existingBets[0];
      const lastPlaced = new Date(lastBet.placed_at.replace(' ', 'T') + 'Z');
      const minutesSince = (Date.now() - lastPlaced.getTime()) / 60000;
      if (minutesSince < COOLDOWN_MINUTES) {
        const remaining = Math.ceil(COOLDOWN_MINUTES - minutesSince);
        return interaction.editReply(`⏳ Tenés que esperar **${remaining} minuto${remaining !== 1 ? 's' : ''}** más para volver a apostar por este trader.`);
      }
    }

    // Registrar la apuesta
    db.prepare(`
      INSERT INTO elo_bets (tournament_id, bettor_discord_id, target_discord_id, elo_amount, status, placed_at)
      VALUES (?, ?, ?, ?, 'pending', datetime('now'))
    `).run(torneo.id, discord_id, targetId, cantidad);

    const targetPlayer = db.prepare('SELECT * FROM players WHERE discord_id = ?').get(targetId);
    const targetName = targetPlayer?.display_name || targetPlayer?.username || targetSnap.username;
    const betNumber = existingBets.length + 1;
    const loss = Math.ceil(cantidad / 2);

    // Mostrar todas las apuestas actuales en este trader
    const allBets = db.prepare(`
      SELECT elo_amount, placed_at FROM elo_bets
      WHERE tournament_id = ? AND bettor_discord_id = ? AND target_discord_id = ?
      ORDER BY placed_at ASC
    `).all(torneo.id, discord_id, targetId);

    const totalApostado = allBets.reduce((sum, b) => sum + b.elo_amount, 0);
    const betsDetail = allBets.map((b, i) => `${i + 1}. ${b.elo_amount} ELO`).join(' · ');

    const embed = new EmbedBuilder()
      .setColor(0xF59E0B)
      .setTitle(`🎰 Apuesta #${betNumber} registrada`)
      .setDescription(`Apostaste **${cantidad} ELO** a que **${targetName}** gana el torneo`)
      .addFields(
        { name: '🏆 Si gana', value: `+${cantidad} ELO`, inline: true },
        { name: '❌ Si pierde', value: `-${loss} ELO (50%)`, inline: true },
        { name: '📍 Posición actual', value: `#${targetSnap.current_rank}`, inline: true },
        { name: `📊 Tus apuestas en ${targetName} (${allBets.length}/${MAX_BETS_PER_TRADER})`, value: `${betsDetail}\n**Total en juego: ${totalApostado} ELO**`, inline: false },
      )
      .setTimestamp();

    if (betNumber < MAX_BETS_PER_TRADER) {
      embed.setFooter({ text: `Podés apostar ${MAX_BETS_PER_TRADER - betNumber} vez${MAX_BETS_PER_TRADER - betNumber !== 1 ? 'es' : ''} más en este trader (cooldown: 20 min)` });
    } else {
      embed.setFooter({ text: '⛔ Límite alcanzado para este trader' });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
