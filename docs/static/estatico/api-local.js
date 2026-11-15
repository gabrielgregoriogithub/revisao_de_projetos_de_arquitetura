// API do modo estático (GitHub Pages): mesmas rotas do servidor, executadas no navegador pelo núcleo compartilhado.
import { criarNucleo } from '../../lib/nucleo-store.js';
import { montarEap, COLUNAS_EAP } from '../../lib/eap-hierarquica.js';
import { processarRespostas } from '../../lib/dominio/processamento.js';
import { compararRevisoes } from '../../lib/dominio/revisoes.js';
import { kv, adaptadorNavegador } from './armazenamento.js';
import { lerPdf } from './pdf-navegador.js';

const BASE = new URL('./', document.baseURI);
const nucleos = new Map();
const urls = new Map();       // "<projeto>/<arquivo>" → URL da imagem
const urlsAnexo = new Map();  // id do anexo → URL
let demos = null;

const erro = (codigo, mensagem) => Object.assign(new Error(mensagem), { codigo });
const slug = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);

async function indiceDemos() {
  demos ??= fetch(new URL('dados/projetos/indice.json', BASE)).then((r) => (r.ok ? r.json() : [])).catch(() => []);
  return demos;
}
async function listar() {
  return [...(await indiceDemos()).map((p) => ({ ...p, demo: true })), ...((await kv.ler('indice-local')) ?? [])];
}
async function ativo() {
  const lista = await listar();
  if (!lista.length) throw erro(404, 'Nenhum projeto. Importe um PDF em Projeto › Base de pranchas.');
  const salvo = await kv.ler('ativo');
  return lista.some((p) => p.id === salvo) ? salvo : lista[0].id;
}
async function nucleo(id) {
  if (!nucleos.has(id)) {
    const demo = (await indiceDemos()).some((p) => p.id === id);
    if (!demo && !((await kv.ler('indice-local')) ?? []).some((p) => p.id === id)) throw erro(404, `Projeto ${id} não encontrado.`);
    nucleos.set(id, criarNucleo(adaptadorNavegador(id, demo ? new URL(`dados/projetos/${id}/`, BASE).href : null)));
  }
  return nucleos.get(id);
}

/** Prepara as URLs das pranchas (arquivo publicado ou blob local) e dos anexos de um projeto. */
async function prepararUrls(id, projeto) {
  const demo = (await indiceDemos()).some((p) => p.id === id);
  for (const p of projeto.pranchas) {
    for (const arq of [p.imagem, p.miniatura].filter(Boolean)) {
      const k = `${id}/${arq}`;
      if (urls.has(k)) continue;
      const blob = demo ? null : await kv.ler(`b:${id}:pranchas/${arq}`);
      urls.set(k, blob ? URL.createObjectURL(blob) : new URL(`dados/projetos/${id}/pranchas/${encodeURIComponent(arq)}`, BASE).href);
    }
  }
  for (const chave of await kv.chaves(`b:${id}:anexos/`)) {
    const aid = chave.split('/').pop();
    if (!urlsAnexo.has(aid)) urlsAnexo.set(aid, URL.createObjectURL(await kv.ler(chave)));
  }
}

export const urlPrancha = (arquivo, id) => urls.get(`${id}/${arquivo}`) ?? '';
export const urlAnexo = (aid) => urlsAnexo.get(aid) ?? '#';

const responder = (r, chave) => { if (!r.ok) throw erro(r.codigo, r.erro); return chave ? r[chave] : r; };

