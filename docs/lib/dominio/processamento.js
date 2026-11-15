// Parte determinística do protocolo "processe as respostas das lacunas".
// Checagens objetivas (completude, termos vagos, contradições diretas). A leitura técnica
// e semântica das respostas continua sendo feita pelo Claude Code, que revisa este relatório.

const TERMOS_VAGOS = /^(a definir|definir|tbd|\?+|n[ãa]o sei|verificar|ver depois|depois|pendente|confirmar|x+|-+|\.+)$/i;

const normalizar = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Avalia uma resposta: campos vazios e campos com termos vagos. */
export function avaliarCompletude(lacuna) {
  const campos = lacuna.resposta?.campos ?? {};
  const vazios = lacuna.campos.filter((c) => !(campos[c.chave] ?? '').trim()).map((c) => c.rotulo);
  const vagos = lacuna.campos.filter((c) => TERMOS_VAGOS.test((campos[c.chave] ?? '').trim())).map((c) => c.rotulo);
  return { completa: vazios.length === 0 && vagos.length === 0, vazios, vagos };
}

/** Contradições: mesma chave de campo, ambiente em comum, valores diferentes. */
export function encontrarContradicoes(lacunas) {
  const respondidas = lacunas.filter((l) => ['respondida', 'em_validacao', 'validada'].includes(l.resposta?.status));
  const achados = [];
  for (let i = 0; i < respondidas.length; i++) {
    for (let j = i + 1; j < respondidas.length; j++) {
      const a = respondidas[i];
      const b = respondidas[j];
      const ambientes = (a.ambientes ?? []).filter((x) => (b.ambientes ?? []).includes(x));
      if (!ambientes.length) continue;
      for (const campo of a.campos) {
        if (!b.campos.some((c) => c.chave === campo.chave)) continue;
        const va = normalizar(a.resposta.campos?.[campo.chave]);
        const vb = normalizar(b.resposta.campos?.[campo.chave]);
        if (va && vb && va !== vb) {
          achados.push({ lacunas: [a.id, b.id], campo: campo.chave, ambientes, valores: [va, vb] });
        }
      }
    }
  }
  return achados;
}

/**
 * Propõe ações para as lacunas com status "respondida".
 * - completa → em_validacao (nunca "validada": validar exige evidência e um profissional)
 * - incompleta ou vaga → reaberta, com o motivo
 * Contradições não mudam status sozinhas: viram alerta para o Claude/profissional decidir.
 */
export function processarRespostas(lacunas) {
  const acoes = [];
  for (const l of lacunas.filter((x) => x.resposta?.status === 'respondida')) {
    const { completa, vazios, vagos } = avaliarCompletude(l);
    if (completa) {
      acoes.push({ lacuna: l.id, de: 'respondida', para: 'em_validacao', motivo: 'Resposta completa; encaminhada para validação técnica.' });
    } else {
      const partes = [vazios.length && `campos vazios: ${vazios.join(', ')}`, vagos.length && `respostas vagas: ${vagos.join(', ')}`].filter(Boolean);
      acoes.push({ lacuna: l.id, de: 'respondida', para: 'reaberta', motivo: `Resposta incompleta (${partes.join('; ')}).` });
    }
  }
  const contradicoes = encontrarContradicoes(lacunas);
  return {
    acoes,
    contradicoes,
    resumo: {
      analisadas: acoes.length,
      paraValidacao: acoes.filter((a) => a.para === 'em_validacao').length,
      reabertas: acoes.filter((a) => a.para === 'reaberta').length,
      contradicoes: contradicoes.length
    }
  };
}
