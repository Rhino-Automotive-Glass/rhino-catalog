-- Track how a product-group membership was created so the auto-link script can
-- safely prune its own stale links without touching hand-curated ones.
--   'manual' (default): added by a human in the admin UI
--   'auto'           : created by scripts/auto-link-groups.mjs
-- The --sync mode only ever deletes rows where source = 'auto'.
alter table public.product_group_products
  add column if not exists source text not null default 'manual';

-- Backfill: the bulk auto-link apply ran on 2026-06-15; earlier rows were manual.
update public.product_group_products
set source = 'auto'
where created_at >= '2026-06-15 11:00:00+00';
