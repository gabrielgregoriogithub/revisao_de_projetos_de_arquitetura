// Estado do cliente: dados do projeto, filtros persistentes e assinaturas de mudança.
import { api, definirProjetoAtual } from './api.js';
import { preferencia } from './dom.js';
import { criticidade, ORDEM_STATUS } from '/dominio/status.js';

const FILTROS_PADRAO = { busca: '', status: '', prioridade: '', categoria: '', ambiente: '', prancha: '', disciplina: '', ordem: 'criticidade', ids: null };

const ouvintes = new Set();
let dados = { projeto: null, lacunas: [], integridade: [], eventos: [] };
let filtros = { ...FILTROS_PADRAO, ...preferencia.ler('filtros', {}), ids: null };

export const estado = {
  get projeto() { return dados.projeto; },
  get lacunas() { return dados.lacunas; },
  get eventos() { return dados.eventos; },
  get integridade() { return dados.integridade; },
  get ambientes() { return dados.ambientes ?? []; },
  get anotacoes() { return dados.anotacoes ?? []; },
  get textoPdf() { return dados.textoPdf ?? null; },
  get projetoId() { return dados.projetoId; },
  get filtros() { return filtros; },
  sincronizacao: 'ok',

  lacuna: (id) => dados.lacunas.find((l) => l.id === id) ?? null,

  assinar(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); },
  notificar(motivo) { for (const fn of ouvintes) fn(motivo); },

  async carregar() {
    dados = await api.projeto();
    definirProjetoAtual(dados.projetoId);
    this.notificar('dados');
  },

  definirFiltros(parcial) {
    filtros = { ...filtros, ...parcial };
    const { ids, ...persistir } = filtros;
    preferencia.gravar('filtros', persistir);
    this.notificar('filtros');
  },
  limparFiltros() { this.definirFiltros({ ...FILTROS_PADRAO }); },
  temFiltro() { return Object.entries(filtros).some(([k, v]) => k !== 'ordem' && (Array.isArray(v) ? v.length : v)); },

  /** Aplica a resposta salva sem recarregar tudo. */
  aplicarResposta(id, resposta) {
    dados = { ...dados, lacunas: dados.lacunas.map((l) => (l.id === id ? { ...l, resposta } : l)) };
    this.notificar('resposta');
  },
  async recarregarEventos() {
    const novo = await api.projeto();
    dados = novo;
    definirProjetoAtual(dados.projetoId);
    this.notificar('dados');
  },
  definirSincronizacao(s) { this.sincronizacao = s; this.notificar('sync'); },

  /**
   * Verifica se os arquivos mudaram fora do app (ex.: Claude processou respostas).
   * Não recarrega enquanto houver edição não salva. Devolve true se recarregou.
   */
  async verificarMudancasExternas() {
    if (this.sincronizacao === 'sujo' || this.sincronizacao === 'salvando') return false;
    const { versao } = await api.versao();
    if (versao === dados.versao) return false;
    dados = await api.projeto();
    definirProjetoAtual(dados.projetoId);
    this.notificar('dados');
    return true;
  }
};

const normal = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Lacunas filtradas e ordenadas conforme os filtros atuais. */
export function lacunasFiltradas(f = filtros) {
  const busca = normal(f.busca);
  const lista = dados.lacunas.filter((l) =>
    (!f.ids || f.ids.includes(l.id)) &&
    (!busca || normal(`${l.id} ${l.titulo} ${l.problema} ${l.onde} ${l.ambientes.join(' ')}`).includes(busca)) &&
    (!f.status || (f.status === 'abertas' ? ['aberta', 'reaberta'].includes(l.resposta.status) : l.resposta.status === f.status)) &&
    (!f.prioridade || l.prioridade === f.prioridade) &&
    (!f.categoria || l.categoria === f.categoria) &&
    (!f.ambiente || l.ambientes.includes(f.ambiente)) &&
    (!f.prancha || l.pranchas.includes(Number(f.prancha))) &&
    (!f.disciplina || l.disciplinas.includes(f.disciplina)));
  const ordens = {
    criticidade: (a, b) => criticidade(a) - criticidade(b) || a.id.localeCompare(b.id),
    id: (a, b) => a.id.localeCompare(b.id, 'pt-BR', { numeric: true }),
    status: (a, b) => ORDEM_STATUS[a.resposta.status] - ORDEM_STATUS[b.resposta.status] || a.id.localeCompare(b.id),
    atualizacao: (a, b) => (b.resposta.atualizadoEm ?? '').localeCompare(a.resposta.atualizadoEm ?? '')
  };
  return [...lista].sort(ordens[f.ordem] ?? ordens.criticidade);
}

export const ambientesDisponiveis = () => [...new Set(dados.lacunas.flatMap((l) => l.ambientes))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
