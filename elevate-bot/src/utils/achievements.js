const LOGROS = [
  { id: 'top1',   tipo: 'top10', umbral: 1,   nombre: '🏅 Primera vez en Top 10',  tier: 'Pro',    elo: 20, roleEnv: 'ROLE_LOGRO_TOP1'   },
  { id: 'top5',   tipo: 'top10', umbral: 5,   nombre: '🥈 5 veces en Top 10',       tier: 'Pro',    elo: 20, roleEnv: 'ROLE_LOGRO_TOP5'   },
  { id: 'top10',  tipo: 'top10', umbral: 10,  nombre: '🥇 10 veces en Top 10',      tier: 'Pro',    elo: 20, roleEnv: 'ROLE_LOGRO_TOP10'  },
  { id: 'top25',  tipo: 'top10', umbral: 25,  nombre: '💎 25 veces en Top 10',      tier: 'Elite',  elo: 35, roleEnv: 'ROLE_LOGRO_TOP25'  },
  { id: 'top50',  tipo: 'top10', umbral: 50,  nombre: '👑 50 veces en Top 10',      tier: 'Master', elo: 60, roleEnv: 'ROLE_LOGRO_TOP50'  },
  { id: 'top100', tipo: 'top10', umbral: 100, nombre: '🔱 100 veces en Top 10',     tier: 'Legend', elo: 90, roleEnv: 'ROLE_LOGRO_TOP100' },
  { id: 'pnl10',  tipo: 'pnl',   umbral: 10,  nombre: '📈 +10% en un torneo',       tier: 'Pro',    elo: 20, roleEnv: 'ROLE_LOGRO_PNL10'  },
  { id: 'pnl15',  tipo: 'pnl',   umbral: 15,  nombre: '📊 +15% en un torneo',       tier: 'Elite',  elo: 35, roleEnv: 'ROLE_LOGRO_PNL15'  },
  { id: 'pnl20',  tipo: 'pnl',   umbral: 20,  nombre: '🚀 +20% en un torneo',       tier: 'Master', elo: 60, roleEnv: 'ROLE_LOGRO_PNL20'  },
  { id: 'pnl30',  tipo: 'pnl',   umbral: 30,  nombre: '⚡ +30% en un torneo',       tier: 'Legend', elo: 90, roleEnv: 'ROLE_LOGRO_PNL30'  },
];

const TIER_COLORS = {
  Pro:    0x22C55E,
  Elite:  0xA855F7,
  Master: 0xEAB308,
  Legend: 0xEF4444,
};

function checkAchievements(player, pnlPct, top10CountNuevo) {
  const nuevosLogros = [];

  for (const logro of LOGROS) {
    if (logro.tipo === 'top10') {
      const antesDelUmbral = player.top10_count < logro.umbral;
      const despuesDelUmbral = top10CountNuevo >= logro.umbral;
      if (antesDelUmbral && despuesDelUmbral) {
        nuevosLogros.push(logro);
      }
    }
    if (logro.tipo === 'pnl') {
      if (pnlPct >= logro.umbral) {
        nuevosLogros.push(logro);
      }
    }
  }

  return nuevosLogros;
}

module.exports = { LOGROS, TIER_COLORS, checkAchievements };
