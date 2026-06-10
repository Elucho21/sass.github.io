const express = require('express');
const multer = require('multer');
const db = require('../../database/db');
const { getLevelEmoji } = require('../../utils/elo');
const { parseCsv, normalizeRows } = require('../../utils/csv');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// POST /api/upload-results
router.post('/upload-results', upload.single('file'), async (req, res) => {
  const torneo = db.prepare("SELECT * FROM tournaments WHERE status = 'active' ORDER BY id DESC LIMIT 1").get();
  if (!torneo) return res.status(400).json({ error: 'No hay torneo activo' });
  if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });

  const rawRows = await parseCsv(req.file.buffer).catch(() => null);
  if (!rawRows || !rawRows.length) return res.status(400).json({ error: 'CSV inválido o vacío' });
  const rows = normalizeRows(rawRows);

  const sinVincular = [];
  let actualizados = 0;

  const updateSnapshot = db.prepare(`
    UPDATE leaderboard_snapshots
    SET discord_id=?, username=?, current_rank=?, current_equidad=?,
        current_pnl_pct=?, en_negativo=?, level_emoji=?, pos_change=?,
        last_updated=datetime('now')
    WHERE tournament_id=? AND correo=?
  `);
  const insertSnapshot = db.prepare(`
    INSERT INTO leaderboard_snapshots
      (tournament_id, discord_id, correo, username, current_rank, current_equidad, current_pnl_pct, en_negativo, level_emoji, pos_change, last_updated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  const process = db.transaction(() => {
    for (const row of rows) {
      const correo = row.correo?.toLowerCase().trim();
      const equidad = parseFloat(row.equidad_actual);
      const rank = parseInt(row.rank, 10);
      if (!correo || isNaN(equidad) || isNaN(rank)) continue;

      const pnl_pct = ((equidad - torneo.capital_inicial) / torneo.capital_inicial) * 100;
      const en_negativo = pnl_pct < 0 ? 1 : 0;

      const link = db.prepare('SELECT * FROM email_links WHERE correo = ?').get(correo);
      let discordId = null, username = row.alias || '—', levelEmoji = '🟤';
      if (link) {
        discordId = link.discord_id;
        const p = db.prepare('SELECT * FROM players WHERE discord_id = ?').get(discordId);
        if (p) { username = p.display_name || p.username; levelEmoji = getLevelEmoji(p.level); }
      } else { sinVincular.push(correo); }

      const prev = db.prepare('SELECT current_rank FROM leaderboard_snapshots WHERE tournament_id=? AND correo=?').get(torneo.id, correo);
      const pos_change = prev ? prev.current_rank - rank : 0;

      if (prev) {
        updateSnapshot.run(discordId, username, rank, equidad, pnl_pct, en_negativo, levelEmoji, pos_change, torneo.id, correo);
      } else {
        insertSnapshot.run(torneo.id, discordId, correo, username, rank, equidad, pnl_pct, en_negativo, levelEmoji, pos_change);
      }
      actualizados++;
    }
  });

  process();

  const total = db.prepare('SELECT COUNT(*) as c FROM leaderboard_snapshots WHERE tournament_id=?').get(torneo.id).c;
  db.prepare('UPDATE tournaments SET total_participants=? WHERE id=?').run(total, torneo.id);
  if (sinVincular.length) {
    db.prepare("INSERT OR REPLACE INTO server_config (key, value) VALUES ('last_csv_unlinked', ?)").run(JSON.stringify(sinVincular));
  }

  res.json({ actualizados, sinVincular: sinVincular.length, total });
});

// POST /api/upload-links
router.post('/upload-links', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
  const rows = await parseCsv(req.file.buffer).catch(() => null);
  if (!rows) return res.status(400).json({ error: 'CSV inválido' });

  let exitosas = 0;
  const errores = [];

  for (const row of rows) {
    const correo = row.correo?.toLowerCase().trim();
    const discordId = row.discord_id?.trim();
    if (!correo || !discordId) { errores.push(`Fila inválida`); continue; }

    db.prepare('INSERT OR IGNORE INTO players (discord_id, username) VALUES (?, ?)').run(discordId, discordId);
    db.prepare('INSERT OR REPLACE INTO email_links (correo, discord_id, linked_by) VALUES (?, ?, \'admin\')').run(correo, discordId);
    exitosas++;
  }

  res.json({ exitosas, errores });
});

module.exports = router;
