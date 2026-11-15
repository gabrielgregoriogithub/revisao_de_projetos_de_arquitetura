// Sugestões automáticas por regras fixas (sem IA). Compartilhado com o navegador.
// Princípio: a sugestão NUNCA vira resposta sozinha — o usuário aplica ao formulário, revisa e salva;
// e a resposta ainda precisa de validação técnica com evidência. Cada sugestão traz regra, fonte e confiança.
import { chaveAmbiente } from './geometria.js';

export const REGRAS = {
  folhas: { titulo: 'Numeração de folhas repetida', tipo: 'documento' },
  consistencia: { titulo: 'Consistência com outra lacuna', tipo: 'consistencia' },
  areaMolhada: { titulo: 'Recomendação para área molhada/lavável', tipo: 'recomendacao' },
  quantidade: { titulo: 'Quantidade já levantada', tipo: 'evidencia' }
};
export const TIPOS_SUGESTAO = {
  documento: 'Correção de documento', consistencia: 'Consistência do projeto', recomendacao: 'Recomendação técnica (não é especificação)', evidencia: 'Evidência registrada'
};

const SEM_RESPOSTA = ['aberta', 'reaberta', 'pendente'];
const COM_RESPOSTA = ['respondida', 'em_validacao', 'validada'];
const MOLHADA = /banheir|\bwc\b|bwc|lavabo|sanit|copa|cozinha|amamenta|\bdml\b|vesti/i;
const NAO_MOLHADA = /^s*(hall|halls|circula|corredor|acesso|antec)/i;
const vazio = (l, chave) => !String(l.resposta?.campos?.[chave] ?? '').trim();
const pad = (n) => String(n).padStart(2, '0');

/** Regra 1 — folhas com o mesmo número: sugere renumeração sequencial. */
function regraFolhas(projeto, l) {
  if (l.categoria !== 'documentacao' || !/folha|numera/i.test(`${l.titulo} ${l.problema}`)) return null;
  const pranchas = projeto?.pranchas ?? [];
  const repetidas = [...new Set(pranchas.map((p) => p.folha).filter((f, i, a) => a.indexOf(f) !== i))];
  const campo = l.campos[0];
  if (!repetidas.length || !campo || !vazio(l, campo.chave)) return null;
  const faltando = pranchas.map((_, i) => pad(i + 1)).filter((n) => !pranchas.some((p) => p.folha === n));
  return {
    regra: 'folhas', confianca: 'alta',
    campos: { [campo.chave]: `Erro de numeração: renumerar em sequência — ${pranchas.map((p, i) => `PDF p.${p.numero} (${p.titulo}) → folha ${pad(i + 1)}`).join('; ')}.` },
    justificativa: `Folha ${repetidas.join(', ')} aparece em mais de uma prancha${faltando.length ? ` e não existe folha ${faltando.join(', ')}` : ''}. Se faltar uma prancha no conjunto, a sugestão não se aplica.`,
    fonte: 'Carimbos das pranchas (projeto.json)'
  };
}

/** Regra 2 — mesma chave de campo já respondida numa lacuna relacionada ou do mesmo ambiente. */
function regraConsistencia(lacunas, l) {
  const ambientes = new Set((l.ambientes ?? []).map(chaveAmbiente));
  return lacunas
    .filter((o) => o.id !== l.id && COM_RESPOSTA.includes(o.resposta?.status))
    .filter((o) => (l.relacionadas ?? []).includes(o.id) || (o.relacionadas ?? []).includes(l.id) || (o.ambientes ?? []).some((a) => ambientes.has(chaveAmbiente(a))))
    .map((o) => {
      const campos = Object.fromEntries(l.campos
        .filter((c) => vazio(l, c.chave) && String(o.resposta.campos?.[c.chave] ?? '').trim())
        .map((c) => [c.chave, o.resposta.campos[c.chave].trim()]));
      if (!Object.keys(campos).length) return null;
      const comum = (o.ambientes ?? []).filter((a) => ambientes.has(chaveAmbiente(a)));
      return {
        regra: 'consistencia', confianca: o.resposta.status === 'validada' ? 'alta' : 'media', campos,
        justificativa: `${o.id} (${comum.length ? `mesmo ambiente: ${comum.join(', ')}` : 'lacuna relacionada'}) já tem essa informação. Mantém o projeto coerente — confira se vale para este caso.`,
        fonte: `Resposta da ${o.id} (${o.resposta.status === 'validada' ? 'validada' : 'ainda não validada'})`
      };
    })
    .filter(Boolean);
}

