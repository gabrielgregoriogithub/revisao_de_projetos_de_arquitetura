import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { montarEap, eapParaCsv } from '../lib/eap-hierarquica.js';
import { criarXlsx, crc32 } from '../lib/xlsx.js';
import { gerarRelatorio, esc } from '../lib/relatorios.js';
import { normalizarLacuna } from '../lib/dominio/lacunas.js';

const projeto = {
  nome: 'Obra <X>', etapa: 'EP', arquivo: 'a.pdf', referencia: { largura: 100, altura: 100 },
  pranchas: [{ numero: 1, folha: '01', titulo: 'Planta', imagem: 'p1.png' }]
};
const lac = (id, extra, resposta) => ({
  ...normalizarLacuna({ id, titulo: id, categoria: 'revestimento', prioridade: 'alta', onde: 'o', problema: 'p', pergunta: 'q', impacto: 'i',
    campos: [{ chave: 'piso', rotulo: 'Piso' }, { chave: 'parede', rotulo: 'Parede' }],
    marcadores: [{ prancha: 1, x: 10, y: 10, w: 10, h: 10 }], ...extra }),
  resposta: { status: 'aberta', campos: {}, ...resposta }
});

test('EAP hierárquica: disciplina › ambiente › grupo › serviço, só com status incluídos', () => {
  const ls = [
    lac('L01', { ambientes: ['Banheiros'] }, { status: 'validada', campos: { piso: 'Porcelanato', parede: 'Cerâmica' } }),
    lac('L02', { ambientes: ['Copa'] }, { status: 'pendente', campos: { piso: 'Vinílico' } })
  ];
  const linhas = montarEap(projeto, ls);
  assert.deepEqual(linhas.map((l) => [l.codigo, l.tipo]), [
    ['0', 'projeto'], ['01', 'disciplina'], ['01.01', 'ambiente'], ['01.01.01', 'grupo'], ['01.01.01.01', 'servico'],
    ['01.01.02', 'grupo'], ['01.01.02.01', 'servico']
  ]);
  assert.equal(linhas[4].descricao, 'Piso: Porcelanato');
  assert.equal(linhas[4].statusEspecificacao, 'Validada');
  assert.equal(montarEap(projeto, ls, { incluir: ['pendente'] }).filter((l) => l.tipo === 'servico').length, 1);
});

test('EAP não inventa quantidade: só preenche quando a lacuna gera um único serviço', () => {
  const imp = { impactoFinanceiro: { unidade: 'm²', quantidade: 20, custoUnitario: 50 } };
  const unico = montarEap(projeto, [lac('L01', imp, { status: 'respondida', campos: { piso: 'X' } })]).find((l) => l.tipo === 'servico');
  assert.equal(unico.custoTotal, 1000);
  const varios = montarEap(projeto, [lac('L01', imp, { status: 'respondida', campos: { piso: 'X', parede: 'Y' } })]).filter((l) => l.tipo === 'servico');
  assert.ok(varios.every((l) => l.quantidade === null && l.custoTotal === null));
  assert.match(varios[0].observacoes, /não distribuído/);
});

test('CSV da EAP respeita seleção de colunas e formato pt-BR', () => {
  const linhas = montarEap(projeto, [lac('L01', { impactoFinanceiro: { quantidade: 2.5, custoUnitario: 10 } }, { status: 'respondida', campos: { piso: 'X' } })]);
  const csv = eapParaCsv(linhas, ['codigo', 'descricao', 'quantidade']);
  const [cab, , , , , serv] = csv.slice(1).trim().split('\r\n');
  assert.equal(cab, 'Código EAP;Descrição;Quantidade');
  assert.equal(serv, '01.01.01.01;Piso: X;2,5');
});

/** Lê um ZIP (método store) e devolve {nome: conteúdo}. */
function lerZip(buf) {
  const arquivos = {};
  let p = 0;
  while (buf.readUInt32LE(p) === 0x04034b50) {
    const metodo = buf.readUInt16LE(p + 8);
    const crc = buf.readUInt32LE(p + 14);
    const tam = buf.readUInt32LE(p + 18);
    const nl = buf.readUInt16LE(p + 26);
    const nome = buf.subarray(p + 30, p + 30 + nl).toString();
    const raw = buf.subarray(p + 30 + nl, p + 30 + nl + tam);
    const dados = metodo === 8 ? inflateRawSync(raw) : raw;
    assert.equal(crc32(dados), crc, `CRC de ${nome}`);
    arquivos[nome] = dados.toString('utf8');
    p += 30 + nl + tam;
  }
  assert.equal(buf.readUInt32LE(buf.length - 22), 0x06054b50, 'fim do diretório central');
  return arquivos;
}

test('XLSX é um pacote OOXML válido com CRC correto e texto escapado', () => {
  const buf = criarXlsx([{ nome: 'EAP', titulo: 'T', colunas: [{ chave: 'a', rotulo: 'A' }, { chave: 'v', rotulo: 'V', tipo: 'moeda' }], linhas: [{ a: 'x < y & "z"', v: 12.5 }] }]);
  const z = lerZip(buf);
  for (const nome of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']) assert.ok(z[nome], nome);
  assert.match(z['xl/worksheets/sheet1.xml'], /x &lt; y &amp; &quot;z&quot;/);
  assert.match(z['xl/worksheets/sheet1.xml'], /<c r="B4" s="2"><v>12.5<\/v><\/c>/);
});

test('relatórios escapam conteúdo e trazem ressalva e recorte da prancha', () => {
  const ls = [lac('L01', { titulo: '<script>alert(1)</script>' })];
  const html = gerarRelatorio('abertas', { projeto, lacunas: ls, eventos: [] });
  assert.ok(!html.includes('<script>alert'));
  assert.ok(html.includes(esc('<script>alert(1)</script>')));
  assert.match(html, /Obra &lt;X&gt;/);
  assert.match(html, /não conclusões técnicas/);
  assert.match(html, /background-image:url\('\/pranchas\/p1\.png'\)/);
  assert.ok(!gerarRelatorio('abertas', { projeto, lacunas: ls, eventos: [] }, { recortes: false }).includes('class="recorte"'));
  assert.equal(gerarRelatorio('inexistente', { projeto, lacunas: ls, eventos: [] }), null);
});

test('todos os relatórios renderizam com dados mínimos', () => {
  const ls = [lac('L01', {}, { status: 'validada', campos: { piso: 'X' }, evidencias: [{ tipo: 'email', descricao: 'ok' }], atualizadoEm: '2026-11-15T10:00:00Z' })];
  for (const tipo of ['executivo', 'abertas', 'disciplinas', 'inconsistencias', 'respostas', 'riscos', 'evolucao', 'especificacoes']) {
    const html = gerarRelatorio(tipo, { projeto, lacunas: ls, eventos: [] });
    assert.match(html, /<main class="folha">/, tipo);
  }
});
