-- ============================================================================
-- MarketSystem — Backups automáticos na nuvem (Supabase Storage)
-- ============================================================================
-- Execute UMA vez no Supabase SQL Editor (depois do 0001_cloud_sync.sql).
--
-- Cria um bucket PRIVADO `backups` onde cada loja grava seus backups completos
-- (JSON, opcionalmente criptografado pelo app antes do upload). As políticas
-- de RLS de Storage limitam cada usuário ao SEU prefixo:
--
--   backups/{store_id do usuário}/...
--
-- O caminho da loja é derivado de public.store_members — nunca confiado ao
-- cliente. Requer que o usuário esteja autenticado (signed-in) e seja OWNER
-- da loja, exatamente como no espelho sync_push.
-- ============================================================================

-- 1. Bucket privado (sem acesso público de leitura)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'backups',
  'backups',
  false,
  262144000, -- 250 MB — folga ampla para anos de histórico em JSON
  array['application/json', 'application/octet-stream', 'text/plain']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. Função auxiliar: lojas do usuário autenticado (dono)
create or replace function public.user_store_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select store_id from public.store_members where user_id = auth.uid();
$$;

-- 3. Políticas de Storage: cada usuário só vê/grava dentro do prefixo da própria loja
drop policy if exists "backups_select_own_store" on storage.objects;
create policy "backups_select_own_store"
on storage.objects for select to authenticated
using (
  bucket_id = 'backups'
  and (storage.foldername(name))[1] in (select public.user_store_ids()::text)
);

drop policy if exists "backups_insert_own_store" on storage.objects;
create policy "backups_insert_own_store"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'backups'
  and (storage.foldername(name))[1] in (select public.user_store_ids()::text)
);

drop policy if exists "backups_delete_own_store" on storage.objects;
create policy "backups_delete_own_store"
on storage.objects for delete to authenticated
using (
  bucket_id = 'backups'
  and (storage.foldername(name))[1] in (select public.user_store_ids()::text)
);

-- 4. (Opcional) Limitar histórico: apagar backups com mais de 60 dias.
--    Requer extensão pg_cron; se não habilitar, o app mantém os 30 mais recentes
--    por conta própria após cada upload.
-- select cron.schedule('purge-old-backups', '0 4 * * *', $$
--   delete from storage.objects
--   where bucket_id = 'backups'
--     and created_at < now() - interval '60 days';
-- $$);
