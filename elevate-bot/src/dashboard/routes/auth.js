const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

// POST /api/auth/login — intercambia DASHBOARD_TOKEN por JWT (8h)
router.post('/login', (req, res) => {
  const { token } = req.body;
  if (!token || token !== process.env.DASHBOARD_TOKEN) {
    return res.status(401).json({ error: 'Token inválido' });
  }
  const jwtToken = jwt.sign(
    { role: 'admin' },
    process.env.JWT_SECRET || 'fallback-secret',
    { expiresIn: '8h' }
  );
  res.json({ token: jwtToken, expiresIn: 28800 });
});

module.exports = router;
