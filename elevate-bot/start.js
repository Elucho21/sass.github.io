require('dotenv').config();
const validateEnv = require('./src/utils/validateEnv');
validateEnv();

require('./src/bot/index.js');
require('./src/dashboard/server.js');
