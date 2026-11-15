// Cenários cobertos na revisão final: núcleo com armazenamento em memória (mesmo caminho do navegador),
// criação manual de lacunas e relatórios sem estado compartilhado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarNucleo } from '../lib/nucleo-store.js';
import { gerarRelatorio } from '../lib/relatorios.js';
import { normalizarLacuna } from '../lib/dominio/lacunas.js';

/** Adaptador em memória com a mesma interface do IndexedDB/disco. */
function memoria(arquivos) {
  const m = new Map(Object.entries(arquivos).map(([k, v]) => [k, structuredClone(v)]));
  let versao = 0;
  return {
    m,
    ler: async (n, padrao) => { if (m.has(n)) return structuredClone(m.get(n)); if (padrao !== undefined) return padrao; throw new Error(`Falha ao ler ${n}`); },
    gravar: async (n, d) => { m.set(n, structuredClone(d)); versao += 1; },
    backup: async (n) => { if (!m.has(n)) return null; m.set(`backups/${n}-${versao}`, m.get(n)); return n; },
    versao: async () => String(versao),
    anexoExiste: async (id) => m.has(`anexos/${id}`)
  };
}

const projeto = { nome: 'P', etapa: 'EP', referencia: { largura: 100, altura: 100 }, escala: { metrosPorRef: 0.1, origem: 't' },
  pranchas: [{ numero: 1, folha: '01', titulo: 'Planta', imagem: 'p.png' }] };
const LACUNA = { id: 'L09', titulo: 'T', categoria: 'piso', prioridade: 'alta', problema: 'p', pergunta: 'q', campos: [{ chave: 'piso', rotulo: 'Piso' }], marcadores: [{ prancha: 1, x: 1, y: 1, w: 5, h: 5 }] };

test('núcleo em memória (caminho do navegador): workflow, histórico e versão funcionam sem Node fs', async () => {
  const arm = memoria({ 'projeto.json': projeto, 'lacunas.json': [LACUNA] });
  const s = criarNucleo(arm);
  const v0 = await s.versao();
  assert.equal((await s.salvarResposta('L09', { status: 'respondida', campos: { piso: 'Vinílico' } })).ok, true);
  assert.equal((await s.salvarResposta('L09', { status: 'validada', campos: { piso: 'Vinílico' } })).codigo, 400, 'sem evidência: recusa na validação');
  const pulo = await s.salvarResposta('L09', { status: 'validada', campos: { piso: 'Vinílico' }, notaValidacao: 'ok', evidencias: [{ tipo: 'email', descricao: 'e-mail' }] });
  assert.equal(pulo.codigo, 409, 'respondida → validada sem passar por validação técnica');
  const d = await s.carregar();
  assert.equal(d.lacunas[0].resposta.status, 'respondida');
  assert.equal(d.eventos.length, 1);
  assert.notEqual(await s.versao(), v0);
  assert.ok([...arm.m.keys()].includes('esquema.json'), 'migração de esquema também roda no navegador');
});

test('criar lacuna manual: valida campos e marcador, gera ID seguinte, campos por categoria e histórico', async () => {
  const arm = memoria({ 'projeto.json': projeto, 'lacunas.json': [LACUNA] });
  const s = criarNucleo(arm);
  const base = { titulo: 'Copa sem revestimento', categoria: 'revestimento', prioridade: 'media', problema: 'Falta revestimento', pergunta: 'Qual?', marcador: { prancha: 1, x: 10, y: 10, w: 20, h: 10 } };
  assert.equal((await s.criarLacuna({ ...base, titulo: '' })).codigo, 400);
  assert.equal((await s.criarLacuna({ ...base, categoria: 'xyz' })).codigo, 400);
  assert.equal((await s.criarLacuna({ ...base, marcador: { prancha: 1, x: 90, y: 10, w: 20, h: 10 } })).codigo, 400, 'marcador fora da prancha');
  assert.equal((await s.criarLacuna({ ...base, marcador: { ...base.marcador, prancha: 9 } })).codigo, 400, 'prancha inexistente');
  const r = await s.criarLacuna({ ...base, ambientes: ['Copa', ''] }, { autor: 'Ana' });
  assert.equal(r.lacuna.id, 'L10');
  assert.deepEqual(r.lacuna.campos.map((c) => c.chave), ['piso', 'parede', 'altura']);
  assert.deepEqual(r.lacuna.ambientes, ['Copa']);
  assert.match(r.lacuna.origem, /manualmente.*Ana/);
  const d = await s.carregar();
  assert.deepEqual(d.lacunas.map((l) => l.id), ['L09', 'L10']);
  assert.deepEqual(d.integridade, []);
  assert.equal(d.eventos.at(-1).acao, 'lacuna-criada');
  assert.ok([...arm.m.keys()].some((k) => k.startsWith('backups/lacunas.json')), 'backup antes de alterar lacunas.json');
});

