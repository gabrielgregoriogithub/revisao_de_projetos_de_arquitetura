import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { areaRef, perimetroRef, medirAmbiente } from '../lib/dominio/geometria.js';
import { compararRevisoes } from '../lib/dominio/revisoes.js';
import { anotarPrecisao, normalizarLacuna } from '../lib/dominio/lacunas.js';
import { detectarTipo, limparNome } from '../lib/anexos.js';
import { lerBbox, paraReferencia } from '../lib/texto-pdf.js';
import { criarCatalogo } from '../lib/projetos.js';
import { montarEap } from '../lib/eap-hierarquica.js';
import { criarServidor } from '../server.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const LACUNA = { id: 'L01', titulo: 'Banheiros', categoria: 'revestimento', prioridade: 'alta', onde: 'o', problema: 'p', pergunta: 'q', impacto: 'i',
  campos: [{ chave: 'piso', rotulo: 'Piso' }, { chave: 'parede', rotulo: 'Parede' }, { chave: 'altura', rotulo: 'Altura' }],
  marcadores: [{ prancha: 1, x: 10, y: 10, w: 20, h: 20 }], ambientes: ['Banheiros'] };
const projetoBase = (extra = {}) => ({ nome: 'Obra', etapa: 'EP', arquivo: 'a.pdf', referencia: { largura: 1000, altura: 700 },
  escala: { metrosPorRef: 0.05, origem: 'teste', calibrada: true }, pranchas: [{ numero: 1, folha: '01', titulo: 'Planta', imagem: 'p.png' }], ...extra });

async function criarProjeto(dir, extra = {}, lacunas = [LACUNA]) {
  await mkdir(path.join(dir, 'pranchas'), { recursive: true });
  await writeFile(path.join(dir, 'pranchas', 'p.png'), PNG);
  await writeFile(path.join(dir, 'projeto.json'), JSON.stringify(projetoBase(extra)));
  await writeFile(path.join(dir, 'lacunas.json'), JSON.stringify(lacunas));
}

test('geometria: área e perímetro de um retângulo convertidos pela escala', () => {
  const ret = [[0, 0], [100, 0], [100, 40], [0, 40]];
  assert.equal(areaRef(ret), 4000);
  assert.equal(perimetroRef(ret), 280);
  const m = medirAmbiente(projetoBase(), { poligonos: [{ prancha: 1, pontos: ret }, { prancha: 1, pontos: ret }] });
  assert.deepEqual([m.area, m.perimetro], [20, 28]); // 4000 × 0,05² × 2 = 20 m²
  assert.equal(medirAmbiente(projetoBase({ escala: null }), { poligonos: [{ prancha: 1, pontos: ret }] }).area, null);
});

test('anexos: tipo detectado pelo conteúdo, não pela extensão', () => {
  assert.equal(detectarTipo(Buffer.from('%PDF-1.7 ...'), 'x.pdf'), 'pdf');
  assert.equal(detectarTipo(PNG, 'foto.pdf'), 'png');
  assert.equal(detectarTipo(Buffer.from('MZ\x90\x00executavel'), 'contrato.pdf'), null);
  assert.equal(detectarTipo(Buffer.from('Assunto: piso\n'), 'email.eml'), 'txt');
  assert.equal(detectarTipo(Buffer.from([0x61, 0x00, 0x62]), 'x.txt'), null);
  assert.equal(detectarTipo(Buffer.from('texto'), 'x.exe'), null);
  assert.equal(limparNome('..\\..\\Windows\\sys<32>.pdf'), 'sys32.pdf');
});

test('texto do PDF: página deitada é convertida para o sistema de referência', () => {
  const html = '<page width="2384.000000" height="3370.000000"><word xMin="2164.36" yMin="1867.95" xMax="2237.49" yMax="1882.31">LEGENDA</word><word xMin="10" yMin="10" xMax="14" yMax="16">A&amp;B</word></page>';
  const [pag] = lerBbox(html);
  assert.equal(pag.palavras[1].texto, 'A&B');
  const [w] = paraReferencia(pag, { largura: 1873, altura: 1325 });
  assert.deepEqual([Math.round(w.x), Math.round(w.y)], [1203, 1038]);
});

