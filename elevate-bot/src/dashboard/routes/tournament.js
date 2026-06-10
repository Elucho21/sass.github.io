const express = require('express');
const multer = require('multer');
const db = require('../../database/db');
const { generateLeaderboardText, formatLastUpdated } = require('../../utils/leaderboard');
const { parseCsv, normalizeRows } = require('../../utils/csv');
const { getLevelEmoji } = require('../../utils/elo');
const { closeTournamentWithElo } = require('../../utils/tournament-close');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// GET /api/tournament/active
router.get('/active', (req, res) => {
  const torneo = db.prepare("SELECT * FROM tournaments WHERE status IN ('active','open') ORDER BY id DESC LIMIT 1").get();
  if (!torneo) return res.json(null);
  res.json(torneo);
});

// GET /api/tournament/list
router.get('/list', (req, res) => {
  const torneos = db.prepare(`
    SELECT t.*,
      (SELECT COUNT(*) FROM leaderboard_snapshots WHERE tournament_id = t.id) as snapshot_count,
      (SELECT COUNT(*) FROM results WHERE tournament_id = t.id) as results_count
    FROM tournaments t
    ORDER BY t.id DESC
  `).all();
  res.json(torneos);
});

// POST /api/tournament/new
router.post('/new', (req, res) => {
  const { name, edition, modalidad, capital_inicial, historico } = req.body;
  if (!name || !edition || !modalidad) return res.status(400).json({ error: 'Faltan campos requeridos' });

  if (!historico) {
    const existing = db.prepare("SELECT id FROM tournaments WHERE status IN ('open','active')").get();
    if (existing) return res.status(400).json({ error: 'Ya existe un torneo abierto o activo' });
  }

  const capital = capital_inicial || (modalidad === 'Month' ? 300000 : 100000);
  const result = db.prepare(`
    INSERT INTO tournaments (name, edition, modalidad, capital_inicial) VALUES (?, ?, ?, ?)
  `).run(name, edition, modalidad, capital);

  res.json({ id: result.lastInsertRowid, message: 'Torneo creado' });
});

// POST /api/tournament/activate
router.post('/activate', async (req, res) => {
  const active = db.prepare("SELECT id FROM tournaments WHERE status = 'active'").get();
  if (active) return res.status(400).json({ error: 'Ya hay un torneo activo' });

  const torneo = db.prepare("SELECT * FROM tournaments WHERE status = 'open' ORDER BY id DESC LIMIT 1").get();
  if (!torneo) return res.status(400).json({ error: 'No hay torneo abierto para activar' });

  let pinnedMessageId = null;
  let pinnedChannelId = null;
  let pinnedOk = false;

  const discordClient = req.app.locals.discordClient;
  if (discordClient) {
    try {
      const canalConfig = db.prepare("SELECT value FROM server_config WHERE key = 'canal_tabla'").get();
      const canalId = canalConfig?.value || process.env.CHANNEL_TABLA;
      if (canalId) {
        const channel = await discordClient.channels.fetch(canalId);
        const text = generateLeaderboardText([], torneo.name, torneo.edition, formatLastUpdated(new Date().toISOString()), 0);
        const msg = await channel.send(text);
        await msg.pin().catch(() => {});
        pinnedMessageId = msg.id;
        pinnedChannelId = channel.id;
        pinnedOk = true;
      }
    } catch (e) {
      console.error('[dashboard/activate] Error publicando tabla:', e.message);
    }
  }

  db.prepare(`
    UPDATE tournaments SET status = 'active', pinned_message_id = ?, pinned_channel_id = ? WHERE id = ?
  `).run(pinnedMessageId, pinnedChannelId, torneo.id);

  res.json({
    message: `Torneo ${torneo.name} #${torneo.edition} activado`,
    pinnedMessage: pinnedOk,
  });
});

