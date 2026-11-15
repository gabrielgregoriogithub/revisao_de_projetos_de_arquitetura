// Cliente da API. Servidor local (npm start) ou modo estático (GitHub Pages), com o mesmo contrato.

/** Modo estático: definido pelo index.html publicado (window.LACUNAS_ESTATICO = true). */
export const ESTATICO = globalThis.LACUNAS_ESTATICO === true;
const local = ESTATICO ? await import('./estatico/api-local.js') : null;
let projetoAtual = null;
export const definirProjetoAtual = (id) => { projetoAtual = id; };

/** URL da imagem de uma prancha (do projeto ativo, ou de outro projeto — usado na comparação de revisões). */
export function urlPrancha(arquivo, projetoId = null) {
  if (local) return local.urlPrancha(arquivo, projetoId ?? projetoAtual);
  // URL com o id do projeto: revisões diferentes nunca compartilham cache de imagem.
  const id = projetoId ?? projetoAtual;
  return id ? `/p/${encodeURIComponent(id)}/pranchas/${encodeURIComponent(arquivo)}` : `/pranchas/${encodeURIComponent(arquivo)}`;
}
/** Funções da nuvem (só na versão publicada; null na versão local, que grava no disco). */
export const nuvem = local ? {
  estado: () => local.estadoNuvem(), entrar: (e) => local.entrarNuvem(e), sair: () => local.sairNuvem(),
  enviarProjeto: (id, progresso) => local.enviarParaNuvem(id, progresso),
  membros: (id) => local.membrosNuvem(id), adicionarMembro: (id, e, p) => local.adicionarMembroNuvem(id, e, p), removerMembro: (id, e) => local.removerMembroNuvem(id, e)
} : null;

export const urlAnexo = (id) => (local ? local.urlAnexo(id) : `/anexos/${encodeURIComponent(id)}`);

function baixarBlob(conteudo, nome, tipo) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/** Exportações: no servidor, baixa a rota; no modo estático, gera o arquivo no navegador. */
export async function baixar(tipo, qs = '') {
  const rotas = { csv: ['/api/eap.csv', 'eap-lacunas.csv'], hierarquica: ['/api/eap-hierarquica.csv', 'eap-hierarquica.csv'], xlsx: ['/api/eap.xlsx', 'eap-lacunas.xlsx'] };
  const [rota, nome] = rotas[tipo];
  if (!local) {
    const a = Object.assign(document.createElement('a'), { href: `${rota}${qs ? `?${qs}` : ''}`, download: nome });
    document.body.append(a); a.click(); a.remove();
    return;
  }
  if (tipo === 'xlsx') throw new Error('XLSX só na versão local (npm start). Na versão publicada, use o CSV.');
  const { projeto, lacunas, ambientes } = await local.dadosAtivos();
  const p = new URLSearchParams(qs);
  if (tipo === 'csv') {
    const { gerarEapCsv } = await import('../lib/eap.js');
    baixarBlob(gerarEapCsv(lacunas), nome, 'text/csv;charset=utf-8');
  } else {
    const { montarEap, eapParaCsv, COLUNAS_EAP } = await import('../lib/eap-hierarquica.js');
    const linhas = montarEap(projeto, lacunas, { incluir: p.get('incluir')?.split(',') ?? undefined, ambientes });
    baixarBlob(eapParaCsv(linhas, p.get('colunas')?.split(',') ?? COLUNAS_EAP.map(([k]) => k)), nome, 'text/csv;charset=utf-8');
  }
}

/** Abre um relatório: rota do servidor, ou HTML gerado no navegador. */
export async function abrirRelatorio(tipo, { recortes = true } = {}) {
  if (!local) { window.open(`/relatorios/${tipo}${recortes ? '' : '?recortes=0'}`, '_blank', 'noopener'); return; }
  const janela = window.open('', '_blank');
  const { gerarRelatorio } = await import('../lib/relatorios.js');
  const html = gerarRelatorio(tipo, await local.dadosAtivos(), { recortes, base: new URL('./', document.baseURI).href, urlPrancha: (img) => urlPrancha(img) });
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  if (janela) janela.location = url; else window.location = url;
}

