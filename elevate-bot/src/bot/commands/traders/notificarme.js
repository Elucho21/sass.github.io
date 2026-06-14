const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('notificarme')
    .setDescription('Activa o desactiva notificaciones por DM al cerrar torneos')
    .addStringOption(o => o
      .setName('estado')
      .setDescription('Activar o desactivar')
      .setRequired(true)
      .addChoices(
        { name: '🔔 Activar', value: 'on' },
        { name: '🔕 Desactivar', value: 'off' },
      )),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const discord_id = interaction.user.id;
    const player = db.prepare('SELECT discord_id FROM players WHERE discord_id = ?').get(discord_id);
    if (!player) return interaction.editReply('❌ No estás registrado. Usa `/vincular` primero.');

    const notifyOn = interaction.options.getString('estado') === 'on' ? 1 : 0;
    db.prepare(`
      INSERT OR REPLACE INTO dm_preferences (discord_id, notify_on, created_at)
      VALUES (?, ?, datetime('now'))
    `).run(discord_id, notifyOn);

    const embed = new EmbedBuilder()
      .setColor(notifyOn ? 0x22C55E : 0x6B7280)
      .setTitle(notifyOn ? '🔔 Notificaciones activadas' : '🔕 Notificaciones desactivadas')
      .setDescription(
        notifyOn
          ? 'Recibirás un resumen por DM al finalizar cada torneo.'
          : 'Ya no recibirás notificaciones por DM al cerrar torneos.'
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