test('relatórios: URL das pranchas por chamada (sem estado compartilhado entre relatórios)', () => {
  const lac = [{ ...normalizarLacuna({ ...LACUNA, onde: 'o', impacto: 'i' }), resposta: { status: 'aberta', campos: {} } }];
  const a = gerarRelatorio('abertas', { projeto, lacunas: lac, eventos: [] }, { urlPrancha: (i) => `blob:a/${i}` });
  const b = gerarRelatorio('abertas', { projeto, lacunas: lac, eventos: [] }, { base: '/sub/' });
  const c = gerarRelatorio('abertas', { projeto, lacunas: lac, eventos: [] });
  assert.match(a, /url\('blob:a\/p\.png'\)/);
  assert.match(b, /url\('\/sub\/pranchas\/p\.png'\)/);
  assert.match(b, /href="\/sub\/static\/relatorio\.css"/);
  assert.match(c, /url\('\/pranchas\/p\.png'\)/, 'relatório seguinte não herda a URL do anterior');
});

test('importação de PDF corrompido falha sem deixar projeto pela metade', async (t) => {
  const { importarPdf, poppler } = await import('../lib/importar-pdf.js');
  try { await poppler('pdfinfo'); } catch { t.skip('poppler não instalado'); return; }
  const { mkdtemp, access } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const destino = path.join(await mkdtemp(path.join(tmpdir(), 'imp-')), 'quebrado');
  await assert.rejects(() => importarPdf({ destino, pdf: Buffer.from('%PDF-1.4\nlixo sem estrutura'), nome: 'X', obraId: 'x' }), (e) => e.codigo === 422);
  await assert.rejects(() => access(destino), 'pasta removida após a falha');
});

