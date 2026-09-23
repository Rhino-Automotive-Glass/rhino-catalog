-- App B (rhino-catalog) must not mutate source-managed product details.
-- Keep product brand membership read-only for authenticated clients.
revoke execute on function public.set_product_brands(uuid, uuid, uuid[]) from authenticated;

drop policy if exists "product_brands_manage_authenticated" on public.product_brands;

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

  if new.primary_brand_id is distinct from old.primary_brand_id
     or new.model is distinct from old.model
     or new."subModel" is distinct from old."subModel" then
    raise exception 'Source-managed fields (primary_brand_id, model, subModel) are read-only in Rhino Catalog';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_source_managed_product_field_updates on public.products;

create trigger trg_prevent_source_managed_product_field_updates
before update of primary_brand_id, model, "subModel"
on public.products
for each row
execute function public.prevent_source_managed_product_field_updates();
