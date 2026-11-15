import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { criarServidor } from '../server.js';

let servidor;
let base;
const LACUNA = { id: 'L01', titulo: 'Banheiros', categoria: 'revestimento', prioridade: 'alta', onde: 'P3', problema: 'p', pergunta: 'q', impacto: 'i',
  campos: [{ chave: 'piso', rotulo: 'Piso' }], marcadores: [{ prancha: 1, x: 1, y: 1, w: 2, h: 2 }], ambientes: ['Banheiros'] };

before(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'lacunas-srv2-'));
  await mkdir(path.join(dir, 'pranchas'));
  await writeFile(path.join(dir, 'projeto.json'), JSON.stringify({
    nome: 'Teste', etapa: 'EP', arquivo: 'a.pdf', referencia: { largura: 10, altura: 10 },
    pranchas: [{ numero: 1, folha: '01', titulo: 'Planta', imagem: 'p.png' }]
  }));
  await writeFile(path.join(dir, 'lacunas.json'), JSON.stringify([LACUNA, { ...LACUNA, id: 'L02' }]));
  servidor = criarServidor({ dadosDir: dir });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
after(() => servidor.close());

const json = { 'Content-Type': 'application/json' };
const put = (id, corpo, headers = json) => fetch(`${base}/api/lacunas/${id}/resposta`, { method: 'PUT', headers, body: JSON.stringify(corpo) });

test('projeto traz integridade e lacunas normalizadas (pranchas, disciplinas)', async () => {
  const d = await (await fetch(`${base}/api/projeto`)).json();
  assert.deepEqual(d.integridade, []);
  assert.deepEqual(d.lacunas[0].pranchas, [1]);
  assert.ok(d.lacunas[0].disciplinas.length);
});

test('escrita exige JSON (415) e origem local (403)', async () => {
  assert.equal((await put('L01', { status: 'pendente' }, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await put('L01', { status: 'pendente' }, { ...json, Origin: 'https://site-malicioso.example' })).status, 403);
  assert.equal((await put('L01', { status: 'pendente' }, { ...json, Origin: base })).status, 200);
});

test('corpo com bytes que não são UTF-8 é recusado (não grava "�" em silêncio)', async () => {
  const latin1 = Buffer.from('{"status":"pendente","observacao":"S\xEDndico"}', 'latin1');
  const r = await fetch(`${base}/api/lacunas/L01/resposta`, { method: 'PUT', headers: json, body: latin1 });
  assert.equal(r.status, 400);
  assert.match((await r.json()).erro, /UTF-8/);
});

test('histórico da lacuna registra a alteração e o autor', async () => {
  await put('L02', { status: 'respondida', campos: { piso: 'Porcelanato' }, autor: 'Gabriel' });
  const { eventos } = await (await fetch(`${base}/api/lacunas/L02/historico`)).json();
  assert.equal(eventos.at(-1).para.status, 'respondida');
  assert.equal(eventos.at(-1).autor, 'Gabriel');
});

test('versão dos dados muda após uma gravação (sincronização com o Claude)', async () => {
  const antes = (await (await fetch(`${base}/api/versao`)).json()).versao;
  await new Promise((r) => setTimeout(r, 20));
  await put('L02', { status: 'respondida', campos: { piso: 'Porcelanato' }, observacao: 'nova obs' });
  const depois = (await (await fetch(`${base}/api/versao`)).json()).versao;
  assert.notEqual(antes, depois);
  assert.equal((await (await fetch(`${base}/api/projeto`)).json()).versao, depois);
});

test('transição inválida devolve 409', async () => {
  assert.equal((await put('L01', { status: 'validada', notaValidacao: 'x', evidencias: [{ descricao: 'e' }] })).status, 409);
});

test('status em lote valida IDs e devolve resultado por lacuna', async () => {
  const ruim = await fetch(`${base}/api/lacunas/status-lote`, { method: 'POST', headers: json, body: JSON.stringify({ ids: ['../x'], status: 'pendente' }) });
  assert.equal(ruim.status, 400);
  const r = await fetch(`${base}/api/lacunas/status-lote`, { method: 'POST', headers: json, body: JSON.stringify({ ids: ['L01', 'L99'], status: 'nao_aplicavel', observacao: 'Fora do escopo' }) });
  const { resultados } = await r.json();
  assert.deepEqual(resultados.map((x) => x.ok), [true, false]);
});

test('prévia do processamento não altera dados', async () => {
  const p = await (await fetch(`${base}/api/processamento/previa`)).json();
  assert.deepEqual(p.acoes.map((a) => [a.lacuna, a.para]), [['L02', 'em_validacao']]);
  const d = await (await fetch(`${base}/api/projeto`)).json();
  assert.equal(d.lacunas.find((l) => l.id === 'L02').resposta.status, 'respondida');
});

test('exportações: EAP JSON, CSV hierárquico, XLSX e CSV legado', async () => {
  const eap = await (await fetch(`${base}/api/eap-hierarquica.json`)).json();
  assert.ok(eap.linhas.some((l) => l.descricao === 'Piso: Porcelanato'));
  const csv = await fetch(`${base}/api/eap-hierarquica.csv?colunas=codigo,descricao&incluir=respondida`);
  const bytes = Buffer.from(await csv.arrayBuffer());
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'BOM UTF-8 para o Excel');
  assert.match(bytes.subarray(3).toString('utf8'), /^Código EAP;Descrição\r\n/);
  const xlsx = await fetch(`${base}/api/eap.xlsx`);
  assert.equal(xlsx.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(Buffer.from(await xlsx.arrayBuffer()).subarray(0, 2).toString(), 'PK');
  assert.match(await (await fetch(`${base}/api/eap.csv`)).text(), /Código EAP;Grupo;Lacuna/);
});

test('relatórios: existentes retornam HTML, inexistentes 404', async () => {
  const r = await fetch(`${base}/relatorios/executivo`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html/);
  assert.equal((await fetch(`${base}/relatorios/naoexiste`)).status, 404);
});

test('módulos de domínio são servidos ao navegador, sem expor o resto de lib/', async () => {
  assert.equal((await fetch(`${base}/dominio/status.js`)).status, 200);
  assert.equal((await fetch(`${base}/dominio/../store.js`)).status, 404);
  assert.equal((await fetch(`${base}/dominio/%2e%2e/store.js`)).status, 404);
});
