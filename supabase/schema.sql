-- Lacunas.obra — banco compartilhado no Supabase (plano gratuito).
-- Como usar: Supabase › SQL Editor › New query › cole este arquivo inteiro › Run. Pode rodar mais de uma vez.
--
-- Modelo: cada projeto guarda seus "arquivos" JSON (projeto.json, lacunas.json, respostas.json, historico.json…)
-- na tabela `arquivos` — o mesmo formato da versão local. Pranchas e anexos ficam no bucket privado `lacunas`.
-- Segurança: Row Level Security em tudo. Só membros do projeto leem; dono/editor gravam; só o dono gerencia membros.

-- ───────────── Tabelas ─────────────
create table if not exists public.projetos (
  id          text primary key check (id ~ '^[a-z0-9][a-z0-9-]{2,62}$'),
  nome        text not null check (char_length(nome) between 1 and 120),
  revisao     text check (revisao is null or revisao ~ '^R[0-9]{2}$'),
  obra_id     text,
  criado_por  uuid not null default auth.uid() references auth.users(id) on delete restrict,
  criado_em   timestamptz not null default now()
);

create table if not exists public.membros (
  projeto_id     text not null references public.projetos(id) on delete cascade,
  email          text not null check (email = lower(email) and position('@' in email) > 1 and char_length(email) <= 254),
  papel          text not null check (papel in ('dono', 'editor', 'leitor')),
  adicionado_em  timestamptz not null default now(),
  primary key (projeto_id, email)
);

create table if not exists public.arquivos (
  projeto_id      text not null references public.projetos(id) on delete cascade,
  nome            text not null check (nome ~ '^[a-z0-9][a-z0-9/._-]{0,119}$'),
  dados           jsonb not null,
  versao          bigint not null default 1,
  atualizado_em   timestamptz not null default now(),
  atualizado_por  text default lower(auth.jwt() ->> 'email'),
  primary key (projeto_id, nome)
);

alter table public.projetos enable row level security;
alter table public.membros  enable row level security;
alter table public.arquivos enable row level security;

-- ───────────── Funções ─────────────
-- Papel do usuário logado no projeto (null = não é membro). SECURITY DEFINER evita recursão nas políticas de membros.
create or replace function public.meu_papel(p text) returns text
language sql stable security definer set search_path = public as $$
  select papel from public.membros
  where projeto_id = p and email = lower(coalesce(auth.jwt() ->> 'email', ''))
$$;
revoke all on function public.meu_papel(text) from public;
grant execute on function public.meu_papel(text) to authenticated;

-- Quem cria o projeto vira dono automaticamente.
create or replace function public.adicionar_dono() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.membros (projeto_id, email, papel)
  values (new.id, lower(auth.jwt() ->> 'email'), 'dono')
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists projetos_dono on public.projetos;
create trigger projetos_dono after insert on public.projetos for each row execute function public.adicionar_dono();

-- Gravação com controle de versão (compare-and-swap): se outra pessoa gravou antes, falha com 'conflito_de_versao'
-- em vez de sobrescrever. p_versao = null cria o arquivo (falha se já existir). Roda com as permissões do usuário (RLS).
create or replace function public.gravar_arquivo(p_projeto text, p_nome text, p_dados jsonb, p_versao bigint)
returns bigint language plpgsql security invoker set search_path = public as $$
declare nova bigint;
begin
  if p_versao is null then
    insert into public.arquivos (projeto_id, nome, dados) values (p_projeto, p_nome, p_dados)
    on conflict (projeto_id, nome) do nothing
    returning versao into nova;
  else
    update public.arquivos
       set dados = p_dados, versao = versao + 1, atualizado_em = now(), atualizado_por = lower(auth.jwt() ->> 'email')
     where projeto_id = p_projeto and nome = p_nome and versao = p_versao
    returning versao into nova;
  end if;
  if nova is null then
    raise exception 'conflito_de_versao' using errcode = 'P0001';
  end if;
  return nova;
end $$;
revoke all on function public.gravar_arquivo(text, text, jsonb, bigint) from public;
grant execute on function public.gravar_arquivo(text, text, jsonb, bigint) to authenticated;

-- ───────────── Políticas (RLS) ─────────────
drop policy if exists "membros veem o projeto" on public.projetos;
drop policy if exists "usuario cria projeto" on public.projetos;
drop policy if exists "dono altera projeto" on public.projetos;
drop policy if exists "dono exclui projeto" on public.projetos;
create policy "membros veem o projeto" on public.projetos for select to authenticated using (public.meu_papel(id) is not null);
create policy "usuario cria projeto" on public.projetos for insert to authenticated with check (criado_por = auth.uid());
create policy "dono altera projeto" on public.projetos for update to authenticated using (public.meu_papel(id) = 'dono') with check (public.meu_papel(id) = 'dono');
create policy "dono exclui projeto" on public.projetos for delete to authenticated using (public.meu_papel(id) = 'dono');

drop policy if exists "membros veem membros" on public.membros;
drop policy if exists "dono gerencia membros" on public.membros;
create policy "membros veem membros" on public.membros for select to authenticated using (public.meu_papel(projeto_id) is not null);
create policy "dono gerencia membros" on public.membros for all to authenticated
  using (public.meu_papel(projeto_id) = 'dono') with check (public.meu_papel(projeto_id) = 'dono');

drop policy if exists "membros leem arquivos" on public.arquivos;
drop policy if exists "editores criam arquivos" on public.arquivos;
drop policy if exists "editores alteram arquivos" on public.arquivos;
drop policy if exists "dono exclui arquivos" on public.arquivos;
create policy "membros leem arquivos" on public.arquivos for select to authenticated using (public.meu_papel(projeto_id) is not null);
create policy "editores criam arquivos" on public.arquivos for insert to authenticated with check (public.meu_papel(projeto_id) in ('dono', 'editor'));
create policy "editores alteram arquivos" on public.arquivos for update to authenticated
  using (public.meu_papel(projeto_id) in ('dono', 'editor')) with check (public.meu_papel(projeto_id) in ('dono', 'editor'));
create policy "dono exclui arquivos" on public.arquivos for delete to authenticated using (public.meu_papel(projeto_id) = 'dono');

-- ───────────── Armazenamento (pranchas e anexos) ─────────────
-- Caminhos: <projeto>/pranchas/<arquivo>.png e <projeto>/anexos/<uuid>.<tipo>. Bucket privado; acesso por URL assinada.
insert into storage.buckets (id, name, public, file_size_limit)
values ('lacunas', 'lacunas', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "lacunas: membros leem" on storage.objects;
drop policy if exists "lacunas: editores enviam" on storage.objects;
drop policy if exists "lacunas: dono remove" on storage.objects;
create policy "lacunas: membros leem" on storage.objects for select to authenticated
  using (bucket_id = 'lacunas' and public.meu_papel((storage.foldername(name))[1]) is not null);
create policy "lacunas: editores enviam" on storage.objects for insert to authenticated
  with check (bucket_id = 'lacunas' and public.meu_papel((storage.foldername(name))[1]) in ('dono', 'editor'));
create policy "lacunas: dono remove" on storage.objects for delete to authenticated
  using (bucket_id = 'lacunas' and public.meu_papel((storage.foldername(name))[1]) = 'dono');
