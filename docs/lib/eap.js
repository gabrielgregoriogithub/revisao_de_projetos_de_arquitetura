// Gera uma EAP de orçamento (CSV para Excel pt-BR) a partir das lacunas respondidas.

const GRUPOS = {
  '01': 'Pisos',
  '02': 'Revestimentos de parede',
  '03': 'Forros e tetos',
  '04': 'Iluminação',
  '05': 'Pendências de projeto'
};

const GRUPO_POR_CHAVE = { piso: '01', parede: '02', altura: '02', teto: '03', instalacoes: '03' };

const GRUPO_POR_CATEGORIA = {
  piso: '01',
  revestimento: '02',
  parede: '02',
  forro: '03',
  iluminacao: '04',
  inconsistencia: '05',
  documentacao: '05'
};

const CABECALHO = ['Código EAP', 'Grupo', 'Lacuna', 'Item', 'Especificação', 'Status', 'Origem'];

/** @param {string} chave @param {string} categoria @returns {string} */
function grupoDe(chave, categoria) {
  return GRUPO_POR_CHAVE[chave] ?? GRUPO_POR_CATEGORIA[categoria] ?? '05';
}

/** Escapa uma célula CSV e neutraliza fórmulas (=, +, -, @) no Excel. */
function celula(valor) {
  let texto = String(valor ?? '');
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  return /[;"\r\n']/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
}

/**
 * @param {Array<{id:string,titulo:string,categoria:string,onde:string,
 *   campos:{chave:string,rotulo:string}[],
 *   resposta:{status:string,campos:Record<string,string>,observacao?:string}}>} lacunas
 *   lacunas já mescladas com as respostas
 * @returns {string}
 */
export function gerarEapCsv(lacunas) {
  const itens = lacunas
    .filter((l) => !['aberta', 'reaberta', 'nao_aplicavel'].includes(l.resposta?.status))
    .flatMap((l) =>
      l.campos
        .map((c) => ({ lacuna: l, campo: c, valor: (l.resposta.campos?.[c.chave] ?? '').trim() }))
        .filter((i) => i.valor !== '')
        .map((i) => ({ ...i, grupo: grupoDe(i.campo.chave, l.categoria) }))
    );

  const ordenados = [...itens].sort((a, b) => a.grupo.localeCompare(b.grupo));
  const contadores = {};
  const linhas = ordenados.map(({ lacuna, campo, valor, grupo }) => {
    contadores[grupo] = (contadores[grupo] ?? 0) + 1;
    const codigo = `${grupo}.${String(contadores[grupo]).padStart(2, '0')}`;
    return [codigo, GRUPOS[grupo], `${lacuna.id} – ${lacuna.titulo}`, campo.rotulo, valor, lacuna.resposta.status, lacuna.onde];
  });

  const corpo = [CABECALHO, ...linhas].map((cols) => cols.map(celula).join(';')).join('\r\n');
  return `﻿${corpo}\r\n`;
}
