create extension if not exists pgcrypto;

create or replace function public.normalize_brand_name(value text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(lower(trim(value)), '\s+', ' ', 'g'), '')
$$;

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists brands_normalized_name_idx
  on public.brands (public.normalize_brand_name(name));

alter table public.products
  add column if not exists primary_brand_id uuid;

alter table public.products
  drop constraint if exists products_primary_brand_id_fkey;

alter table public.products
  add constraint products_primary_brand_id_fkey
  foreign key (primary_brand_id)
  references public.brands(id)
  on delete restrict;

create table if not exists public.product_brands (
  product_id uuid not null references public.products(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (product_id, brand_id)
);

create index if not exists product_brands_brand_id_idx
  on public.product_brands (brand_id);

insert into public.brands (name)
select distinct raw_brand.name
from (
  select public.normalize_brand_name(products.brand) as normalized_name, trim(products.brand) as name
  from public.products
  where products.brand is not null

  union

  select public.normalize_brand_name(value) as normalized_name, trim(value) as name
  from public.products
  cross join lateral unnest(coalesce(products.brands, array[]::text[])) as values(value)
) as raw_brand
where raw_brand.normalized_name is not null
on conflict do nothing;

insert into public.product_brands (product_id, brand_id)
select distinct source.product_id, brands.id
from (
  select products.id as product_id, public.normalize_brand_name(products.brand) as normalized_name
  from public.products
  where public.normalize_brand_name(products.brand) is not null

  union

  select products.id as product_id, public.normalize_brand_name(value) as normalized_name
  from public.products
  cross join lateral unnest(coalesce(products.brands, array[]::text[])) as values(value)
  where public.normalize_brand_name(value) is not null
) as source
join public.brands
  on public.normalize_brand_name(brands.name) = source.normalized_name
on conflict do nothing;

with inferred_primary_brand as (
  select
    products.id as product_id,
    coalesce(
      public.normalize_brand_name(products.brand),
      (
        select public.normalize_brand_name(value)
        from unnest(coalesce(products.brands, array[]::text[])) with ordinality as values(value, ord)
        where public.normalize_brand_name(value) is not null
        order by ord
        limit 1
      )
    ) as normalized_name
  from public.products
)
update public.products
set primary_brand_id = brands.id
from inferred_primary_brand
join public.brands
  on public.normalize_brand_name(brands.name) = inferred_primary_brand.normalized_name
where public.products.id = inferred_primary_brand.product_id
  and inferred_primary_brand.normalized_name is not null;

insert into public.product_brands (product_id, brand_id)
select products.id, products.primary_brand_id
from public.products
where products.primary_brand_id is not null
on conflict do nothing;

alter table public.products
  drop constraint if exists products_primary_brand_membership_fkey;

alter table public.products
  add constraint products_primary_brand_membership_fkey
  foreign key (id, primary_brand_id)
  references public.product_brands(product_id, brand_id)
  deferrable initially deferred;

alter table public.products
  drop constraint if exists products_published_requires_primary_brand;

alter table public.products
  add constraint products_published_requires_primary_brand
  check (status <> 'published' or primary_brand_id is not null);

create or replace function public.set_product_brands(
  p_product_id uuid,
  p_primary_brand_id uuid,
  p_additional_brand_ids uuid[] default array[]::uuid[]
)
returns void
language plpgsql
as $$
declare
  desired_brand_ids uuid[];
begin
  desired_brand_ids := array(
    select distinct brand_id
    from unnest(
      case
        when p_primary_brand_id is null then coalesce(p_additional_brand_ids, array[]::uuid[])
        else array_append(coalesce(p_additional_brand_ids, array[]::uuid[]), p_primary_brand_id)
      end
    ) as brand_id
    where brand_id is not null
  );

  delete from public.product_brands
  where product_id = p_product_id
    and not (brand_id = any(coalesce(desired_brand_ids, array[]::uuid[])));

  insert into public.product_brands (product_id, brand_id)
  select p_product_id, brand_id
  from unnest(coalesce(desired_brand_ids, array[]::uuid[])) as brand_id
  on conflict do nothing;

  update public.products
  set primary_brand_id = p_primary_brand_id
  where id = p_product_id;
end;
$$;

alter table public.products
  drop column if exists brand;

alter table public.products
  drop column if exists brands;