test('precisão: marcador com palavra do PDF dentro é "ancorado"; sem, "estimado"', () => {
  const l = anotarPrecisao(normalizarLacuna({ ...LACUNA, marcadores: [{ prancha: 1, x: 0, y: 0, w: 50, h: 50 }, { prancha: 1, x: 200, y: 200, w: 10, h: 10 }] }),
    { pranchas: { 1: [{ texto: 'A', x: 20, y: 20, w: 4, h: 6 }] } });
  assert.deepEqual(l.marcadores.map((m) => m.precisao), ['ancorado', 'estimado']);
  assert.deepEqual(l.marcadores[0].ancoras, ['A']);
});

test('revisões: resolvidas, novas e mantidas (casando por ID ou título)', () => {
  const r = compararRevisoes(
    [{ id: 'L01', titulo: 'Banheiros sem piso', problema: 'a', resposta: { status: 'validada' } }, { id: 'L02', titulo: 'Copa', problema: 'b' }],
    [{ id: 'L07', titulo: 'banheiros  sem piso', problema: 'a mudou' }, { id: 'L08', titulo: 'Nova lacuna', prioridade: 'alta' }]
  );
  assert.deepEqual(r.resolvidasNaRevisao.map((x) => x.id), ['L02']);
  assert.deepEqual(r.novas.map((x) => x.id), ['L08']);
  assert.deepEqual([r.mantidas[0].idAntes, r.mantidas[0].idDepois, r.mantidas[0].problemaMudou, r.mantidas[0].statusAntes], ['L01', 'L07', true, 'validada']);
});

test('EAP usa a área medida do ambiente como quantidade de piso e perímetro × altura na parede', () => {
  const l = { ...normalizarLacuna(LACUNA), resposta: { status: 'validada', campos: { piso: 'Porcelanato', parede: 'Cerâmica', altura: 'até 2,50 m' } } };
  const amb = [{ id: 'A01', nome: 'banheiros', medida: { area: 12.5, perimetro: 15 } }];
  const serv = montarEap({ nome: 'X' }, [l], { ambientes: amb }).filter((x) => x.tipo === 'servico');
  const piso = serv.find((s) => s.descricao.startsWith('Piso'));
  const parede = serv.find((s) => s.descricao.startsWith('Parede'));
  assert.deepEqual([piso.quantidade, piso.unidade], [12.5, 'm²']);
  assert.match(piso.observacoes, /área medida no quadro \(A01\)/);
  assert.equal(parede.quantidade, 37.5);
  assert.match(parede.observacoes, /sem desconto de vãos/);
});

test('catálogo: modo único (legado) e vários projetos com projeto ativo', async () => {
  const unico = await mkdtemp(path.join(tmpdir(), 'cat-u-'));
  await criarProjeto(unico);
  const c1 = criarCatalogo(unico);
  assert.equal(await c1.ativo(), 'padrao');

  const multi = await mkdtemp(path.join(tmpdir(), 'cat-m-'));
  await criarProjeto(path.join(multi, 'projetos', 'obra-r00'), { revisao: 'R00' });
  await criarProjeto(path.join(multi, 'projetos', 'obra-r01'), { revisao: 'R01' });
  const c2 = criarCatalogo(multi);
  assert.deepEqual((await c2.listar()).map((p) => p.revisao), ['R00', 'R01']);
  assert.equal(await c2.ativo(), 'obra-r00');
  await c2.definirAtivo('obra-r01');
  assert.equal(await c2.ativo(), 'obra-r01');
  await assert.rejects(() => c2.definirAtivo('../fora'), /não encontrado/);
  await assert.rejects(() => c2.store('../../etc'), /inválido/);
});

