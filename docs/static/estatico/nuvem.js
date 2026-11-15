// Nuvem (Supabase) na versão publicada: conexão, login por e-mail, projetos compartilhados, membros e arquivos.
// Configuração pública em nuvem.config.json ({ "url": "...", "chaveAnon": "..." }) — a chave anon é pública por
// design; a segurança vem das políticas (RLS) do supabase/schema.sql. Sem esse arquivo, o app segue só no navegador.
import { adaptadorNuvem, BUCKET } from '../../lib/armazenamento-nuvem.js';

const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
let cliente = null;
let iniciado = null;

export function iniciarNuvem(base) {
  iniciado ??= (async () => {
    const config = await fetch(new URL('nuvem.config.json', base), { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!config?.url || !config?.chaveAnon) return null;
    const { createClient } = await import(SUPABASE_JS);
    // PKCE: o retorno do link de login vem em ?code= (não conflita com as rotas em #/…).
    cliente = createClient(config.url, config.chaveAnon, { auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true } });
    await cliente.auth.getSession(); // conclui o login se a página abriu pelo link do e-mail
    if (new URLSearchParams(location.search).has('code')) history.replaceState(null, '', location.pathname + location.hash);
    return cliente;
  })().catch(() => null);
  return iniciado;
}

export const configurada = () => Boolean(cliente);

export async function usuario() {
  if (!cliente) return null;
  const { data } = await cliente.auth.getSession();
  return data.session?.user ?? null;
}

export async function entrar(email) {
  if (!cliente) throw new Error('Banco na nuvem não configurado.');
  const e = String(email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error('Informe um e-mail válido.');
  const { error } = await cliente.auth.signInWithOtp({ email: e, options: { emailRedirectTo: location.href.split('#')[0].split('?')[0] } });
  if (error) throw new Error(/rate|limit/i.test(error.message) ? 'Muitos pedidos de link. Aguarde alguns minutos e tente de novo.' : `Não foi possível enviar o link: ${error.message}`);
}

export async function sair() { if (cliente) await cliente.auth.signOut(); }

export async function listarProjetos() {
  if (!cliente || !(await usuario())) return [];
  const { data, error } = await cliente.from('projetos').select('id, nome, revisao, obra_id').order('criado_em');
  if (error) throw new Error(`Falha ao listar projetos da nuvem: ${error.message}`);
  return (data ?? []).map((p) => ({ id: p.id, nome: p.nome, revisao: p.revisao, obraId: p.obra_id ?? p.id, etapa: p.revisao ? `Revisão ${p.revisao}` : 'Nuvem', nuvem: true }));
}

export const adaptador = (id) => adaptadorNuvem(cliente, id);

/** URLs assinadas (válidas por 12 h) para arquivos privados do projeto. */
export async function urlsAssinadas(caminhos) {
  if (!caminhos.length) return {};
  const { data, error } = await cliente.storage.from(BUCKET).createSignedUrls(caminhos, 60 * 60 * 12);
  if (error) throw new Error(`Falha ao acessar arquivos da nuvem: ${error.message}`);
  return Object.fromEntries((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
}

export async function listarAnexos(id) {
  const { data } = await cliente.storage.from(BUCKET).list(`${id}/anexos`, { limit: 1000 });
  return (data ?? []).map((o) => `${id}/anexos/${o.name}`);
}

export async function enviarArquivo(caminho, blob) {
  const { error } = await cliente.storage.from(BUCKET).upload(caminho, blob, { upsert: false, contentType: blob.type || 'application/octet-stream' });
  if (error && !/exists|Duplicate/i.test(error.message)) throw new Error(`Falha ao enviar ${caminho.split('/').pop()}: ${error.message}`);
}

/** Cria o projeto na nuvem (o criador vira dono pelo gatilho do banco). */
export async function criarProjeto({ id, nome, revisao, obraId }) {
  const u = await usuario();
  if (!u) throw new Error('Entre com seu e-mail antes de enviar para a nuvem.');
  const { error } = await cliente.from('projetos').insert({ id, nome: nome.slice(0, 120), revisao: revisao ?? null, obra_id: obraId ?? null, criado_por: u.id });
  if (error) throw new Error(/duplicate/i.test(error.message) ? 'Já existe um projeto com esse identificador na nuvem.' : `Falha ao criar o projeto na nuvem: ${error.message}`);
}

export async function membros(id) {
  const { data, error } = await cliente.from('membros').select('email, papel').eq('projeto_id', id).order('adicionado_em');
  if (error) throw new Error(`Falha ao listar membros: ${error.message}`);
  return data ?? [];
}

export async function adicionarMembro(id, email, papel) {
  const e = String(email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error('Informe um e-mail válido.');
  if (!['editor', 'leitor', 'dono'].includes(papel)) throw new Error('Papel inválido.');
  const { error } = await cliente.from('membros').upsert({ projeto_id: id, email: e, papel });
  if (error) throw new Error(/row-level|permission/i.test(error.message) ? 'Só o dono do projeto pode gerenciar membros.' : `Falha ao adicionar: ${error.message}`);
}

export async function removerMembro(id, email) {
  const lista = await membros(id);
  if (lista.filter((m) => m.papel === 'dono' && m.email !== email).length === 0 && lista.some((m) => m.email === email && m.papel === 'dono')) {
    throw new Error('O projeto precisa de pelo menos um dono.');
  }
  const { error } = await cliente.from('membros').delete().eq('projeto_id', id).eq('email', email);
  if (error) throw new Error(`Falha ao remover: ${error.message}`);
}
