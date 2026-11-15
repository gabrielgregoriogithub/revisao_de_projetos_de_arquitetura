// Dashboard executivo: indicadores, resolução, alertas, distribuições, evolução e risco financeiro.
import { el } from '../dom.js';
import { estado } from '../estado.js';
import { botao, vazio } from '../componentes.js';
import { abrirRelatorio } from '../api.js';
import { barras, barraStatus, linhaEvolucao } from '../graficos.js';
import { calcularIndicadores, gerarAlertas } from '/dominio/indicadores.js';
import { formatarMoeda } from '/dominio/impacto.js';
import { PRIORIDADES } from '../componentes.js';

const cartao = (titulo, corpo, { classe = 'c-6', acao } = {}) => el('section', { className: `cartao ${classe}` }, [
  el('div', { className: 'cartao-cab' }, [el('h2', { textContent: titulo }), acao ? el('div', { className: 'acao' }, [acao]) : null]),
  el('div', { className: 'cartao-corpo' }, corpo)
]);

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

export function montar(alvo, { navegar }) {
  const desenhar = () => {
    const { projeto, lacunas, eventos } = estado;
    const ind = calcularIndicadores(projeto, lacunas, eventos);
    const alertas = gerarAlertas(lacunas);
    const irLacunas = (filtros) => { estado.definirFiltros({ busca: '', status: '', prioridade: '', categoria: '', ambiente: '', prancha: '', disciplina: '', ids: null, ...filtros }); navegar('lacunas'); };

    const kpi = (valor, rotulo, sub, filtros, tom) => el('button', { type: 'button', className: 'kpi', 'data-tom': tom, onclick: () => irLacunas(filtros), title: 'Ver estas lacunas' }, [
      el('b', { textContent: valor }), el('span', { textContent: rotulo }), sub ? el('small', { textContent: sub }) : null
    ]);

    const kpis = el('div', { className: 'kpis' }, [
      kpi(ind.total, 'Lacunas identificadas', `${ind.pranchasAnalisadas} pranchas analisadas`, {}),
      kpi(ind.abertas, 'Abertas', 'sem resposta ou reabertas', { status: 'abertas' }, ind.abertas ? 'vermelho' : undefined),
      kpi(ind.pendentes, 'Pendentes de terceiros', null, { status: 'pendente' }, ind.pendentes ? 'amarelo' : undefined),
      kpi(ind.emValidacao, 'Em validação', null, { status: 'em_validacao' }, ind.emValidacao ? 'amarelo' : undefined),
      kpi(ind.respondidas, 'Respondidas', 'não validadas', { status: 'respondida' }),
      kpi(ind.validadas, 'Validadas', 'com evidência', { status: 'validada' }, ind.validadas ? 'verde' : undefined),
      kpi(ind.altaPrioridadeAbertas, 'Alta prioridade', 'ainda não resolvidas', { prioridade: 'alta' }, ind.altaPrioridadeAbertas ? 'vermelho' : undefined),
      kpi(ind.conflitos, 'Conflitos entre pranchas', 'inconsistências ou multi-prancha', { categoria: 'inconsistencia' })
    ]);

    const resolucao = cartao('Maturidade do projeto', [
      el('div', { className: 'hero-resolucao' }, [
        el('div', { className: 'numero' }, [`${ind.percentualResolucao}`, el('small', { textContent: '% resolvido' })]),
        el('p', { textContent: `${plural(ind.validadas, 'validada', 'validadas')} e ${plural(ind.naoAplicaveis, 'não aplicável', 'não aplicáveis')}, de ${ind.total}. ${ind.percentualRespondidas}% já têm alguma resposta. Só contam como resolvidas as lacunas validadas com evidência ou arquivadas com justificativa.` })
      ]),
      barraStatus(ind.porStatus, ind.total)
    ], { classe: 'c-7' });

    const listaAlertas = alertas.length ? el('div', { className: 'alertas' }, alertas.map((a) => el('button', {
      type: 'button', className: 'alerta', 'data-nivel': a.nivel, onclick: () => irLacunas({ ids: a.ids }), title: 'Ver as lacunas deste alerta'
    }, [el('div', {}, [el('strong', { textContent: a.titulo }), el('span', { textContent: a.descricao })]), el('span', { className: 'ids', textContent: a.ids.join(', ') })])))
      : vazio('Nenhum alerta', 'Todas as lacunas críticas estão resolvidas.', 'check');

    const risco = ind.impacto;
    const cartaoRisco = cartao('Risco financeiro', [
      el('div', { className: 'risco-resumo' }, [
        el('div', {}, [el('b', { textContent: formatarMoeda(risco.calculado) }), el('span', { textContent: `calculado · ${risco.qtdCalculado} lacunas` })]),
        el('div', {}, [el('b', { textContent: formatarMoeda(risco.estimado) }), el('span', { textContent: `estimado · ${risco.qtdEstimado} lacunas` })]),
        el('div', {}, [el('b', { textContent: risco.naoQuantificados.length }), el('span', { textContent: 'riscos não quantificados' })])
      ]),
      el('p', { className: 'muted', style: 'margin:10px 0 0;font-size:12px', textContent: risco.sobreposicoes.length
        ? `Atenção: possível sobreposição entre ${risco.sobreposicoes.map((p) => p.join('×')).join(', ')}. Valores calculados e estimados não são somados entre si.`
        : 'Valores calculados e estimados são mostrados separadamente e nunca somados entre si. Nenhum preço é inventado.' })
    ], { classe: 'c-5', acao: botao('Orçamento', { classe: 'fantasma peq', ic: 'proximo', onclick: () => navegar('orcamento') }) });

    const porCat = barras(ind.porCategoria.map((c) => ({ ...c, rotulo: c.rotulo })), (i) => irLacunas({ categoria: i.chave }));
    const porPri = barras(ind.porPrioridade.map((p) => ({ ...p, rotulo: PRIORIDADES[p.chave] })), (i) => irLacunas({ prioridade: i.chave }));
    const amb = ind.ambientesAfetados.slice(0, 8);
    const porAmb = amb.length ? barras(amb.map((a) => ({ ...a, rotulo: a.chave })), (i) => irLacunas({ ambiente: i.chave })) : vazio('Nenhum ambiente pendente');
    const porDisc = ind.disciplinasPendentes.length ? barras(ind.disciplinasPendentes, (i) => irLacunas({ disciplina: i.chave })) : vazio('Nenhuma pendência');
    const evolucao = ind.evolucao.length
      ? linhaEvolucao(ind.evolucao)
      : vazio('Ainda sem histórico', 'A curva aparece conforme as lacunas forem respondidas e validadas.', 'historico');

    alvo.replaceChildren(el('div', { className: 'vista-pad' }, [
      el('header', { className: 'cab-vista' }, [
        el('div', {}, [el('h1', { textContent: 'Visão geral' }), el('p', { textContent: `${projeto.nome} · ${projeto.etapa} · análise de ${projeto.analisadoEm}` })]),
        el('div', { className: 'acoes' }, [
          botao('Revisar pranchas', { classe: 'pri', ic: 'prancha', onclick: () => navegar('pranchas') }),
          botao('Relatório executivo', { ic: 'relatorio', onclick: () => abrirRelatorio('executivo') })
        ])
      ]),
      kpis,
      el('div', { className: 'grade-dash' }, [
        resolucao, cartaoRisco,
        cartao('Alertas', [listaAlertas], { classe: 'c-5' }),
        cartao('Evolução da resolução', [evolucao], { classe: 'c-7' }),
        cartao('Por categoria', [porCat], { classe: 'c-4' }),
        cartao('Ambientes mais afetados', [porAmb], { classe: 'c-4' }),
        cartao('Pendências por disciplina', [porDisc], { classe: 'c-4' }),
        cartao('Por prioridade', [porPri], { classe: 'c-4' })
      ])
    ]));
  };
  desenhar();
  const sair = estado.assinar((m) => { if (m === 'dados' || m === 'resposta') desenhar(); });
  return { destruir: sair };
}
