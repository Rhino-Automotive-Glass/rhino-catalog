-- Add optional vehicle variant fields to product groups so groups can match
-- products on the same compatibility fields (compatibility_data.items[]):
--   sub_model -> subModelo, version -> version, additional -> additional.
-- All nullable/optional: most products have no version, and most have no
-- additional, so groups must be matchable without them.
--
-- `other` is a group-only descriptor (no product equivalent) for variants that
-- aren't yet represented in product source data (e.g. Sprinter Corta/Jumbo/
-- Larga). It is for display now; a precise version/additional mapping comes later.
alter table public.product_groups
  add column if not exists version text,
  add column if not exists additional text,
  add column if not exists other text;
