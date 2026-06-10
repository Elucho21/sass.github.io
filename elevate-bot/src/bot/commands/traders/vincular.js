const { SlashCommandBuilder } = require('discord.js');
const db = require('../../../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vincular')
    .setDescription('Vinculá tu correo de Impulse World a tu cuenta de Discord')
    .addStringOption(o =>
      o.setName('correo').setDescription('Tu correo registrado en Impulse World').setRequired(true)
    ),

  async execute(interaction) {
    const correo = interaction.options.getString('correo').toLowerCase().trim();
    const discordId = interaction.user.id;
    const username = interaction.user.username;
    const displayName = interaction.member?.displayName || interaction.user.globalName || username;

    const existing = db.prepare('SELECT * FROM email_links WHERE correo = ?').get(correo);
    if (existing && existing.discord_id !== discordId) {
      return interaction.reply({
        content: '❌ Ese correo ya está vinculado a otro usuario de Discord.',
        ephemeral: true,
      });
    }
    if (existing && existing.discord_id === discordId) {
      return interaction.reply({
        content: '✅ Ese correo ya estaba vinculado a tu cuenta.',
        ephemeral: true,
      });
    }

    // Crear jugador si no existe
    const player = db.prepare('SELECT discord_id FROM players WHERE discord_id = ?').get(discordId);
    if (!player) {
      db.prepare(`
        INSERT INTO players (discord_id, username, display_name)
        VALUES (?, ?, ?)
      `).run(discordId, username, displayName);
    }

    db.prepare(`
      INSERT INTO email_links (correo, discord_id, linked_by)
      VALUES (?, ?, 'self')
    `).run(correo, discordId);

    return interaction.reply({
      content: '✅ Correo vinculado. Ya podés participar en los torneos Elevate.',
      ephemeral: true,
    });
  },
};