async function chamar(url, opcoes = {}) {
  if (local) {
    try { return await local.chamar(url, opcoes); } catch (e) { throw Object.assign(new Error(e.message), { codigo: e.codigo ?? 500 }); }
  }
  let r;
  try {
    r = await fetch(url, {
      ...opcoes,
      headers: opcoes.body ? { 'Content-Type': 'application/json', ...(opcoes.headers ?? {}) } : opcoes.headers
    });
  } catch {
    throw new Error('Sem conexão com o servidor local. Verifique se o "npm start" está rodando.');
  }
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) {
    const erro = new Error(dados.erro ?? `Erro ${r.status}.`);
    erro.codigo = r.status;
    throw erro;
  }
  return dados;
}

export const api = {
  projeto: () => chamar('/api/projeto'),
  versao: () => chamar('/api/versao'),
  historico: (id) => chamar(`/api/lacunas/${encodeURIComponent(id)}/historico`),
  salvar: (id, corpo) => chamar(`/api/lacunas/${encodeURIComponent(id)}/resposta`, { method: 'PUT', body: JSON.stringify(corpo) }),
  statusLote: (corpo) => chamar('/api/lacunas/status-lote', { method: 'POST', body: JSON.stringify(corpo) }),
  previaProcessamento: () => chamar('/api/processamento/previa'),
  projetos: () => chamar('/api/projetos'),
  definirProjeto: (id) => chamar('/api/projetos/ativo', { method: 'PUT', body: JSON.stringify({ id }) }),
  criarAmbiente: (corpo) => chamar('/api/ambientes', { method: 'POST', body: JSON.stringify(corpo) }),
  salvarAmbiente: (id, corpo) => chamar(`/api/ambientes/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(corpo) }),
  excluirAmbiente: (id, autor) => chamar(`/api/ambientes/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ autor }) }),
  criarLacuna: (corpo) => chamar('/api/lacunas', { method: 'POST', body: JSON.stringify(corpo) }),
  criarAnotacao: (corpo) => chamar('/api/anotacoes', { method: 'POST', body: JSON.stringify(corpo) }),
  excluirAnotacao: (id, autor) => chamar(`/api/anotacoes/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ autor }) }),
  async importarPdf(arquivo, { nome, revisao, obra, escala }, progresso) {
    if (local) return local.importarPdf(arquivo, { nome, revisao, escala }, progresso);
    const r = await fetch('/api/projetos', {
      method: 'POST', body: arquivo,
      headers: { 'Content-Type': 'application/pdf', 'X-Lacunas-Upload': '1', 'X-Nome-Arquivo': encodeURIComponent(arquivo.name),
        'X-Nome-Projeto': encodeURIComponent(nome), 'X-Revisao': encodeURIComponent(revisao ?? ''), 'X-Obra': encodeURIComponent(obra ?? ''), 'X-Escala': String(escala ?? '') }
    }).catch(() => { throw new Error('Sem conexão com o servidor local.'); });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(dados.erro ?? `Erro ${r.status} ao importar.`);
    return dados;
  },
  definirEscala: (corpo) => chamar('/api/escala', { method: 'PUT', body: JSON.stringify(corpo) }),
  comparar: (de, para) => chamar(`/api/comparar?de=${encodeURIComponent(de)}&para=${encodeURIComponent(para)}`),
  async enviarAnexo(arquivo) {
    if (local) return local.enviarAnexo(arquivo);
    let r;
    try {
      r = await fetch('/api/anexos', {
        method: 'POST', body: arquivo,
        headers: { 'Content-Type': 'application/octet-stream', 'X-Lacunas-Upload': '1', 'X-Nome-Arquivo': encodeURIComponent(arquivo.name) }
      });
    } catch {
      throw new Error('Sem conexão com o servidor local.');
    }
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(dados.erro ?? `Erro ${r.status} ao enviar o arquivo.`);
    return dados;
  },
  eap: (qs) => chamar(`/api/eap-hierarquica.json${qs ? `?${qs}` : ''}`)
};
