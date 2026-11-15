import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { criarStore, validarResposta } from '../lib/store.js';

const LACUNA = { id: 'L01', titulo: 'B', categoria: 'piso', problema: 'p', pergunta: 'q', campos: [{ chave: 'piso', rotulo: 'Piso' }], marcadores: [] };

async function novoDir({ respostas } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'lacunas-v2-'));
  await writeFile(path.join(dir, 'projeto.json'), JSON.stringify({ nome: 'X', pranchas: [], referencia: { largura: 10, altura: 10 } }));
  await writeFile(path.join(dir, 'lacunas.json'), JSON.stringify([LACUNA, { ...LACUNA, id: 'L02' }]));
  if (respostas) await writeFile(path.join(dir, 'respostas.json'), JSON.stringify(respostas));
  return dir;
}
const lerJson = async (dir, nome) => JSON.parse(await readFile(path.join(dir, nome), 'utf8'));
const EVID = [{ tipo: 'email', descricao: 'E-mail da arquiteta de 16/11', referencia: 'RE: Lacunas' }];

test('migra respostas v1 com backup e adiciona revisão', async () => {
  const dir = await novoDir({ respostas: { L01: { status: 'respondida', campos: { piso: 'x' }, observacao: '' } } });
  await criarStore(dir).carregar();
  assert.equal((await lerJson(dir, 'esquema.json')).versao, 2);
  assert.equal((await lerJson(dir, 'respostas.json')).L01.revisao, 1);
  const backups = await readdir(path.join(dir, 'backups'));
  assert.equal(backups.length, 1);
  assert.match(backups[0], /^respostas-/);
});

test('fluxo completo: responder → validação → validada (só a nota é obrigatória) → reaberta, com histórico', async () => {
  const dir = await novoDir();
  const s = criarStore(dir);
  assert.equal((await s.salvarResposta('L01', { status: 'respondida', campos: { piso: 'Porcelanato' } }, { autor: 'Ana' })).ok, true);
  assert.equal((await s.salvarResposta('L01', { status: 'em_validacao', campos: { piso: 'Porcelanato' } })).ok, true);

  const semNota = await s.salvarResposta('L01', { status: 'validada', campos: { piso: 'Porcelanato' }, evidencias: EVID });
  assert.equal(semNota.ok, false);
  assert.match(semNota.erro, /nota de validação/);

  // Evidência é opcional: só a nota basta.
  const v = await s.salvarResposta('L01', { status: 'validada', campos: { piso: 'Porcelanato' }, notaValidacao: 'Conferido com a prancha 03' });
  assert.equal(v.ok, true);
  assert.ok(v.resposta.validadaEm);
  const r = await s.salvarResposta('L01', { status: 'reaberta', campos: { piso: 'Porcelanato' }, observacao: 'Mudou' });
  assert.equal(r.resposta.validadaEm, null);

  const eventos = await s.historico('L01');
  assert.deepEqual(eventos.map((e) => e.para.status), ['respondida', 'em_validacao', 'validada', 'reaberta']);
  assert.equal(eventos[0].autor, 'Ana');
  assert.deepEqual(eventos[0].alteracoes.find((a) => a.campo === 'campos.piso'), { campo: 'campos.piso', antes: null, depois: 'Porcelanato' });
  assert.equal(eventos.at(-1).revisao, 4);
});

test('bloqueia transição inválida (aberta → validada) com 409', async () => {
  const r = await criarStore(await novoDir()).salvarResposta('L01', { status: 'validada', campos: { piso: 'x' }, notaValidacao: 'n', evidencias: EVID });
  assert.equal(r.ok, false);
  assert.equal(r.codigo, 409);
  assert.match(r.erro, /Transição não permitida/);
});

test('controle de concorrência: revisão esperada diferente devolve 409', async () => {
  const s = criarStore(await novoDir());
  await s.salvarResposta('L01', { status: 'pendente', campos: {}, revisaoEsperada: 0 });
  const conflito = await s.salvarResposta('L01', { status: 'pendente', campos: {}, revisaoEsperada: 0 });
  assert.equal(conflito.codigo, 409);
  assert.match(conflito.erro, /alterada em outro lugar/);
});

test('gravações simultâneas não se perdem', async () => {
  const dir = await novoDir();
  const s = criarStore(dir);
  await Promise.all([
    s.salvarResposta('L01', { status: 'pendente', campos: { piso: 'a' } }),
    s.salvarResposta('L02', { status: 'pendente', campos: { piso: 'b' } })
  ]);
  const respostas = await lerJson(dir, 'respostas.json');
  assert.equal(respostas.L01.campos.piso, 'a');
  assert.equal(respostas.L02.campos.piso, 'b');
  assert.equal((await lerJson(dir, 'historico.json')).eventos.length, 2);
});

test('não aplicável exige justificativa; lote aplica e informa falhas individuais', async () => {
  const s = criarStore(await novoDir());
  const sem = await s.alterarStatusEmLote(['L01'], 'nao_aplicavel', {});
  assert.equal(sem[0].ok, false);
  const r = await s.alterarStatusEmLote(['L01', 'L02', 'L99'], 'nao_aplicavel', { observacao: 'Fora do escopo' });
  assert.deepEqual(r.map((x) => x.ok), [true, true, false]);
});

test('impacto financeiro é validado: número negativo e estimado sem justificativa são recusados', () => {
  assert.equal(validarResposta(LACUNA, { status: 'pendente', impacto: { quantidade: -1 } }).ok, false);
  assert.equal(validarResposta(LACUNA, { status: 'pendente', impacto: { valorEstimado: 10 } }).ok, false);
  const ok = validarResposta(LACUNA, { status: 'pendente', impacto: { quantidade: '12,5', custoUnitario: 80, incerteza: 'media' } });
  assert.equal(ok.valor.impacto.quantidade, 12.5);
  assert.equal(ok.valor.impacto.incerteza, 'media');
});

test('aplicarProcessamento faz backup e registra origem claude com motivo', async () => {
  const dir = await novoDir();
  const s = criarStore(dir);
  await s.salvarResposta('L01', { status: 'respondida', campos: { piso: 'x' } });
  const r = await s.aplicarProcessamento([{ lacuna: 'L01', de: 'respondida', para: 'em_validacao', motivo: 'Completa' }]);
  assert.equal(r[0].ok, true);
  const ev = (await s.historico('L01')).at(-1);
  assert.equal(ev.origem, 'claude');
  assert.equal(ev.motivo, 'Completa');
  assert.ok((await readdir(path.join(dir, 'backups'))).length >= 1);
});
