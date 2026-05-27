create extension if not exists pgcrypto;

create table if not exists public.product_groups (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  brand_id uuid references public.brands(id) on delete set null,
  model text not null,
  sub_model text,
  year_start integer,
  year_end integer,
  status text not null default 'draft',
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint product_groups_slug_not_blank check (length(trim(slug)) > 0),
  constraint product_groups_name_not_blank check (length(trim(name)) > 0),
  constraint product_groups_model_not_blank check (length(trim(model)) > 0),
  constraint product_groups_status_check check (status in ('draft', 'published', 'archived')),
  constraint product_groups_year_range_check check (
    year_start is null
    or year_end is null
    or year_start <= year_end
  )
);

create unique index if not exists product_groups_slug_idx
  on public.product_groups (slug);

create index if not exists product_groups_status_sort_idx
  on public.product_groups (status, sort_order, name);

create index if not exists product_groups_brand_model_idx
  on public.product_groups (brand_id, model, sub_model);

create table if not exists public.product_group_products (
  group_id uuid not null references public.product_groups(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  sort_order integer not null default 0,
  is_featured boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (group_id, product_id)
);

create index if not exists product_group_products_product_id_idx
  on public.product_group_products (product_id);

create index if not exists product_group_products_group_sort_idx
  on public.product_group_products (group_id, sort_order, created_at);

create index if not exists product_group_products_group_featured_idx
  on public.product_group_products (group_id, is_featured, sort_order);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_product_groups_set_updated_at on public.product_groups;

create trigger trg_product_groups_set_updated_at
before update on public.product_groups
for each row
execute function public.set_updated_at();

grant select on public.product_groups to anon, authenticated;
grant select on public.product_group_products to anon, authenticated;

alter table public.product_groups enable row level security;
alter table public.product_group_products enable row level security;

drop policy if exists "product_groups_select_public" on public.product_groups;
create policy "product_groups_select_public"
on public.product_groups
for select
to anon, authenticated
using (true);

drop policy if exists "product_group_products_select_public" on public.product_group_products;
create policy "product_group_products_select_public"
on public.product_group_products
for select
to anon, authenticated
using (true);
