-- Jugadores
CREATE TABLE IF NOT EXISTS players (
  discord_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  display_name TEXT,
  elo INTEGER DEFAULT 1200,
  level TEXT DEFAULT 'Rookie',
  racha_actual INTEGER DEFAULT 0,
  top10_count INTEGER DEFAULT 0,
  ever_top10 INTEGER DEFAULT 0,
  last_top10_date TEXT,
  last_active_date TEXT,
  tournaments_played INTEGER DEFAULT 0,
  tournaments_won INTEGER DEFAULT 0,
  best_finish INTEGER,
  total_pnl_sum REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Vinculación correo ↔ Discord
CREATE TABLE IF NOT EXISTS email_links (
  correo TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL,
  linked_at TEXT DEFAULT (datetime('now')),
  linked_by TEXT DEFAULT 'self',
  FOREIGN KEY (discord_id) REFERENCES players(discord_id)
);

-- Torneos
CREATE TABLE IF NOT EXISTS tournaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  edition INTEGER NOT NULL,
  modalidad TEXT NOT NULL,
  capital_inicial REAL NOT NULL,
  status TEXT DEFAULT 'open',
  pinned_message_id TEXT,
  pinned_channel_id TEXT,
  reglas TEXT DEFAULT '',
  total_participants INTEGER DEFAULT 0,
  start_date TEXT DEFAULT (datetime('now')),
  end_date TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Resultados por torneo
CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL,
  discord_id TEXT NOT NULL,
  correo TEXT,
  rank_final INTEGER NOT NULL,
  equidad_final REAL NOT NULL,
  pnl_pct REAL NOT NULL,
  en_negativo INTEGER DEFAULT 0,
  elo_before INTEGER,
  elo_after INTEGER,
  elo_change INTEGER,
  racha_antes INTEGER,
  racha_despues INTEGER,
  uploaded_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
  FOREIGN KEY (discord_id) REFERENCES players(discord_id)
);

-- Snapshots para tabla semi-vivo
CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL,
  discord_id TEXT,
  correo TEXT,
  username TEXT,
  current_rank INTEGER,
  current_equidad REAL,
  current_pnl_pct REAL,
  en_negativo INTEGER DEFAULT 0,
  level_emoji TEXT DEFAULT '🟤',
  pos_change INTEGER DEFAULT 0,
  last_updated TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
);

-- Logros desbloqueados
CREATE TABLE IF NOT EXISTS achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id TEXT NOT NULL,
  logro_id TEXT NOT NULL,
  elo_ganado INTEGER NOT NULL,
  tournament_id INTEGER,
  unlocked_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (discord_id) REFERENCES players(discord_id)
);

-- Votos de predicción por torneo
CREATE TABLE IF NOT EXISTS tournament_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL,
  voter_discord_id TEXT NOT NULL,
  voted_for_discord_id TEXT NOT NULL,
  voted_at TEXT DEFAULT (datetime('now')),
  UNIQUE(tournament_id, voter_discord_id),
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
);

-- Config del servidor
CREATE TABLE IF NOT EXISTS server_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Sistema de apuestas con ELO (hasta 3 apuestas por trader, 20 min entre apuestas)
CREATE TABLE IF NOT EXISTS elo_bets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL,
  bettor_discord_id TEXT NOT NULL,
  target_discord_id TEXT NOT NULL,
  elo_amount INTEGER NOT NULL CHECK(elo_amount IN (10, 25, 50, 100)),
  status TEXT NOT NULL DEFAULT 'pending',
  elo_result INTEGER,
  placed_at TEXT DEFAULT (datetime('now')),
  resolved_at TEXT,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
);

-- Preferencias de notificación por DM
CREATE TABLE IF NOT EXISTS dm_preferences (
  discord_id TEXT PRIMARY KEY,
  notify_on INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Seasons (liga por temporadas)
CREATE TABLE IF NOT EXISTS seasons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  started_at TEXT DEFAULT (datetime('now')),
  ended_at TEXT
);

-- Rankings guardados al cerrar una season
CREATE TABLE IF NOT EXISTS season_rankings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id INTEGER NOT NULL,
  discord_id TEXT NOT NULL,
  rank_position INTEGER NOT NULL,
  final_elo INTEGER NOT NULL,
  final_level TEXT NOT NULL,
  FOREIGN KEY (season_id) REFERENCES seasons(id),
  FOREIGN KEY (discord_id) REFERENCES players(discord_id)
);

-- Desafíos semanales
CREATE TABLE IF NOT EXISTS weekly_challenges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT NOT NULL,
  elo_reward INTEGER NOT NULL DEFAULT 50,
  status TEXT DEFAULT 'active',
  winner_discord_id TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  closed_at TEXT
);
