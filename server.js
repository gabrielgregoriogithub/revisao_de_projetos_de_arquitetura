// Servidor local (sem dependências) do Lacunas.obra.
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarCatalogo, ID_PROJETO } from './lib/projetos.js';
import { gerarEapCsv } from './lib/eap.js';
import { montarEap, eapParaCsv, COLUNAS_EAP, STATUS_PADRAO_EAP } from './lib/eap-hierarquica.js';
import { criarXlsx } from './lib/xlsx.js';
import { gerarRelatorio, RELATORIOS } from './lib/relatorios.js';
import { salvarAnexo, ID_ANEXO, TIPOS_ANEXO, MAX_ANEXO } from './lib/anexos.js';
import { importarPdf, MAX_PDF } from './lib/importar-pdf.js';
import { processarRespostas } from './lib/dominio/processamento.js';
import { compararRevisoes } from './lib/dominio/revisoes.js';
import { STATUS } from './lib/dominio/status.js';
import { CATEGORIAS } from './lib/dominio/lacunas.js';
import { impactoEfetivo, TIPOS_IMPACTO } from './lib/dominio/impacto.js';
import {
  log, ErroHttp, enviarJson, enviar, servirArquivo, lerCorpo, lerBinario, exigirRequisicaoLocal, exigirUploadLocal, listaQuery
} from './lib/http.js';

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const ID = '([A-Za-z0-9_-]{1,20})';
const XLSX_TIPO = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const slug = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
const textoCurto = (v, max = 80) => (typeof v === 'string' ? v.trim().slice(0, max) : null) || null;

function opcoesEap(url) {
  return {
    incluir: listaQuery(url, 'incluir', STATUS) ?? STATUS_PADRAO_EAP,
    colunas: listaQuery(url, 'colunas', COLUNAS_EAP.map(([k]) => k)) ?? COLUNAS_EAP.map(([k]) => k)
  };
}

function planilhasEap(projeto, lacunas, ambientes, { incluir, colunas }) {
  const linhas = montarEap(projeto, lacunas, { incluir, ambientes });
  const larguras = { codigo: 14, descricao: 48, observacoes: 40, origem: 28, statusEspecificacao: 22, nivel: 7, unidade: 8, quantidade: 11 };
  const tipos = { quantidade: 'numero', custoUnitario: 'moeda', custoTotal: 'moeda', nivel: 'numero' };
  return [
    {
      nome: 'EAP', titulo: `EAP – ${projeto.nome} – ${projeto.etapa}`, linhas, negrito: (l) => l.tipo !== 'servico',
      colunas: COLUNAS_EAP.filter(([k]) => colunas.includes(k)).map(([chave, rotulo]) => ({ chave, rotulo, largura: larguras[chave], tipo: tipos[chave] }))
    },
    {
      nome: 'Lacunas', titulo: `Lacunas e riscos – ${projeto.nome}`,
      colunas: [
        { chave: 'id', rotulo: 'ID', largura: 7 }, { chave: 'titulo', rotulo: 'Lacuna', largura: 40 },
        { chave: 'categoria', rotulo: 'Categoria', largura: 16 }, { chave: 'prioridade', rotulo: 'Prioridade', largura: 10 },
        { chave: 'status', rotulo: 'Status', largura: 14 }, { chave: 'ambientes', rotulo: 'Ambientes', largura: 26 },
        { chave: 'servico', rotulo: 'Serviço afetado', largura: 34 }, { chave: 'tipoImpacto', rotulo: 'Tipo de impacto', largura: 26 },
        { chave: 'valor', rotulo: 'Valor (R$)', largura: 14, tipo: 'moeda' }, { chave: 'pergunta', rotulo: 'Pergunta', largura: 50 }
      ],
      linhas: lacunas.map((l) => {
        const i = impactoEfetivo(l);
        return { id: l.id, titulo: l.titulo, categoria: CATEGORIAS[l.categoria] ?? l.categoria, prioridade: l.prioridade, status: l.resposta.status,
          ambientes: l.ambientes.join(', '), servico: i.servico, tipoImpacto: TIPOS_IMPACTO[i.tipo], valor: i.valor, pergunta: l.pergunta };
      })
    },
    {
      nome: 'Ambientes', titulo: `Quadro de ambientes – ${projeto.nome}`,
      colunas: [{ chave: 'id', rotulo: 'ID', largura: 7 }, { chave: 'nome', rotulo: 'Ambiente', largura: 30 }, { chave: 'poligonos', rotulo: 'Polígonos', largura: 10, tipo: 'numero' },
        { chave: 'area', rotulo: 'Área (m²)', largura: 12, tipo: 'numero' }, { chave: 'perimetro', rotulo: 'Perímetro (m)', largura: 14, tipo: 'numero' },
        { chave: 'pd', rotulo: 'PD (m)', largura: 9, tipo: 'numero' }, { chave: 'origem', rotulo: 'Origem da medida', largura: 40 }],
      linhas: ambientes.map((a) => ({ id: a.id, nome: a.nome, poligonos: a.poligonos.length, area: a.medida.area, perimetro: a.medida.perimetro, pd: a.pd,
        origem: `${a.origem}${a.medida.motivo ? ` – ${a.medida.motivo}` : ''}` }))
    }
  ];
}

