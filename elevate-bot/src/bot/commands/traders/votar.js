const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const db = require('../../../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('votar')
    .setDescription('Votá quién creés que va a ganar el torneo activo')
    .addStringOption(opt =>
      opt.setName('trader')
        .setDescription('Nombre del trader al que querés votar (escribí para buscar)')
        .setAutocomplete(true)
        .setRequired(true)
    ),

  async autocomplete(interaction) {
    const torneo = db.prepare("SELECT * FROM tournaments WHERE status = 'active' ORDER BY id DESC LIMIT 1").get();
    if (!torneo) return interaction.respond([]).catch(() => {});

    const focused = (interaction.options.getFocused() || '').toLowerCase();
    const rows = db.prepare(`
      SELECT DISTINCT username, discord_id, current_rank
      FROM leaderboard_snapshots
      WHERE tournament_id = ? AND discord_id IS NOT NULL
        AND LOWER(username) LIKE ?
      ORDER BY current_rank ASC
      LIMIT 25
    `).all(torneo.id, `%${focused}%`);

    return interaction.respond(
      rows.map(r => ({ name: `#${r.current_rank} ${r.username}`, value: r.discord_id }))
    ).catch(() => {});
  },

  async execute(interaction) {
    const discordId = interaction.user.id;
    const votedForId = interaction.options.getString('trader');

    const torneo = db.prepare("SELECT * FROM tournaments WHERE status = 'active' ORDER BY id DESC LIMIT 1").get();
    if (!torneo) {
      return interaction.reply({ content: '❌ No hay torneo activo en este momento.', ephemeral: true });
    }

    const link = db.prepare('SELECT * FROM email_links WHERE discord_id = ?').get(discordId);
    if (!link) {
      return interaction.reply({
        content: '❌ Para votar primero debés enlazar tu correo de Impulse World.\nUsá el comando `/vincular` y seguí las instrucciones del bot.',
        ephemeral: true,
      });
    }

    const snap = db.prepare(
      'SELECT * FROM leaderboard_snapshots WHERE tournament_id = ? AND discord_id = ?'
    ).get(torneo.id, votedForId);
    if (!snap) {
      return interaction.reply({ content: '❌ Ese trader no está en el torneo activo. Elegí uno de la lista de sugerencias.', ephemeral: true });
    }

    const prevVote = db.prepare(
      'SELECT * FROM tournament_votes WHERE tournament_id = ? AND voter_discord_id = ?'
    ).get(torneo.id, discordId);

    db.prepare(`
      INSERT OR REPLACE INTO tournament_votes (tournament_id, voter_discord_id, voted_for_discord_id, voted_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(torneo.id, discordId, votedForId);

    const msg = prevVote
      ? `🔄 Cambiaste tu predicción a **${snap.username}** para ${torneo.name} #${torneo.edition}`
      : `✅ Votaste por **${snap.username}** como ganador de ${torneo.name} #${torneo.edition}`;

    return interaction.reply({ content: msg, ephemeral: true });
  },

  async handleButton(interaction) {
    const torneoId = parseInt(interaction.customId.replace('votar_abrir_', ''), 10);
    const discordId = interaction.user.id;

    const torneo = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(torneoId);
    if (!torneo || torneo.status !== 'active') {
      return interaction.reply({ content: '❌ El torneo ya no está activo.', ephemeral: true });
    }

    const link = db.prepare('SELECT * FROM email_links WHERE discord_id = ?').get(discordId);
    if (!link) {
      return interaction.reply({
        content: '❌ Para votar primero debés enlazar tu correo de Impulse World.\nUsá el comando `/vincular` y seguí las instrucciones del bot.',
        ephemeral: true,
      });
    }

    const participantes = db.prepare(`
      SELECT username, discord_id, current_rank, current_pnl_pct
      FROM leaderboard_snapshots
      WHERE tournament_id = ? AND discord_id IS NOT NULL
      ORDER BY current_rank ASC
      LIMIT 25
    `).all(torneoId);

    if (!participantes.length) {
      return interaction.reply({ content: '❌ No hay participantes vinculados en este torneo todavía.', ephemeral: true });
    }

    const prevVote = db.prepare(
      'SELECT voted_for_discord_id FROM tournament_votes WHERE tournament_id = ? AND voter_discord_id = ?'
    ).get(torneoId, discordId);

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`votar_select_${torneoId}`)
      .setPlaceholder('Elegí al trader que creés que va a ganar')
      .addOptions(participantes.map(p => {
        const sign = p.current_pnl_pct >= 0 ? '+' : '';
        return {
          label: `#${p.current_rank} ${p.username}`.slice(0, 100),
          description: `PnL actual: ${sign}${Number(p.current_pnl_pct).toFixed(2)}%`,
          value: p.discord_id,
          default: prevVote?.voted_for_discord_id === p.discord_id,
        };
      }));

    const row = new ActionRowBuilder().addComponents(selectMenu);
    const header = prevVote
      ? '🔄 **Cambiar predicción** — elegí a quién le das el primer puesto:'
      : '🗳️ **¿Quién va a ganar?** — elegí tu predicción:';

    return interaction.reply({ content: header, components: [row], ephemeral: true });
  },

  async handleSelectMenu(interaction) {
    const torneoId = parseInt(interaction.customId.replace('votar_select_', ''), 10);
    const discordId = interaction.user.id;
    const votedForId = interaction.values[0];

    const torneo = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(torneoId);
    const snap = db.prepare(
      'SELECT * FROM leaderboard_snapshots WHERE tournament_id = ? AND discord_id = ?'
    ).get(torneoId, votedForId);

    if (!snap) {
      return interaction.update({ content: '❌ Error al guardar el voto. Intentá de nuevo.', components: [] });
    }

    const prevVote = db.prepare(
      'SELECT * FROM tournament_votes WHERE tournament_id = ? AND voter_discord_id = ?'
    ).get(torneoId, discordId);

    db.prepare(`
      INSERT OR REPLACE INTO tournament_votes (tournament_id, voter_discord_id, voted_for_discord_id, voted_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(torneoId, discordId, votedForId);

    const msg = prevVote
      ? `🔄 Cambiaste tu predicción a **${snap.username}** para ${torneo?.name} #${torneo?.edition}`
      : `✅ Votaste por **${snap.username}** como ganador de ${torneo?.name} #${torneo?.edition}`;

    return interaction.update({ content: msg, components: [] });
  },
};
