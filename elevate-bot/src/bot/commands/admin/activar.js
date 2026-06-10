const { SlashCommandBuilder } = require('discord.js');
const db = require('../../../database/db');
const { generateLeaderboardText, formatLastUpdated } = require('../../../utils/leaderboard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('activar')
    .setDescription('[Admin] Activá el torneo abierto y publicá la tabla'),

  async execute(interaction) {
    if (!interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID)) {
      return interaction.reply({ content: '❌ No tenés permisos de administrador.', ephemeral: true });
    }

    const active = db.prepare("SELECT id FROM tournaments WHERE status = 'active'").get();
    if (active) {
      return interaction.reply({ content: '❌ Ya hay un torneo activo.', ephemeral: true });
    }

    const torneo = db.prepare("SELECT * FROM tournaments WHERE status = 'open' ORDER BY id DESC LIMIT 1").get();
    if (!torneo) {
      return interaction.reply({ content: '❌ No hay torneo abierto. Creá uno con `/nueva-ronda`.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    // Obtener canal de tabla
    const canalConfig = db.prepare("SELECT value FROM server_config WHERE key = 'canal_tabla'").get();
    const canalId = canalConfig?.value || process.env.CHANNEL_TABLA;

    if (!canalId) {
      return interaction.editReply('❌ No hay canal de tabla configurado. Usá `/set-canal-tabla` primero.');
    }

    let pinnedMessageId = null;
    let pinnedChannelId = null;

    try {
      const channel = await interaction.client.channels.fetch(canalId);
      const tablaTxt = generateLeaderboardText(
        [],
        torneo.name,
        torneo.edition,
        formatLastUpdated(new Date().toISOString()),
        0,
      );
      const msg = await channel.send(tablaTxt);
      await msg.pin().catch(() => {});
      pinnedMessageId = msg.id;
      pinnedChannelId = channel.id;
    } catch (e) {
      console.error('[activar] Error al publicar tabla:', e.message);
    }

    db.prepare(`
      UPDATE tournaments SET status = 'active', pinned_message_id = ?, pinned_channel_id = ?
      WHERE id = ?
    `).run(pinnedMessageId, pinnedChannelId, torneo.id);

    return interaction.editReply(`✅ Torneo **${torneo.name} #${torneo.edition}** activado.${pinnedMessageId ? ' Tabla publicada y pinneada.' : ' (No se pudo publicar la tabla)'}`);
  },
};
