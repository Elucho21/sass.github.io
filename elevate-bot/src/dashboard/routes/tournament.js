const express = require('express');
const db = require('../../database/db');
const { generateLeaderboardText, formatLastUpdated } = require('../../utils/leaderboard');
const router = express.Router();

// GET /api/tournament/active
router.get('/active', (req, res) => {
  const torneo = db.prepare("SELECT * FROM tournaments WHERE status IN ('active','open') ORDER BY id DESC LIMIT 1").get();
  if (!torneo) return res.json(null);
  res.json(torneo);
});

// POST /api/tournament/new
router.post('/new', (req, res) => {
  const { name, edition, modalidad, capital_inicial } = req.body;
  if (!name || !edition || !modalidad) return res.status(400).json({ error: 'Faltan campos requeridos' });

  const existing = db.prepare("SELECT id FROM tournaments WHERE status IN ('open','active')").get();
  if (existing) return res.status(400).json({ error: 'Ya existe un torneo abierto o activo' });

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
router.post('/close', (req, res) => {
  const torneo = db.prepare("SELECT * FROM tournaments WHERE status = 'active' ORDER BY id DESC LIMIT 1").get();
  if (!torneo) return res.status(400).json({ error: 'No hay torneo activo' });
  db.prepare("UPDATE tournaments SET status = 'closed', end_date = datetime('now') WHERE id = ?").run(torneo.id);
  res.json({ message: 'Torneo cerrado (solo status — sin calcular ELO; usá /cerrar-torneo en Discord)' });
});

// GET /api/leaderboard/:tid
router.get('/leaderboard/:tid', (req, res) => {
  const snapshots = db.prepare(`
    SELECT * FROM leaderboard_snapshots WHERE tournament_id = ? ORDER BY current_rank ASC
  `).all(req.params.tid);
  res.json(snapshots);
});

module.exports = router;
