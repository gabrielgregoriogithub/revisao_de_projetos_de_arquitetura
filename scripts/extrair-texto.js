// Extrai a camada de texto do PDF (palavras + caixas) para dados/projetos/<id>/texto-pdf.json,
// no sistema de coordenadas de referência das pranchas.
// Uso: node scripts/extrair-texto.js <arquivo.pdf> [--projeto=<id>]
// Textos em fontes SHX do AutoCAD viram vetores e NÃO aparecem aqui — o resumo informa a cobertura.
import { writeFile, readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { projetoAlvo, poppler, executar } from './comum.js';
import { lerBbox, paraReferencia } from '../lib/texto-pdf.js';

const pdf = process.argv[2];
if (!pdf || pdf.startsWith('--')) { process.stderr.write('Uso: node scripts/extrair-texto.js <arquivo.pdf> [--projeto=<id>]\n'); process.exit(1); }

const { store, dir, id } = await projetoAlvo();
const { projeto } = await store.carregar();
const pdftotext = await poppler('pdftotext');
const tmp = await mkdtemp(path.join(tmpdir(), 'lacunas-texto-'));
try {
  const saida = path.join(tmp, 'texto.html');
  // O PDF tem streams com erro de sintaxe que o poppler contorna; ele avisa no stderr mas gera a saída.
  await executar(pdftotext, ['-bbox', pdf, saida], { maxBuffer: 64 * 1024 * 1024 }).catch(() => {});
  const paginas = lerBbox(await readFile(saida, 'utf8'));
  const resultado = { geradoEm: new Date().toISOString(), arquivo: path.basename(pdf), pranchas: {} };
  for (const p of projeto.pranchas) {
    if (paginas[p.numero - 1]) resultado.pranchas[p.numero] = paraReferencia(paginas[p.numero - 1], projeto.referencia);
  }
  await writeFile(path.join(dir, 'texto-pdf.json'), `${JSON.stringify(resultado, null, 2)}\n`);
  for (const [n, palavras] of Object.entries(resultado.pranchas)) {
    process.stdout.write(`Prancha ${n}: ${palavras.length} palavras extraídas (${palavras.filter((w) => w.texto === 'A').length} símbolos "A" de acabamento de parede).\n`);
  }
  process.stdout.write(`Projeto ${id}: texto-pdf.json gravado. Textos em fonte SHX (nomes de ambientes, cotas, PD) não são extraíveis.\n`);
} finally {
  await rm(tmp, { recursive: true, force: true });
}
