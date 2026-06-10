const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../../database/db');
const { formatLastUpdated } = require('../../../utils/leaderboard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ronda')
    .setDescription('Mostrá el estado del torneo activo'),

  async execute(interaction) {
    const torneo = db.prepare("SELECT * FROM tournaments WHERE status IN ('active','open') ORDER BY id DESC LIMIT 1").get();

    if (!torneo) {
      return interaction.reply({ content: 'No hay torneo activo o abierto en este momento.', ephemeral: true });
    }

    const vinculados = db.prepare(`
      SELECT COUNT(DISTINCT ls.discord_id) as c
      FROM leaderboard_snapshots ls
      WHERE ls.tournament_id = ? AND ls.discord_id IS NOT NULL
    `).get(torneo.id)?.c || 0;

    const lastSnapshot = db.prepare(`
      SELECT MAX(last_updated) as lu FROM leaderboard_snapshots WHERE tournament_id = ?
    `).get(torneo.id);

    const statusMap = { open: '🟡 Abierto', active: '🟢 Activo', closed: '🔴 Cerrado' };

    const embed = new EmbedBuilder()
      .setColor(0x7C3AED)
      .setTitle(`📅 ${torneo.name} — Edición #${torneo.edition}`)
      .addFields(
        { name: 'Modalidad',          value: torneo.modalidad,                     inline: true },
        { name: 'Estado',             value: statusMap[torneo.status] || torneo.status, inline: true },
        { name: 'Capital inicial',    value: `$${torneo.capital_inicial.toLocaleString()}`, inline: true },
        { name: 'Participantes',      value: `${torneo.total_participants}`,        inline: true },
        { name: 'Vinculados',         value: `${vinculados}`,                       inline: true },
        { name: 'Última actualización', value: formatLastUpdated(lastSnapshot?.lu), inline: true },
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
