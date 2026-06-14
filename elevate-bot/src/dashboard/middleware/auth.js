const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    req.user = payload;
    return next();
  } catch (e) {
    // Compatibilidad hacia atrás: aceptar el DASHBOARD_TOKEN estático directamente
    if (process.env.DASHBOARD_TOKEN && token === process.env.DASHBOARD_TOKEN) {
      req.user = { role: 'admin' };
      return next();
    }
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

module.exports = { requireAuth };
