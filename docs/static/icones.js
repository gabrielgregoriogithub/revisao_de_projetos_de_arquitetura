// Ícones de traço (24×24, 1.6px) — conjunto próprio e consistente.
import { svg } from './dom.js';

const P = (d) => ['path', { d }];
const C = (cx, cy, r) => ['circle', { cx, cy, r }];
const R = (x, y, w, h, rx = 2) => ['rect', { x, y, width: w, height: h, rx }];

const ICONES = {
  visao: [R(3, 3, 7, 9), R(14, 3, 7, 5), R(14, 12, 7, 9), R(3, 16, 7, 5)],
  projeto: [P('M3 21h18'), P('M5 21V8l7-5 7 5v13'), P('M9 21v-6h6v6')],
  prancha: [R(3, 4, 18, 16), P('M3 9h18'), P('M9 9v11'), P('M14 14h4')],
  lacunas: [P('M4 6h4'), P('M12 6h8'), P('M4 12h10'), P('M18 12h2'), P('M4 18h2'), P('M10 18h10')],
  compat: [C(8, 8, 5), C(16, 16, 5), P('M12 4.5V4'), P('M4.5 12H4')],
  orcamento: [P('M4 4h16v16H4z'), P('M4 9h16'), P('M9 9v11'), P('M12 13h5'), P('M12 17h3')],
  relatorio: [P('M6 3h9l4 4v14H6z'), P('M15 3v4h4'), P('M9 12h7'), P('M9 16h5')],
  config: [C(12, 12, 3), P('M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1')],
  menu: [P('M4 7h16M4 12h16M4 17h16')],
  mais: [P('M12 5v14M5 12h14')],
  menos: [P('M5 12h14')],
  ajustar: [P('M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5')],
  real: [R(6, 6, 12, 12, 1), P('M10 10h4v4h-4z')],
  anterior: [P('M15 18l-6-6 6-6')],
  proximo: [P('M9 18l6-6-6-6')],
  fechar: [P('M6 6l12 12M18 6 6 18')],
  baixar: [P('M12 4v11'), P('M7 11l5 5 5-5'), P('M5 20h14')],
  abrir: [P('M14 4h6v6'), P('M20 4l-9 9'), P('M18 14v6H4V6h6')],
  alerta: [P('M12 3 2 20h20z'), P('M12 10v4'), P('M12 17h.01')],
  check: [P('M5 12l5 5 9-10')],
  lista: [P('M8 6h12M8 12h12M8 18h12'), P('M4 6h.01M4 12h.01M4 18h.01')],
  cartoes: [R(4, 4, 7, 7), R(13, 4, 7, 7), R(4, 13, 7, 7), R(13, 13, 7, 7)],
  alvo: [C(12, 12, 8), C(12, 12, 3)],
  historico: [P('M3 12a9 9 0 1 0 3-6.7'), P('M3 4v4h4'), P('M12 8v4l3 2')],
  clipe: [P('M15 7l-6.5 6.5a2.1 2.1 0 0 0 3 3L18 10a4 4 0 0 0-5.7-5.7L5.8 10.8a6 6 0 0 0 8.5 8.5L20 13.5')],
  lixo: [P('M4 7h16'), P('M10 11v6M14 11v6'), P('M6 7l1 13h10l1-13'), P('M9 7V4h6v3')],
  vazio: [R(4, 4, 16, 16, 3), P('M9 12h6')],
  teclado: [R(2, 6, 20, 12), P('M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10')]
};

/** @param {keyof typeof ICONES} nome */
export function icone(nome, rotulo) {
  const formas = ICONES[nome] ?? ICONES.vazio;
  return svg('svg', { class: 'ic', viewBox: '0 0 24 24', 'aria-hidden': rotulo ? undefined : 'true', role: rotulo ? 'img' : undefined, 'aria-label': rotulo },
    formas.map(([tag, attrs]) => svg(tag, attrs)));
}

/** Marca do Lacunas.obra: prancha com um trecho faltando (a lacuna). */
export function logotipo() {
  return svg('svg', { class: 'logo-marca', viewBox: '0 0 26 26', 'aria-hidden': 'true' }, [
    svg('rect', { x: 1, y: 1, width: 24, height: 24, rx: 6, fill: 'var(--acento)' }),
    svg('path', { d: 'M7 8h12M7 13h5M16 13h3M7 18h12', stroke: '#fff', 'stroke-width': 2, 'stroke-linecap': 'round', fill: 'none' }),
    svg('rect', { x: 12.5, y: 10.5, width: 3, height: 5, rx: 1, fill: 'none', stroke: '#fff', 'stroke-width': 1.2, 'stroke-dasharray': '1.4 1.2' })
  ]);
}
