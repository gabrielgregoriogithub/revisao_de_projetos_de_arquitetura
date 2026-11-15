// Comparação entre revisões de um projeto (ex.: R00 × R01).
// Casamento de lacunas: mesmo ID, ou mesmo título (normalizado) — IDs podem mudar entre análises.

const norm = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * @param {object[]} antes lacunas (mescladas) da revisão anterior
 * @param {object[]} depois lacunas (mescladas) da revisão nova
 */
export function compararRevisoes(antes, depois) {
  const usadas = new Set();
  const pares = [];
  for (const a of antes) {
    const d = depois.find((x) => !usadas.has(x.id) && x.id === a.id && norm(x.titulo) === norm(a.titulo))
      ?? depois.find((x) => !usadas.has(x.id) && norm(x.titulo) === norm(a.titulo));
    if (d) { usadas.add(d.id); pares.push([a, d]); }
  }
  const casadasAntes = new Set(pares.map(([a]) => a.id));
  const statusDe = (l) => l.resposta?.status ?? 'aberta';

  return {
    // Sumiu na revisão nova: o projeto provavelmente resolveu — a confirmar.
    resolvidasNaRevisao: antes.filter((a) => !casadasAntes.has(a.id)).map((a) => ({ id: a.id, titulo: a.titulo, statusAnterior: statusDe(a) })),
    novas: depois.filter((d) => !usadas.has(d.id)).map((d) => ({ id: d.id, titulo: d.titulo, prioridade: d.prioridade })),
    mantidas: pares.map(([a, d]) => ({
      idAntes: a.id, idDepois: d.id, titulo: d.titulo,
      statusAntes: statusDe(a), statusDepois: statusDe(d),
      prioridadeMudou: a.prioridade !== d.prioridade,
      problemaMudou: norm(a.problema) !== norm(d.problema)
    }))
  };
}
