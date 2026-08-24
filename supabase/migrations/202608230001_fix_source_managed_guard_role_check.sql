-- Fix the role detection in the source-managed field guard.
--
-- The check added in 202603170003 reads `request.jwt.claim.role`. PostgREST
-- stopped setting those per-claim GUCs in v9 -- it now exposes a single
-- `request.jwt.claims` JSON object -- so on current Supabase that expression is
-- always the empty string. The service-role bypass therefore never fired, and
-- the guard's only working escape hatch was the `app.product_codes_sync` flag
-- added in 202605140001.
--
-- The role is now read from three places, most reliable first:
--   1. current_user           PostgREST issues `set local role <role>`, so a
--                             service-role connection reports 'service_role'.
--                             This function is SECURITY INVOKER, so current_user
--                             is the caller, not the owner.
--   2. request.jwt.claims     Current PostgREST JSON claims.
--   3. request.jwt.claim.role Legacy GUC, kept so this still behaves correctly
--                             on older PostgREST versions.
--
-- BEHAVIOUR CHANGE: service_role connections regain the bypass they were always
-- intended to have (see the comment in 202603170003). Note that App B
-- (rhino-catalog) also uses the service role for its admin writes, so this
-- trigger no longer blocks App B either. App B remains constrained at the API
-- layer instead: PATCH /api/products/[id] validates against a schema that only
-- accepts price, stock, status and images, so it cannot send these columns.
--
-- `postgres` is deliberately NOT in the allow-list, so an accidental manual
-- UPDATE in the Supabase SQL editor is still caught. A migration that genuinely
-- needs to backfill these columns should opt in explicitly with:
--   set local app.product_codes_sync = 'on';
create or replace function public.prevent_source_managed_product_field_updates()
returns trigger
language plpgsql
as $$
declare
  claims_json text := nullif(current_setting('request.jwt.claims', true), '');
  jwt_role text := '';
begin
  if claims_json is not null then
    begin
      jwt_role := coalesce(claims_json::json ->> 'role', '');
    exception when others then
      -- Malformed claims must not break writes; fall through to the other checks.
      jwt_role := '';
    end;
  end if;

  if jwt_role = '' then
    jwt_role := coalesce(current_setting('request.jwt.claim.role', true), '');
  end if;

  -- Allow service-level sync paths (App A or backend jobs) to keep mirroring data.
  if current_user in ('service_role', 'supabase_admin')
     or jwt_role in ('service_role', 'supabase_admin') then
    return new;
  end if;

  -- Allow updates originating from the App A product_codes source-sync trigger.
  if coalesce(current_setting('app.product_codes_sync', true), '') = 'on' then
    return new;
  end if;

  if new.primary_brand_id is distinct from old.primary_brand_id
     or new.model is distinct from old.model
     or new."subModel" is distinct from old."subModel" then
    raise exception 'Source-managed fields (primary_brand_id, model, subModel) are read-only in Rhino Catalog';
  end if;

  return new;
end;
$$;
