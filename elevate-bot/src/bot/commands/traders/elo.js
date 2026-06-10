const { SlashCommandBuilder } = require('discord.js');
const db = require('../../../database/db');
const { getLevelEmoji } = require('../../../utils/elo');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('elo')
    .setDescription('Mostrá tu ELO actual, nivel y posición en el ranking'),

  async execute(interaction) {
    const discordId = interaction.user.id;
    const player = db.prepare('SELECT * FROM players WHERE discord_id = ?').get(discordId);

    if (!player) {
      return interaction.reply({ content: '❌ No tenés perfil. Usá `/vincular` primero.', ephemeral: true });
    }

    const totalTraders = db.prepare('SELECT COUNT(*) as c FROM players').get().c;
    const puesto = db.prepare('SELECT COUNT(*) as c FROM players WHERE elo > ?').get(player.elo).c + 1;
    const emoji = getLevelEmoji(player.level);

    return interaction.reply({
      content: `📊 Tu ELO: **${player.elo}**  ${emoji} **${player.level}**\n📍 Puesto **#${puesto}** de ${totalTraders} traders`,
      ephemeral: true,
    });
  },
};
