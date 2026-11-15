// Armazenamento do modo estático (GitHub Pages): IndexedDB, com os arquivos publicados como base somente leitura.

const BANCO = 'lacunas-obra';
let conexao = null;

function abrir() {
  conexao ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(BANCO, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error('IndexedDB indisponível neste navegador (modo privado?).'));
  });
  return conexao;
}

async function operar(modo, fn) {
  const db = await abrir();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', modo);
    const req = fn(tx.objectStore('kv'));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error ?? new Error('Falha no IndexedDB.'));
    tx.onabort = () => reject(tx.error ?? new Error('Gravação cancelada (cota de armazenamento?).'));
  });
}

export const kv = {
  ler: (chave) => operar('readonly', (s) => s.get(chave)),
  gravar: (chave, valor) => operar('readwrite', (s) => s.put(valor, chave)),
  apagar: (chave) => operar('readwrite', (s) => s.delete(chave)),
  chaves: (prefixo) => operar('readonly', (s) => s.getAllKeys(IDBKeyRange.bound(prefixo, `${prefixo}￿`)))
};

/**
 * Adaptador para o núcleo do store (mesma interface do adaptador de disco).
 * @param {string} id projeto
 * @param {string|null} base URL da pasta publicada do projeto (projetos de demonstração), ou null
 */
export function adaptadorNavegador(id, base) {
  const chave = (nome) => `p:${id}:${nome}`;
  return {
    async ler(nome, padrao) {
      const salvo = await kv.ler(chave(nome));
      if (salvo !== undefined) return salvo;
      if (base) {
        const r = await fetch(new URL(nome, base)).catch(() => null);
        if (r?.ok) return r.json();
      }
      if (padrao !== undefined) return padrao;
      throw new Error(`Falha ao ler ${nome}.`);
    },
    async gravar(nome, dados) {
      await kv.gravar(chave(nome), JSON.parse(JSON.stringify(dados)));
      await kv.gravar(chave('#versao'), ((await kv.ler(chave('#versao'))) ?? 0) + 1);
    },
    async backup(nome) {
      const atual = await this.ler(nome, null);
      if (atual === null) return null;
      const destino = `backups/${nome.replace('.json', '')}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      await kv.gravar(chave(destino), atual);
      return destino;
    },
    versao: async () => String((await kv.ler(chave('#versao'))) ?? 0),
    anexoExiste: async (aid) => (await kv.ler(`b:${id}:anexos/${aid}`)) !== undefined
  };
}
