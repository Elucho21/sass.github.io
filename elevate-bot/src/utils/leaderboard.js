function generateLeaderboardText(snapshots, torneoName, torneoEdicion, lastUpdated, totalParticipants) {
  const header = `🏆 ${torneoName} #${torneoEdicion} — EN VIVO\n` +
    `Actualizado: ${lastUpdated}  |  ${totalParticipants} participantes\n` +
    `${'─'.repeat(44)}`;

  const rows = snapshots.slice(0, 15).map(row => {
    const rankStr  = `#${row.current_rank}`.padEnd(4);
    const emoji    = row.level_emoji || '🟤';
    const nameStr  = (row.username || '?').substring(0, 12).padEnd(13);
    const sign     = row.current_pnl_pct >= 0 ? '+' : '';
    const pnlStr   = `${sign}${row.current_pnl_pct.toFixed(1)}%`.padEnd(9);
    let changeStr  = '—';
    if (row.pos_change > 0) changeStr = `▲${row.pos_change} 🟢`;
    if (row.pos_change < 0) changeStr = `▼${Math.abs(row.pos_change)} 🔴`;
    if (!row.discord_id) changeStr = '❓';
    return `${rankStr} ${emoji} ${nameStr} ${pnlStr} ${changeStr}`;
  });

  return `\`\`\`\n${header}\n${rows.join('\n')}\n\`\`\``;
}

function formatLastUpdated(dateStr) {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  return d.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

module.exports = { generateLeaderboardText, formatLastUpdated };
