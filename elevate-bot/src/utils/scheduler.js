const fs = require('fs');
const path = require('path');

let lastChallengeReminderDate = null;

async function postChallengeReminder(client) {
  try {
    const db = require('../database/db');
    const challenge = db.prepare("SELECT * FROM weekly_challenges WHERE status = 'active' ORDER BY id DESC LIMIT 1").get();
    if (!challenge) return;

    const canalId = db.prepare("SELECT value FROM server_config WHERE key = 'canal_ascensos'").get()?.value
      || process.env.CHANNEL_ASCENSOS_LOGROS;
    if (!canalId || !client?.isReady()) return;

    const { EmbedBuilder } = require('discord.js');
    const ch = await client.channels.fetch(canalId);
    await ch.send({
      embeds: [new EmbedBuilder()
        .setColor(0xF59E0B)
        .setTitle('⚡ Recordatorio: Desafío de la Semana')
        .setDescription(`**${challenge.description}**`)
        .addFields({ name: '🎯 Premio', value: `+${challenge.elo_reward} ELO`, inline: true })
        .setTimestamp()],
    });
    console.log('[Scheduler] Recordatorio de desafío publicado');
  } catch (e) {
    console.error('[Scheduler] Error al postear recordatorio de desafío:', e.message);
  }
}

function startScheduler(client) {
  // Heartbeat cada hora + recordatorio de desafío los lunes
  setInterval(async () => {
    const now = new Date();
    console.log(`[Scheduler] Heartbeat: ${now.toISOString()}`);

    // Recordatorio de desafío activo: lunes a las 9 AM UTC
    const isMonday = now.getUTCDay() === 1;
    const isNineAM = now.getUTCHours() === 9;
    const today = now.toISOString().split('T')[0];
    if (isMonday && isNineAM && lastChallengeReminderDate !== today) {
      lastChallengeReminderDate = today;
      await postChallengeReminder(client);
    }
  }, 60 * 60 * 1000);

  // Backup automático de la base de datos cada 24 horas
  const runBackup = () => {
    try {
      const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/elevate.db');
      if (!fs.existsSync(dbPath)) return;

      const backupDir = path.join(path.dirname(dbPath), 'backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

      const dateStr = new Date().toISOString().split('T')[0];
      const backupPath = path.join(backupDir, `elevate_${dateStr}.db`);
      fs.copyFileSync(dbPath, backupPath);
      console.log(`[Scheduler] Backup creado: ${backupPath}`);

      // Eliminar backups de más de 7 días
      const files = fs.readdirSync(backupDir).filter(f => f.startsWith('elevate_') && f.endsWith('.db'));
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      for (const file of files) {
        const filePath = path.join(backupDir, file);
        try {
          const stat = fs.statSync(filePath);
          if (stat.mtimeMs < cutoff) {
            fs.unlinkSync(filePath);
            console.log(`[Scheduler] Backup antiguo eliminado: ${file}`);
          }
        } catch (e) { /* skip */ }
      }
    } catch (err) {
      console.error('[Scheduler] Error en backup:', err.message);
    }
  };

  // Primer backup 5 min después del arranque, luego cada 24h
  setTimeout(runBackup, 5 * 60 * 1000);
  setInterval(runBackup, 24 * 60 * 60 * 1000);
}

module.exports = { startScheduler };
