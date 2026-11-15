// Utilitários compartilhados pelos scripts de linha de comando.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { criarCatalogo } from '../lib/projetos.js';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DADOS = process.env.LACUNAS_DADOS ?? path.join(RAIZ, 'dados');
export const executar = promisify(execFile);

/** Projeto alvo: --projeto=<id> ou o projeto ativo. */
export async function projetoAlvo() {
  const catalogo = criarCatalogo(DADOS);
  const arg = process.argv.find((a) => a.startsWith('--projeto='));
  const id = arg ? arg.split('=')[1] : await catalogo.ativo();
  return { id, store: await catalogo.store(id), dir: await catalogo.dir(id), catalogo };
}

export { poppler } from '../lib/importar-pdf.js';
