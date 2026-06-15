const express = require('express');
const multer = require('multer');
const router = express.Router();
const db = require('../../database/db');
const { parseCsv, normalizeRows } = require('../../utils/csv');
const { generateLeaderboardText, formatLastUpdated } = require('../../utils/leaderboard');
const { getLevelEmoji } = require('../../utils/elo');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// POST /api/webhook/upload-csv — versión HTTP del comando /cargar-resultados
router.post('/upload-csv', upload.single('archivo'), async (req, res) => {
  try {
    const torneoId = req.body.torneo_id ? parseInt(req.body.torneo_id) : null;
    const torneo = torneoId
      ? db.prepare("SELECT * FROM tournaments WHERE id = ? AND status IN ('active', 'loading')").get(torneoId)
      : db.prepare("SELECT * FROM tournaments WHERE status IN ('active', 'loading') ORDER BY id DESC LIMIT 1").get();

    if (!torneo) return res.status(404).json({ error: 'No hay torneo activo' });
    if (!req.file) return res.status(400).json({ error: 'Se requiere el archivo CSV (campo: archivo)' });

    const rawRows = await parseCsv(req.file.buffer);
    const rows = normalizeRows(rawRows);
    if (!rows.length) return res.status(400).json({ error: 'El CSV no contiene filas válidas' });

    const sinVincular = [];
    let actualizados = 0;

    const processRows = db.transaction(() => {
      for (const row of rows) {
        const correo = row.correo?.toLowerCase()?.trim();
        if (!correo) continue;
        const equidad = parseFloat(row.equidad_actual);
        if (isNaN(equidad)) continue;
        const rankNum = parseInt(row.rank) || 0;
        const pnl_pct = torneo.capital_inicial > 0
          ? ((equidad - torneo.capital_inicial) / torneo.capital_inicial) * 100
          : 0;
        const enNegativo = pnl_pct < 0 ? 1 : 0;

        const link = db.prepare('SELECT * FROM email_links WHERE correo = ?').get(correo);
        let discordId = link?.discord_id || null;
        let username = row.alias || correo;
        let levelEmoji = '🟤';

        if (discordId) {
          const player = db.prepare('SELECT * FROM players WHERE discord_id = ?').get(discordId);
          if (player) {
            username = player.display_name || player.username;
            levelEmoji = getLevelEmoji(player.level);
          }
        } else {
          sinVincular.push(correo);
        }

        const existing = db.prepare(
          'SELECT id, current_rank FROM leaderboard_snapshots WHERE tournament_id = ? AND (correo = ? OR (discord_id IS NOT NULL AND discord_id = ?))'
        ).get(torneo.id, correo, discordId || '');

        if (existing) {
          db.prepare(`
            UPDATE leaderboard_snapshots SET
              discord_id = ?, username = ?, current_rank = ?, current_equidad = ?,
              current_pnl_pct = ?, en_negativo = ?, level_emoji = ?,
              pos_change = ? - ?,
              last_updated = datetime('now')
            WHERE id = ?
          `).run(discordId, username, rankNum, equidad, pnl_pct, enNegativo, levelEmoji, existing.current_rank, rankNum, existing.id);
        } else {
          db.prepare(`
            INSERT INTO leaderboard_snapshots
              (tournament_id, discord_id, correo, username, current_rank, current_equidad, current_pnl_pct, en_negativo, level_emoji, pos_change)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
          `).run(torneo.id, discordId, correo, username, rankNum, equidad, pnl_pct, enNegativo, levelEmoji);
        }
        actualizados++;
      }
    });

    processRows();

    const totalCount = db.prepare('SELECT COUNT(*) as c FROM leaderboard_snapshots WHERE tournament_id = ?').get(torneo.id).c;
    db.prepare('UPDATE tournaments SET total_participants = ? WHERE id = ?').run(totalCount, torneo.id);

    if (sinVincular.length) {
      db.prepare("INSERT OR REPLACE INTO server_config (key, value) VALUES ('last_csv_unlinked', ?)").run(JSON.stringify(sinVincular));
    }

    // Actualizar mensaje fijado si hay cliente Discord disponible
    const discordClient = req.app.locals.discordClient;
    if (discordClient && torneo.pinned_message_id && torneo.pinned_channel_id) {
      try {
        const snapshots = db.prepare('SELECT * FROM leaderboard_snapshots WHERE tournament_id = ? ORDER BY current_rank ASC').all(torneo.id);
        const text = generateLeaderboardText(snapshots, torneo.name, torneo.edition, formatLastUpdated(new Date().toISOString()), totalCount);
        const channel = await discordClient.channels.fetch(torneo.pinned_channel_id);
        const msg = await channel.messages.fetch(torneo.pinned_message_id);
        await msg.edit(text);
      } catch (e) { /* canal no disponible */ }
    }

    res.json({ ok: true, actualizados, sin_vincular: sinVincular.length, total_participantes: totalCount, torneo_id: torneo.id });
  } catch (err) {
    console.error('[Webhook] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
