// Importação de PDF no navegador (modo estático): renderiza as pranchas e extrai o texto com PDF.js.
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs';
const WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';
const DPI = 120;
const MAX_LADO = 7000;          // limita o tamanho do canvas
const MAX_PAGINAS = 30;

const paraBlob = (canvas) => new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar a imagem da prancha.'))), 'image/png'));

async function renderizar(pagina, escala) {
  const vp = pagina.getViewport({ scale: escala });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(vp.width);
  canvas.height = Math.ceil(vp.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await pagina.render({ canvasContext: ctx, viewport: vp }).promise;
  const blob = await paraBlob(canvas);
  canvas.width = canvas.height = 0; // libera memória
  return blob;
}

/**
 * @param {File} arquivo
 * @param {(msg:string)=>void} progresso
 * @returns {Promise<{referencia, pranchas:{numero,blob,mini}[], texto:Record<number,object[]>}>}
 */
export async function lerPdf(arquivo, progresso = () => {}) {
  const pdfjs = await import(PDFJS);
  pdfjs.GlobalWorkerOptions.workerSrc = WORKER;
  const dados = new Uint8Array(await arquivo.arrayBuffer());
  if (String.fromCharCode(...dados.subarray(0, 5)) !== '%PDF-') throw new Error('O arquivo não é um PDF.');
  const doc = await pdfjs.getDocument({ data: dados }).promise;
  if (doc.numPages > MAX_PAGINAS) throw new Error(`PDF com ${doc.numPages} páginas: o limite no navegador é ${MAX_PAGINAS}.`);

  const primeira = (await doc.getPage(1)).getViewport({ scale: 1 }); // pontos, já com a rotação
  const referencia = { largura: Math.round((primeira.width / 72) * 40), altura: Math.round((primeira.height / 72) * 40) };
  const pranchas = [];
  const texto = {};
  for (let n = 1; n <= doc.numPages; n++) {
    progresso(`Renderizando prancha ${n} de ${doc.numPages}…`);
    const pagina = await doc.getPage(n);
    const vp1 = pagina.getViewport({ scale: 1 });
    const escala = Math.min(DPI / 72, MAX_LADO / Math.max(vp1.width, vp1.height));
    pranchas.push({ numero: n, blob: await renderizar(pagina, escala), mini: await renderizar(pagina, 12 / 72) });
    // Texto: coordenadas do viewport (já rotacionado) → sistema de referência (página a 40 dpi, escalada à 1ª página)
    const fx = referencia.largura / vp1.width;
    const fy = referencia.altura / vp1.height;
    const conteudo = await pagina.getTextContent();
    texto[n] = conteudo.items.filter((i) => i.str?.trim()).map((i) => {
      const t = pdfjs.Util.transform(vp1.transform, i.transform);
      const altura = Math.hypot(t[2], t[3]) || 1;
      return { texto: i.str.trim(), x: +(t[4] * fx).toFixed(2), y: +((t[5] - altura) * fy).toFixed(2), w: +((i.width || altura) * fx).toFixed(2), h: +(altura * fy).toFixed(2) };
    });
    pagina.cleanup();
  }
  await doc.destroy();
  return { referencia, pranchas, texto };
}
