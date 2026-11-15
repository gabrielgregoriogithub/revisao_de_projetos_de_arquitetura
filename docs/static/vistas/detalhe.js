// Painel de detalhe da lacuna: 5 perguntas-chave, resposta, evidências, validação, impacto e histórico.
import { el, preferencia } from '../dom.js';
import { icone } from '../icones.js';
import { api, urlAnexo, ESTATICO } from '../api.js';
import { estado } from '../estado.js';
import { seloStatus, etiquetaPrioridade, etiqueta, botao, avisar, confirmar, vazio } from '../componentes.js';
import { STATUS_INFO, proximosStatus, transicaoPermitida } from '/dominio/status.js';
import { CATEGORIAS, DISCIPLINAS } from '/dominio/lacunas.js';
import { impactoEfetivo, TIPOS_IMPACTO, INCERTEZAS, formatarMoeda } from '/dominio/impacto.js';
import { lerNumeroBr } from '/dominio/numeros.js';

const ACAO = {
  respondida: { rotulo: ESTATICO ? 'Registrar resposta' : 'Devolver para o Claude', classe: 'pri', ic: 'check' },
  pendente: { rotulo: 'Marcar pendente' },
  em_validacao: { rotulo: 'Enviar para validação', classe: 'pri' },
  validada: { rotulo: 'Validar tecnicamente', classe: 'pri', ic: 'check', confirmar: 'Confirma que a especificação foi conferida com evidência? Ela passará a ser tratada como informação técnica confirmada.' },
  reaberta: { rotulo: 'Reabrir', classe: 'perigo', confirmar: 'Reabrir a lacuna? Se estiver validada, a validação será desfeita (fica registrado no histórico).' },
  aberta: { rotulo: 'Voltar para aberta' },
  nao_aplicavel: { rotulo: 'Não aplicável', classe: 'fantasma', confirmar: 'Arquivar como não aplicável? Explique o motivo na observação.' }
};
const EDITAVEIS = ['aberta', 'reaberta', 'pendente', 'respondida'];
const TIPOS_EVID = { documento: 'Documento', email: 'E-mail', reuniao: 'Reunião', prancha: 'Prancha', foto: 'Foto', outro: 'Outro' };
const ROTULO_CAMPO = { status: 'status', observacao: 'observação', responsavel: 'responsável', notaValidacao: 'nota de validação', evidencias: 'evidências', impacto: 'impacto financeiro' };

const secao = (titulo, corpo, { aberta = true, cont, id } = {}) => el('details', { className: 'secao', open: aberta, id }, [
  el('summary', {}, [titulo, cont !== undefined ? el('span', { className: 'cont', textContent: cont }) : null]),
  el('div', { className: 'secao-corpo' }, corpo)
]);
const pergunta = (n, rotulo, texto, destaque = false, extra = null) => el('div', { className: `q${destaque ? ' destaque' : ''}` }, [
  el('span', { className: 'n', textContent: n }), el('b', { textContent: rotulo }), el('div', {}, [el('p', { textContent: texto }), extra])
]);
const campoTexto = (rotulo, nome, valor, { area = false, dica, tipo = 'text', ...attrs } = {}) => el('label', { className: 'campo' }, [
  rotulo, dica ? el('small', { textContent: dica }) : null,
  el(area ? 'textarea' : 'input', { className: 'entrada', name: nome, value: valor ?? '', type: area ? undefined : tipo, maxLength: 2000, autocomplete: 'off', ...attrs })
]);
const dataBr = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function linhaTempo(eventos) {
  if (!eventos.length) return vazio('Sem alterações registradas', 'O histórico começa na primeira resposta.', 'historico');
  return el('ol', { className: 'linha-tempo' }, [...eventos].reverse().map((e) => el('li', {}, [
    el('div', { className: 'quando', textContent: `${dataBr(e.em)} · ${e.origem === 'claude' ? 'Claude Code' : 'App'}${e.autor ? ` · ${e.autor}` : ''} · rev. ${e.revisao}` }),
    el('div', {}, [seloStatus(e.de.status), ' → ', seloStatus(e.para.status)]),
    e.motivo ? el('div', { className: 'alt', textContent: e.motivo }) : null,
    el('div', { className: 'alt' }, e.alteracoes.filter((a) => a.campo !== 'status').flatMap((a, i) => {
      const nome = a.campo.startsWith('campos.') ? a.campo.slice(7) : (ROTULO_CAMPO[a.campo] ?? a.campo);
      const fmt = (v) => (v === null ? '∅' : typeof v === 'object' ? '(alterado)' : String(v).slice(0, 80));
      return [i ? ' · ' : '', el('code', { textContent: nome }), `: ${fmt(a.antes)} → ${fmt(a.depois)}`];
    }))
  ])));
}

