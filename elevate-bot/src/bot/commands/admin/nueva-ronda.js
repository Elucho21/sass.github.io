const { SlashCommandBuilder } = require('discord.js');
const db = require('../../../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nueva-ronda')
    .setDescription('[Admin] Creá un nuevo torneo')
    .addStringOption(o => o.setName('nombre').setDescription('Nombre del torneo').setRequired(true))
    .addIntegerOption(o => o.setName('edicion').setDescription('Número de edición').setRequired(true))
    .addStringOption(o =>
      o.setName('modalidad')
        .setDescription('Modalidad del torneo')
        .setRequired(true)
        .addChoices(
          { name: 'Light', value: 'Light' },
          { name: 'Day',   value: 'Day'   },
          { name: 'Month', value: 'Month' },
        )
    )
    .addNumberOption(o => o.setName('capital_inicial').setDescription('Capital inicial (default: 100000 Light/Day, 300000 Month)').setRequired(false)),

  async execute(interaction) {
    if (!interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID)) {
      return interaction.reply({ content: '❌ No tenés permisos de administrador.', ephemeral: true });
    }

    const existing = db.prepare("SELECT id FROM tournaments WHERE status IN ('open','active')").get();
    if (existing) {
      return interaction.reply({ content: '❌ Ya hay un torneo abierto o activo. Cerralo antes de crear uno nuevo.', ephemeral: true });
    }

    const nombre = interaction.options.getString('nombre');
    const edicion = interaction.options.getInteger('edicion');
    const modalidad = interaction.options.getString('modalidad');
    const defaultCapital = modalidad === 'Month' ? 300000 : 100000;
    const capital = interaction.options.getNumber('capital_inicial') ?? defaultCapital;

    db.prepare(`
      INSERT INTO tournaments (name, edition, modalidad, capital_inicial, status)
      VALUES (?, ?, ?, ?, 'open')
    `).run(nombre, edicion, modalidad, capital);

    return interaction.reply({
      content: `✅ Torneo **${nombre} #${edicion}** (${modalidad}) creado con capital $${capital.toLocaleString()}.\nUsá \`/activar\` para iniciarlo.`,
      ephemeral: true,
    });
  },
};
