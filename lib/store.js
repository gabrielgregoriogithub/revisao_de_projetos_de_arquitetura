// Store em disco (Node): adaptador de arquivos JSON para o núcleo compartilhado.
import { readFile, writeFile, rename, mkdir, copyFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { criarNucleo } from './nucleo-store.js';
import { anexoExiste } from './anexos.js';

export { STATUS, VERSAO_ESQUEMA, TIPOS_EVIDENCIA, validarResposta, mesclarLacunas, diferencas } from './nucleo-store.js';

const carimbo = () => new Date().toISOString().replace(/[:.]/g, '-');

/** Adaptador de armazenamento em disco: JSON com gravação atômica e backups em <dir>/backups/. */
export function adaptadorDisco(dir) {
  const arq = (nome) => path.join(dir, nome);
  return {
    async ler(nome, padrao) {
      try {
        return JSON.parse(await readFile(arq(nome), 'utf8'));
      } catch (erro) {
        if (erro.code === 'ENOENT' && padrao !== undefined) return padrao;
        throw new Error(`Falha ao ler ${nome}: ${erro.message}`);
      }
    },
    async gravar(nome, dados) {
      const tmp = `${arq(nome)}.${process.pid}.tmp`;
      await writeFile(tmp, `${JSON.stringify(dados, null, 2)}\n`, 'utf8');
      await rename(tmp, arq(nome));
    },
    async backup(nome) {
      const destino = path.join(dir, 'backups', `${path.parse(nome).name}-${carimbo()}.json`);
      try {
        await mkdir(path.dirname(destino), { recursive: true });
        await copyFile(arq(nome), destino);
        return destino;
      } catch (erro) {
        if (erro.code === 'ENOENT') return null;
        throw erro;
      }
    },
    async versao(nomes) {
      const partes = await Promise.all(nomes.map(async (n) => {
        try { const s = await stat(arq(n)); return `${s.mtimeMs.toFixed(0)}:${s.size}`; } catch { return '0'; }
      }));
      return partes.join('|');
    },
    anexoExiste: (id) => anexoExiste(dir, id)
  };
}

/** @param {string} dir pasta do projeto (projeto.json, lacunas.json, respostas.json…) */
export function criarStore(dir) {
  return { ...criarNucleo(adaptadorDisco(dir)), dir };
}
