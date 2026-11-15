// Funcionalidades do exemplo 2 do vídeo: base de pranchas (importar PDF), ferramentas de anotação e "ver também".
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { criarServidor } from '../server.js';
import { poppler } from '../lib/importar-pdf.js';

/** PDF mínimo válido (1 página paisagem 842×595 pt) com o texto "SALA A", xref calculado. */
function pdfMinimo() {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  const conteudo = 'BT /F1 24 Tf 100 400 Td (SALA A) Tj ET';
  objs[3] = `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`;
  let corpo = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(corpo.length); corpo += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = corpo.length;
  corpo += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  corpo += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(corpo, 'latin1');
}

let servidor; let base; let dir;
const json = { 'Content-Type': 'application/json' };
const LACUNAS = [
  { id: 'L01', titulo: 'Banheiros', categoria: 'piso', prioridade: 'alta', problema: 'p', pergunta: 'q', campos: [{ chave: 'piso', rotulo: 'Piso' }], marcadores: [{ prancha: 1, x: 1, y: 1, w: 5, h: 5 }], relacionadas: ['L02'] },
  { id: 'L02', titulo: 'Halls', categoria: 'parede', prioridade: 'baixa', problema: 'p', pergunta: 'q', campos: [{ chave: 'parede', rotulo: 'Parede' }], marcadores: [{ prancha: 1, x: 1, y: 1, w: 5, h: 5 }] }
];

before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'ex2-'));
  const p = path.join(dir, 'projetos', 'obra-r00');
  await mkdir(path.join(p, 'pranchas'), { recursive: true });
  await writeFile(path.join(p, 'projeto.json'), JSON.stringify({ nome: 'Obra', etapa: 'EP', revisao: 'R00', obraId: 'obra', referencia: { largura: 1000, altura: 700 },
    escala: { metrosPorRef: 0.05, origem: 't' }, pranchas: [{ numero: 1, folha: '01', titulo: 'Planta', imagem: 'p.png' }] }));
  await writeFile(path.join(p, 'lacunas.json'), JSON.stringify(LACUNAS));
  servidor = criarServidor({ dadosDir: dir });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
after(() => servidor.close());

test('anotações: texto exige conteúdo, cota exige 2 pontos na prancha; criar, listar e excluir com histórico', async () => {
  const post = (c) => fetch(`${base}/api/anotacoes`, { method: 'POST', headers: json, body: JSON.stringify(c) });
  assert.equal((await post({ tipo: 'texto', prancha: 1, pontos: [[10, 10]] })).status, 400);
  assert.equal((await post({ tipo: 'cota', prancha: 1, pontos: [[10, 10]] })).status, 400);
  assert.equal((await post({ tipo: 'cota', prancha: 1, pontos: [[10, 10], [5000, 10]] })).status, 400);
  assert.equal((await post({ tipo: 'script', prancha: 1, pontos: [[1, 1]] })).status, 400);
  const nova = await (await post({ tipo: 'cota', prancha: 1, pontos: [[10, 10], [110, 10]], texto: '5,00 m' })).json();
  const t = await (await post({ tipo: 'texto', prancha: 1, pontos: [[50, 50]], texto: 'Conferir shaft <b>' })).json();
  let d = await (await fetch(`${base}/api/projeto`)).json();
  assert.deepEqual(d.anotacoes.map((a) => a.tipo), ['cota', 'texto']);
  assert.equal(d.anotacoes[1].texto, 'Conferir shaft <b>');
  assert.equal((await fetch(`${base}/api/anotacoes/${nova.id}`, { method: 'DELETE', headers: json, body: '{}' })).status, 200);
  d = await (await fetch(`${base}/api/projeto`)).json();
  assert.deepEqual(d.anotacoes.map((a) => a.id), [t.id]);
  assert.ok(d.eventos.some((e) => e.acao === 'anotacao-excluida'));
});

test('ver também: relacionadas chegam normalizadas para o painel', async () => {
  const d = await (await fetch(`${base}/api/projeto`)).json();
  assert.deepEqual(d.lacunas.find((l) => l.id === 'L01').relacionadas, ['L02']);
});

test('base de pranchas: importa PDF como nova revisão (renderiza, extrai texto) e recusa não-PDF', async (t) => {
  try { await poppler('pdftoppm'); await poppler('pdftotext'); } catch { t.skip('poppler não instalado'); return; }
  const enviar = (buf, extra = {}) => fetch(`${base}/api/projetos`, { method: 'POST', body: buf,
    headers: { 'Content-Type': 'application/pdf', 'X-Lacunas-Upload': '1', 'X-Nome-Projeto': encodeURIComponent('Obra Teste'), 'X-Revisao': 'R01', 'X-Obra': 'obra', 'X-Escala': '50', ...extra } });
  assert.equal((await enviar(Buffer.from('não sou pdf'))).status, 415);
  assert.equal((await enviar(pdfMinimo(), { 'X-Revisao': 'versao2' })).status, 400);
  assert.equal((await enviar(pdfMinimo(), { 'X-Lacunas-Upload': '' })).status, 403);

  const r = await enviar(pdfMinimo());
  assert.equal(r.status, 200, await r.clone().text());
  const { id, pranchas } = await r.json();
  assert.deepEqual([id, pranchas], ['obra-r01', 1]);
  const pasta = path.join(dir, 'projetos', 'obra-r01');
  const projeto = JSON.parse(await readFile(path.join(pasta, 'projeto.json'), 'utf8'));
  assert.deepEqual(projeto.referencia, { largura: 468, altura: 331 });
  assert.equal(projeto.escala.metrosPorRef, 0.03175);
  await access(path.join(pasta, 'pranchas', projeto.pranchas[0].imagem));
  const texto = JSON.parse(await readFile(path.join(pasta, 'texto-pdf.json'), 'utf8'));
  assert.deepEqual(texto.pranchas[1].map((w) => w.texto), ['SALA', 'A']);
  assert.equal((await enviar(pdfMinimo())).status, 409, 'mesmo id não sobrescreve');

  const cmp = await (await fetch(`${base}/api/comparar?de=obra-r00&para=obra-r01`)).json();
  assert.equal(cmp.lacunas.resolvidasNaRevisao.length, 2);
});
