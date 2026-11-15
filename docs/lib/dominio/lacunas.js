// Normalização e verificação de integridade das definições de lacunas (lacunas.json).

export const CATEGORIAS = {
  piso: 'Piso',
  parede: 'Parede',
  revestimento: 'Revestimento',
  forro: 'Forro / teto',
  iluminacao: 'Iluminação',
  inconsistencia: 'Inconsistência entre pranchas',
  documentacao: 'Documentação'
};

export const DISCIPLINAS = {
  arquitetura: 'Arquitetura',
  estrutura: 'Estrutura',
  eletrica: 'Elétrica',
  hidraulica: 'Hidráulica',
  hvac: 'HVAC',
  incendio: 'Incêndio',
  iluminacao: 'Iluminação',
  forros: 'Forros',
  revestimentos: 'Revestimentos'
};

const DISCIPLINA_POR_CATEGORIA = {
  piso: ['arquitetura', 'revestimentos'],
  parede: ['arquitetura'],
  revestimento: ['arquitetura', 'revestimentos'],
  forro: ['arquitetura', 'forros'],
  iluminacao: ['iluminacao', 'eletrica'],
  inconsistencia: ['arquitetura'],
  documentacao: ['arquitetura']
};

/** Campo universal: toda lacuna tem a escolha "Existente mantido / novo" (opcional para a completude). */
export const CAMPO_SITUACAO = Object.freeze({ chave: 'situacao', rotulo: 'Existente mantido / novo', opcoes: Object.freeze(['Existente mantido', 'Novo']), opcional: true });

/** Campos de resposta de uma lacuna, sempre com o campo de situação (padronizado e sem duplicar). */
export function camposDaLacuna(lacuna) {
  const outros = (lacuna?.campos ?? []).filter((c) => c.chave !== CAMPO_SITUACAO.chave);
  return [...outros, { ...CAMPO_SITUACAO, opcoes: [...CAMPO_SITUACAO.opcoes] }];
}

export const IMPACTO_VAZIO = Object.freeze({
  tipo: 'nao_quantificado', servico: null, material: null, unidade: null, quantidade: null,
  origemQuantidade: null, custoUnitario: null, valorEstimado: null, incerteza: 'alta', justificativa: null
});

/**
 * Preenche campos opcionais (formato v1 → v2) sem mutar a entrada.
 * @param {object} lacuna definição vinda do lacunas.json
 * @param {{analisadoEm?:string}} projeto
 */
export function normalizarLacuna(lacuna, projeto = {}) {
  const pranchas = [...new Set((lacuna.marcadores ?? []).map((m) => m.prancha))].sort((a, b) => a - b);
  return {
    ...lacuna,
    marcadores: lacuna.marcadores ?? [],
    campos: camposDaLacuna(lacuna),
    ambientes: lacuna.ambientes ?? [],
    disciplinas: lacuna.disciplinas ?? DISCIPLINA_POR_CATEGORIA[lacuna.categoria] ?? ['arquitetura'],
    relacionadas: lacuna.relacionadas ?? [],
    identificadaEm: lacuna.identificadaEm ?? projeto.analisadoEm ?? null,
    origem: lacuna.origem ?? 'Análise Claude Code',
    pranchas,
    impactoFinanceiro: { ...IMPACTO_VAZIO, ...(lacuna.impactoFinanceiro ?? {}) }
  };
}

/**
 * Classifica a precisão de cada marcador usando a camada de texto do PDF:
 * "ancorado" quando contém palavra extraída do PDF (posição exata), senão "estimado" (posição lida visualmente).
 * @param {object} lacuna normalizada
 * @param {{pranchas: Record<string, {texto:string,x:number,y:number,w:number,h:number}[]>}|null} textoPdf
 */
export function anotarPrecisao(lacuna, textoPdf) {
  if (!textoPdf?.pranchas) return lacuna;
  return {
    ...lacuna,
    marcadores: lacuna.marcadores.map((m) => {
      const ancoras = (textoPdf.pranchas[m.prancha] ?? []).filter((w) => {
        const cx = w.x + w.w / 2;
        const cy = w.y + w.h / 2;
        return cx >= m.x && cx <= m.x + m.w && cy >= m.y && cy <= m.y + m.h && w.texto.trim().length > 0 && w.texto !== '˚';
      });
      return { ...m, precisao: ancoras.length ? 'ancorado' : 'estimado', ancoras: ancoras.slice(0, 5).map((w) => w.texto) };
    })
  };
}

const ID_VALIDO = /^[A-Za-z0-9_-]{1,20}$/;

/**
 * Verifica a integridade das definições. Não lança: devolve a lista de problemas.
 * @returns {{nivel:'erro'|'aviso', lacuna:string|null, mensagem:string}[]}
 */
export function verificarIntegridade(projeto, lacunas) {
  const problemas = [];
  const add = (nivel, lacuna, mensagem) => problemas.push({ nivel, lacuna, mensagem });
  const numeros = new Set((projeto?.pranchas ?? []).map((p) => p.numero));
  const ref = projeto?.referencia ?? { largura: Infinity, altura: Infinity };
  const ids = new Set();

  if (!Array.isArray(lacunas)) return [{ nivel: 'erro', lacuna: null, mensagem: 'lacunas.json não é uma lista.' }];

  for (const l of lacunas) {
    const id = l?.id ?? null;
    if (!id || !ID_VALIDO.test(id)) { add('erro', id, 'ID ausente ou inválido.'); continue; }
    if (ids.has(id)) add('erro', id, 'ID duplicado.');
    ids.add(id);
    for (const campo of ['titulo', 'categoria', 'problema', 'pergunta']) {
      if (!l[campo]) add('erro', id, `Campo obrigatório ausente: ${campo}.`);
    }
    if (l.categoria && !CATEGORIAS[l.categoria]) add('aviso', id, `Categoria desconhecida: ${l.categoria}.`);
    if (!Array.isArray(l.campos) || !l.campos.length) add('aviso', id, 'Sem campos de resposta.');
    const chaves = (l.campos ?? []).map((c) => c.chave);
    if (new Set(chaves).size !== chaves.length) add('erro', id, 'Chaves de campo repetidas.');
    (l.campos ?? []).filter((c) => c.opcoes !== undefined && (!Array.isArray(c.opcoes) || !c.opcoes.length || !c.opcoes.every((o) => typeof o === 'string' && o.trim())))
      .forEach((c) => add('erro', id, `Campo ${c.chave}: opções inválidas (lista de textos não vazia).`));
    if (!l.marcadores?.length) add('aviso', id, 'Sem marcador na prancha.');
    (l.marcadores ?? []).forEach((m, i) => {
      if (!numeros.has(m.prancha)) add('erro', id, `Marcador #${i + 1} aponta para prancha inexistente (${m.prancha}).`);
      const dentro = [m.x, m.y, m.w, m.h].every(Number.isFinite) && m.w > 0 && m.h > 0 &&
        m.x >= 0 && m.y >= 0 && m.x + m.w <= ref.largura && m.y + m.h <= ref.altura;
      if (!dentro) add('erro', id, `Marcador #${i + 1} fora dos limites da prancha.`);
    });
    (l.disciplinas ?? []).forEach((d) => { if (!DISCIPLINAS[d]) add('aviso', id, `Disciplina desconhecida: ${d}.`); });
  }
  for (const l of lacunas) {
    (l.relacionadas ?? []).forEach((r) => { if (!ids.has(r)) add('aviso', l.id, `Relacionada inexistente: ${r}.`); });
  }
  return problemas;
}
