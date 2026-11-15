// Campo de escolha "Existente mantido / novo" (piso e revestimento).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarResposta } from '../lib/nucleo-store.js';
import { criarNucleo } from '../lib/nucleo-store.js';
import { verificarIntegridade } from '../lib/dominio/lacunas.js';

const SIT = { chave: 'situacao', rotulo: 'Existente mantido / novo', opcoes: ['Existente mantido', 'Novo'], opcional: true };
const LAC = { campos: [{ chave: 'parede', rotulo: 'Parede' }, SIT] };

test('campo de escolha aceita só as opções definidas (ou vazio)', () => {
  assert.equal(validarResposta(LAC, { status: 'respondida', campos: { situacao: 'Novo' } }).ok, true);
  assert.equal(validarResposta(LAC, { status: 'pendente', campos: { situacao: '' } }).ok, true);
  const r = validarResposta(LAC, { status: 'respondida', campos: { situacao: 'Talvez' } });
  assert.equal(r.ok, false);
  assert.match(r.erro, /Existente mantido \/ novo: escolha uma das opções \(Existente mantido, Novo\)/);
});

test('lacuna manual de revestimento e de piso já nasce com o campo de escolha', async () => {
  const m = new Map([['projeto.json', { referencia: { largura: 100, altura: 100 }, pranchas: [{ numero: 1 }] }], ['lacunas.json', []]]);
  const s = criarNucleo({
    ler: async (n, p) => (m.has(n) ? structuredClone(m.get(n)) : p), gravar: async (n, d) => { m.set(n, d); },
    backup: async () => null, versao: async () => '1', anexoExiste: async () => false
  });
  const base = { titulo: 'T', prioridade: 'media', problema: 'p', pergunta: 'q', marcador: { prancha: 1, x: 1, y: 1, w: 5, h: 5 } };
  for (const categoria of ['revestimento', 'piso']) {
    const { lacuna } = await s.criarLacuna({ ...base, categoria });
    assert.deepEqual(lacuna.campos.find((c) => c.chave === 'situacao'), SIT, categoria);
  }
  const { lacuna: parede } = await s.criarLacuna({ ...base, categoria: 'parede' });
  assert.deepEqual(parede.campos.find((c) => c.chave === 'situacao'), SIT, 'todas as categorias têm o campo');
});

test('integridade acusa lista de opções inválida', () => {
  const projeto = { referencia: { largura: 10, altura: 10 }, pranchas: [{ numero: 1 }] };
  const l = { id: 'L1', titulo: 't', categoria: 'piso', problema: 'p', pergunta: 'q', marcadores: [{ prancha: 1, x: 1, y: 1, w: 1, h: 1 }] };
  assert.deepEqual(verificarIntegridade(projeto, [{ ...l, campos: [SIT] }]), []);
  assert.match(verificarIntegridade(projeto, [{ ...l, campos: [{ ...SIT, opcoes: [] }] }])[0].mensagem, /opções inválidas/);
});

test('toda lacuna tem o campo de situação (sem duplicar) e ele não trava a completude', async () => {
  const { normalizarLacuna } = await import('../lib/dominio/lacunas.js');
  const { avaliarCompletude } = await import('../lib/dominio/processamento.js');
  const doc = normalizarLacuna({ id: 'L13', categoria: 'documentacao', campos: [{ chave: 'resposta', rotulo: 'Esclarecimento' }] });
  assert.deepEqual(doc.campos.map((c) => c.chave), ['resposta', 'situacao']);
  const antigo = normalizarLacuna({ id: 'L04', categoria: 'piso', campos: [{ chave: 'piso', rotulo: 'Piso' }, { chave: 'situacao', rotulo: 'x' }] });
  assert.equal(antigo.campos.filter((c) => c.chave === 'situacao').length, 1);
  assert.deepEqual(antigo.campos.at(-1), SIT, 'campo padronizado mesmo se o lacunas.json tiver outra definição');
  assert.equal(avaliarCompletude({ ...doc, resposta: { campos: { resposta: 'Renumerar' } } }).completa, true);
});

test('servidor aceita a situação em lacuna sem o campo no lacunas.json e recusa valor fora da lista', async () => {
  const m = new Map([['projeto.json', { referencia: { largura: 10, altura: 10 }, pranchas: [{ numero: 1 }] }],
    ['lacunas.json', [{ id: 'L13', titulo: 't', categoria: 'documentacao', problema: 'p', pergunta: 'q', campos: [{ chave: 'resposta', rotulo: 'R' }], marcadores: [] }]]]);
  const s = criarNucleo({ ler: async (n, p) => (m.has(n) ? structuredClone(m.get(n)) : p), gravar: async (n, d) => { m.set(n, d); }, backup: async () => null, versao: async () => '1', anexoExiste: async () => false });
  const ok = await s.salvarResposta('L13', { status: 'respondida', campos: { resposta: 'x', situacao: 'Existente mantido' } });
  assert.equal(ok.resposta.campos.situacao, 'Existente mantido');
  assert.equal((await s.salvarResposta('L13', { status: 'respondida', campos: { resposta: 'x', situacao: 'Talvez' } })).codigo, 400);
});
