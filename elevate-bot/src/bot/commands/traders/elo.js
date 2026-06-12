const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../../database/db');
const { getLevelEmoji } = require('../../../utils/elo');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('elo')
    .setDescription('Mostrá tu ELO actual, nivel y posición en el ranking (con contexto de vecinos)'),

  async execute(interaction) {
    const discordId = interaction.user.id;
    const player = db.prepare('SELECT * FROM players WHERE discord_id = ?').get(discordId);

    if (!player) {
      return interaction.reply({ content: '❌ No tenés perfil. Usá `/vincular` primero.', ephemeral: true });
    }

    // Obtener todos los jugadores ordenados por ELO para construir la ventana de contexto
    const allPlayers = db.prepare(
      'SELECT discord_id, display_name, username, elo, level FROM players ORDER BY elo DESC'
    ).all();

    const myIdx = allPlayers.findIndex(p => p.discord_id === discordId);
    const total = allPlayers.length;

    // Ventana de 5: centrar en el jugador, ajustando en los extremos
    let startIdx = Math.max(0, myIdx - 2);
    const endIdx = Math.min(total - 1, startIdx + 4);
    startIdx = Math.max(0, endIdx - 4);
    const contextRows = allPlayers.slice(startIdx, endIdx + 1);

    const emoji = getLevelEmoji(player.level);
    const lines = contextRows.map((p, i) => {
      const rank = startIdx + i + 1;
      const pEmoji = getLevelEmoji(p.level);
      const name = p.display_name || p.username;
      const isMe = p.discord_id === discordId;
      return isMe
        ? `**→ \`#${String(rank).padStart(2)}\` ${pEmoji} ${name} — ${p.elo} ELO ←**`
        : `   \`#${String(rank).padStart(2)}\` ${pEmoji} ${name} — ${p.elo} ELO`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x7C3AED)
      .setTitle(`📊 Tu ELO — ${emoji} ${player.level}`)
      .setDescription(lines.join('\n'))
      .setFooter({ text: `Puesto #${myIdx + 1} de ${total} traders` });

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
