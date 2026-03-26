-- Limit product image collections to a single image.

update public.products
set images = coalesce(images[1:1], array[]::text[])
where coalesce(array_length(images, 1), 0) > 1;

alter table public.products
  drop constraint if exists products_images_max_3;

alter table public.products
  drop constraint if exists products_images_max_1;

alter table public.products
  add constraint products_images_max_1
  check (coalesce(array_length(images, 1), 0) <= 1);
