const { SlashCommandBuilder } = require('discord.js');
const db = require('../../../database/db');
const { isAuthorized } = require('../../../utils/auth');
const csv = require('csv-parser');
const { Readable } = require('stream');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vincular-masivo')
    .setDescription('[Admin] Vinculá masivamente correos desde un CSV')
    .addAttachmentOption(o =>
      o.setName('archivo').setDescription('CSV con columnas: correo, discord_username').setRequired(true)
    ),

  async execute(interaction) {
    if (!isAuthorized(interaction)) {
      return interaction.reply({ content: '❌ No tenés permisos para ejecutar este comando.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const attachment = interaction.options.getAttachment('archivo');
    let csvBuffer;
    try {
      const resp = await fetch(attachment.url);
      csvBuffer = Buffer.from(await resp.arrayBuffer());
    } catch (e) {
      return interaction.editReply('❌ No se pudo descargar el archivo.');
    }

    const rows = await parseCsv(csvBuffer);

    await interaction.guild.members.fetch();

    let exitosas = 0;
    const errores = [];

    for (const row of rows) {
      const correo = row.correo?.toLowerCase().trim();
      const dUsername = row.discord_username?.toLowerCase().trim();
      if (!correo || !dUsername) { errores.push(`Fila inválida`); continue; }

      const member = interaction.guild.members.cache.find(
        m => m.user.username.toLowerCase() === dUsername || m.user.tag?.toLowerCase() === dUsername
      );

      if (!member) { errores.push(`No encontrado: ${dUsername}`); continue; }

      const discordId = member.user.id;
      const username = member.user.username;
      const displayName = member.displayName || username;

      const existing = db.prepare('SELECT * FROM email_links WHERE correo = ?').get(correo);
      if (existing && existing.discord_id !== discordId) {
        errores.push(`${correo} ya vinculado a otro usuario`);
        continue;
      }

      const player = db.prepare('SELECT discord_id FROM players WHERE discord_id = ?').get(discordId);
      if (!player) {
        db.prepare('INSERT OR IGNORE INTO players (discord_id, username, display_name) VALUES (?, ?, ?)')
          .run(discordId, username, displayName);
      }

      db.prepare(`
        INSERT OR REPLACE INTO email_links (correo, discord_id, linked_by)
        VALUES (?, ?, 'admin')
      `).run(correo, discordId);

      exitosas++;
    }

    const errorSummary = errores.length > 5
      ? `\n⚠️ ${errores.length} errores (primeros 5):\n${errores.slice(0, 5).join('\n')}`
      : errores.length ? `\n⚠️ Errores:\n${errores.join('\n')}` : '';

    return interaction.editReply(`✅ **${exitosas}** vinculaciones exitosas.${errorSummary}`);
  },
};

function parseCsv(buffer) {
  return new Promise((resolve, reject) => {
    const results = [];
    Readable.from(buffer.toString())
      .pipe(csv({ mapHeaders: ({ header }) => header.trim().toLowerCase().replace(/\s+/g, '_') }))
      .on('data', d => results.push(d))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}
