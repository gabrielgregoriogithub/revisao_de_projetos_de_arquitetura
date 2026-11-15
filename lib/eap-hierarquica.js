// EAP hierárquica: Projeto › Disciplina › Ambiente › Grupo de serviço › Serviço.
// Só entra o que foi respondido. Quantidade e custo só aparecem quando informados — nunca são inventados.
import { impactoEfetivo } from './dominio/impacto.js';
import { DISCIPLINAS } from './dominio/lacunas.js';
import { STATUS_INFO } from './dominio/status.js';
import { chaveAmbiente } from './dominio/geometria.js';

const GRUPOS = {
  pisos: 'Pisos',
  revestimentos: 'Revestimentos de parede',
  forros: 'Forros e tetos',
  iluminacao: 'Iluminação',
  instalacoes: 'Instalações',
  pendencias: 'Pendências de projeto'
};
const GRUPO_POR_CHAVE = { piso: 'pisos', parede: 'revestimentos', altura: 'revestimentos', teto: 'forros', instalacoes: 'forros', modelo: 'iluminacao', quantidade: 'iluminacao' };
const GRUPO_POR_CATEGORIA = { piso: 'pisos', revestimento: 'revestimentos', parede: 'revestimentos', forro: 'forros', iluminacao: 'iluminacao', inconsistencia: 'pendencias', documentacao: 'pendencias' };
/** Disciplina de orçamento de cada grupo (a EAP agrupa por quem executa). */
const DISCIPLINA_DO_GRUPO = { pisos: 'arquitetura', revestimentos: 'arquitetura', forros: 'arquitetura', iluminacao: 'iluminacao', instalacoes: 'eletrica', pendencias: 'arquitetura' };

export const STATUS_PADRAO_EAP = ['validada', 'em_validacao', 'respondida'];

export const COLUNAS_EAP = [
  ['codigo', 'Código EAP'], ['nivel', 'Nível'], ['descricao', 'Descrição'], ['disciplina', 'Disciplina'],
  ['ambiente', 'Ambiente'], ['grupo', 'Grupo de serviço'], ['unidade', 'Unidade'], ['quantidade', 'Quantidade'],
  ['custoUnitario', 'Custo unitário (R$)'], ['custoTotal', 'Custo total (R$)'], ['origem', 'Origem'],
  ['prancha', 'Prancha de referência'], ['statusEspecificacao', 'Status da especificação'], ['observacoes', 'Observações']
];

const pad = (n) => String(n).padStart(2, '0');

const numeroEm = (t) => {
  const m = String(t ?? '').replace(',', '.').match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
};

/**
 * Quantidade derivada da geometria medida (quadro de ambientes). Só quando há medida real:
 * pisos/forros = área; revestimento de parede = perímetro × altura numérica informada na resposta.
 */
function quantidadeMedida(linha, ambientesPorChave) {
  const amb = ambientesPorChave.get(chaveAmbiente(linha.ambiente));
  if (!amb?.medida?.area) return null;
  const fonte = `área medida no quadro (${amb.id})`;
  if (['pisos', 'forros'].includes(linha.grupo) && ['piso', 'teto', 'produto', 'formato'].includes(linha.campo.chave)) {
    return { quantidade: amb.medida.area, unidade: 'm²', fonte };
  }
  if (linha.grupo === 'revestimentos' && linha.campo.chave === 'parede') {
    const altura = numeroEm(linha.lacuna.resposta.campos?.altura);
    if (altura && altura < 20) {
      return { quantidade: Math.round(amb.medida.perimetro * altura * 100) / 100, unidade: 'm²', fonte: `perímetro medido (${amb.id}) × altura ${altura} m, sem desconto de vãos` };
    }
  }
  return null;
}

/** Linhas de serviço (folhas da árvore), antes da numeração. */
function servicosDe(lacunas, incluir) {
  return lacunas
    .filter((l) => incluir.includes(l.resposta?.status))
    .flatMap((l) => {
      const preenchidos = l.campos.filter((c) => (l.resposta.campos?.[c.chave] ?? '').trim());
      const ambientes = l.ambientes?.length ? l.ambientes : ['Geral'];
      const linhas = preenchidos.flatMap((c) => ambientes.map((ambiente) => {
        const grupo = GRUPO_POR_CHAVE[c.chave] ?? GRUPO_POR_CATEGORIA[l.categoria] ?? 'pendencias';
        return { lacuna: l, campo: c, ambiente, grupo, disciplina: DISCIPLINA_DO_GRUPO[grupo], valor: l.resposta.campos[c.chave].trim() };
      }));
      // Quantitativo/custo só vai para a linha quando a lacuna gera exatamente um serviço.
      const imp = impactoEfetivo(l);
      return linhas.map((linha) => ({ ...linha, impacto: linhas.length === 1 ? imp : null, multiplas: linhas.length > 1 && imp.quantidade !== null }));
    });
}

/**
 * Monta a árvore numerada (lista plana com nível), na ordem disciplina › ambiente › grupo › serviço.
 * @param {object[]} lacunas mescladas com respostas
 * @param {{incluir?:string[]}} [opcoes]
 */
