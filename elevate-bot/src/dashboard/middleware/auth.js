function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  const token = authHeader.slice(7);
  if (token !== process.env.DASHBOARD_TOKEN) {
    return res.status(401).json({ error: 'Token inválido' });
  }
  next();
}

module.exports = { requireAuth };
