const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const db = require('../../../database/db');
const { isAuthorized } = require('../../../utils/auth');
const { getLevelEmoji } = require('../../../utils/elo');
const { generateLeaderboardText, formatLastUpdated } = require('../../../utils/leaderboard');
const { parseCsv, normalizeRows } = require('../../../utils/csv');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cargar-resultados')
    .setDescription('[Admin] Cargá resultados CSV del torneo activo o de un torneo histórico')
    .addAttachmentOption(o =>
      o.setName('archivo').setDescription('CSV formato Elevate (Equity/Correo/Alias) o formato propio (correo/equidad_actual/rank)').setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName('torneo_id').setDescription('ID del torneo (solo para torneos históricos; omitir para el torneo activo)').setRequired(false)
    ),

  async execute(interaction) {
    if (!isAuthorized(interaction)) {
      return interaction.reply({ content: '❌ No tenés permisos para ejecutar este comando.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const torneoId = interaction.options.getInteger('torneo_id');
    const torneo = torneoId
      ? db.prepare('SELECT * FROM tournaments WHERE id = ?').get(torneoId)
      : db.prepare("SELECT * FROM tournaments WHERE status IN ('active','open') ORDER BY id DESC LIMIT 1").get();

    if (!torneo) {
      return interaction.editReply(torneoId
        ? `❌ No se encontró el torneo con ID ${torneoId}.`
        : '❌ No hay torneo activo. Activá uno con `/activar` primero.'
      );
    }

    const attachment = interaction.options.getAttachment('archivo');
    if (!attachment.name.endsWith('.csv')) {
      return interaction.editReply('❌ El archivo debe ser .csv');
    }

    let csvBuffer;
    try {
      const resp = await fetch(attachment.url);
      csvBuffer = Buffer.from(await resp.arrayBuffer());
    } catch (e) {
      return interaction.editReply('❌ No se pudo descargar el archivo.');
    }

    const rawRows = await parseCsv(csvBuffer);
    if (!rawRows.length) {
      return interaction.editReply('❌ El CSV está vacío o tiene un formato incorrecto.');
    }
    const rows = normalizeRows(rawRows);

    // Guardar CSV sin vincular en una tabla temporal en memoria
    const sinVincular = [];
    let actualizados = 0;

    // Guardar correos sin vincular como referencia para /sin-vincular
    db.prepare("DELETE FROM server_config WHERE key = 'last_csv_unlinked'").run();

    const upsertSnapshot = db.prepare(`
      INSERT INTO leaderboard_snapshots
        (tournament_id, discord_id, correo, username, current_rank, current_equidad, current_pnl_pct, en_negativo, level_emoji, pos_change, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT DO NOTHING
    `);

    const updateSnapshot = db.prepare(`
      UPDATE leaderboard_snapshots
      SET discord_id = ?, username = ?, current_rank = ?, current_equidad = ?,
          current_pnl_pct = ?, en_negativo = ?, level_emoji = ?, pos_change = ?,
          last_updated = datetime('now')
      WHERE tournament_id = ? AND correo = ?
    `);

    const insertOrUpdate = db.transaction((rowData) => {
      const { correo, equidad_actual, rank, alias } = rowData;
      const equidad = parseFloat(equidad_actual);
      const rankNum = parseInt(rank, 10);

      if (isNaN(equidad) || isNaN(rankNum)) return;

      const pnl_pct = ((equidad - torneo.capital_inicial) / torneo.capital_inicial) * 100;
      const en_negativo = pnl_pct < 0 ? 1 : 0;

      const link = db.prepare('SELECT * FROM email_links WHERE correo = ?').get(correo.toLowerCase().trim());
      let discordId = null;
      let username = alias || '—';
      let levelEmoji = '🟤';

      if (link) {
        discordId = link.discord_id;
        const player = db.prepare('SELECT * FROM players WHERE discord_id = ?').get(discordId);
        if (player) {
          username = player.display_name || player.username;
          levelEmoji = getLevelEmoji(player.level);
        }
      } else {
        sinVincular.push(correo);
      }

      // Calcular pos_change
      const prevSnapshot = db.prepare(`
        SELECT current_rank FROM leaderboard_snapshots
        WHERE tournament_id = ? AND correo = ?
      `).get(torneo.id, correo.toLowerCase().trim());

      const pos_change = prevSnapshot ? prevSnapshot.current_rank - rankNum : 0;

      const existing = db.prepare('SELECT id FROM leaderboard_snapshots WHERE tournament_id = ? AND correo = ?')
        .get(torneo.id, correo.toLowerCase().trim());

      if (existing) {
        updateSnapshot.run(discordId, username, rankNum, equidad, pnl_pct, en_negativo, levelEmoji, pos_change, torneo.id, correo.toLowerCase().trim());
      } else {
        upsertSnapshot.run(torneo.id, discordId, correo.toLowerCase().trim(), username, rankNum, equidad, pnl_pct, en_negativo, levelEmoji, pos_change);
      }

      actualizados++;
    });

    for (const row of rows) {
      try { insertOrUpdate(row); } catch (e) { console.error('[CSV] Error fila:', e); }
    }

    // Actualizar total_participants
    const totalCount = db.prepare('SELECT COUNT(*) as c FROM leaderboard_snapshots WHERE tournament_id = ?').get(torneo.id).c;
    db.prepare('UPDATE tournaments SET total_participants = ? WHERE id = ?').run(totalCount, torneo.id);

    // Guardar lista de sin vincular
    if (sinVincular.length) {
      db.prepare("INSERT OR REPLACE INTO server_config (key, value) VALUES ('last_csv_unlinked', ?)").run(JSON.stringify(sinVincular));
    }

    // Editar mensaje pinneado
    if (torneo.pinned_message_id && torneo.pinned_channel_id) {
      try {
        const channel = await interaction.client.channels.fetch(torneo.pinned_channel_id);
        const snapshots = db.prepare('SELECT * FROM leaderboard_snapshots WHERE tournament_id = ? ORDER BY current_rank ASC').all(torneo.id);
        const text = generateLeaderboardText(snapshots, torneo.name, torneo.edition, formatLastUpdated(new Date().toISOString()), totalCount);
        const msg = await channel.messages.fetch(torneo.pinned_message_id);
        await msg.edit(text);
      } catch (e) {
        console.error('[cargar-resultados] No se pudo editar el mensaje pinneado:', e.message);
      }
    }

    return interaction.editReply(
      `✅ **${actualizados}** traders actualizados | ❓ **${sinVincular.length}** sin vincular` +
      (sinVincular.length ? ` (usá \`/sin-vincular\` para ver la lista)` : '')
    );
  },
};

