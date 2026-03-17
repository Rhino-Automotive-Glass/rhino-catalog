grant usage on schema public to anon, authenticated;

grant select on public.brands to anon, authenticated;
grant select on public.product_brands to anon, authenticated;
grant execute on function public.set_product_brands(uuid, uuid, uuid[]) to authenticated;

alter table public.brands enable row level security;
alter table public.product_brands enable row level security;

drop policy if exists "brands_select_public" on public.brands;
create policy "brands_select_public"
on public.brands
for select
to anon, authenticated
using (true);

drop policy if exists "product_brands_select_public" on public.product_brands;
create policy "product_brands_select_public"
on public.product_brands
for select
to anon, authenticated
using (true);

drop policy if exists "product_brands_manage_authenticated" on public.product_brands;
create policy "product_brands_manage_authenticated"
on public.product_brands
for all
to authenticated
using (true)
with check (true);
