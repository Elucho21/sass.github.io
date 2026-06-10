require('dotenv').config();
const express = require('express');
const path = require('path');
const { requireAuth } = require('./middleware/auth');

function startDashboard(discordClient) {
  const app = express();
  const PORT = process.env.DASHBOARD_PORT || 3000;

  // Hacer el Discord client disponible para los routes
  if (discordClient) app.locals.discordClient = discordClient;

  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  app.use('/api', requireAuth);

  app.use('/api', require('./routes/upload'));
  app.use('/api/tournament', require('./routes/tournament'));
  app.use('/api/players', require('./routes/players'));
  app.use('/api/player', require('./routes/players'));
  app.use('/api/unlinked', require('./routes/players'));

  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  app.listen(PORT, () => {
    console.log(`[Dashboard] Servidor corriendo en http://localhost:${PORT}`);
  });

  return app;
}

// Soporte para arranque standalone (node src/dashboard/server.js)
if (require.main === module) {
  startDashboard(null);
}

module.exports = startDashboard;
