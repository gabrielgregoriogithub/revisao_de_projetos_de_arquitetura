import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transicaoPermitida, proximosStatus, criticidade } from '../lib/dominio/status.js';
import { normalizarLacuna, verificarIntegridade } from '../lib/dominio/lacunas.js';
import { impactoEfetivo, consolidarImpacto } from '../lib/dominio/impacto.js';
import { calcularIndicadores, gerarAlertas, serieEvolucao } from '../lib/dominio/indicadores.js';
import { processarRespostas, avaliarCompletude } from '../lib/dominio/processamento.js';

const projeto = { analisadoEm: '2026-11-15', referencia: { largura: 100, altura: 100 }, pranchas: [{ numero: 1 }, { numero: 2 }] };
const lac = (id, extra = {}, resposta = {}) => ({
  ...normalizarLacuna({
    id, titulo: id, categoria: 'piso', prioridade: 'alta', problema: 'p', pergunta: 'q',
    campos: [{ chave: 'piso', rotulo: 'Piso' }, { chave: 'formato', rotulo: 'Formato' }],
    marcadores: [{ prancha: 1, x: 1, y: 1, w: 5, h: 5 }], ...extra
  }, projeto),
  resposta: { status: 'aberta', campos: {}, ...resposta }
});

test('workflow: validada só sai para reaberta; em validação não volta para respondida', () => {
  assert.equal(transicaoPermitida('aberta', 'respondida'), true);
  assert.equal(transicaoPermitida('aberta', 'validada'), false);
  assert.equal(transicaoPermitida('respondida', 'validada'), true, 'validação direta, só com a nota');
  assert.equal(transicaoPermitida('em_validacao', 'validada'), true);
  assert.equal(transicaoPermitida('em_validacao', 'respondida'), false);
  assert.deepEqual(proximosStatus('validada'), ['reaberta']);
});

test('criticidade ordena alta+reaberta antes de baixa+aberta', () => {
  assert.ok(criticidade(lac('A', {}, { status: 'reaberta' })) < criticidade(lac('B', { prioridade: 'baixa' })));
});

test('normalizarLacuna preenche padrões v2 sem mutar e deriva pranchas', () => {
  const orig = { id: 'X', categoria: 'iluminacao', campos: [], marcadores: [{ prancha: 3 }, { prancha: 1 }, { prancha: 3 }] };
  const n = normalizarLacuna(orig, projeto);
  assert.deepEqual(n.pranchas, [1, 3]);
  assert.deepEqual(n.disciplinas, ['iluminacao', 'eletrica']);
  assert.equal(n.impactoFinanceiro.tipo, 'nao_quantificado');
  assert.equal(n.identificadaEm, '2026-11-15');
  assert.equal(orig.pranchas, undefined);
});

test('integridade detecta ID duplicado, prancha inexistente, marcador fora e relacionada inexistente', () => {
  const base = { titulo: 't', categoria: 'piso', problema: 'p', pergunta: 'q', campos: [{ chave: 'a' }] };
  const problemas = verificarIntegridade(projeto, [
    { ...base, id: 'L1', marcadores: [{ prancha: 9, x: 1, y: 1, w: 1, h: 1 }], relacionadas: ['L9'] },
    { ...base, id: 'L1', marcadores: [{ prancha: 1, x: 95, y: 1, w: 10, h: 1 }] }
  ]);
  const msgs = problemas.map((p) => p.mensagem).join(' | ');
  assert.match(msgs, /duplicado/);
  assert.match(msgs, /prancha inexistente/);
  assert.match(msgs, /fora dos limites/);
  assert.match(msgs, /Relacionada inexistente/);
});

test('impacto: calculado exige quantidade e custo; estimado exige justificativa', () => {
  assert.equal(impactoEfetivo(lac('A', { impactoFinanceiro: { quantidade: 10, custoUnitario: 12.5 } })).valor, 125);
  assert.equal(impactoEfetivo(lac('A', { impactoFinanceiro: { quantidade: 10 } })).tipo, 'nao_quantificado');
  assert.equal(impactoEfetivo(lac('A', { impactoFinanceiro: { valorEstimado: 500 } })).tipo, 'nao_quantificado');
  assert.equal(impactoEfetivo(lac('A', { impactoFinanceiro: { valorEstimado: 500, justificativa: 'cotação' } })).tipo, 'estimado');
});

