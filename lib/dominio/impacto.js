// Impacto financeiro das lacunas: classificação e consolidação sem dupla contagem.

export const TIPOS_IMPACTO = {
  calculado: 'Calculado (quantidade × custo unitário)',
  estimado: 'Estimado (valor global justificado)',
  nao_quantificado: 'Risco não quantificado'
};
export const INCERTEZAS = { baixa: 'Baixa', media: 'Média', alta: 'Alta' };

const numero = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

/**
 * Impacto efetivo da lacuna: o informado pelo usuário (resposta.impacto) prevalece sobre o da análise.
 * O tipo é recalculado a partir dos dados — nunca confia em "calculado" sem os números.
 */
export function impactoEfetivo(lacuna) {
  const base = { ...(lacuna.impactoFinanceiro ?? {}), ...(lacuna.resposta?.impacto ?? {}) };
  const quantidade = numero(base.quantidade);
  const custoUnitario = numero(base.custoUnitario);
  const valorEstimado = numero(base.valorEstimado);

  if (quantidade !== null && custoUnitario !== null) {
    return { ...base, quantidade, custoUnitario, tipo: 'calculado', valor: Math.round(quantidade * custoUnitario * 100) / 100 };
  }
  if (valorEstimado !== null && (base.justificativa ?? '').trim()) {
    return { ...base, quantidade, custoUnitario, valorEstimado, tipo: 'estimado', valor: valorEstimado };
  }
  return { ...base, quantidade, custoUnitario, valorEstimado, tipo: 'nao_quantificado', valor: null };
}

/**
 * Consolida o impacto do projeto. Calculado e estimado são somados SEPARADAMENTE.
 * Lacunas relacionadas com valor nas duas pontas são sinalizadas como possível sobreposição
 * (não são descontadas automaticamente — quem decide é o profissional).
 */
export function consolidarImpacto(lacunas) {
  const ativas = lacunas.filter((l) => l.resposta?.status !== 'nao_aplicavel');
  const itens = ativas.map((l) => ({ lacuna: l, impacto: impactoEfetivo(l) }));
  const soma = (tipo) => itens.filter((i) => i.impacto.tipo === tipo).reduce((t, i) => t + i.impacto.valor, 0);
  const comValor = new Set(itens.filter((i) => i.impacto.valor !== null).map((i) => i.lacuna.id));

  const sobreposicoes = [];
  for (const { lacuna } of itens) {
    for (const r of lacuna.relacionadas ?? []) {
      if (lacuna.id < r && comValor.has(lacuna.id) && comValor.has(r)) sobreposicoes.push([lacuna.id, r]);
    }
  }

  return {
    calculado: Math.round(soma('calculado') * 100) / 100,
    estimado: Math.round(soma('estimado') * 100) / 100,
    qtdCalculado: itens.filter((i) => i.impacto.tipo === 'calculado').length,
    qtdEstimado: itens.filter((i) => i.impacto.tipo === 'estimado').length,
    naoQuantificados: itens.filter((i) => i.impacto.tipo === 'nao_quantificado').map((i) => i.lacuna.id),
    sobreposicoes,
    itens
  };
}

export const formatarMoeda = (v) =>
  v === null || v === undefined ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
