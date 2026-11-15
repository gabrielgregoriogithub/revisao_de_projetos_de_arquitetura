// Adaptador de armazenamento na nuvem (Supabase) para o núcleo compartilhado.
// Mesma interface dos adaptadores de disco e IndexedDB: ler, gravar, backup, versao, anexoExiste.
// Gravação com controle de versão: o servidor recusa ("conflito_de_versao") se outra pessoa gravou antes.

export const BUCKET = 'lacunas';
const nomeSeguro = (n) => n.toLowerCase().replace(/[^a-z0-9/._-]/g, '-');

export class ConflitoNuvem extends Error {
  constructor() {
    super('Outra pessoa salvou este projeto ao mesmo tempo. Os dados serão recarregados: confira e refaça a última alteração.');
    this.codigo = 409;
  }
}

function falhaNuvem(acao, erro) {
  const msg = erro?.message ?? String(erro);
  if (/conflito_de_versao/.test(msg)) return new ConflitoNuvem();
  if (/JWT|not authorized|permission|row-level security|violates/i.test(msg)) {
    return Object.assign(new Error(`Sem permissão para ${acao}. Verifique se você entrou com o e-mail convidado e se seu papel permite editar.`), { codigo: 403 });
  }
  return Object.assign(new Error(`Falha na nuvem ao ${acao}: ${msg}`), { codigo: 502 });
}

/**
 * @param {object} cliente cliente do Supabase (supabase-js v2)
 * @param {string} projetoId
 */
export function adaptadorNuvem(cliente, projetoId) {
  const versoes = new Map(); // nome → versão lida por último (usada no compare-and-swap)

  async function ler(nome, padrao) {
    const { data, error } = await cliente.from('arquivos').select('dados, versao').eq('projeto_id', projetoId).eq('nome', nomeSeguro(nome)).maybeSingle();
    if (error) throw falhaNuvem(`ler ${nome}`, error);
    if (!data) {
      versoes.set(nome, null);
      if (padrao !== undefined) return padrao;
      throw new Error(`Falha ao ler ${nome}: não existe na nuvem.`);
    }
    versoes.set(nome, data.versao);
    return data.dados;
  }

  async function gravar(nome, dados) {
    const esperada = versoes.has(nome) ? versoes.get(nome) : null;
    const { data, error } = await cliente.rpc('gravar_arquivo', { p_projeto: projetoId, p_nome: nomeSeguro(nome), p_dados: dados, p_versao: esperada });
    if (error) {
      versoes.delete(nome);
      throw falhaNuvem(`gravar ${nome}`, error);
    }
    versoes.set(nome, data);
  }

  return {
    ler,
    gravar,
    async backup(nome) {
      const atual = await ler(nome, null);
      if (atual === null) return null;
      const destino = `backups/${nome.replace('.json', '')}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`.toLowerCase();
      await gravar(destino, atual);
      return destino;
    },
    async versao(nomes) {
      const { data, error } = await cliente.from('arquivos').select('nome, versao').eq('projeto_id', projetoId).in('nome', nomes.map(nomeSeguro));
      if (error) throw falhaNuvem('verificar atualizações', error);
      const mapa = new Map((data ?? []).map((r) => [r.nome, r.versao]));
      return nomes.map((n) => mapa.get(nomeSeguro(n)) ?? 0).join('|');
    },
    async anexoExiste(id) {
      const { data, error } = await cliente.storage.from(BUCKET).list(`${projetoId}/anexos`, { search: id, limit: 1 });
      if (error) throw falhaNuvem('verificar anexo', error);
      return (data ?? []).some((o) => o.name === id);
    }
  };
}
