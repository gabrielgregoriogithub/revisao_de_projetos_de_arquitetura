// Relatórios em HTML para leitura e impressão (Salvar como PDF no navegador).
import { STATUS_INFO, ABERTOS, COM_RESPOSTA, criticidade } from './dominio/status.js';
import { CATEGORIAS, DISCIPLINAS } from './dominio/lacunas.js';
import { calcularIndicadores, gerarAlertas } from './dominio/indicadores.js';
import { impactoEfetivo, consolidarImpacto, formatarMoeda, TIPOS_IMPACTO, INCERTEZAS } from './dominio/impacto.js';

export const esc = (v) => String(v ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

export const RELATORIOS = {
  executivo: { titulo: 'Relatório executivo do projeto', descricao: 'Indicadores, alertas, riscos e prioridades.' },
  abertas: { titulo: 'Lacunas abertas', descricao: 'Tudo que ainda não tem resposta, com recorte da planta.' },
  disciplinas: { titulo: 'Pendências por disciplina', descricao: 'Lacunas não resolvidas agrupadas por disciplina.' },
  inconsistencias: { titulo: 'Inconsistências entre pranchas', descricao: 'Divergências entre documentos e erros documentais.' },
  respostas: { titulo: 'Respostas recebidas', descricao: 'Respostas registradas, com responsável e evidências.' },
  riscos: { titulo: 'Riscos financeiros', descricao: 'Impacto calculado, estimado e não quantificado.' },
  evolucao: { titulo: 'Evolução da resolução', descricao: 'Histórico de alterações e progresso ao longo do tempo.' },
  especificacoes: { titulo: 'Especificações consolidadas', descricao: 'Memorial do que foi respondido, separando validado de não validado.' }
};

const statusDe = (l) => l.resposta?.status ?? 'aberta';
const selo = (s) => `<span class="selo s-${esc(s)}">${esc(STATUS_INFO[s]?.rotulo ?? s)}</span>`;
const dataBr = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—');

/** Recorte da prancha via CSS (background-position), sem processar imagem no servidor. */
let urlPranchaAtual = (img) => `/pranchas/${encodeURIComponent(img)}`;

function recorte(projeto, m) {
  const ref = projeto.referencia;
  const prancha = projeto.pranchas.find((p) => p.numero === m.prancha);
  if (!prancha || !ref) return '';
  const margem = Math.max(m.w, m.h, 60) * 0.6;
  const x = Math.max(0, m.x - margem);
  const y = Math.max(0, m.y - margem);
  const w = Math.min(ref.largura - x, m.w + margem * 2);
  const h = Math.min(ref.altura - y, m.h + margem * 2);
  const pct = (v) => `${(v * 100).toFixed(3)}%`;
  const estilo = [
    `aspect-ratio:${(w / h).toFixed(4)}`,
    `background-image:url('${urlPranchaAtual(prancha.imagem)}')`,
    `background-size:${pct(ref.largura / w)} ${pct(ref.altura / h)}`,
    `background-position:${pct(w >= ref.largura ? 0 : x / (ref.largura - w))} ${pct(h >= ref.altura ? 0 : y / (ref.altura - h))}`
  ].join(';');
  const caixa = `left:${pct((m.x - x) / w)};top:${pct((m.y - y) / h)};width:${pct(m.w / w)};height:${pct(m.h / h)}`;
  return `<figure class="recorte"><div class="img" style="${estilo}"><i style="${caixa}"></i></div>
    <figcaption>Folha ${esc(prancha.folha)} · PDF p.${m.prancha} · ${esc(prancha.titulo)}</figcaption></figure>`;
}

function cartaoLacuna(projeto, l, { recortes = true, resposta = false } = {}) {
  const imp = impactoEfetivo(l);
  const r = l.resposta;
  const campos = resposta ? l.campos.map((c) => `<tr><th>${esc(c.rotulo)}</th><td>${esc(r.campos?.[c.chave] || '—')}</td></tr>`).join('') : '';
  const evid = resposta && r.evidencias?.length
    ? `<p class="mini"><b>Evidências:</b> ${r.evidencias.map((e) => `${esc(e.tipo)} – ${esc(e.descricao)}${e.referencia ? ` (${esc(e.referencia)})` : ''}`).join('; ')}</p>` : '';
  return `<article class="lacuna">
    <header><span class="id">${esc(l.id)}</span><h3>${esc(l.titulo)}</h3>${selo(statusDe(l))}</header>
    <p class="mini">${esc(CATEGORIAS[l.categoria] ?? l.categoria)} · prioridade ${esc(l.prioridade)} · ${esc((l.ambientes ?? []).join(', ') || 'sem ambiente')} · ${esc((l.disciplinas ?? []).map((d) => DISCIPLINAS[d] ?? d).join(', '))}</p>
    <dl><dt>Onde</dt><dd>${esc(l.onde)}</dd><dt>O que falta</dt><dd>${esc(l.problema)}</dd>
    <dt>Pergunta</dt><dd class="pergunta">${esc(l.pergunta)}</dd><dt>Impacto</dt><dd>${esc(l.impacto)}</dd>
    <dt>Risco financeiro</dt><dd>${esc(TIPOS_IMPACTO[imp.tipo])}${imp.valor !== null ? ` – ${esc(formatarMoeda(imp.valor))}` : ''}</dd></dl>
    ${campos ? `<table class="campos">${campos}</table>` : ''}
    ${resposta && r.observacao ? `<p class="mini"><b>Observação:</b> ${esc(r.observacao)}</p>` : ''}
    ${resposta && r.responsavel ? `<p class="mini"><b>Responsável:</b> ${esc(r.responsavel)} · atualizado em ${esc(dataBr(r.atualizadoEm))}</p>` : ''}
    ${evid}
    ${recortes && l.marcadores.length ? `<div class="recortes">${l.marcadores.slice(0, 2).map((m) => recorte(projeto, m)).join('')}</div>` : ''}
  </article>`;
}

const tabela = (cab, linhas) => `<table class="dados"><thead><tr>${cab.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
  <tbody>${linhas.map((l) => `<tr>${l.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cab.length}">Nada a listar.</td></tr>`}</tbody></table>`;

function corpoExecutivo(projeto, lacunas, eventos) {
  const ind = calcularIndicadores(projeto, lacunas, eventos);
  const alertas = gerarAlertas(lacunas);
  const kpi = (v, r) => `<div class="kpi"><b>${esc(v)}</b><span>${esc(r)}</span></div>`;
  const top = [...lacunas].filter((l) => !['validada', 'nao_aplicavel'].includes(statusDe(l))).sort((a, b) => criticidade(a) - criticidade(b)).slice(0, 8);
  return `<section class="kpis">${kpi(ind.total, 'lacunas identificadas')}${kpi(ind.abertas, 'abertas')}${kpi(ind.pendentes + ind.emValidacao, 'aguardando')}
    ${kpi(ind.comResposta, 'com resposta')}${kpi(ind.validadas, 'validadas')}${kpi(`${ind.percentualResolucao}%`, 'resolvidas (validadas ou n/a)')}
    ${kpi(ind.altaPrioridadeAbertas, 'alta prioridade pendentes')}${kpi(ind.conflitos, 'conflitos entre pranchas')}</section>
    <h2>Alertas</h2>${tabela(['Alerta', 'Descrição', 'Lacunas'], alertas.map((a) => [esc(a.titulo), esc(a.descricao), esc(a.ids.join(', '))]))}
    <h2>Prioridades</h2>${tabela(['ID', 'Lacuna', 'Prioridade', 'Status'], top.map((l) => [esc(l.id), esc(l.titulo), esc(l.prioridade), selo(statusDe(l))]))}
    <h2>Risco financeiro</h2>${blocoRisco(lacunas)}
    <h2>Pendências por disciplina</h2>${tabela(['Disciplina', 'Lacunas não resolvidas'], ind.disciplinasPendentes.map((d) => [esc(d.rotulo), esc(d.total)]))}`;
}

function blocoRisco(lacunas) {
  const c = consolidarImpacto(lacunas);
  return `<p>Impacto <b>calculado</b>: ${esc(formatarMoeda(c.calculado))} (${c.qtdCalculado} lacunas) · impacto <b>estimado</b>: ${esc(formatarMoeda(c.estimado))} (${c.qtdEstimado} lacunas) · <b>${c.naoQuantificados.length}</b> riscos ainda não quantificados. Os valores não são somados entre si.</p>
    ${c.sobreposicoes.length ? `<p class="aviso">Possível sobreposição entre lacunas relacionadas: ${esc(c.sobreposicoes.map((p) => p.join(' × ')).join(', '))}. Verifique antes de consolidar.</p>` : ''}`;
}

function corpoRiscos(lacunas) {
  const c = consolidarImpacto(lacunas);
  return `${blocoRisco(lacunas)}${tabela(['ID', 'Serviço afetado', 'Tipo', 'Unid.', 'Qtd.', 'Custo unit.', 'Valor', 'Incerteza', 'Justificativa'],
    c.itens.map(({ lacuna: l, impacto: i }) => [esc(l.id), esc(i.servico ?? '—'), esc(TIPOS_IMPACTO[i.tipo]), esc(i.unidade ?? '—'),
      esc(i.quantidade ?? '—'), esc(formatarMoeda(i.custoUnitario)), esc(formatarMoeda(i.valor)), esc(INCERTEZAS[i.incerteza] ?? '—'), esc(i.justificativa ?? '—')]))}`;
}

function corpoEvolucao(projeto, lacunas, eventos) {
  const ind = calcularIndicadores(projeto, lacunas, eventos);
  const serie = tabela(['Dia', 'Com resposta', 'Resolvidas', 'Total'], ind.evolucao.map((p) => [esc(p.dia), esc(p.comResposta), esc(p.resolvidas), esc(p.total)]));
  const log = tabela(['Quando', 'Lacuna', 'De → Para', 'Origem', 'Alterações'], [...eventos].reverse().slice(0, 200).map((e) => [
    esc(dataBr(e.em)), esc(e.lacuna), `${selo(e.de.status)} → ${selo(e.para.status)}`, esc(`${e.origem}${e.autor ? ` (${e.autor})` : ''}`),
    esc(e.alteracoes.map((a) => a.campo).join(', ')) + (e.motivo ? `<br><span class="mini">${esc(e.motivo)}</span>` : '')]));
  return `<p>Resolução atual: <b>${ind.percentualResolucao}%</b> validadas ou não aplicáveis; <b>${ind.percentualRespondidas}%</b> com alguma resposta.</p>
    <h2>Série diária</h2>${ind.evolucao.length ? serie : '<p>Ainda não há histórico de alterações.</p>'}<h2>Registro de alterações</h2>${log}`;
}

function corpoEspecificacoes(lacunas) {
  const bloco = (titulo, lista, nota) => `<h2>${esc(titulo)}</h2>${nota ? `<p class="aviso">${esc(nota)}</p>` : ''}
    ${tabela(['Lacuna', 'Ambientes', 'Item', 'Especificação', 'Fonte'], lista.flatMap((l) => l.campos
      .filter((c) => (l.resposta.campos?.[c.chave] ?? '').trim())
      .map((c) => [esc(l.id), esc((l.ambientes ?? []).join(', ')), esc(c.rotulo), esc(l.resposta.campos[c.chave]),
        esc(l.resposta.evidencias?.map((e) => e.descricao).join('; ') || l.resposta.responsavel || 'resposta registrada no app')])))}`;
  return bloco('Especificações validadas', lacunas.filter((l) => statusDe(l) === 'validada')) +
    bloco('Especificações respondidas, ainda NÃO validadas', lacunas.filter((l) => ['respondida', 'em_validacao'].includes(statusDe(l))),
      'Estas informações vieram de respostas que ainda não passaram por validação técnica. Não use como especificação definitiva.');
}

/**
 * @param {string} tipo chave de RELATORIOS
 * @param {{projeto:object, lacunas:object[], eventos:object[]}} dados
 * @param {{recortes?:boolean}} opcoes
 */
export function gerarRelatorio(tipo, { projeto, lacunas, eventos }, { recortes = true, base = '/', urlPrancha } = {}) {
  const meta = RELATORIOS[tipo];
  if (!meta) return null;
  urlPranchaAtual = urlPrancha ?? ((img) => `${base}pranchas/${encodeURIComponent(img)}`);
  const ordenadas = [...lacunas].sort((a, b) => criticidade(a) - criticidade(b));
  const cartoes = (lista, o = {}) => lista.map((l) => cartaoLacuna(projeto, l, { recortes, ...o })).join('') || '<p>Nenhuma lacuna nesta condição.</p>';
  const naoResolvidas = ordenadas.filter((l) => !['validada', 'nao_aplicavel'].includes(statusDe(l)));

  const corpos = {
    executivo: () => corpoExecutivo(projeto, lacunas, eventos),
    abertas: () => cartoes(ordenadas.filter((l) => ABERTOS.includes(statusDe(l)))),
    disciplinas: () => Object.entries(DISCIPLINAS).map(([k, nome]) => {
      const lista = naoResolvidas.filter((l) => l.disciplinas.includes(k));
      return lista.length ? `<h2>${esc(nome)} <small>(${lista.length})</small></h2>${cartoes(lista)}` : '';
    }).join('') || '<p>Nenhuma pendência.</p>',
    inconsistencias: () => cartoes(ordenadas.filter((l) => ['inconsistencia', 'documentacao'].includes(l.categoria) || l.pranchas.length > 1)),
    respostas: () => cartoes(ordenadas.filter((l) => [...COM_RESPOSTA, 'pendente', 'nao_aplicavel'].includes(statusDe(l)) && l.resposta.atualizadoEm), { resposta: true }),
    riscos: () => corpoRiscos(lacunas),
    evolucao: () => corpoEvolucao(projeto, lacunas, eventos),
    especificacoes: () => corpoEspecificacoes(lacunas)
  };

  const emissao = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(meta.titulo)} – ${esc(projeto.nome)}</title><link rel="stylesheet" href="${esc(base)}static/relatorio.css"></head><body>
<div class="barra-acoes"><a href="${esc(base)}#/relatorios">← Voltar ao app</a><button type="button" id="imprimir">Imprimir / Salvar PDF</button></div>
<main class="folha">
<header class="cabecalho"><div class="marca">Lacunas<span>.obra</span></div>
<div><h1>${esc(meta.titulo)}</h1><p>${esc(projeto.nome)} · ${esc(projeto.obra ?? '')}</p></div>
<dl class="ficha"><dt>Etapa</dt><dd>${esc(projeto.etapa)}</dd><dt>Arquivo</dt><dd>${esc(projeto.arquivo)}</dd>
<dt>Projeto</dt><dd>${esc(projeto.autorProjeto ?? '—')}</dd><dt>Endereço</dt><dd>${esc(projeto.endereco ?? '—')}</dd>
<dt>Pranchas</dt><dd>${esc(projeto.pranchas.map((p) => `Folha ${p.folha} (${p.titulo})`).join('; '))}</dd><dt>Emissão</dt><dd>${esc(emissao)}</dd></dl></header>
<p class="ressalva">Lacunas identificadas por análise assistida por IA (Claude Code) sobre as pranchas listadas. São pontos a esclarecer, não conclusões técnicas. Somente itens com status "Validada" foram confirmados com evidência.</p>
${corpos[tipo]()}
<footer>Lacunas.obra · ${esc(projeto.nome)} · emitido em ${esc(emissao)}</footer>
</main><script src="${esc(base)}static/relatorio.js"></script></body></html>`;
}
