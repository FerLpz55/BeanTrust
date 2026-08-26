-- =============================================================================
-- BeanTrust · Migración 005 · Sincronización Supabase Auth → `usuarios`
--
-- Con `BEAN_AUTH_BACKEND=supabase` el minting de tokens lo hace Supabase Auth,
-- pero el rol de negocio se resuelve desde `usuarios` por `sub` (§10). Nada
-- poblaba esa tabla: `SupabaseUsuarioRepo` no implementa `guardar()` a propósito
-- (el alta es responsabilidad de Auth). Este trigger cierra el hueco: cada alta
-- en `auth.users` crea su fila espejo en `usuarios`.
--
-- El rol y el nombre viajan en `raw_user_meta_data` (los pone
-- `SupabaseAuthProvider.register` en el `data` del sign_up, y el alta por Admin
-- API hace lo mismo). Si faltan, se degrada a `productor` —el rol de menor
-- privilegio— en vez de fallar el alta.
-- =============================================================================

begin;

create or replace function public.bean_sync_usuario_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rol_meta text := new.raw_user_meta_data ->> 'rol';
  rol_final public.rol_usuario;
begin
  -- `admin` nunca se concede desde metadata del cliente (escalada de privilegio,
  -- OWASP A01): se asigna a mano en la BD.
  if rol_meta is null or rol_meta = 'admin' then
    rol_final := 'productor';
  else
    begin
      rol_final := rol_meta::public.rol_usuario;
    exception when invalid_text_representation then
      rol_final := 'productor';
    end;
  end if;

  insert into public.usuarios (id, email, rol, nombre)
  values (
    new.id,
    new.email,
    rol_final,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nombre'), ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- El trigger corre como owner (postgres), así que no lo frena la RLS de
-- `usuarios` (que solo tiene política de lectura).
revoke all on function public.bean_sync_usuario_auth() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.bean_sync_usuario_auth();

-- Mantener el email espejo si el usuario lo cambia desde Auth.
create or replace function public.bean_sync_email_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.usuarios set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.bean_sync_email_auth() from public, anon, authenticated;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute function public.bean_sync_email_auth();

commit;
