// Componentes reutilizáveis: selos, toasts, confirmação, estados vazios, filtros.
import { el } from './dom.js';
import { icone } from './icones.js';
import { STATUS, STATUS_INFO } from '/dominio/status.js';
import { CATEGORIAS, DISCIPLINAS } from '/dominio/lacunas.js';
import { estado, ambientesDisponiveis } from './estado.js';

export const PRIORIDADES = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };

export const seloStatus = (s) => el('span', { className: `selo s-${s}`, textContent: STATUS_INFO[s]?.rotulo ?? s, title: STATUS_INFO[s]?.descricao });
export const etiquetaPrioridade = (p) => el('span', { className: `etiqueta ${p}`, textContent: PRIORIDADES[p] ?? p, title: `Prioridade ${PRIORIDADES[p] ?? p}` });
export const etiqueta = (t, title) => el('span', { className: 'etiqueta', textContent: t, title });

export function botao(rotulo, { classe = '', ic, titulo, onclick, tipo = 'button', desativado = false } = {}) {
  return el('button', { type: tipo, className: `botao ${classe}`, title: titulo, onclick, disabled: desativado, 'aria-label': rotulo ? undefined : titulo },
    [ic ? icone(ic) : null, rotulo ? el('span', { className: 'txt', textContent: rotulo }) : null]);
}

export function vazio(titulo, texto, ic = 'vazio') {
  return el('div', { className: 'vazio' }, [icone(ic), el('strong', { textContent: titulo }), texto ? el('span', { textContent: texto }) : null]);
}

export function carregando(texto = 'Carregando…') {
  return el('div', { className: 'carregando' }, [el('div', { className: 'giro' }), el('span', { textContent: texto })]);
}

export function avisar(mensagem, { erro = false, duracao = 4200 } = {}) {
  let pilha = document.querySelector('.toast-pilha');
  if (!pilha) {
    pilha = el('div', { className: 'toast-pilha', role: 'status', 'aria-live': 'polite' });
    document.body.append(pilha);
  }
  const t = el('div', { className: `toast${erro ? ' erro' : ''}` }, [icone(erro ? 'alerta' : 'check'), el('span', { textContent: mensagem })]);
  pilha.append(t);
  setTimeout(() => t.remove(), duracao);
}

/**
 * Diálogo de confirmação acessível (<dialog>). Resolve true/false.
 * @param {{titulo:string, texto:string, confirmar?:string, perigo?:boolean}} o
 */
export function confirmar({ titulo, texto, confirmar = 'Confirmar', perigo = false }) {
  return new Promise((resolve) => {
    const ok = botao(confirmar, { classe: perigo ? 'perigo' : 'pri' });
    const cancelar = botao('Cancelar', { classe: 'fantasma' });
    const d = el('dialog', { className: 'modal', 'aria-labelledby': 'modal-titulo' }, [
      el('div', { className: 'modal-corpo' }, [el('h2', { id: 'modal-titulo', textContent: titulo }), el('p', { textContent: texto })]),
      el('div', { className: 'modal-acoes' }, [cancelar, ok])
    ]);
    const fim = (v) => { d.close(); d.remove(); resolve(v); };
    ok.onclick = () => fim(true);
    cancelar.onclick = () => fim(false);
    d.addEventListener('cancel', (e) => { e.preventDefault(); fim(false); });
    document.body.append(d);
    d.showModal();
    ok.focus();
  });
}

/** Diálogo informativo com conteúdo livre. */
export function dialogo(titulo, conteudo) {
  const fechar = botao('Fechar', { classe: 'pri' });
  const d = el('dialog', { className: 'modal' }, [
    el('div', { className: 'modal-corpo' }, [el('h2', { textContent: titulo }), conteudo]),
    el('div', { className: 'modal-acoes' }, [fechar])
  ]);
  fechar.onclick = () => { d.close(); d.remove(); };
  d.addEventListener('close', () => d.remove());
  document.body.append(d);
  d.showModal();
}

const opcoes = (rotuloVazio, pares, atual) => [
  el('option', { value: '', textContent: rotuloVazio }),
  ...pares.map(([v, r]) => el('option', { value: v, textContent: r, selected: String(atual) === String(v) }))
];

/** Barra de filtros ligada ao estado global (compartilhada entre Pranchas e Lacunas). */
export function barraFiltros({ compacta = false } = {}) {
  const f = estado.filtros;
  const sel = (chave, rotulo, pares) => {
    const s = el('select', { className: 'entrada', 'aria-label': rotulo, onchange: (e) => estado.definirFiltros({ [chave]: e.target.value, ids: null }) },
      opcoes(rotulo, pares, f[chave]));
    return s;
  };
  const busca = el('input', {
    className: 'entrada busca', type: 'search', placeholder: 'Buscar código, título, ambiente…  ( / )', value: f.busca,
    'aria-label': 'Buscar lacunas', id: 'busca-lacunas'
  });
  let t;
  busca.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => estado.definirFiltros({ busca: busca.value }), 150); });

  const statusPares = [['abertas', 'Abertas + reabertas'], ...STATUS.map((s) => [s, STATUS_INFO[s].rotulo])];
  const campos = [
    busca,
    sel('status', 'Todos os status', statusPares),
    sel('prioridade', 'Toda prioridade', Object.entries(PRIORIDADES)),
    compacta ? null : sel('categoria', 'Toda categoria', Object.entries(CATEGORIAS)),
    compacta ? null : sel('disciplina', 'Toda disciplina', Object.entries(DISCIPLINAS)),
    compacta ? null : sel('ambiente', 'Todo ambiente', ambientesDisponiveis().map((a) => [a, a])),
    compacta ? null : sel('prancha', 'Toda prancha', (estado.projeto?.pranchas ?? []).map((p) => [p.numero, `PDF p.${p.numero} – folha ${p.folha}`])),
    estado.temFiltro() ? botao('Limpar', { classe: 'fantasma peq limpar', ic: 'fechar', onclick: () => estado.limparFiltros() }) : null,
    f.ids ? etiqueta(`Seleção do alerta: ${f.ids.length} lacunas`) : null
  ];
  return el('div', { className: 'filtros', role: 'search' }, campos);
}

/** Executa um redesenho preservando o foco/cursor de um campo identificado por id (ex.: a busca). */
export function preservarFoco(redesenhar) {
  const ativo = document.activeElement;
  const id = ativo?.id;
  const pos = ativo && 'selectionStart' in ativo ? [ativo.selectionStart, ativo.selectionEnd] : null;
  redesenhar();
  if (!id) return;
  const novo = document.getElementById(id);
  if (novo && novo !== ativo) {
    novo.focus();
    if (pos) try { novo.setSelectionRange(...pos); } catch { /* campos sem seleção */ }
  }
}

export const corStatus = (s) => ({
  aberta: 'var(--vermelho)', reaberta: 'var(--vermelho)', pendente: 'var(--amarelo)',
  em_validacao: 'var(--amarelo)', respondida: 'var(--verde)', validada: 'var(--verde-escuro)', nao_aplicavel: 'var(--cinza)'
})[s] ?? 'var(--cinza)';
