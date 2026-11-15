import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validarResposta, mesclarLacunas, criarStore } from '../lib/store.js';

const LACUNA = {
  id: 'L01',
  titulo: 'Banheiros',
  categoria: 'revestimento',
  campos: [{ chave: 'piso', rotulo: 'Piso' }, { chave: 'parede', rotulo: 'Parede' }]
};

test('aceita resposta válida e ignora campos desconhecidos', () => {
  const r = validarResposta(LACUNA, { status: 'respondida', campos: { piso: ' Porcelanato ', xyz: 'hack' }, observacao: '' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.valor.campos, { piso: 'Porcelanato', parede: '' });
});

test('rejeita status inválido', () => {
  const r = validarResposta(LACUNA, { status: 'feito', campos: {} });
  assert.equal(r.ok, false);
  assert.match(r.erro, /status/i);
});

test('rejeita "respondida" sem nenhum campo nem observação', () => {
  const r = validarResposta(LACUNA, { status: 'respondida', campos: { piso: '  ' }, observacao: '' });
  assert.equal(r.ok, false);
  assert.match(r.erro, /preencha/i);
});

test('aceita "pendente" sem campos preenchidos', () => {
  const r = validarResposta(LACUNA, { status: 'pendente', campos: {}, observacao: 'Aguardando condomínio' });
  assert.equal(r.ok, true);
  assert.equal(r.valor.status, 'pendente');
});

test('rejeita texto longo demais', () => {
  const r = validarResposta(LACUNA, { status: 'pendente', campos: { piso: 'x'.repeat(2001) } });
  assert.equal(r.ok, false);
});

test('mesclarLacunas aplica status padrão "aberta" sem mutar a entrada', () => {
  const lacunas = [LACUNA];
  const respostas = { L01: { status: 'pendente', campos: { piso: 'a' }, observacao: '' } };
  const out = mesclarLacunas(lacunas, respostas);
  assert.equal(out[0].resposta.status, 'pendente');
  assert.equal(lacunas[0].resposta, undefined);
  assert.equal(mesclarLacunas(lacunas, {})[0].resposta.status, 'aberta');
});

test('store salva e relê respostas em disco', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'lacunas-'));
  await writeFile(path.join(dir, 'projeto.json'), JSON.stringify({ nome: 'X', pranchas: [] }));
  await writeFile(path.join(dir, 'lacunas.json'), JSON.stringify([LACUNA]));
  const store = criarStore(dir);

  const r = await store.salvarResposta('L01', { status: 'respondida', campos: { piso: 'Vinílico' } });
  assert.equal(r.ok, true);

  const salvo = JSON.parse(await readFile(path.join(dir, 'respostas.json'), 'utf8'));
  assert.equal(salvo.L01.campos.piso, 'Vinílico');
  assert.ok(salvo.L01.atualizadoEm);

  const dados = await store.carregar();
  assert.equal(dados.lacunas[0].resposta.status, 'respondida');
});

test('store rejeita id inexistente', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'lacunas-'));
  await writeFile(path.join(dir, 'projeto.json'), '{}');
  await writeFile(path.join(dir, 'lacunas.json'), JSON.stringify([LACUNA]));
  const r = await criarStore(dir).salvarResposta('L99', { status: 'pendente', campos: {} });
  assert.equal(r.ok, false);
  assert.equal(r.codigo, 404);
});
