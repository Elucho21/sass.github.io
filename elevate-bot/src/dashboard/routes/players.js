const express = require('express');
const db = require('../../database/db');
const router = express.Router();

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

// GET /api/players/search?q=
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
