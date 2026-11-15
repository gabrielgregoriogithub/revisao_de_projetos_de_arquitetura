// Leitura da saída `pdftotext -bbox` (poppler) e conversão para o sistema de referência das pranchas.

const decodificar = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/** Palavras por página (coordenadas em pontos, como o pdftotext entrega). */
export function lerBbox(html) {
  const paginas = [];
  for (const [, w, h, corpo] of html.matchAll(/<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g)) {
    const palavras = [...corpo.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)]
      .map(([, x0, y0, x1, y1, t]) => ({ x0: +x0, y0: +y0, x1: +x1, y1: +y1, texto: decodificar(t) }));
    paginas.push({ largura: +w, altura: +h, palavras });
  }
  return paginas;
}

/**
 * Converte as palavras de uma página para o sistema de referência.
 * Páginas rotacionadas (90/270°) chegam do pdftotext com as coordenadas já "deitadas", mas com largura/altura
 * da página sem rotação. Critério determinístico: se a orientação da página difere da referência, troca.
 */
export function paraReferencia(pagina, referencia) {
  const deitada = (pagina.largura < pagina.altura) !== (referencia.largura < referencia.altura);
  const [lw, lh] = deitada ? [pagina.altura, pagina.largura] : [pagina.largura, pagina.altura];
  const fx = referencia.largura / lw;
  const fy = referencia.altura / lh;
  return pagina.palavras.map((w) => ({
    texto: w.texto, x: +(w.x0 * fx).toFixed(2), y: +(w.y0 * fy).toFixed(2), w: +((w.x1 - w.x0) * fx).toFixed(2), h: +((w.y1 - w.y0) * fy).toFixed(2)
  }));
}
