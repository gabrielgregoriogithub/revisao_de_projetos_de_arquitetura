// Geometria das medições: área (shoelace) e perímetro de polígonos no sistema de referência,
// convertidos para metros pela escala da prancha. Compartilhado com o navegador.

/** @param {number[][]} pontos [[x,y],...] em unidades de referência */
export function areaRef(pontos) {
  let s = 0;
  for (let i = 0; i < pontos.length; i++) {
    const [x1, y1] = pontos[i];
    const [x2, y2] = pontos[(i + 1) % pontos.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

export function perimetroRef(pontos, fechado = true) {
  let s = 0;
  const n = fechado ? pontos.length : pontos.length - 1;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = pontos[i];
    const [x2, y2] = pontos[(i + 1) % pontos.length];
    s += Math.hypot(x2 - x1, y2 - y1);
  }
  return s;
}

/** Escala efetiva de uma prancha (a da prancha prevalece sobre a do projeto). */
export function escalaDe(projeto, numeroPrancha) {
  const p = projeto?.pranchas?.find((x) => x.numero === numeroPrancha);
  return p?.escala ?? projeto?.escala ?? null;
}

const arred = (v, casas = 2) => Math.round(v * 10 ** casas) / 10 ** casas;

/**
 * Área (m²) e perímetro (m) de um ambiente com um ou mais polígonos.
 * Se alguma prancha não tiver escala, devolve null — nunca chuta.
 */
export function medirAmbiente(projeto, ambiente) {
  let area = 0;
  let perimetro = 0;
  for (const pol of ambiente.poligonos ?? []) {
    const esc = escalaDe(projeto, pol.prancha);
    if (!esc?.metrosPorRef || pol.pontos.length < 3) return { area: null, perimetro: null, motivo: `Prancha ${pol.prancha} sem escala definida.` };
    area += areaRef(pol.pontos) * esc.metrosPorRef ** 2;
    perimetro += perimetroRef(pol.pontos) * esc.metrosPorRef;
  }
  return { area: arred(area), perimetro: arred(perimetro), motivo: null };
}

/** Normaliza nomes para casar ambiente do quadro com ambiente citado nas lacunas. */
export const chaveAmbiente = (nome) => String(nome ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
