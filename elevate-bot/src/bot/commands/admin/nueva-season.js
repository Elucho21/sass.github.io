const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../../database/db');
const { isAuthorized } = require('../../../utils/auth');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nueva-season')
    .setDescription('[Admin] Inicia una nueva season de la liga')
    .addStringOption(o => o
      .setName('nombre')
      .setDescription('Nombre de la season (ej: Season 1 — Q1 2026)')
      .setRequired(true)),

  async execute(interaction) {
    if (!isAuthorized(interaction)) {
      return interaction.reply({ content: '❌ No tenés permisos para ejecutar este comando.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });

    const activeSeason = db.prepare("SELECT * FROM seasons WHERE status = 'active' LIMIT 1").get();
    if (activeSeason) {
      return interaction.editReply(`❌ Ya hay una season activa: **${activeSeason.name}** (iniciada el ${activeSeason.started_at.split('T')[0]}). Cerrala primero con \`/cerrar-season\`.`);
    }

    const nombre = interaction.options.getString('nombre');
    const result = db.prepare("INSERT INTO seasons (name) VALUES (?)").run(nombre);
    const seasonId = result.lastInsertRowid;

    const totalTraders = db.prepare('SELECT COUNT(*) as c FROM players').get().c;

    const embed = new EmbedBuilder()
      .setColor(0x7C3AED)
      .setTitle('🏟️ ¡Nueva Season iniciada!')
      .setDescription(`**${nombre}** ha comenzado`)
      .addFields(
        { name: 'ID', value: `#${seasonId}`, inline: true },
        { name: 'Traders en carrera', value: `${totalTraders}`, inline: true },
        { name: 'Inicio', value: new Date().toLocaleDateString('es-AR'), inline: true },
      )
      .setTimestamp();

    // Anunciar en canal_ascensos si está configurado
    try {
      const canalId = db.prepare("SELECT value FROM server_config WHERE key = 'canal_ascensos'").get()?.value
        || process.env.CHANNEL_ASCENSOS_LOGROS;
      if (canalId) {
        const ch = await interaction.client.channels.fetch(canalId);
        await ch.send({ content: '@everyone', embeds: [embed] });
      }
    } catch (e) { /* canal no configurado */ }

    await interaction.editReply({ content: `✅ Season **${nombre}** creada (ID #${seasonId}).`, embeds: [embed] });
  },
};
