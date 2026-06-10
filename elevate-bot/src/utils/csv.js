const csv = require('csv-parser');
const { Readable } = require('stream');

function parseCsv(buffer) {
  return new Promise((resolve, reject) => {
    const results = [];
    Readable.from(buffer.toString())
      .pipe(csv({ mapHeaders: ({ header }) => header.trim().toLowerCase().replace(/\s+/g, '_') }))
      .on('data', d => results.push(d))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

// Detecta automáticamente el formato y devuelve filas normalizadas:
// { correo, equidad_actual, rank, alias }
// Formato Elevate: tiene columna "equity" → rank calculado por orden desc de equity
// Formato propio:  tiene columna "equidad_actual" → se usa tal cual
function normalizeRows(rows) {
  if (!rows.length) return rows;
  const sample = rows[0];
  const isElevateFormat = 'equity' in sample;

  if (!isElevateFormat) {
    return rows.map(r => ({ ...r, alias: r.alias || null }));
  }

  const sorted = [...rows].sort((a, b) => parseFloat(b.equity) - parseFloat(a.equity));
  return sorted.map((r, i) => ({
    correo:         (r.correo || '').trim(),
    equidad_actual: r.equity,
    rank:           i + 1,
    alias:          (r.alias || '').trim() || null,
  }));
}

module.exports = { parseCsv, normalizeRows };
