// Migra dados/ do modo "projeto único" para dados/projetos/<id>/ (vários projetos/revisões).
// Uso: node scripts/migrar-projetos.js <id>   ex.: loft-osasco-r00
// Faz uma cópia completa de segurança em dados-backup-<carimbo>/ antes de mover.
import { cp, mkdir, readdir, rename, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { DADOS } from './comum.js';
import { ID_PROJETO } from '../lib/projetos.js';

const id = process.argv[2];
if (!ID_PROJETO.test(id ?? '')) {
  process.stderr.write('Informe um id válido (minúsculas, números e hífen), ex.: loft-osasco-r00\n');
  process.exit(1);
}
const temUnico = await access(path.join(DADOS, 'projeto.json')).then(() => true, () => false);
if (!temUnico) {
  process.stdout.write('Nada a migrar: dados/ já está no modo de vários projetos.\n');
  process.exit(0);
}

const copia = `${DADOS}-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
await cp(DADOS, copia, { recursive: true });

const destino = path.join(DADOS, 'projetos', id);
await mkdir(destino, { recursive: true });
for (const nome of await readdir(DADOS)) {
  if (nome === 'projetos') continue;
  await rename(path.join(DADOS, nome), path.join(destino, nome));
}
const projeto = JSON.parse(await readFile(path.join(destino, 'projeto.json'), 'utf8'));
const revisao = projeto.revisao ?? (projeto.etapa?.match(/R\d{2}/)?.[0] ?? null);
await writeFile(path.join(destino, 'projeto.json'), `${JSON.stringify({ ...projeto, revisao, obraId: projeto.obraId ?? id.replace(/-r\d{2}$/, '') }, null, 2)}\n`);
await writeFile(path.join(DADOS, 'config.json'), `${JSON.stringify({ projetoAtivo: id }, null, 2)}\n`);
process.stdout.write(`Migrado para dados/projetos/${id}/ (cópia de segurança em ${path.basename(copia)}/).\n`);
