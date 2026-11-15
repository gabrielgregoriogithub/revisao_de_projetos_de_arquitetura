import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { criarServidor } from '../server.js';

let servidor;
let base;

before(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'lacunas-srv-'));
  await mkdir(path.join(dir, 'pranchas'));
  await writeFile(path.join(dir, 'pranchas', 'p.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  await writeFile(path.join(dir, 'segredo.json'), '{"x":1}');
  await writeFile(path.join(dir, 'projeto.json'), JSON.stringify({ nome: 'Teste', pranchas: [] }));
  await writeFile(path.join(dir, 'lacunas.json'), JSON.stringify([
    { id: 'L01', titulo: 'Banheiros', categoria: 'revestimento', onde: 'P3', campos: [{ chave: 'piso', rotulo: 'Piso' }], marcadores: [] }
  ]));
  servidor = criarServidor({ dadosDir: dir });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(() => servidor.close());

const put = (id, corpo) => fetch(`${base}/api/lacunas/${id}/resposta`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo)
});

test('GET /api/projeto devolve projeto e lacunas com status padrão', async () => {
  const r = await fetch(`${base}/api/projeto`);
  assert.equal(r.status, 200);
  const dados = await r.json();
  assert.equal(dados.projeto.nome, 'Teste');
  assert.equal(dados.lacunas[0].resposta.status, 'aberta');
});

test('PUT salva resposta e ela aparece no projeto e na EAP', async () => {
  const r = await put('L01', { status: 'respondida', campos: { piso: 'Porcelanato' } });
  assert.equal(r.status, 200);
  const dados = await (await fetch(`${base}/api/projeto`)).json();
  assert.equal(dados.lacunas[0].resposta.campos.piso, 'Porcelanato');
  const csv = await (await fetch(`${base}/api/eap.csv`)).text();
  assert.match(csv, /Porcelanato/);
});

test('PUT com status inválido devolve 400', async () => {
  assert.equal((await put('L01', { status: 'xx' })).status, 400);
});

test('PUT com JSON quebrado devolve 400', async () => {
  assert.equal((await put('L01', '{quebrado')).status, 400);
});

test('PUT em lacuna inexistente devolve 404', async () => {
  assert.equal((await put('L77', { status: 'pendente' })).status, 404);
});

test('serve prancha PNG', async () => {
  const r = await fetch(`${base}/pranchas/p.png`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/png');
});

test('URL com % malformado devolve 400 sem derrubar o servidor', async () => {
  assert.equal((await fetch(`${base}/pranchas/%E0%A4%A`)).status, 400);
  assert.equal((await fetch(`${base}/api/projeto`)).status, 200);
});

test('bloqueia path traversal e extensões não permitidas', async () => {
  for (const url of ['/pranchas/..%2Fsegredo.json', '/pranchas/%2e%2e/%2e%2e/server.js', '/static/../../server.js']) {
    const r = await fetch(base + url);
    assert.equal(r.status, 404, url);
  }
});
