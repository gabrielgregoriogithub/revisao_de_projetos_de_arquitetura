// Adaptador de nuvem testado com um cliente Supabase simulado que imita a função gravar_arquivo (compare-and-swap).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adaptadorNuvem, ConflitoNuvem } from '../lib/armazenamento-nuvem.js';
import { criarNucleo } from '../lib/nucleo-store.js';

/** Banco simulado compartilhado (como o Supabase de verdade, visto por vários usuários). */
function bancoSimulado() {
  const linhas = new Map(); // `${projeto}|${nome}` → { dados, versao }
  const objetos = new Set();
  const consulta = () => {
    const filtros = {};
    const q = {
      select: () => q,
      eq: (c, v) => { filtros[c] = v; return q; },
      in: (c, vs) => { filtros[`${c}_in`] = vs; return q; },
      maybeSingle: async () => {
        const l = linhas.get(`${filtros.projeto_id}|${filtros.nome}`);
        return { data: l ? structuredClone(l) : null, error: null };
      },
      then: (res) => res({ data: [...linhas].filter(([k]) => k.startsWith(`${filtros.projeto_id}|`) && filtros.nome_in.includes(k.split('|')[1]))
        .map(([k, v]) => ({ nome: k.split('|')[1], versao: v.versao })), error: null })
    };
    return q;
  };
  return {
    linhas,
    cliente: () => ({
      from: () => consulta(),
      rpc: async (_f, { p_projeto, p_nome, p_dados, p_versao }) => {
        const k = `${p_projeto}|${p_nome}`;
        const atual = linhas.get(k);
        if (p_versao === null ? atual : atual?.versao !== p_versao) return { data: null, error: { message: 'conflito_de_versao' } };
        const versao = (atual?.versao ?? 0) + 1;
        linhas.set(k, { dados: structuredClone(p_dados), versao });
        return { data: versao, error: null };
      },
      storage: { from: () => ({ list: async (pasta, { search }) => ({ data: [...objetos].filter((o) => o === `${pasta}/${search}`).map(() => ({ name: search })), error: null }) }) }
    }),
    objetos
  };
}

const projeto = { referencia: { largura: 100, altura: 100 }, pranchas: [{ numero: 1 }] };
const LACUNA = { id: 'L01', titulo: 'T', categoria: 'piso', problema: 'p', pergunta: 'q', campos: [{ chave: 'piso', rotulo: 'Piso' }], marcadores: [] };

async function semear(banco) {
  const a = adaptadorNuvem(banco.cliente(), 'obra-x');
  await a.ler('projeto.json', null); await a.gravar('projeto.json', projeto);
  await a.ler('lacunas.json', null); await a.gravar('lacunas.json', [LACUNA, { ...LACUNA, id: 'L02' }]);
}

test('nuvem: o núcleo inteiro funciona sobre o adaptador (workflow e histórico)', async () => {
  const banco = bancoSimulado();
  await semear(banco);
  const s = criarNucleo(adaptadorNuvem(banco.cliente(), 'obra-x'));
  const r = await s.salvarResposta('L01', { status: 'respondida', campos: { piso: 'Porcelanato' } }, { autor: 'ana@x.com' });
  assert.equal(r.ok, true);
  const d = await s.carregar();
  assert.equal(d.lacunas[0].resposta.campos.piso, 'Porcelanato');
  assert.equal(d.eventos.at(-1).autor, 'ana@x.com');
});

test('nuvem: duas pessoas salvando ao mesmo tempo → a segunda recebe conflito (nada é sobrescrito)', async () => {
  const banco = bancoSimulado();
  await semear(banco);
  const ana = adaptadorNuvem(banco.cliente(), 'obra-x');
  const bruno = adaptadorNuvem(banco.cliente(), 'obra-x');
  const respAna = await ana.ler('respostas.json', {});
  const respBruno = await bruno.ler('respostas.json', {});
  await ana.gravar('respostas.json', { ...respAna, L01: { status: 'respondida' } });
  await assert.rejects(() => bruno.gravar('respostas.json', { ...respBruno, L02: { status: 'pendente' } }), (e) => e instanceof ConflitoNuvem && e.codigo === 409);
  assert.deepEqual(Object.keys(banco.linhas.get('obra-x|respostas.json').dados), ['L01'], 'a gravação da Ana foi preservada');
  // Depois de recarregar, o Bruno grava normalmente por cima da versão nova.
  const recarregado = await bruno.ler('respostas.json', {});
  await bruno.gravar('respostas.json', { ...recarregado, L02: { status: 'pendente' } });
  assert.deepEqual(Object.keys(banco.linhas.get('obra-x|respostas.json').dados).sort(), ['L01', 'L02']);
});

test('nuvem: versão muda quando alguém grava (detecção de alterações de outros usuários)', async () => {
  const banco = bancoSimulado();
  await semear(banco);
  const a = adaptadorNuvem(banco.cliente(), 'obra-x');
  const v1 = await a.versao(['projeto.json', 'lacunas.json', 'respostas.json']);
  const b = adaptadorNuvem(banco.cliente(), 'obra-x');
  await b.ler('respostas.json', {}); await b.gravar('respostas.json', { L01: {} });
  assert.notEqual(await a.versao(['projeto.json', 'lacunas.json', 'respostas.json']), v1);
});

test('nuvem: backup com nome válido no banco e anexo verificado no armazenamento', async () => {
  const banco = bancoSimulado();
  await semear(banco);
  const a = adaptadorNuvem(banco.cliente(), 'obra-x');
  const destino = await a.backup('lacunas.json');
  assert.match(destino, /^backups\/lacunas-[0-9t-]+z\.json$/);
  assert.ok(/^[a-z0-9][a-z0-9/._-]{0,119}$/.test(destino), 'respeita o CHECK da coluna nome');
  banco.objetos.add('obra-x/anexos/abc.pdf');
  assert.equal(await a.anexoExiste('abc.pdf'), true);
  assert.equal(await a.anexoExiste('zzz.pdf'), false);
});

test('configuração da nuvem: aceita só chaves públicas e recusa as secretas', async () => {
  const { validarConfigNuvem } = await import('../lib/config-nuvem.js');
  const jwt = (role) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.assinatura`;
  assert.deepEqual(validarConfigNuvem({ url: 'https://abcd.supabase.co/rest/v1/', chaveAnon: 'sb_publishable_AbC123xyz_456' }),
    { url: 'https://abcd.supabase.co', chaveAnon: 'sb_publishable_AbC123xyz_456' }, 'normaliza a URL vinda do /rest/v1/');
  assert.equal(validarConfigNuvem({ url: 'https://abcd.supabase.co', chaveAnon: jwt('anon') }).url, 'https://abcd.supabase.co');
  assert.throws(() => validarConfigNuvem({ url: 'https://abcd.supabase.co', chaveAnon: 'sb_secret_qualquercoisa123' }), /SECRETA/);
  assert.throws(() => validarConfigNuvem({ url: 'https://abcd.supabase.co', chaveAnon: jwt('service_role') }), /service_role/);
  assert.throws(() => validarConfigNuvem({ url: 'https://evil.example.com', chaveAnon: 'sb_publishable_AbC123xyz_456' }), /Project URL/);
  assert.throws(() => validarConfigNuvem({ url: 'https://abcd.supabase.co', chaveAnon: 'qualquer' }), /Publishable/);
});