/** @param {{dadosDir?: string}} [opcoes] */
export function criarServidor({ dadosDir = path.join(RAIZ, 'dados') } = {}) {
  const catalogo = criarCatalogo(dadosDir);
  const publico = path.join(RAIZ, 'public');
  const dominio = path.join(RAIZ, 'lib', 'dominio');
  const ativo = async () => { const id = await catalogo.ativo(); return { id, store: await catalogo.store(id), dir: await catalogo.dir(id) }; };
  const carregarAtivo = async () => (await ativo()).store.carregar();
  const autorDe = (corpo) => textoCurto(corpo?.autor);
  const responder = (res, r, chave) => (r.ok ? enviarJson(res, 200, chave ? r[chave] : r) : enviarJson(res, r.codigo, { erro: r.erro }));

  const rotas = [
    ['GET', /^\/$/, () => (req, res) => servirArquivo(res, publico, 'index.html')],
    ['GET', /^\/static\/(.+)$/, ([, f]) => (req, res) => servirArquivo(res, publico, f)],
    ['GET', /^\/dominio\/(.+)$/, ([, f]) => (req, res) => servirArquivo(res, dominio, f)],
    ['GET', /^\/pranchas\/(.+)$/, ([, f]) => async (req, res) => servirArquivo(res, path.join((await ativo()).dir, 'pranchas'), f, { cache: true })],
    ['GET', /^\/p\/([a-z0-9-]{1,63})\/pranchas\/(.+)$/, ([, id, f]) => async (req, res) => {
      if (!ID_PROJETO.test(id)) throw new ErroHttp(404, 'Projeto inválido.');
      await catalogo.store(id);
      return servirArquivo(res, path.join(await catalogo.dir(id), 'pranchas'), f, { cache: true });
    }],

    // Projetos
    ['GET', /^\/api\/projetos$/, () => async (req, res) => enviarJson(res, 200, { ativo: await catalogo.ativo(), projetos: await catalogo.listar() })],
    ['PUT', /^\/api\/projetos\/ativo$/, () => async (req, res) => {
      exigirRequisicaoLocal(req);
      const { id } = await lerCorpo(req);
      const r = await catalogo.definirAtivo(String(id ?? ''));
      log('info', 'projeto ativo', { id: r });
      return enviarJson(res, 200, { ativo: r });
    }],

    ['POST', /^\/api\/projetos$/, () => async (req, res) => {
      exigirUploadLocal(req);
      if ((await catalogo.modo()) !== 'multi') throw new ErroHttp(409, 'Migre os dados para vários projetos antes (node scripts/migrar-projetos.js <id>).');
      const cab = (n) => decodeURIComponent(String(req.headers[n] ?? '')).trim();
      const nome = cab('x-nome-projeto').slice(0, 120);
      const revisao = cab('x-revisao').toUpperCase().slice(0, 10) || null;
      const obra = slug(cab('x-obra') || nome);
      if (!nome || !obra) throw new ErroHttp(400, 'Informe o nome do projeto.');
      if (revisao && !/^R\d{2}$/.test(revisao)) throw new ErroHttp(400, 'Revisão no formato R00, R01…');
      const escala = Number(cab('x-escala')) || null;
      const pdf = await lerBinario(req, MAX_PDF);
      if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new ErroHttp(415, 'O arquivo enviado não é um PDF.');
      const id = `${obra}${revisao ? `-${revisao.toLowerCase()}` : ''}`.slice(0, 63);
      if (!ID_PROJETO.test(id)) throw new ErroHttp(400, 'Nome de projeto inválido.');
      const projeto = await importarPdf({ destino: path.join(dadosDir, 'projetos', id), pdf, nome, revisao, obraId: obra, escala, arquivo: cab('x-nome-arquivo').slice(0, 200) || 'pranchas.pdf' });
      log('info', 'projeto importado', { id, pranchas: projeto.pranchas.length });
      return enviarJson(res, 200, { id, pranchas: projeto.pranchas.length });
    }],

    ['GET', /^\/api\/projeto$/, () => async (req, res) => {
      const a = await ativo();
      return enviarJson(res, 200, { ...(await a.store.carregar()), projetoId: a.id, versao: `${a.id}#${await a.store.versao()}` });
    }],
    ['GET', /^\/api\/versao$/, () => async (req, res) => { const a = await ativo(); return enviarJson(res, 200, { versao: `${a.id}#${await a.store.versao()}` }); }],

    // Lacunas
    ['GET', new RegExp(`^/api/lacunas/${ID}/historico$`), ([, id]) => async (req, res) => enviarJson(res, 200, { eventos: await (await ativo()).store.historico(id) })],
    ['PUT', new RegExp(`^/api/lacunas/${ID}/resposta$`), ([, id]) => async (req, res) => {
      exigirRequisicaoLocal(req);
      const corpo = await lerCorpo(req);
      const r = await (await ativo()).store.salvarResposta(id, corpo, { origem: 'app', autor: autorDe(corpo) });
      if (r.ok) log('info', 'resposta salva', { lacuna: id, status: r.resposta.status, revisao: r.resposta.revisao });
      return responder(res, r, 'resposta');
    }],
    ['POST', /^\/api\/lacunas$/, () => async (req, res) => {
      exigirRequisicaoLocal(req);
      const corpo = await lerCorpo(req);
      return responder(res, await (await ativo()).store.criarLacuna(corpo, { autor: autorDe(corpo) }), 'lacuna');
    }],
    ['POST', /^\/api\/lacunas\/status-lote$/, () => async (req, res) => {
      exigirRequisicaoLocal(req);
      const { ids, status, observacao, autor } = await lerCorpo(req);
      if (!Array.isArray(ids) || !ids.length || ids.length > 500 || !ids.every((i) => /^[A-Za-z0-9_-]{1,20}$/.test(i))) throw new ErroHttp(400, 'Informe a lista de IDs.');
      const resultados = await (await ativo()).store.alterarStatusEmLote(ids, status, { origem: 'app', autor: textoCurto(autor), observacao });
      return enviarJson(res, 200, { resultados });
    }],
    ['GET', /^\/api\/processamento\/previa$/, () => async (req, res) => enviarJson(res, 200, processarRespostas((await carregarAtivo()).lacunas))],

    // Anexos (evidências)
    ['POST', /^\/api\/anexos$/, () => async (req, res) => {
      exigirUploadLocal(req);
      const nome = decodeURIComponent(String(req.headers['x-nome-arquivo'] ?? 'anexo'));
      const r = await salvarAnexo((await ativo()).dir, await lerBinario(req, MAX_ANEXO), nome);
      if (r.ok) log('info', 'anexo salvo', { id: r.anexo.id, tamanho: r.anexo.tamanho });
      return responder(res, r, 'anexo');
    }],
    ['GET', /^\/anexos\/([^/]+)$/, ([, id]) => async (req, res) => {
      if (!ID_ANEXO.test(id)) throw new ErroHttp(404, 'Anexo não encontrado.');
      const ext = id.split('.').pop();
      res.setHeader('Content-Security-Policy', 'sandbox; default-src \'none\'; img-src \'self\'; style-src \'unsafe-inline\'');
      return servirArquivo(res, path.join((await ativo()).dir, 'anexos'), id, { tipo: TIPOS_ANEXO[ext], disposicao: ext === 'txt' ? 'attachment' : 'inline' });
    }],

    // Quadro de ambientes e escala
    ['POST', /^\/api\/ambientes$/, () => async (req, res) => {
      exigirRequisicaoLocal(req);
      const corpo = await lerCorpo(req);
      return responder(res, await (await ativo()).store.salvarAmbiente(null, corpo, { autor: autorDe(corpo) }), 'ambiente');
    }],
    ['PUT', /^\/api\/ambientes\/(A\d{1,4})$/, ([, id]) => async (req, res) => {
      exigirRequisicaoLocal(req);
      const corpo = await lerCorpo(req);
      return responder(res, await (await ativo()).store.salvarAmbiente(id, corpo, { autor: autorDe(corpo) }), 'ambiente');
    }],
    ['DELETE', /^\/api\/ambientes\/(A\d{1,4})$/, ([, id]) => async (req, res) => {
      exigirRequisicaoLocal(req);
      const corpo = await lerCorpo(req);
      return responder(res, await (await ativo()).store.excluirAmbiente(id, { autor: autorDe(corpo) }));
    }],
    ['PUT', /^\/api\/escala$/, () => async (req, res) => {
      exigirRequisicaoLocal(req);
      const corpo = await lerCorpo(req);
      const prancha = corpo.prancha === null || corpo.prancha === undefined ? null : Number(corpo.prancha);
      return responder(res, await (await ativo()).store.definirEscala(prancha, corpo, { autor: autorDe(corpo) }), 'escala');
    }],

    // Anotações sobre a prancha
    ['POST', /^\/api\/anotacoes$/, () => async (req, res) => {
      exigirRequisicaoLocal(req);
      const corpo = await lerCorpo(req);
      return responder(res, await (await ativo()).store.criarAnotacao(corpo, { autor: autorDe(corpo) }), 'anotacao');
    }],
    ['DELETE', /^\/api\/anotacoes\/([0-9a-f]{8})$/, ([, id]) => async (req, res) => {
      exigirRequisicaoLocal(req);
      const corpo = await lerCorpo(req);
      return responder(res, await (await ativo()).store.excluirAnotacao(id, { autor: autorDe(corpo) }));
    }],

    // Comparação de revisões
    ['GET', /^\/api\/comparar$/, () => async (req, res, url) => {
      const de = url.searchParams.get('de');
      const para = url.searchParams.get('para');
      if (!ID_PROJETO.test(de ?? '') || !ID_PROJETO.test(para ?? '') || de === para) throw new ErroHttp(400, 'Informe dois projetos diferentes (de, para).');
      const [a, b] = await Promise.all([(await catalogo.store(de)).carregar(), (await catalogo.store(para)).carregar()]);
      return enviarJson(res, 200, {
        de: { id: de, projeto: a.projeto }, para: { id: para, projeto: b.projeto },
        lacunas: compararRevisoes(a.lacunas, b.lacunas)
      });
    }],

    // Exportações
    ['GET', /^\/api\/eap\.csv$/, () => async (req, res) => enviar(res, 200, 'text/csv; charset=utf-8', gerarEapCsv((await carregarAtivo()).lacunas),
      { 'Content-Disposition': 'attachment; filename="eap-lacunas.csv"' })],
    ['GET', /^\/api\/eap-hierarquica\.json$/, () => async (req, res, url) => {
      const { projeto, lacunas, ambientes } = await carregarAtivo();
      return enviarJson(res, 200, { linhas: montarEap(projeto, lacunas, { ...opcoesEap(url), ambientes }), colunas: COLUNAS_EAP });
    }],
    ['GET', /^\/api\/eap-hierarquica\.csv$/, () => async (req, res, url) => {
      const { projeto, lacunas, ambientes } = await carregarAtivo();
      const o = opcoesEap(url);
      return enviar(res, 200, 'text/csv; charset=utf-8', eapParaCsv(montarEap(projeto, lacunas, { ...o, ambientes }), o.colunas),
        { 'Content-Disposition': 'attachment; filename="eap-hierarquica.csv"' });
    }],
    ['GET', /^\/api\/eap\.xlsx$/, () => async (req, res, url) => {
      const { projeto, lacunas, ambientes } = await carregarAtivo();
      return enviar(res, 200, XLSX_TIPO, criarXlsx(planilhasEap(projeto, lacunas, ambientes, opcoesEap(url))),
        { 'Content-Disposition': 'attachment; filename="eap-lacunas.xlsx"' });
    }],
    ['GET', /^\/relatorios\/([a-z]+)$/, ([, tipo]) => async (req, res, url) => {
      if (!RELATORIOS[tipo]) throw new ErroHttp(404, 'Relatório não encontrado.');
      return enviar(res, 200, 'text/html; charset=utf-8', gerarRelatorio(tipo, await carregarAtivo(), { recortes: url.searchParams.get('recortes') !== '0' }));
    }]
  ];

  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'");
    let rota = '';
    try {
      let url;
      try {
        url = new URL(req.url, 'http://localhost');
        rota = decodeURIComponent(url.pathname);
      } catch {
        throw new ErroHttp(400, 'URL inválida.');
      }
      for (const [metodo, padrao, fabrica] of rotas) {
        const m = rota.match(padrao);
        if (m && req.method === metodo) return await fabrica(m)(req, res, url);
      }
      enviarJson(res, 404, { erro: 'Rota não encontrada.' });
    } catch (erro) {
      const codigo = erro.codigo ?? 500;
      if (codigo === 500) log('erro', 'falha na requisição', { metodo: req.method, rota, erro: erro.stack });
      if (!res.headersSent) enviarJson(res, codigo, { erro: codigo === 500 ? 'Erro interno no servidor.' : erro.message });
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const porta = Number(process.env.PORT) || 8766;
  criarServidor().listen(porta, '127.0.0.1', () => log('info', `Lacunas.obra rodando em http://localhost:${porta}`));
}
