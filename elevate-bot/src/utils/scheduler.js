// Placeholder para tareas programadas (recordatorios, limpieza, etc.)
function startScheduler(client) {
  // Intervalo de ejemplo: log de heartbeat cada hora
  setInterval(() => {
    const now = new Date().toISOString();
    console.log(`[Scheduler] Heartbeat: ${now}`);
  }, 60 * 60 * 1000);
}

module.exports = { startScheduler };
