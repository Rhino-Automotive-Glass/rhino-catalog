alter table public.product_groups
  alter column model drop not null;

update public.product_groups
set sub_model = model
where sub_model is null
  and model is not null
  and trim(model) !~ '^(19|20)[0-9]{2}$';

update public.product_groups
set model = null;

alter table public.product_groups
  drop constraint if exists product_groups_model_not_blank;

alter table public.product_groups
  add constraint product_groups_model_not_blank
  check (
    model is null
    or length(trim(model)) > 0
  );