/** Mesmo contrato do chamar() do servidor: devolve o JSON ou lança Error com .codigo. */
export async function chamar(caminho, { method = 'GET', body } = {}) {
  const url = new URL(caminho, BASE);
  const rota = url.pathname.replace(new URL('.', BASE).pathname, '/').replace(/^\/+/, '/');
  const corpo = body ? JSON.parse(body) : {};
  const autor = typeof corpo.autor === 'string' ? corpo.autor.slice(0, 80) : null;
  const id = await ativo().catch(() => null);
  const s = id ? await nucleo(id) : null;
  const m = (re) => rota.match(re);
  let k;

  if (method === 'GET' && rota === '/api/projetos') return { ativo: id, projetos: await listar() };
  if (method === 'PUT' && rota === '/api/projetos/ativo') {
    if (!(await listar()).some((p) => p.id === corpo.id)) throw erro(404, `Projeto ${corpo.id} não encontrado.`);
    await kv.gravar('ativo', corpo.id);
    return { ativo: corpo.id };
  }
  if (!s) throw erro(404, 'Nenhum projeto. Importe um PDF em Projeto › Base de pranchas.');
  if (method === 'GET' && rota === '/api/projeto') {
    const dados = await s.carregar();
    await prepararUrls(id, dados.projeto);
    return { ...dados, projetoId: id, versao: `${id}#${await s.versao()}` };
  }
  if (method === 'GET' && rota === '/api/versao') return { versao: `${id}#${await s.versao()}` };
  if (method === 'GET' && (k = m(/^\/api\/lacunas\/([\w-]+)\/historico$/))) return { eventos: await s.historico(k[1]) };
  if (method === 'PUT' && (k = m(/^\/api\/lacunas\/([\w-]+)\/resposta$/))) return responder(await s.salvarResposta(k[1], corpo, { origem: 'app', autor }), 'resposta');
  if (method === 'POST' && rota === '/api/lacunas') return responder(await s.criarLacuna(corpo, { autor }), 'lacuna');
  if (method === 'POST' && rota === '/api/lacunas/status-lote') return { resultados: await s.alterarStatusEmLote(corpo.ids ?? [], corpo.status, { origem: 'app', autor, observacao: corpo.observacao }) };
  if (method === 'GET' && rota === '/api/processamento/previa') return processarRespostas((await s.carregar()).lacunas);
  if (method === 'POST' && rota === '/api/ambientes') return responder(await s.salvarAmbiente(null, corpo, { autor }), 'ambiente');
  if (method === 'PUT' && (k = m(/^\/api\/ambientes\/(A\d+)$/))) return responder(await s.salvarAmbiente(k[1], corpo, { autor }), 'ambiente');
  if (method === 'DELETE' && (k = m(/^\/api\/ambientes\/(A\d+)$/))) return responder(await s.excluirAmbiente(k[1], { autor }));
  if (method === 'PUT' && rota === '/api/escala') return responder(await s.definirEscala(corpo.prancha ?? null, corpo, { autor }), 'escala');
  if (method === 'POST' && rota === '/api/anotacoes') return responder(await s.criarAnotacao(corpo, { autor }), 'anotacao');
  if (method === 'DELETE' && (k = m(/^\/api\/anotacoes\/([0-9a-f]{8})$/))) return responder(await s.excluirAnotacao(k[1], { autor }));
  if (method === 'GET' && rota === '/api/eap-hierarquica.json') {
    const { projeto, lacunas, ambientes } = await s.carregar();
    const incluir = url.searchParams.get('incluir')?.split(',') ?? ['validada', 'em_validacao', 'respondida'];
    return { linhas: montarEap(projeto, lacunas, { incluir, ambientes }), colunas: COLUNAS_EAP };
  }
  if (method === 'GET' && rota === '/api/comparar') {
    const [de, para] = [url.searchParams.get('de'), url.searchParams.get('para')];
    if (!de || !para || de === para) throw erro(400, 'Informe dois projetos diferentes.');
    const [a, b] = await Promise.all([(await nucleo(de)).carregar(), (await nucleo(para)).carregar()]);
    await prepararUrls(de, a.projeto);
    await prepararUrls(para, b.projeto);
    return { de: { id: de, projeto: a.projeto }, para: { id: para, projeto: b.projeto }, lacunas: compararRevisoes(a.lacunas, b.lacunas) };
  }
  throw erro(404, `Função indisponível na versão publicada (${method} ${rota}). Rode localmente com "npm start".`);
}

/** Dados atuais do projeto ativo (para exportações e relatórios gerados no navegador). */
export async function dadosAtivos() {
  const id = await ativo();
  return (await nucleo(id)).carregar();
}

