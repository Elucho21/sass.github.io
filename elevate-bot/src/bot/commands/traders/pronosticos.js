const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pronosticos')
    .setDescription('Ver tu historial de predicciones y apuestas ELO'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const discord_id = interaction.user.id;

    const votes = db.prepare(`
      SELECT tv.voted_for_discord_id, tv.voted_at,
             COALESCE(p.display_name, p.username, tv.voted_for_discord_id) as target_name,
             t.name as torneo_name, t.edition, t.status as torneo_status,
             r.rank_final as target_rank
      FROM tournament_votes tv
      JOIN tournaments t ON t.id = tv.tournament_id
      LEFT JOIN players p ON p.discord_id = tv.voted_for_discord_id
      LEFT JOIN results r ON r.tournament_id = tv.tournament_id AND r.discord_id = tv.voted_for_discord_id
      WHERE tv.voter_discord_id = ?
      ORDER BY tv.voted_at DESC LIMIT 8
    `).all(discord_id);

    let bets = [];
    try {
      bets = db.prepare(`
        SELECT eb.tournament_id, eb.target_discord_id, eb.elo_amount, eb.status, eb.elo_result, eb.placed_at,
               t.name as torneo_name, t.edition, t.status as torneo_status,
               COALESCE(p.display_name, p.username) as target_name
        FROM elo_bets eb
        JOIN tournaments t ON t.id = eb.tournament_id
        LEFT JOIN players p ON p.discord_id = eb.target_discord_id
        WHERE eb.bettor_discord_id = ?
        ORDER BY eb.placed_at DESC LIMIT 30
      `).all(discord_id);
    } catch (e) { /* elo_bets may not exist */ }

    if (!votes.length && !bets.length) {
      return interaction.editReply('Aún no has hecho ningún pronóstico. Usa `/votar` para predecir al ganador y `/apostar` para apostar ELO.');
    }

    const closed = votes.filter(v => v.torneo_status === 'closed');
    const aciertos = closed.filter(v => v.target_rank === 1).length;
    const accuracy = closed.length > 0 ? `${((aciertos / closed.length) * 100).toFixed(0)}%` : '—';

    const votesText = votes.length
      ? votes.map(v => {
          const torneo = `${v.torneo_name} #${v.edition}`;
          if (v.torneo_status !== 'closed') return `⏳ **${torneo}** → ${v.target_name} *(en curso)*`;
          return `${v.target_rank === 1 ? '✅' : '❌'} **${torneo}** → ${v.target_name} (terminó #${v.target_rank ?? '?'})`;
        }).join('\n')
      : 'Sin votos registrados.';

    // Agrupar apuestas por (torneo, target_discord_id)
    let betsText = 'Sin apuestas registradas.';
    if (bets.length) {
      const groups = new Map();
      for (const b of bets) {
        const key = `${b.tournament_id}__${b.target_discord_id}`;
        if (!groups.has(key)) {
          groups.set(key, { torneo_name: b.torneo_name, edition: b.edition, torneo_status: b.torneo_status, target_name: b.target_name, items: [] });
        }
        groups.get(key).items.push(b);
      }

      const lines = [];
      for (const [, g] of groups) {
        const torneo = `${g.torneo_name} #${g.edition}`;
        const totalStaked = g.items.reduce((s, b) => s + b.elo_amount, 0);
        if (g.torneo_status !== 'closed') {
          const detail = g.items.map(b => `${b.elo_amount} ELO`).join('+');
          lines.push(`⏳ **${torneo}** — ${g.target_name} · ${detail} = ${totalStaked} ELO en juego`);
        } else {
          const totalResult = g.items.reduce((s, b) => s + (b.elo_result ?? 0), 0);
          const won = g.items.some(b => b.status === 'won');
          const icon = won ? '✅' : '❌';
          const resultStr = totalResult >= 0 ? `+${totalResult}` : `${totalResult}`;
          lines.push(`${icon} **${torneo}** — ${g.target_name} · ${totalStaked} ELO apostados → **${resultStr} ELO**`);
        }
      }
      betsText = lines.join('\n');
    }

    const embed = new EmbedBuilder()
      .setColor(0x8B5CF6)
      .setTitle('🔮 Mis Pronósticos')
      .addFields(
        { name: `🗳️ Votos (precisión: ${accuracy})`, value: votesText, inline: false },
        { name: '🎰 Apuestas ELO', value: betsText, inline: false },
      )
      .setTimestamp()
      .setFooter({ text: `${interaction.user.username} · /pronosticos` });

    await interaction.editReply({ embeds: [embed] });
  },
};
