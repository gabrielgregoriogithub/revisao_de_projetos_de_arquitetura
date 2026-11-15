// Gestão de lacunas: busca, filtros, ordenação, lista/cartões, seleção múltipla e mudança de status em lote.
import { el, preferencia } from '../dom.js';
import { estado, lacunasFiltradas } from '../estado.js';
import { api } from '../api.js';
import { botao, barraFiltros, seloStatus, etiquetaPrioridade, etiqueta, vazio, avisar, confirmar, preservarFoco } from '../componentes.js';
import { renderizarDetalhe } from './detalhe.js';
import { STATUS_INFO } from '/dominio/status.js';
import { CATEGORIAS } from '/dominio/lacunas.js';

const STATUS_LOTE = ['pendente', 'em_validacao', 'reaberta', 'nao_aplicavel'];

export function montar(alvo, { navegar, params }) {
  let modo = preferencia.ler('modoLista', 'lista');
  let selecao = new Set();
  let ativa = params.get('l') || null;
  let painel = { sujo: () => false };
  let idDetalhe = null;

  const area = el('div', { className: 'lista-area' });
  const detalheCol = el('aside', { className: 'detalhe-col', 'aria-label': 'Detalhe da lacuna' });
  const raiz = el('div', { className: 'gestao' }, [area, detalheCol]);
  alvo.replaceChildren(raiz);

  async function podeSair() {
    if (!painel.sujo()) return true;
    return confirmar({ titulo: 'Descartar alterações?', texto: 'Há alterações não salvas nesta lacuna.', confirmar: 'Descartar', perigo: true });
  }

  async function abrir(id) {
    if (id !== ativa && !(await podeSair())) return;
    if (id !== ativa) estado.definirSincronizacao('ok'); // alterações descartadas (ou não havia)
    ativa = id;
    history.replaceState(null, '', id ? `#/lacunas?l=${encodeURIComponent(id)}` : '#/lacunas');
    desenhar();
  }

  function navegarLacuna(delta) {
    const lista = lacunasFiltradas();
    if (!lista.length) return;
    const i = lista.findIndex((l) => l.id === ativa);
    abrir(lista[(i + delta + lista.length) % lista.length].id);
  }

  const alternar = (id, marcado) => {
    selecao = new Set(selecao);
    if (marcado) selecao.add(id); else selecao.delete(id);
    desenhar();
  };

  async function aplicarLote(status, observacao) {
    const ids = [...selecao];
    const ok = await confirmar({
      titulo: `Alterar ${ids.length} lacunas para "${STATUS_INFO[status].rotulo}"?`,
      texto: 'Cada lacuna é validada individualmente: as que não permitirem essa transição ficam como estão. Tudo fica registrado no histórico.',
      confirmar: 'Aplicar'
    });
    if (!ok) return;
    try {
      const { resultados } = await api.statusLote({ ids, status, observacao: observacao || undefined, autor: preferencia.ler('autor', '') || null });
      const falhas = resultados.filter((r) => !r.ok);
      await estado.recarregarEventos();
      selecao = new Set();
      avisar(falhas.length
        ? `${resultados.length - falhas.length} alteradas. Não alteradas: ${falhas.map((f) => `${f.id} (${f.erro})`).join('; ')}`
        : `${resultados.length} lacunas alteradas.`, { erro: falhas.length > 0, duracao: falhas.length ? 9000 : 4000 });
    } catch (erro) {
      avisar(erro.message, { erro: true });
    }
  }

  function barraLote() {
    if (!selecao.size) return null;
    const sel = el('select', { className: 'entrada', 'aria-label': 'Novo status' }, STATUS_LOTE.map((s) => el('option', { value: s, textContent: STATUS_INFO[s].rotulo })));
    const obs = el('input', { className: 'entrada', placeholder: 'Observação (obrigatória para "não aplicável")', style: 'max-width:320px' });
    return el('div', { className: 'barra-lote', role: 'region', 'aria-label': 'Ações em lote' }, [
      el('strong', { textContent: `${selecao.size} selecionadas` }), 'Mudar para', sel, obs,
      botao('Aplicar', { classe: 'pri peq', onclick: () => aplicarLote(sel.value, obs.value) }),
      botao('Limpar seleção', { classe: 'fantasma peq', onclick: () => { selecao = new Set(); desenhar(); } })
    ]);
  }

  const check = (l) => el('input', {
    type: 'checkbox', checked: selecao.has(l.id), 'aria-label': `Selecionar ${l.id}`,
    onclick: (e) => e.stopPropagation(), onchange: (e) => alternar(l.id, e.target.checked)
  });

  function tabela(lista) {
    const todos = el('input', { type: 'checkbox', 'aria-label': 'Selecionar todas', checked: lista.length > 0 && lista.every((l) => selecao.has(l.id)),
      onchange: (e) => { selecao = e.target.checked ? new Set(lista.map((l) => l.id)) : new Set(); desenhar(); } });
    return el('table', { className: 'tabela-lacunas' }, [
      el('thead', {}, [el('tr', {}, [el('th', {}, [todos]), ...['ID', 'Lacuna', 'Status', 'Prioridade'].map((t) => el('th', { textContent: t })),
        el('th', { className: 'ocultar-mobile', textContent: 'Categoria' }), el('th', { className: 'ocultar-mobile', textContent: 'Ambientes' }),
        el('th', { className: 'ocultar-mobile', textContent: 'Pranchas' }), el('th', { className: 'ocultar-mobile', textContent: 'Atualizada' })])]),
      el('tbody', {}, lista.map((l) => el('tr', { 'aria-selected': String(l.id === ativa), onclick: () => abrir(l.id), tabIndex: 0,
        onkeydown: (e) => { if (e.key === 'Enter') abrir(l.id); } }, [
        el('td', {}, [check(l)]),
        el('td', {}, [el('span', { className: 'codigo', textContent: l.id })]),
        el('td', {}, [el('div', { className: 'tit', textContent: l.titulo }), el('div', { className: 'sub', textContent: l.onde })]),
        el('td', {}, [seloStatus(l.resposta.status)]),
        el('td', {}, [etiquetaPrioridade(l.prioridade)]),
        el('td', { className: 'ocultar-mobile', textContent: CATEGORIAS[l.categoria] ?? l.categoria }),
        el('td', { className: 'ocultar-mobile', textContent: l.ambientes.join(', ') }),
        el('td', { className: 'ocultar-mobile mono', textContent: l.pranchas.map((p) => `p.${p}`).join(' ') }),
        el('td', { className: 'ocultar-mobile muted', textContent: l.resposta.atualizadoEm ? new Date(l.resposta.atualizadoEm).toLocaleDateString('pt-BR') : '—' })
      ])))
    ]);
  }

  function cartoes(lista) {
    return el('div', { className: 'cartoes-lacunas' }, lista.map((l) => el('article', {
      className: 'cartao cartao-lacuna', 'aria-selected': String(l.id === ativa), tabIndex: 0, onclick: () => abrir(l.id),
      onkeydown: (e) => { if (e.key === 'Enter') abrir(l.id); }
    }, [
      el('div', { className: 'topo-c' }, [el('span', { className: 'codigo', textContent: l.id }), seloStatus(l.resposta.status), el('label', { className: 'check' }, [check(l)])]),
      el('h3', { textContent: l.titulo }),
      el('p', { textContent: l.problema }),
      el('div', { className: 'rodape-c' }, [etiquetaPrioridade(l.prioridade), etiqueta(CATEGORIAS[l.categoria] ?? l.categoria), ...l.ambientes.slice(0, 2).map((a) => etiqueta(a))])
    ])));
  }

  function desenhar() {
    const lista = lacunasFiltradas();
    const ordem = el('select', { className: 'entrada', 'aria-label': 'Ordenar por', onchange: (e) => estado.definirFiltros({ ordem: e.target.value }) },
      [['criticidade', 'Ordenar: criticidade'], ['id', 'Ordenar: código'], ['status', 'Ordenar: status'], ['atualizacao', 'Ordenar: última atualização']]
        .map(([v, t]) => el('option', { value: v, textContent: t, selected: estado.filtros.ordem === v })));
    const alternarModo = (m) => { modo = m; preferencia.gravar('modoLista', m); desenhar(); };

    area.replaceChildren(el('div', { className: 'vista-pad' }, [
      el('header', { className: 'cab-vista' }, [
        el('div', {}, [el('h1', { textContent: 'Lacunas' }), el('p', { textContent: `${lista.length} de ${estado.lacunas.length} lacunas` })]),
        el('div', { className: 'acoes' }, [
          ordem,
          el('div', { className: 'grupo-botoes', role: 'group', 'aria-label': 'Modo de visualização' }, [
            Object.assign(botao('Lista', { classe: 'peq', ic: 'lista', onclick: () => alternarModo('lista') }), { ariaPressed: String(modo === 'lista') }),
            Object.assign(botao('Cartões', { classe: 'peq', ic: 'cartoes', onclick: () => alternarModo('cartoes') }), { ariaPressed: String(modo === 'cartoes') })
          ]),
          botao('Ver na prancha', { classe: 'peq', ic: 'prancha', desativado: !ativa, onclick: () => navegar('pranchas', { l: ativa }) })
        ])
      ]),
      barraFiltros(),
      barraLote(),
      lista.length ? (modo === 'cartoes' ? cartoes(lista) : tabela(lista)) : vazio('Nenhuma lacuna encontrada', 'Revise a busca ou limpe os filtros.', 'lacunas')
    ]));
    area.querySelectorAll('.grupo-botoes .botao').forEach((b) => b.setAttribute('aria-pressed', b.ariaPressed));

    raiz.classList.toggle('com-detalhe', Boolean(ativa));
    // Redesenhos da lista (filtros, seleção, modo, sincronização) nunca apagam um formulário com edições não salvas.
    if (!ativa) {
      painel = { sujo: () => false };
      idDetalhe = null;
    } else if (ativa !== idDetalhe || !painel.sujo()) {
      painel = renderizarDetalhe(detalheCol, ativa, { aoVerMarcador: (m) => navegar('pranchas', { l: ativa, p: m.prancha }), aoNavegar: navegarLacuna, aoFechar: () => abrir(null), aoAbrir: (rid) => abrir(rid) });
      idDetalhe = ativa;
    }
  }

  desenhar();
  const sair = estado.assinar((m) => { if (['dados', 'resposta', 'filtros'].includes(m)) preservarFoco(desenhar); });
  return {
    destruir: sair,
    podeSair,
    teclas: { j: () => navegarLacuna(1), k: () => navegarLacuna(-1), Escape: () => ativa && abrir(null), salvar: () => painel.salvarAtalho?.() }
  };
}