export function montarEap(projeto, lacunas, { incluir = STATUS_PADRAO_EAP, ambientes = [] } = {}) {
  const ambientesPorChave = new Map(ambientes.map((a) => [chaveAmbiente(a.nome), a]));
  const servicos = servicosDe(lacunas, incluir).map((s) => ({ ...s, medida: quantidadeMedida(s, ambientesPorChave) }));
  const ordemDisc = Object.keys(DISCIPLINAS);
  const ordemGrupo = Object.keys(GRUPOS);
  const ordenados = [...servicos].sort((a, b) =>
    ordemDisc.indexOf(a.disciplina) - ordemDisc.indexOf(b.disciplina) ||
    a.ambiente.localeCompare(b.ambiente, 'pt-BR') ||
    ordemGrupo.indexOf(a.grupo) - ordemGrupo.indexOf(b.grupo) ||
    a.lacuna.id.localeCompare(b.lacuna.id));

  const linhas = [{ codigo: '0', nivel: 1, descricao: projeto?.nome ?? 'Projeto', tipo: 'projeto' }];
  const cont = { d: 0, a: 0, g: 0, s: 0 };
  let atual = { d: null, a: null, g: null };

  for (const s of ordenados) {
    if (s.disciplina !== atual.d) {
      cont.d += 1; cont.a = 0; atual = { d: s.disciplina, a: null, g: null };
      linhas.push({ codigo: pad(cont.d), nivel: 2, descricao: DISCIPLINAS[s.disciplina], tipo: 'disciplina', disciplina: DISCIPLINAS[s.disciplina] });
    }
    if (s.ambiente !== atual.a) {
      cont.a += 1; cont.g = 0; atual = { ...atual, a: s.ambiente, g: null };
      linhas.push({ codigo: `${pad(cont.d)}.${pad(cont.a)}`, nivel: 3, descricao: s.ambiente, tipo: 'ambiente', disciplina: DISCIPLINAS[s.disciplina], ambiente: s.ambiente });
    }
    if (s.grupo !== atual.g) {
      cont.g += 1; cont.s = 0; atual = { ...atual, g: s.grupo };
      linhas.push({ codigo: `${pad(cont.d)}.${pad(cont.a)}.${pad(cont.g)}`, nivel: 4, descricao: GRUPOS[s.grupo], tipo: 'grupo', disciplina: DISCIPLINAS[s.disciplina], ambiente: s.ambiente, grupo: GRUPOS[s.grupo] });
    }
    cont.s += 1;
    const imp = s.impacto;
    const med = s.medida;
    const quantidade = med?.quantidade ?? imp?.quantidade ?? null;
    const custoUnitario = imp?.custoUnitario ?? null;
    const custoTotal = med && custoUnitario !== null ? Math.round(quantidade * custoUnitario * 100) / 100 : (imp?.tipo === 'calculado' ? imp.valor : null);
    const obs = [
      med ? `Quantidade: ${med.fonte}.` : null,
      s.multiplas && !med ? `Quantitativo da ${s.lacuna.id} não distribuído entre os serviços.` : null,
      imp?.tipo === 'estimado' ? `Valor global estimado da lacuna: R$ ${imp.valor} (${imp.justificativa}).` : null,
      s.lacuna.resposta.status !== 'validada' ? 'Especificação ainda não validada tecnicamente.' : null
    ].filter(Boolean).join(' ');
    linhas.push({
      codigo: `${pad(cont.d)}.${pad(cont.a)}.${pad(cont.g)}.${pad(cont.s)}`,
      nivel: 5,
      tipo: 'servico',
      descricao: `${s.campo.rotulo}: ${s.valor}`,
      disciplina: DISCIPLINAS[s.disciplina],
      ambiente: s.ambiente,
      grupo: GRUPOS[s.grupo],
      unidade: med?.unidade ?? imp?.unidade ?? null,
      quantidade,
      custoUnitario,
      custoTotal,
      origem: `${s.lacuna.id} – resposta${s.lacuna.resposta.responsavel ? ` de ${s.lacuna.resposta.responsavel}` : ''}`,
      prancha: (s.lacuna.pranchas ?? []).map((p) => `PDF p.${p}`).join(', '),
      statusEspecificacao: STATUS_INFO[s.lacuna.resposta.status]?.rotulo ?? s.lacuna.resposta.status,
      observacoes: obs
    });
  }
  return linhas;
}

/** Escapa uma célula CSV (pt-BR, separador ;) e neutraliza fórmulas no Excel. */
export function celulaCsv(valor) {
  let t = valor === null || valor === undefined ? '' : (typeof valor === 'number' ? String(valor).replace('.', ',') : String(valor));
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return /[;"\r\n']/.test(t) ? `"${t.replaceAll('"', '""')}"` : t;
}

/** @param {string[]} [colunas] chaves de COLUNAS_EAP a incluir (padrão: todas) */
export function eapParaCsv(linhas, colunas = COLUNAS_EAP.map(([k]) => k)) {
  const cols = COLUNAS_EAP.filter(([k]) => colunas.includes(k));
  const corpo = [cols.map(([, r]) => r), ...linhas.map((l) => cols.map(([k]) => l[k]))]
    .map((row) => row.map(celulaCsv).join(';')).join('\r\n');
  return `﻿${corpo}\r\n`;
}