test('cabeçalho de upload malformado devolve 400 (não 500)', async () => {
  const { criarServidor } = await import('../server.js');
  const { mkdtemp, mkdir, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const dir = await mkdtemp(path.join(tmpdir(), 'cab-'));
  await mkdir(path.join(dir, 'projetos', 'x'), { recursive: true });
  await writeFile(path.join(dir, 'projetos', 'x', 'projeto.json'), JSON.stringify(projeto));
  await writeFile(path.join(dir, 'projetos', 'x', 'lacunas.json'), '[]');
  const srv = criarServidor({ dadosDir: dir });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try {
    const base = `http://127.0.0.1:${srv.address().port}`;
    const hdr = { 'X-Lacunas-Upload': '1', 'Content-Type': 'application/octet-stream' };
    assert.equal((await fetch(`${base}/api/anexos`, { method: 'POST', body: 'x', headers: { ...hdr, 'X-Nome-Arquivo': '%E0%A4' } })).status, 400);
    assert.equal((await fetch(`${base}/api/projetos`, { method: 'POST', body: '%PDF-', headers: { ...hdr, 'X-Nome-Projeto': '%E0%A4' } })).status, 400);
  } finally {
    srv.close();
  }
});

// ── Regressões dos achados da revisão independente ──
test('relatório de evolução não quebra com eventos de ambiente, escala e anotação', async () => {
  const s = criarNucleo(memoria({ 'projeto.json': projeto, 'lacunas.json': [LACUNA] }));
  await s.salvarAmbiente(null, { nome: 'Copa', poligonos: [{ prancha: 1, pontos: [[0, 0], [10, 0], [10, 10]] }] });
  await s.definirEscala(null, { metrosPorRef: 0.05, origem: 'cota' });
  await s.criarAnotacao({ tipo: 'texto', prancha: 1, pontos: [[5, 5]], texto: 'nota' });
  await s.salvarResposta('L09', { status: 'pendente', campos: {} });
  const html = gerarRelatorio('evolucao', await s.carregar());
  assert.match(html, /Ambiente medido/);
  assert.match(html, /Escala definida/);
  assert.match(html, /Anotação criada/);
});

test('números pt-BR: milhar e decimal corretos; ambíguos recusados', async () => {
  const { lerNumeroBr, metrosDeTexto } = await import('../lib/dominio/numeros.js');
  assert.equal(lerNumeroBr('1.250'), 1250);
  assert.equal(lerNumeroBr('1.250,50'), 1250.5);
  assert.equal(lerNumeroBr('R$ 80,00'), 80);
  assert.equal(lerNumeroBr('2.5'), 2.5);
  assert.ok(Number.isNaN(lerNumeroBr('12abc')));
  assert.equal(metrosDeTexto('até o forro (2,50)'), 2.5);
  assert.equal(metrosDeTexto('120 cm'), 1.2);
  assert.equal(metrosDeTexto('15 cm de rodapé, 2,50 m'), null);
  const s = criarNucleo(memoria({ 'projeto.json': projeto, 'lacunas.json': [LACUNA] }));
  const r = await s.salvarResposta('L09', { status: 'pendente', impacto: { custoUnitario: '1.250,50', quantidade: '1.200' } });
  assert.deepEqual([r.resposta.impacto.custoUnitario, r.resposta.impacto.quantidade], [1250.5, 1200]);
});

test('EAP não calcula parede com altura ambígua e explica o motivo', async () => {
  const { montarEap } = await import('../lib/eap-hierarquica.js');
  const l = { ...normalizarLacuna({ ...LACUNA, ambientes: ['Copa'], campos: [{ chave: 'parede', rotulo: 'Parede' }, { chave: 'altura', rotulo: 'Altura' }] }),
    resposta: { status: 'respondida', campos: { parede: 'Cerâmica', altura: '15 cm de rodapé, 2,50 m' } } };
  const parede = montarEap({ nome: 'X' }, [l], { ambientes: [{ id: 'A01', nome: 'Copa', medida: { area: 10, perimetro: 14 } }] }).find((x) => x.descricao.startsWith('Parede'));
  assert.equal(parede.quantidade, null);
  assert.match(parede.observacoes, /ambígua/);
});

test('ID de ambiente excluído não é reaproveitado; calibrar remove denominador obsoleto', async () => {
  const s = criarNucleo(memoria({ 'projeto.json': { ...projeto, escala: { denominador: 75, metrosPorRef: 0.1, origem: 'decl' } }, 'lacunas.json': [] }));
  const pol = { poligonos: [{ prancha: 1, pontos: [[0, 0], [10, 0], [10, 10]] }] };
  const a1 = (await s.salvarAmbiente(null, { nome: 'A', ...pol })).ambiente;
  const a2 = (await s.salvarAmbiente(null, { nome: 'B', ...pol })).ambiente;
  await s.excluirAmbiente(a2.id);
  const a3 = (await s.salvarAmbiente(null, { nome: 'C', ...pol })).ambiente;
  assert.deepEqual([a1.id, a2.id, a3.id], ['A01', 'A02', 'A03']);
  const esc = (await s.definirEscala(null, { metrosPorRef: 0.05, origem: 'cota' })).escala;
  assert.equal(esc.denominador, undefined);
});

test('servidor: Host externo bloqueado também em leitura; corpo nulo 400; corpo gigante 413 com resposta; PDF anexo baixa', async () => {
  const { criarServidor } = await import('../server.js');
  const { mkdtemp, mkdir, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const http = await import('node:http');
  const path = await import('node:path');
  const dir = await mkdtemp(path.join(tmpdir(), 'rev-'));
  await mkdir(path.join(dir, 'projetos', 'x', 'pranchas'), { recursive: true });
  await writeFile(path.join(dir, 'projetos', 'x', 'projeto.json'), JSON.stringify(projeto));
  await writeFile(path.join(dir, 'projetos', 'x', 'lacunas.json'), JSON.stringify([LACUNA]));
  const srv = criarServidor({ dadosDir: dir });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const porta = srv.address().port;
  const base = `http://127.0.0.1:${porta}`;
  try {
    const status = await new Promise((resolve) => http.get({ host: '127.0.0.1', port: porta, path: '/api/projeto', headers: { Host: 'evil.example:8766' } }, (r) => { r.resume(); resolve(r.statusCode); }));
    assert.equal(status, 403, 'DNS rebinding: leitura com Host externo');
    const json = { 'Content-Type': 'application/json' };
    assert.equal((await fetch(`${base}/api/escala`, { method: 'PUT', headers: json, body: 'null' })).status, 400);
    assert.equal((await fetch(`${base}/api/projetos/ativo`, { method: 'PUT', headers: json, body: '[1]' })).status, 400);
    const grande = await fetch(`${base}/api/lacunas/L09/resposta`, { method: 'PUT', headers: json, body: JSON.stringify({ status: 'pendente', observacao: 'x'.repeat(70000) }) });
    assert.equal(grande.status, 413);
    const up = await fetch(`${base}/api/anexos`, { method: 'POST', body: '%PDF-1.4 doc', headers: { 'X-Lacunas-Upload': '1', 'Content-Type': 'application/octet-stream', 'X-Nome-Arquivo': 'a.pdf' } });
    const anexo = await up.json();
    assert.equal((await fetch(`${base}/anexos/${anexo.id}`)).headers.get('content-disposition'), 'attachment');
  } finally {
    srv.close();
  }
});
