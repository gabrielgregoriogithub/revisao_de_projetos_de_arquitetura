// Protocolo "processe as respostas das lacunas" — parte determinística.
// Uso: node scripts/processar.js            (prévia, não altera nada)
//      node scripts/processar.js --aplicar  (backup + aplica as transições com origem "claude")
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { processarRespostas } from '../lib/dominio/processamento.js';
import { projetoAlvo, RAIZ } from './comum.js';

const aplicar = process.argv.includes('--aplicar');
const { store, dir: dados } = await projetoAlvo();
const { lacunas } = await store.carregar();
const resultado = processarRespostas(lacunas);
const relatorio = { em: new Date().toISOString(), modo: aplicar ? 'aplicado' : 'previa', ...resultado };

if (aplicar && resultado.acoes.length) {
  relatorio.aplicacao = await store.aplicarProcessamento(resultado.acoes, { autor: 'Claude Code' });
}

const pasta = path.join(dados, 'processamentos');
await mkdir(pasta, { recursive: true });
const arquivo = path.join(pasta, `${relatorio.em.replace(/[:.]/g, '-')}-${relatorio.modo}.json`);
await writeFile(arquivo, `${JSON.stringify(relatorio, null, 2)}\n`, 'utf8');

const { resumo } = resultado;
process.stdout.write([
  `Processamento (${relatorio.modo}): ${resumo.analisadas} respostas analisadas`,
  `  → em validação técnica: ${resumo.paraValidacao}`,
  `  → reabertas por incompletude: ${resumo.reabertas}`,
  `  → contradições a revisar: ${resumo.contradicoes}`,
  ...resultado.acoes.map((a) => `  ${a.lacuna}: ${a.de} → ${a.para} — ${a.motivo}`),
  ...resultado.contradicoes.map((c) => `  ! ${c.lacunas.join(' × ')} (${c.campo}, ${c.ambientes.join(', ')}): "${c.valores[0]}" ≠ "${c.valores[1]}"`),
  ...(relatorio.aplicacao ?? []).filter((r) => !r.ok).map((r) => `  ✖ ${r.lacuna}: ${r.erro}`),
  `Relatório: ${path.relative(RAIZ, arquivo)}`,
  ''
].join('\n'));
