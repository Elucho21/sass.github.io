const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../../database/db');
const { LOGROS } = require('../../../utils/achievements');

const LOGROS_MAP = Object.fromEntries(LOGROS.map(l => [l.id, l]));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('logros')
    .setDescription('Mirá todos tus logros desbloqueados y en qué torneo los conseguiste'),

  async execute(interaction) {
    const discordId = interaction.user.id;
    const player = db.prepare('SELECT * FROM players WHERE discord_id = ?').get(discordId);

    if (!player) {
      return interaction.reply({ content: '❌ No tenés perfil. Usá `/vincular` primero.', ephemeral: true });
    }

    const logros = db.prepare(`
      SELECT a.logro_id, a.elo_ganado, a.unlocked_at,
             t.name AS torneo_name, t.edition
      FROM achievements a
      LEFT JOIN tournaments t ON a.tournament_id = t.id
      WHERE a.discord_id = ?
      ORDER BY a.unlocked_at ASC
    `).all(discordId);

    if (!logros.length) {
      return interaction.reply({
        content: '🏅 Todavía no desbloqueaste ningún logro. ¡Participá en torneos para conseguirlos!',
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0xEAB308)
      .setTitle(`🏅 Logros de ${player.display_name || player.username}`)
      .setFooter({ text: `${logros.length} logros desbloqueados · ${player.top10_count} veces en Top 10` });

    for (const a of logros) {
      const def = LOGROS_MAP[a.logro_id];
      const nombre = def?.nombre ?? a.logro_id;
      const torneo = a.torneo_name ? `${a.torneo_name} #${a.edition}` : 'Torneo desconocido';
      const fecha = a.unlocked_at ? a.unlocked_at.slice(0, 10) : '—';
      embed.addFields({
        name: nombre,
        value: `+${a.elo_ganado} ELO · ${torneo} · ${fecha}`,
        inline: false,
      });
    }

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
