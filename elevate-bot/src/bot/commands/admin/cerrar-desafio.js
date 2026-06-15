const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../../database/db');
const { isAuthorized } = require('../../../utils/auth');
const { getLevelEmoji } = require('../../../utils/elo');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cerrar-desafio')
    .setDescription('[Admin] Cierra el desafío activo y premia al ganador con ELO')
    .addUserOption(o => o
      .setName('ganador')
      .setDescription('Usuario ganador del desafío')
      .setRequired(true)),

  async execute(interaction) {
    if (!isAuthorized(interaction)) {
      return interaction.reply({ content: '❌ No tenés permisos para ejecutar este comando.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });

    const challenge = db.prepare("SELECT * FROM weekly_challenges WHERE status = 'active' ORDER BY id DESC LIMIT 1").get();
    if (!challenge) {
      return interaction.editReply('❌ No hay ningún desafío activo. Creá uno con `/nuevo-desafio`.');
    }

    const winner = interaction.options.getUser('ganador');
    const winnerPlayer = db.prepare('SELECT * FROM players WHERE discord_id = ?').get(winner.id);
    if (!winnerPlayer) {
      return interaction.editReply(`❌ ${winner.username} no está registrado en el sistema (sin /vincular).`);
    }

    // Dar ELO y cerrar el desafío
    db.prepare('UPDATE players SET elo = elo + ? WHERE discord_id = ?').run(challenge.elo_reward, winner.id);
    db.prepare(`
      UPDATE weekly_challenges
      SET status = 'closed', winner_discord_id = ?, closed_at = datetime('now')
      WHERE id = ?
    `).run(winner.id, challenge.id);

    const updatedPlayer = db.prepare('SELECT * FROM players WHERE discord_id = ?').get(winner.id);

    const embed = new EmbedBuilder()
      .setColor(0x22C55E)
      .setTitle('🏆 ¡Desafío completado!')
      .setDescription(`**${winnerPlayer.display_name || winnerPlayer.username}** ganó el desafío de la semana`)
      .addFields(
        { name: '⚡ Desafío', value: challenge.description, inline: false },
        { name: '🎯 Premio', value: `+${challenge.elo_reward} ELO`, inline: true },
        { name: '📊 ELO nuevo', value: `${updatedPlayer.elo} ${getLevelEmoji(updatedPlayer.level)}`, inline: true },
      )
      .setTimestamp();

    try {
      const canalId = db.prepare("SELECT value FROM server_config WHERE key = 'canal_ascensos'").get()?.value
        || process.env.CHANNEL_ASCENSOS_LOGROS;
      if (canalId) {
        const ch = await interaction.client.channels.fetch(canalId);
        await ch.send({ content: `🎉 <@${winner.id}>`, embeds: [embed] });
      }
    } catch (e) { /* canal no configurado */ }

    await interaction.editReply({ content: `✅ Desafío cerrado. +${challenge.elo_reward} ELO para ${winner.username}.`, embeds: [embed] });
  },
};
