import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gerarEapCsv } from '../lib/eap.js';

const lacunas = [
  {
    id: 'L01', titulo: 'Banheiros', categoria: 'revestimento', onde: 'Prancha 03',
    campos: [{ chave: 'piso', rotulo: 'Piso' }, { chave: 'parede', rotulo: 'Parede' }],
    resposta: { status: 'respondida', campos: { piso: 'Porcelanato 60x60', parede: '' }, observacao: '' }
  },
  {
    id: 'L02', titulo: 'Copa; "sul"', categoria: 'piso', onde: 'x',
    campos: [{ chave: 'piso', rotulo: 'Piso' }],
    resposta: { status: 'pendente', campos: { piso: 'a definir' }, observacao: '' }
  },
  {
    id: 'L03', titulo: 'Aberta', categoria: 'piso', onde: 'x',
    campos: [{ chave: 'piso', rotulo: 'Piso' }],
    resposta: { status: 'aberta', campos: {}, observacao: '' }
  }
];

test('gera CSV com BOM, separador ; e uma linha por campo preenchido', () => {
  const csv = gerarEapCsv(lacunas);
  assert.ok(csv.startsWith('﻿'));
  const linhas = csv.slice(1).trim().split('\r\n');
  assert.equal(linhas[0], 'Código EAP;Grupo;Lacuna;Item;Especificação;Status;Origem');
  assert.equal(linhas.length, 1 + 2);
  assert.match(linhas[1], /^01\.01;Pisos;L01 – Banheiros;Piso;Porcelanato 60x60;respondida;Prancha 03$/);
  assert.match(linhas[2], /^01\.02;Pisos;/);
});

test('agrupa pela chave do campo e cai na categoria quando a chave é genérica', () => {
  const l = [{
    id: 'L09', titulo: 'Ilum', categoria: 'iluminacao', onde: 'x',
    campos: [{ chave: 'modelo', rotulo: 'Modelo' }, { chave: 'parede', rotulo: 'Parede' }],
    resposta: { status: 'respondida', campos: { modelo: 'Linear LED', parede: 'Pintura' }, observacao: '' }
  }];
  const linhas = gerarEapCsv(l).slice(1).trim().split('\r\n');
  assert.match(linhas[1], /^02\.01;Revestimentos de parede;/);
  assert.match(linhas[2], /^04\.01;Iluminação;/);
});

test('escapa aspas e separador', () => {
  const csv = gerarEapCsv(lacunas);
  assert.ok(csv.includes('"L02 – Copa; ""sul"""'));
});

test('neutraliza injeção de fórmula no Excel', () => {
  const l = [{ ...lacunas[0], resposta: { status: 'respondida', campos: { piso: '=HYPERLINK("x")' }, observacao: '' } }];
  const csv = gerarEapCsv(l);
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`));
});
