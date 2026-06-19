const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || './data/elevate.db';
const dbDir = path.dirname(path.resolve(DB_PATH));

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(path.resolve(DB_PATH));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Migración: si elo_bets tiene la constraint UNIQUE antigua, recrear sin ella
try {
  const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='elo_bets'").get();
  if (tableInfo?.sql?.includes('UNIQUE(tournament_id, bettor_discord_id)')) {
    db.exec(`
      CREATE TABLE elo_bets_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_id INTEGER NOT NULL,
        bettor_discord_id TEXT NOT NULL,
        target_discord_id TEXT NOT NULL,
        elo_amount INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        elo_result INTEGER,
        placed_at TEXT DEFAULT (datetime('now')),
        resolved_at TEXT,
        FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
      );
      INSERT INTO elo_bets_new SELECT * FROM elo_bets;
      DROP TABLE elo_bets;
      ALTER TABLE elo_bets_new RENAME TO elo_bets;
    `);
  }
} catch (e) { /* ya migrado o tabla vacía */ }

module.exports = db;
