require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const path = require('path');
const fs = require('fs');

// Inicializar DB al arrancar
require('../database/db');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
});

client.commands = new Collection();

// Cargar comandos de traders
const traderDir = path.join(__dirname, 'commands', 'traders');
for (const file of fs.readdirSync(traderDir).filter(f => f.endsWith('.js'))) {
  const cmd = require(path.join(traderDir, file));
  client.commands.set(cmd.data.name, cmd);
}

// Cargar comandos de admin
const adminDir = path.join(__dirname, 'commands', 'admin');
for (const file of fs.readdirSync(adminDir).filter(f => f.endsWith('.js'))) {
  const cmd = require(path.join(adminDir, file));
  client.commands.set(cmd.data.name, cmd);
}

// Cargar eventos
const eventsDir = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsDir).filter(f => f.endsWith('.js'))) {
  const event = require(path.join(eventsDir, file));
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
}

client.once('ready', () => {
  const startDashboard = require('../dashboard/server');
  startDashboard(client);
});

client.login(process.env.DISCORD_TOKEN);
