require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('./middleware/auth');

function startDashboard(discordClient) {
  const app = express();
  const PORT = process.env.DASHBOARD_PORT || 3000;

  if (discordClient) app.locals.discordClient = discordClient;

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({
    origin: process.env.DASHBOARD_ORIGIN || '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  }));
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  // Endpoints públicos
  app.get('/health', (req, res) => {
    const client = app.locals.discordClient;
    res.json({
      status: 'ok',
      bot: client?.isReady() ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/ping', (req, res) => {
    const client = app.locals.discordClient;
    res.json({ ok: true, botReady: !!(client?.isReady()) });
  });

  // Auth con rate limiting (no requiere auth previo)
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
  app.use('/api/auth', authLimiter);
  app.use('/api/auth', require('./routes/auth'));

  // Rutas protegidas
  app.use('/api', requireAuth);

  app.use('/api', require('./routes/upload'));
  app.use('/api/tournament', require('./routes/tournament'));
  app.use('/api/players', require('./routes/players'));
  app.use('/api/player', require('./routes/players'));
  app.use('/api/unlinked', require('./routes/players'));
  app.use('/api/webhook', require('./routes/webhook'));

  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  app.listen(PORT, () => {
    console.log(`[Dashboard] Servidor corriendo en http://localhost:${PORT}`);
  });

  return app;
}

if (require.main === module) {
  startDashboard(null);
}

module.exports = startDashboard;
