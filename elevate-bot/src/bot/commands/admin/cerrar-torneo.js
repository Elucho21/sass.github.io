const { SlashCommandBuilder } = require('discord.js');
const db = require('../../../database/db');
const { processTournamentElo } = require('../../../utils/elo');
const { checkAchievements } = require('../../../utils/achievements');
const { buildAscensoEmbed, buildLogroEmbed, buildResultadosFinalesEmbed } = require('../../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cerrar-torneo')
    .setDescription('[Admin] Cerrá el torneo activo y calculá ELO final'),

  async execute(interaction) {
    if (!interaction.member.roles.cache.has(process.env.ADMIN_ROLE_ID)) {
      return interaction.reply({ content: '❌ No tenés permisos de administrador.', ephemeral: true });
    }

    const torneo = db.prepare("SELECT * FROM tournaments WHERE status = 'active' ORDER BY id DESC LIMIT 1").get();
    if (!torneo) {
      return interaction.reply({ content: '❌ No hay torneo activo.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const snapshots = db.prepare(`
      SELECT * FROM leaderboard_snapshots
      WHERE tournament_id = ? AND discord_id IS NOT NULL
      ORDER BY current_rank ASC
    `).all(torneo.id);

    if (!snapshots.length) {
      return interaction.editReply('❌ No hay resultados cargados con traders vinculados.');
    }

    // Obtener todos los jugadores vinculados
    const discordIds = [...new Set(snapshots.map(s => s.discord_id))];
    const playersMap = {};
    for (const did of discordIds) {
      const p = db.prepare('SELECT * FROM players WHERE discord_id = ?').get(did);
      if (p) playersMap[did] = p;
    }

    const allLinkedPlayers = snapshots
      .filter(s => playersMap[s.discord_id])
      .map(s => playersMap[s.discord_id]);

    const totalPlayers = allLinkedPlayers.length;

    const canalAscensos = db.prepare("SELECT value FROM server_config WHERE key = 'canal_ascensos'").get()?.value
      || process.env.CHANNEL_ASCENSOS_LOGROS;

    let ascensosChannel = null;
    try {
      if (canalAscensos) ascensosChannel = await interaction.client.channels.fetch(canalAscensos);
    } catch (e) { console.error('[cerrar-torneo] Canal ascensos no encontrado'); }

    let procesados = 0;
    const top3 = [];

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

        // ELO bonus de logros
        let eloBonus = 0;
        for (const logro of newAchievements) {
          eloBonus += logro.elo;
          db.prepare(`
            INSERT INTO achievements (discord_id, logro_id, elo_ganado, tournament_id)
            VALUES (?, ?, ?, ?)
          `).run(player.discord_id, logro.id, logro.elo, torneo.id);
        }

        const finalEloAfter = Math.max(0, eloResult.elo_after + eloBonus);

        // Actualizar jugador
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

        // Insertar resultado
        db.prepare(`
          INSERT INTO results
            (tournament_id, discord_id, correo, rank_final, equidad_final, pnl_pct, en_negativo,
             elo_before, elo_after, elo_change, racha_antes, racha_despues)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          torneo.id, player.discord_id, snap.correo,
          snap.current_rank, snap.current_equidad, snap.current_pnl_pct, snap.current_pnl_pct < 0 ? 1 : 0,
          eloResult.elo_before, finalEloAfter, finalEloAfter - eloResult.elo_before,
          eloResult.racha_antes, eloResult.racha_despues,
        );

        if (snap.current_rank <= 3) {
          top3.push({ username: player.display_name || player.username, pnl_pct: snap.current_pnl_pct, discord_id: player.discord_id });
        }

        procesados++;

        // Publicar embeds async (fuera de la transacción para no bloquear)
        if (ascensosChannel) {
          if (eloResult.ascendio) {
            const embed = buildAscensoEmbed(
              player.display_name || player.username,
              eloResult.level_before, eloResult.level_after,
              eloResult.elo_before, finalEloAfter,
              `${torneo.name} #${torneo.edition}`,
            );
            ascensosChannel.send({ embeds: [embed] }).catch(() => {});
          }
          for (const logro of newAchievements) {
            const embed = buildLogroEmbed(
              player.display_name || player.username,
              logro, finalEloAfter,
              `${torneo.name} #${torneo.edition}`,
            );
            ascensosChannel.send({ embeds: [embed] }).catch(() => {});
            // Asignar rol de logro
            const roleId = process.env[logro.roleEnv];
            if (roleId) {
              interaction.guild.members.fetch(player.discord_id)
                .then(m => m.roles.add(roleId)).catch(() => {});
            }
          }
          // Asignar roles de nivel
          assignLevelRole(interaction.guild, player.discord_id, eloResult.level_after);
        }
      }
    });

    processAll();

    // Rotar rol campeón
    const winner = snapshots.find(s => s.current_rank === 1 && s.discord_id);
    if (winner) {
      await rotateCampeonRole(interaction.guild, torneo.modalidad, winner.discord_id);
    }

    // Publicar embed de resultados finales
    const canalTabla = db.prepare("SELECT value FROM server_config WHERE key = 'canal_tabla'").get()?.value
      || process.env.CHANNEL_TABLA;
    if (canalTabla) {
      try {
        const channel = await interaction.client.channels.fetch(canalTabla);
        const embed = buildResultadosFinalesEmbed(
          torneo.name, torneo.edition, torneo.modalidad,
          top3, torneo.total_participants, procesados,
        );
        await channel.send({ embeds: [embed] });
      } catch (e) { console.error('[cerrar-torneo] Error publicando resultados:', e.message); }
    }

    // Cerrar torneo
    db.prepare("UPDATE tournaments SET status = 'closed', end_date = datetime('now') WHERE id = ?").run(torneo.id);

    return interaction.editReply(`✅ Torneo cerrado. ELO calculado para **${procesados}** traders.`);
  },
};

function assignLevelRole(guild, discordId, level) {
  const levelRoles = {
    Rookie: process.env.ROLE_ROOKIE,
    Trader: process.env.ROLE_TRADER,
    Pro:    process.env.ROLE_PRO,
    Elite:  process.env.ROLE_ELITE,
    Master: process.env.ROLE_MASTER,
    Legend: process.env.ROLE_LEGEND,
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

async function rotateCampeonRole(guild, modalidad, newWinnerId) {
  const roleEnvMap = {
    Light: process.env.ROLE_CAMPEON_LIGHT,
    Day:   process.env.ROLE_CAMPEON_DAY,
    Month: process.env.ROLE_CAMPEON_MONTH,
  };
  const roleId = roleEnvMap[modalidad];
  if (!roleId) return;

  try {
    await guild.members.fetch();
    const membersWithRole = guild.members.cache.filter(m => m.roles.cache.has(roleId));
    for (const [, member] of membersWithRole) {
      await member.roles.remove(roleId).catch(() => {});
    }
    const newChamp = await guild.members.fetch(newWinnerId);
    await newChamp.roles.add(roleId).catch(() => {});
  } catch (e) {
    console.error('[cerrar-torneo] Error rotando rol campeón:', e.message);
  }
}
