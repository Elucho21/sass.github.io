const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../../database/db');
const { isAuthorized } = require('../../../utils/auth');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nuevo-desafio')
    .setDescription('[Admin] Lanza un nuevo desafío semanal con premio en ELO')
    .addStringOption(o => o
      .setName('descripcion')
      .setDescription('Descripción del desafío (ej: El trader que más suba en ranking este torneo)')
      .setRequired(true))
    .addIntegerOption(o => o
      .setName('elo_reward')
      .setDescription('ELO de premio para el ganador (default: 50)')
      .setMinValue(10)
      .setMaxValue(200)
      .setRequired(false)),

  async execute(interaction) {
    if (!isAuthorized(interaction)) {
      return interaction.reply({ content: '❌ No tenés permisos para ejecutar este comando.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });

    const activeChallenge = db.prepare("SELECT * FROM weekly_challenges WHERE status = 'active' LIMIT 1").get();
    if (activeChallenge) {
      return interaction.editReply(`❌ Ya hay un desafío activo: **"${activeChallenge.description}"**. Cerralo primero con \`/cerrar-desafio\`.`);
    }

    const descripcion = interaction.options.getString('descripcion');
    const eloReward = interaction.options.getInteger('elo_reward') ?? 50;

    db.prepare(`
      INSERT INTO weekly_challenges (description, elo_reward, created_by)
      VALUES (?, ?, ?)
    `).run(descripcion, eloReward, interaction.user.id);

    const embed = new EmbedBuilder()
      .setColor(0xF59E0B)
      .setTitle('⚡ ¡Nuevo Desafío de la Semana!')
      .setDescription(`**${descripcion}**`)
      .addFields(
        { name: '🎯 Premio', value: `**+${eloReward} ELO** para el ganador`, inline: true },
        { name: '📅 Lanzado', value: new Date().toLocaleDateString('es-AR'), inline: true },
      )
      .setFooter({ text: 'El admin premiará al ganador con /cerrar-desafio @usuario' })
      .setTimestamp();

    try {
      const canalId = db.prepare("SELECT value FROM server_config WHERE key = 'canal_ascensos'").get()?.value
        || process.env.CHANNEL_ASCENSOS_LOGROS;
      if (canalId) {
        const ch = await interaction.client.channels.fetch(canalId);
        await ch.send({ content: '@everyone', embeds: [embed] });
        await interaction.editReply('✅ Desafío creado y anunciado en el canal.');
      } else {
        await interaction.editReply({ content: '✅ Desafío creado (canal no configurado para anunciar).', embeds: [embed] });
      }
    } catch (e) {
      await interaction.editReply({ content: '✅ Desafío creado (error al anunciar en canal).', embeds: [embed] });
    }
  },
};
