const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const db = require('../../../database/db');
const { LEVELS } = require('../../../utils/elo');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ayuda')
    .setDescription('Mostrá el menú de ayuda de Elevate Bot'),

  async execute(interaction) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ayuda_registro').setLabel('¿Cómo me registro?').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ayuda_elo').setLabel('¿Qué es el ELO?').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ayuda_mejorar').setLabel('¿Cómo mejorar?').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ayuda_rangos').setLabel('Rangos y beneficios').setStyle(ButtonStyle.Secondary),
    );
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ayuda_reglas').setLabel('Reglas del torneo').setStyle(ButtonStyle.Primary),
    );

    const embed = new EmbedBuilder()
      .setColor(0x7C3AED)
      .setTitle('📚 Ayuda — Elevate Bot')
      .setDescription('Seleccioná un tema para ver más información.')
      .setTimestamp();

    return interaction.reply({ embeds: [embed], components: [row, row2], ephemeral: true });
  },

  async handleButton(interaction) {
    const id = interaction.customId;

    if (id === 'ayuda_registro') {
      return interaction.reply({
        content: `**¿Cómo me registro?**\n1. Registrate en Impulse World y anotá el correo que usaste.\n2. Usá \`/vincular [correo]\` en este servidor.\n3. Listo — tu perfil queda creado automáticamente con ELO 1200.\n\n🔗 Formulario: https://impulseworld.net`,
        ephemeral: true,
      });
    }

    if (id === 'ayuda_elo') {
      return interaction.reply({
        content: `**¿Qué es el ELO?**\nEl ELO es un sistema de puntos que refleja tu rendimiento histórico en los torneos Elevate.\n\n• Subís ELO terminando bien rankeado.\n• Bajás ELO si quedás abajo o en negativo.\n• Las rachas positivas/negativas multiplican los cambios.\n• La primera vez que entrás al Top 10 recibís un bono de 50 ELO.`,
        ephemeral: true,
      });
    }

    if (id === 'ayuda_mejorar') {
      return interaction.reply({
        content: `**¿Cómo mejorar tu nivel?**\n• Participá consistentemente en los torneos.\n• Evitá cerrar operaciones en negativo.\n• Armá rachas positivas (Top 10 consecutivos) para multiplicar tus ganancias de ELO.\n• Los logros de PnL +10/15/20/30% suman ELO adicional.`,
        ephemeral: true,
      });
    }

    if (id === 'ayuda_rangos') {
      const rows = Object.entries(LEVELS).map(([name, cfg]) =>
        `${cfg.emoji} **${name}** — ${cfg.min} a ${cfg.max === 99999 ? '∞' : cfg.max} ELO`
      ).join('\n');
      return interaction.reply({
        content: `**Rangos y ELO requerido:**\n${rows}`,
        ephemeral: true,
      });
    }

    if (id === 'ayuda_reglas') {
      const torneo = db.prepare("SELECT reglas FROM tournaments WHERE status IN ('active','open') ORDER BY id DESC LIMIT 1").get();
      const reglas = torneo?.reglas || 'No hay reglas configuradas para el torneo actual.';
      return interaction.reply({ content: `**Reglas del torneo:**\n${reglas}`, ephemeral: true });
    }
  },
};
