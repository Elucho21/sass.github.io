const { SlashCommandBuilder } = require('discord.js');
const db = require('../../../database/db');
const { buildStatsEmbed } = require('../../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Mostrá tus estadísticas o las de otro usuario')
    .addUserOption(o =>
      o.setName('usuario').setDescription('Usuario a consultar (opcional)').setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('usuario') || interaction.user;
    const player = db.prepare('SELECT * FROM players WHERE discord_id = ?').get(target.id);

    if (!player) {
      const msg = target.id === interaction.user.id
        ? '❌ No tenés perfil registrado. Usá `/vincular` primero.'
        : '❌ Ese usuario no tiene perfil registrado.';
      return interaction.reply({ content: msg, ephemeral: true });
    }

    const recentAchievements = db.prepare(`
      SELECT * FROM achievements WHERE discord_id = ?
      ORDER BY unlocked_at DESC LIMIT 3
    `).all(player.discord_id);

    const lastTournaments = db.prepare(`
      SELECT r.*, t.name as torneo_name FROM results r
      JOIN tournaments t ON t.id = r.tournament_id
      WHERE r.discord_id = ?
      ORDER BY r.uploaded_at DESC LIMIT 5
    `).all(player.discord_id);

    const embed = buildStatsEmbed(player, recentAchievements, lastTournaments);
    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
