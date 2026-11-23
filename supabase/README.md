# Shared database migration history

This repository shares Supabase project `uzgomevojvzdzfunjhdr` with `rhino-product-code-description`, `rhino-access`, `rhino-origin`, `rhino-stock`, and `rhino-plan`. Production schema and `supabase_migrations.schema_migrations` are the source of truth.

## Current state

As of 2026-11-23, `supabase/migrations/` mirrors the production ledger exactly: 22 versions, all matched in `supabase migration list --remote`, and `supabase db push --dry-run --remote` reports "Remote database is up to date."

- 20 files were downloaded unchanged from the production ledger with `supabase migration fetch`. They were written by several Rhino repositories (product codes, security hardening, product groups, origin) and are kept here as a record of what production ran. Do not edit them.
- 2 files are catalog-owned records: `20260923060002_record_production_catalog_security` and `20260923152957_track_products_product_code_id_unique_index`. Both were marked applied with `supabase migration repair` only after read-only queries proved production already matched their SQL. No schema or data changed during reconciliation.

The other repositories listed above still carry local SQL whose versions differ from the ledger. They must not run `supabase db push` until they are reconciled the same way.

## Why local history diverged

Feature commits added hand-named, 12-digit SQL files under `supabase/migrations/`. Production migrations use distinct, generated 14-digit versions. Supabase compares migration timestamps, not SQL bodies or names, so matching schema changes did not reconcile the ledger. `docs/product-groups-feature.md` records that group changes were applied through Supabase Management API after `supabase db push` encountered remote-only history. On 2026-09-19, `rhino-product-code-description` applied security migrations 010–017 to the shared production database. Those changes were not present in this repository's old SQL.

The 16 older files have been moved unchanged to `supabase/archive/migrations/`. They are historical reference, **not an executable pending queue**. Some contain destructive or conflicting operations: `202603170002` creates a broad authenticated `product_brands` policy, and `202603250001` truncates product images and replaces production's max-three constraint with max-one. Other old `CREATE OR REPLACE` statements omit pinned `search_path`. Never copy them back into `supabase/migrations/` or mark them applied.

## Data flow is separate from migration ownership

`rhino-product-code-description` writes `public.product_codes`. Enabled production triggers create a `public.products` row after insert and sync source-managed brand/model fields after updates. `rhino-catalog` still writes its own price, stock, status, images, and product-group data directly. Trigger-based data propagation does not make `rhino-product-code-description` ready to run `supabase db push`: its local 001–018 SQL files also use versions different from production's generated migration ledger.

## Workflow for a new catalog migration

1. Sync with the shared ledger first. Other repositories may have applied migrations since the last sync:

   ```bash
   supabase migration list --remote
   ```

   If any version appears only under `remote`, download it and keep already-tracked files byte-for-byte unchanged (fetch rewrites every file it downloads):

   ```bash
   supabase migration fetch --remote
   git restore supabase/migrations
   git status supabase/migrations   # only the new remote versions should be untracked
   ```

   Stop if a version appears only under `local` and you did not just create it.

2. Create the file with `supabase migration new <name>`; do not hand-write timestamps. Add it to the explicit allowlist in `test/migration-layout.test.mjs`.
3. Compare the proposed SQL with live definitions and show the diff for review. Test RLS under `anon`, viewer, editor, admin, and service role on rows associated with different users. Preserve `SET search_path = ''` on every future `CREATE OR REPLACE` of the five catalog functions listed in `20260923060002_record_production_catalog_security.sql`.
4. Run `supabase db push --dry-run --remote`. It must list only your new migration. After approval, run `supabase db push --remote`.
5. Run `supabase migration list --remote` again and confirm every version is matched.

If production already contains the change (for example, it was applied through the dashboard or Management API), do not re-run it. Prove equivalence with read-only queries, then record it with `supabase migration repair <version> --status applied --remote`. Never mark remote entries reverted to make `db push` pass.

## Local databases

The ledger does not create the base tables (`products`, `product_codes`, `brands`, and others predate it), so `supabase db reset` cannot bootstrap the shared schema from this directory. A future consolidated baseline should be generated from production and coordinated across all six repositories.

## Current ownership records

- [`products.product_code_id` unique index](../docs/products-product-code-id-unique-index.md): production definition, idempotent catalog migration, isolated tests, verification queries, and deployment gate.