// POST /api/tournament/close
// Cierra el torneo activo (o el especificado por torneo_id) Y calcula ELO
router.post('/close', async (req, res) => {
  const { torneo_id } = req.body || {};

  const torneo = torneo_id
    ? db.prepare("SELECT * FROM tournaments WHERE id = ? AND status != 'closed'").get(torneo_id)
    : db.prepare("SELECT * FROM tournaments WHERE status = 'active' ORDER BY id DESC LIMIT 1").get();

  if (!torneo) return res.status(400).json({ error: torneo_id ? `Torneo ${torneo_id} no encontrado o ya cerrado` : 'No hay torneo activo' });

  try {
    const result = await closeTournamentWithElo(torneo.id, null);
    res.json({ message: `Torneo cerrado. ELO calculado para ${result.procesados} traders.`, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tournament/upload-and-close  — flujo histórico de un solo paso
// multipart/form-data: fields { name, edition, modalidad, capital_inicial } + file (CSV)
router.post('/upload-and-close', upload.single('file'), async (req, res) => {
  const { name, edition, modalidad, capital_inicial, torneo_id } = req.body;

  let torneo;

  if (torneo_id) {
    // Torneo ya creado — solo cargar y cerrar
    torneo = db.prepare("SELECT * FROM tournaments WHERE id = ? AND status != 'closed'").get(Number(torneo_id));
    if (!torneo) return res.status(400).json({ error: `Torneo ${torneo_id} no encontrado o ya cerrado` });
  } else {
    // Crear el torneo histórico
    if (!name || !edition || !modalidad) return res.status(400).json({ error: 'Faltan nombre, edición o modalidad' });
    const capital = parseFloat(capital_inicial) || (modalidad === 'Month' ? 300000 : 100000);

    // Reutilizar si ya existe un torneo sin cerrar con los mismos datos (evita duplicados por reintentos)
    const existente = db.prepare(
      "SELECT * FROM tournaments WHERE name=? AND edition=? AND modalidad=? AND status != 'closed'"
    ).get(name, edition, modalidad);

    if (existente) {
      torneo = existente;
    } else {
      // Usar status 'loading' para que no interfiera con el torneo activo mientras se procesa
      const ins = db.prepare(`
        INSERT INTO tournaments (name, edition, modalidad, capital_inicial, status) VALUES (?, ?, ?, ?, 'loading')
      `).run(name, edition, modalidad, capital);
      torneo = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(ins.lastInsertRowid);
    }
  }

  // Procesar CSV si viene archivo
  if (req.file) {
    const rawRows = await parseCsv(req.file.buffer).catch(() => null);
    if (!rawRows || !rawRows.length) return res.status(400).json({ error: 'CSV inválido o vacío' });
    const rows = normalizeRows(rawRows);

    const updateSnap = db.prepare(`
      UPDATE leaderboard_snapshots
      SET discord_id=?, username=?, current_rank=?, current_equidad=?, current_pnl_pct=?,
          en_negativo=?, level_emoji=?, pos_change=0, last_updated=datetime('now')
      WHERE tournament_id=? AND correo=?
    `);
    const insertSnap = db.prepare(`
      INSERT INTO leaderboard_snapshots
        (tournament_id, discord_id, correo, username, current_rank, current_equidad, current_pnl_pct,
         en_negativo, level_emoji, pos_change, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))
    `);

    const loadCsv = db.transaction(() => {
      for (const row of rows) {
        const correo = (row.correo || '').toLowerCase().trim();
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
        }

        const existing = db.prepare('SELECT id FROM leaderboard_snapshots WHERE tournament_id=? AND correo=?').get(torneo.id, correo);
        if (existing) {
          updateSnap.run(discordId, username, rank, equidad, pnl_pct, en_negativo, levelEmoji, torneo.id, correo);
        } else {
          insertSnap.run(torneo.id, discordId, correo, username, rank, equidad, pnl_pct, en_negativo, levelEmoji);
        }
      }
    });
    loadCsv();

    const total = db.prepare('SELECT COUNT(*) as c FROM leaderboard_snapshots WHERE tournament_id=?').get(torneo.id).c;
    db.prepare('UPDATE tournaments SET total_participants=? WHERE id=?').run(total, torneo.id);
  }

  // Calcular ELO y cerrar
  try {
    const result = await closeTournamentWithElo(torneo.id, null);
    res.json({
      torneoId: torneo.id,
      torneo: `${torneo.name} #${torneo.edition}`,
      message: `Torneo procesado. ELO calculado para ${result.procesados} traders.`,
      ...result,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tournament/:id — elimina torneo + snapshots + results (no permite borrar torneos activos)
router.delete('/:id', (req, res) => {
  const torneo = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(Number(req.params.id));
  if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });
  if (torneo.status === 'active') return res.status(400).json({ error: 'No se puede eliminar el torneo activo' });

  db.prepare('DELETE FROM leaderboard_snapshots WHERE tournament_id = ?').run(torneo.id);
  db.prepare('DELETE FROM results WHERE tournament_id = ?').run(torneo.id);
  db.prepare('DELETE FROM achievements WHERE tournament_id = ?').run(torneo.id);
  db.prepare('DELETE FROM tournaments WHERE id = ?').run(torneo.id);

  res.json({ message: `Torneo ${torneo.name} #${torneo.edition} eliminado` });
});

// GET /api/leaderboard/:tid
router.get('/leaderboard/:tid', (req, res) => {
  const snapshots = db.prepare(`
    SELECT * FROM leaderboard_snapshots WHERE tournament_id = ? ORDER BY current_rank ASC
  `).all(req.params.tid);
  res.json(snapshots);
});

module.exports = router;
