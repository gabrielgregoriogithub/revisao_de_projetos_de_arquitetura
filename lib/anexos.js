// Anexos de evidência: validação por conteúdo (assinatura do arquivo), hash e gravação segura.
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile, rename, access } from 'node:fs/promises';
import path from 'node:path';
import { ID_ANEXO, limparNome } from './dominio/anexo-id.js';

export { ID_ANEXO, limparNome };

export const MAX_ANEXO = 10 * 1024 * 1024;
export const TIPOS_ANEXO = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', txt: 'text/plain; charset=utf-8'
};
const TEXTO_EXT = ['txt', 'eml', 'csv', 'md'];
const utf8 = new TextDecoder('utf-8', { fatal: true });

/**
 * Detecta o tipo real pelo conteúdo — nunca confia na extensão ou no Content-Type enviado.
 * Texto (txt/eml/csv/md) só é aceito se for UTF-8 válido e sem bytes nulos.
 * @returns {'pdf'|'png'|'jpg'|'webp'|'txt'|null}
 */
export function detectarTipo(buf, nome = '') {
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  const ext = path.extname(nome).slice(1).toLowerCase();
  if (TEXTO_EXT.includes(ext) && !buf.includes(0)) {
    try { utf8.decode(buf); return 'txt'; } catch { return null; }
  }
  return null;
}

/**
 * Valida e grava o anexo em <dir>/anexos/. Devolve os metadados que vão para a evidência.
 * @param {string} dir pasta do projeto
 */
export async function salvarAnexo(dir, buf, nomeOriginal) {
  if (!buf.length) return { ok: false, codigo: 400, erro: 'Arquivo vazio.' };
  if (buf.length > MAX_ANEXO) return { ok: false, codigo: 413, erro: 'Arquivo acima de 10 MB.' };
  const tipo = detectarTipo(buf, nomeOriginal);
  if (!tipo) return { ok: false, codigo: 415, erro: 'Tipo não aceito. Envie PDF, PNG, JPG, WEBP ou texto (.txt, .eml, .csv, .md) em UTF-8.' };

  const id = `${randomUUID()}.${tipo}`;
  const pasta = path.join(dir, 'anexos');
  await mkdir(pasta, { recursive: true });
  const tmp = path.join(pasta, `${id}.tmp`);
  await writeFile(tmp, buf);
  await rename(tmp, path.join(pasta, id));
  return {
    ok: true,
    anexo: { id, nome: limparNome(nomeOriginal), tipo, tamanho: buf.length, sha256: createHash('sha256').update(buf).digest('hex'), enviadoEm: new Date().toISOString() }
  };
}

export const anexoExiste = (dir, id) => ID_ANEXO.test(id) ? access(path.join(dir, 'anexos', id)).then(() => true, () => false) : Promise.resolve(false);
