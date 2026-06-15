const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../../database/db');
const { LEVELS, getLevelEmoji, getRachaMultiplier } = require('../../../utils/elo');
const { LOGROS } = require('../../../utils/achievements');

const INACTIVIDAD_RESET_DIAS = 365;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('progreso')
    .setDescription('Mostrá tu avance hacia el próximo nivel, logros en progreso y racha'),

  async execute(interaction) {
    const player = db.prepare('SELECT * FROM players WHERE discord_id = ?').get(interaction.user.id);
    if (!player) {
      return interaction.reply({ content: '❌ No estás registrado. Usá `/vincular` primero.', ephemeral: true });
    }

    const levelEmoji = getLevelEmoji(player.level);

    // --- Próximo nivel ---
    const levelEntries = Object.entries(LEVELS).sort((a, b) => a[1].min - b[1].min);
    const currentIdx = levelEntries.findIndex(([name]) => name === player.level);
    const nextLevel = levelEntries[currentIdx + 1];
    const eloGap = nextLevel ? nextLevel[1].min - player.elo : 0;
    const proximoNivel = nextLevel
      ? `${getLevelEmoji(nextLevel[0])} **${nextLevel[0]}** — faltan **${eloGap} ELO** (${player.elo} / ${nextLevel[1].min})`
      : `${levelEmoji} Nivel máximo alcanzado — eres **Legend** 🔴`;

    // --- Logros desbloqueados ---
    const unlockedIds = new Set(
      db.prepare('SELECT logro_id FROM achievements WHERE discord_id = ?').all(player.discord_id).map(a => a.logro_id)
    );

    // --- Best PnL para logros de tipo pnl ---
    const bestPnlRow = db.prepare('SELECT MAX(pnl_pct) as best FROM results WHERE discord_id = ?').get(player.discord_id);
    const bestPnl = bestPnlRow?.best ?? 0;

    // Logros en progreso (solo los no desbloqueados)
    const enProgreso = LOGROS.filter(l => !unlockedIds.has(l.id));

    const makeBar = (current, total, blocks = 10) => {
      const filled = Math.min(blocks, Math.floor((current / total) * blocks));
      return '✅'.repeat(filled) + '⬜'.repeat(blocks - filled);
    };

    const logroLines = enProgreso.slice(0, 6).map(l => {
      if (l.tipo === 'top10') {
        const pct = Math.min(100, Math.floor((player.top10_count / l.umbral) * 100));
        return `${l.nombre} — ${player.top10_count}/${l.umbral}\n${makeBar(player.top10_count, l.umbral)} ${pct}%`;
      } else {
        const pct = Math.min(100, Math.floor((bestPnl / l.umbral) * 100));
        return `${l.nombre} — Mejor: ${bestPnl >= 0 ? '+' : ''}${bestPnl.toFixed(1)}% / ${l.umbral}%\n${makeBar(bestPnl, l.umbral)} ${pct}%`;
      }
    });

    if (enProgreso.length === 0) {
      logroLines.push('🏆 ¡Tenés todos los logros desbloqueados!');
    }

    // --- Racha ---
    const racha = player.racha_actual;
    let rachaStr;
    if (racha >= 3) {
      const mul = getRachaMultiplier(racha);
      rachaStr = `🔥 **+${racha} consecutivos** — bonus ×${mul.toFixed(2)} en ganancias ELO`;
    } else if (racha === 2) {
      rachaStr = `🔥 **+2 consecutivos** — un Top10 más y tu bonus sube a ×1.20`;
    } else if (racha === 1) {
      rachaStr = `🔥 **+1** — un Top10 más y activás el bonus de racha (×1.10)`;
    } else if (racha === 0) {
      rachaStr = `— Sin racha activa`;
    } else {
      rachaStr = `❄️ **${racha} racha negativa** — quebrá la racha con un Top10`;
    }

    // --- Inactividad ---
    let inactividadWarning = '';
    if (player.last_active_date) {
      const diffMs = Date.now() - new Date(player.last_active_date).getTime();
      const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const diasRestantes = INACTIVIDAD_RESET_DIAS - diffDias;
      if (diasRestantes <= 60 && diasRestantes > 0) {
        inactividadWarning = `\n\n⚠️ **Atención:** Solo quedan **${diasRestantes} días** antes de que tu contador ever_top10 se resetee por inactividad.`;
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0x7C3AED)
      .setTitle(`${levelEmoji} Progreso de ${player.display_name || player.username}`)
      .addFields(
        { name: '📈 Próximo nivel',      value: proximoNivel,          inline: false },
        { name: '🔥 Racha actual',       value: rachaStr,               inline: false },
        { name: `🏅 Logros en progreso (${unlockedIds.size}/${LOGROS.length} desbloqueados)`,
          value: logroLines.join('\n\n') || '—',
          inline: false },
      )
      .setFooter({ text: `ELO actual: ${player.elo} · Top 10 total: ${player.top10_count}${inactividadWarning}` })
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
