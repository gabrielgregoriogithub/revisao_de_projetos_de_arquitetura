// Workflow de status das lacunas (compartilhado entre servidor e navegador).

/** @typedef {'aberta'|'pendente'|'respondida'|'em_validacao'|'validada'|'reaberta'|'nao_aplicavel'} Status */

export const STATUS = ['aberta', 'pendente', 'respondida', 'em_validacao', 'validada', 'reaberta', 'nao_aplicavel'];

export const STATUS_INFO = {
  aberta: { rotulo: 'Aberta', tom: 'vermelho', descricao: 'Falta informação; ainda sem resposta.' },
  reaberta: { rotulo: 'Reaberta', tom: 'vermelho', descricao: 'Resposta insuficiente ou contraditória; voltou a ficar aberta.' },
  pendente: { rotulo: 'Pendente de terceiros', tom: 'amarelo', descricao: 'Aguardando arquiteto, condomínio ou fornecedor.' },
  em_validacao: { rotulo: 'Em validação técnica', tom: 'amarelo', descricao: 'Resposta completa aguardando validação de um profissional.' },
  respondida: { rotulo: 'Respondida', tom: 'verde', descricao: 'Respondida, mas ainda não validada tecnicamente.' },
  validada: { rotulo: 'Validada', tom: 'verde-escuro', descricao: 'Informação tecnicamente confirmada, com evidência.' },
  nao_aplicavel: { rotulo: 'Não aplicável', tom: 'cinza', descricao: 'Arquivada com justificativa.' }
};

/** Transições permitidas. Salvar no mesmo status só é permitido nos estados editáveis. */
const TRANSICOES = {
  aberta: ['aberta', 'pendente', 'respondida', 'nao_aplicavel'],
  reaberta: ['reaberta', 'pendente', 'respondida', 'nao_aplicavel'],
  pendente: ['pendente', 'respondida', 'aberta', 'nao_aplicavel'],
  respondida: ['respondida', 'em_validacao', 'reaberta', 'pendente'],
  em_validacao: ['validada', 'reaberta'],
  validada: ['reaberta'],
  nao_aplicavel: ['reaberta']
};

/** Estados que contam como "resolvidos" no percentual de resolução. */
export const RESOLVIDOS = ['validada', 'nao_aplicavel'];
/** Estados que já têm resposta registrada (validada ou não). */
export const COM_RESPOSTA = ['respondida', 'em_validacao', 'validada'];
/** Estados que exigem ação de alguém. */
export const ABERTOS = ['aberta', 'reaberta'];

/** @param {Status} de @param {Status} para */
export function transicaoPermitida(de, para) {
  return (TRANSICOES[de] ?? []).includes(para);
}

/** @param {Status} de @returns {Status[]} */
export function proximosStatus(de) {
  return (TRANSICOES[de] ?? []).filter((s) => s !== de);
}

/** Ordem de criticidade para ordenação (menor = mais urgente). */
export const ORDEM_STATUS = { reaberta: 0, aberta: 1, pendente: 2, respondida: 3, em_validacao: 4, validada: 5, nao_aplicavel: 6 };
export const ORDEM_PRIORIDADE = { alta: 0, media: 1, baixa: 2 };

/** Pontuação de criticidade: prioridade pesa mais, status desempata. */
export function criticidade(lacuna) {
  const p = ORDEM_PRIORIDADE[lacuna.prioridade] ?? 3;
  const s = ORDEM_STATUS[lacuna.resposta?.status ?? 'aberta'] ?? 9;
  return p * 10 + s;
}
