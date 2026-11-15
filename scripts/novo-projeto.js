// Cria um projeto (ou nova revisão de uma obra) a partir de um PDF.
// Uso: node scripts/novo-projeto.js <id> <arquivo.pdf> --nome="LOFT – Osasco" [--revisao=R01] [--obra=loft-osasco] [--escala=75]
import path from 'node:path';
import { DADOS } from './comum.js';
import { ID_PROJETO } from '../lib/projetos.js';
import { importarPdf } from '../lib/importar-pdf.js';

const [id, pdf] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const opt = Object.fromEntries(process.argv.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split(/=(.*)/s).slice(0, 2)));
if (!ID_PROJETO.test(id ?? '') || !pdf) {
  process.stderr.write('Uso: node scripts/novo-projeto.js <id> <arquivo.pdf> --nome="…" [--revisao=R01] [--obra=<id-da-obra>] [--escala=75]\n');
  process.exit(1);
}
const projeto = await importarPdf({
  destino: path.join(DADOS, 'projetos', id), pdf, nome: opt.nome ?? id, revisao: opt.revisao ?? null,
  obraId: opt.obra ?? id, escala: Number(opt.escala) || null, arquivo: path.basename(pdf)
});
process.stdout.write(`Projeto ${id} criado com ${projeto.pranchas.length} pranchas. Próximo passo: o Claude Code analisa as pranchas e preenche lacunas.json.\n`);
