// Leitura de números digitados em pt-BR (compartilhado com o navegador).
// "1.250,50" → 1250.5 · "1.250" → 1250 (milhar) · "2,5" → 2.5 · "2.5" → 2.5 · "R$ 80" → 80

/** @returns {number|null} null quando vazio; NaN quando não é número */
export function lerNumeroBr(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'number') return valor;
  let t = String(valor).replace(/r\$/i, '').replace(/\s/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : Number.NaN;
}

/**
 * Altura/medida em metros a partir de texto livre, só quando não há ambiguidade:
 * exatamente um número no texto; "cm" converte para metros. Ex.: "até o forro (2,50)" → 2.5; "120 cm" → 1.2;
 * "15 cm de rodapé, 2,50 m" → null (dois números).
 */
export function metrosDeTexto(texto) {
  const s = String(texto ?? '');
  const numeros = s.match(/\d+(?:[.,]\d+)?/g) ?? [];
  if (numeros.length !== 1) return null;
  const n = lerNumeroBr(numeros[0]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return /\d\s*cm\b/i.test(s) ? n / 100 : n;
}
