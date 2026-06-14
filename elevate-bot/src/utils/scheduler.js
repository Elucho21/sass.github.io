const fs = require('fs');
const path = require('path');

function startScheduler(client) {
  // Heartbeat cada hora
  setInterval(() => {
    console.log(`[Scheduler] Heartbeat: ${new Date().toISOString()}`);
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
