// Indicadores do dashboard e alertas, calculados só a partir dos dados reais.
import { RESOLVIDOS, COM_RESPOSTA, ABERTOS } from './status.js';
import { CATEGORIAS, DISCIPLINAS } from './lacunas.js';
import { consolidarImpacto } from './impacto.js';

const contarPor = (itens, chaves) => {
  const mapa = new Map();
  for (const item of itens) for (const k of chaves(item)) mapa.set(k, (mapa.get(k) ?? 0) + 1);
  return [...mapa.entries()].map(([chave, total]) => ({ chave, total })).sort((a, b) => b.total - a.total);
};

const statusDe = (l) => l.resposta?.status ?? 'aberta';

/** @param {object[]} lacunas lacunas normalizadas e mescladas com a resposta */
export function calcularIndicadores(projeto, lacunas, eventos = []) {
  const total = lacunas.length;
  const por = (lista) => lacunas.filter((l) => lista.includes(statusDe(l))).length;
  const conflitos = lacunas.filter((l) => l.categoria === 'inconsistencia' || (l.pranchas?.length ?? 0) > 1);
  const pendentesDe = (l) => !RESOLVIDOS.includes(statusDe(l));

  return {
    total,
    abertas: por(ABERTOS),
    pendentes: por(['pendente']),
    emValidacao: por(['em_validacao']),
    respondidas: por(['respondida']),
    validadas: por(['validada']),
    naoAplicaveis: por(['nao_aplicavel']),
    comResposta: por(COM_RESPOSTA),
    altaPrioridadeAbertas: lacunas.filter((l) => l.prioridade === 'alta' && pendentesDe(l)).length,
    percentualResolucao: total ? Math.round((por(RESOLVIDOS) / total) * 100) : 0,
    percentualRespondidas: total ? Math.round((por([...COM_RESPOSTA, 'nao_aplicavel']) / total) * 100) : 0,
    pranchasAnalisadas: projeto?.pranchas?.length ?? 0,
    conflitos: conflitos.length,
    porStatus: contarPor(lacunas, (l) => [statusDe(l)]),
    porCategoria: contarPor(lacunas, (l) => [l.categoria]).map((c) => ({ ...c, rotulo: CATEGORIAS[c.chave] ?? c.chave })),
    porPrioridade: ['alta', 'media', 'baixa'].map((p) => ({ chave: p, total: lacunas.filter((l) => l.prioridade === p).length })),
    ambientesAfetados: contarPor(lacunas.filter(pendentesDe), (l) => l.ambientes ?? []),
    disciplinasPendentes: contarPor(lacunas.filter(pendentesDe), (l) => l.disciplinas ?? [])
      .map((d) => ({ ...d, rotulo: DISCIPLINAS[d.chave] ?? d.chave })),
    evolucao: serieEvolucao(eventos, total),
    impacto: consolidarImpacto(lacunas)
  };
}

/**
 * Série diária de lacunas com resposta e resolvidas, reconstruída do histórico de eventos.
 * Cada evento traz `de` e `para` (status), então o estado em cada dia é reproduzível.
 */
export function serieEvolucao(eventos, total) {
  const ordenados = [...eventos].filter((e) => e.para?.status).sort((a, b) => a.em.localeCompare(b.em));
  const atual = new Map();
  const porDia = new Map();
  for (const e of ordenados) {
    atual.set(e.lacuna, e.para.status);
    const valores = [...atual.values()];
    porDia.set(e.em.slice(0, 10), {
      dia: e.em.slice(0, 10),
      comResposta: valores.filter((s) => [...COM_RESPOSTA, 'nao_aplicavel'].includes(s)).length,
      resolvidas: valores.filter((s) => RESOLVIDOS.includes(s)).length,
      total
    });
  }
  return [...porDia.values()];
}

/** Alertas relevantes, cada um apontando para as lacunas que o originam. */
export function gerarAlertas(lacunas) {
  const pend = lacunas.filter((l) => !RESOLVIDOS.includes(statusDe(l)) && statusDe(l) !== 'validada');
  const alertas = [
    {
      tipo: 'material', nivel: 'critico', titulo: 'Materiais sem especificação',
      descricao: 'Ambientes sem piso, parede ou teto definidos.',
      ids: pend.filter((l) => ['piso', 'parede', 'revestimento', 'forro'].includes(l.categoria)).map((l) => l.id)
    },
    {
      tipo: 'divergencia', nivel: 'alto', titulo: 'Divergências entre pranchas',
      descricao: 'Informações conflitantes entre documentos.',
      ids: pend.filter((l) => l.categoria === 'inconsistencia').map((l) => l.id)
    },
    {
      tipo: 'documental', nivel: 'medio', titulo: 'Inconsistências documentais',
      descricao: 'Carimbos, numeração e dados cadastrais.',
      ids: pend.filter((l) => l.categoria === 'documentacao').map((l) => l.id)
    },
    {
      tipo: 'confirmacao', nivel: 'medio', titulo: 'Aguardando confirmação',
      descricao: 'Pendentes de terceiros ou em validação técnica.',
      ids: lacunas.filter((l) => ['pendente', 'em_validacao'].includes(statusDe(l))).map((l) => l.id)
    },
    {
      tipo: 'orcamento', nivel: 'critico', titulo: 'Alto impacto no orçamento',
      descricao: 'Prioridade alta e ainda sem resposta validada.',
      ids: pend.filter((l) => l.prioridade === 'alta').map((l) => l.id)
    },
    {
      tipo: 'reaberta', nivel: 'alto', titulo: 'Lacunas reabertas',
      descricao: 'Respostas que se mostraram insuficientes ou contraditórias.',
      ids: lacunas.filter((l) => statusDe(l) === 'reaberta').map((l) => l.id)
    }
  ];
  return alertas.filter((a) => a.ids.length);
}
