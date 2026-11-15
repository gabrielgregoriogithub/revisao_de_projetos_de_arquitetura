// Gera a versão estática (GitHub Pages) em docs/: o app roda no navegador, com o projeto de demonstração
// publicado (sem o PDF) e importação de PDFs pelo próprio usuário (PDF.js).
// Uso: node scripts/gerar-site.js [--projeto=<id>]   (padrão: todos os projetos de dados/projetos)
import { cp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { RAIZ, DADOS } from './comum.js';

const SAIDA = path.join(RAIZ, 'docs');
const LIB = ['nucleo-store.js', 'eap.js', 'eap-hierarquica.js', 'relatorios.js', 'armazenamento-nuvem.js'];
const DADOS_PUBLICOS = ['projeto.json', 'lacunas.json', 'texto-pdf.json', 'esquema.json'];

await rm(SAIDA, { recursive: true, force: true });
await mkdir(SAIDA, { recursive: true });

// 1. Front-end e núcleo compartilhado
await cp(path.join(RAIZ, 'public'), path.join(SAIDA, 'static'), { recursive: true, filter: (f) => path.basename(f) !== 'index.html' });
await cp(path.join(RAIZ, 'lib', 'dominio'), path.join(SAIDA, 'lib', 'dominio'), { recursive: true });
for (const f of LIB) await cp(path.join(RAIZ, 'lib', f), path.join(SAIDA, 'lib', f));

// 2. Projetos de demonstração (sem PDF, sem respostas/histórico locais)
const filtro = process.argv.find((a) => a.startsWith('--projeto='))?.split('=')[1];
const ids = (await readdir(path.join(DADOS, 'projetos'))).filter((id) => !filtro || id === filtro);
const indice = [];
for (const id of ids) {
  const origem = path.join(DADOS, 'projetos', id);
  const destino = path.join(SAIDA, 'dados', 'projetos', id);
  await mkdir(path.join(destino, 'pranchas'), { recursive: true });
  for (const f of DADOS_PUBLICOS) await cp(path.join(origem, f), path.join(destino, f)).catch(() => {});
  for (const f of await readdir(path.join(origem, 'pranchas'))) if (f.endsWith('.png')) await cp(path.join(origem, 'pranchas', f), path.join(destino, 'pranchas', f));
  const p = JSON.parse(await readFile(path.join(origem, 'projeto.json'), 'utf8'));
  indice.push({ id, nome: p.nome, etapa: p.etapa, revisao: p.revisao ?? null, obraId: p.obraId ?? id, analisadoEm: p.analisadoEm ?? null });
}
await writeFile(path.join(SAIDA, 'dados', 'projetos', 'indice.json'), `${JSON.stringify(indice, null, 2)}\n`);

// 3. index.html: caminhos relativos, import map e flag do modo estático
const html = (await readFile(path.join(RAIZ, 'public', 'index.html'), 'utf8'))
  .replaceAll('href="/static/', 'href="./static/')
  .replace('<script type="module" src="/static/app.js"></script>', `<script type="importmap">{ "imports": { "/dominio/": "./lib/dominio/" } }</script>
  <script>window.LACUNAS_ESTATICO = true;</script>
  <script type="module" src="./static/app.js"></script>`)
  .replace('<div class="app" id="app">', `<div class="aviso-publicado" id="aviso-publicado" role="note">
    <span><b>Versão publicada.</b> Sem login, o que você faz fica só neste navegador. Para salvar e compartilhar com a equipe,
    entre em <b>Projeto › Banco na nuvem</b>. XLSX e a análise automática pelo Claude Code exigem a versão local (<code>npm start</code>).</span>
    <button type="button" id="fechar-aviso" aria-label="Fechar aviso">×</button>
  </div>
  <div class="app" id="app">`);
await writeFile(path.join(SAIDA, 'index.html'), html);
await writeFile(path.join(SAIDA, 'static', 'aviso.js'), `// Aviso da versão publicada (some depois de fechado).
const aviso = document.getElementById('aviso-publicado');
try { if (localStorage.getItem('lacunas:aviso') === '1') aviso?.remove(); } catch { /* sem armazenamento */ }
document.getElementById('fechar-aviso')?.addEventListener('click', () => {
  aviso?.remove();
  try { localStorage.setItem('lacunas:aviso', '1'); } catch { /* sem armazenamento */ }
});
`);
await writeFile(path.join(SAIDA, 'index.html'), html.replace('<script type="module" src="./static/app.js"></script>', '<script type="module" src="./static/app.js"></script>\n  <script src="./static/aviso.js" defer></script>'));
await writeFile(path.join(SAIDA, '.nojekyll'), '');
// Banco compartilhado (Supabase): URL e chave anon são públicas por design — a proteção é o RLS do schema.sql.
const configNuvem = await readFile(path.join(RAIZ, 'nuvem.config.json'), 'utf8').catch(() => null);
if (configNuvem) {
  const c = JSON.parse(configNuvem);
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(c.url ?? '') || !String(c.chaveAnon ?? '').startsWith('eyJ')) throw new Error('nuvem.config.json inválido: use a Project URL (https://xxxx.supabase.co) e a chave "anon public".');
  if (JSON.parse(Buffer.from(c.chaveAnon.split('.')[1], 'base64url').toString()).role !== 'anon') throw new Error('nuvem.config.json: a chave NÃO é a "anon public". Nunca publique a service_role.');
  await writeFile(path.join(SAIDA, 'nuvem.config.json'), JSON.stringify({ url: c.url, chaveAnon: c.chaveAnon }, null, 2));
}
process.stdout.write(`Banco na nuvem: ${configNuvem ? 'configurado' : 'não configurado (sem nuvem.config.json)'}.
`);
process.stdout.write(`Site gerado em docs/ com ${indice.length} projeto(s): ${indice.map((p) => p.id).join(', ')}.\n`);
