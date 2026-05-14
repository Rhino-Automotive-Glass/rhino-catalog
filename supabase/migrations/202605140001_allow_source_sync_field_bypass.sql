-- App A (rhino-product-code-description) is the source of truth for product
-- details. Its product_codes -> products sync trigger
-- (touch_catalog_on_source_change) runs as the `authenticated` role, so the
-- guard added in 202603170003 would otherwise block the very updates the source
-- app is supposed to push.
--
-- The source-sync trigger sets a transaction-local flag
-- `app.product_codes_sync = 'on'` before mutating products. This migration
-- teaches the guard to honour that flag. The catalog app itself still cannot
-- mutate source-managed fields, because it never sets the flag.
--
-- Keep this in sync with App A migration 009_sync_catalog_on_source_update.sql.
create or replace function public.prevent_source_managed_product_field_updates()
returns trigger
language plpgsql
as $$
declare
  jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
begin
  -- Allow service-level sync paths (App A or backend jobs) to keep mirroring data.
  if jwt_role in ('service_role', 'supabase_admin') then
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
