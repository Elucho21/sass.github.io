const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../../database/db');
const { isAuthorized } = require('../../../utils/auth');
const { getLevelEmoji } = require('../../../utils/elo');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cerrar-season')
    .setDescription('[Admin] Cierra la season activa: guarda el ranking y aplica softcap de ELO'),

  async execute(interaction) {
    if (!isAuthorized(interaction)) {
      return interaction.reply({ content: '❌ No tenés permisos para ejecutar este comando.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });

    const season = db.prepare("SELECT * FROM seasons WHERE status = 'active' LIMIT 1").get();
    if (!season) {
      return interaction.editReply('❌ No hay ninguna season activa. Creá una con `/nueva-season`.');
    }

    const players = db.prepare('SELECT * FROM players ORDER BY elo DESC').all();
    if (!players.length) {
      return interaction.editReply('❌ No hay traders registrados.');
    }

    const top3 = players.slice(0, 3);

    // Guardar ranking + aplicar softcap ELO en una transacción
    const closeAndSoftcap = db.transaction(() => {
      const insertRank = db.prepare(`
        INSERT INTO season_rankings (season_id, discord_id, rank_position, final_elo, final_level)
        VALUES (?, ?, ?, ?, ?)
      `);
      const softcap = db.prepare('UPDATE players SET elo = ? WHERE discord_id = ?');

      players.forEach((p, i) => {
        insertRank.run(season.id, p.discord_id, i + 1, p.elo, p.level);
        // Softcap: nuevo ELO = floor((elo_actual + 1200) / 2)
        const newElo = Math.floor((p.elo + 1200) / 2);
        softcap.run(newElo, p.discord_id);
      });

      db.prepare("UPDATE seasons SET status = 'closed', ended_at = datetime('now') WHERE id = ?").run(season.id);
    });

    closeAndSoftcap();

    const podiumText = top3.map((p, i) => {
      const medals = ['🥇', '🥈', '🥉'];
      return `${medals[i]} **${p.display_name || p.username}** — ${p.elo} ELO (${getLevelEmoji(p.level)} ${p.level})`;
    }).join('\n');

    const embed = new EmbedBuilder()
      .setColor(0xEAB308)
      .setTitle(`🏁 ${season.name} — Cerrada`)
      .setDescription(`**Podio final:**\n${podiumText}`)
      .addFields(
        { name: '📊 Traders procesados', value: `${players.length}`, inline: true },
        { name: '🔄 ELO softcap', value: 'Aplicado (nuevo = ⌊(ELO + 1200) / 2⌋)', inline: true },
        { name: '📅 Duración', value: `${season.started_at.split('T')[0]} → ${new Date().toLocaleDateString('es-AR')}`, inline: false },
      )
      .setTimestamp();

    try {
      const canalId = db.prepare("SELECT value FROM server_config WHERE key = 'canal_ascensos'").get()?.value
        || process.env.CHANNEL_ASCENSOS_LOGROS;
      if (canalId) {
        const ch = await interaction.client.channels.fetch(canalId);
        await ch.send({ embeds: [embed] });
      }
    } catch (e) { /* canal no configurado */ }

    await interaction.editReply({ content: `✅ Season cerrada. ELO softcap aplicado a ${players.length} traders.`, embeds: [embed] });
  },
};
