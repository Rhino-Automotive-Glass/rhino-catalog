alter table public.product_groups
  drop constraint if exists product_groups_images_count;

alter table public.product_groups
  add constraint product_groups_images_count
  check (
    coalesce(array_length(images, 1), 0) <= 3
  );
