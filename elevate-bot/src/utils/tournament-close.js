const db = require('../database/db');
const { processTournamentElo, getLevelEmoji } = require('./elo');
const { checkAchievements } = require('./achievements');
const { buildAscensoEmbed, buildLogroEmbed, buildResultadosFinalesEmbed, buildRachaCalienteEmbed } = require('./embeds');

/**
 * Calcula ELO, cierra el torneo y (opcionalmente) envía embeds a Discord.
 * @param {number} torneoId
 * @param {{ guild, client } | null} discordContext - null para omitir acciones Discord
 * @returns {{ procesados, top3, ascensos, logros }}
 */
async function closeTournamentWithElo(torneoId, discordContext = null) {
  const torneo = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(torneoId);
  if (!torneo) throw new Error(`Torneo ${torneoId} no encontrado`);
  if (torneo.status === 'closed') throw new Error(`El torneo ya está cerrado`);

  const snapshots = db.prepare(`
    SELECT * FROM leaderboard_snapshots
    WHERE tournament_id = ? AND discord_id IS NOT NULL
    ORDER BY current_rank ASC
  `).all(torneoId);

  if (!snapshots.length) {
    db.prepare("UPDATE tournaments SET status = 'closed', end_date = datetime('now') WHERE id = ?").run(torneoId);
    return { procesados: 0, top3: [], ascensos: 0, logros: 0 };
  }

  const discordIds = [...new Set(snapshots.map(s => s.discord_id))];
  const playersMap = {};
  for (const did of discordIds) {
    const p = db.prepare('SELECT * FROM players WHERE discord_id = ?').get(did);
    if (p) playersMap[did] = p;
  }

  const allLinkedPlayers = snapshots
    .filter(s => playersMap[s.discord_id])
    .map(s => playersMap[s.discord_id]);

  // Usar el total real de participantes para que el actualScore sea correcto
  // aunque no todos estén vinculados. allLinkedPlayers se usa solo para expectedScore.
  const totalPlayers = torneo.total_participants
    || db.prepare('SELECT COUNT(*) as c FROM leaderboard_snapshots WHERE tournament_id = ?').get(torneoId).c
    || allLinkedPlayers.length;

  let procesados = 0;
  const top3 = [];
  const ascensos = [];
  const logros = [];
  const rachasCalientes = [];

  const processAll = db.transaction(() => {
    for (const snap of snapshots) {
      const player = playersMap[snap.discord_id];
      if (!player) continue;

      const eloResult = processTournamentElo(
        player,
        allLinkedPlayers,
        snap.current_rank,
        totalPlayers,
        snap.current_pnl_pct,
      );

      const newAchievements = checkAchievements(player, snap.current_pnl_pct, eloResult.top10_count_nuevo);

      let eloBonus = 0;
      for (const logro of newAchievements) {
        eloBonus += logro.elo;
        db.prepare(`
          INSERT INTO achievements (discord_id, logro_id, elo_ganado, tournament_id)
          VALUES (?, ?, ?, ?)
        `).run(player.discord_id, logro.id, logro.elo, torneoId);
      }

      const finalEloAfter = Math.max(0, eloResult.elo_after + eloBonus);
      const isBestFinish = !player.best_finish || snap.current_rank < player.best_finish;

      db.prepare(`
        UPDATE players SET
          elo = ?,
          level = ?,
          racha_actual = ?,
          top10_count = ?,
          ever_top10 = ?,
          last_active_date = datetime('now'),
          last_top10_date = CASE WHEN ? = 1 THEN datetime('now') ELSE last_top10_date END,
          tournaments_played = tournaments_played + 1,
          tournaments_won = tournaments_won + CASE WHEN ? = 1 THEN 1 ELSE 0 END,
          best_finish = CASE WHEN ? THEN ? ELSE best_finish END,
          total_pnl_sum = total_pnl_sum + ?
        WHERE discord_id = ?
      `).run(
        finalEloAfter,
        eloResult.level_after,
        eloResult.racha_despues,
        eloResult.top10_count_nuevo,
        eloResult.ever_top10_nuevo ? 1 : 0,
        snap.current_rank <= 10 ? 1 : 0,
        snap.current_rank === 1 ? 1 : 0,
        isBestFinish ? 1 : 0,
        snap.current_rank,
        snap.current_pnl_pct,
        player.discord_id,
      );

      db.prepare(`
        INSERT INTO results
          (tournament_id, discord_id, correo, rank_final, equidad_final, pnl_pct, en_negativo,
           elo_before, elo_after, elo_change, racha_antes, racha_despues)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        torneoId, player.discord_id, snap.correo,
        snap.current_rank, snap.current_equidad, snap.current_pnl_pct, snap.current_pnl_pct < 0 ? 1 : 0,
        eloResult.elo_before, finalEloAfter, finalEloAfter - eloResult.elo_before,
        eloResult.racha_antes, eloResult.racha_despues,
      );

      if (snap.current_rank <= 3) {
        top3.push({ username: player.display_name || player.username, pnl_pct: snap.current_pnl_pct, discord_id: player.discord_id });
      }
      if (eloResult.ascendio) {
        ascensos.push({ player, eloResult, finalEloAfter });
      }
      if (newAchievements.length) {
        logros.push({ player, newAchievements, finalEloAfter });
      }
      if (snap.current_rank <= 10 && eloResult.racha_despues >= 3) {
        rachasCalientes.push({ player, eloResult, finalEloAfter, rank: snap.current_rank });
      }

      procesados++;
    }
  });

  processAll();

  // Determinar ganador para payouts post-transacción
  const winnerSnap = snapshots.find(s => s.current_rank === 1 && s.discord_id);

  // Payout apuestas ELO
  if (winnerSnap) {
    try {
      const pendingBets = db.prepare("SELECT * FROM elo_bets WHERE tournament_id = ? AND status = 'pending'").all(torneoId);
      if (pendingBets.length > 0) {
        const updateBet = db.prepare("UPDATE elo_bets SET status = ?, elo_result = ?, resolved_at = datetime('now') WHERE id = ?");
        for (const bet of pendingBets) {
          const won = bet.target_discord_id === winnerSnap.discord_id;
          const eloChange = won ? bet.elo_amount : -Math.ceil(bet.elo_amount / 2);
          db.prepare('UPDATE players SET elo = MAX(100, elo + ?) WHERE discord_id = ?').run(eloChange, bet.bettor_discord_id);
          updateBet.run(won ? 'won' : 'lost', eloChange, bet.id);
        }
      }
    } catch (e) { /* elo_bets table may not exist in older instances */ }

    // +15 ELO bonus a votantes que acertaron al ganador
    const correctVoters = db.prepare(`
      SELECT voter_discord_id FROM tournament_votes
      WHERE tournament_id = ? AND voted_for_discord_id = ?
    `).all(torneoId, winnerSnap.discord_id);
    for (const { voter_discord_id } of correctVoters) {
      db.prepare('UPDATE players SET elo = elo + 15 WHERE discord_id = ?').run(voter_discord_id);
    }
  }

  db.prepare("UPDATE tournaments SET status = 'closed', end_date = datetime('now') WHERE id = ?").run(torneoId);

  // Acciones Discord opcionales
  if (discordContext) {
    const { guild, client } = discordContext;
    const torneoName = `${torneo.name} #${torneo.edition}`;

    const canalAscensos = db.prepare("SELECT value FROM server_config WHERE key = 'canal_ascensos'").get()?.value
      || process.env.CHANNEL_ASCENSOS_LOGROS;

    let ascensosChannel = null;
    try {
      if (canalAscensos) ascensosChannel = await client.channels.fetch(canalAscensos);
    } catch (e) { /* canal no configurado */ }

    if (ascensosChannel) {
      for (const { player, eloResult, finalEloAfter } of ascensos) {
        ascensosChannel.send({ embeds: [buildAscensoEmbed(
          player.display_name || player.username,
          eloResult.level_before, eloResult.level_after,
          eloResult.elo_before, finalEloAfter, torneoName,
        )] }).catch(() => {});
        assignLevelRole(guild, player.discord_id, eloResult.level_after);
      }
      for (const { player, newAchievements: achList, finalEloAfter } of logros) {
        for (const logro of achList) {
          ascensosChannel.send({
            content: `🎉 <@${player.discord_id}> desbloqueó **${logro.nombre}**!`,
            embeds: [buildLogroEmbed(player.display_name || player.username, logro, finalEloAfter, torneoName)],
          }).catch(() => {});
          const roleId = process.env[logro.roleEnv];
          if (roleId) guild.members.fetch(player.discord_id).then(m => m.roles.add(roleId)).catch(() => {});
        }
      }
      for (const { player, eloResult, finalEloAfter, rank } of rachasCalientes) {
        ascensosChannel.send({ embeds: [buildRachaCalienteEmbed(
          player.display_name || player.username,
          eloResult.racha_despues,
          eloResult.elo_before, finalEloAfter,
          torneoName, rank,
        )] }).catch(() => {});
      }

      // Roles dinámicos de racha (ROLE_RACHA_3, ROLE_RACHA_5, ROLE_RACHA_10)
      for (const snap of snapshots) {
        if (!snap.discord_id) continue;
        const updated = db.prepare('SELECT racha_actual FROM players WHERE discord_id = ?').get(snap.discord_id);
        if (updated) assignRachaRole(guild, snap.discord_id, updated.racha_actual);
      }
    }

    // Rotar campeón
    const winner = snapshots.find(s => s.current_rank === 1 && s.discord_id);
    if (winner) await rotateCampeonRole(guild, torneo.modalidad, winner.discord_id);

    // Embed resultados finales
    const canalTabla = db.prepare("SELECT value FROM server_config WHERE key = 'canal_tabla'").get()?.value
      || process.env.CHANNEL_TABLA;
    if (canalTabla) {
      try {
        const channel = await client.channels.fetch(canalTabla);
        await channel.send({ embeds: [buildResultadosFinalesEmbed(
          torneo.name, torneo.edition, torneo.modalidad,
          top3, torneo.total_participants, procesados,
        )] });
      } catch (e) { /* canal no configurado */ }
    }

    // DM al cierre para jugadores con notificaciones activadas
    try {
      const { EmbedBuilder } = require('discord.js');
      const dmPrefs = db.prepare('SELECT discord_id FROM dm_preferences WHERE notify_on = 1').all();
      if (dmPrefs.length > 0) {
        const dmSet = new Set(dmPrefs.map(p => p.discord_id));
        for (const snap of snapshots) {
          if (!snap.discord_id || !dmSet.has(snap.discord_id)) continue;
          const result = db.prepare('SELECT * FROM results WHERE tournament_id = ? AND discord_id = ?').get(torneoId, snap.discord_id);
          if (!result) continue;
          const pnlStr = `${result.pnl_pct >= 0 ? '+' : ''}${result.pnl_pct.toFixed(2)}%`;
          const eloChange = result.elo_after - result.elo_before;
          const eloStr = `${eloChange >= 0 ? '+' : ''}${eloChange}`;
          const dmEmbed = new EmbedBuilder()
            .setColor(eloChange >= 0 ? 0x22C55E : 0xEF4444)
            .setTitle(`📊 Resumen: ${torneoName}`)
            .addFields(
              { name: 'Posición final', value: `#${result.rank_final}`, inline: true },
              { name: 'PnL', value: pnlStr, inline: true },
              { name: 'ELO', value: `${result.elo_before} → ${result.elo_after} (${eloStr})`, inline: true },
            )
            .setTimestamp()
            .setFooter({ text: 'Usa /notificarme off para desactivar esto' });
          client.users.fetch(snap.discord_id)
            .then(user => user.send({ embeds: [dmEmbed] }))
            .catch(() => {});
        }
      }
    } catch (e) { /* dm_preferences may not exist yet */ }
  }

  return { procesados, top3, ascensos, ascensos_count: ascensos.length, logros, logros_count: logros.length };
}

function assignLevelRole(guild, discordId, level) {
  const levelRoles = {
    Rookie: process.env.ROLE_ROOKIE, Trader: process.env.ROLE_TRADER,
    Pro: process.env.ROLE_PRO, Elite: process.env.ROLE_ELITE,
    Master: process.env.ROLE_MASTER, Legend: process.env.ROLE_LEGEND,
  };
  const allRoleIds = Object.values(levelRoles).filter(Boolean);
  const newRoleId = levelRoles[level];
  if (!newRoleId) return;
  guild.members.fetch(discordId).then(member => {
    const toRemove = member.roles.cache.filter(r => allRoleIds.includes(r.id) && r.id !== newRoleId);
    for (const [, role] of toRemove) member.roles.remove(role).catch(() => {});
    member.roles.add(newRoleId).catch(() => {});
  }).catch(() => {});
}

function assignRachaRole(guild, discordId, racha) {
  const role3 = process.env.ROLE_RACHA_3;
  const role5 = process.env.ROLE_RACHA_5;
  const role10 = process.env.ROLE_RACHA_10;
  const allRachaRoles = [role3, role5, role10].filter(Boolean);
  if (!allRachaRoles.length) return;
  guild.members.fetch(discordId).then(member => {
    for (const r of allRachaRoles) {
      if (member.roles.cache.has(r)) member.roles.remove(r).catch(() => {});
    }
    if (racha >= 10 && role10) member.roles.add(role10).catch(() => {});
    else if (racha >= 5 && role5) member.roles.add(role5).catch(() => {});
    else if (racha >= 3 && role3) member.roles.add(role3).catch(() => {});
  }).catch(() => {});
}

async function rotateCampeonRole(guild, modalidad, newWinnerId) {
  const roleEnvMap = {
    Night: process.env.ROLE_CAMPEON_NIGHT,
    Day:   process.env.ROLE_CAMPEON_DAY,
    Month: process.env.ROLE_CAMPEON_MONTH,
  };
  const roleId = roleEnvMap[modalidad];
  if (!roleId) return;
  try {
    await guild.members.fetch();
    const membersWithRole = guild.members.cache.filter(m => m.roles.cache.has(roleId));
    for (const [, member] of membersWithRole) await member.roles.remove(roleId).catch(() => {});
    const newChamp = await guild.members.fetch(newWinnerId);
    await newChamp.roles.add(roleId).catch(() => {});
  } catch (e) { /* rol no configurado */ }
}

/**
 * Re-calcula ELO para traders que se vincularon DESPUÉS de que el torneo fue cerrado.
 * Solo procesa snapshots sin resultado previo (no duplica).
 * @param {number} torneoId
 * @returns {{ procesados, skipped, enriched }}
 */
async function recalcMissingElo(torneoId) {
  const torneo = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(torneoId);
  if (!torneo) throw new Error(`Torneo ${torneoId} no encontrado`);

  // Paso 1: Re-enriquecer snapshots cuyo discord_id es NULL pero el correo ya está vinculado
  const nullSnaps = db.prepare(
    'SELECT * FROM leaderboard_snapshots WHERE tournament_id = ? AND discord_id IS NULL AND correo IS NOT NULL'
  ).all(torneoId);

  const updateSnapLink = db.prepare(
    'UPDATE leaderboard_snapshots SET discord_id = ?, username = ?, level_emoji = ? WHERE id = ?'
  );

  let enriched = 0;
  db.transaction(() => {
    for (const snap of nullSnaps) {
      const link = db.prepare('SELECT * FROM email_links WHERE correo = ?').get(snap.correo);
      if (!link) continue;
      const player = db.prepare('SELECT * FROM players WHERE discord_id = ?').get(link.discord_id);
      if (!player) continue;
      updateSnapLink.run(
        link.discord_id,
        player.display_name || player.username,
        getLevelEmoji(player.level),
        snap.id
      );
      enriched++;
    }
  })();

  // Paso 2: Todos los snapshots ahora vinculados
  const linkedSnaps = db.prepare(`
    SELECT * FROM leaderboard_snapshots
    WHERE tournament_id = ? AND discord_id IS NOT NULL
    ORDER BY current_rank ASC
  `).all(torneoId);

  // Paso 3: Filtrar los que NO tienen resultado previo para este torneo
  const toProcess = linkedSnaps.filter(snap =>
    !db.prepare('SELECT id FROM results WHERE tournament_id = ? AND discord_id = ?')
      .get(torneoId, snap.discord_id)
  );

  const skipped = linkedSnaps.length - toProcess.length;
  if (!toProcess.length) return { procesados: 0, skipped, enriched };

  // Paso 4: Construir contexto de todos los vinculados para percentil correcto
  const playersMap = {};
  for (const snap of linkedSnaps) {
    if (!playersMap[snap.discord_id]) {
      const p = db.prepare('SELECT * FROM players WHERE discord_id = ?').get(snap.discord_id);
      if (p) playersMap[snap.discord_id] = p;
    }
  }
  const allLinkedPlayers = linkedSnaps
    .filter(s => playersMap[s.discord_id])
    .map(s => playersMap[s.discord_id]);

  // Total real de participantes (rank del snapshot va de 1 a N total, no solo vinculados)
  const totalPlayers = torneo.total_participants
    || db.prepare('SELECT COUNT(*) as c FROM leaderboard_snapshots WHERE tournament_id = ?').get(torneoId).c
    || allLinkedPlayers.length;

  let procesados = 0;

  db.transaction(() => {
    for (const snap of toProcess) {
      const player = playersMap[snap.discord_id];
      if (!player) continue;

      const eloResult = processTournamentElo(player, allLinkedPlayers, snap.current_rank, totalPlayers, snap.current_pnl_pct);
      const newAchievements = checkAchievements(player, snap.current_pnl_pct, eloResult.top10_count_nuevo);

      let eloBonus = 0;
      for (const logro of newAchievements) {
        eloBonus += logro.elo;
        db.prepare('INSERT INTO achievements (discord_id, logro_id, elo_ganado, tournament_id) VALUES (?, ?, ?, ?)')
          .run(player.discord_id, logro.id, logro.elo, torneoId);
      }

      const finalEloAfter = Math.max(0, eloResult.elo_after + eloBonus);
      const isBestFinish = !player.best_finish || snap.current_rank < player.best_finish;

      db.prepare(`
        UPDATE players SET
          elo = ?,
          level = ?,
          racha_actual = ?,
          top10_count = ?,
          ever_top10 = ?,
          last_active_date = datetime('now'),
          last_top10_date = CASE WHEN ? = 1 THEN datetime('now') ELSE last_top10_date END,
          tournaments_played = tournaments_played + 1,
          tournaments_won = tournaments_won + CASE WHEN ? = 1 THEN 1 ELSE 0 END,
          best_finish = CASE WHEN ? THEN ? ELSE best_finish END,
          total_pnl_sum = total_pnl_sum + ?
        WHERE discord_id = ?
      `).run(
        finalEloAfter, eloResult.level_after, eloResult.racha_despues,
        eloResult.top10_count_nuevo, eloResult.ever_top10_nuevo ? 1 : 0,
        snap.current_rank <= 10 ? 1 : 0,
        snap.current_rank === 1 ? 1 : 0,
        isBestFinish ? 1 : 0, snap.current_rank,
        snap.current_pnl_pct,
        player.discord_id,
      );

      db.prepare(`
        INSERT INTO results
          (tournament_id, discord_id, correo, rank_final, equidad_final, pnl_pct, en_negativo,
           elo_before, elo_after, elo_change, racha_antes, racha_despues)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        torneoId, player.discord_id, snap.correo,
        snap.current_rank, snap.current_equidad, snap.current_pnl_pct, snap.current_pnl_pct < 0 ? 1 : 0,
        eloResult.elo_before, finalEloAfter, finalEloAfter - eloResult.elo_before,
        eloResult.racha_antes, eloResult.racha_despues,
      );

      procesados++;
    }
  })();

  return { procesados, skipped, enriched };
}

module.exports = { closeTournamentWithElo, recalcMissingElo };
