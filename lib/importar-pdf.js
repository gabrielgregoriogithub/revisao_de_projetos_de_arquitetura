// Importa um PDF de pranchas como novo projeto/revisão: renderiza as pranchas (poppler), extrai o texto,
// cria projeto.json e lacunas.json vazio. As lacunas são escritas depois pelo Claude Code.
import { mkdir, writeFile, readdir, copyFile, access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lerBbox, paraReferencia } from './texto-pdf.js';

const executar = promisify(execFile);
export const MAX_PDF = 80 * 1024 * 1024;

/** Localiza um executável do poppler. Ordem: POPPLER_BIN, PATH. O pdftotext do xpdf não serve (sem -bbox). */
const cachePoppler = new Map();
export async function poppler(nome) {
  if (cachePoppler.has(nome)) return cachePoppler.get(nome);
  // Todas as pastas do PATH que têm o executável (no Windows pode haver o xpdf antes do poppler).
  const pastas = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  const ext = process.platform === 'win32' ? '.exe' : '';
  const doPath = [];
  for (const p of pastas) {
    const c = path.join(p, nome + ext);
    if (await access(c).then(() => true, () => false)) doPath.push(c);
  }
  const candidatos = [process.env.POPPLER_BIN && path.join(process.env.POPPLER_BIN, nome + ext), ...doPath].filter(Boolean);
  for (const c of candidatos) {
    const { stdout = '', stderr = '' } = await executar(c, ['-v']).catch((e) => e);
    if (/poppler/i.test(`${stdout}${stderr}`)) { cachePoppler.set(nome, c); return c; }
  }
  throw Object.assign(new Error(`${nome} (poppler) não encontrado. Defina POPPLER_BIN com a pasta "bin" do poppler.`), { codigo: 501 });
}

const rodar = (bin, args) => executar(bin, args, { maxBuffer: 1 << 26, timeout: 180000 }).catch((e) => {
  if (e.killed) throw Object.assign(new Error('O PDF demorou demais para processar (mais de 3 minutos).'), { codigo: 422 });
  // O poppler escreve avisos de sintaxe no stderr e ainda assim gera a saída; só falha de verdade sem código 0/1.
  if (e.code === 'ENOENT') throw e;
  return e;
});

/**
 * @param {{destino:string, pdf:Buffer|string, nome:string, revisao?:string|null, obraId:string, escala?:number|null}} o
 */
export async function importarPdf(opcoes) {
  if (await access(opcoes.destino).then(() => true, () => false)) throw Object.assign(new Error('Já existe um projeto com esse id.'), { codigo: 409 });
  try {
    return await importar(opcoes);
  } catch (erro) {
    // Nunca deixa um projeto pela metade no catálogo.
    await rm(opcoes.destino, { recursive: true, force: true });
    throw erro;
  }
}

async function importar({ destino, pdf, nome, revisao = null, obraId, escala = null, arquivo = 'pranchas.pdf' }) {
  const pranchasDir = path.join(destino, 'pranchas');
  await mkdir(pranchasDir, { recursive: true });
  const fonte = path.join(destino, 'fonte.pdf');
  if (Buffer.isBuffer(pdf)) await writeFile(fonte, pdf); else await copyFile(pdf, fonte);

  const [pdftoppm, pdftotext, pdfinfo] = await Promise.all([poppler('pdftoppm'), poppler('pdftotext'), poppler('pdfinfo')]);
  const { stdout: info = '' } = await rodar(pdfinfo, [fonte]);
  const paginas = Number(String(info).match(/Pages:\s+(\d+)/)?.[1] ?? 0);
  if (!paginas) throw Object.assign(new Error('Não foi possível ler o PDF (arquivo corrompido ou protegido).'), { codigo: 422 });
  if (paginas > 60) throw Object.assign(new Error('PDF com mais de 60 páginas: divida o conjunto.'), { codigo: 413 });

  await rodar(pdftoppm, ['-r', '120', '-png', fonte, path.join(pranchasDir, 'prancha')]);
  await rodar(pdftoppm, ['-r', '12', '-png', fonte, path.join(pranchasDir, 'mini')]);
  const arquivos = await readdir(pranchasDir);
  const numeroDe = (a) => Number(a.match(/-(\d+)\.png$/)[1]);
  const principais = arquivos.filter((a) => /^prancha-\d+\.png$/.test(a));
  for (const m of arquivos.filter((a) => /^mini-\d+\.png$/.test(a))) await copyFile(path.join(pranchasDir, m), path.join(pranchasDir, `prancha-${numeroDe(m)}-mini.png`));
  // pdftoppm preenche com zeros conforme o total de páginas (prancha-01.png…); normaliza o nome para o número.
  const pranchas = principais.map((a) => ({ arquivo: a, numero: numeroDe(a) })).sort((a, b) => a.numero - b.numero);
  if (!pranchas.length) throw Object.assign(new Error('Nenhuma prancha pôde ser renderizada a partir do PDF.'), { codigo: 422 });
  const minis = new Set(arquivos.filter((a) => /^mini-\d+\.png$/.test(a)).map(numeroDe));

  const [, w, h] = String(info).match(/Page size:\s+([\d.]+) x ([\d.]+)/) ?? [];
  const rot = Number(String(info).match(/Page rot:\s+(\d+)/)?.[1] ?? 0);
  const [lw, lh] = rot % 180 === 90 ? [Number(h), Number(w)] : [Number(w), Number(h)];
  const referencia = { largura: Math.round((lw / 72) * 40), altura: Math.round((lh / 72) * 40) };

  const projeto = {
    nome, etapa: revisao ? `Revisão ${revisao}` : 'Análise pendente', revisao, obraId, arquivo, analisadoEm: null, referencia,
    escala: escala ? { denominador: escala, metrosPorRef: +((25.4 / 40) * escala / 1000).toFixed(6), origem: `Escala 1:${escala} informada na importação (conferir com uma cota)`, calibrada: false } : null,
    pranchas: pranchas.map(({ arquivo: a, numero: n }) => ({
      numero: n, titulo: `Prancha ${n}`, folha: String(n).padStart(2, '0'), imagem: a,
      miniatura: minis.has(n) ? `prancha-${n}-mini.png` : a, resolucaoDpi: 120
    }))
  };
  await writeFile(path.join(destino, 'projeto.json'), `${JSON.stringify(projeto, null, 2)}\n`);
  await writeFile(path.join(destino, 'lacunas.json'), '[]\n');

  // Camada de texto (quando existir)
  const tmp = await mkdtemp(path.join(tmpdir(), 'lacunas-imp-'));
  try {
    const saida = path.join(tmp, 't.html');
    await rodar(pdftotext, ['-bbox', fonte, saida]);
    const pags = lerBbox(await readFile(saida, 'utf8').catch(() => ''));
    const texto = { geradoEm: new Date().toISOString(), arquivo, pranchas: {} };
    for (const p of projeto.pranchas) if (pags[p.numero - 1]) texto.pranchas[p.numero] = paraReferencia(pags[p.numero - 1], referencia);
    await writeFile(path.join(destino, 'texto-pdf.json'), `${JSON.stringify(texto, null, 2)}\n`);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
  return projeto;
}
