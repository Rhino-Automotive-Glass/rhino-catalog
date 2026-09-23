alter table public.product_groups
  add column if not exists description text;

alter table public.product_groups
  drop constraint if exists product_groups_description_not_blank;

alter table public.product_groups
  add constraint product_groups_description_not_blank
  check (
    description is null
    or length(trim(description)) > 0
  );
