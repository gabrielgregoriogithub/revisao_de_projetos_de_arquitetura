// Utilitários HTTP: respostas JSON, arquivos estáticos seguros, leitura de corpo e log estruturado.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const MAX_CORPO = 64 * 1024;
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

/** Log estruturado (uma linha JSON por evento). */
export function log(nivel, mensagem, dados = {}) {
  const linha = JSON.stringify({ em: new Date().toISOString(), nivel, mensagem, ...dados });
  (nivel === 'erro' ? process.stderr : process.stdout).write(`${linha}\n`);
}

export class ErroHttp extends Error {
  constructor(codigo, mensagem) { super(mensagem); this.codigo = codigo; }
}

export function enviarJson(res, codigo, corpo) {
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(corpo));
}

export function enviar(res, codigo, tipo, corpo, extras = {}) {
  res.writeHead(codigo, { 'Content-Type': tipo, 'Cache-Control': 'no-store', ...extras });
  res.end(corpo);
}

/** Serve um arquivo apenas se estiver dentro de `base` e tiver extensão permitida. */
export async function servirArquivo(res, base, relativo, { cache = false, tipo: tipoForcado, disposicao } = {}) {
  const alvo = path.resolve(base, `.${path.posix.normalize(`/${relativo}`)}`);
  const tipo = tipoForcado ?? TIPOS[path.extname(alvo).toLowerCase()];
  if (!alvo.startsWith(base + path.sep) || !tipo) return enviarJson(res, 404, { erro: 'Não encontrado.' });
  try {
    const conteudo = await readFile(alvo);
    res.writeHead(200, {
      'Content-Type': tipo, 'Cache-Control': cache ? 'max-age=3600' : 'no-cache',
      ...(disposicao ? { 'Content-Disposition': disposicao } : {})
    });
    res.end(conteudo);
  } catch {
    enviarJson(res, 404, { erro: 'Não encontrado.' });
  }
}

const UTF8_ESTRITO = new TextDecoder('utf-8', { fatal: true });

export function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let tamanho = 0;
    const partes = [];
    req.on('data', (parte) => {
      tamanho += parte.length;
      if (tamanho > MAX_CORPO) {
        reject(new ErroHttp(413, 'Corpo grande demais.'));
        req.destroy();
        return;
      }
      partes.push(parte);
    });
    req.on('end', () => {
      let texto;
      try {
        texto = UTF8_ESTRITO.decode(Buffer.concat(partes));
      } catch {
        reject(new ErroHttp(400, 'Codificação inválida: envie o corpo em UTF-8.'));
        return;
      }
      try {
        resolve(JSON.parse(texto || '{}'));
      } catch {
        reject(new ErroHttp(400, 'JSON inválido.'));
      }
    });
    req.on('error', reject);
  });
}

const HOST_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

/**
 * Protege rotas de escrita: Host local (anti DNS rebinding), Origin local quando presente
 * e Content-Type JSON (formulários de outros sites não conseguem enviar sem preflight CORS).
 */
export function exigirRequisicaoLocal(req) {
  if (!HOST_LOCAL.test(req.headers.host ?? '')) throw new ErroHttp(403, 'Host não permitido.');
  const origem = req.headers.origin;
  if (origem) {
    let host = '';
    try { host = new URL(origem).host; } catch { /* origem inválida */ }
    if (!HOST_LOCAL.test(host)) throw new ErroHttp(403, 'Origem não permitida.');
  }
  if (!(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
    throw new ErroHttp(415, 'Envie Content-Type: application/json.');
  }
}

/** Upload binário: mesmas checagens de Host/Origin + cabeçalho próprio (força preflight CORS em outros sites). */
export function exigirUploadLocal(req) {
  if (!HOST_LOCAL.test(req.headers.host ?? '')) throw new ErroHttp(403, 'Host não permitido.');
  const origem = req.headers.origin;
  if (origem) {
    let host = '';
    try { host = new URL(origem).host; } catch { /* origem inválida */ }
    if (!HOST_LOCAL.test(host)) throw new ErroHttp(403, 'Origem não permitida.');
  }
  if (req.headers['x-lacunas-upload'] !== '1') throw new ErroHttp(403, 'Upload sem cabeçalho X-Lacunas-Upload.');
}

/** Lê o corpo binário com limite de tamanho. */
export function lerBinario(req, max) {
  return new Promise((resolve, reject) => {
    if (Number(req.headers['content-length'] ?? 0) > max) { reject(new ErroHttp(413, 'Arquivo acima do limite.')); req.resume(); return; }
    let tamanho = 0;
    const partes = [];
    req.on('data', (p) => {
      tamanho += p.length;
      if (tamanho > max) { reject(new ErroHttp(413, 'Arquivo acima do limite.')); req.destroy(); return; }
      partes.push(p);
    });
    req.on('end', () => resolve(Buffer.concat(partes)));
    req.on('error', reject);
  });
}

export const listaQuery = (url, nome, permitidos) => {
  const v = url.searchParams.get(nome);
  if (!v) return null;
  return v.split(',').map((s) => s.trim()).filter((s) => permitidos.includes(s));
};
