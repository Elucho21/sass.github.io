const { startScheduler } = require('../../utils/scheduler');

module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    console.log(`[Bot] Conectado como ${client.user.tag}`);
    client.user.setActivity('Torneos Elevate', { type: 3 });
    startScheduler(client);
  },
};
