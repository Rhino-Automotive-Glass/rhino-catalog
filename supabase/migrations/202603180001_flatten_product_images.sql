-- Flatten product images from the legacy jsonb shape into a simple text[] (max 3).

alter table public.products
  add column if not exists images_flat text[] not null default array[]::text[];

-- Backfill from old jsonb column if it exists (best-effort).
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'images'
      and data_type = 'jsonb'
  ) then
    update public.products p
    set images_flat = coalesce((
      select array_agg(url order by url)
      from (
        select distinct url
        from (
          select p.images->'main'->>'left' as url
          union all select p.images->'main'->>'right'
          union all select p.images->'main'->>'back'
          union all select jsonb_array_elements_text(coalesce(p.images->'details'->'left', '[]'::jsonb))
          union all select jsonb_array_elements_text(coalesce(p.images->'details'->'right', '[]'::jsonb))
          union all select jsonb_array_elements_text(coalesce(p.images->'details'->'back', '[]'::jsonb))
        ) raw
        where url is not null and url <> ''
      ) dedup
      limit 3
    ), array[]::text[]);
  end if;
end;
$$;

-- Replace the old column with the flattened one (only if the old column was jsonb).
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'images'
      and data_type = 'jsonb'
  ) then
    alter table public.products drop column images;
    alter table public.products rename column images_flat to images;
  else
    -- Already migrated or images column doesn't exist; remove the temp column.
    alter table public.products drop column if exists images_flat;
  end if;
end;
$$;

alter table public.products
  drop constraint if exists products_images_max_3;

alter table public.products
  add constraint products_images_max_3
  check (coalesce(array_length(images, 1), 0) <= 3);
