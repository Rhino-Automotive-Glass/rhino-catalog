grant select on public.product_groups to anon, authenticated;
grant select on public.product_group_products to anon, authenticated;

alter table public.product_groups enable row level security;
alter table public.product_group_products enable row level security;

drop policy if exists "product_groups_select_public" on public.product_groups;
drop policy if exists "product_groups_select_published" on public.product_groups;

create policy "product_groups_select_published"
on public.product_groups
for select
to anon, authenticated
using (status = 'published');

drop policy if exists "product_group_products_select_public" on public.product_group_products;
drop policy if exists "product_group_products_select_published" on public.product_group_products;

create policy "product_group_products_select_published"
on public.product_group_products
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.product_groups
    where product_groups.id = product_group_products.group_id
      and product_groups.status = 'published'
  )
);
