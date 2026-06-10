const { SlashCommandBuilder } = require('discord.js');
const db = require('../../../database/db');
const { isAuthorized } = require('../../../utils/auth');
const { generateLeaderboardText, formatLastUpdated } = require('../../../utils/leaderboard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('actualizar-tabla')
    .setDescription('[Admin] Refrescá el mensaje pinneado con los datos actuales'),

  async execute(interaction) {
    if (!isAuthorized(interaction)) {
      return interaction.reply({ content: '❌ No tenés permisos para ejecutar este comando.', ephemeral: true });
    }

    const torneo = db.prepare("SELECT * FROM tournaments WHERE status = 'active' ORDER BY id DESC LIMIT 1").get();
    if (!torneo) {
      return interaction.reply({ content: '❌ No hay torneo activo.', ephemeral: true });
    }

    if (!torneo.pinned_message_id || !torneo.pinned_channel_id) {
      return interaction.reply({ content: '❌ No hay mensaje pinneado configurado. Activá el torneo con `/activar`.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const snapshots = db.prepare('SELECT * FROM leaderboard_snapshots WHERE tournament_id = ? ORDER BY current_rank ASC').all(torneo.id);
    const text = generateLeaderboardText(
      snapshots,
      torneo.name,
      torneo.edition,
      formatLastUpdated(new Date().toISOString()),
      torneo.total_participants,
    );

    try {
      const channel = await interaction.client.channels.fetch(torneo.pinned_channel_id);
      const msg = await channel.messages.fetch(torneo.pinned_message_id);
      await msg.edit(text);
      return interaction.editReply('✅ Tabla actualizada.');
    } catch (e) {
      console.error('[actualizar-tabla]', e.message);
      return interaction.editReply('❌ No se pudo editar el mensaje pinneado.');
    }
  },
};