/** Regra 3 — áreas molhadas/laváveis: recomendação técnica genérica, nunca especificação. */
function regraAreaMolhada(l) {
  // Cada ambiente é avaliado sozinho: "Halls dos banheiros" é hall, não área molhada.
  const ambientes = l.ambientes?.length ? l.ambientes : [l.titulo];
  if (!ambientes.some((a) => MOLHADA.test(a) && !NAO_MOLHADA.test(a))) return null;
  const bancada = (c) => /bancada/i.test(c.rotulo);
  const textos = {
    piso: 'Piso cerâmico ou porcelanato antiderrapante, adequado a área molhada',
    parede: (c) => (bancada(c) ? 'Revestimento cerâmico lavável na faixa da bancada' : 'Revestimento cerâmico lavável nas paredes da área molhada'),
    altura: 'Até o forro nas áreas de banho/bancada (confirmar exigência sanitária local)'
  };
  const campos = Object.fromEntries(l.campos
    .filter((c) => textos[c.chave] && vazio(l, c.chave))
    .map((c) => [c.chave, typeof textos[c.chave] === 'function' ? textos[c.chave](c) : textos[c.chave]]));
  if (!Object.keys(campos).length) return null;
  return {
    regra: 'areaMolhada', confianca: 'baixa', campos,
    justificativa: 'Boa prática para ambientes molhados ou que exigem limpeza frequente; regras sanitárias costumam exigir superfícies laváveis nesses locais. Não é a especificação do projeto: confirme material, modelo e altura com o arquiteto.',
    fonte: 'Regra técnica genérica do Lacunas.obra'
  };
}

/** Regra 4 — quantidade já levantada na análise (com origem registrada). */
function regraQuantidade(l) {
  const q = l.impactoFinanceiro?.quantidade;
  if (q === null || q === undefined || !l.campos.some((c) => c.chave === 'quantidade') || !vazio(l, 'quantidade')) return null;
  return {
    regra: 'quantidade', confianca: 'alta',
    campos: { quantidade: `${q}${l.impactoFinanceiro.unidade ? ` ${l.impactoFinanceiro.unidade}` : ''}` },
    justificativa: 'A quantidade já foi levantada na análise das pranchas.',
    fonte: l.impactoFinanceiro.origemQuantidade ?? 'Impacto financeiro da lacuna'
  };
}

/**
 * Sugestões por lacuna (só para lacunas ainda sem resposta; só para campos vazios).
 * @param {object} projeto
 * @param {object[]} lacunas normalizadas e mescladas com a resposta
 * @returns {Record<string, object[]>} id da lacuna → sugestões ordenadas por confiança
 */
export function sugerirRespostas(projeto, lacunas) {
  const ordem = { alta: 0, media: 1, baixa: 2 };
  const resultado = {};
  for (const l of lacunas) {
    if (!SEM_RESPOSTA.includes(l.resposta?.status ?? 'aberta')) continue;
    const lista = [regraFolhas(projeto, l), ...regraConsistencia(lacunas, l), regraAreaMolhada(l), regraQuantidade(l)]
      .filter(Boolean)
      .map((s) => ({ ...s, titulo: REGRAS[s.regra].titulo, tipo: REGRAS[s.regra].tipo }))
      .sort((a, b) => ordem[a.confianca] - ordem[b.confianca]);
    if (lista.length) resultado[l.id] = lista;
  }
  return resultado;
}
