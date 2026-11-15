// Gera a versão estática (GitHub Pages) em docs/: o app roda no navegador, com o projeto de demonstração
// publicado (sem o PDF) e importação de PDFs pelo próprio usuário (PDF.js).
// Uso: node scripts/gerar-site.js [--projeto=<id>]   (padrão: todos os projetos de dados/projetos)
import { cp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { RAIZ, DADOS } from './comum.js';

const SAIDA = path.join(RAIZ, 'docs');
const LIB = ['nucleo-store.js', 'eap.js', 'eap-hierarquica.js', 'relatorios.js'];
const DADOS_PUBLICOS = ['projeto.json', 'lacunas.json', 'texto-pdf.json', 'esquema.json'];

await rm(SAIDA, { recursive: true, force: true });
await mkdir(SAIDA, { recursive: true });

// 1. Front-end e núcleo compartilhado
await cp(path.join(RAIZ, 'public'), path.join(SAIDA, 'static'), { recursive: true });
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
    <span><b>Versão publicada (demonstração).</b> Tudo roda no seu navegador: respostas, medições e PDFs importados ficam só aqui.
    Upload de anexos no servidor, XLSX e a análise automática pelo Claude Code exigem a versão local (<code>npm start</code>).</span>
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
process.stdout.write(`Site gerado em docs/ com ${indice.length} projeto(s): ${indice.map((p) => p.id).join(', ')}.\n`);
