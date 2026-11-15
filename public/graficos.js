// Gráficos leves (HTML/SVG): barras horizontais de série única, barra de status e linha de evolução.
import { el, svg } from './dom.js';
import { STATUS, STATUS_INFO } from '/dominio/status.js';

/**
 * Barras horizontais (uma série → uma cor, rótulo direto, sem legenda).
 * @param {{rotulo:string,total:number,titulo?:string}[]} itens
 * @param {(item)=>void} [aoClicar]
 */
export function barras(itens, aoClicar) {
  const max = Math.max(1, ...itens.map((i) => i.total));
  return el('div', { className: 'barras', role: 'list' }, itens.map((i) => el('button', {
    type: 'button', className: 'barra-linha', role: 'listitem', title: i.titulo ?? `${i.rotulo}: ${i.total}`,
    onclick: aoClicar ? () => aoClicar(i) : undefined
  }, [
    el('span', { className: 'rot', textContent: i.rotulo }),
    el('span', { className: 'trilho-barra' }, [el('i', { style: `width:${(i.total / max) * 100}%` })]),
    el('span', { className: 'val', textContent: i.total })
  ])));
}

/** Barra empilhada por status com legenda textual (cor nunca sozinha). */
export function barraStatus(porStatus, total) {
  const mapa = Object.fromEntries(porStatus.map((s) => [s.chave, s.total]));
  const presentes = STATUS.filter((s) => mapa[s]);
  return el('div', {}, [
    el('div', { className: 'barra-status', role: 'img', 'aria-label': presentes.map((s) => `${STATUS_INFO[s].rotulo}: ${mapa[s]}`).join(', ') },
      presentes.map((s) => el('i', { className: `cor-${s}`, style: `flex:${mapa[s]}`, title: `${STATUS_INFO[s].rotulo}: ${mapa[s]} de ${total}` }))),
    el('div', { className: 'legenda-status' }, presentes.map((s) => el('span', {}, [el('i', { className: `cor-${s}` }), `${STATUS_INFO[s].rotulo} · ${mapa[s]}`])))
  ]);
}

/**
 * Linha de evolução: duas séries no mesmo eixo (contagens), com legenda + rótulo direto no último ponto.
 * @param {{dia:string, comResposta:number, resolvidas:number, total:number}[]} serie
 */
export function linhaEvolucao(serie) {
  const L = 560; const A = 180; const m = { e: 30, d: 70, t: 12, b: 26 };
  const total = Math.max(1, serie[0]?.total ?? 1);
  const n = serie.length;
  const x = (i) => m.e + (n === 1 ? (L - m.e - m.d) / 2 : (i / (n - 1)) * (L - m.e - m.d));
  const y = (v) => m.t + (1 - v / total) * (A - m.t - m.b);
  const series = [
    { chave: 'comResposta', rotulo: 'Com resposta', cor: 'var(--serie-1)' },
    { chave: 'resolvidas', rotulo: 'Resolvidas (validadas/n.a.)', cor: 'var(--serie-2)' }
  ];
  const grade = [0, 0.5, 1].map((f) => {
    const v = Math.round(total * f);
    return [svg('line', { class: 'eixo', x1: m.e, x2: L - m.d, y1: y(v), y2: y(v) }),
      svg('text', { class: 'rotulo-eixo', x: m.e - 6, y: y(v) + 4, 'text-anchor': 'end' }, [document.createTextNode(String(v))])];
  }).flat();
  const rotX = [0, n - 1].filter((v, i, a) => a.indexOf(v) === i).map((i) =>
    svg('text', { class: 'rotulo-eixo', x: x(i), y: A - 6, 'text-anchor': n === 1 ? 'middle' : (i === 0 ? 'start' : 'end') },
      [document.createTextNode(serie[i].dia.split('-').reverse().slice(0, 2).join('/'))]));

  const linhas = series.flatMap((s) => {
    const pts = serie.map((p, i) => [x(i), y(p[s.chave])]);
    const ultimo = serie[n - 1][s.chave];
    return [
      n > 1 ? svg('polyline', { class: 'serie', stroke: s.cor, points: pts.map((p) => p.join(',')).join(' ') }) : null,
      ...pts.map(([px, py], i) => svg('circle', { class: 'ponto', cx: px, cy: py, r: 4, fill: s.cor }, [
        svg('title', {}, [document.createTextNode(`${serie[i].dia}: ${s.rotulo} ${serie[i][s.chave]} de ${total}`)])])),
      svg('text', { x: pts[n - 1][0] + 8, y: pts[n - 1][1] + 4, fill: 'var(--tinta-2)', 'font-size': 11 }, [document.createTextNode(`${ultimo}`)])
    ];
  });
  return el('div', { className: 'grafico-linha' }, [
    svg('svg', { viewBox: `0 0 ${L} ${A}`, role: 'img', 'aria-label': 'Evolução diária das lacunas com resposta e resolvidas' }, [...grade, ...rotX, ...linhas]),
    el('div', { className: 'legenda-serie' }, series.map((s) => el('span', {}, [el('i', { style: `background:${s.cor}` }), s.rotulo])))
  ]);
}
