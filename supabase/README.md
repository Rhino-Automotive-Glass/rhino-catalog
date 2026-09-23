# Shared database migration history

This repository shares Supabase project `uzgomevojvzdzfunjhdr` with `rhino-product-code-description`, `rhino-access`, `rhino-origin`, `rhino-stock`, and `rhino-plan`. Production schema and `supabase_migrations.schema_migrations` are the source of truth.

## Why local history diverged

Feature commits added hand-named, 12-digit SQL files under `supabase/migrations/`. Production migrations use distinct, generated 14-digit versions. Supabase compares migration timestamps, not SQL bodies or names, so matching schema changes did not reconcile the ledger. `docs/product-groups-feature.md` records that group changes were applied through Supabase Management API after `supabase db push` encountered remote-only history. On 2026-09-19, `rhino-product-code-description` applied security migrations 010–017 to the shared production database. Those changes were not present in this repository's old SQL.

The 16 older files have been moved unchanged to `supabase/archive/migrations/`. They are historical reference, **not an executable pending queue**. Some contain destructive or conflicting operations: `202603170002` creates a broad authenticated `product_brands` policy, and `202603250001` truncates product images and replaces production's max-three constraint with max-one. Other old `CREATE OR REPLACE` statements omit pinned `search_path`.

`supabase/migrations/` now contains one CLI-generated, 14-digit, record-only migration for production's existing catalog security state. The SQL is safe to review as a record; it must not be treated as authorization to apply it to production.

## Data flow is separate from migration ownership

`rhino-product-code-description` writes `public.product_codes`. Enabled production triggers create a `public.products` row after insert and sync source-managed brand/model fields after updates. `rhino-catalog` still writes its own price, stock, status, images, and product-group data directly. Trigger-based data propagation does not make `rhino-product-code-description` ready to run `supabase db push`: its local 001–018 SQL files also use versions different from production's generated migration ledger.

## Recommended workflow

1. Pick one repository as migration owner for this shared project. `rhino-product-code-description` is a practical coordination point because it carries the 2026-09-19 security series, but that is a recommendation, not an enforced deployment rule. Keep other repositories' SQL as records or archived history.
2. Before any production migration or history repair, compare proposed SQL with live definitions and migration ledger. Show the diff for review. Do not run `supabase db push` from this repository **or** `rhino-product-code-description` while their local and remote migration versions diverge.
3. Generate new migration filenames with `supabase migration new <name>`; do not hand-write timestamps. Verify the resulting version against the shared ledger. After review, update the explicit active-file allowlist in `test/migration-layout.test.mjs`.
4. Test RLS under `anon`, viewer, editor, admin, and service role on rows associated with different users. Preserve `SET search_path = ''` on every future `CREATE OR REPLACE` of the five catalog functions listed in the record migration.
5. If ledger reconciliation is needed, prepare a separate, reviewed plan. Do not mark archived files applied or remote entries reverted merely to make `db push` pass; that would change history without proving SQL equivalence.

Archived files remain available for fresh-database reconstruction, but this repository alone cannot bootstrap the shared schema. A future consolidated baseline should be generated from production and coordinated across all six repositories.
