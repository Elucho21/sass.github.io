const express = require('express');
const db = require('../../database/db');
const router = express.Router();

// GET /api/players — lista todos los jugadores vinculados con sus correos
router.get('/', (req, res) => {
  const players = db.prepare(`
    SELECT
      p.discord_id, p.username, p.display_name, p.elo, p.level,
      p.tournaments_played, p.tournaments_won, p.best_finish,
      p.racha_actual, p.top10_count, p.created_at,
      GROUP_CONCAT(el.correo, ', ') as correos
    FROM players p
    LEFT JOIN email_links el ON el.discord_id = p.discord_id
    GROUP BY p.discord_id
    ORDER BY p.elo DESC
  `).all();
  res.json(players);
});

// GET /api/players/search?q=  — DEBE estar antes de /:discord_id
router.get('/search', (req, res) => {
  const q = `%${req.query.q || ''}%`;
  const players = db.prepare(`
    SELECT p.*, el.correo FROM players p
    LEFT JOIN email_links el ON el.discord_id = p.discord_id
    WHERE p.username LIKE ? OR p.display_name LIKE ? OR el.correo LIKE ?
    LIMIT 20
  `).all(q, q, q);
  res.json(players);
});

// GET /api/player/:discord_id
router.get('/:discord_id', (req, res) => {
  const player = db.prepare('SELECT * FROM players WHERE discord_id = ?').get(req.params.discord_id);
  if (!player) return res.status(404).json({ error: 'Jugador no encontrado' });

  const results = db.prepare(`
    SELECT r.*, t.name as torneo_name, t.edition, t.modalidad
    FROM results r JOIN tournaments t ON t.id = r.tournament_id
    WHERE r.discord_id = ?
    ORDER BY r.uploaded_at DESC
  `).all(player.discord_id);

  const achievements = db.prepare('SELECT * FROM achievements WHERE discord_id = ? ORDER BY unlocked_at DESC').all(player.discord_id);
  const emails = db.prepare('SELECT correo FROM email_links WHERE discord_id = ?').all(player.discord_id);

  res.json({ ...player, results, achievements, emails });
});

// POST /api/player/link — vincula un correo a un Discord ID sin necesitar CSV
router.post('/link', (req, res) => {
  const { correo, discord_id, username } = req.body;
  if (!correo || !discord_id) return res.status(400).json({ error: 'Faltan correo y/o discord_id' });

  const correoNorm = correo.toLowerCase().trim();

  const existing = db.prepare('SELECT * FROM players WHERE discord_id = ?').get(discord_id);
  const wasNew = !existing;
  if (wasNew) {
    const displayName = username?.trim() || discord_id;
    db.prepare('INSERT OR IGNORE INTO players (discord_id, username, display_name) VALUES (?, ?, ?)').run(discord_id, displayName, displayName);
  }

  db.prepare("INSERT OR REPLACE INTO email_links (correo, discord_id, linked_by) VALUES (?, ?, 'admin')").run(correoNorm, discord_id);

  const player = db.prepare('SELECT * FROM players WHERE discord_id = ?').get(discord_id);
  const { getLevelEmoji } = require('../../utils/elo');
  db.prepare(`
    UPDATE leaderboard_snapshots
    SET discord_id = ?, username = ?, level_emoji = ?
    WHERE correo = ? AND discord_id IS NULL
  `).run(discord_id, player.display_name || player.username, getLevelEmoji(player.level), correoNorm);

  res.json({ ok: true, correo: correoNorm, discord_id, wasNew });
});

// GET /api/unlinked/:tid
router.get('/unlinked/:tid', (req, res) => {
  const config = db.prepare("SELECT value FROM server_config WHERE key = 'last_csv_unlinked'").get();
  if (!config) return res.json([]);
  try {
    res.json(JSON.parse(config.value));
  } catch {
    res.json([]);
  }
});

module.exports = router;

