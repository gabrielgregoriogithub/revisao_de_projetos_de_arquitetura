// Catálogo de projetos: cada projeto (ou revisão de um projeto) vive em dados/projetos/<id>/.
// Modo legado: se dados/ contém projeto.json diretamente, há um único projeto ("padrao").
import { readFile, writeFile, readdir, rename, access } from 'node:fs/promises';
import path from 'node:path';
import { criarStore } from './store.js';

export const ID_PROJETO = /^[a-z0-9][a-z0-9-]{0,62}$/;

const existe = async (p) => access(p).then(() => true, () => false);
const lerJson = async (p, padrao) => {
  try { return JSON.parse(await readFile(p, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return padrao; throw e; }
};

/** @param {string} dadosDir */
export function criarCatalogo(dadosDir) {
  const stores = new Map();
  let modo = null;

  async function detectarModo() {
    if (!modo) modo = (await existe(path.join(dadosDir, 'projeto.json'))) ? 'unico' : 'multi';
    return modo;
  }

  async function dir(id) {
    if ((await detectarModo()) === 'unico') return dadosDir;
    if (!ID_PROJETO.test(id ?? '')) throw Object.assign(new Error('Projeto inválido.'), { codigo: 400 });
    return path.join(dadosDir, 'projetos', id);
  }

  async function listar() {
    if ((await detectarModo()) === 'unico') {
      const p = await lerJson(path.join(dadosDir, 'projeto.json'), {});
      return [{ id: 'padrao', nome: p.nome, etapa: p.etapa, revisao: p.revisao ?? null, obraId: p.obraId ?? 'padrao', analisadoEm: p.analisadoEm }];
    }
    const base = path.join(dadosDir, 'projetos');
    const nomes = await readdir(base).catch(() => []);
    const lista = [];
    for (const id of nomes.filter((n) => ID_PROJETO.test(n)).sort()) {
      const p = await lerJson(path.join(base, id, 'projeto.json'), null);
      if (p) lista.push({ id, nome: p.nome, etapa: p.etapa, revisao: p.revisao ?? null, obraId: p.obraId ?? id, analisadoEm: p.analisadoEm });
    }
    return lista;
  }

  async function ativo() {
    const lista = await listar();
    if (!lista.length) throw Object.assign(new Error('Nenhum projeto em dados/projetos/.'), { codigo: 404 });
    if (modo === 'unico') return lista[0].id;
    const cfg = await lerJson(path.join(dadosDir, 'config.json'), {});
    return lista.some((p) => p.id === cfg.projetoAtivo) ? cfg.projetoAtivo : lista[0].id;
  }

  async function definirAtivo(id) {
    const lista = await listar();
    if (!lista.some((p) => p.id === id)) throw Object.assign(new Error(`Projeto ${id} não encontrado.`), { codigo: 404 });
    if (modo === 'unico') return id;
    const cfg = await lerJson(path.join(dadosDir, 'config.json'), {});
    const tmp = path.join(dadosDir, `config.json.${process.pid}.tmp`);
    await writeFile(tmp, `${JSON.stringify({ ...cfg, projetoAtivo: id }, null, 2)}\n`);
    await rename(tmp, path.join(dadosDir, 'config.json'));
    return id;
  }

  async function store(id) {
    const d = await dir(id);
    if (!stores.has(d)) {
      if (!(await existe(path.join(d, 'projeto.json')))) throw Object.assign(new Error(`Projeto ${id} não encontrado.`), { codigo: 404 });
      stores.set(d, criarStore(d));
    }
    return stores.get(d);
  }

  return { listar, ativo, definirAtivo, store, dir, modo: detectarModo };
}
