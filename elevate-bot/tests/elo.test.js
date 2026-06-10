const { test } = require('node:test');
const assert = require('node:assert/strict');
const { processTournamentElo, getRachaMultiplier, calculateTournamentElo } = require('../src/utils/elo');

function makePlayer(overrides = {}) {
  return {
    discord_id: 'test',
    username: 'testuser',
    elo: 1200,
    level: 'Rookie',
    racha_actual: 0,
    top10_count: 0,
    ever_top10: 0,
    last_active_date: null,
    ...overrides,
  };
}

function makeAllPlayers(count, elo = 1200) {
  return Array.from({ length: count }, (_, i) => ({ discord_id: `p${i}`, elo }));
}

test('Trader pos #1 de 20, todos ELO 1200 → change ≈ +20', () => {
  const player = makePlayer({ elo: 1200, level: 'Rookie', ever_top10: 0 });
  const allPlayers = makeAllPlayers(20, 1200);
  // Remove first player to not double count, but spec says use all ELOs
  const result = processTournamentElo(player, allPlayers, 1, 20, 5);
  // Without bono: K=40, actualScore=(20-1)/(20-1)=1.0, expected≈0.5 → change=round(40*0.5)=20
  // With bono primera top10: +50 → total = 70... but spec says ≈+20
  // The test says "change ≈ +20" so we check the base ELO change before bono
  // Let's test with ever_top10=1 to skip the bono
  const playerWithTop10 = makePlayer({ elo: 1200, level: 'Rookie', ever_top10: 1, top10_count: 1 });
  const result2 = processTournamentElo(playerWithTop10, allPlayers, 1, 20, 5);
  assert.ok(result2.elo_change >= 18 && result2.elo_change <= 22,
    `Expected change ≈ 20, got ${result2.elo_change}`);
});

test('Trader pos #1 con racha_actual=4 (racha 5 tras este torneo) → change mayor que sin racha', () => {
  const playerBase = makePlayer({ elo: 1200, level: 'Rookie', ever_top10: 1, top10_count: 1, racha_actual: 4 });
  const playerSinRacha = makePlayer({ elo: 1200, level: 'Rookie', ever_top10: 1, top10_count: 1, racha_actual: 0 });
  const allPlayers = makeAllPlayers(20, 1200);

  const conRacha = processTournamentElo(playerBase, allPlayers, 1, 20, 5);
  const sinRacha = processTournamentElo(playerSinRacha, allPlayers, 1, 20, 5);

  assert.ok(conRacha.elo_change > sinRacha.elo_change,
    `Con racha (${conRacha.elo_change}) debe ser mayor que sin racha (${sinRacha.elo_change})`);
  // Con racha 5, multiplicador = 1.40
  const expectedConRacha = Math.round(sinRacha.elo_change * 1.40);
  assert.ok(Math.abs(conRacha.elo_change - expectedConRacha) <= 2,
    `Esperado ≈ ${expectedConRacha}, got ${conRacha.elo_change}`);
});

test('Trader con pnl_pct=-5% → elo_change ≤ -20 siempre', () => {
  const player = makePlayer({ elo: 1200, level: 'Rookie' });
  const allPlayers = makeAllPlayers(20, 1200);

  // Pos 15 de 20 (fuera top10), pnl negativo
  const result = processTournamentElo(player, allPlayers, 15, 20, -5);
  assert.ok(result.elo_change <= -20,
    `Expected elo_change ≤ -20, got ${result.elo_change}`);
});

test('Trader pnl_pct=-5% con racha_actual=-2 → change ≤ -24', () => {
  const player = makePlayer({ elo: 1200, level: 'Rookie', racha_actual: -2 });
  const allPlayers = makeAllPlayers(20, 1200);

  const result = processTournamentElo(player, allPlayers, 15, 20, -5);
  // Racha despues = -3, multiplicador = 1.20, penalidad = round(20 * 1.20) = 24
  assert.ok(result.elo_change <= -24,
    `Expected elo_change ≤ -24, got ${result.elo_change}`);
});

test('getRachaMultiplier: valores correctos', () => {
  assert.equal(getRachaMultiplier(0), 1.0);
  assert.equal(getRachaMultiplier(1), 1.0);
  assert.equal(getRachaMultiplier(2), 1.10);
  assert.equal(getRachaMultiplier(3), 1.20);
  assert.equal(getRachaMultiplier(4), 1.30);
  assert.equal(getRachaMultiplier(5), 1.40);
  assert.equal(getRachaMultiplier(10), 1.40);
  // Negativas
  assert.equal(getRachaMultiplier(-3), 1.20);
  assert.equal(getRachaMultiplier(-5), 1.40);
});

test('Bono primera top10: +50 ELO si ever_top10=false', () => {
  const playerNuevo = makePlayer({ elo: 1200, level: 'Rookie', ever_top10: 0, top10_count: 0 });
  const playerVeterano = makePlayer({ elo: 1200, level: 'Rookie', ever_top10: 1, top10_count: 5 });
  const allPlayers = makeAllPlayers(20, 1200);

  const nuevo = processTournamentElo(playerNuevo, allPlayers, 1, 20, 5);
  const veterano = processTournamentElo(playerVeterano, allPlayers, 1, 20, 5);

  assert.ok(nuevo.elo_change >= veterano.elo_change + 45,
    `Nuevo (${nuevo.elo_change}) debe ser aprox 50 más que veterano (${veterano.elo_change})`);
  assert.equal(nuevo.ever_top10_nuevo, true);
});

test('ELO mínimo es 0', () => {
  const player = makePlayer({ elo: 5, level: 'Rookie', racha_actual: -10 });
  const allPlayers = makeAllPlayers(20, 1200);
  const result = processTournamentElo(player, allPlayers, 20, 20, -50);
  assert.ok(result.elo_after >= 0, `ELO no puede ser negativo, got ${result.elo_after}`);
});
