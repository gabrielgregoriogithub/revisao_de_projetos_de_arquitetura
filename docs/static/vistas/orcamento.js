// Orçamento / EAP: prévia da árvore, seleção do que exportar (status e colunas), exportações e riscos.
import { el, preferencia } from '../dom.js';
import { estado } from '../estado.js';
import { api, baixar, abrirRelatorio } from '../api.js';
import { botao, vazio, carregando, avisar } from '../componentes.js';
import { STATUS, STATUS_INFO } from '/dominio/status.js';
import { consolidarImpacto, formatarMoeda, TIPOS_IMPACTO, INCERTEZAS } from '/dominio/impacto.js';

const PADRAO = { incluir: ['validada', 'em_validacao', 'respondida'], colunas: null };

export function montar(alvo, { navegar }) {
  let opcoes = { ...PADRAO, ...preferencia.ler('opcoesEap', {}) };
  let colunasDisponiveis = [];
  const previa = el('div', {}, [carregando('Montando EAP…')]);
  const painelOpcoes = el('div');

  const qs = () => {
    const p = new URLSearchParams({ incluir: opcoes.incluir.join(',') || 'nenhum' });
    if (opcoes.colunas) p.set('colunas', opcoes.colunas.join(','));
    return p.toString();
  };
  const salvarOpcoes = (parcial) => { opcoes = { ...opcoes, ...parcial }; preferencia.gravar('opcoesEap', opcoes); desenharOpcoes(); carregar(); };

  function desenharOpcoes() {
    const cols = opcoes.colunas ?? colunasDisponiveis.map(([k]) => k);
    const marca = (lista, valor, aoMudar, rotulo) => el('label', { className: 'check' }, [
      el('input', { type: 'checkbox', checked: lista.includes(valor), onchange: (e) => aoMudar(e.target.checked) }), rotulo
    ]);
    painelOpcoes.replaceChildren(
      el('h3', { style: 'margin:0 0 8px;font-size:13px', textContent: 'Status incluídos' }),
      el('div', { className: 'opcoes-export' }, STATUS.filter((s) => s !== 'nao_aplicavel').map((s) => marca(opcoes.incluir, s,
        (v) => salvarOpcoes({ incluir: v ? [...opcoes.incluir, s] : opcoes.incluir.filter((x) => x !== s) }), STATUS_INFO[s].rotulo))),
      el('p', { className: 'muted', style: 'font-size:12px;margin:6px 0 14px', textContent: 'Itens não validados saem marcados como tal na coluna "Status da especificação".' }),
      el('h3', { style: 'margin:0 0 8px;font-size:13px', textContent: 'Colunas' }),
      el('div', { className: 'opcoes-export' }, colunasDisponiveis.map(([k, r]) => marca(cols, k,
        (v) => salvarOpcoes({ colunas: v ? [...cols, k] : cols.filter((x) => x !== k) }), r))),
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:16px' }, [
        botao('Exportar XLSX', { classe: 'pri', onclick: () => baixar('xlsx', qs()).catch((e) => avisar(e.message, { erro: true })) }),
        botao('CSV hierárquico', { onclick: () => baixar('hierarquica', qs()).catch((e) => avisar(e.message, { erro: true })) }),
        botao('CSV simples (v0.1)', { classe: 'fantasma', titulo: 'Formato original da v0.1 (compatibilidade)', onclick: () => baixar('csv').catch((e) => avisar(e.message, { erro: true })) })
      ])
    );
  }

  async function carregar() {
    previa.replaceChildren(carregando('Montando EAP…'));
    try {
      const { linhas, colunas } = await api.eap(qs());
      if (!colunasDisponiveis.length) { colunasDisponiveis = colunas; desenharOpcoes(); }
      const servicos = linhas.filter((l) => l.tipo === 'servico');
      if (!servicos.length) {
        previa.replaceChildren(vazio('EAP vazia', 'Nenhuma lacuna respondida nos status selecionados. Responda lacunas para gerar serviços.', 'orcamento'));
        return;
      }
      const num = (v, moeda) => (v === null || v === undefined ? '—' : moeda ? formatarMoeda(v) : String(v).replace('.', ','));
      previa.replaceChildren(el('div', { style: 'overflow:auto;max-height:60vh' }, [el('table', { className: 'arvore-eap' }, [
        el('thead', {}, [el('tr', {}, ['Código', 'Descrição', 'Un.', 'Qtd.', 'Total', 'Especificação', 'Origem'].map((t) => el('th', { textContent: t })))]),
        el('tbody', {}, linhas.map((l) => el('tr', { className: l.tipo === 'servico' ? '' : `n${l.nivel - 1}` }, [
          el('td', { className: 'mono', textContent: l.codigo }),
          el('td', { className: 'desc', style: `--nivel:${l.nivel - 1}`, textContent: l.descricao, title: l.observacoes || undefined }),
          el('td', { textContent: l.unidade ?? '' }),
          el('td', { className: 'num', textContent: l.tipo === 'servico' ? num(l.quantidade) : '' }),
          el('td', { className: 'num', textContent: l.tipo === 'servico' ? num(l.custoTotal, true) : '' }),
          el('td', { textContent: l.statusEspecificacao ?? '' }),
          el('td', { className: 'muted', textContent: l.origem ?? '' })
        ])))
      ])]), el('p', { className: 'muted', style: 'font-size:12px;margin:8px 0 0', textContent: `${servicos.length} serviços. Quantidades e custos aparecem só quando informados no impacto da lacuna — nada é estimado automaticamente.` }));
    } catch (erro) {
      previa.replaceChildren(vazio('Falha ao montar a EAP', erro.message, 'alerta'));
      avisar(erro.message, { erro: true });
    }
  }

  function riscos() {
    const c = consolidarImpacto(estado.lacunas);
    return el('div', { style: 'overflow:auto' }, [el('table', { className: 'arvore-eap' }, [
      el('thead', {}, [el('tr', {}, ['Lacuna', 'Serviço afetado', 'Tipo', 'Un.', 'Qtd.', 'Valor', 'Incerteza'].map((t) => el('th', { textContent: t })))]),
      el('tbody', {}, c.itens.map(({ lacuna: l, impacto: i }) => el('tr', { style: 'cursor:pointer', onclick: () => navegar('lacunas', { l: l.id }) }, [
        el('td', { className: 'mono', textContent: l.id }), el('td', { textContent: i.servico ?? '—' }), el('td', { textContent: TIPOS_IMPACTO[i.tipo] }),
        el('td', { textContent: i.unidade ?? '—' }), el('td', { className: 'num', textContent: i.quantidade ?? '—' }),
        el('td', { className: 'num', textContent: formatarMoeda(i.valor) }), el('td', { textContent: INCERTEZAS[i.incerteza] ?? '—' })
      ])))
    ])]);
  }

  const desenhar = () => alvo.replaceChildren(el('div', { className: 'vista-pad' }, [
    el('header', { className: 'cab-vista' }, [el('div', {}, [el('h1', { textContent: 'Orçamento / EAP' }),
      el('p', { textContent: 'Projeto › Disciplina › Ambiente › Grupo › Serviço, gerada a partir das respostas registradas.' })])]),
    el('div', { className: 'grade-dash' }, [
      el('section', { className: 'cartao c-8' }, [el('div', { className: 'cartao-cab' }, [el('h2', { textContent: 'Estrutura analítica' })]), el('div', { className: 'cartao-corpo' }, [previa])]),
      el('section', { className: 'cartao c-4' }, [el('div', { className: 'cartao-cab' }, [el('h2', { textContent: 'Exportar' })]), el('div', { className: 'cartao-corpo' }, [painelOpcoes])]),
      el('section', { className: 'cartao c-12' }, [el('div', { className: 'cartao-cab' }, [el('h2', { textContent: 'Riscos financeiros por lacuna' }),
        el('div', { className: 'acao' }, [botao('Relatório de riscos', { classe: 'fantasma peq', ic: 'abrir', onclick: () => abrirRelatorio('riscos') })])]),
      el('div', { className: 'cartao-corpo' }, [riscos()])])
    ])
  ]));

  desenhar();
  desenharOpcoes();
  carregar();
  const sair = estado.assinar((m) => { if (m === 'dados') { desenhar(); desenharOpcoes(); carregar(); } });
  return { destruir: sair };
}
