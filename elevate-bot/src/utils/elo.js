const LEVELS = {
  Rookie: { min: 0,     max: 1299,  emoji: '🟤', K: 40 },
  Trader: { min: 1300,  max: 1488,  emoji: '🟢', K: 35 },
  Pro:    { min: 1489,  max: 1753,  emoji: '🔵', K: 43 },
  Elite:  { min: 1754,  max: 2097,  emoji: '🟣', K: 43 },
  Master: { min: 2098,  max: 2573,  emoji: '🟡', K: 27 },
  Legend: { min: 2574,  max: 99999, emoji: '🔴', K: 27 },
};

const BONO_PRIMERA_TOP10 = 50;
const PENALIDAD_NEGATIVO_BASE = -20;
const INACTIVIDAD_RESET_DIAS = 365;

function getLevelByElo(elo) {
  for (const [name, cfg] of Object.entries(LEVELS)) {
    if (elo >= cfg.min && elo <= cfg.max) return name;
  }
  return 'Rookie';
}

function getLevelEmoji(level) {
  return LEVELS[level]?.emoji || '🟤';
}

function calculateTournamentElo(playerElo, allPlayersElo, finalRank, totalPlayers, kFactor) {
  if (totalPlayers <= 1) return { newElo: playerElo, change: 0, percentile: 100 };

  const actualScore = (totalPlayers - finalRank) / (totalPlayers - 1);

  let totalExpected = 0;
  allPlayersElo.forEach((oppElo) => {
    totalExpected += 1 / (1 + Math.pow(10, (oppElo - playerElo) / 400));
  });
  const expectedScore = totalExpected / allPlayersElo.length;

  const change = Math.round(kFactor * (actualScore - expectedScore));
  const newElo = Math.max(0, playerElo + change);
  const percentile = Math.round(actualScore * 100);

  return { newElo, change, percentile };
}

function getRachaMultiplier(rachaConsecutiva) {
  const abs = Math.abs(rachaConsecutiva);
  if (abs <= 1) return 1.0;
  if (abs === 2) return 1.10;
  if (abs === 3) return 1.20;
  if (abs === 4) return 1.30;
  return 1.40;
}

function updateRacha(rachaActual, inTop10) {
  if (inTop10) {
    return rachaActual >= 0 ? rachaActual + 1 : 1;
  } else {
    return rachaActual <= 0 ? rachaActual - 1 : -1;
  }
}

function isEverTop10Reset(lastActiveDate) {
  if (!lastActiveDate) return false;
  const last = new Date(lastActiveDate);
  const now = new Date();
  const diffDays = (now - last) / (1000 * 60 * 60 * 24);
  return diffDays >= INACTIVIDAD_RESET_DIAS;
}

function processTournamentElo(player, allPlayers, rank, totalPlayers, pnlPct) {
  const inTop10 = rank <= 10;
  const enNegativo = pnlPct < 0;

  // Reset ever_top10 si inactivo más de 365 días
  const everTop10Efectivo = isEverTop10Reset(player.last_active_date) ? false : !!player.ever_top10;

  const K = LEVELS[player.level]?.K || LEVELS.Rookie.K;
  const allElos = allPlayers.map(p => p.elo);

  let { change } = calculateTournamentElo(player.elo, allElos, rank, totalPlayers, K);

  const nuevaRacha = updateRacha(player.racha_actual, inTop10);

  if (inTop10 && !everTop10Efectivo) {
    change += BONO_PRIMERA_TOP10;
  }

  if (inTop10 && change > 0 && nuevaRacha >= 2) {
    change = Math.round(change * getRachaMultiplier(nuevaRacha));
  }

  if (enNegativo) {
    const penalidad = Math.round(Math.abs(PENALIDAD_NEGATIVO_BASE) * getRachaMultiplier(nuevaRacha));
    change = Math.min(change, -penalidad);
  } else if (!inTop10 && change < 0 && nuevaRacha <= -2) {
    change = Math.round(change * getRachaMultiplier(nuevaRacha));
  }

  const newElo = Math.max(0, player.elo + change);
  const newLevel = getLevelByElo(newElo);

  return {
    elo_before: player.elo,
    elo_after: newElo,
    elo_change: change,
    racha_antes: player.racha_actual,
    racha_despues: nuevaRacha,
    level_before: player.level,
    level_after: newLevel,
    ascendio: newLevel !== player.level,
    ever_top10_nuevo: inTop10 && !everTop10Efectivo ? true : everTop10Efectivo,
    top10_count_nuevo: inTop10 ? player.top10_count + 1 : player.top10_count,
  };
}

module.exports = {
  LEVELS,
  getLevelByElo,
  getLevelEmoji,
  calculateTournamentElo,
  getRachaMultiplier,
  updateRacha,
  processTournamentElo,
};
