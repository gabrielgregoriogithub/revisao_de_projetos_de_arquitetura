// Verifica a integridade de projeto.json + lacunas.json (IDs, pranchas, limites dos marcadores…).
// Uso: node scripts/validar.js [--projeto=<id>]   — sai com código 1 se houver erro.
import { projetoAlvo } from './comum.js';

const { id, store } = await projetoAlvo();
const { integridade, lacunas, ambientes } = await store.carregar();
const erros = integridade.filter((p) => p.nivel === 'erro');

process.stdout.write(`[${id}] ${lacunas.length} lacunas · ${ambientes.length} ambientes medidos · ${erros.length} erros · ${integridade.length - erros.length} avisos\n`);
for (const p of integridade) process.stdout.write(`  [${p.nivel}] ${p.lacuna ?? '—'}: ${p.mensagem}\n`);
process.exitCode = erros.length ? 1 : 0;
