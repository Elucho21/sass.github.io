function validateEnv() {
  const required = ['DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID', 'DASHBOARD_TOKEN'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length) {
    console.error(`[Config] Variables de entorno requeridas faltantes: ${missing.join(', ')}`);
    console.error('[Config] Revisa tu archivo .env');
    process.exit(1);
  }
  if (!process.env.JWT_SECRET) {
    const { randomBytes } = require('crypto');
    process.env.JWT_SECRET = randomBytes(32).toString('hex');
    console.warn('[Config] JWT_SECRET no configurado — usando valor temporal. Agrega JWT_SECRET a tu .env para sesiones persistentes.');
  }
}

module.exports = validateEnv;
