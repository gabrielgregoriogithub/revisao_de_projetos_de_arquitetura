import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sugerirRespostas } from '../lib/dominio/sugestoes.js';
import { normalizarLacuna } from '../lib/dominio/lacunas.js';

const projeto = { pranchas: [{ numero: 1, folha: '01', titulo: 'Layout' }, { numero: 2, folha: '03', titulo: 'Acabamentos' }, { numero: 3, folha: '03', titulo: 'Elétrica' }] };
const lac = (id, extra = {}, resposta = {}) => ({
  ...normalizarLacuna({ id, titulo: id, categoria: 'piso', prioridade: 'media', problema: 'p', pergunta: 'q', campos: [{ chave: 'piso', rotulo: 'Piso' }], marcadores: [], ...extra }),
  resposta: { status: 'aberta', campos: {}, ...resposta }
});

test('folhas repetidas: sugere renumeração e aponta a folha faltante', () => {
  const s = sugerirRespostas(projeto, [lac('L13', { categoria: 'documentacao', titulo: 'Numeração de folhas repetida', campos: [{ chave: 'resposta', rotulo: 'Esclarecimento' }] })]);
  assert.equal(s.L13[0].regra, 'folhas');
  assert.equal(s.L13[0].confianca, 'alta');
  assert.match(s.L13[0].campos.resposta, /PDF p\.2 \(Acabamentos\) → folha 02/);
  assert.match(s.L13[0].justificativa, /Folha 03 .* não existe folha 02/);
  assert.deepEqual(sugerirRespostas({ pranchas: [{ numero: 1, folha: '01' }, { numero: 2, folha: '02' }] }, [lac('L13', { categoria: 'documentacao', titulo: 'folhas', campos: [{ chave: 'resposta', rotulo: 'R' }] })]), {});
});

test('consistência: reaproveita resposta do mesmo ambiente ou relacionada; confiança pela validação', () => {
  const ls = [
    lac('L05', { ambientes: ['Copa norte'] }),
    lac('L06', { ambientes: ['Salas de reunião'], relacionadas: ['L05'] }, { status: 'validada', campos: { piso: 'Vinílico Tarkett ID Square' } }),
    lac('L03', { ambientes: ['copa norte'] }, { status: 'respondida', campos: { piso: 'Porcelanato 60x60' } }),
    lac('L09', { ambientes: ['Hall'] })
  ];
  const s = sugerirRespostas(projeto, ls);
  assert.deepEqual(s.L05.filter((x) => x.regra === 'consistencia').map((x) => [x.fonte.slice(0, 15), x.confianca, x.campos.piso]), [
    ['Resposta da L06', 'alta', 'Vinílico Tarkett ID Square'],
    ['Resposta da L03', 'media', 'Porcelanato 60x60']
  ]);
  assert.equal(s.L09, undefined, 'sem relação nem ambiente comum: nada sugerido');
  assert.equal(s.L06, undefined, 'lacuna já respondida não recebe sugestão');
});

test('área molhada: recomendação de confiança baixa só para campos vazios e ambientes molhados', () => {
  const campos = [{ chave: 'piso', rotulo: 'Piso' }, { chave: 'parede', rotulo: 'Revestimento da bancada' }, { chave: 'altura', rotulo: 'Altura' }];
  const s = sugerirRespostas(projeto, [
    lac('L01', { ambientes: ['Banheiros'], campos }, { status: 'pendente', campos: { piso: 'já informado' } }),
    lac('L04', { ambientes: ['Áreas de staff'], campos }),
    lac('L09', { ambientes: ['Halls dos banheiros'], campos })
  ]);
  assert.equal(s.L09, undefined, 'hall de banheiro não é área molhada');
  assert.equal(s.L01[0].tipo, 'recomendacao');
  assert.equal(s.L01[0].confianca, 'baixa');
  assert.deepEqual(Object.keys(s.L01[0].campos), ['parede', 'altura'], 'não sobrescreve o que já foi preenchido');
  assert.match(s.L01[0].campos.parede, /bancada/);
  assert.match(s.L01[0].justificativa, /Não é a especificação do projeto/);
  assert.equal(s.L04, undefined);
});

test('quantidade já levantada vira sugestão com a origem', () => {
  const s = sugerirRespostas(projeto, [lac('L16', {
    campos: [{ chave: 'quantidade', rotulo: 'Quantidade' }],
    impactoFinanceiro: { quantidade: 7, unidade: 'un', origemQuantidade: 'Legenda da prancha 3' }
  })]);
  assert.deepEqual([s.L16[0].campos.quantidade, s.L16[0].fonte], ['7 un', 'Legenda da prancha 3']);
});