test('consolidação não soma calculado com estimado e sinaliza sobreposição de relacionadas', () => {
  const c = consolidarImpacto([
    lac('A', { relacionadas: ['B'], impactoFinanceiro: { quantidade: 2, custoUnitario: 10 } }),
    lac('B', { relacionadas: ['A'], impactoFinanceiro: { valorEstimado: 100, justificativa: 'x' } }),
    lac('C'),
    lac('D', { impactoFinanceiro: { quantidade: 1, custoUnitario: 1 } }, { status: 'nao_aplicavel' })
  ]);
  assert.equal(c.calculado, 20);
  assert.equal(c.estimado, 100);
  assert.deepEqual(c.naoQuantificados, ['C']);
  assert.deepEqual(c.sobreposicoes, [['A', 'B']]);
});

test('indicadores contam por status e calculam resolução só com validadas/n.a.', () => {
  const ls = [lac('A', {}, { status: 'validada' }), lac('B', {}, { status: 'respondida' }), lac('C'), lac('D', {}, { status: 'nao_aplicavel' })];
  const i = calcularIndicadores(projeto, ls);
  assert.equal(i.total, 4);
  assert.equal(i.abertas, 1);
  assert.equal(i.percentualResolucao, 50);
  assert.equal(i.percentualRespondidas, 75);
  assert.equal(i.altaPrioridadeAbertas, 2);
});

test('alertas só aparecem quando há lacunas que os justificam', () => {
  const alertas = gerarAlertas([lac('A'), lac('B', { categoria: 'documentacao' }, { status: 'validada' })]);
  const tipos = alertas.map((a) => a.tipo);
  assert.ok(tipos.includes('material'));
  assert.ok(!tipos.includes('documental'));
});

test('série de evolução reconstrói o estado por dia a partir dos eventos', () => {
  const serie = serieEvolucao([
    { lacuna: 'A', em: '2026-11-15T10:00:00Z', de: { status: 'aberta' }, para: { status: 'respondida' } },
    { lacuna: 'A', em: '2026-11-16T10:00:00Z', de: { status: 'em_validacao' }, para: { status: 'validada' } },
    { lacuna: 'B', em: '2026-11-16T11:00:00Z', de: { status: 'aberta' }, para: { status: 'pendente' } }
  ], 2);
  assert.deepEqual(serie.map((p) => [p.dia, p.comResposta, p.resolvidas]), [['2026-11-15', 1, 0], ['2026-11-16', 1, 1]]);
});

test('processamento: completa → em validação; vazia ou vaga → reaberta; nunca valida', () => {
  const r = processarRespostas([
    lac('A', {}, { status: 'respondida', campos: { piso: 'Porcelanato', formato: '60x60' } }),
    lac('B', {}, { status: 'respondida', campos: { piso: 'Vinílico', formato: '' } }),
    lac('C', {}, { status: 'respondida', campos: { piso: 'a definir', formato: 'régua' } })
  ]);
  assert.deepEqual(r.acoes.map((a) => [a.lacuna, a.para]), [['A', 'em_validacao'], ['B', 'reaberta'], ['C', 'reaberta']]);
  assert.match(r.acoes[2].motivo, /vagas: Piso/);
  assert.ok(r.acoes.every((a) => a.para !== 'validada'));
  assert.deepEqual(avaliarCompletude(lac('D')).vazios, ['Piso', 'Formato']);
});

test('processamento detecta contradição no mesmo ambiente e mesmo campo', () => {
  const r = processarRespostas([
    lac('A', { ambientes: ['Copa'] }, { status: 'respondida', campos: { piso: 'Porcelanato', formato: '60x60' } }),
    lac('B', { ambientes: ['Copa', 'Hall'] }, { status: 'validada', campos: { piso: 'Vinílico', formato: '60x60' } }),
    lac('C', { ambientes: ['Hall'] }, { status: 'respondida', campos: { piso: 'Granito', formato: '' } })
  ]);
  assert.equal(r.contradicoes.length, 2);
  assert.deepEqual(r.contradicoes[0].lacunas, ['A', 'B']);
  assert.equal(r.contradicoes[0].campo, 'piso');
});