/** Anexo de evidência guardado no navegador (tipo verificado pelo conteúdo, SHA-256). */
export async function enviarAnexo(arquivo) {
  if (arquivo.size > 10 * 1024 * 1024) throw new Error('Arquivo acima de 10 MB.');
  const buf = new Uint8Array(await arquivo.arrayBuffer());
  const ini = (n) => String.fromCharCode(...buf.subarray(0, n));
  const ext = arquivo.name.split('.').pop().toLowerCase();
  const tipo = ini(5) === '%PDF-' ? 'pdf' : buf[0] === 0x89 && ini(4).slice(1) === 'PNG' ? 'png' : buf[0] === 0xff && buf[1] === 0xd8 ? 'jpg'
    : ini(4) === 'RIFF' && String.fromCharCode(...buf.subarray(8, 12)) === 'WEBP' ? 'webp'
    : ['txt', 'eml', 'csv', 'md'].includes(ext) && !buf.includes(0) ? 'txt' : null;
  if (!tipo) throw new Error('Tipo não aceito. Envie PDF, PNG, JPG, WEBP ou texto (.txt, .eml, .csv, .md).');
  const id = await ativo();
  const aid = `${crypto.randomUUID()}.${tipo}`;
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const blob = new Blob([buf], { type: { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', txt: 'text/plain' }[tipo] });
  await kv.gravar(`b:${id}:anexos/${aid}`, blob);
  urlsAnexo.set(aid, URL.createObjectURL(blob));
  return { id: aid, nome: arquivo.name.split(/[\\/]/).pop().slice(0, 120), tipo, tamanho: buf.length, sha256: hash, enviadoEm: new Date().toISOString() };
}

/** Importa um PDF como projeto local deste navegador. */
export async function importarPdf(arquivo, { nome, revisao, escala }, progresso) {
  if (!nome) throw new Error('Informe o nome do projeto.');
  if (revisao && !/^R\d{2}$/i.test(revisao)) throw new Error('Revisão no formato R00, R01…');
  const id = `${slug(nome)}${revisao ? `-${revisao.toLowerCase()}` : ''}`.slice(0, 63) || `projeto-${Date.now()}`;
  if ((await listar()).some((p) => p.id === id)) throw new Error(`Já existe o projeto ${id} neste navegador.`);
  const { referencia, pranchas, texto } = await lerPdf(arquivo, progresso);
  progresso?.('Gravando no navegador…');
  for (const p of pranchas) {
    await kv.gravar(`b:${id}:pranchas/prancha-${p.numero}.png`, p.blob);
    await kv.gravar(`b:${id}:pranchas/prancha-${p.numero}-mini.png`, p.mini);
  }
  const den = Number(escala) || null;
  const projeto = {
    nome, etapa: revisao ? `Revisão ${revisao.toUpperCase()}` : 'Importado no navegador', revisao: revisao ? revisao.toUpperCase() : null, obraId: slug(nome),
    arquivo: arquivo.name, analisadoEm: null, referencia,
    escala: den ? { denominador: den, metrosPorRef: +((25.4 / 40) * den / 1000).toFixed(6), origem: `Escala 1:${den} informada na importação (conferir com uma cota)`, calibrada: false } : null,
    pranchas: pranchas.map((p) => ({ numero: p.numero, titulo: `Prancha ${p.numero}`, folha: String(p.numero).padStart(2, '0'), imagem: `prancha-${p.numero}.png`, miniatura: `prancha-${p.numero}-mini.png`, resolucaoDpi: 120 }))
  };
  const arm = adaptadorNavegador(id, null);
  await arm.gravar('projeto.json', projeto);
  await arm.gravar('lacunas.json', []);
  await arm.gravar('texto-pdf.json', { geradoEm: new Date().toISOString(), arquivo: arquivo.name, pranchas: texto });
  await kv.gravar('indice-local', [...((await kv.ler('indice-local')) ?? []), { id, nome, etapa: projeto.etapa, revisao: projeto.revisao, obraId: projeto.obraId, analisadoEm: null }]);
  return { id, pranchas: pranchas.length };
}
