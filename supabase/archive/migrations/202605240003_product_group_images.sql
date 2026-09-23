alter table public.product_groups
  add column if not exists images text[] not null default array[]::text[];

update public.product_groups
set images = array['/rhino-logo.png']::text[]
where coalesce(array_length(images, 1), 0) = 0;

alter table public.product_groups
  drop constraint if exists product_groups_images_count;

alter table public.product_groups
  add constraint product_groups_images_count
  check (
    coalesce(array_length(images, 1), 0) between 1 and 3
  );