let servidor; let base; let multiDir;
const json = { 'Content-Type': 'application/json' };
before(async () => {
  multiDir = await mkdtemp(path.join(tmpdir(), 'srv3-'));
  await criarProjeto(path.join(multiDir, 'projetos', 'obra-r00'), { revisao: 'R00' });
  await criarProjeto(path.join(multiDir, 'projetos', 'obra-r01'), { revisao: 'R01' }, [{ ...LACUNA, id: 'L05', titulo: 'Nova da R01' }]);
  servidor = criarServidor({ dadosDir: multiDir });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
after(() => servidor.close());

const upload = (buf, nome, headers = { 'X-Lacunas-Upload': '1' }) => fetch(`${base}/api/anexos`, {
  method: 'POST', body: buf, headers: { 'Content-Type': 'application/octet-stream', 'X-Nome-Arquivo': encodeURIComponent(nome), ...headers }
});

test('servidor: anexo válido é salvo com hash; sem cabeçalho 403; disfarçado 415', async () => {
  assert.equal((await upload(PNG, 'a.png', {})).status, 403);
  assert.equal((await upload(Buffer.from('MZ fake'), 'nota.pdf')).status, 415);
  const r = await upload(PNG, 'planta revisada.png');
  assert.equal(r.status, 200);
  const anexo = await r.json();
  assert.match(anexo.id, /\.png$/);
  assert.equal(anexo.sha256.length, 64);

  const sem = await fetch(`${base}/api/lacunas/L01/resposta`, { method: 'PUT', headers: json, body: JSON.stringify({ status: 'pendente',
    evidencias: [{ descricao: 'x', anexo: { ...anexo, id: '00000000-0000-0000-0000-000000000000.png' } }] }) });
  assert.equal(sem.status, 400);
  const ok = await fetch(`${base}/api/lacunas/L01/resposta`, { method: 'PUT', headers: json, body: JSON.stringify({ status: 'pendente', evidencias: [{ descricao: 'Planta', anexo }] }) });
  assert.equal(ok.status, 200);

  const arq = await fetch(`${base}/anexos/${anexo.id}`);
  assert.equal(arq.headers.get('content-type'), 'image/png');
  assert.match(arq.headers.get('content-security-policy'), /sandbox/);
  assert.equal((await fetch(`${base}/anexos/..%2Fprojeto.json`)).status, 404);
});

test('servidor: ambientes (criar, validar limites, editar, excluir com backup) e escala recalculam a área', async () => {
  const ret = [[0, 0], [100, 0], [100, 40], [0, 40]];
  const fora = await fetch(`${base}/api/ambientes`, { method: 'POST', headers: json, body: JSON.stringify({ nome: 'X', poligonos: [{ prancha: 1, pontos: [[0, 0], [5000, 0], [0, 5]] }] }) });
  assert.equal(fora.status, 400);
  const c = await (await fetch(`${base}/api/ambientes`, { method: 'POST', headers: json, body: JSON.stringify({ nome: 'Banheiros', pd: '2,5', poligonos: [{ prancha: 1, pontos: ret }] }) })).json();
  assert.deepEqual([c.id, c.medida.area, c.pd], ['A01', 10, 2.5]);

  const esc = await fetch(`${base}/api/escala`, { method: 'PUT', headers: json, body: JSON.stringify({ prancha: null, metrosPorRef: 0.1, origem: 'cota de 10 m' }) });
  assert.equal(esc.status, 200);
  const dados = await (await fetch(`${base}/api/projeto`)).json();
  assert.equal(dados.ambientes[0].medida.area, 40);
  assert.ok(dados.eventos.some((e) => e.acao === 'escala') && dados.eventos.some((e) => e.acao === 'ambiente-criado'));

  const eap = await (await fetch(`${base}/api/eap-hierarquica.json?incluir=pendente`)).json();
  assert.ok(Array.isArray(eap.linhas));

  assert.equal((await fetch(`${base}/api/ambientes/A01`, { method: 'DELETE', headers: json, body: '{}' })).status, 200);
  assert.ok((await readdir(path.join(multiDir, 'projetos', 'obra-r00', 'backups'))).some((n) => n.startsWith('ambientes-')));
});

test('servidor: troca de projeto ativo, pranchas por projeto e comparação de revisões', async () => {
  const { projetos, ativo } = await (await fetch(`${base}/api/projetos`)).json();
  assert.equal(projetos.length, 2);
  assert.equal(ativo, 'obra-r00');
  const cmp = await (await fetch(`${base}/api/comparar?de=obra-r00&para=obra-r01`)).json();
  assert.deepEqual(cmp.lacunas.novas.map((x) => x.id), ['L05']);
  assert.deepEqual(cmp.lacunas.resolvidasNaRevisao.map((x) => x.id), ['L01']);
  assert.equal((await fetch(`${base}/api/comparar?de=obra-r00&para=..`)).status, 400);
  assert.equal((await fetch(`${base}/p/obra-r01/pranchas/p.png`)).status, 200);

  assert.equal((await fetch(`${base}/api/projetos/ativo`, { method: 'PUT', headers: json, body: JSON.stringify({ id: 'obra-r01' }) })).status, 200);
  const d = await (await fetch(`${base}/api/projeto`)).json();
  assert.equal(d.projetoId, 'obra-r01');
  assert.equal(d.lacunas[0].id, 'L05');
  assert.equal(JSON.parse(await readFile(path.join(multiDir, 'config.json'), 'utf8')).projetoAtivo, 'obra-r01');
  assert.equal((await fetch(`${base}/api/projetos/ativo`, { method: 'PUT', headers: json, body: JSON.stringify({ id: 'nao-existe' }) })).status, 404);
});