/**
 * @param {HTMLElement} alvo
 * @param {string} id
 * @param {{aoVerMarcador:(m)=>void, aoNavegar:(delta:number)=>void, aoFechar?:()=>void}} acoes
 */
export function renderizarDetalhe(alvo, id, { aoVerMarcador, aoNavegar, aoFechar, aoAbrir }) {
  const l = estado.lacuna(id);
  if (!l) { alvo.replaceChildren(vazio('Selecione uma lacuna', 'Clique num item da lista ou num marcador da prancha.', 'alvo')); return { sujo: () => false }; }
  const r = l.resposta;
  const imp = impactoEfetivo(l);
  let evidencias = [...(r.evidencias ?? [])];
  let sujo = false;
  const raiz = el('form', { className: 'detalhe', 'aria-label': `Lacuna ${l.id}`, onsubmit: (e) => e.preventDefault() });
  const marcarSujo = () => { if (!sujo) { sujo = true; raiz.classList.add('tem-alteracoes'); estado.definirSincronizacao('sujo'); } };
  raiz.addEventListener('input', marcarSujo);

  // ── Topo
  const topo = el('div', { className: 'detalhe-topo' }, [
    el('div', { className: 'detalhe-nav' }, [
      el('span', { className: 'codigo', textContent: l.id }),
      el('span', { className: 'sujo' }, [icone('alerta'), 'Alterações não salvas']),
      el('div', { className: 'direita' }, [
        botao('', { classe: 'fantasma peq icone', ic: 'anterior', titulo: 'Lacuna anterior (K)', onclick: () => aoNavegar(-1) }),
        botao('', { classe: 'fantasma peq icone', ic: 'proximo', titulo: 'Próxima lacuna (J)', onclick: () => aoNavegar(1) }),
        aoFechar ? botao('', { classe: 'fantasma peq icone', ic: 'fechar', titulo: 'Fechar (Esc)', onclick: aoFechar }) : null
      ])
    ]),
    el('h2', { textContent: l.titulo }),
    el('div', { className: 'chips' }, [seloStatus(r.status), etiquetaPrioridade(l.prioridade), etiqueta(CATEGORIAS[l.categoria] ?? l.categoria),
      ...l.disciplinas.map((d) => etiqueta(DISCIPLINAS[d] ?? d))])
  ]);

  // ── 1. Entender
  const links = el('div', { className: 'links-prancha' }, l.marcadores.map((m, i) => {
    const p = estado.projeto.pranchas.find((x) => x.numero === m.prancha);
    const ancorado = m.precisao === 'ancorado';
    return botao(`${ancorado ? '✓' : '≈'} Folha ${p?.folha ?? '?'} · p.${m.prancha} #${i + 1}`, {
      classe: 'peq', ic: 'alvo', onclick: () => aoVerMarcador(m),
      titulo: ancorado ? `Posição ancorada no texto do PDF (${(m.ancoras ?? []).join(' ')})` : m.precisao === 'estimado' ? 'Posição estimada visualmente (sem texto do PDF dentro do marcador)' : 'Ver na prancha'
    });
  }));
  const entender = secao('Entender a lacuna', [el('div', { className: 'perguntas' }, [
    pergunta(1, 'O que está faltando', l.problema),
    pergunta(2, 'Onde', `${l.onde}${l.ambientes.length ? ` — ${l.ambientes.join(', ')}` : ''}`, false, links),
    pergunta(3, 'Por que importa', l.impacto),
    pergunta(4, 'O que precisa ser respondido', l.pergunta, true),
    pergunta(5, 'Se não resolver', imp.tipo === 'nao_quantificado'
      ? `Risco financeiro ainda não quantificado${imp.servico ? ` em: ${imp.servico}` : ''}.`
      : `${TIPOS_IMPACTO[imp.tipo]}: ${formatarMoeda(imp.valor)}${imp.servico ? ` (${imp.servico})` : ''}.`)
  ]), l.evidenciaPdf ? el('p', { style: 'margin:0;font-size:13px;padding:8px 10px;border-radius:6px;background:var(--superficie-2);border:1px solid var(--borda)' },
    [el('strong', { textContent: 'Evidência no PDF: ' }), l.evidenciaPdf]) : null,
  l.relacionadas.length ? el('div', { className: 'links-prancha' }, [el('span', { className: 'muted', style: 'font-size:12px', textContent: 'Ver também:' }),
    ...l.relacionadas.map((rid) => {
      const rel = estado.lacuna(rid);
      return botao(`${rid}${rel ? ` · ${rel.titulo.slice(0, 38)}${rel.titulo.length > 38 ? '…' : ''}` : ''}`, { classe: 'peq fantasma', ic: 'proximo', titulo: rel?.titulo, onclick: () => aoAbrir?.(rid) });
    })]) : null,
  el('p', { className: 'muted', style: 'margin:0;font-size:12px', textContent: `Identificada em ${l.identificadaEm ?? '—'} · ${l.origem}` })]);

  // ── 2. Resposta
  const editavel = EDITAVEIS.includes(r.status);
  const resposta = secao('Resposta', [
    ...l.campos.map((c) => campoTexto(c.rotulo, `campo:${c.chave}`, r.campos?.[c.chave], { disabled: !editavel })),
    campoTexto('Observação', 'observacao', r.observacao, { area: true, disabled: !editavel && !['em_validacao', 'validada', 'nao_aplicavel'].includes(r.status) }),
    campoTexto('Responsável pela informação', 'responsavel', r.responsavel || '', { dica: 'Quem respondeu: arquiteta, condomínio, fornecedor…', disabled: !editavel, maxLength: 120 }),
    !editavel ? el('p', { className: 'muted', style: 'margin:0;font-size:12px', textContent: 'Resposta travada neste status. Para editar, reabra a lacuna.' }) : null
  ], { cont: STATUS_INFO[r.status].rotulo });

  // ── 3. Evidências
  const listaEvid = el('ul', { className: 'evidencias' });
  const desenharEvid = () => listaEvid.replaceChildren(...(evidencias.length ? evidencias.map((e, i) => el('li', {}, [
    icone('clipe'),
    el('div', {}, [el('strong', { textContent: `${TIPOS_EVID[e.tipo] ?? e.tipo}: ` }), e.descricao,
      el('small', { textContent: [e.referencia, e.data].filter(Boolean).join(' · ') }),
      e.anexo ? el('a', { href: urlAnexo(e.anexo.id), target: '_blank', rel: 'noopener', title: `SHA-256 ${e.anexo.sha256}` },
        [`📎 ${e.anexo.nome} (${Math.max(1, Math.round(e.anexo.tamanho / 1024))} KB)`]) : null]),
    botao('', { classe: 'fantasma peq icone', ic: 'lixo', titulo: 'Remover evidência', onclick: () => { evidencias = evidencias.filter((_, j) => j !== i); desenharEvid(); marcarSujo(); } })
  ])) : [el('li', { className: 'muted', style: 'grid-template-columns:1fr', textContent: 'Nenhuma evidência anexada. Validar exige ao menos uma.' })]));
  desenharEvid();
  const novoTipo = el('select', { className: 'entrada', 'aria-label': 'Tipo de evidência' }, Object.entries(TIPOS_EVID).map(([v, t]) => el('option', { value: v, textContent: t })));
  const novaDesc = el('input', { className: 'entrada', placeholder: 'Descrição (ex.: e-mail da arquiteta de 16/11)', maxLength: 500 });
  const novaRef = el('input', { className: 'entrada', placeholder: 'Referência: arquivo, assunto, prancha…', maxLength: 300 });
  const novaData = el('input', { className: 'entrada', type: 'date', 'aria-label': 'Data da evidência' });
  const arquivo = el('input', { type: 'file', className: 'entrada', accept: '.pdf,.png,.jpg,.jpeg,.webp,.txt,.eml,.csv,.md', 'aria-label': 'Anexar arquivo como evidência' });
  arquivo.addEventListener('change', async () => {
    const f = arquivo.files?.[0];
    if (!f) return;
    arquivo.disabled = true;
    try {
      const anexo = await api.enviarAnexo(f);
      evidencias = [...evidencias, { tipo: novoTipo.value, descricao: novaDesc.value.trim() || anexo.nome, referencia: novaRef.value.trim() || null, data: novaData.value || null, anexo }];
      novaDesc.value = ''; novaRef.value = ''; novaData.value = '';
      desenharEvid(); marcarSujo();
      avisar(`Arquivo "${anexo.nome}" anexado. Salve a lacuna para registrar a evidência.`);
    } catch (erro) {
      avisar(erro.message, { erro: true });
    } finally {
      arquivo.value = '';
      arquivo.disabled = false;
    }
  });
  const evid = secao('Evidências', [listaEvid, el('div', { className: 'nova-evidencia' }, [novoTipo, novaDesc, novaRef, novaData,
    el('label', { className: 'campo largo' }, ['Anexar arquivo (PDF, imagem ou texto, até 10 MB)', arquivo]),
    el('div', { className: 'largo' }, [botao('Adicionar evidência', { classe: 'peq', ic: 'mais', onclick: () => {
      if (!novaDesc.value.trim()) { novaDesc.focus(); avisar('Descreva a evidência.', { erro: true }); return; }
      evidencias = [...evidencias, { tipo: novoTipo.value, descricao: novaDesc.value.trim(), referencia: novaRef.value.trim() || null, data: novaData.value || null }];
      novaDesc.value = ''; novaRef.value = ''; novaData.value = '';
      desenharEvid(); marcarSujo();
    } })])])], { cont: evidencias.length, aberta: ['em_validacao', 'validada'].includes(r.status) });

  // ── 4. Validação técnica
  const validacao = ['respondida', 'em_validacao', 'validada'].includes(r.status) ? secao('Validação técnica', [
    campoTexto('Nota de validação', 'notaValidacao', r.notaValidacao, { area: true, dica: 'O que foi conferido, contra qual documento. Obrigatória para validar.', disabled: r.status === 'validada' }),
    r.validadaEm ? el('p', { className: 'muted', style: 'margin:0;font-size:12px', textContent: `Validada em ${dataBr(r.validadaEm)}` }) : null
  ], { aberta: r.status !== 'respondida' }) : null;

  // ── 5. Impacto financeiro
  const ib = { ...l.impactoFinanceiro, ...(r.impacto ?? {}) };
  const totalEl = el('div', { className: 'impacto-total' });
  const atualizarTotal = () => {
    const q = lerNumeroBr(raiz.elements['imp:quantidade']?.value);
    const c = lerNumeroBr(raiz.elements['imp:custoUnitario']?.value);
    const ve = lerNumeroBr(raiz.elements['imp:valorEstimado']?.value);
    const temQ = raiz.elements['imp:quantidade']?.value && raiz.elements['imp:custoUnitario']?.value;
    const [tipo, valor] = temQ && Number.isFinite(q * c) ? ['calculado', q * c]
      : raiz.elements['imp:valorEstimado']?.value && Number.isFinite(ve) ? ['estimado', ve] : ['nao_quantificado', null];
    totalEl.replaceChildren(el('span', { textContent: TIPOS_IMPACTO[tipo] }), el('b', { textContent: valor === null ? 'Não quantificado' : formatarMoeda(valor) }));
  };
  const incerteza = el('select', { className: 'entrada', name: 'imp:incerteza' }, Object.entries(INCERTEZAS).map(([v, t]) => el('option', { value: v, textContent: t, selected: ib.incerteza === v })));
  const impacto = secao('Impacto financeiro', [
    el('p', { className: 'muted', style: 'margin:0;font-size:12px', textContent: 'Preencha só o que for conhecido. Nada é calculado sem quantidade e custo unitário informados.' }),
    campoTexto('Serviço afetado', 'imp:servico', ib.servico, { maxLength: 300 }),
    el('div', { className: 'grade-2' }, [campoTexto('Material', 'imp:material', ib.material, { maxLength: 300 }), campoTexto('Unidade', 'imp:unidade', ib.unidade, { maxLength: 20, placeholder: 'm², un, vb' })]),
    el('div', { className: 'grade-2' }, [campoTexto('Quantidade', 'imp:quantidade', ib.quantidade ?? '', { inputMode: 'decimal' }), campoTexto('Custo unitário (R$)', 'imp:custoUnitario', ib.custoUnitario ?? '', { inputMode: 'decimal' })]),
    el('div', { className: 'grade-2' }, [campoTexto('Valor global estimado (R$)', 'imp:valorEstimado', ib.valorEstimado ?? '', { inputMode: 'decimal', dica: 'Use quando não houver composição.' }),
      el('label', { className: 'campo' }, ['Grau de incerteza', incerteza])]),
    campoTexto('Justificativa da estimativa', 'imp:justificativa', ib.justificativa, { area: true }),
    ib.origemQuantidade ? el('p', { className: 'muted', style: 'margin:0;font-size:12px', textContent: `Origem da quantidade: ${ib.origemQuantidade}` }) : null,
    totalEl
  ], { aberta: false, cont: TIPOS_IMPACTO[imp.tipo] });
  let impactoTocado = false;
  const tocarImpacto = (e) => { if (e.target.name?.startsWith('imp:')) { impactoTocado = true; atualizarTotal(); } };
  raiz.addEventListener('input', tocarImpacto);
  raiz.addEventListener('change', tocarImpacto);

  // ── 6. Histórico
  const eventos = estado.eventos.filter((e) => e.lacuna === l.id);
  const historico = secao('Histórico de alterações', [linhaTempo(eventos)], { aberta: false, cont: eventos.length });

  // ── Ações
  const coletar = (status) => {
    const f = raiz.elements;
    const v = (n) => f[n]?.value ?? '';
    return {
      status,
      campos: Object.fromEntries(l.campos.map((c) => [c.chave, v(`campo:${c.chave}`)])),
      observacao: v('observacao'),
      responsavel: v('responsavel'),
      notaValidacao: v('notaValidacao'),
      evidencias,
      impacto: !impactoTocado ? undefined : {
        servico: v('imp:servico'), material: v('imp:material'), unidade: v('imp:unidade'),
        quantidade: v('imp:quantidade'), custoUnitario: v('imp:custoUnitario'), valorEstimado: v('imp:valorEstimado'),
        incerteza: v('imp:incerteza'), justificativa: v('imp:justificativa'), origemQuantidade: ib.origemQuantidade ?? null
      },
      revisaoEsperada: r.revisao ?? 0,
      autor: preferencia.ler('autor', '') || null
    };
  };

  let emAndamento = false;
  async function salvar(status) {
    if (emAndamento) return; // Ctrl+S repetido durante o envio geraria um falso conflito de revisão
    const a = ACAO[status];
    if (a?.confirmar && status !== r.status && !(await confirmar({ titulo: a.rotulo, texto: a.confirmar, confirmar: a.rotulo, perigo: status === 'reaberta' }))) return;
    const botoes = [...raiz.querySelectorAll('.acoes-status button')];
    botoes.forEach((b) => { b.disabled = true; });
    estado.definirSincronizacao('salvando');
    emAndamento = true;
    try {
      const nova = await api.salvar(l.id, coletar(status));
      sujo = false;
      estado.definirSincronizacao('ok');
      await estado.recarregarEventos();
      avisar(status === 'respondida' && r.status !== 'respondida' && !ESTATICO
        ? `${l.id} devolvida ao Claude. No Claude Code, peça: "processe as respostas das lacunas".`
        : `${l.id} salva · ${STATUS_INFO[nova.status].rotulo}`);
    } catch (erro) {
      estado.definirSincronizacao('erro');
      avisar(erro.message, { erro: true, duracao: 7000 });
      botoes.forEach((b) => { b.disabled = false; });
    } finally {
      emAndamento = false;
    }
  }

  const proximos = proximosStatus(r.status);
  const acoes = el('div', { className: 'acoes-status' }, [
    el('span', { className: 'info' }, [el('kbd', { textContent: 'Ctrl' }), '+', el('kbd', { textContent: 'S' }), ' salva']),
    EDITAVEIS.includes(r.status) ? botao('Salvar', { onclick: () => salvar(r.status), titulo: 'Salvar sem mudar o status (Ctrl+S)' }) : null,
    ...['nao_aplicavel', 'aberta', 'reaberta', 'pendente', 'em_validacao', 'respondida', 'validada']
      .filter((s) => proximos.includes(s))
      .map((s) => botao(ACAO[s].rotulo, { classe: ACAO[s].classe ?? '', ic: ACAO[s].ic, onclick: () => salvar(s), titulo: STATUS_INFO[s].descricao }))
  ]);

  raiz.append(topo, el('div', { className: 'secoes' }, [entender, resposta, evid, validacao, impacto, historico]), acoes);
  alvo.replaceChildren(raiz);
  atualizarTotal();

  return {
    sujo: () => sujo,
    salvarAtalho: () => {
      if (EDITAVEIS.includes(r.status)) salvar(r.status);
      else avisar('Neste status não há edição direta: use as ações abaixo.', { erro: true });
    },
    podeIr: (s) => transicaoPermitida(r.status, s)
  };
}
